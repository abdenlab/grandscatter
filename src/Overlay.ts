import { select } from "d3-selection";
import { drag } from "d3-drag";
import { identity } from "./linalg.js";
import { data2canvas } from "./scales.js";

import type { Selection, BaseType } from "d3-selection";
import type { Scale } from "./types.js";
import type { Projection } from "./Projection.js";

export class Overlay {
	svg: Selection<SVGSVGElement, unknown, null, undefined>;
	anchors?: Selection<SVGGElement, string, SVGSVGElement, unknown>;
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
		this.anchors
			?.select("circle")
			.attr("r", this.#anchorRadius);
	}

	initAxes(
		dimLabels: string[],
		onDragStart: () => void,
		onDrag: (axisIndex: number, dx: number, dy: number) => void,
		onDragEnd: () => void,
	): void {
		this.anchors = this.svg
			.selectAll<SVGGElement, string>(".anyscatter-anchor")
			.data(dimLabels)
			.enter()
			.append("g")
			.attr("class", "anyscatter-anchor")
			.style("pointer-events", "all")
			.attr("transform", `translate(${this.#sx(0)}, ${this.#sy(0)})`);

		this.anchors
			.append("circle")
			.attr("r", this.#anchorRadius)
			.attr("opacity", 0.2)
			.attr("stroke", "white")
			.attr("fill", "steelblue")
			.style("cursor", "pointer");

		this.anchors
			.append("text")
			.attr("text-anchor", "middle")
			.attr("dy", "-0.8em")
			.attr("fill", "black")
			.style("font-size", "11px")
			.style("pointer-events", "none")
			.text((label) => label);

		const self = this;

		const d = drag<SVGGElement, string, unknown>()
			.on("start", () => {
				onDragStart();
			})
			.on("drag", function (event) {
				const nodes = self.anchors!.nodes();
				const i = nodes.indexOf(this);
				const dx = self.#sx.invert(event.dx) - self.#sx.invert(0);
				const dy = self.#sy.invert(event.dy) - self.#sy.invert(0);
				onDrag(i, dx, dy);
			})
			.on("end", () => {
				onDragEnd();
			});

		this.anchors.call(d);
	}

	redrawAxes(): void {
		if (!this.anchors) return;
		const ndim = this.#projection.ndim;

		// Project the scaled identity matrix to get axis handle positions.
		// Flip each axis by its z-sign so the anchor is always on the
		// viewer-facing side (positive z).
		const r = this.#axisLength;
		const signs = this.#projection.axisZSigns();
		const axisData = identity(ndim).map((row, i) =>
			row.map((v) => v * r * signs[i]),
		);
		const projected = this.#projection.project(axisData);
		const canvasPos = data2canvas(projected, this.#sx, this.#sy);

		this.anchors.attr(
			"transform",
			(_, i) => `translate(${canvasPos[i][0]}, ${canvasPos[i][1]})`,
		);
	}

	updateScales(sx: Scale, sy: Scale): void {
		this.#sx = sx;
		this.#sy = sy;
	}

	destroy(): void {
		this.svg.remove();
	}
}
