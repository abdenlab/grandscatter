import marimo

__generated_with = "0.19.11"
app = marimo.App()


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
    df = pd.read_feather("../../examples/eigs.arrow")
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
        Scatter(df, ["E1", "E2", "E3", "E4", "E5"], "name", colors, projection="perspective")
    )
    return (widget,)


@app.cell
def _(widget):
    widget
    return


@app.cell
def _(widget):
    widget.axis_length = 2
    return


@app.cell
def _(widget):
    widget.view_angle = 90
    return


@app.cell
def _(widget):
    widget.projection = "orthographic"
    return


@app.cell
def _(widget):
    widget.base_point_size = 4
    return


@app.cell
def _(df, widget):
    df.iloc[widget.selected_points]
    return


if __name__ == "__main__":
    app.run()
