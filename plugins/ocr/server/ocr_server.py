"""Text from pictures and scanned PDFs with RapidOCR, as an MCP server, on this computer.

RapidOCR's models come with its package (Chinese and English, which covers Latin-script text well);
PDF pages are drawn with pypdfium2 first. Everything stays on this computer.

It reads on the graphics card when ONNX Runtime has one here: an NVIDIA GPU through CUDA (on a computer
with one, the plugin's setup adds ONNX Runtime's GPU build, which replaces the CPU's in its environment,
and NVIDIA's libraries), a Mac's through Core ML (in the stock build); else on the CPU. When the card
fails (its provider does not start, an error, scores that are not numbers), it reads on the CPU from then
on, and says why once.
"""

import contextlib
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp_server import Server, ToolError  # noqa: E402

server = Server(
    "ocr",
    "1.1.0",
    instructions="Reads text in images and scanned PDFs on this computer (on its graphics card when it has one, else the CPU). Give full paths. A PDF with a text layer reads better with your document tools: use ocr_pdf for scans.",
)
engine = None
# Where the engine reads ("cuda", "coreml" or "cpu"), and why the graphics card failed, once it has: the CPU from then on.
engine_device = None
gpu_failed = None
WORDS = {"cuda": "NVIDIA GPU (CUDA)", "coreml": "Apple GPU (Core ML)", "cpu": "CPU"}
PROVIDERS = {"cuda": "CUDAExecutionProvider", "coreml": "CoreMLExecutionProvider"}


def gpu_here():
    """The graphics card ONNX Runtime can use here, if any (and it has not failed)."""
    if gpu_failed:
        return None
    try:
        import onnxruntime as ort

        have = ort.get_available_providers()
    except Exception:  # noqa: BLE001
        return None
    if "CUDAExecutionProvider" in have:
        return "cuda"
    if sys.platform == "darwin" and "CoreMLExecutionProvider" in have:
        return "coreml"
    return None


def make_engine(device):
    from rapidocr import RapidOCR

    params = {"Global.log_level": "warning"}
    if device == "cuda":
        import onnxruntime as ort

        # NVIDIA's libraries, from the packages that came with the GPU build.
        if hasattr(ort, "preload_dlls"):
            ort.preload_dlls()
        # Quick choices of how to convolve: every page and line is another size, and a long search for each would cost more than it saves.
        params.update({"EngineConfig.onnxruntime.use_cuda": True, "EngineConfig.onnxruntime.cuda_ep_cfg.cudnn_conv_algo_search": "HEURISTIC", "EngineConfig.onnxruntime.cuda_ep_cfg.arena_extend_strategy": "kSameAsRequested"})
    elif device == "coreml":
        # What Core ML compiles is kept in the plugin's data folder, so it compiles once.
        cache = os.path.join(os.environ.get("PLUGIN_DATA") or tempfile.gettempdir(), "coreml")
        params.update({"EngineConfig.onnxruntime.use_coreml": True, "EngineConfig.onnxruntime.coreml_ep_cfg.ModelCacheDirectory": cache})
    return RapidOCR(params=params)


def started_on(eng):
    """The providers its models' sessions started on (ONNX Runtime goes on with the CPU by itself when a GPU's will not start)."""
    out = set()
    for part in ("text_det", "text_cls", "text_rec"):
        s = getattr(getattr(getattr(eng, part, None), "session", None), "session", None)
        if s is not None:
            with contextlib.suppress(Exception):
                out.add(s.get_providers()[0])
    return out


def ocr(img):
    """RapidOCR's result for a picture, where it ran, and why the graphics card failed when it just has."""
    global engine, engine_device, gpu_failed
    # What libraries print (ONNX Runtime falling back from a GPU) must not get among the MCP messages on stdout.
    with contextlib.redirect_stdout(sys.stderr):
        if engine is None:
            engine_device = gpu_here() or "cpu"
            engine = make_engine(engine_device) if engine_device == "cpu" else None
        why = None
        if engine_device != "cpu":
            try:
                engine = engine or make_engine(engine_device)
                r = engine(img)
                used = started_on(engine)
                if PROVIDERS[engine_device] not in used and used:
                    # Its sessions are on the CPU already: they stay.
                    why = f"{PROVIDERS[engine_device]} did not start"
                elif any(isinstance(x, float) and math.isnan(x) for x in (getattr(r, "scores", None) or ())):
                    raise ValueError("its scores were not numbers")
                else:
                    return r, engine_device, None
            except Exception as e:  # noqa: BLE001
                why = f"{type(e).__name__}: {str(e)[:300]}"
                engine = None
            gpu_failed = f"on the {WORDS[engine_device]}: {why}"
            sys.stderr.write(f"ocr: {gpu_failed}; reading on the CPU from now on\n")
            engine_device = "cpu"
            if engine is not None:
                return r, "cpu", gpu_failed
            engine = make_engine("cpu")
            return engine(img), "cpu", gpu_failed
        return engine(img), "cpu", None


def full(path):
    p = os.path.expanduser(str(path or "").strip())
    if not os.path.isabs(p):
        raise ToolError(f"Give the full path (from /), not {path!r}.")
    if not os.path.isfile(p):
        raise ToolError(f"There is no file at {p}.")
    return p


def read_lines(img, min_score, ran=None):
    r, where, failed = ocr(img)
    if ran is not None:
        ran["ran_on"] = WORDS[where]
        if failed:
            ran["gpu_failed"] = failed
    boxes = getattr(r, "boxes", None)
    txts = list(getattr(r, "txts", None) or [])
    scores = list(getattr(r, "scores", None) or [])
    out = []
    for i, t in enumerate(txts):
        s = float(scores[i]) if i < len(scores) else 1.0
        if s < min_score:
            continue
        top, left = 0.0, 0.0
        if boxes is not None and i < len(boxes):
            b = boxes[i]
            top, left = float(min(p[1] for p in b)), float(min(p[0] for p in b))
        out.append({"text": t, "score": round(s, 3), "top": top, "left": left})
    # Reading order: by line (top, with some slack), then left to right.
    out.sort(key=lambda x: (round(x["top"] / 12), x["left"]))
    return out


def as_text(lines):
    rows, last = [], None
    for ln in lines:
        band = round(ln["top"] / 12)
        if rows and band == last:
            rows[-1] += "  " + ln["text"]
        else:
            rows.append(ln["text"])
        last = band
    return "\n".join(rows)


@server.tool(
    "ocr_image",
    "Read the text in a picture: a photo of a document or a sign, a screenshot, a receipt (png, jpg, webp, bmp, tiff). Returns the text in reading order, and each line with its confidence when lines is true.",
    {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Full path to the picture."},
            "lines": {"type": "boolean", "description": "Also return each line with its confidence and position."},
            "min_score": {"type": "number", "description": "Leave out lines read with less confidence than this (0 to 1, default 0.5)."},
        },
        "required": ["path"],
    },
    read_only=True,
)
def ocr_image(path, lines=False, min_score=0.5):
    ran = {}
    found = read_lines(full(path), float(min_score), ran)
    out = {"text": as_text(found), "lines_found": len(found), **ran}
    if lines:
        out["lines"] = found
    if not found:
        out["note"] = "No text was found. The picture may be too small, blurred or rotated."
    return out


@server.tool(
    "ocr_pdf",
    "Read a scanned PDF (pages that are pictures, with no text layer): each page is drawn and read. Returns the text page by page.",
    {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Full path to the PDF."},
            "pages": {"type": "string", "description": "Which pages, like 1-3,5 (default: all, up to 50)."},
            "dpi": {"type": "integer", "description": "How finely pages are drawn (default 200; 300 for small print).", "minimum": 72, "maximum": 400},
        },
        "required": ["path"],
    },
    read_only=True,
)
def ocr_pdf(path, pages=None, dpi=200):
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(full(path))
    n = len(pdf)
    want = []
    if pages:
        for part in str(pages).split(","):
            part = part.strip()
            if "-" in part:
                a, b = part.split("-", 1)
                want += list(range(int(a), int(b) + 1))
            elif part:
                want.append(int(part))
    else:
        want = list(range(1, min(n, 50) + 1))
    want = [p for p in want if 1 <= p <= n][:50]
    if not want:
        raise ToolError(f"The PDF has {n} pages.")
    out = []
    ran = {}
    with tempfile.TemporaryDirectory() as tmp:
        for p in want:
            img = pdf[p - 1].render(scale=int(dpi or 200) / 72).to_pil()
            f = os.path.join(tmp, f"p{p}.png")
            img.save(f)
            out.append({"page": p, "text": as_text(read_lines(f, 0.5, ran))})
    return {"pages_in_pdf": n, "pages": out, **ran}


if __name__ == "__main__":
    server.run()
