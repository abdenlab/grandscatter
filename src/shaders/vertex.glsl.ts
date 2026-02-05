export default `
attribute vec4 a_position;
attribute vec4 a_color;

uniform float point_size;
uniform float canvasWidth;
uniform float canvasHeight;

varying vec4 v_color;

void main() {
  gl_PointSize = point_size;
  gl_Position.x = (a_position.x / canvasWidth - 0.5) * 2.0;
  gl_Position.y = -(a_position.y / canvasHeight - 0.5) * 2.0;
  gl_Position.z = 0.0;
  gl_Position.w = 1.0;
  v_color = a_color;
}
`;
