"""What python-docx leaves out: links, page numbers, a table of contents, cell shading, and find and
replace that keeps the formatting.

    import sys; sys.path.insert(0, "<this skill's folder>/scripts")
    from docx_helpers import add_hyperlink, add_page_numbers, add_toc, shade, replace_text
"""
import re

from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


def add_hyperlink(paragraph, url, text, color="0563C1", underline=True):
    """A clickable link at the end of `paragraph`."""
    r_id = paragraph.part.relate_to(url, RT.HYPERLINK, is_external=True)
    link = OxmlElement("w:hyperlink")
    link.set(qn("r:id"), r_id)
    run = OxmlElement("w:r")
    rpr = OxmlElement("w:rPr")
    c = OxmlElement("w:color")
    c.set(qn("w:val"), color)
    rpr.append(c)
    if underline:
        u = OxmlElement("w:u")
        u.set(qn("w:val"), "single")
        rpr.append(u)
    run.append(rpr)
    t = OxmlElement("w:t")
    t.set(qn("xml:space"), "preserve")
    t.text = text
    run.append(t)
    link.append(run)
    paragraph._p.append(link)
    return link


def _field(run, code, shown="1"):
    """A Word field (PAGE, NUMPAGES, TOC…) in `run`; Word and LibreOffice work out its value."""
    parts = [("w:fldChar", {"w:fldCharType": "begin"}), ("w:instrText", None), ("w:fldChar", {"w:fldCharType": "separate"}), ("w:t", None), ("w:fldChar", {"w:fldCharType": "end"})]
    for tag, attrs in parts:
        el = OxmlElement(tag)
        for k, v in (attrs or {}).items():
            el.set(qn(k), v)
        if tag == "w:instrText":
            el.set(qn("xml:space"), "preserve")
            el.text = f" {code} "
        elif tag == "w:t":
            el.text = shown
        run._r.append(el)


def add_page_numbers(section, template="Page {PAGE} of {NUMPAGES}", align="center", size=None):
    """Page numbers in the section's footer: `template` with {PAGE} and {NUMPAGES}."""
    footer = section.footer
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.text = ""
    p.alignment = {"left": WD_ALIGN_PARAGRAPH.LEFT, "right": WD_ALIGN_PARAGRAPH.RIGHT}.get(align, WD_ALIGN_PARAGRAPH.CENTER)
    for part in re.split(r"(\{PAGE\}|\{NUMPAGES\})", template):
        if not part:
            continue
        run = p.add_run()
        if size:
            run.font.size = size
        if part in ("{PAGE}", "{NUMPAGES}"):
            _field(run, part.strip("{}"))
        else:
            run.text = part
    return p


def add_toc(document, levels="1-3", title="Contents"):
    """A table of contents from the headings. Word fills it in when the file is opened (it asks to
    update the fields); LibreOffice when it converts or opens the file."""
    if title:
        document.add_paragraph(title, style="TOC Heading" if "TOC Heading" in [s.name for s in document.styles] else None).runs[0].bold = True
    p = document.add_paragraph()
    _field(p.add_run(), f'TOC \\o "{levels}" \\h \\z \\u', "Table of contents: Word fills it in when the document opens (in LibreOffice: Tools → Update → Update All).")
    settings = document.settings.element
    if settings.find(qn("w:updateFields")) is None:
        uf = OxmlElement("w:updateFields")
        uf.set(qn("w:val"), "true")
        settings.append(uf)
    return p


def shade(cell, fill="D9E2F3"):
    """A table cell's background colour (hex, no #)."""
    tcPr = cell._tc.get_or_add_tcPr()
    for old in tcPr.findall(qn("w:shd")):
        tcPr.remove(old)
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tcPr.append(shd)


def _paragraphs(document):
    def cells(tables):
        for t in tables:
            for row in t.rows:
                for cell in row.cells:
                    yield from cell.paragraphs
                    yield from cells(cell.tables)

    yield from document.paragraphs
    yield from cells(document.tables)
    for s in document.sections:
        for part in (s.header, s.footer, s.first_page_header, s.first_page_footer):
            if part is not None and not part.is_linked_to_previous:
                yield from part.paragraphs
                yield from cells(part.tables)


def replace_text(document, old, new):
    """Replaces `old` with `new` everywhere (body, tables, headers, footers), even across runs, keeping
    the formatting of the run each match starts in. Returns how many were replaced."""
    count = 0
    for p in _paragraphs(document):
        start = 0
        while True:
            runs = p.runs
            text = "".join(r.text for r in runs)
            i = text.find(old, start)
            if i < 0 or not old:
                break
            pos, first, last, off_first, off_last = 0, None, None, 0, 0
            for k, r in enumerate(runs):
                end = pos + len(r.text)
                if first is None and i < end:
                    first, off_first = k, i - pos
                if first is not None and i + len(old) <= end:
                    last, off_last = k, i + len(old) - pos
                    break
                pos = end
            if first is None or last is None:
                break
            if first == last:
                r = runs[first]
                r.text = r.text[:off_first] + new + r.text[off_first + len(old):]
            else:
                runs[first].text = runs[first].text[:off_first] + new
                for k in range(first + 1, last):
                    runs[k].text = ""
                runs[last].text = runs[last].text[off_last:]
            start = i + len(new)
            count += 1
    return count
