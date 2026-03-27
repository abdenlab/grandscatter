/** Create an n x n identity matrix. */
export function identity(n: number): number[][] {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
	);
}

/** Create a zero vector of length n. */
export function zeros(n: number): number[] {
	return new Array(n).fill(0);
}

/** Deep-clone a 2D array. */
export function clone(m: number[][]): number[][] {
	return m.map((row) => row.slice());
}

/** Transpose an m x n matrix. */
export function transpose(m: number[][]): number[][] {
	const rows = m.length;
	const cols = m[0].length;
	const result: number[][] = Array.from(
		{ length: cols },
		() => new Array(rows),
	);
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			result[j][i] = m[i][j];
		}
	}
	return result;
}

/** Multiply two matrices (A: m x p, B: p x n) → m x n. */
export function matmul(a: number[][], b: number[][]): number[][] {
	const m = a.length;
	const p = a[0].length;
	const n = b[0].length;
	const result: number[][] = Array.from({ length: m }, () =>
		new Array(n).fill(0),
	);
	for (let i = 0; i < m; i++) {
		for (let k = 0; k < p; k++) {
			const aik = a[i][k];
			for (let j = 0; j < n; j++) {
				result[i][j] += aik * b[k][j];
			}
		}
	}
	return result;
}

/** Dot product of two vectors. */
export function dot(u: number[], v: number[]): number {
	let sum = 0;
	for (let i = 0; i < u.length; i++) sum += u[i] * v[i];
	return sum;
}

/** Euclidean norm of a vector. */
export function norm2(v: number[]): number {
	return Math.sqrt(dot(v, v));
}

/** Element-wise addition of two vectors. */
export function add(a: number[], b: number[]): number[] {
	return a.map((v, i) => v + b[i]);
}

/** Element-wise subtraction: a - b. */
export function sub(a: number[], b: number[]): number[] {
	return a.map((v, i) => v - b[i]);
}

/** Scalar multiply: s * v. */
export function scale(s: number, v: number[]): number[] {
	return v.map((x) => s * x);
}

/** Element-wise negation. */
export function neg(v: number[]): number[] {
	return v.map((x) => -x);
}

/** Column-wise min across rows of a 2D array. */
export function columnMin(m: number[][]): number[] {
	const ncols = m[0].length;
	const result = new Array(ncols).fill(Infinity);
	for (let i = 0; i < m.length; i++) {
		for (let j = 0; j < ncols; j++) {
			if (m[i][j] < result[j]) result[j] = m[i][j];
		}
	}
	return result;
}

/** Column-wise max across rows of a 2D array. */
export function columnMax(m: number[][]): number[] {
	const ncols = m[0].length;
	const result = new Array(ncols).fill(-Infinity);
	for (let i = 0; i < m.length; i++) {
		for (let j = 0; j < ncols; j++) {
			if (m[i][j] > result[j]) result[j] = m[i][j];
		}
	}
	return result;
}

/** Column-wise max of absolute values across rows of a 2D array. */
export function columnMaxAbs(m: number[][]): number[] {
	const ncols = m[0].length;
	const result = new Array(ncols).fill(0);
	for (let i = 0; i < m.length; i++) {
		for (let j = 0; j < ncols; j++) {
			const abs = Math.abs(m[i][j]);
			if (abs > result[j]) result[j] = abs;
		}
	}
	return result;
}

/**
 * Gram-Schmidt orthogonalization with priority row.
 *
 * The priority row is kept intact (only normalized), and all other rows
 * are orthogonalized against it and each other.
 */
export function orthogonalize(
	matrix: number[][],
	priorityRowIndex = 0,
): number[][] {
	const n = matrix.length;

	// Swap priority row to position 0
	[matrix[0], matrix[priorityRowIndex]] = [matrix[priorityRowIndex], matrix[0]];

	// Normalize first row
	matrix[0] = normalizeVec(matrix[0]);

	// Orthogonalize remaining rows
	for (let i = 1; i < n; i++) {
		for (let j = 0; j < i; j++) {
			// Subtract projection of matrix[i] onto matrix[j]
			const d = dot(matrix[j], matrix[i]);
			const dd = dot(matrix[j], matrix[j]);
			if (dd > 0) {
				matrix[i] = sub(matrix[i], scale(d / dd, matrix[j]));
			}
		}
		matrix[i] = normalizeVec(matrix[i]);
	}

	// Swap back
	[matrix[0], matrix[priorityRowIndex]] = [matrix[priorityRowIndex], matrix[0]];

	return matrix;
}

function normalizeVec(v: number[]): number[] {
	const n = norm2(v);
	if (n <= 0) return v;
	return v.map((x) => x / n);
}

/**
 * Build an ndim × ndim orthogonal matrix whose first 2 columns place
 * the n axes evenly over a half-circle in the 2D projection.
 *
 * Columns are cos/sin pairs at odd DFT harmonics k = 1, 3, 5, …:
 *   Column 2j   = √(2/n) · [cos(πi·k/n)]   (k = 2j+1)
 *   Column 2j+1 = √(2/n) · [sin(πi·k/n)]
 *
 * Odd harmonics with base angle π/n are mutually orthogonal, so no
 * Gram-Schmidt completion is needed.
 */
export function circularBasis(ndim: number): number[][] {
	// For n ≤ 2, circular layout is degenerate; use identity
	if (ndim <= 2) return identity(ndim);

	// Build an orthonormal basis from odd DFT harmonics k = 1, 3, 5, ...
	// Each harmonic contributes a cos/sin pair.
	const a = Math.sqrt(2 / ndim);
	const cols: number[][] = [];

	for (let k = 1; cols.length < ndim; k += 2) {
		// cos column (at k = ndim, norm is √n instead of √(n/2))
		const s = k === ndim ? 1 / Math.sqrt(ndim) : a;
		cols.push(
			Array.from(
				{ length: ndim },
				(_, i) => s * Math.cos((Math.PI * i * k) / ndim),
			),
		);
		// For odd ndim, k = ndim is the last harmonic and its sin column
		// is degenerate (sin(πi) = 0 for all i), so we stop here.
		if (cols.length >= ndim) break;

		// sin column
		cols.push(
			Array.from(
				{ length: ndim },
				(_, i) => a * Math.sin((Math.PI * i * k) / ndim),
			),
		);
	}

	// Convert column-major to row-major: matrix[i][j] = cols[j][i]
	return Array.from({ length: ndim }, (_, i) =>
		Array.from({ length: ndim }, (_, j) => cols[j][i]),
	);
}

/**
 * Determinant of a square matrix via Gaussian elimination with partial pivoting.
 * For orthogonal matrices the result is exactly ±1.
 */
export function determinant(m: number[][]): number {
	const n = m.length;
	const a = m.map((row) => row.slice());
	let sign = 1;

	for (let col = 0; col < n; col++) {
		// Partial pivot
		let maxRow = col;
		let maxVal = Math.abs(a[col][col]);
		for (let row = col + 1; row < n; row++) {
			const v = Math.abs(a[row][col]);
			if (v > maxVal) {
				maxVal = v;
				maxRow = row;
			}
		}
		if (maxRow !== col) {
			[a[col], a[maxRow]] = [a[maxRow], a[col]];
			sign *= -1;
		}
		if (Math.abs(a[col][col]) < 1e-12) return 0;

		for (let row = col + 1; row < n; row++) {
			const factor = a[row][col] / a[col][col];
			for (let j = col + 1; j < n; j++) {
				a[row][j] -= factor * a[col][j];
			}
		}
	}

	let det = sign;
	for (let i = 0; i < n; i++) det *= a[i][i];
	return det;
}

/**
 * Build a 3×3 rotation matrix from screen-space drag deltas (in radians).
 * Returns Ry · Rx where Rx rotates around the X-axis by thetaX and
 * Ry rotates around the Y-axis by thetaY.
 */
export function rotationMatrix3(thetaX: number, thetaY: number): number[][] {
	const cx = Math.cos(thetaX);
	const sx = Math.sin(thetaX);
	const cy = Math.cos(thetaY);
	const sy = Math.sin(thetaY);

	// Ry · Rx
	return [
		[cy, sy * sx, sy * cx],
		[0, cx, -sx],
		[-sy, cy * sx, cy * cx],
	];
}

/** Flatten a 2D array into a Float32Array (row-major). */
export function flatten(m: number[][]): Float32Array {
	const rows = m.length;
	const cols = m[0].length;
	const result = new Float32Array(rows * cols);
	let idx = 0;
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			result[idx++] = m[i][j];
		}
	}
	return result;
}
