import vertexSource from "./shaders/vertex.glsl.js";
import fragmentSource from "./shaders/fragment.glsl.js";
import { flatten } from "./linalg.js";

function compileShader(
	gl: WebGLRenderingContext,
	source: string,
	type: number,
): WebGLShader {
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`Shader compilation failed: ${info}`);
	}
	return shader;
}

function createProgram(
	gl: WebGLRenderingContext,
	vs: string,
	fs: string,
): WebGLProgram {
	const vertexShader = compileShader(gl, vs, gl.VERTEX_SHADER);
	const fragmentShader = compileShader(gl, fs, gl.FRAGMENT_SHADER);
	const program = gl.createProgram()!;
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const info = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error(`Program linking failed: ${info}`);
	}
	return program;
}

export class WebGLRenderer {
	gl: WebGLRenderingContext;
	#program: WebGLProgram;

	#positionBuffer: WebGLBuffer;
	#colorBuffer: WebGLBuffer;
	#positionLoc: number;
	#colorLoc: number;
	#pointSizeLoc: WebGLUniformLocation;
	#isDrawingAxisLoc: WebGLUniformLocation;
	#canvasWidthLoc: WebGLUniformLocation;
	#canvasHeightLoc: WebGLUniformLocation;

	#clearColor: [number, number, number, number] = [0, 0, 0, 0];

	constructor(canvas: HTMLCanvasElement, clearColor?: [number, number, number, number]) {
		const gl = canvas.getContext("webgl", { premultipliedAlpha: false });
		if (!gl) throw new Error("WebGL not supported");
		this.gl = gl;

		if (clearColor) this.#clearColor = clearColor;

		this.#program = createProgram(gl, vertexSource, fragmentSource);
		gl.useProgram(this.#program);

		// Blending
		gl.enable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		gl.blendFuncSeparate(
			gl.SRC_ALPHA,
			gl.ONE_MINUS_SRC_ALPHA,
			gl.ONE,
			gl.ONE_MINUS_SRC_ALPHA,
		);

		// Buffers
		this.#positionBuffer = gl.createBuffer()!;
		this.#colorBuffer = gl.createBuffer()!;

		// Attribute locations
		this.#positionLoc = gl.getAttribLocation(this.#program, "a_position");
		this.#colorLoc = gl.getAttribLocation(this.#program, "a_color");

		// Uniform locations
		this.#pointSizeLoc = gl.getUniformLocation(this.#program, "point_size")!;
		this.#isDrawingAxisLoc = gl.getUniformLocation(this.#program, "isDrawingAxis")!;
		this.#canvasWidthLoc = gl.getUniformLocation(this.#program, "canvasWidth")!;
		this.#canvasHeightLoc = gl.getUniformLocation(this.#program, "canvasHeight")!;

		this.resize();
	}

	resize(): void {
		const canvas = this.gl.canvas as HTMLCanvasElement;
		this.gl.viewport(0, 0, canvas.width, canvas.height);
		this.gl.uniform1f(this.#canvasWidthLoc, canvas.clientWidth);
		this.gl.uniform1f(this.#canvasHeightLoc, canvas.clientHeight);
	}

	/**
	 * Render data points and axis lines.
	 *
	 * @param points - npoint x 2 canvas-space positions for data points
	 * @param colors - RGBA per data point (0-255 each)
	 * @param axisPoints - (ndim * 2) x 2 canvas-space positions for axis line endpoints
	 * @param axisColors - RGBA per axis vertex
	 * @param pointSize - point diameter in CSS pixels
	 */
	render(
		points: number[][],
		colors: [number, number, number, number][],
		axisPoints: number[][],
		axisColors: [number, number, number, number][],
		pointSize: number,
	): void {
		const gl = this.gl;
		const npoint = points.length;
		const naxisVerts = axisPoints.length;

		// Combine data + axis positions into a single buffer
		const allPoints = points.concat(axisPoints);
		const allColors = (colors as number[][]).concat(axisColors);

		// Clear
		gl.clearColor(...this.#clearColor);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

		// Position buffer: each point is [x, y] → we need vec4, pad with 0,0
		const posData = new Float32Array(allPoints.length * 2);
		for (let i = 0; i < allPoints.length; i++) {
			posData[i * 2] = allPoints[i][0];
			posData[i * 2 + 1] = allPoints[i][1];
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.#positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, posData, gl.DYNAMIC_DRAW);
		gl.vertexAttribPointer(this.#positionLoc, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(this.#positionLoc);

		// Color buffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#colorBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Uint8Array(allColors.flat()),
			gl.DYNAMIC_DRAW,
		);
		gl.vertexAttribPointer(this.#colorLoc, 4, gl.UNSIGNED_BYTE, true, 0, 0);
		gl.enableVertexAttribArray(this.#colorLoc);

		// Draw data points
		gl.uniform1f(this.#pointSizeLoc, pointSize * window.devicePixelRatio);
		gl.uniform1i(this.#isDrawingAxisLoc, 0);
		gl.drawArrays(gl.POINTS, 0, npoint);

		// Draw axis lines
		gl.uniform1i(this.#isDrawingAxisLoc, 1);
		gl.drawArrays(gl.LINES, npoint, naxisVerts);
	}

	destroy(): void {
		const gl = this.gl;
		gl.deleteBuffer(this.#positionBuffer);
		gl.deleteBuffer(this.#colorBuffer);
		gl.deleteProgram(this.#program);
	}
}
