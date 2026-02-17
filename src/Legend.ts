import { select } from "d3-selection";
import { Emitter } from "./Emitter.js";

interface LegendEvents {
	select: Set<number>;
	mouseout: Set<number>;
}

interface LegendOptions {
	container: HTMLElement;
	title?: string;
}

/**
 * Interactive categorical legend rendered as HTML elements.
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
	#emitter = new Emitter<LegendEvents>();
	#container: HTMLElement;
	#wrapper: HTMLElement;

	constructor(data: [string, string][], options: LegendOptions) {
		this.#data = data;
		this.#container = options.container;
		const selected = new Set<number>();

		// Create wrapper div
		this.#wrapper = document.createElement("div");
		this.#wrapper.className = "grandscatter-legend";
		this.#wrapper.style.cssText = `
			padding: 8px 12px;
			border: 1px solid #c1c1c1;
			border-radius: 6px;
			margin: 8px;
			font-family: system-ui, sans-serif;
			font-size: 12px;
		`;
		this.#container.appendChild(this.#wrapper);

		// Optional title
		if (options.title) {
			const titleEl = document.createElement("div");
			titleEl.className = "grandscatter-legend-title";
			titleEl.textContent = options.title;
			titleEl.style.cssText = `
				font-weight: 600;
				margin-bottom: 6px;
				text-align: center;
			`;
			this.#wrapper.appendChild(titleEl);
		}

		// Create items
		const items = select(this.#wrapper)
			.selectAll<HTMLDivElement, [string, string]>(".grandscatter-legend-item")
			.data(this.#data)
			.enter()
			.append("div")
			.attr("class", "grandscatter-legend-item")
			.style("display", "flex")
			.style("align-items", "center")
			.style("gap", "6px")
			.style("padding", "3px 0")
			.style("cursor", "pointer")
			.style("user-select", "none");

		// Color circle
		items
			.append("span")
			.attr("class", "grandscatter-legend-mark")
			.style("width", "10px")
			.style("height", "10px")
			.style("border-radius", "50%")
			.style("flex-shrink", "0")
			.style("background-color", ([_, color]) => color);

		// Label text
		items
			.append("span")
			.attr("class", "grandscatter-legend-label")
			.style("color", "#333")
			.text(([label]) => label);

		const self = this;

		const restoreAlpha = () => {
			items.style("opacity", (_, i) =>
				selected.size === 0 || selected.has(i) ? "1" : "0.3",
			);
			self.#emitter.emit("mouseout", selected);
		};

		items
			.on("mouseover", function () {
				const nodes = items.nodes();
				const i = nodes.indexOf(this);
				const classes = new Set(selected);
				if (!classes.has(i)) classes.add(i);
				self.#emitter.emit("select", classes);
			})
			.on("mouseout", restoreAlpha)
			.on("click", function () {
				const nodes = items.nodes();
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
			});
	}

	on<E extends keyof LegendEvents>(
		event: E,
		callback: (data: LegendEvents[E]) => void,
	): () => void {
		return this.#emitter.on(event, callback);
	}

	resize(): void {
		// No-op: HTML elements handle their own sizing
	}

	destroy(): void {
		this.#wrapper.remove();
	}
}
