# Grandscatter

> To deal with a 14-dimensional space, visualize a 3-D space and say 'fourteen' to yourself very loudly. Everyone does it. - Geoffrey Hinton

Grandscatter is a scatterplot library for interactively exploring high-dimensional datasets as simple projections in two- or three-dimensional space. 

Grandscatter is written in TypeScript. This project also provides a Python-based widget for Jupyter.

In grandscatter, the projection plane (or space) is stationary and you travel within data space (i.e., change the visible projection) by _manipulating the data axes around the origin_. You can rotate and reflect the axes manually, or orchestrate high-dimensional "tours" programmatically.

Grandscatter supports two projection modes:

* orthographic: a flat projection where distances within the 2D canvas are the same as in the projected 2D subspace
* perspective: a 3D projection view, including foreshortening of distal points to improve depth perception

Current supported interactions:

* Drag an axis handle to rotate it
* Option/alt+click an axis handle to flip its orientation
* Shift+drag to lasso-select points

This library was originally based on the [Grand Tour](https://doi.org/10.1137/0906011) implementation in Li et al., 2020. [Visualizing Neural Networks with the Grand Tour](https://doi.org/10.23915/distill.00025). Our original implementation was [eigen-tour](https://github.com/abdenlab/eigen-tour).

## Development

To build grandscatter:

```sh
pnpm install
pnpm build
```

To serve the example pages locally:

```sh
pnpm dev
```

For widget development, create a Python dev envrionment:

```sh
cd python
uv sync
```

Run the dev server to watch and rebuild the widget assets:

```sh
pnpm dev:widget
```

Open JupyterLab or other notebook environment:

```sh
ANYWIDGET_HMR=1 uv run juptyer lab
```

Or execute `%env ANYWIDGET_HMR=1` in a cell to activate anywidget's hot module replacement.
