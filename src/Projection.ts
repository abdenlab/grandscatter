import { circularBasis, clone, dot, matmul, orthogonalize } from "./linalg.js";

/**
 * Manages an ndim x ndim orthogonal projection matrix and projects
 * high-dimensional data down to 2D.
 *
 * ## Rows represent the data axes (features/dimensions)
 * Each row i represents how the i-th axis in data space contributes to the
 * projection axes. When you drag an axis handle, you are modifying the
 * corresponding row of the projection matrix. The rows are kept orthogonal via
 * Gram-Schmidt, so dragging one axis will affect the others to maintain a
 * valid projection.
 *
 * ## Columns represent the projection axes in the canvas (X, Y, Z, +)
 * Each column j represents the contribution of the j-th data dimension to the
 * canvas projection axes. Column 0 is the x-axis contribution, column
 * 1 is the y-axis contribution, and column 2 (if ndim >= 3) is the depth
 * contribution. Columns 3+ are additional orthogonal directions that are not
 * displayed.
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
	 * Flips the i-th axis by negating its row in the projection matrix.
	 * This reverses which end of the axis faces toward vs away from the viewer.
	 */
	flipAxis(i: number): void {
		for (let j = 0; j < this.#ndim; j++) {
			this.#matrix[i][j] *= -1;
		}
	}

	/**
	 * Sets the i-th axis vector and re-orthogonalizes the matrix,
	 * keeping the i-th row as the priority (unchanged after normalization).
	 *
	 * If the orthogonalization would flip the z-axis (column 2), we negate
	 * column 2 to preserve depth ordering stability.
	 */
	setAxis(i: number, vec: number[]): void {
		// Save old column 2 before orthogonalization (if it exists)
		const oldCol2 = this.#ndim >= 3 ? this.#matrix.map((row) => row[2]) : null;

		this.#matrix[i] = vec.slice();
		this.#matrix = orthogonalize(this.#matrix, i);

		// Prevent z-axis flip: if column 2 reversed direction, negate it
		if (oldCol2) {
			let dotProduct = 0;
			for (let j = 0; j < this.#ndim; j++) {
				dotProduct += oldCol2[j] * this.#matrix[j][2];
			}
			if (dotProduct < 0) {
				for (let j = 0; j < this.#ndim; j++) {
					this.#matrix[j][2] *= -1;
				}
			}
		}
	}

	/**
	 * Project data points to 2D.
	 *
	 * @param data - npoint x ndim matrix (each row is a data point)
	 * @returns npoint x 2 matrix (each row is [x, y])
	 */
	projectXY(data: number[][]): number[][] {
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
	 * Returns the sign of column 2 for each axis: +1 if the axis
	 * points toward the viewer, -1 if away. For ndim < 3, returns all +1.
	 */
	axisZSigns(): number[] {
		if (this.#ndim < 3) return new Array(this.#ndim).fill(1);
		return this.#matrix.map((row) => (row[2] >= 0 ? 1 : -1));
	}

	/**
	 * Compute per-point perspective scaling factors based on depth, where
	 * closer points are scaled up and farther points are scaled down.
	 *
	 * The camera is placed at position `cameraZ` looking towards the negative
	 * z direction. It has a focal length that determines how strongly distance
	 * affects scaling. A shorter focal length means a "zoom-in" effect with
	 * stronger perspective scaling, while a longer focal length means a
	 * "zoom-out" effect with weaker perspective scaling.
	 *
	 * Depth factors are clamped to a minimum value `min` to prevent far away
	 * points from disappearing. Points "behind" the camera (z > cameraZ) are
	 * scaled as if they were at the camera position (depth factor = 1).
	 *
	 * For ndim < 3 (no depth axis), returns all 1s.
	 *
	 * @param data - npoint x ndim matrix
	 * @param cameraZ - position of the camera along the depth axis
	 * @param focalLength - controls perspective strength
	 * @param min - minimum scaling factor for farthest points
	 * @returns Float64Array of length npoint, values in [min, 1]
	 */
	depthScale(
		data: number[][],
		cameraZ = 0.5,
		focalLength = 1,
		min = 0.1,
	): Float64Array {
		const n = data.length;
		const out = new Float64Array(n);
		if (this.#ndim < 3) {
			out.fill(1);
			return out;
		}

		// Project the data onto the z-axis (column 2) and get depth values
		// relative to the camera. Then apply perspective scaling formula.
		const col2 = this.#matrix.map((row) => row[2]);
		for (let i = 0; i < n; i++) {
			const z = dot(data[i], col2);
			out[i] = focalLength / (focalLength + (cameraZ - z));
			if (out[i] < min) out[i] = min;
			if (out[i] > 1) out[i] = 1;
		}
		return out;
	}
}
