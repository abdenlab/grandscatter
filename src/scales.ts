import { scaleLinear } from "d3-scale";
import { columnMin, columnMax, columnMaxAbs, neg } from "./linalg.js";

import type { Scale, Margin } from "./types.js";

const DEFAULT_MARGIN: Margin = { top: 22, right: 85, bottom: 40, left: 32 };

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
 * Transform projected points from data space to canvas space.
 */
export function data2canvas(
	points: number[][],
	sx: Scale,
	sy: Scale,
): number[][] {
	return points.map((row) => [sx(row[0]), sy(row[1])]);
}

/**
 * Interpolate between two scales by progress (0-1).
 */
export function mixScale(
	s0: Scale,
	s1: Scale,
	progress: number,
): Scale {
	progress = Math.max(0, Math.min(1, progress));

	const range0 = s0.range();
	const range1 = s1.range();
	const domain0 = s0.domain();
	const domain1 = s1.domain();

	return scaleLinear()
		.domain([
			domain0[0] * (1 - progress) + domain1[0] * progress,
			domain0[1] * (1 - progress) + domain1[1] * progress,
		])
		.range([
			range0[0] * (1 - progress) + range1[0] * progress,
			range0[1] * (1 - progress) + range1[1] * progress,
		]);
}

/** Resize the canvas drawing buffer to match physical display pixels. */
export function resizeCanvas(
	canvas: HTMLCanvasElement,
	pixelRatio?: number,
): void {
	const dpr = pixelRatio ?? window.devicePixelRatio;
	const displayWidth = Math.round(dpr * canvas.clientWidth);
	const displayHeight = Math.round(dpr * canvas.clientHeight);

	if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
		canvas.width = displayWidth;
		canvas.height = displayHeight;
	}
}
