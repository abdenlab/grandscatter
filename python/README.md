# Grandscatter

Interactive multidimensional scatterplot widget for Jupyter notebooks. Rotate projection axes by dragging to explore high-dimensional point clouds with correct linear projections at all times.

Built on [anywidget](https://anywidget.dev) and WebGL.

## Installation

```bash
pip install grandscatter
```

## Quick start

```python
from grandscatter import Scatter
import pandas as pd

df = pd.read_csv("my_data.csv")

widget = Scatter(
    df,
    axis_fields=["x1", "x2", "x3", "x4", "x5"],
    label_field="category",
    label_colors={"A": "#e23838", "B": "#2196f3", "C": "#4caf50"},
)
widget
```

## Features

- **Interactive axis rotation** -- drag axis handles to rotate the projection and explore your data from any angle.
- **Orthogonal projections** -- the projection matrix is always kept orthonormal, ensuring geometrically correct linear projections.
- **Perspective and orthographic modes** -- switch between projection types on the fly.
- **WebGL rendering** -- fast, anti-aliased point rendering with depth sorting.
- **Categorical legend** -- click legend items to highlight categories.
- **Live trait sync** -- update properties like `projection`, `axis_length`, `view_angle`, and `base_point_size` from Python and see changes reflected immediately.

## API

### `Scatter(df, axis_fields, label_field, label_colors, **kwargs)`

| Parameter | Type | Description |
|---|---|---|
| `df` | `pd.DataFrame` | Input data |
| `axis_fields` | `list[str]` | Column names to use as projection dimensions |
| `label_field` | `str` | Column name for categorical labels |
| `label_colors` | `dict[str, str]` or `list[str]` | Mapping of category names to hex colors, or a list of colors in category order |
| `projection` | `str` | `"orthographic"` (default) or `"perspective"` |
| `axis_length` | `float` or `None` | Length of axis lines (`None` for auto) |
| `camera_z` | `float` or `None` | Camera z-position for perspective mode |
| `view_angle` | `float` | Field of view in degrees (default `45`) |
| `base_point_size` | `float` | Point radius in pixels (default `6`) |

All keyword parameters are traitlets and can be updated after creation:

```python
widget.projection = "perspective"
widget.base_point_size = 4
widget.view_angle = 90
```

## License

MIT
