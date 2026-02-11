import type { ScaleLinear } from "d3-scale";

/**
 * Options for loading Arrow tables.
 */
export interface ArrowLoadOptions {
	/** Column names to use as numeric dimensions. If omitted, uses all numeric columns. */
	dimensions?: string[];
	/** Column name containing categorical labels for coloring/legend. */
	labelColumn?: string;
	/** Optional mapping from label values to hex color strings. */
	colors?: Record<string, string>;
}

/**
 * Minimal interface for Arrow-like tables (duck-typed to work with apache-arrow).
 */
export interface ArrowTable {
	readonly numRows: number;
	readonly schema: {
		fields: Array<{ name: string; type: { typeId: number } }>;
	};
	getChild(name: string): ArrowVector | null;
}

/**
 * Minimal interface for Arrow-like vectors.
 */
export interface ArrowVector {
	readonly length: number;
	get(index: number): unknown;
	toArray(): ArrayLike<unknown>;
}

export interface Margin {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export type Scale = ScaleLinear<number, number, never>;
