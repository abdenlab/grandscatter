export interface ScatterData {
	/** Named columns of numeric data, one per dimension/axis. */
	columns: Record<string, ArrayLike<number>>;
	/** Optional categorical labels per point (for coloring/legend). */
	labels?: ArrayLike<string | number>;
	/** Optional mapping from label values to hex color strings. */
	colors?: Record<string, string>;
	/** Optional per-point alpha (0-255). Defaults to 255. */
	alphas?: ArrayLike<number>;
}

export interface ScatterplotOptions {
	/** Point diameter in CSS pixels. Default: 6 */
	pointSize?: number;
	/** Scale mode: "center" keeps origin centered, "span" fits data range. Default: "center" */
	scaleMode?: "center" | "span";
	/** Canvas clear color as [r,g,b,a] 0-1 floats. Default: [0,0,0,0] (transparent) */
	background?: [number, number, number, number];
	/** Margin in CSS pixels. */
	margin?: Partial<Margin>;
	/** Show/hide the legend. Default: true if labels are provided. */
	showLegend?: boolean;
	/** Show/hide axis labels on handles. Default: true */
	showAxisLabels?: boolean;
	/** Position of axis handles in data coordinates. Default: 1 */
	axisLength?: number;
	/** Device pixel ratio override. Default: window.devicePixelRatio */
	pixelRatio?: number;
}

export interface ScatterplotEvents {
	/** Fired after any projection matrix change (drag, setProjection, etc.) */
	projection: { matrix: number[][] };
	/** Fired when legend selection changes. */
	select: { labels: Set<string | number> };
	/** Fired on resize. */
	resize: { width: number; height: number };
}

export interface Margin {
	top: number;
	right: number;
	bottom: number;
	left: number;
}
