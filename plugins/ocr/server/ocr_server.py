"""Text from pictures and scanned PDFs with RapidOCR, as an MCP server, on this computer.

RapidOCR's models come with its package (Chinese and English, which covers Latin-script text well);
PDF pages are drawn with pypdfium2 first. Everything stays on this computer.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp_server import Server, ToolError  # noqa: E402

server = Server(
    "ocr",
    "1.0.0",
    instructions="Reads text in images and scanned PDFs on this computer. Give full paths. A PDF with a text layer reads better with your document tools: use ocr_pdf for scans.",
)
engine = None


def ocr():
    global engine
    if engine is None:
        import logging

        logging.getLogger("RapidOCR").setLevel(logging.WARNING)
        from rapidocr import RapidOCR

        engine = RapidOCR()
    return engine


def full(path):
    p = os.path.expanduser(str(path or "").strip())
    if not os.path.isabs(p):
        raise ToolError(f"Give the full path (from /), not {path!r}.")
    if not os.path.isfile(p):
        raise ToolError(f"There is no file at {p}.")
    return p


def read_lines(img, min_score):
    r = ocr()(img)
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
    found = read_lines(full(path), float(min_score))
    out = {"text": as_text(found), "lines_found": len(found)}
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
    with tempfile.TemporaryDirectory() as tmp:
        for p in want:
            img = pdf[p - 1].render(scale=int(dpi or 200) / 72).to_pil()
            f = os.path.join(tmp, f"p{p}.png")
            img.save(f)
            out.append({"page": p, "text": as_text(read_lines(f, 0.5))})
    return {"pages_in_pdf": n, "pages": out}


if __name__ == "__main__":
    server.run()
