import type { RenderProps } from "@anywidget/types";
import { Scatterplot } from "@grandscatter/core";
import { tableFromIPC } from "apache-arrow";

import "./widget.css";

interface Model {
	data: DataView;
	axis_fields: string[];
	label_field: string;
	label_colors: Record<string, string>;
	projection: "orthographic" | "perspective";
	axis_length: number | null;
	camera_z: number | null;
	view_angle: number;
	base_point_size: number;
	selected_points: number[];
}

export default {
	render({ model, el }: RenderProps<Model>) {
		const container = document.createElement("div");
		container.classList.add("grandscatter-widget");
		el.appendChild(container);

		const table = tableFromIPC(model.get("data").buffer);
		const plot = Scatterplot.create(container, {
			projection: model.get("projection"),
			viewAngle: model.get("view_angle"),
			basePointSize: model.get("base_point_size"),
		});
		plot.loadArrow(table, {
			dimensions: model.get("axis_fields"),
			labelColumn: model.get("label_field"),
			colors: model.get("label_colors"),
		});

		model.on("change:projection", () => {
			plot.projection = model.get("projection");
		});
		model.on("change:axis_length", () => {
			const v = model.get("axis_length");
			if (v != null) plot.axisLength = v;
		});
		model.on("change:camera_z", () => {
			const v = model.get("camera_z");
			if (v != null) plot.cameraZ = v;
		});
		model.on("change:view_angle", () => {
			plot.viewAngle = model.get("view_angle");
		});
		model.on("change:base_point_size", () => {
			plot.basePointSize = model.get("base_point_size");
		});
		model.on("change:selected_points", () => {
			plot.select(model.get("selected_points"));
		});

		// Sync lasso selection from JS → Python.
		plot.on("lasso", ({ indices }) => {
			model.set("selected_points", indices);
			model.save_changes();
		});

		return () => plot.destroy();
	},
};
