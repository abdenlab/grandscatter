import { describe, expect, it } from "vitest";
import { pointsInPolygon } from "../src/Lasso.js";

describe("pointsInPolygon", () => {
	// Square polygon from (10,10) to (100,100).
	const square: [number, number][] = [
		[10, 10],
		[100, 10],
		[100, 100],
		[10, 100],
	];

	it("finds points inside a square polygon", () => {
		// Point 0: (50,50) inside, Point 1: (150,150) outside, Point 2: (80,80) inside
		const positions = new Float32Array([50, 50, 150, 150, 80, 80]);
		const order = new Uint32Array([0, 1, 2]);
		const result = pointsInPolygon(positions, 3, square, order);
		expect(result.sort()).toEqual([0, 2]);
	});

	it("returns empty array for fewer than 3 polygon vertices", () => {
		const positions = new Float32Array([50, 50]);
		const order = new Uint32Array([0]);
		expect(pointsInPolygon(positions, 1, [], order)).toEqual([]);
		expect(
			pointsInPolygon(
				positions,
				1,
				[
					[0, 0],
					[100, 100],
				],
				order,
			),
		).toEqual([]);
	});

	it("rejects points outside the AABB", () => {
		// All points far outside the square's bounding box.
		const positions = new Float32Array([200, 200, -50, -50, 300, 0]);
		const order = new Uint32Array([0, 1, 2]);
		expect(pointsInPolygon(positions, 3, square, order)).toEqual([]);
	});

	it("maps sorted indices back to original data indices via order", () => {
		// Positions are in sorted order [sortIdx 0 → orig 5, sortIdx 1 → orig 3]
		// Point at sortIdx 0 is (50,50) → inside the square, original index 5.
		// Point at sortIdx 1 is (150,150) → outside, original index 3.
		const positions = new Float32Array([50, 50, 150, 150]);
		const order = new Uint32Array([5, 3]);
		const result = pointsInPolygon(positions, 2, square, order);
		expect(result).toEqual([5]);
	});

	it("returns empty when no points are inside", () => {
		const positions = new Float32Array([0, 0, 200, 200, 5, 5]);
		const order = new Uint32Array([0, 1, 2]);
		expect(pointsInPolygon(positions, 3, square, order)).toEqual([]);
	});

	it("handles a concave polygon", () => {
		// L-shaped polygon (concave).
		const lShape: [number, number][] = [
			[0, 0],
			[100, 0],
			[100, 50],
			[50, 50],
			[50, 100],
			[0, 100],
		];
		// (25, 25) inside the L, (75, 75) outside (in the concave notch)
		const positions = new Float32Array([25, 25, 75, 75]);
		const order = new Uint32Array([0, 1]);
		const result = pointsInPolygon(positions, 2, lShape, order);
		expect(result).toEqual([0]);
	});

	it("handles a triangle", () => {
		const triangle: [number, number][] = [
			[0, 0],
			[100, 0],
			[50, 100],
		];
		// (50, 30) inside, (90, 90) outside
		const positions = new Float32Array([50, 30, 90, 90]);
		const order = new Uint32Array([0, 1]);
		const result = pointsInPolygon(positions, 2, triangle, order);
		expect(result).toEqual([0]);
	});

	it("only tests up to npoint, ignoring trailing buffer data", () => {
		// Buffer has 3 points worth of data, but npoint=2.
		// Point at sortIdx 2 is inside but should be ignored.
		const positions = new Float32Array([50, 50, 150, 150, 80, 80]);
		const order = new Uint32Array([0, 1, 2]);
		const result = pointsInPolygon(positions, 2, square, order);
		expect(result).toEqual([0]);
	});
});
