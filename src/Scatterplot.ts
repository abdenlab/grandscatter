import { rgb } from "d3-color";
import { scaleLinear } from "d3-scale";
import { schemeCategory10 } from "d3-scale-chromatic";
import { select } from "d3-selection";
import { Emitter } from "./Emitter.js";
import { Legend } from "./Legend.js";
import { columnMaxAbs, identity, neg } from "./linalg.js";
import { Overlay } from "./Overlay.js";
import { Projection } from "./Projection.js";
import type { ArrowLoadOptions, ArrowTable, Scale } from "./types.js";
import { WebGLRenderer } from "./WebGLRenderer.js";

export interface ScatterOptions {
	/** Position of axis handles in data coordinates. Default: 1 */
	axisLength?: number;
	/** Point diameter in CSS pixels. Default: 6 */
	pointSize?: number;
	/** Minimum depth scaling factor for farthest points. Default: 0.1 */
	minDepthScale?: number;
	/** Camera position along the depth axis. Points with z > cameraZ are hidden. Default: 5 */
	cameraZ?: number;
	/** Focal length controlling perspective strength. Shorter = stronger perspective. Default: 1 */
	focalLength?: number;
	/** Sort points back-to-front by depth for correct occlusion. Default: true */
	depthSort?: boolean;
	/** Show/hide axis labels on handles. Default: true */
	showAxisLabels?: boolean;
	/** Show/hide the legend. Default: true if labels are provided. */
	showLegend?: boolean;
	/** Legend width in CSS pixels. Default: 100. Ignored if showLegend is false. */
	legendWidth?: number;
	/** Canvas width in CSS pixels. Default: fills container */
	width?: number;
	/** Canvas height in CSS pixels. Default: fills container */
	height?: number;
	/** Margin in CSS pixels. */
	margin?: Partial<Margin>;
	/** Device pixel ratio override. Default: window.devicePixelRatio */
	pixelRatio?: number;
	/** Canvas background color as CSS color string. Default: "transparent" */
	background?: string;
}

export interface ScatterData {
	/** Named columns of numeric data, one per dimension/axis. */
	columns: Record<string, ArrayLike<number>>;
	/** Optional categorical labels per point (for coloring/legend). */
	labels?: ArrayLike<string | number>;
	/** Optional mapping from label values to hex color strings. */
	colors?: Record<string, string>;
}

export interface ScatterEvents {
	/** Fired after any projection matrix change (drag, setProjection, etc.) */
	projection: { matrix: number[][] };
	/** Fired when legend selection changes. */
	select: { labels: Set<string | number> };
	/** Fired on resize. */
	resize: { width: number; height: number };
}

interface InternalData {
	matrix: number[][];
	npoint: number;
	ndim: number;
	dimLabels: string[];
	labelIndices: number[];
	hexColors: string[];
	rgbTuples: [number, number, number][];
	legendEntries: [string, string][];
}

interface InternalOptions {
	pointSize: number;
	background: [number, number, number, number];
	showAxisLabels: boolean;
	axisLength: number;
	depthSort: boolean;
	legendWidth: number;
	cameraZ: number;
	focalLength: number;
	minDepthScale: number;
	margin: Margin;
	showLegend?: boolean;
	pixelRatio?: number;
	width?: number;
	height?: number;
}

interface Margin {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

const DEFAULT_MARGIN: Margin = { top: 22, right: 32, bottom: 40, left: 32 };

/** Parse a CSS color string to [r, g, b, a] with values in 0-1 range. */
function parseColor(color: string): [number, number, number, number] {
	const parsed = rgb(color);
	return [parsed.r / 255, parsed.g / 255, parsed.b / 255, parsed.opacity];
}

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
 * {@link loadData} to load data and begin rendering.
 */
export class Scatterplot {
	#opts: InternalOptions;
	#data?: InternalData;
	#projection!: Projection;

	// Container (figure canvas + legend)
	#figureWrapper: HTMLElement;
	#resizeObserver: ResizeObserver;

	// Axes overlay
	#overlay: Overlay;
	#figure: ReturnType<typeof select<HTMLElement, unknown>>;
	#sx: Scale;
	#sy: Scale;

	// Point rendering
	#webgl: WebGLRenderer;
	#canvas: HTMLCanvasElement;
	#glPositions = new Float32Array(0);
	#glColors = new Uint8Array(0);
	#glSizes = new Float32Array(0);
	#order = new Uint32Array(0);
	#visibleCategories: Set<number> | null = null;

	// Legend
	#legend?: Legend;
	#legendContainer: HTMLElement;

	// Drawing state
	#playing = false;
	#pendingFrame = 0;

	// Event emitter
	#emitter = new Emitter<ScatterEvents>();

	private constructor(container: HTMLElement, opts: ScatterOptions = {}) {
		this.#opts = {
			width: opts.width,
			height: opts.height,
			legendWidth: opts.legendWidth ?? 120,
			pointSize: opts.pointSize ?? 6,
			background: opts.background ? parseColor(opts.background) : [0, 0, 0, 0],
			margin: { ...DEFAULT_MARGIN, ...opts.margin },
			showLegend: opts.showLegend,
			showAxisLabels: opts.showAxisLabels ?? true,
			axisLength: opts.axisLength ?? 1,
			pixelRatio: opts.pixelRatio,
			depthSort: opts.depthSort ?? true,
			cameraZ: opts.cameraZ ?? 5,
			focalLength: opts.focalLength ?? 1,
			minDepthScale: opts.minDepthScale ?? 0.1,
		};

		// Create wrapper: [figure (canvas + overlay)] + [legend]
		container.style.display = "flex";
		container.style.flexDirection = "row";

		// Figure wrapper holds canvas and overlay
		this.#figureWrapper = document.createElement("div");
		this.#figureWrapper.style.position = "relative";
		if (this.#opts.width !== undefined) {
			this.#figureWrapper.style.width = `${this.#opts.width}px`;
		} else {
			this.#figureWrapper.style.flex = "1 1 auto";
			this.#figureWrapper.style.minWidth = "0";
		}
		if (this.#opts.height !== undefined) {
			this.#figureWrapper.style.height = `${this.#opts.height}px`;
		} else {
			this.#figureWrapper.style.height = "100%";
		}
		container.appendChild(this.#figureWrapper);

		// Legend container is a fixed-width sibling
		this.#legendContainer = document.createElement("div");
		this.#legendContainer.style.width = `${this.#opts.legendWidth}px`;
		this.#legendContainer.style.flexShrink = "0";
		this.#legendContainer.style.display = "none"; // shown when legend is created
		container.appendChild(this.#legendContainer);

		// Create canvas inside figure wrapper
		this.#canvas = document.createElement("canvas");
		this.#canvas.style.width = "100%";
		this.#canvas.style.height = "100%";
		this.#canvas.style.display = "block";
		this.#figureWrapper.appendChild(this.#canvas);

		this.#figure = select(this.#figureWrapper);

		// Initialize scales
		this.#sx = scaleLinear();
		this.#sy = scaleLinear();

		// Initialize WebGL
		resizeCanvas(this.#canvas, this.#opts.pixelRatio);
		this.#webgl = new WebGLRenderer(this.#canvas, this.#opts.background);

		// Initialize projection (placeholder ndim=2, will be reset on loadData)
		this.#projection = new Projection(2);

		// Initialize overlay
		this.#overlay = new Overlay(
			this.#figure,
			this.#projection,
			this.#sx,
			this.#sy,
		);

		// ResizeObserver - observe the figure wrapper for canvas sizing
		this.#resizeObserver = new ResizeObserver(() => this.resize());
		this.#resizeObserver.observe(this.#figureWrapper);
	}

	/**
	 * Create a new Scatterplot and mount it in the given container element.
	 */
	static create(container: HTMLElement, opts?: ScatterOptions): Scatterplot {
		return new Scatterplot(container, opts);
	}

	/**
	 * Load data into the scatterplot from a plain object.
	 */
	loadData(data: ScatterData): void {
		this.#data = this.#parseData(data);

		const { npoint, ndim, dimLabels, legendEntries } = this.#data;

		// Pre-allocate reusable render buffers
		const nAxisVerts = ndim * 4;
		const totalVerts = npoint + nAxisVerts;
		this.#glPositions = new Float32Array(totalVerts * 2);
		this.#glColors = new Uint8Array(totalVerts * 4);
		this.#glSizes = new Float32Array(totalVerts);
		this.#order = new Uint32Array(npoint);

		this.#projection = new Projection(ndim);
		this.#initOverlay(dimLabels);

		const showLegend = this.#opts.showLegend ?? legendEntries.length > 0;
		if (showLegend && legendEntries.length > 0) {
			this.#initLegend(legendEntries);
		} else {
			this.#legend?.destroy();
			this.#legend = undefined;
			this.#legendContainer.style.display = "none";
		}

		this.#visibleCategories = null;
		this.resize();

		if (!this.#playing) {
			this.#playing = true;
		}
		this.#markDirty();
	}

	/**
	 * Load data into the scatterplot from an Arrow table.
	 *
	 * @param table - An Arrow table (from apache-arrow or compatible library)
	 * @param options - Options specifying which columns to use
	 */
	loadArrow(table: ArrowTable, options: ArrowLoadOptions = {}): void {
		// Arrow type IDs for numeric types (Int, Float, Decimal)
		const NUMERIC_TYPE_IDS = new Set([2, 3, 7]); // Int=2, Float=3, Decimal=7

		const allFields = table.schema.fields;
		const numericFields = allFields.filter((f) =>
			NUMERIC_TYPE_IDS.has(f.type.typeId),
		);

		// Determine dimension columns
		const dimNames = options.dimensions ?? numericFields.map((f) => f.name);

		// Build columns object
		const columns: Record<string, ArrayLike<number>> = {};
		for (const name of dimNames) {
			const col = table.getChild(name);
			if (!col) {
				throw new Error(`Column "${name}" not found in Arrow table`);
			}
			columns[name] = col.toArray() as ArrayLike<number>;
		}

		// Extract labels if specified
		let labels: ArrayLike<string | number> | undefined;
		if (options.labelColumn) {
			const col = table.getChild(options.labelColumn);
			if (!col) {
				throw new Error(
					`Label column "${options.labelColumn}" not found in Arrow table`,
				);
			}
			labels = col.toArray() as ArrayLike<string | number>;
		}

		this.loadData({
			columns,
			labels,
			colors: options.colors,
		});
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
		);
		this.#overlay.init(dimLabels, {
			onProjectionChanged: () => {
				this.#emitter.emit("projection", {
					matrix: this.#projection.getMatrix(),
				});
				this.#markDirty();
			},
		});
	}

	#initLegend(entries: [string, string][]): void {
		this.#legend?.destroy();
		this.#legendContainer.style.display = "block";
		this.#legend = new Legend(entries, {
			container: this.#legendContainer,
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

	/** Schedule a single render frame if playing and none is pending. */
	#markDirty(): void {
		if (!this.#playing || this.#pendingFrame !== 0) return;
		this.#pendingFrame = requestAnimationFrame(() => {
			this.#pendingFrame = 0;
			if (this.#playing) this.#render();
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

	/** Camera position along the depth axis. Points with z > cameraZ are hidden. */
	get cameraZ(): number {
		return this.#opts.cameraZ;
	}

	set cameraZ(value: number) {
		this.#opts.cameraZ = value;
		this.#markDirty();
	}

	/** Focal length controlling perspective strength. Shorter = stronger perspective. */
	get focalLength(): number {
		return this.#opts.focalLength;
	}

	set focalLength(value: number) {
		this.#opts.focalLength = value;
		this.#markDirty();
	}

	/** Point diameter in CSS pixels. */
	get pointSize(): number {
		return this.#opts.pointSize;
	}

	set pointSize(value: number) {
		this.#opts.pointSize = value;
		this.#markDirty();
	}

	/** Minimum depth scaling factor for farthest points. */
	get minDepthScale(): number {
		return this.#opts.minDepthScale;
	}

	set minDepthScale(value: number) {
		this.#opts.minDepthScale = value;
		this.#markDirty();
	}

	/** Position of axis handles in data coordinates. */
	get axisLength(): number {
		return this.#opts.axisLength;
	}

	set axisLength(value: number) {
		this.#opts.axisLength = value;
		this.#markDirty();
	}

	/** Subscribe to events. Returns an unsubscribe function. */
	on<K extends keyof ScatterEvents & string>(
		event: K,
		fn: (data: ScatterEvents[K]) => void,
	): () => void {
		return this.#emitter.on(event, fn);
	}

	/** Clean up all resources. */
	destroy(): void {
		this.pause();
		this.#resizeObserver.disconnect();
		this.#overlay.destroy();
		this.#legend?.destroy();
		this.#webgl.destroy();
		this.#figureWrapper.remove();
		this.#legendContainer.remove();
	}

	#render(): void {
		if (!this.#data) return;

		const { matrix, npoint, ndim, labelIndices, rgbTuples } = this.#data;

		// Project the data to 2D
		const projected = this.#projection.projectXY(matrix);

		// Project the axis endpoints to 2D
		const r = this.#opts.axisLength;
		const signs = this.#projection.axisZSigns();
		const posAxisData = identity(ndim).map((row) => row.map((v) => v * r));
		const negAxisData = identity(ndim).map((row) => row.map((v) => -v * r));
		const posAxisProjected = this.#projection.projectXY(posAxisData);
		const negAxisProjected = this.#projection.projectXY(negAxisData);
		const originProjected = this.#projection.projectXY([
			new Array(ndim).fill(0),
		]);

		// Update the scales based on axis endpoints so they all fit within the
		// canvas margins, with origin in the canvas center.
		const axisEndsProjected = posAxisProjected.concat(negAxisProjected);
		updateScaleCenter(
			axisEndsProjected,
			this.#canvas,
			this.#sx,
			this.#sy,
			1.0,
			this.#opts.margin,
		);

		const sx = this.#sx;
		const sy = this.#sy;
		const pos = this.#glPositions;
		const col = this.#glColors;
		const siz = this.#glSizes;
		const vis = this.#visibleCategories;

		// Compute per-point sizes scaled by depth proximity
		const { cameraZ, focalLength, minDepthScale } = this.#opts;
		const dpr = this.#opts.pixelRatio ?? window.devicePixelRatio;
		const baseSize = this.#opts.pointSize * dpr;
		const zcoords = this.#projection.projectZ(matrix);
		const depthScale = this.#projection.depthScale(
			matrix,
			cameraZ,
			focalLength,
			minDepthScale,
		);

		// Make points behind the camera vanish
		const alphas = zcoords.map((z) => (z > cameraZ ? 0 : 255));

		// Sort points farthest to closest
		const order = this.#order;
		for (let i = 0; i < npoint; i++) order[i] = i;
		if (this.#opts.depthSort) {
			order.sort((a, b) => zcoords[a] - zcoords[b]);
		}

		// Write data points into the flat buffers (in sorted order)
		for (let si = 0; si < npoint; si++) {
			const i = order[si];

			// position
			pos[si * 2] = sx(projected[i][0]);
			pos[si * 2 + 1] = sy(projected[i][1]);

			// size
			siz[si] = baseSize * depthScale[i];

			// color
			const catIdx = labelIndices[i];
			const c4 = si * 4;
			col[c4] = rgbTuples[catIdx][0];
			col[c4 + 1] = rgbTuples[catIdx][1];
			col[c4 + 2] = rgbTuples[catIdx][2];

			// opacity
			// Use the stored alpha value if there's no visibility filter or
			// if the point is not masked under the visibility filter.
			col[c4 + 3] = vis === null || vis.has(catIdx) ? alphas[i] : 0;
		}

		// Append the vertices for the axis line segments to the flat buffers
		const nAxisVerts = ndim * 4;
		let vi = npoint;
		const ox = sx(originProjected[0][0]);
		const oy = sy(originProjected[0][1]);
		// "Towards" segments
		for (let i = 0; i < ndim; i++) {
			const toward = signs[i] >= 0 ? posAxisProjected[i] : negAxisProjected[i];
			// origin: position, color, opacity
			pos[vi * 2] = ox;
			pos[vi * 2 + 1] = oy;
			col[vi * 4] = 0;
			col[vi * 4 + 1] = 0;
			col[vi * 4 + 2] = 0;
			col[vi * 4 + 3] = 255;
			vi++;
			// endpoint: position, color, opacity
			pos[vi * 2] = sx(toward[0]);
			pos[vi * 2 + 1] = sy(toward[1]);
			col[vi * 4] = 0;
			col[vi * 4 + 1] = 0;
			col[vi * 4 + 2] = 0;
			col[vi * 4 + 3] = 255;
			vi++;
		}
		// "Away" segments
		for (let i = 0; i < ndim; i++) {
			const away = signs[i] >= 0 ? negAxisProjected[i] : posAxisProjected[i];
			// origin: position, color, opacity
			pos[vi * 2] = ox;
			pos[vi * 2 + 1] = oy;
			col[vi * 4] = 0;
			col[vi * 4 + 1] = 0;
			col[vi * 4 + 2] = 0;
			col[vi * 4 + 3] = 60;
			vi++;
			// endpoint: position, color, opacity
			pos[vi * 2] = sx(away[0]);
			pos[vi * 2 + 1] = sy(away[1]);
			col[vi * 4] = 0;
			col[vi * 4 + 1] = 0;
			col[vi * 4 + 2] = 0;
			col[vi * 4 + 3] = 60;
			vi++;
		}

		// Draw points and axis lines
		this.#webgl.render(pos, col, siz, npoint, nAxisVerts);

		// Redraw the SVG overlay
		this.#overlay.redraw(this.#opts.axisLength);
	}
}
