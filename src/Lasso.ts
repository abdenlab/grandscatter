import type { Selection } from "d3-selection";

export interface LassoCallbacks {
	onSelect: (indices: number[]) => void;
	onClear: () => void;
}

/**
 * Find original data indices of points inside a polygon using ray-casting.
 *
 * Positions are interleaved [x0,y0, x1,y1, ...] in depth-sorted order.
 * The `order` array maps sorted index → original data index.
 */
export function pointsInPolygon(
	positions: ArrayLike<number>,
	npoint: number,
	polygon: [number, number][],
	order: ArrayLike<number>,
): number[] {
	const n = polygon.length;
	if (n < 3) return [];

	// AABB of the polygon for fast rejection.
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (let k = 0; k < n; k++) {
		const px = polygon[k][0];
		const py = polygon[k][1];
		if (px < minX) minX = px;
		if (px > maxX) maxX = px;
		if (py < minY) minY = py;
		if (py > maxY) maxY = py;
	}

	const result: number[] = [];

	for (let si = 0; si < npoint; si++) {
		const x = positions[si * 2];
		const y = positions[si * 2 + 1];

		// AABB pre-filter.
		if (x < minX || x > maxX || y < minY || y > maxY) continue;

		// Ray-casting: count crossings of a horizontal ray from (x, y) → +∞.
		let inside = false;
		for (let i = 0, j = n - 1; i < n; j = i++) {
			const xi = polygon[i][0];
			const yi = polygon[i][1];
			const xj = polygon[j][0];
			const yj = polygon[j][1];
			if (
				(yi > y) !== (yj > y) &&
				x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
			) {
				inside = !inside;
			}
		}

		if (inside) {
			result.push(order[si]);
		}
	}

	return result;
}

/**
 * SVG lasso overlay with freeform polygon selection.
 *
 * Shift+drag on the figure draws a lasso polygon. On pointer up, a
 * ray-casting point-in-polygon test identifies the enclosed points and
 * fires the `onSelect` callback with their original data indices.
 *
 * Double-click or Escape clears the selection.
 */
export class Lasso {
	#svg: Selection<SVGSVGElement, unknown, null, undefined>;
	#pathElement: Selection<SVGPathElement, unknown, null, undefined>;
	#el: HTMLElement;
	#callbacks: LassoCallbacks;

	// Lasso interaction state.
	#active = false;
	#polygon: [number, number][] = [];
	#pointerId: number | null = null;

	// Snapshot of the latest render state (set by Scatterplot after each frame).
	#positions: ArrayLike<number> = new Float32Array(0);
	#npoint = 0;
	#order: ArrayLike<number> = new Uint32Array(0);

	// Bound event handlers (for add/removeEventListener).
	#boundPointerDown: (e: PointerEvent) => void;
	#boundPointerMove: (e: PointerEvent) => void;
	#boundPointerUp: (e: PointerEvent) => void;
	#boundDblClick: (e: MouseEvent) => void;
	#boundKeyDown: (e: KeyboardEvent) => void;

	constructor(
		figure: Selection<HTMLElement, unknown, null, undefined>,
		callbacks: LassoCallbacks,
	) {
		this.#callbacks = callbacks;
		this.#el = figure.node()!;

		this.#svg = figure
			.append("svg")
			.attr("class", "grandscatter-lasso")
			.style("position", "absolute")
			.style("top", "0")
			.style("left", "0")
			.style("pointer-events", "none")
			.style("overflow", "visible");

		this.#pathElement = this.#svg
			.append("path")
			.attr("fill", "rgba(100, 149, 237, 0.15)")
			.attr("stroke", "rgba(100, 149, 237, 0.8)")
			.attr("stroke-width", "1.5")
			.attr("stroke-dasharray", "4,3")
			.style("display", "none");

		this.#boundPointerDown = this.#onPointerDown.bind(this);
		this.#boundPointerMove = this.#onPointerMove.bind(this);
		this.#boundPointerUp = this.#onPointerUp.bind(this);
		this.#boundDblClick = this.#onDblClick.bind(this);
		this.#boundKeyDown = this.#onKeyDown.bind(this);

		this.#el.addEventListener("pointerdown", this.#boundPointerDown);
		this.#el.addEventListener("dblclick", this.#boundDblClick);
		document.addEventListener("keydown", this.#boundKeyDown);
	}

	/** Provide the current rendered positions so PIP can run on pointer up. */
	setRenderState(
		positions: ArrayLike<number>,
		npoint: number,
		order: ArrayLike<number>,
	): void {
		this.#positions = positions;
		this.#npoint = npoint;
		this.#order = order;
	}

	/** Programmatically clear the lasso selection and path visual. */
	clear(): void {
		this.#polygon = [];
		this.#pathElement.style("display", "none").attr("d", "");
		if (this.#active) {
			this.#cancelDrag();
		}
		this.#callbacks.onClear();
	}

	/** Resize the SVG to match the parent element. */
	resize(): void {
		const parent = this.#svg.node()?.parentElement;
		if (!parent) return;
		this.#svg
			.attr("width", parent.clientWidth)
			.attr("height", parent.clientHeight);
	}

	/** Clean up DOM elements and event listeners. */
	destroy(): void {
		this.#el.removeEventListener("pointerdown", this.#boundPointerDown);
		this.#el.removeEventListener("dblclick", this.#boundDblClick);
		document.removeEventListener("keydown", this.#boundKeyDown);
		this.#cancelDrag();
		this.#svg.remove();
	}

	// --- Private ---

	#onPointerDown(event: PointerEvent): void {
		if (!event.shiftKey) return;

		// Don't intercept clicks/drags on axis handles.
		const target = event.target as Element;
		if (
			target.closest(
				".grandscatter-anchor, .grandscatter-anchor-away",
			)
		) {
			return;
		}

		event.preventDefault();
		this.#active = true;
		this.#polygon = [];
		this.#pointerId = event.pointerId;

		const rect = this.#el.getBoundingClientRect();
		this.#polygon.push([
			event.clientX - rect.left,
			event.clientY - rect.top,
		]);

		this.#pathElement.style("display", null);
		this.#updatePath();

		this.#el.setPointerCapture(event.pointerId);
		this.#el.addEventListener("pointermove", this.#boundPointerMove);
		this.#el.addEventListener("pointerup", this.#boundPointerUp);
	}

	#onPointerMove(event: PointerEvent): void {
		if (!this.#active) return;
		const rect = this.#el.getBoundingClientRect();
		this.#polygon.push([
			event.clientX - rect.left,
			event.clientY - rect.top,
		]);
		this.#updatePath();
	}

	#onPointerUp(_event: PointerEvent): void {
		if (!this.#active) return;
		this.#active = false;
		this.#detachDragListeners();

		if (this.#polygon.length < 3) {
			this.clear();
			return;
		}

		const indices = pointsInPolygon(
			this.#positions,
			this.#npoint,
			this.#polygon,
			this.#order,
		);

		if (indices.length === 0) {
			this.clear();
		} else {
			this.#callbacks.onSelect(indices);
		}
	}

	#onDblClick(_event: MouseEvent): void {
		if (this.#polygon.length > 0) {
			this.clear();
		}
	}

	#onKeyDown(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			if (this.#active) {
				this.#active = false;
				this.#detachDragListeners();
			}
			if (this.#polygon.length > 0) {
				this.clear();
			}
		}
	}

	#updatePath(): void {
		if (this.#polygon.length === 0) return;
		let d = `M ${this.#polygon[0][0]},${this.#polygon[0][1]}`;
		for (let i = 1; i < this.#polygon.length; i++) {
			d += ` L ${this.#polygon[i][0]},${this.#polygon[i][1]}`;
		}
		d += " Z";
		this.#pathElement.attr("d", d);
	}

	#cancelDrag(): void {
		if (this.#pointerId !== null) {
			try {
				this.#el.releasePointerCapture(this.#pointerId);
			} catch {
				// Pointer may already be released.
			}
			this.#pointerId = null;
		}
		this.#active = false;
		this.#detachDragListeners();
	}

	#detachDragListeners(): void {
		this.#el.removeEventListener("pointermove", this.#boundPointerMove);
		this.#el.removeEventListener("pointerup", this.#boundPointerUp);
	}
}
