import { describe, expect, it } from "vitest";
import {
	add,
	circularBasis,
	clone,
	columnMax,
	columnMaxAbs,
	columnMin,
	determinant,
	dot,
	flatten,
	identity,
	matmul,
	neg,
	norm2,
	orthogonalize,
	scale,
	sub,
	transpose,
	zeros,
} from "../src/linalg.js";

describe("identity", () => {
	it("creates a 3x3 identity", () => {
		expect(identity(3)).toEqual([
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]);
	});

	it("creates a 1x1 identity", () => {
		expect(identity(1)).toEqual([[1]]);
	});
});

describe("zeros", () => {
	it("creates a zero vector", () => {
		expect(zeros(4)).toEqual([0, 0, 0, 0]);
	});
});

describe("clone", () => {
	it("deep copies a 2D array", () => {
		const m = [
			[1, 2],
			[3, 4],
		];
		const c = clone(m);
		expect(c).toEqual(m);
		c[0][0] = 99;
		expect(m[0][0]).toBe(1);
	});
});

describe("transpose", () => {
	it("transposes a 2x3 matrix", () => {
		expect(
			transpose([
				[1, 2, 3],
				[4, 5, 6],
			]),
		).toEqual([
			[1, 4],
			[2, 5],
			[3, 6],
		]);
	});

	it("transposes a square matrix", () => {
		expect(
			transpose([
				[1, 2],
				[3, 4],
			]),
		).toEqual([
			[1, 3],
			[2, 4],
		]);
	});
});

describe("matmul", () => {
	it("multiplies 2x2 matrices", () => {
		const a = [
			[1, 2],
			[3, 4],
		];
		const b = [
			[5, 6],
			[7, 8],
		];
		expect(matmul(a, b)).toEqual([
			[19, 22],
			[43, 50],
		]);
	});

	it("multiplies non-square matrices", () => {
		const a = [[1, 2, 3]]; // 1x3
		const b = [[4], [5], [6]]; // 3x1
		expect(matmul(a, b)).toEqual([[32]]);
	});

	it("identity * A = A", () => {
		const a = [
			[1, 2],
			[3, 4],
		];
		expect(matmul(identity(2), a)).toEqual(a);
	});
});

describe("dot", () => {
	it("computes dot product", () => {
		expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
	});

	it("dot of orthogonal vectors is 0", () => {
		expect(dot([1, 0], [0, 1])).toBe(0);
	});
});

describe("norm2", () => {
	it("computes euclidean norm", () => {
		expect(norm2([3, 4])).toBe(5);
	});

	it("unit vector has norm 1", () => {
		expect(norm2([1, 0, 0])).toBe(1);
	});
});

describe("add / sub / scale / neg", () => {
	it("add", () => {
		expect(add([1, 2], [3, 4])).toEqual([4, 6]);
	});

	it("sub", () => {
		expect(sub([5, 3], [2, 1])).toEqual([3, 2]);
	});

	it("scale", () => {
		expect(scale(2, [3, 4])).toEqual([6, 8]);
	});

	it("neg", () => {
		expect(neg([1, -2, 3])).toEqual([-1, 2, -3]);
	});
});

describe("column operations", () => {
	const m = [
		[1, -5, 3],
		[4, 2, -1],
		[-2, 7, 0],
	];

	it("columnMin", () => {
		expect(columnMin(m)).toEqual([-2, -5, -1]);
	});

	it("columnMax", () => {
		expect(columnMax(m)).toEqual([4, 7, 3]);
	});

	it("columnMaxAbs", () => {
		expect(columnMaxAbs(m)).toEqual([4, 7, 3]);
	});
});

describe("orthogonalize", () => {
	it("orthogonalizes rows of a 3x3 matrix", () => {
		const m = [
			[1, 1, 0],
			[1, 0, 0],
			[0, 1, 1],
		];
		const result = orthogonalize(m);

		// Check rows are orthogonal
		for (let i = 0; i < 3; i++) {
			for (let j = i + 1; j < 3; j++) {
				expect(Math.abs(dot(result[i], result[j]))).toBeLessThan(1e-10);
			}
		}

		// Check rows are unit length
		for (let i = 0; i < 3; i++) {
			expect(norm2(result[i])).toBeCloseTo(1, 10);
		}
	});

	it("preserves priority row direction", () => {
		const m = [
			[1, 0, 0],
			[1, 1, 0],
			[0, 0, 1],
		];
		const result = orthogonalize(m, 1);

		// Priority row (index 1) should point in original direction [1,1,0] (normalized)
		const expected = [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0];
		for (let j = 0; j < 3; j++) {
			expect(result[1][j]).toBeCloseTo(expected[j], 10);
		}
	});

	it("identity stays identity", () => {
		const result = orthogonalize(identity(3));
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				expect(result[i][j]).toBeCloseTo(i === j ? 1 : 0, 10);
			}
		}
	});
});

describe("flatten", () => {
	it("flattens a 2D array to Float32Array", () => {
		const result = flatten([
			[1, 2],
			[3, 4],
		]);
		expect(result).toBeInstanceOf(Float32Array);
		expect(Array.from(result)).toEqual([1, 2, 3, 4]);
	});
});

describe("circularBasis", () => {
	it("produces an orthogonal matrix", () => {
		const m = circularBasis(5);
		// Rows are orthonormal
		for (let i = 0; i < 5; i++) {
			expect(norm2(m[i])).toBeCloseTo(1, 10);
			for (let j = i + 1; j < 5; j++) {
				expect(Math.abs(dot(m[i], m[j]))).toBeLessThan(1e-10);
			}
		}
	});

	it("places axes evenly around a circle in the first 2 columns", () => {
		const n = 5;
		const m = circularBasis(n);
		const a = Math.sqrt(2 / n);

		for (let i = 0; i < n; i++) {
			const angle = (2 * Math.PI * i) / n;
			expect(m[i][0]).toBeCloseTo(a * Math.cos(angle), 10);
			expect(m[i][1]).toBeCloseTo(a * Math.sin(angle), 10);
		}
	});

	it("works for n=2 (degenerates to rotation)", () => {
		const m = circularBasis(2);
		expect(norm2(m[0])).toBeCloseTo(1, 10);
		expect(norm2(m[1])).toBeCloseTo(1, 10);
		expect(Math.abs(dot(m[0], m[1]))).toBeLessThan(1e-10);
	});

	it("works for large n", () => {
		const n = 20;
		const m = circularBasis(n);
		for (let i = 0; i < n; i++) {
			expect(norm2(m[i])).toBeCloseTo(1, 8);
		}
	});
});

describe("determinant", () => {
	it("identity has det = 1", () => {
		expect(determinant(identity(3))).toBeCloseTo(1);
		expect(determinant(identity(5))).toBeCloseTo(1);
	});

	it("single row swap flips sign", () => {
		// Swap rows 0 and 1 of identity → det = -1
		expect(
			determinant([
				[0, 1, 0],
				[1, 0, 0],
				[0, 0, 1],
			]),
		).toBeCloseTo(-1);
	});

	it("reflection has det = -1", () => {
		// Negate one row of identity
		expect(
			determinant([
				[-1, 0, 0],
				[0, 1, 0],
				[0, 0, 1],
			]),
		).toBeCloseTo(-1);
	});

	it("orthogonal matrices have det = ±1", () => {
		const m = circularBasis(5);
		const d = determinant(m);
		expect(Math.abs(Math.abs(d) - 1)).toBeLessThan(1e-10);
	});

	it("2x2 case", () => {
		expect(
			determinant([
				[3, 7],
				[1, -4],
			]),
		).toBeCloseTo(-19);
	});
});
