import { drag } from "d3-drag";
import type { Selection } from "d3-selection";
import { identity } from "./linalg.js";
import type { Projection } from "./Projection.js";
import type { Scale } from "./types.js";

/**
 * SVG overlay with draggable axis handles.
 *
 * Owns the drag-to-projection interaction: on drag, converts pixel deltas
 * to data-space deltas via scale inverses, updates the Projection directly
 * via {@link Projection.setAxis}, and notifies the parent via the
 * `onProjectionChanged` callback. Also positions axis labels at each handle.
 *
 * Call {@link initAxes} after construction to create the handles, and
 * {@link redrawAxes} each frame to reposition them to match the current
 * projection. The overlay SVG is absolutely positioned over the parent
 * figure element with `pointer-events: none`; only the anchor `<g>`
 * groups receive pointer events.
 */
export class Overlay {
	svg: Selection<SVGSVGElement, unknown, null, undefined>;
	anchors?: Selection<SVGGElement, string, SVGSVGElement, unknown>;
	#awayAnchors?: Selection<SVGGElement, string, SVGSVGElement, unknown>;
	#projection: Projection;
	#sx: Scale;
	#sy: Scale;
	#anchorRadius = 8;
	#axisLength: number;

	constructor(
		figure: Selection<HTMLElement, unknown, null, undefined>,
		projection: Projection,
		sx: Scale,
		sy: Scale,
		axisLength = 1,
	) {
		this.#projection = projection;
		this.#sx = sx;
		this.#sy = sy;
		this.#axisLength = axisLength;

		this.svg = figure
			.insert("svg", ":first-child")
			.attr("class", "anyscatter-overlay")
			.style("position", "absolute")
			.style("top", "0")
			.style("left", "0")
			.style("pointer-events", "none")
			.style("overflow", "visible");
	}

	get width(): number {
		return this.svg.node()?.clientWidth ?? 0;
	}

	get height(): number {
		return this.svg.node()?.clientHeight ?? 0;
	}

	resize(): void {
		const parent = this.svg.node()?.parentElement;
		if (!parent) return;
		this.svg
			.attr("width", parent.clientWidth)
			.attr("height", parent.clientHeight);

		this.#anchorRadius = Math.max(
			7,
			Math.min(10, Math.min(parent.clientWidth, parent.clientHeight) / 50),
		);
		this.anchors?.select("circle").attr("r", this.#anchorRadius);
		this.#awayAnchors?.select("circle").attr("r", this.#anchorRadius / 2);
	}

	initAxes(
		dimLabels: string[],
		callbacks: {
			onDragStart?: () => void;
			onDragEnd?: () => void;
			onProjectionChanged: () => void;
		},
	): void {
		const origin = `translate(${this.#sx(0)}, ${this.#sy(0)})`;

		// Toward-facing anchors (with labels)
		this.anchors = this.svg
			.selectAll<SVGGElement, string>(".anyscatter-anchor")
			.data(dimLabels)
			.enter()
			.append("g")
			.attr("class", "anyscatter-anchor")
			.style("pointer-events", "all")
			.attr("transform", origin);

		this.anchors
			.append("circle")
			.attr("r", this.#anchorRadius)
			.attr("opacity", 0.8)
			.attr("stroke", "white")
			.attr("fill", "gray")
			.style("cursor", "pointer");

		this.anchors
			.append("text")
			.attr("text-anchor", "middle")
			.attr("dy", "-0.8em")
			.attr("fill", "black")
			.style("font-size", "11px")
			.style("pointer-events", "none")
			.text((label) => label);

		// Away-facing anchors (no labels)
		this.#awayAnchors = this.svg
			.selectAll<SVGGElement, string>(".anyscatter-anchor-away")
			.data(dimLabels)
			.enter()
			.append("g")
			.attr("class", "anyscatter-anchor-away")
			.style("pointer-events", "all")
			.attr("transform", origin);

		this.#awayAnchors
			.append("circle")
			.attr("r", this.#anchorRadius / 2)
			.attr("opacity", 0.8)
			.attr("stroke", "white")
			.attr("fill", "darkgray")
			.style("cursor", "pointer");

		// Shared drag behavior factory
		const self = this;
		const makeDrag = (nodes: SVGGElement[]) =>
			drag<SVGGElement, string, unknown>()
				.on("start", () => {
					callbacks.onDragStart?.();
				})
				.on("drag", function (event) {
					const i = nodes.indexOf(this);
					const dx = self.#sx.invert(event.dx) - self.#sx.invert(0);
					const dy = self.#sy.invert(event.dy) - self.#sy.invert(0);
					const axis = self.#projection.getAxis(i);
					axis[0] += dx;
					axis[1] += dy;
					self.#projection.setAxis(i, axis);
					callbacks.onProjectionChanged();
				})
				.on("end", () => {
					callbacks.onDragEnd?.();
				});

		this.anchors.call(makeDrag(this.anchors.nodes()));
		this.#awayAnchors.call(makeDrag(this.#awayAnchors.nodes()));
	}

	redrawAxes(): void {
		if (!this.anchors) return;
		const ndim = this.#projection.ndim;

		const r = this.#axisLength;
		const signs = this.#projection.axisZSigns();

		// Toward-facing endpoints (flipped by z-sign)
		const towardData = identity(ndim).map((row, i) =>
			row.map((v) => v * r * signs[i]),
		);
		const towardProjected = this.#projection.project(towardData);
		const towardPos = towardProjected.map((row) => [
			this.#sx(row[0]),
			this.#sy(row[1]),
		]);

		this.anchors.attr(
			"transform",
			(_, i) => `translate(${towardPos[i][0]}, ${towardPos[i][1]})`,
		);

		// Away-facing endpoints (opposite sign)
		if (this.#awayAnchors) {
			const awayData = identity(ndim).map((row, i) =>
				row.map((v) => v * r * -signs[i]),
			);
			const awayProjected = this.#projection.project(awayData);
			const awayPos = awayProjected.map((row) => [
				this.#sx(row[0]),
				this.#sy(row[1]),
			]);

			this.#awayAnchors.attr(
				"transform",
				(_, i) => `translate(${awayPos[i][0]}, ${awayPos[i][1]})`,
			);
		}
	}

	destroy(): void {
		this.svg.remove();
	}
}
