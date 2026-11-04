#!/usr/bin/env python3
"""Make an EPUB 3 ebook from Markdown or HTML files.

    python make_epub.py FILE... -o book.epub --title "Title" --author "Name" [options]

The files are read in the order given. Each is split into chapters at its headings (--split), the
pictures it uses (relative paths) are put in the book, and links between the files keep working. The
book gets a cover page (--cover), a contents page and the reader's contents menu, metadata and a
stylesheet. Check the result with check_epub.py.

Needs Markdown and lxml (the Ebooks plugin's own Python has them).
"""

import argparse
import base64
import datetime
import os
import re
import sys
import uuid
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

try:
    import markdown
    from markdown.extensions.toc import slugify_unicode
    from lxml import etree
    from lxml import html as lhtml
except ImportError as e:
    sys.exit(f"Missing the Python package {e.name}: run this with the Ebooks plugin's Python.")

IMAGE_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
               ".svg": "image/svg+xml", ".webp": "image/webp"}
MD_EXTENSIONS = ["abbr", "attr_list", "def_list", "fenced_code", "footnotes", "md_in_html", "tables",
                 "sane_lists", "smarty", "toc"]
# Left out with what is inside them; tags not in KEEP are removed but their text stays.
DROP = {"head", "title", "meta", "link", "script", "style", "noscript", "template", "iframe", "object",
        "embed", "form", "input", "button", "select", "textarea", "nav", "svg", "math", "canvas",
        "audio", "video", "source", "track", "map", "area"}
KEEP = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "em", "strong", "i", "b", "u", "s", "small",
        "sub", "sup", "span", "a", "img", "figure", "figcaption", "blockquote", "ul", "ol", "li", "dl",
        "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
        "pre", "code", "kbd", "samp", "var", "abbr", "cite", "q", "mark", "del", "ins", "div", "section",
        "article", "aside", "header", "footer", "address", "time", "ruby", "rt", "rp", "bdi", "bdo", "wbr"}
ATTRS = {"*": {"id", "class", "title", "lang", "dir"}, "a": {"href"}, "img": {"src", "alt", "width", "height"},
         "td": {"colspan", "rowspan"}, "th": {"colspan", "rowspan", "scope"}, "ol": {"start", "reversed", "type"},
         "blockquote": {"cite"}, "q": {"cite"}, "time": {"datetime"}, "del": {"datetime"},
         "ins": {"datetime"}, "col": {"span"}, "colgroup": {"span"}}
BLOCK = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "blockquote", "ul", "ol", "dl", "table", "pre",
         "figure", "div", "section", "article", "aside", "header", "footer", "address"}
CONTAINERS = {"div", "section", "article", "header", "footer"}
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]")
CJK = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]")

LOOKS = {
    "book": """body { margin: 0; padding: 0 0.3em; font-family: serif; line-height: 1.45; }
h1, h2, h3 { text-align: center; line-height: 1.25; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.6em; margin: 1.5em 0 1.2em; }
h2 { font-size: 1.3em; margin: 1.3em 0 0.9em; }
h3 { font-size: 1.1em; margin: 1.2em 0 0.6em; }
p { margin: 0; text-indent: 1.4em; }
h1 + p, h2 + p, h3 + p, hr + p, blockquote + p, figure + p, ul + p, ol + p, table + p, pre + p,
.noindent, li p, blockquote p, td p, aside p { text-indent: 0; }
""",
    "plain": """body { margin: 0; padding: 0 0.3em; font-family: sans-serif; line-height: 1.5; }
h1, h2, h3 { line-height: 1.25; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.6em; margin: 1.2em 0 0.8em; }
h2 { font-size: 1.3em; margin: 1.2em 0 0.6em; }
h3 { font-size: 1.1em; margin: 1em 0 0.5em; }
p { margin: 0 0 0.8em; }
""",
}
CSS_COMMON = """hr { border: 0; border-top: 1px solid; width: 25%; margin: 1.5em auto; }
blockquote { margin: 1em 1.5em; }
img { max-width: 100%; height: auto; }
figure { margin: 1em 0; text-align: center; }
figcaption { font-size: 0.9em; font-style: italic; }
table { border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid #888; padding: 0.2em 0.4em; vertical-align: top; }
pre { white-space: pre-wrap; font-size: 0.85em; }
section.footnotes { font-size: 0.9em; }
nav ol { list-style-type: none; padding-left: 1em; }
body.cover { margin: 0; padding: 0; text-align: center; }
body.cover img { max-width: 100%; max-height: 100vh; }
"""

warnings = []


def warn(msg):
    if msg not in warnings:
        warnings.append(msg)


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def read_text(path):
    data = path.read_bytes()
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:  # Word saves "Web Page, Filtered" as windows-1252
        m = re.search(rb"charset=[\"']?([\w-]+)", data[:4096])
        try:
            text = data.decode(m.group(1).decode() if m else "cp1252", errors="replace")
        except LookupError:
            text = data.decode("cp1252", errors="replace")
    return CONTROL.sub("", text)


def load(path):
    """A file's content as a cleaned <body> element, or None when it is empty."""
    text = read_text(path)
    ext = path.suffix.lower()
    if ext in (".md", ".markdown", ".txt"):
        md = markdown.Markdown(extensions=MD_EXTENSIONS, extension_configs={
            "footnotes": {"SEPARATOR": "-"}, "toc": {"slugify": slugify_unicode}})  # headings get ids: #chapter-two
        text = "<html><body>" + md.convert(text) + "</body></html>"
    elif ext not in (".html", ".htm", ".xhtml"):
        sys.exit(f"{path.name}: give Markdown (.md) or HTML (.html) files.")
    text = re.sub(r"^\s*<\?xml[^>]*\?>", "", text)
    if not text.strip():
        return None
    body = lhtml.document_fromstring(text).body
    clean(body)
    return body


def clean(body):
    """Keep the parts a book needs: no scripts or styles, no tags or attributes an EPUB does not allow."""
    etree.strip_elements(body, etree.Comment, etree.ProcessingInstruction, with_tail=False)
    for el in list(body.iter()):
        if el is not body and el.tag in DROP:
            if el.tag in ("svg", "math", "video", "audio", "iframe", "object"):
                warn(f"A <{el.tag}> was left out: put pictures in as image files.")
            el.drop_tree()
    for el in list(body.iter()):
        if el is not body and el.tag not in KEEP:
            el.drop_tag()
    for el in body.iter():
        if el.tag == "a" and el.get("name") and not el.get("id"):  # Word marks link targets with <a name>
            el.set("id", el.get("name"))
        allowed = ATTRS["*"] | ATTRS.get(el.tag, set())
        for name in list(el.attrib):
            value = el.get(name)
            if name not in allowed or (name in ("width", "height", "colspan", "rowspan", "start", "span")
                                       and not value.strip().isdigit()):
                del el.attrib[name]
        if el.get("type") not in (None, "1", "a", "A", "i", "I"):
            del el.attrib["type"]


def level(el):
    return int(el.tag[1]) if isinstance(el.tag, str) and re.fullmatch(r"h[1-6]", el.tag) else 0


def blockify(body, split_at):
    """Bring headings to the top (out of the divs around them) and wrap loose text and inline tags in <p>."""
    while split_at:
        boxes = [el for el in body if el.tag in CONTAINERS and any(0 < level(h) <= split_at for h in el.iter())]
        if not boxes:
            break
        for el in boxes:
            el.drop_tag()
    new, cur = [], None

    def add_text(t):
        nonlocal cur
        if not t or (cur is None and not t.strip()):
            return
        if cur is None:
            cur = lhtml.Element("p")
            new.append(cur)
        if len(cur):
            cur[-1].tail = (cur[-1].tail or "") + t
        else:
            cur.text = (cur.text or "") + t

    add_text(body.text)
    body.text = None
    for el in list(body):
        tail, el.tail = el.tail, None
        body.remove(el)
        if el.tag in BLOCK:
            cur = None
            new.append(el)
        else:
            if cur is None:
                cur = lhtml.Element("p")
                new.append(cur)
            cur.append(el)
        add_text(tail)
    return new


def auto_split(elements):
    counts = [sum(1 for el in elements if level(el) == n) for n in (1, 2)]
    return 1 if counts[0] > 1 else 2 if counts[1] > 1 else 0


def has_content(chunk):
    return any(el.text_content().strip() or el.tag == "img" or el.find(".//img") is not None for el in chunk)


def place_footnotes(chunks):
    """Python-Markdown puts every footnote at the end of a file: give each chapter its own, as EPUB notes."""
    sections = {}
    for chunk in chunks:
        for box in [el for el in chunk if el.tag == "div" and "footnote" in (el.get("class") or "").split()]:
            chunk.remove(box)
            for li in box.iter("li"):
                fid = li.get("id")
                if not fid:
                    continue
                target = next((c for c in chunks for e in c for a in e.iter("a") if a.get("href") == "#" + fid), chunk)
                for back in [a for a in li.iter("a") if "footnote-backref" in (a.get("class") or "")]:
                    back.drop_tree()
                aside = lhtml.Element("aside", {"id": fid, "epub:type": "footnote", "role": "doc-footnote"})
                aside.text = li.text
                for kid in list(li):
                    aside.append(kid)
                for p in aside.iter("p"):
                    if len(p) == 0 and p.text:
                        p.text = p.text.rstrip("\xa0 ")
                if id(target) not in sections:
                    sec = lhtml.Element("section", {"class": "footnotes", "epub:type": "footnotes"})
                    sec.append(lhtml.Element("hr"))
                    target.append(sec)
                    sections[id(target)] = sec
                sections[id(target)].append(aside)
    for chunk in chunks:
        for el in chunk:
            for a in el.iter("a"):
                if "footnote-ref" in (a.get("class") or "").split():
                    a.set("epub:type", "noteref")
                    a.set("role", "doc-noteref")


def safe_id(s):
    s = re.sub(r"[^A-Za-z0-9_.-]+", "-", s).strip("-") or "x"
    return s if re.match(r"[A-Za-z_]", s) else "x" + s


def isbn_ok(digits):
    if len(digits) == 13:
        return sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits)) % 10 == 0
    total = sum((10 - i) * (10 if d in "Xx" else int(d)) for i, d in enumerate(digits))
    return total % 11 == 0


def identifier(given, title, authors):
    if not given:  # the same title and authors give the same identifier, so a rebuilt book replaces the old one
        return "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, "ebook:" + title + "|" + "|".join(authors)))
    digits = re.sub(r"[\s-]", "", given)
    if re.fullmatch(r"97[89]\d{10}|\d{9}[\dXx]", digits):
        if not isbn_ok(digits):
            warn(f"The ISBN {given} has a wrong check digit: check it before publishing.")
        return "urn:isbn:" + digits.upper()
    return given


def xhtml(title, body, lang, css, body_class=""):
    cls = f' class="{body_class}"' if body_class else ""
    return (f'<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
            f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '
            f'xml:lang="{lang}" lang="{lang}">\n<head>\n<title>{esc(title)}</title>\n'
            f'<link rel="stylesheet" type="text/css" href="{css}"/>\n</head>\n<body{cls}>\n{body}\n</body>\n</html>\n')


def toc_tree(entries):
    root, stack = [], [(0, None)]
    for lv, title, href in entries:
        while stack[-1][0] >= lv:
            stack.pop()
        node = {"title": title, "href": href, "kids": []}
        (stack[-1][1]["kids"] if stack[-1][1] else root).append(node)
        stack.append((lv, node))
    return root


def nav_ol(nodes):
    return "<ol>" + "".join(f'<li><a href="{esc(n["href"])}">{esc(n["title"])}</a>'
                            f'{nav_ol(n["kids"]) if n["kids"] else ""}</li>' for n in nodes) + "</ol>"


def ncx_points(nodes, count):
    out = ""
    for n in nodes:
        count[0] += 1
        out += (f'<navPoint id="np{count[0]}" playOrder="{count[0]}"><navLabel><text>{esc(n["title"])}</text>'
                f'</navLabel><content src="{esc(n["href"])}"/>{ncx_points(n["kids"], count)}</navPoint>')
    return out


def depth(nodes):
    return 1 + max((depth(n["kids"]) for n in nodes), default=0) if nodes else 0


def main():
    ap = argparse.ArgumentParser(description="Make an EPUB 3 ebook from Markdown or HTML files.")
    ap.add_argument("files", nargs="+", type=Path, help="chapter files, in reading order (.md or .html)")
    ap.add_argument("-o", "--output", required=True, type=Path, help="the .epub to write")
    ap.add_argument("--title", required=True)
    ap.add_argument("--author", action="append", default=[], help="repeat for several authors")
    ap.add_argument("--language", default="en", help="the book's language: en, en-GB, el, zh-Hans, ... (default en)")
    ap.add_argument("--cover", type=Path, help="the cover picture (JPEG or PNG)")
    ap.add_argument("--identifier", help="an ISBN for this ebook edition, or any unique id (default: made from title and author)")
    ap.add_argument("--publisher")
    ap.add_argument("--date", help="publication date: YYYY, YYYY-MM or YYYY-MM-DD")
    ap.add_argument("--description", help="the blurb")
    ap.add_argument("--subject", action="append", default=[], help="a subject or genre; repeat for several")
    ap.add_argument("--rights", help='e.g. "Copyright 2026 Ana Silva. All rights reserved."')
    ap.add_argument("--css", type=Path, help="your own stylesheet instead of the built-in one")
    ap.add_argument("--look", choices=sorted(LOOKS), default="book",
                    help="book: indented paragraphs, centred headings (default); plain: spaced paragraphs")
    ap.add_argument("--split", type=int, choices=range(0, 7), metavar="N",
                    help="start a new chapter at each heading of level N or above (0: one chapter per file; "
                         "default: at # when a file has several, else at ##)")
    ap.add_argument("--toc-depth", type=int, default=2, choices=range(1, 7), metavar="N",
                    help="heading levels in the contents (default 2)")
    ap.add_argument("--toc-title", default="Contents", help="the contents page's heading, in the book's language")
    a = ap.parse_args()

    out = a.output.resolve()
    inputs = [p.resolve() for p in a.files]
    for p in inputs:
        if not p.is_file():
            sys.exit(f"No such file: {p}")
    if out in inputs:
        sys.exit("The output would overwrite an input file: choose another name.")
    if a.date and not re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", a.date):
        sys.exit("--date must look like 2026, 2026-11 or 2026-11-04.")
    if not re.fullmatch(r"[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*", a.language):
        sys.exit("--language must be a language code such as en, en-GB, el or zh-Hans.")
    lang = a.language

    # 1. Read every file and cut it into chapters.
    chunks = []  # (file index, [elements])
    for fi, path in enumerate(inputs):
        body = load(path)
        if body is None:
            warn(f"{path.name} is empty: left out.")
            continue
        split_at = a.split if a.split is not None else auto_split(list(body.iter("h1", "h2")))
        elements = blockify(body, split_at)
        parts = [[]]
        for el in elements:
            if split_at and 0 < level(el) <= split_at and parts[-1]:
                parts.append([])
            parts[-1].append(el)
        parts = [c for c in parts if has_content(c)]
        place_footnotes(parts)
        chunks += [(fi, c) for c in parts]
    if not chunks:
        sys.exit("There is no text in these files.")
    name = lambda n: f"chapter-{n + 1:03d}.xhtml"

    # 2. Ids: valid and unique in each chapter, remembered for the links.
    ids, first_of = {}, {}
    for n, (fi, chunk) in enumerate(chunks):
        first_of.setdefault(fi, n)
        used = set()
        for el in (e for top in chunk for e in top.iter()):
            old = el.get("id")
            if old is None:
                continue
            new = base = safe_id(old)
            k = 2
            while new in used:
                new, k = f"{base}-{k}", k + 1
            used.add(new)
            el.set("id", new)
            ids.setdefault((fi, old), (n, new))
        chunks[n] = (fi, chunk, used)

    # 3. Links, pictures and the contents.
    images, image_files, missing_alt, toc, docs, words, cjk = {}, {}, 0, [], [], 0, 0
    reserved = {"cover" + a.cover.suffix.lower()} if a.cover else set()
    for n, (fi, chunk, used) in enumerate(chunks):
        src_dir = inputs[fi].parent
        for a_el in [x for top in chunk for x in top.iter("a")]:
            href = (a_el.get("href") or "").strip()
            if a_el.get("href") is None:
                continue
            u = urlsplit(href)
            if u.scheme in ("http", "https", "mailto"):
                continue
            target = None
            if not u.scheme and not u.netloc:
                if not u.path:
                    target = ids.get((fi, unquote(u.fragment)))
                else:
                    tp = (src_dir / unquote(u.path)).resolve()
                    if tp in inputs and inputs.index(tp) in first_of:
                        tfi = inputs.index(tp)
                        target = ids.get((tfi, unquote(u.fragment))) if u.fragment else (first_of[tfi], None)
            if target is None:
                warn(f"A link to {href} was taken out: it points to nothing in the book.")
                a_el.drop_tag()
                continue
            tn, tid = target
            a_el.set("href", ("" if tn == n and tid else name(tn)) + (f"#{tid}" if tid else ""))
        for img in [x for top in chunk for x in top.iter("img")]:
            src = (img.get("src") or "").strip()
            u = urlsplit(src)
            data, ext, key = None, "", src
            if src.startswith("data:image/"):
                m = re.match(r"data:image/([\w.+-]+);base64,(.*)", src, re.S)
                if m:
                    ext = {"jpeg": ".jpg", "svg+xml": ".svg"}.get(m.group(1), "." + m.group(1))
                    data = base64.b64decode(m.group(2))
            elif not u.scheme and u.path:
                p = (src_dir / unquote(u.path)).resolve()
                key, ext = str(p), p.suffix.lower()
                data = p.read_bytes() if p.is_file() else None
            if data is None or ext not in IMAGE_TYPES:
                why = "it is on the web" if u.scheme in ("http", "https") else \
                      "it is not a JPEG, PNG, GIF, SVG or WebP" if data is not None else "the file was not found"
                warn(f"The picture {src[:80]} was left out: {why}.")
                img.drop_tree()
                continue
            if key not in images:
                stem = safe_id(Path(unquote(u.path)).stem.lower() if not src.startswith("data:") else "picture")
                fname, k = stem + ext, 2
                while fname in image_files or fname in reserved:
                    fname, k = f"{stem}-{k}{ext}", k + 1
                images[key] = fname
                image_files[fname] = data
            img.set("src", "../Images/" + images[key])
            if img.get("alt") is None:
                missing_alt += 1
        title = None
        for top_i, top in enumerate(chunk):
            for h in (top.iter() if top.tag in CONTAINERS else [top]):
                lv = level(h)
                text = " ".join(h.text_content().split()) if lv else ""
                if not text or lv > a.toc_depth:
                    continue
                title = title or text
                if top_i == 0 and h is top:
                    href = "Text/" + name(n)
                else:
                    if not h.get("id"):
                        hid, k = f"toc-{len(toc) + 1}", 2
                        while hid in used:
                            hid, k = f"toc-{len(toc) + 1}-{k}", k + 1
                        used.add(hid)
                        h.set("id", hid)
                    href = f"Text/{name(n)}#{h.get('id')}"
                toc.append((lv, text, href))
        text = " ".join(el.text_content() for el in chunk)
        words, cjk = words + len(CJK.sub(" ", text).split()), cjk + len(CJK.findall(text))
        body = "\n".join(etree.tostring(el, method="xml", encoding="unicode", with_tail=False) for el in chunk)
        docs.append((name(n), xhtml(title or a.title, body, lang, "../Styles/book.css")))
    if not toc:  # no headings at all: list the chapters by number
        toc = [(1, f"{i + 1}", "Text/" + name(i)) for i in range(len(docs))]

    # 4. The package.
    book_id = identifier(a.identifier, a.title, a.author)
    modified = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    css = a.css.read_text(encoding="utf-8") if a.css else LOOKS[a.look] + CSS_COMMON
    files = {"OEBPS/Styles/book.css": css.encode("utf-8")}
    manifest = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
                '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
                '<item id="css" href="Styles/book.css" media-type="text/css"/>']
    spine, meta, landmarks = [], [], []
    if a.cover:
        cover = a.cover.resolve()
        ext = cover.suffix.lower()
        if not cover.is_file() or ext not in IMAGE_TYPES:
            sys.exit(f"The cover must be a JPEG or PNG file: {a.cover}")
        if ext not in (".jpg", ".jpeg", ".png"):
            warn("Stores want the cover as a JPEG (or PNG).")
        files["OEBPS/Images/cover" + ext] = cover.read_bytes()
        manifest.append(f'<item id="cover-image" href="Images/cover{ext}" media-type="{IMAGE_TYPES[ext]}" '
                        'properties="cover-image"/>')
        manifest.append('<item id="cover" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>')
        files["OEBPS/Text/cover.xhtml"] = xhtml(
            "Cover", f'<div><img src="../Images/cover{ext}" alt="{esc("Cover: " + a.title)}"/></div>',
            lang, "../Styles/book.css", "cover").encode("utf-8")
        spine.append('<itemref idref="cover"/>')
        meta.append('<meta name="cover" content="cover-image"/>')
        landmarks.append(("cover", "Text/cover.xhtml", "Cover"))
    spine.append('<itemref idref="nav"/>')
    landmarks.append(("toc", "nav.xhtml#toc", a.toc_title))
    landmarks.append(("bodymatter", toc[0][2].split("#")[0], "Start"))
    for i, (fname, data) in enumerate(image_files.items(), 1):
        ext = Path(fname).suffix.lower()
        manifest.append(f'<item id="img{i:03d}" href="Images/{fname}" media-type="{IMAGE_TYPES[ext]}"/>')
        files["OEBPS/Images/" + fname] = data
    for i, (fname, doc) in enumerate(docs):
        etree.fromstring(doc.encode("utf-8"))  # stops here if a chapter is not well-formed XML
        manifest.append(f'<item id="c{i + 1:03d}" href="Text/{fname}" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="c{i + 1:03d}"/>')
        files["OEBPS/Text/" + fname] = doc.encode("utf-8")
    tree = toc_tree(toc)
    nav_body = (f'<nav epub:type="toc" id="toc" role="doc-toc"><h1>{esc(a.toc_title)}</h1>{nav_ol(tree)}</nav>\n'
                '<nav epub:type="landmarks" id="landmarks" hidden="hidden"><ol>'
                + "".join(f'<li><a epub:type="{t}" href="{h}">{esc(label)}</a></li>' for t, h, label in landmarks)
                + "</ol></nav>")
    files["OEBPS/nav.xhtml"] = xhtml(a.toc_title, nav_body, lang, "Styles/book.css").encode("utf-8")
    files["OEBPS/toc.ncx"] = (
        '<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">'
        f'<head><meta name="dtb:uid" content="{esc(book_id)}"/><meta name="dtb:depth" content="{depth(tree)}"/>'
        '<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>'
        f'<docTitle><text>{esc(a.title)}</text></docTitle><navMap>{ncx_points(tree, [0])}</navMap></ncx>\n'
    ).encode("utf-8")
    dc = [f'<dc:identifier id="bookid">{esc(book_id)}</dc:identifier>', f"<dc:title>{esc(a.title)}</dc:title>",
          f"<dc:language>{lang}</dc:language>"]
    for i, author in enumerate(a.author, 1):
        dc.append(f'<dc:creator id="creator{i}">{esc(author)}</dc:creator>')
        dc.append(f'<meta refines="#creator{i}" property="role" scheme="marc:relators">aut</meta>')
    for tag, value in (("publisher", a.publisher), ("date", a.date), ("description", a.description), ("rights", a.rights)):
        if value:
            dc.append(f"<dc:{tag}>{esc(value)}</dc:{tag}>")
    dc += [f"<dc:subject>{esc(s)}</dc:subject>" for s in a.subject]
    dc.append(f'<meta property="dcterms:modified">{modified}</meta>')
    # Accessibility metadata (EPUB Accessibility 1.1), true to what this book has.
    pictures, described = bool(image_files), missing_alt == 0
    features = ["structuralNavigation", "tableOfContents", "readingOrder"] + (["alternativeText"] if pictures and described else [])
    a11y = [("accessMode", "textual")] + ([("accessMode", "visual")] if pictures else [])
    a11y += [("accessModeSufficient", "textual" if described or not pictures else "textual,visual")]
    a11y += [("accessibilityFeature", f) for f in features] + [("accessibilityHazard", "none")]
    if lang.lower().startswith("en"):
        a11y.append(("accessibilitySummary", "This book has a table of contents and headings to move between its parts"
                     + (", and text descriptions of its pictures." if pictures and described else ".")))
    meta += [f'<meta property="schema:{k}">{v}</meta>' for k, v in a11y]
    files["OEBPS/content.opf"] = (
        f'<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" '
        f'unique-identifier="bookid" xml:lang="{lang}">\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
        + "\n".join(dc + meta) + "\n</metadata>\n<manifest>\n" + "\n".join(manifest)
        + '\n</manifest>\n<spine toc="ncx">\n' + "\n".join(spine) + "\n</spine>\n</package>\n").encode("utf-8")
    container = ('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" '
                 'xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>'
                 '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
                 "</rootfiles></container>\n")

    # 5. The file: mimetype first and uncompressed, then the rest.
    tmp = out.with_name(out.name + ".part")
    with zipfile.ZipFile(tmp, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
        for fname, data in files.items():
            z.writestr(fname, data, compress_type=zipfile.ZIP_DEFLATED)
    os.replace(tmp, out)

    amount = f"{cjk:,} characters" if cjk > words else f"{words:,} words"
    print(f"Made {out} ({out.stat().st_size / 1024:,.0f} KB): {len(docs)} chapter files, about {amount}, "
          f"{len(image_files)} picture(s){', a cover' if a.cover else ', no cover'}.")
    print("Contents:")
    for lv, text, _ in toc[:60]:
        print("  " * lv + text)
    if len(toc) > 60:
        print(f"  ... and {len(toc) - 60} more")
    if missing_alt:
        warn(f"{missing_alt} picture(s) have no description (alt text): add one to each for readers who cannot see it.")
    if not a.cover:
        warn("No cover: stores need one (--cover).")
    if not a.author:
        warn("No author given (--author).")
    for w in warnings:
        print("Note: " + w)
    print("Next: check it with check_epub.py.")


if __name__ == "__main__":
    main()
