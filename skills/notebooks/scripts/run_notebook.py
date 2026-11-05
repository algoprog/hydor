#!/usr/bin/env python3
"""Run a Jupyter notebook from top to bottom in a fresh kernel, save it with its outputs, and report what to check.

    nb-python run_notebook.py analysis.ipynb [--python .venv/bin/python] [--timeout 1800] [--out copy.ipynb] [--images DIR]

The kernel runs in the environment of --python, which needs ipykernel and the notebook's packages (by default the
first .venv, venv or env in the notebook's folder or a folder above it, up to the repository's top), and starts in
the notebook's folder, as Hydor's notebook page runs it. Text one stream prints shows as one block, as Jupyter shows
it. The run stops at the first error: the notebook is saved anyway, with the error under its cell, and this exits
with 1. The report lists errors, warnings, slow cells, the pictures (saved as PNG or JPEG files to look at) and the
file's size.
"""
import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

try:
    import nbformat
    from nbclient import NotebookClient
except ImportError:
    sys.exit("This needs nbformat and nbclient: run it with this skill's scripts/nb-python.")

BIN = "Scripts/python.exe" if os.name == "nt" else "bin/python"


def nearby_python(folder: Path):
    """The Python of the first .venv, venv or env in the folder or above it, up to the repository's top."""
    for d in (folder, *folder.parents):
        for name in (".venv", "venv", "env"):
            if (d / name / BIN).exists() and (d / name / "pyvenv.cfg").exists():
                return d / name / BIN
        if (d / ".git").exists():
            break
    return None


def seconds(meta):
    """How long a cell ran, from the times nbclient records."""
    t = meta.get("execution", {})
    try:
        start = datetime.fromisoformat(t["iopub.execute_input"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(t["shell.execute_reply"].replace("Z", "+00:00"))
        return (end - start).total_seconds()
    except (KeyError, ValueError):
        return 0.0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("notebook")
    ap.add_argument("--python", help="the Python whose environment runs the kernel")
    ap.add_argument("--timeout", type=int, default=1800, help="seconds one cell may take (default 1800)")
    ap.add_argument("--out", help="save the run here instead of over the notebook")
    ap.add_argument("--images", help="folder for the pictures the cells drew (default: a new one in the temp folder)")
    a = ap.parse_args()

    path = Path(a.notebook).resolve()
    if not path.is_file():
        sys.exit(f"No notebook at {path}")
    python = Path(a.python).expanduser() if a.python else nearby_python(path.parent)
    if python is None:
        sys.exit(
            "No environment given (--python) and no .venv, venv or env beside the notebook. Make one with ipykernel and "
            "the notebook's packages, or pass --python with the Python of one that has them."
        )
    python = Path(os.path.abspath(python))
    if subprocess.run([str(python), "-c", "import ipykernel"], capture_output=True).returncode != 0:
        sys.exit(f"{python} cannot start a kernel: install ipykernel in its environment ({python} -m pip install ipykernel).")

    nb = nbformat.read(str(path), as_version=4)
    kernelspec = nb.metadata.get("kernelspec")
    # A kernel of its own for this run, so a Jupyter kernel registered under the same name elsewhere is never used.
    specs = Path(tempfile.mkdtemp(prefix="run-notebook-"))
    kdir = specs / "kernels" / "run-notebook"
    kdir.mkdir(parents=True)
    # Its history in memory, not in the person's ~/.ipython.
    argv = [str(python), "-m", "ipykernel_launcher", "-f", "{connection_file}", "--HistoryManager.hist_file=:memory:"]
    (kdir / "kernel.json").write_text(json.dumps({"argv": argv, "display_name": "run-notebook", "language": "python"}))
    os.environ["JUPYTER_PATH"] = os.pathsep.join(p for p in (str(specs), os.environ.get("JUPYTER_PATH", "")) if p)

    client = NotebookClient(
        nb,
        timeout=a.timeout,
        kernel_name="run-notebook",
        record_timing=True,
        coalesce_streams=True,
        resources={"metadata": {"path": str(path.parent)}},
    )
    started = time.time()
    failure = None
    # What the kernel process itself prints (not the cells' output) is shown only if the run fails.
    log = tempfile.TemporaryFile("w+")
    try:
        client.execute(stdout=log, stderr=log)
    except Exception as e:  # a cell's error, a timeout, a kernel that died
        failure = e
    finally:
        shutil.rmtree(specs, ignore_errors=True)
    elapsed = time.time() - started

    code = [(i, c) for i, c in enumerate(nb.cells, 1) if c.cell_type == "code"]
    ran = sum(1 for _, c in code if c.get("execution_count") is not None)
    slow = [(i, seconds(c.metadata)) for i, c in code]
    for _, c in code:
        c.metadata.pop("execution", None)
    if kernelspec:
        nb.metadata["kernelspec"] = kernelspec
    out = Path(a.out).resolve() if a.out else path
    nbformat.write(nb, str(out))

    images = Path(a.images) if a.images else Path(tempfile.mkdtemp(prefix=f"notebook-images-{path.stem}-"))
    images.mkdir(parents=True, exist_ok=True)
    pictures, errors, warnings = [], [], []
    for i, c in code:
        for k, o in enumerate(c.get("outputs", []), 1):
            if o.output_type == "error":
                errors.append(f"cell {i}: {o.ename}: {o.evalue}")
            elif o.output_type == "stream" and o.name == "stderr":
                lines = [line for line in o.text.splitlines() if line.strip()]
                warnings += [f"cell {i}: {line[:200]}" for line in lines[:3]] + ([f"cell {i}: … {len(lines) - 3} more lines"] if len(lines) > 3 else [])
            for mime, ext in (("image/png", "png"), ("image/jpeg", "jpg")):
                if mime in o.get("data", {}):
                    f = images / f"cell{i:02d}-{k}.{ext}"
                    f.write_bytes(base64.b64decode(o.data[mime]))
                    pictures.append(str(f))

    print(f"Ran {ran} of {len(code)} code cells in {elapsed:.0f} s, kernel from {python}")
    print(f"Saved: {out} ({out.stat().st_size / 1e6:.1f} MB)")
    if failure is not None and not errors:
        errors.append(f"{type(failure).__name__}: {str(failure).strip().splitlines()[-1] if str(failure).strip() else ''}")
        log.seek(0)
        tail = [line.rstrip() for line in log.read().splitlines() if line.strip() and "without encryption" not in line][-15:]
        if tail:
            errors.append("the kernel's own last words:\n    " + "\n    ".join(tail))
    for title, rows in (("Errors", errors), ("Warnings and other stderr", warnings)):
        if rows:
            print(f"\n{title}:")
            print("\n".join(f"  {r}" for r in rows))
    long = [(i, s) for i, s in slow if s >= 10]
    if long:
        print("\nSlow cells:\n" + "\n".join(f"  cell {i}: {s:.0f} s" for i, s in long))
    if pictures:
        print(f"\nPictures ({len(pictures)}), to look at:\n" + "\n".join(f"  {p}" for p in pictures))
    if out.stat().st_size > 5e6:
        print("\nOver 5 MB: shrink its outputs (fewer or smaller pictures, shorter prints).")
    sys.exit(1 if failure is not None else 0)


if __name__ == "__main__":
    main()
