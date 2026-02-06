import { describe, expect, it } from "vitest";
import { dot, identity } from "../src/linalg.js";
import { Projection } from "../src/Projection.js";

describe("Projection", () => {
	describe("projectXY", () => {
		it("projects 3D points using first 2 columns", () => {
			const p = new Projection(3, identity(3));
			// With identity matrix, column 0 = [1,0,0], column 1 = [0,1,0]
			// so project just extracts (x, y)
			const data = [
				[1, 2, 3],
				[4, 5, 6],
			];
			expect(p.projectXY(data)).toEqual([
				[1, 2],
				[4, 5],
			]);
		});
	});

	describe("projectZ", () => {
		it("returns zeros for ndim < 3", () => {
			const p = new Projection(2, identity(2));
			const data = [
				[1, 2],
				[3, 4],
			];
			expect(p.projectZ(data)).toEqual([0, 0]);
		});

		it("extracts 3rd coordinate with identity matrix (det=+1)", () => {
			const p = new Projection(3, identity(3));
			// identity: det=+1, column 2 = [0,0,1], sign=+1
			const data = [
				[1, 2, 10],
				[3, 4, -5],
				[5, 6, 0],
			];
			expect(p.projectZ(data)).toEqual([10, -5, 0]);
		});

		it("z-sort separates overlapping points correctly", () => {
			const p = new Projection(3, identity(3));
			const data = [
				[1, 1, 5], // point 0: z=5 (front)
				[1, 1, -3], // point 1: z=-3 (back)
				[1, 1, 0], // point 2: z=0 (middle)
			];

			const z = p.projectZ(data);
			const order = [0, 1, 2];
			order.sort((a, b) => z[a] - z[b]);

			// Back-to-front: point 1, then 2, then 0 on top
			expect(order).toEqual([1, 2, 0]);
		});

		it("reflected matrix: negated row flips column 2 sign", () => {
			// Negate row 2 of identity → column 2 = [0, 0, -1]
			const p = new Projection(3, [
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, -1],
			]);

			const data = [
				[0, 0, 5], // dot with col2 [0,0,-1] = -5
				[0, 0, -3], // dot with col2 [0,0,-1] = +3
			];

			const z = p.projectZ(data);
			expect(z[0]).toBeCloseTo(-5);
			expect(z[1]).toBeCloseTo(3);
		});

		it("row-swap matrix: z uses column 2", () => {
			// Swap rows 0 and 2 of identity
			// Column 2 = [1, 0, 0] (data dim 0 maps to z)
			const p = new Projection(3, [
				[0, 0, 1],
				[0, 1, 0],
				[1, 0, 0],
			]);

			const data = [
				[10, 0, 3], // dot with col2 [1,0,0] = 10
				[-5, 0, 3], // dot with col2 [1,0,0] = -5
			];

			const z = p.projectZ(data);
			expect(z[0]).toBeCloseTo(10);
			expect(z[1]).toBeCloseTo(-5);
			// A has higher z (drawn on top)
			expect(z[0]).toBeGreaterThan(z[1]);
		});
	});

	describe("setAxis", () => {
		it("prevents z-axis flip during orthogonalization", () => {
			const p = new Projection(3, identity(3));
			// Get initial column 2: [0, 0, 1]
			const getCol2 = () => p.getMatrix().map((row) => row[2]);
			const oldCol2 = getCol2();

			// Make a large perturbation to axis 0 that could flip column 2
			// by pushing it strongly into the z direction
			p.setAxis(0, [0.1, 0.1, 1]);

			const newCol2 = getCol2();

			// Column 2 should not have flipped: dot product should be positive
			const dotProduct = dot(oldCol2, newCol2);
			expect(dotProduct).toBeGreaterThan(0);
		});

		it("preserves orthonormality after preventing z-flip", () => {
			const p = new Projection(3, identity(3));

			// Make a perturbation
			p.setAxis(0, [0.1, 0.1, 1]);

			const m = p.getMatrix();

			// Check rows are unit vectors
			for (const row of m) {
				const norm = Math.sqrt(dot(row, row));
				expect(norm).toBeCloseTo(1);
			}

			// Check rows are orthogonal
			expect(dot(m[0], m[1])).toBeCloseTo(0);
			expect(dot(m[0], m[2])).toBeCloseTo(0);
			expect(dot(m[1], m[2])).toBeCloseTo(0);
		});
	});
});
