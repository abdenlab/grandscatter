import { circularBasis, clone, dot, matmul, orthogonalize } from "./linalg.js";

/**
 * Perspective camera that transforms 3D projected coordinates to 2D canvas
 * coordinates with perspective foreshortening.
 *
 * The camera is positioned at `cameraZ` along the depth axis, looking toward
 * negative z. Points closer to the camera appear larger; points farther away
 * appear smaller. The `focalLength` controls how strongly depth affects the
 * projection—shorter focal lengths create stronger perspective distortion.
 */
export class PerspectiveCamera {
	cameraZ: number;
	focalLength: number;
	minDepthScale: number;

	constructor(cameraZ = 5, focalLength = 1, minDepthScale = 0.1) {
		this.cameraZ = cameraZ;
		this.focalLength = focalLength;
		this.minDepthScale = minDepthScale;
	}

	/**
	 * Convert a view angle (field of view) in degrees to focal length.
	 * As FOV → 0°, focal length → ∞ (approaches orthographic).
	 * A 90° FOV gives focal length = 1.
	 */
	static fovToFocalLength(viewAngle: number): number {
		return 1 / Math.tan((viewAngle * Math.PI) / 360);
	}

	/**
	 * Convert focal length to view angle (field of view) in degrees.
	 */
	static focalLengthToFov(focalLength: number): number {
		return (Math.atan(1 / focalLength) * 360) / Math.PI;
	}

	/**
	 * Project a 3D point to 2D canvas coordinates with perspective.
	 *
	 * @param x - x coordinate in projected 3D space
	 * @param y - y coordinate in projected 3D space
	 * @param z - z coordinate (depth) in projected 3D space
	 * @returns [canvasX, canvasY] with perspective applied
	 */
	project(x: number, y: number, z: number): [number, number] {
		const scale = this.focalLength / (this.cameraZ - z);
		return [x * scale, y * scale];
	}

	/**
	 * Compute the depth-based scaling factor for a point at depth z.
	 * Used to scale point sizes based on distance from camera.
	 *
	 * @param z - depth coordinate in projected 3D space
	 * @returns scaling factor in [minDepthScale, 1]
	 */
	depthScale(z: number): number {
		const scale = this.focalLength / (this.focalLength + (this.cameraZ - z));
		if (scale < this.minDepthScale) return this.minDepthScale;
		if (scale > 1) return 1;
		return scale;
	}

	/**
	 * Reference scale at z=0, used to compensate axis length so that
	 * axes at z=0 have consistent visual length regardless of camera settings.
	 */
	get referenceScale(): number {
		return this.focalLength / this.cameraZ;
	}

	/**
	 * Get/set view angle (field of view) in degrees.
	 * This is an alternative interface to focalLength.
	 */
	get viewAngle(): number {
		return PerspectiveCamera.focalLengthToFov(this.focalLength);
	}

	set viewAngle(degrees: number) {
		this.focalLength = PerspectiveCamera.fovToFocalLength(degrees);
	}
}

/**
 * Manages an ndim x ndim orthogonal projection matrix to project
 * high-dimensional data down to 2D or 3D.
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
	 * Project data points to 3D.
	 *
	 * @param data - npoint x ndim matrix (each row is a data point)
	 * @returns npoint x 3 matrix (each row is [x, y, z])
	 */
	projectXYZ(data: number[][]): number[][] {
		if (this.#ndim < 3) {
			// For 2D data, z is always 0
			const proj = this.#matrix.map((row) => [row[0], row[1]]);
			return matmul(data, proj).map((row) => [row[0], row[1], 0]);
		}
		const proj = this.#matrix.map((row) => [row[0], row[1], row[2]]);
		return matmul(data, proj);
	}
}
