import { scaleLinear } from "d3-scale";
import type { Selection } from "d3-selection";
import { Emitter } from "./Emitter.js";

interface LegendEvents {
	select: Set<number>;
	mouseout: Set<number>;
}

interface LegendOptions {
	root: Selection<SVGSVGElement, unknown, null, undefined>;
	title?: string;
	margin?: Partial<{
		top: number;
		right: number;
		bottom: number;
		left: number;
	}>;
}

/**
 * Interactive categorical legend rendered as SVG elements.
 *
 * Displays colored circles and text labels for each category. Supports
 * hover (temporarily highlights a category) and click (toggles persistent
 * selection). Emits `select` with the set of currently highlighted category
 * indices, and `mouseout` with the persistent selection when the pointer
 * leaves a label. The parent component is responsible for translating
 * these events into rendering changes (e.g. setting `#visibleCategories`).
 */
export class Legend {
	#data: [string, string][]; // [label, hexColor]
	#margin: { top: number; right: number; bottom: number; left: number };
	#emitter = new Emitter<LegendEvents>();
	#root: Selection<SVGSVGElement, unknown, null, undefined>;
	#mark: Selection<SVGCircleElement, [string, string], SVGSVGElement, unknown>;
	#box: Selection<SVGRectElement, number, SVGSVGElement, unknown>;
	#text: Selection<SVGTextElement, [string, string], SVGSVGElement, unknown>;
	#title?: Selection<SVGTextElement, string, SVGSVGElement, unknown>;
	#titleBg?: Selection<SVGRectElement, number, SVGSVGElement, unknown>;

	constructor(data: [string, string][], options: LegendOptions) {
		this.#data = data;
		this.#root = options.root;
		this.#margin = { top: 20, bottom: 0, left: 0, right: 0, ...options.margin };
		const selected = new Set<number>();

		this.#box = this.#root
			.selectAll<SVGRectElement, number>(".legendBox")
			.data([0])
			.enter()
			.append("rect")
			.attr("class", "legendBox")
			.attr("fill", "rgba(0,0,0,0)")
			.attr("stroke", "#c1c1c1")
			.attr("stroke-width", 1);

		this.#mark = this.#root
			.selectAll<SVGCircleElement, [string, string]>(".legendMark")
			.data(this.#data)
			.enter()
			.append("circle")
			.attr("class", "legendMark");

		const restoreAlpha = () => {
			this.#mark.attr("opacity", (_, i) =>
				selected.size === 0 || selected.has(i) ? 1.0 : 0.1,
			);
			this.#emitter.emit("mouseout", selected);
		};

		const makeSelect = <E extends SVGElement>(
			sel: Selection<E, [string, string], SVGSVGElement, unknown>,
		) => {
			return function (this: E) {
				const nodes = sel.nodes();
				const i = nodes.indexOf(this);
				const classes = new Set(selected);
				if (!classes.has(i)) classes.add(i);
				self.#emitter.emit("select", classes);
			};
		};

		const makeClick = <E extends SVGElement>(
			sel: Selection<E, [string, string], SVGSVGElement, unknown>,
		) => {
			return function (this: E) {
				const nodes = sel.nodes();
				const i = nodes.indexOf(this);
				if (selected.has(i)) {
					selected.delete(i);
				} else {
					selected.add(i);
				}
				self.#emitter.emit("select", selected);
				if (selected.size === data.length) {
					selected.clear();
				}
			};
		};

		const self = this;

		this.#mark
			.attr("fill", ([_, color]) => color)
			.on("mouseover", makeSelect(this.#mark))
			.on("mouseout", restoreAlpha)
			.on("click", makeClick(this.#mark));

		this.#text = this.#root
			.selectAll<SVGTextElement, [string, string]>(".legendText")
			.data(this.#data)
			.enter()
			.append("text")
			.attr("class", "legendText");

		this.#text
			.attr("text-anchor", "start")
			.attr("fill", "#333")
			.text(([label]) => label)
			.on("mouseover", makeSelect(this.#text))
			.on("mouseout", restoreAlpha)
			.on("click", makeClick(this.#text));

		if (options.title) {
			this.#titleBg = this.#root
				.selectAll<SVGRectElement, number>(".legendTitleBg")
				.data([0])
				.enter()
				.append("rect")
				.attr("class", "legendTitleBg")
				.attr("fill", "rgba(0,0,0,0)");

			this.#title = this.#root
				.selectAll<SVGTextElement, string>(".legendTitle")
				.data([options.title])
				.enter()
				.append("text")
				.attr("class", "legendTitle")
				.attr("alignment-baseline", "middle")
				.attr("text-anchor", "middle")
				.text((d) => d);
		}
	}

	on<E extends keyof LegendEvents>(
		event: E,
		callback: (data: LegendEvents[E]) => void,
	): () => void {
		return this.#emitter.on(event, callback);
	}

	resize(): void {
		const width = this.#root.node()!.clientWidth;
		const padding = 8;

		const sx = scaleLinear()
			.domain([0, 1])
			.range([width - this.#margin.left, width - this.#margin.right]);

		const sy = scaleLinear()
			.domain([-1, 0, this.#data.length, this.#data.length + 1])
			.range([
				this.#margin.top - padding,
				this.#margin.top,
				this.#margin.top + 170,
				this.#margin.top + 170 + padding,
			]);

		const r = (sy(1) - sy(0)) / 4;

		this.#mark
			.attr("cx", sx(0.001) + 2.5 * r)
			.attr("cy", (_, i) => sy(i + 0.5))
			.attr("r", r);

		this.#text
			.attr("x", sx(0.0) + 2.5 * r + 2.5 * r)
			.attr("y", (_, i) => sy(i + 0.7));

		this.#box
			.attr("x", sx.range()[0])
			.attr("y", sy(-1))
			.attr("width", sx.range()[1] - sx.range()[0])
			.attr("height", sy(this.#data.length + 1) - sy(-1))
			.attr("rx", r);

		if (this.#title && this.#titleBg) {
			this.#title.attr("x", sx(0.5)).attr("y", sy(-1));

			const bbox = this.#title.node()!.getBBox();
			const p = 2;
			this.#titleBg
				.attr("x", bbox.x - p)
				.attr("y", bbox.y - p)
				.attr("width", bbox.width + 2 * p)
				.attr("height", bbox.height + 2 * p);
		}
	}
}
