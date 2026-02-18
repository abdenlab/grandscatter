# Grandscatter example notebooks

Running Jupyter notebooks in JupyterLab:

```sh
uv run jupyter lab
```

Running a marimo notebook locally (Python kernel):

```sh
uv run marimo run example.py  # app mode
# or
uv run marimo edit example.py  # edit mode
```

Building and serving a marimo WASM notebook (Pyodide kernel):

```sh
uv run marimo export html-wasm --mode run -o html example_wasm.py  # build for app mode
# or
uv run marimo export html-wasm --mode edit -o html example_wasm.py  # build for edit mode
# then
uv run python -m http.server --directory html
```
