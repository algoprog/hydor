"""Everyday PDF jobs with pypdf (and reportlab for stamps).

    office-python pdf_tools.py info FILE.pdf                       pages, size, title, form fields, locked?
    office-python pdf_tools.py merge OUT.pdf A.pdf B.pdf …         one PDF from several, in order
    office-python pdf_tools.py pages FILE.pdf 1-3,7 OUT.pdf        some pages, in that order
    office-python pdf_tools.py split FILE.pdf OUT_DIR              one PDF per page
    office-python pdf_tools.py rotate FILE.pdf 90 OUT.pdf [1,3-4]  turn pages clockwise (all, or some)
    office-python pdf_tools.py fields FORM.pdf                     a form's fields, their kind and value
    office-python pdf_tools.py fill FORM.pdf VALUES.json OUT.pdf   fill a form ({"Name": "Ann", "Agree": "/Yes"})
    office-python pdf_tools.py stamp FILE.pdf "DRAFT" OUT.pdf      big faint words across every page
    office-python pdf_tools.py unlock FILE.pdf PASSWORD OUT.pdf    a copy without the password
"""
import io
import json
import os
import sys

from pypdf import PdfReader, PdfWriter


def page_list(spec, count):
    """'1-3,7' → [0, 1, 2, 6] (pages count from 1)."""
    out = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        a, _, b = part.partition("-")
        first, last = int(a), int(b or a)
        if not (1 <= first <= count and 1 <= last <= count):
            sys.exit(f"Page {part} is not in this PDF (it has {count} pages).")
        step = 1 if last >= first else -1
        out.extend(range(first - 1, last - 1 + step, step))
    return out


def info(path):
    r = PdfReader(path)
    if r.is_encrypted:
        print("Locked with a password: unlock it first (pdf_tools.py unlock).")
        return
    box = r.pages[0].mediabox
    meta = r.metadata or {}
    print(f"{len(r.pages)} pages, first page {float(box.width) / 72 * 25.4:.0f} × {float(box.height) / 72 * 25.4:.0f} mm")
    if meta.get("/Title"):
        print(f"Title: {meta['/Title']}")
    fields = r.get_fields() or {}
    if fields:
        print(f"A form with {len(fields)} fields (pdf_tools.py fields shows them)")
    text = sum(1 for p in r.pages if (p.extract_text() or "").strip())
    if text < len(r.pages):
        print(f"{len(r.pages) - text} pages have no text: scanned images, or blank")


def write(writer, out):
    with open(out, "wb") as f:
        writer.write(f)
    print(f"Wrote {out} ({len(writer.pages)} pages)")


def main(cmd, *a):
    if cmd == "info":
        info(a[0])
    elif cmd == "merge":
        w = PdfWriter()
        for p in a[1:]:
            w.append(p)
        write(w, a[0])
    elif cmd == "pages":
        r = PdfReader(a[0])
        w = PdfWriter()
        for i in page_list(a[1], len(r.pages)):
            w.add_page(r.pages[i])
        write(w, a[2])
    elif cmd == "split":
        r = PdfReader(a[0])
        os.makedirs(a[1], exist_ok=True)
        stem = os.path.splitext(os.path.basename(a[0]))[0]
        for i, page in enumerate(r.pages, start=1):
            w = PdfWriter()
            w.add_page(page)
            with open(os.path.join(a[1], f"{stem}-{i:03d}.pdf"), "wb") as f:
                w.write(f)
        print(f"Wrote {len(r.pages)} files into {a[1]}")
    elif cmd == "rotate":
        r = PdfReader(a[0])
        w = PdfWriter(clone_from=r)
        which = page_list(a[3], len(r.pages)) if len(a) > 3 else range(len(r.pages))
        for i in which:
            w.pages[i].rotate(int(a[1]))
        write(w, a[2])
    elif cmd == "fields":
        r = PdfReader(a[0])
        fields = r.get_fields() or {}
        if not fields:
            print("This PDF has no form fields. To write on it, stamp text with reportlab and merge the pages.")
        for name, f in fields.items():
            kind = {"/Tx": "text", "/Btn": "checkbox or choice", "/Ch": "list", "/Sig": "signature"}.get(f.get("/FT"), f.get("/FT"))
            states = f.get("/_States_", "")
            print(f"{name}: {kind}{f' (values: {states})' if states else ''} = {f.get('/V')!r}")
    elif cmd == "fill":
        r = PdfReader(a[0])
        w = PdfWriter(clone_from=r)
        values = json.load(open(a[1], encoding="utf-8"))
        for page in w.pages:
            w.update_page_form_field_values(page, values, auto_regenerate=False)
        w.set_need_appearances_writer(True)
        write(w, a[2])
    elif cmd == "stamp":
        from reportlab.lib.colors import Color
        from reportlab.pdfgen import canvas

        r = PdfReader(a[0])
        w = PdfWriter(clone_from=r)
        for page in w.pages:
            pw, ph = float(page.mediabox.width), float(page.mediabox.height)
            buf = io.BytesIO()
            c = canvas.Canvas(buf, pagesize=(pw, ph))
            c.setFillColor(Color(0.75, 0.1, 0.1, alpha=0.18))
            c.setFont("Helvetica-Bold", min(pw, ph) / max(4, len(a[1]) * 0.6))
            c.translate(pw / 2, ph / 2)
            c.rotate(35)
            c.drawCentredString(0, 0, a[1])
            c.save()
            page.merge_page(PdfReader(buf).pages[0])
        write(w, a[2])
    elif cmd == "unlock":
        r = PdfReader(a[0])
        if r.is_encrypted and not r.decrypt(a[1]):
            sys.exit("That password does not open it.")
        w = PdfWriter(clone_from=r)
        write(w, a[2])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], *sys.argv[2:])
