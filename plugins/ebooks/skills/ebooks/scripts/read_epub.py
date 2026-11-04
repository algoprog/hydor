#!/usr/bin/env python3
"""Read an EPUB: its details (title, author, language...), its contents, its reading order, and its text.

    python read_epub.py book.epub                      details, contents and reading order
    python read_epub.py book.epub --markdown book.md   the whole text as one Markdown file (pictures beside it)
    python read_epub.py book.epub --markdown pages/    one Markdown file per page, in reading order
    python read_epub.py book.epub --json               the details as JSON

The Markdown keeps headings, paragraphs, emphasis, lists, quotes, tables, web links and pictures, so
make_epub.py can build a clean book from it again. Books locked with DRM are not read.

Needs lxml (the Ebooks plugin's own Python has it).
"""

import argparse
import json
import posixpath
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

try:
    from lxml import etree
    from lxml import html as lhtml
except ImportError:
    sys.exit("Missing the Python package lxml: run this with the Ebooks plugin's Python.")

OPF, DC, XHTML, NCX = ("http://www.idpf.org/2007/opf", "http://purl.org/dc/elements/1.1/",
                       "http://www.w3.org/1999/xhtml", "http://www.daisy.org/z3986/2005/ncx/")
OPS_TYPE = "{http://www.idpf.org/2007/ops}type"
PARSER = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
SKIP = {"head", "script", "style", "nav", "template", "noscript", "button", "input", "select", "textarea"}
BLOCK = {"p", "div", "section", "article", "aside", "header", "footer", "main", "body", "blockquote", "ul", "ol",
         "li", "dl", "dt", "dd", "table", "pre", "figure", "figcaption", "hr", "address", "h1", "h2", "h3", "h4",
         "h5", "h6", "center", "details", "summary"}
CJK = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]")


def q(ns, tag):
    return f"{{{ns}}}{tag}"


def local(el):
    t = el.tag
    return t.rsplit("}", 1)[-1].split(":")[-1].lower() if isinstance(t, str) else ""


def etype(el):
    return (el.get(OPS_TYPE) or el.get("epub:type") or "").split()


class Book:
    def __init__(self, path):
        try:
            z = zipfile.ZipFile(path)
        except zipfile.BadZipFile:
            sys.exit(f"{path.name} is not an EPUB (an EPUB is a zip file). check_epub.py says more.")
        infos = [i for i in z.infolist() if not i.is_dir()]
        if sum(i.file_size for i in infos) > 2 * 1024 ** 3:
            sys.exit("This book is over 2 GB unpacked: too big to read here.")
        self.z, self.names = z, {i.filename for i in infos}
        try:
            rf = etree.fromstring(z.read("META-INF/container.xml"), PARSER).find(
                ".//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile")
            self.opf = rf.get("full-path")
            self.pkg = etree.fromstring(z.read(self.opf), PARSER)
        except (KeyError, AttributeError, etree.XMLSyntaxError):
            sys.exit("Cannot find or read the book's package file: run check_epub.py on it.")
        self.base = posixpath.dirname(self.opf)
        self.items = {it.get("id"): it for it in self.pkg.iter(q(OPF, "item"))}
        algs = set()
        if "META-INF/encryption.xml" in self.names:  # fonts may be "obfuscated"; anything else is DRM
            try:
                enc = etree.fromstring(z.read("META-INF/encryption.xml"), PARSER)
                algs = {m.get("Algorithm") for m in enc.iter("{http://www.w3.org/2001/04/xmlenc#}EncryptionMethod")}
            except etree.XMLSyntaxError:
                algs = {"unknown"}
        self.locked = bool(algs - {"http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"}) or any(
            n in self.names for n in ("META-INF/rights.xml", "META-INF/sinf.xml", "META-INF/license.lcpl"))

    def path(self, href, at=None):
        return posixpath.normpath(posixpath.join(self.base if at is None else at, unquote(urlsplit(href).path)))

    def read(self, name):
        return self.z.read(name) if name in self.names else None

    def page(self, name):
        """A page's root element, as XML when it is well-formed, else as HTML."""
        data = self.read(name)
        if data is None:
            return None
        try:
            return etree.fromstring(data, PARSER)
        except etree.XMLSyntaxError:
            return lhtml.document_fromstring(re.sub(r"^\s*<\?xml[^>]*\?>", "", data.decode("utf-8", "replace")))


def body_of(root):
    for el in root.iter():
        if local(el) == "body":
            return el
    return root


def text_size(text):
    cjk = len(CJK.findall(text))
    words = len(CJK.sub(" ", text).split())
    return words, cjk


def details(b):
    md = b.pkg.find(q(OPF, "metadata"))
    md = md if md is not None else etree.Element("x")
    dc = lambda tag: [" ".join("".join(e.itertext()).split()) for e in md.iter(q(DC, tag)) if "".join(e.itertext()).strip()]
    metas = list(md.iter(q(OPF, "meta")))
    prop = lambda p: [(m.text or "").strip() for m in metas if m.get("property") == p]
    named = lambda n: [m.get("content") for m in metas if m.get("name") == n]
    desc = " ".join(lhtml.fromstring("<div>" + "\n".join(dc("description")) + "</div>").text_content().split()) \
        if dc("description") else ""
    cover = next((i for i in b.items.values() if "cover-image" in (i.get("properties") or "").split()), None)
    if cover is None:
        cover = b.items.get((named("cover") or [None])[0])
    layout = "fixed layout" if "pre-paginated" in prop("rendition:layout") else "reflowable"
    series = (named("calibre:series") or prop("belongs-to-collection") or [None])[0]
    return {
        "title": " / ".join(dc("title")), "authors": dc("creator"), "contributors": dc("contributor"),
        "language": dc("language"), "identifiers": dc("identifier"), "publisher": dc("publisher"),
        "date": dc("date"), "subjects": dc("subject"), "rights": dc("rights"), "series": series,
        "description": desc, "epub_version": b.pkg.get("version"), "layout": layout,
        "cover": b.path(cover.get("href")) if cover is not None else None, "locked_with_drm": b.locked,
    }


def contents(b):
    """The table of contents: from the EPUB 3 contents page, else from toc.ncx."""
    nav = next((i for i in b.items.values() if "nav" in (i.get("properties") or "").split()), None)
    if nav is not None and (root := b.page(b.path(nav.get("href")))) is not None:
        here = posixpath.dirname(b.path(nav.get("href")))
        toc = next((n for n in root.iter() if local(n) == "nav" and "toc" in etype(n)), None)

        def walk_ol(ol, lv):
            out = []
            for li in (c for c in ol if local(c) == "li"):
                a = next((c for c in li if local(c) in ("a", "span")), None)
                if a is not None:
                    href = a.get("href")
                    out.append({"level": lv, "title": " ".join("".join(a.itertext()).split()),
                                "href": b.path(href, here) if href else None})
                for sub in (c for c in li if local(c) == "ol"):
                    out += walk_ol(sub, lv + 1)
            return out
        if toc is not None:
            ol = next((c for c in toc.iter() if local(c) == "ol"), None)
            if ol is not None:
                return walk_ol(ol, 1)
    ncx = next((i for i in b.items.values() if i.get("media-type") == "application/x-dtbncx+xml"), None)
    if ncx is None or b.read(b.path(ncx.get("href"))) is None:
        return []
    here = posixpath.dirname(b.path(ncx.get("href")))

    def walk_np(parent, lv):
        out = []
        for np_ in parent.findall(q(NCX, "navPoint")):
            label = np_.find(q(NCX, "navLabel"))
            src = np_.find(q(NCX, "content"))
            out.append({"level": lv, "title": " ".join("".join(label.itertext()).split()) if label is not None else "",
                        "href": b.path(src.get("src"), here) if src is not None else None})
            out += walk_np(np_, lv + 1)
        return out
    try:
        nav_map = etree.fromstring(b.read(b.path(ncx.get("href"))), PARSER).find(q(NCX, "navMap"))
        return walk_np(nav_map, 1) if nav_map is not None else []
    except etree.XMLSyntaxError:
        return []


def reading_order(b):
    out = []
    spine = b.pkg.find(q(OPF, "spine"))
    for ref in (spine.iter(q(OPF, "itemref")) if spine is not None else []):
        it = b.items.get(ref.get("idref"))
        if it is None:
            continue
        name = b.path(it.get("href"))
        words = cjk = 0
        if not b.locked and it.get("media-type") == "application/xhtml+xml" and (root := b.page(name)) is not None:
            words, cjk = text_size(" ".join(body_of(root).itertext()))
        out.append({"page": name, "linear": ref.get("linear", "yes") != "no", "words": words, "cjk_characters": cjk,
                    "is_contents_page": "nav" in (it.get("properties") or "").split()})
    return out


# ---- the text as Markdown ----------------------------------------------------------------------------

def esc(text):
    return re.sub(r"([\\`*_])", r"\\\1", text)


class Markdown:
    def __init__(self, book, page, images):
        self.b, self.page, self.images, self.here = book, page, images, posixpath.dirname(page)

    def inline(self, el, pre=False):
        parts = [self.text(el.text, pre)]
        for c in el:
            parts.append(self.inline_el(c, pre))
            parts.append(self.text(c.tail, pre))
        return "".join(parts)

    def text(self, t, pre=False):
        if not t:
            return ""
        return t if pre else esc(re.sub(r"\s+", " ", t))

    def inline_el(self, c, pre=False):
        tag = local(c)
        if not tag or tag in SKIP:
            return ""
        if tag in BLOCK and not pre:
            return "\n\n" + "\n\n".join(self.blocks(c)) + "\n\n"
        if tag == "br":
            return "\n" if pre else "  \n"
        if tag == "img" or tag == "image":
            return self.image(c)
        s = self.inline(c, pre)
        if pre:
            return s
        if tag in ("em", "i", "cite", "var", "dfn") and s.strip():
            return f"*{s.strip()}*" + (" " if s.endswith(" ") else "")
        if tag in ("strong", "b") and s.strip():
            return f"**{s.strip()}**" + (" " if s.endswith(" ") else "")
        if tag in ("code", "kbd", "samp"):
            return f"`{''.join(c.itertext())}`"
        if tag == "a":
            href = (c.get("href") or "").strip()
            if urlsplit(href).scheme in ("http", "https", "mailto") and s.strip():
                return f"[{s.strip()}]({href})"
            if "noteref" in etype(c):
                return f"[{s.strip()}]"
        return s

    def image(self, c):
        src = c.get("src") or c.get("{http://www.w3.org/1999/xlink}href") or c.get("xlink:href") or ""
        if urlsplit(src).scheme:
            return ""
        name = self.b.path(src, self.here)
        data = self.b.read(name)
        if data is None:
            return ""
        if name not in self.images:
            stem, ext = posixpath.splitext(posixpath.basename(name))
            fname, k = stem + ext, 2
            while fname in self.images.values():
                fname, k = f"{stem}-{k}{ext}", k + 1
            self.images[name] = fname
        alt = (c.get("alt") or "").replace("[", "(").replace("]", ")")
        return f"![{alt}](images/{self.images[name]})"

    def blocks(self, el):
        out, buf = [], []

        def flush():
            s = re.sub(r"[ \t]*\n[ \t]*", "\n", "".join(buf)).strip(" \t")
            s = re.sub(r"\n{3,}", "\n\n", s).strip("\n")
            if s.strip():
                out.append(re.sub(r"^(#{1,6}\s|>|[-+]\s)", r"\\\1", s))
            buf.clear()
        buf.append(self.text(el.text))
        for c in el:
            tag = local(c)
            if tag in BLOCK:
                flush()
                out.extend(self.block(c, tag))
            elif tag and tag not in SKIP:
                buf.append(self.inline_el(c))
            buf.append(self.text(c.tail))
        flush()
        return out

    def block(self, c, tag):
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            s = " ".join(self.inline(c).split())
            return [f"{'#' * int(tag[1])} {s}"] if s else []
        if tag == "hr":
            return ["* * *"]
        if tag == "pre":
            return ["```\n" + self.inline(c, pre=True).strip("\n") + "\n```"]
        if tag == "blockquote":
            inner = "\n\n".join(self.blocks(c))
            return ["\n".join(("> " + ln) if ln else ">" for ln in inner.splitlines())] if inner else []
        if tag in ("ul", "ol"):
            lines, n = [], int(c.get("start") or 1) if (c.get("start") or "").isdigit() else 1
            for li in (x for x in c if local(x) == "li"):
                marker = f"{n}. " if tag == "ol" else "- "
                n += 1
                body = "\n\n".join(self.blocks(li)) or ""
                first, *rest = body.splitlines() or [""]
                lines.append(marker + first)
                lines += [("    " + ln) if ln else "" for ln in rest]
            return ["\n".join(lines)] if lines else []
        if tag == "table":
            rows = [r for r in c.iter() if local(r) == "tr"]
            grid = [[" ".join(self.inline(cell).split()).replace("|", "\\|") for cell in r if local(cell) in ("td", "th")]
                    for r in rows]
            grid = [g for g in grid if g]
            if not grid:
                return []
            width = max(len(g) for g in grid)
            grid = [g + [""] * (width - len(g)) for g in grid]
            lines = ["| " + " | ".join(grid[0]) + " |", "|" + " --- |" * width]
            lines += ["| " + " | ".join(g) + " |" for g in grid[1:]]
            return ["\n".join(lines)]
        if tag == "figcaption":
            s = " ".join(self.inline(c).split())
            return [f"*{s}*"] if s else []
        if tag in ("dt",):
            s = " ".join(self.inline(c).split())
            return [f"**{s}**"] if s else []
        return self.blocks(c)


def page_markdown(b, page, images):
    root = b.page(page)
    if root is None:
        return ""
    return "\n\n".join(Markdown(b, page, images).blocks(body_of(root))).strip() + "\n"


def slug(text):
    s = re.sub(r"[^\w]+", "-", text.lower()).strip("-")
    return s[:40] or "page"


def main():
    ap = argparse.ArgumentParser(description="Read an EPUB: details, contents, reading order, text as Markdown.")
    ap.add_argument("book", type=Path)
    ap.add_argument("--markdown", metavar="OUT", help="write the text: OUT.md for one file, or a folder/ for one file per page")
    ap.add_argument("--json", action="store_true", help="print the details as JSON")
    a = ap.parse_args()
    b = Book(a.book)
    info = details(b)
    info["contents"] = contents(b)
    info["reading_order"] = order = reading_order(b)
    words = sum(p["words"] for p in order)
    cjk = sum(p["cjk_characters"] for p in order)
    pictures = [n for i in b.items.values() if (i.get("media-type") or "").startswith("image/")
                for n in [b.path(i.get("href"))]]
    if a.json:
        print(json.dumps(info, ensure_ascii=False, indent=1))
    elif not a.markdown:
        size = a.book.stat().st_size
        print(f"Title:       {info['title'] or '(none)'}")
        print(f"Author:      {', '.join(info['authors']) or '(none)'}")
        for key, label in (("contributors", "Contributor"), ("language", "Language"), ("identifiers", "Identifier"),
                           ("publisher", "Publisher"), ("date", "Date"), ("subjects", "Subjects"), ("rights", "Rights")):
            if info[key]:
                print(f"{label + ':':12} {', '.join(info[key])}")
        if info["series"]:
            print(f"Series:      {info['series']}")
        if info["description"]:
            d = info["description"]
            print(f"Description: {d[:400]}{'...' if len(d) > 400 else ''}")
        shown = f"{size / 1024 / 1024:.1f} MB" if size >= 1024 * 1024 else f"{size / 1024:.0f} KB"
        print(f"Format:      EPUB {info['epub_version']}, {info['layout']}, {shown}, "
              f"{len(b.names)} files, {len(pictures)} picture(s), cover: {info['cover'] or 'none marked'}")
        if cjk > words:
            print(f"Length:      about {cjk:,} characters")
        else:
            minutes = words / 250
            took = f"{minutes:.0f} minutes" if minutes < 90 else f"{minutes / 60:.1f} hours"
            print(f"Length:      about {words:,} words (about {took} at 250 words a minute)")
        if b.locked:
            print("Locked:      yes, with DRM: its text cannot be read here. Open it in the app of the shop it came from.")
        print("\nContents:")
        for e in info["contents"][:200] or [{"level": 1, "title": "(no table of contents)", "href": None}]:
            print("  " * e["level"] + e["title"] + (f"   [{e['href']}]" if e["href"] else ""))
        print(f"\nReading order: {len(order)} pages")
        for i, p in enumerate(order[:200], 1):
            flags = (" (contents page)" if p["is_contents_page"] else "") + ("" if p["linear"] else " (not in the flow)")
            amount = f"{p['cjk_characters']:,} characters" if p["cjk_characters"] > p["words"] else f"{p['words']:,} words"
            print(f"  {i:3}. {p['page']}  {amount}{flags}")
    if a.markdown:
        if b.locked:
            sys.exit("This book is locked with DRM: its text cannot be read here.")
        out = Path(a.markdown)
        per_page = a.markdown.endswith(("/", "\\")) or out.is_dir() or not out.suffix
        folder = out if per_page else out.parent
        folder.mkdir(parents=True, exist_ok=True)
        images, parts, written = {}, [], []
        cover = info["cover"]
        if cover and b.read(cover) is not None:  # saved as images/cover.jpg, for make_epub.py --cover
            images[cover] = "cover" + posixpath.splitext(cover)[1].lower()
        for i, p in enumerate(order, 1):
            if p["is_contents_page"]:
                continue
            md = page_markdown(b, p["page"], images)
            if not md.strip() or (cover and re.fullmatch(r"!\[[^\]]*\]\(images/cover\.\w+\)\s*", md)):
                continue  # empty, or only the cover picture
            if per_page:
                first = next((ln.lstrip("# ") for ln in md.splitlines() if ln.startswith("#")), "")
                f = folder / f"{i:03d}-{slug(first or Path(p['page']).stem)}.md"
                f.write_text(md, encoding="utf-8")
                written.append(f.name)
            else:
                parts.append(md)
        if not per_page:
            out.write_text("\n".join(parts), encoding="utf-8")
            written.append(out.name)
        if images:
            (folder / "images").mkdir(exist_ok=True)
            for name, fname in images.items():
                (folder / "images" / fname).write_bytes(b.read(name))
        print(f"Wrote {len(written)} Markdown file(s) to {folder}" + (f" and {len(images)} picture(s) to {folder / 'images'}"
                                                                     if images else "") + ".")
        if cover and cover in images:
            print(f"The cover picture is {folder / 'images' / images[cover]}.")
        if per_page:
            print("Files: " + ", ".join(written[:12]) + (" ..." if len(written) > 12 else ""))


if __name__ == "__main__":
    main()
