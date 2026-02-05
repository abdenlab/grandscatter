import { rgb } from "d3-color";
import { scaleLinear } from "d3-scale";
import { schemeCategory10 } from "d3-scale-chromatic";
import { select } from "d3-selection";
import { Emitter } from "./Emitter.js";
import { Legend } from "./Legend.js";
import { columnMax, columnMaxAbs, columnMin, identity, neg } from "./linalg.js";
import { Overlay } from "./Overlay.js";
import { Projection } from "./Projection.js";
import type {
	Margin,
	Scale,
	ScatterData,
	ScatterplotEvents,
	ScatterplotOptions,
} from "./types.js";
import { WebGLRenderer } from "./WebGLRenderer.js";

interface InternalData {
	matrix: number[][];
	npoint: number;
	ndim: number;
	dimLabels: string[];
	labelIndices: number[];
	alphas: number[];
	hexColors: string[];
	rgbTuples: [number, number, number][];
	legendEntries: [string, string][];
}

const DEFAULT_MARGIN: Margin = { top: 22, right: 85, bottom: 40, left: 32 };

/** Resize the canvas drawing buffer to match physical display pixels. */
function resizeCanvas(canvas: HTMLCanvasElement, pixelRatio?: number): void {
	const dpr = pixelRatio ?? window.devicePixelRatio;
	const displayWidth = Math.round(dpr * canvas.clientWidth);
	const displayHeight = Math.round(dpr * canvas.clientHeight);
	if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
		canvas.width = displayWidth;
		canvas.height = displayHeight;
	}
}

/**
 * Update scales so that the origin is at the center of the canvas
 * (symmetric domains).
 */
export function updateScaleCenter(
	points: number[][],
	canvas: HTMLCanvasElement,
	sx: Scale,
	sy: Scale,
	scaleFactor = 1.0,
	margin: Margin = DEFAULT_MARGIN,
): void {
	const vmax = columnMaxAbs(points);
	const vmin = neg(vmax);

	const xDataRange = 2 * vmax[0];
	const yDataRange = 2 * vmax[1];

	const yMiddle = (canvas.clientHeight - margin.bottom + margin.top) / 2;
	const yRadius0 = (canvas.clientHeight - margin.bottom - margin.top) / 2;
	const xMiddle = (canvas.clientWidth - margin.right + margin.left) / 2;
	const xRadius0 = (canvas.clientWidth - margin.right - margin.left) / 2;

	const xRadius =
		Math.min(xRadius0, (yRadius0 / yDataRange) * xDataRange) * scaleFactor;
	const yRadius =
		Math.min(yRadius0, (xRadius0 / xDataRange) * yDataRange) * scaleFactor;

	sx.domain([vmin[0], vmax[0]]).range([xMiddle - xRadius, xMiddle + xRadius]);
	sy.domain([vmin[1], vmax[1]]).range([yMiddle + yRadius, yMiddle - yRadius]);
}

/**
 * Update scales to fit the data range (non-symmetric domains).
 */
export function updateScaleSpan(
	points: number[][],
	canvas: HTMLCanvasElement,
	sx: Scale,
	sy: Scale,
	scaleFactor = 1.0,
	margin: Margin = DEFAULT_MARGIN,
): void {
	const vmin = columnMin(points);
	const vmax = columnMax(points);

	const xDataRange = vmax[0] - vmin[0];
	const yDataRange = vmax[1] - vmin[1];

	const yMiddle = (canvas.clientHeight - margin.bottom + margin.top) / 2;
	const yRadius0 = (canvas.clientHeight - margin.bottom - margin.top) / 2;
	const xMiddle = (canvas.clientWidth - margin.right + margin.left) / 2;
	const xRadius0 = (canvas.clientWidth - margin.right - margin.left) / 2;

	const xRadius =
		Math.min(xRadius0, (yRadius0 / yDataRange) * xDataRange) * scaleFactor;
	const yRadius =
		Math.min(yRadius0, (xRadius0 / xDataRange) * yDataRange) * scaleFactor;

	sx.domain([vmin[0], vmax[0]]).range([xMiddle - xRadius, xMiddle + xRadius]);
	sy.domain([vmin[1], vmax[1]]).range([yMiddle + yRadius, yMiddle - yRadius]);
}

/**
 * Interactive multidimensional scatterplot.
 *
 * Orchestrates a {@link Projection}, {@link WebGLRenderer}, {@link Overlay},
 * and {@link Legend}. Uses demand-driven rendering: state mutations
 * (drag, resize, `setProjection`, `setAxis`, legend selection) call
 * `#markDirty()`, which schedules a single `requestAnimationFrame`.
 *
 * Each render frame: projects data to 2D, computes scales, writes positions
 * and colors into pre-allocated flat typed arrays, issues one WebGL draw call,
 * and repositions the SVG axis handles.
 *
 * Create via the static factory {@link Scatterplot.create}, then call
 * {@link setData} to load data and begin rendering.
 */
export class Scatterplot {
	#canvas: HTMLCanvasElement;
	#figure: ReturnType<typeof select<HTMLElement, unknown>>;
	#webgl: WebGLRenderer;
	#overlay: Overlay;
	#projection!: Projection;
	#legend?: Legend;
	#data?: InternalData;
	#emitter = new Emitter<ScatterplotEvents>();

	#resizeObserver: ResizeObserver;
	#visibleCategories: Set<number> | null = null;
	#glPositions = new Float32Array(0);
	#glColors = new Uint8Array(0);
	#glSizes = new Float32Array(0);

	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: reserved for grand tour
	#container: HTMLElement;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: reserved for grand tour
	#isDragging = false;
	#playing = false;
	#pendingFrame = 0;

	#sx: Scale;
	#sy: Scale;

	#opts: Required<
		Pick<
			ScatterplotOptions,
			"pointSize" | "scaleMode" | "background" | "showAxisLabels" | "axisLength"
		>
	> & { margin: Margin; showLegend?: boolean; pixelRatio?: number };

	private constructor(container: HTMLElement, opts: ScatterplotOptions = {}) {
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
		this.#overlay = new Overlay(
			this.#figure,
			this.#projection,
			this.#sx,
			this.#sy,
			this.#opts.axisLength,
		);

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
		this.#data = this.#parseData(data);

		const { npoint, ndim, dimLabels, legendEntries } = this.#data;

		// Pre-allocate reusable render buffers
		const nAxisVerts = ndim * 4;
		const totalVerts = npoint + nAxisVerts;
		this.#glPositions = new Float32Array(totalVerts * 2);
		this.#glColors = new Uint8Array(totalVerts * 4);
		this.#glSizes = new Float32Array(totalVerts);

		this.#projection = new Projection(ndim);
		this.#initOverlay(dimLabels);

		const showLegend = this.#opts.showLegend ?? legendEntries.length > 0;
		if (showLegend && legendEntries.length > 0) {
			this.#initLegend(legendEntries);
		}

		this.#visibleCategories = null;
		this.resize();

		if (!this.#playing) {
			this.#playing = true;
		}
		this.#markDirty();
	}

	#parseData(data: ScatterData): InternalData {
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
			hexColors = [schemeCategory10[0]];
			labelIndices = new Array(npoint).fill(0);
		}

		const alphas = new Array(npoint).fill(255);
		if (data.alphas) {
			for (let i = 0; i < npoint; i++) alphas[i] = data.alphas[i];
		}

		const rgbTuples: [number, number, number][] = hexColors.map((c) => {
			const parsed = rgb(c)!;
			return [parsed.r, parsed.g, parsed.b];
		});

		return {
			matrix,
			npoint,
			ndim,
			dimLabels,
			labelIndices,
			alphas,
			hexColors,
			rgbTuples,
			legendEntries,
		};
	}

	#initOverlay(dimLabels: string[]): void {
		this.#overlay.destroy();
		this.#overlay = new Overlay(
			this.#figure,
			this.#projection,
			this.#sx,
			this.#sy,
			this.#opts.axisLength,
		);
		this.#overlay.initAxes(dimLabels, {
			onDragStart: () => {
				this.#isDragging = true;
			},
			onDragEnd: () => {
				this.#isDragging = false;
			},
			onProjectionChanged: () => {
				this.#emitter.emit("projection", {
					matrix: this.#projection.getMatrix(),
				});
				this.#markDirty();
			},
		});
	}

	#initLegend(entries: [string, string][]): void {
		this.#legend = new Legend(entries, {
			root: this.#overlay.svg,
			margin: {
				left: this.#opts.margin.right - 15,
				right: 2,
			},
		});
		this.#legend.on("select", (classes) => {
			if (!this.#data) return;
			this.#visibleCategories =
				classes.size === this.#data.legendEntries.length
					? null
					: new Set(classes);
			const selectedLabels = new Set<string | number>();
			for (const idx of classes) {
				selectedLabels.add(this.#data.legendEntries[idx][0]);
			}
			this.#emitter.emit("select", { labels: selectedLabels });
			this.#markDirty();
		});
		this.#legend.on("mouseout", (classes) => {
			this.#visibleCategories = classes.size === 0 ? null : new Set(classes);
			this.#markDirty();
		});
	}

	/** Enable rendering. Flushes any pending state changes. */
	play(): void {
		if (this.#playing) return;
		this.#playing = true;
		this.#markDirty();
	}

	/** Suppress rendering. No frames are drawn until play() is called. */
	pause(): void {
		this.#playing = false;
		if (this.#pendingFrame !== 0) {
			cancelAnimationFrame(this.#pendingFrame);
			this.#pendingFrame = 0;
		}
	}

	/** Schedule a single render frame if playing and none is pending. */
	#markDirty(): void {
		if (!this.#playing || this.#pendingFrame !== 0) return;
		this.#pendingFrame = requestAnimationFrame(() => {
			this.#pendingFrame = 0;
			if (this.#playing) this.#render();
		});
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
		this.#markDirty();
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
		this.#markDirty();
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
		this.#markDirty();
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

		const { matrix, npoint, ndim, labelIndices, alphas, rgbTuples } =
			this.#data;

		// Project data to 2D
		const projected = this.#projection.project(matrix);

		// Project axis endpoints
		const r = this.#opts.axisLength;
		const signs = this.#projection.axisZSigns();
		const posAxisData = identity(ndim).map((row) => row.map((v) => v * r));
		const negAxisData = identity(ndim).map((row) => row.map((v) => -v * r));
		const posAxisProjected = this.#projection.project(posAxisData);
		const negAxisProjected = this.#projection.project(negAxisData);
		const originProjected = this.#projection.project([new Array(ndim).fill(0)]);

		// Update scales (include data + axis endpoints)
		const allPoints = projected.concat(posAxisProjected, negAxisProjected);
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
			updateScaleSpan(allPoints, this.#canvas, this.#sx, this.#sy, 1.0, margin);
		}

		const sx = this.#sx;
		const sy = this.#sy;
		const pos = this.#glPositions;
		const col = this.#glColors;
		const siz = this.#glSizes;
		const vis = this.#visibleCategories;

		// Compute per-point sizes scaled by depth proximity
		const dpr = this.#opts.pixelRatio ?? window.devicePixelRatio;
		const baseSize = this.#opts.pointSize * dpr;
		const prox = this.#projection.proximity(matrix);

		// Write data points into flat buffers
		for (let i = 0; i < npoint; i++) {
			pos[i * 2] = sx(projected[i][0]);
			pos[i * 2 + 1] = sy(projected[i][1]);
			siz[i] = baseSize * prox[i];
			const catIdx = labelIndices[i];
			const c4 = i * 4;
			col[c4] = rgbTuples[catIdx][0];
			col[c4 + 1] = rgbTuples[catIdx][1];
			col[c4 + 2] = rgbTuples[catIdx][2];
			col[c4 + 3] = vis === null || vis.has(catIdx) ? alphas[i] : 0;
		}

		// Write axis line vertices: forward (solid) then backward (faint)
		const nAxisVerts = ndim * 4;
		let vi = npoint;
		const ox = sx(originProjected[0][0]);
		const oy = sy(originProjected[0][1]);

		for (let i = 0; i < ndim; i++) {
			const toward = signs[i] >= 0 ? posAxisProjected[i] : negAxisProjected[i];
			pos[vi * 2] = ox;
			pos[vi * 2 + 1] = oy;
			col[vi * 4] = 150;
			col[vi * 4 + 1] = 150;
			col[vi * 4 + 2] = 150;
			col[vi * 4 + 3] = 255;
			vi++;
			pos[vi * 2] = sx(toward[0]);
			pos[vi * 2 + 1] = sy(toward[1]);
			col[vi * 4] = 150;
			col[vi * 4 + 1] = 150;
			col[vi * 4 + 2] = 150;
			col[vi * 4 + 3] = 255;
			vi++;
		}
		for (let i = 0; i < ndim; i++) {
			const away = signs[i] >= 0 ? negAxisProjected[i] : posAxisProjected[i];
			pos[vi * 2] = ox;
			pos[vi * 2 + 1] = oy;
			col[vi * 4] = 180;
			col[vi * 4 + 1] = 180;
			col[vi * 4 + 2] = 180;
			col[vi * 4 + 3] = 60;
			vi++;
			pos[vi * 2] = sx(away[0]);
			pos[vi * 2 + 1] = sy(away[1]);
			col[vi * 4] = 180;
			col[vi * 4 + 1] = 180;
			col[vi * 4 + 2] = 180;
			col[vi * 4 + 3] = 60;
			vi++;
		}

		this.#webgl.render(pos, col, siz, npoint, nAxisVerts);
		this.#overlay.redrawAxes();
	}
}
