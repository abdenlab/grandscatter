import { circularBasis, clone, dot, matmul, orthogonalize } from "./linalg.js";

/**
 * Manages an ndim x ndim orthogonal projection matrix and projects
 * high-dimensional data down to 2D.
 */
export class Projection {
	#matrix: number[][];
	#ndim: number;

	constructor(ndim: number, init?: number[][]) {
		this.#ndim = ndim;
		this.#matrix = circularBasis(ndim);
		if (init) {
			this.setMatrix(init);
		}
	}

	get ndim(): number {
		return this.#ndim;
	}

	/** Returns a copy of the current ndim x ndim projection matrix. */
	getMatrix(): number[][] {
		return clone(this.#matrix);
	}

	/** Sets the projection matrix. Input is cloned and orthogonalized. */
	setMatrix(m: number[][]): void {
		this.#matrix = orthogonalize(clone(m));
	}

	/** Returns a copy of the i-th axis vector (row of the matrix). */
	getAxis(i: number): number[] {
		return this.#matrix[i].slice();
	}

	/**
	 * Sets the i-th axis vector and re-orthogonalizes the matrix,
	 * keeping the i-th row as the priority (unchanged after normalization).
	 */
	setAxis(i: number, vec: number[]): void {
		this.#matrix[i] = vec.slice();
		this.#matrix = orthogonalize(this.#matrix, i);
	}

	/**
	 * Returns the sign of column 2 for each axis: +1 if the axis
	 * points toward the viewer, -1 if away. For ndim < 3, returns all +1.
	 */
	axisZSigns(): number[] {
		if (this.#ndim < 3) return new Array(this.#ndim).fill(1);
		return this.#matrix.map((row) => (row[2] >= 0 ? 1 : -1));
	}

	/**
	 * Project data points to 2D.
	 *
	 * @param data - npoint x ndim matrix (each row is a data point)
	 * @returns npoint x 2 matrix (each row is [x, y])
	 */
	project(data: number[][]): number[][] {
		// Extract the first 2 columns of the projection matrix (ndim x 2).
		const proj = this.#matrix.map((row) => [row[0], row[1]]);
		// data (npoint x ndim) @ proj (ndim x 2) → npoint x 2
		return matmul(data, proj);
	}

	/**
	 * Compute depth (z) coordinates for each data point using the 3rd
	 * column of the projection matrix. Returns all zeros if ndim < 3.
	 */
	projectZ(data: number[][]): number[] {
		if (this.#ndim < 3) return new Array(data.length).fill(0);
		const col2 = this.#matrix.map((row) => row[2]);
		return data.map((row) => dot(row, col2));
	}

	/**
	 * Compute per-point proximity from the viewer, normalized so the
	 * closest point is 1 and the farthest is `min`. For ndim < 3 (no
	 * depth axis), returns all 1s.
	 *
	 * @param data - npoint x ndim matrix
	 * @param min  - proximity value for the farthest point (default 0.1)
	 * @returns Float64Array of length npoint, values in [min, 1]
	 */
	proximity(data: number[][], min = 0.5): Float64Array {
		const n = data.length;
		const out = new Float64Array(n);
		if (this.#ndim < 3) {
			out.fill(1);
			return out;
		}
		const col2 = this.#matrix.map((row) => row[2]);
		let zMin = Infinity;
		let zMax = -Infinity;
		for (let i = 0; i < n; i++) {
			const z = dot(data[i], col2);
			out[i] = z;
			if (z < zMin) zMin = z;
			if (z > zMax) zMax = z;
		}
		const range = zMax - zMin;
		if (range === 0) {
			out.fill(1);
		} else {
			for (let i = 0; i < n; i++) {
				out[i] = min + ((out[i] - zMin) / range) * (1 - min);
			}
		}
		return out;
	}
}
