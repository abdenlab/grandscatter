import { select } from "d3-selection";
import { scaleLinear } from "d3-scale";
import { rgb } from "d3-color";
import { schemeCategory10 } from "d3-scale-chromatic";

import { Emitter } from "./Emitter.js";
import { Projection } from "./Projection.js";
import { WebGLRenderer } from "./WebGLRenderer.js";
import { Overlay } from "./Overlay.js";
import { Legend } from "./Legend.js";
import { identity, clone } from "./linalg.js";
import {
	updateScaleCenter,
	updateScaleSpan,
	data2canvas,
	resizeCanvas,
} from "./scales.js";

import type {
	ScatterData,
	ScatterplotOptions,
	ScatterplotEvents,
	InternalData,
	Scale,
	Margin,
} from "./types.js";

const DEFAULT_MARGIN: Margin = { top: 22, right: 85, bottom: 40, left: 32 };

export class Scatterplot {
	#container: HTMLElement;
	#canvas: HTMLCanvasElement;
	#figure: ReturnType<typeof select<HTMLElement, unknown>>;
	#webgl: WebGLRenderer;
	#overlay: Overlay;
	#projection!: Projection;
	#legend?: Legend;
	#emitter = new Emitter<ScatterplotEvents>();
	#data?: InternalData;
	#animId: number | null = null;
	#resizeObserver: ResizeObserver;
	#isDragging = false;

	#sx: Scale;
	#sy: Scale;

	#opts: Required<
		Pick<ScatterplotOptions, "pointSize" | "scaleMode" | "background" | "showAxisLabels" | "axisLength">
	> & { margin: Margin; showLegend?: boolean; pixelRatio?: number };

	private constructor(
		container: HTMLElement,
		opts: ScatterplotOptions = {},
	) {
		this.#container = container;
		this.#opts = {
			pointSize: opts.pointSize ?? 6,
			scaleMode: opts.scaleMode ?? "center",
			background: opts.background ?? [0, 0, 0, 0],
			margin: { ...DEFAULT_MARGIN, ...opts.margin },
			showLegend: opts.showLegend,
			showAxisLabels: opts.showAxisLabels ?? true,
			axisLength: opts.axisLength ?? 1,
			pixelRatio: opts.pixelRatio,
		};

		// Ensure the container is positioned for overlay alignment
		const pos = getComputedStyle(container).position;
		if (pos === "static") {
			container.style.position = "relative";
		}

		// Create canvas
		this.#canvas = document.createElement("canvas");
		this.#canvas.style.width = "100%";
		this.#canvas.style.height = "100%";
		this.#canvas.style.display = "block";
		container.appendChild(this.#canvas);

		this.#figure = select(container);

		// Initialize scales
		this.#sx = scaleLinear();
		this.#sy = scaleLinear();

		// Initialize WebGL
		resizeCanvas(this.#canvas, this.#opts.pixelRatio);
		this.#webgl = new WebGLRenderer(this.#canvas, this.#opts.background);

		// Initialize projection (placeholder ndim=2, will be reset on setData)
		this.#projection = new Projection(2);

		// Initialize overlay
		this.#overlay = new Overlay(this.#figure, this.#projection, this.#sx, this.#sy, this.#opts.axisLength);

		// ResizeObserver
		this.#resizeObserver = new ResizeObserver(() => this.resize());
		this.#resizeObserver.observe(container);
	}

	/**
	 * Create a new Scatterplot and mount it in the given container element.
	 */
	static create(
		container: HTMLElement,
		opts?: ScatterplotOptions,
	): Scatterplot {
		return new Scatterplot(container, opts);
	}

	/**
	 * Load data into the scatterplot.
	 */
	setData(data: ScatterData): void {
		const dimLabels = Object.keys(data.columns);
		const ndim = dimLabels.length;
		const npoint = data.columns[dimLabels[0]].length;

		// Build row-major matrix: npoint x ndim
		const matrix: number[][] = [];
		for (let i = 0; i < npoint; i++) {
			const row: number[] = [];
			for (const key of dimLabels) {
				row.push(data.columns[key][i]);
			}
			matrix.push(row);
		}

		// Build category info
		let categories: string[] = [];
		let labelIndices: number[] = [];
		let hexColors: string[] = [];
		let legendEntries: [string, string][] = [];

		if (data.labels) {
			// Determine categories from colors keys or unique labels
			if (data.colors) {
				categories = Object.keys(data.colors);
				hexColors = Object.values(data.colors);
			} else {
				const unique = new Set<string>();
				for (let i = 0; i < npoint; i++) {
					unique.add(String(data.labels[i]));
				}
				categories = Array.from(unique).sort();
				hexColors = categories.map(
					(_, i) => schemeCategory10[i % schemeCategory10.length],
				);
			}

			const catToIdx = new Map(categories.map((c, i) => [c, i]));
			for (let i = 0; i < npoint; i++) {
				labelIndices.push(catToIdx.get(String(data.labels[i])) ?? 0);
			}
			legendEntries = categories.map((c, i) => [c, hexColors[i]]);
		} else {
			// No labels: single category
			hexColors = [schemeCategory10[0]];
			labelIndices = new Array(npoint).fill(0);
		}

		// Build alphas
		const alphas = new Array(npoint).fill(255);
		if (data.alphas) {
			for (let i = 0; i < npoint; i++) alphas[i] = data.alphas[i];
		}

		this.#data = {
			matrix,
			npoint,
			ndim,
			dimLabels,
			labelIndices,
			alphas,
			hexColors,
			legendEntries,
		};

		// Reset projection to match new dimensionality
		this.#projection = new Projection(ndim);

		// Re-initialize overlay
		this.#overlay.destroy();
		this.#overlay = new Overlay(
			this.#figure,
			this.#projection,
			this.#sx,
			this.#sy,
			this.#opts.axisLength,
		);

		this.#overlay.initAxes(
			dimLabels,
			() => {
				this.#isDragging = true;
			},
			(axisIndex, dx, dy) => {
				const matrix = this.#projection.getMatrix();
				matrix[axisIndex][0] += dx;
				matrix[axisIndex][1] += dy;
				this.#projection.setMatrix(
					(() => {
						// Use setAxis to orthogonalize with priority on the dragged axis
						this.#projection.setAxis(axisIndex, matrix[axisIndex]);
						return this.#projection.getMatrix();
					})(),
				);
				this.#emitter.emit("projection", {
					matrix: this.#projection.getMatrix(),
				});
			},
			() => {
				this.#isDragging = false;
			},
		);

		// Initialize legend if labels exist and showLegend is not false
		const showLegend = this.#opts.showLegend ?? legendEntries.length > 0;
		if (showLegend && legendEntries.length > 0) {
			this.#legend = new Legend(legendEntries, {
				root: this.#overlay.svg,
				margin: {
					left: this.#opts.margin.right - 15,
					right: 2,
				},
			});
			this.#legend.on("select", (classes) => {
				if (!this.#data) return;
				for (let i = 0; i < this.#data.npoint; i++) {
					this.#data.alphas[i] = classes.has(this.#data.labelIndices[i])
						? 255
						: 0;
				}
				const selectedLabels = new Set<string | number>();
				for (const idx of classes) {
					selectedLabels.add(this.#data.legendEntries[idx][0]);
				}
				this.#emitter.emit("select", { labels: selectedLabels });
			});
			this.#legend.on("mouseout", (classes) => {
				if (!this.#data) return;
				if (classes.size === 0) {
					for (let i = 0; i < this.#data.npoint; i++) {
						this.#data.alphas[i] = 255;
					}
					return;
				}
				for (let i = 0; i < this.#data.npoint; i++) {
					this.#data.alphas[i] = classes.has(this.#data.labelIndices[i])
						? 255
						: 0;
				}
			});
		}

		this.resize();

		// Start rendering if not already
		if (this.#animId === null) {
			this.play();
		}
	}

	/** Start the render loop. */
	play(): void {
		if (this.#animId !== null) return;
		const loop = () => {
			this.#render();
			this.#animId = requestAnimationFrame(loop);
		};
		this.#animId = requestAnimationFrame(loop);
	}

	/** Pause the render loop. */
	pause(): void {
		if (this.#animId !== null) {
			cancelAnimationFrame(this.#animId);
			this.#animId = null;
		}
	}

	/** Force a resize recalculation. */
	resize(): void {
		resizeCanvas(this.#canvas, this.#opts.pixelRatio);
		this.#webgl.resize();
		this.#overlay.resize();
		this.#legend?.resize();
		this.#emitter.emit("resize", {
			width: this.#canvas.clientWidth,
			height: this.#canvas.clientHeight,
		});
	}

	/** Get a copy of the current projection matrix. */
	getProjection(): number[][] {
		return this.#projection.getMatrix();
	}

	/** Set the projection matrix. */
	setProjection(matrix: number[][]): void {
		this.#projection.setMatrix(matrix);
		this.#emitter.emit("projection", {
			matrix: this.#projection.getMatrix(),
		});
	}

	/** Get a single axis vector. */
	getAxis(index: number): number[] {
		return this.#projection.getAxis(index);
	}

	/** Set a single axis vector and re-orthogonalize. */
	setAxis(index: number, vector: number[]): void {
		this.#projection.setAxis(index, vector);
		this.#emitter.emit("projection", {
			matrix: this.#projection.getMatrix(),
		});
	}

	/** Number of data dimensions. */
	get ndim(): number {
		return this.#projection.ndim;
	}

	/** Dimension/column names. */
	get dimLabels(): readonly string[] {
		return this.#data?.dimLabels ?? [];
	}

	/** Subscribe to events. Returns an unsubscribe function. */
	on<K extends keyof ScatterplotEvents & string>(
		event: K,
		fn: (data: ScatterplotEvents[K]) => void,
	): () => void {
		return this.#emitter.on(event, fn);
	}

	/** Clean up all resources. */
	destroy(): void {
		this.pause();
		this.#resizeObserver.disconnect();
		this.#overlay.destroy();
		this.#webgl.destroy();
		this.#canvas.remove();
	}

	#render(): void {
		if (!this.#data) return;

		const { matrix, npoint, ndim, labelIndices, alphas, hexColors } =
			this.#data;

		// Project data
		const projected = this.#projection.project(matrix);

		// Sort points back-to-front by z-depth (painter's algorithm)
		const zValues = this.#projection.projectZ(matrix);
		const order = Array.from({ length: npoint }, (_, i) => i);
		order.sort((a, b) => zValues[a] - zValues[b]);

		const sortedProjected = order.map((i) => projected[i]);
		const sortedLabelIndices = order.map((i) => labelIndices[i]);
		const sortedAlphas = order.map((i) => alphas[i]);

		// Project both ends of each axis line
		const r = this.#opts.axisLength;
		const signs = this.#projection.axisZSigns();
		const posAxisData = identity(ndim).map((row) => row.map((v) => v * r));
		const negAxisData = identity(ndim).map((row) => row.map((v) => -v * r));
		const posAxisProjected = this.#projection.project(posAxisData);
		const negAxisProjected = this.#projection.project(negAxisData);

		// Also project the origin for axis lines
		const zeros = [new Array(ndim).fill(0)];
		const originProjected = this.#projection.project(zeros);

		// For each axis, the "toward viewer" end (sign=+1 → pos, sign=-1 → neg)
		// gets the solid line, the opposite end gets the faint line.
		const axisLinePoints: number[][] = [];
		for (let i = 0; i < ndim; i++) {
			const toward = signs[i] >= 0 ? posAxisProjected[i] : negAxisProjected[i];
			axisLinePoints.push(originProjected[0]);
			axisLinePoints.push(toward);
		}
		for (let i = 0; i < ndim; i++) {
			const away = signs[i] >= 0 ? negAxisProjected[i] : posAxisProjected[i];
			axisLinePoints.push(originProjected[0]);
			axisLinePoints.push(away);
		}

		// Update scales (include both forward and backward axis endpoints)
		const allPoints = sortedProjected.concat(posAxisProjected, negAxisProjected);
		const margin = this.#opts.margin;

		if (this.#opts.scaleMode === "center") {
			updateScaleCenter(
				allPoints,
				this.#canvas,
				this.#sx,
				this.#sy,
				1.0,
				margin,
			);
		} else {
			updateScaleSpan(
				allPoints,
				this.#canvas,
				this.#sx,
				this.#sy,
				1.0,
				margin,
			);
		}

		// Update overlay scales
		this.#overlay.updateScales(this.#sx, this.#sy);

		// Transform to canvas space
		const canvasPoints = data2canvas(sortedProjected, this.#sx, this.#sy);
		const canvasAxisLines = data2canvas(axisLinePoints, this.#sx, this.#sy);

		// Build colors (using sorted order)
		const rgbColors = hexColors.map((c) => rgb(c)!);
		const colors: [number, number, number, number][] = sortedLabelIndices.map(
			(idx, i) => [
				rgbColors[idx].r,
				rgbColors[idx].g,
				rgbColors[idx].b,
				sortedAlphas[i],
			],
		);

		// Axis colors: forward lines solid gray, backward lines faint
		const axisColors: [number, number, number, number][] = [];
		for (let i = 0; i < ndim * 2; i++) {
			axisColors.push([150, 150, 150, 255]);
		}
		for (let i = 0; i < ndim * 2; i++) {
			axisColors.push([180, 180, 180, 60]);
		}

		// Render
		this.#webgl.render(
			canvasPoints,
			colors,
			canvasAxisLines,
			axisColors,
			this.#opts.pointSize,
		);

		// Redraw axis handles
		this.#overlay.redrawAxes();
	}
}
