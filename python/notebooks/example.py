import marimo

__generated_with = "0.19.11"
app = marimo.App()


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Grandscatter

    Grandscatter is a scatterplot library for interactively exploring high-dimensional datasets as simple linear projections in two- or three-dimensional space.

    Think of grandscatter as an alternative or complement to non-linear visual projection methods like t-SNE or UMAP.

    In grandscatter, the projection plane (or space) is stationary and you travel within data space (i.e., change the visible projection) by _manipulating the data axes around the origin_. You can rotate and reflect the axes manually, or orchestrate high-dimensional "tours" programmatically.
    """)
    return


@app.cell
def _():
    import os
    os.environ['ANYWIDGET_HMR'] = '1'
    return


@app.cell
def _():
    from grandscatter import Scatter
    import pandas as pd
    import pyarrow as pa
    import marimo as mo

    return Scatter, mo, pd


@app.cell
def _(pd):
    df = pd.read_feather("https://abdenlab.org/grandscatter/eigs.arrow")
    df
    return (df,)


@app.cell
def _(df):
    colors = dict(
        zip(
            df[["name", "color"]].drop_duplicates()["name"].tolist(),
            df[["name", "color"]].drop_duplicates()["color"].tolist()
        )
    )
    return (colors,)


@app.cell
def _(Scatter, colors, df, mo):
    widget = mo.ui.anywidget(
        Scatter(df, ["E1", "E2", "E3", "E4", "E5"], "name", colors)
    )
    return (widget,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Controls

    ### Axis handles

    Click an axis handle to rotate it. <span style="color: red">Red</span> handles point in the positive direction, <span style="color: blue">blue</span> handles point in the negative direction.

    Alt+click (option+click) on an axis handle to flip its orientation.

    ### Projection modes

    The default projection is **orthographic**, which is essentially a 2D projection that preserves distances in the 2D subspace being displayed. While there is a coherent z-stacking of points along a third axis pointing towards you, there are no other depth effects.

    Toggle to **perspective** mode below for a 3D projection, which activates the camera options below that control zoom and depth cues.
    """)
    return


@app.cell
def _(mo):
    ui_proj = mo.ui.dropdown(options=["orthographic", "perspective"], value="orthographic", allow_select_none=False, label="projection")
    ui_angle = mo.ui.slider(1, 179, 1, value=45, label="view angle (deg)")
    ui_camera = mo.ui.slider(-10, 30, 0.2, value=2, label="camera position")
    ui_ptsize = mo.ui.slider(1, 30, 1, value=4, label="base point size")

    mo.vstack([ui_proj, ui_angle, ui_camera, ui_ptsize])
    return ui_angle, ui_camera, ui_proj, ui_ptsize


@app.cell
def _(widget):
    widget
    return


@app.cell
def _(ui_angle, ui_camera, ui_proj, ui_ptsize, widget):
    widget.projection = ui_proj.value
    widget.view_angle = ui_angle.value
    widget.base_point_size = ui_ptsize.value
    widget.camera_z = ui_camera.value
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Lasso

    Shift+drag your mouse to select points. The selection (row indices) is accessible to Python through the widget using the `selected_points` trait.
    """)
    return


@app.cell
def _(df, widget):
    df.iloc[widget.selected_points]
    return


if __name__ == "__main__":
    app.run()
