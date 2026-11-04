#!/usr/bin/env python3
"""Check an EPUB for the problems that stop it opening, or a store accepting it, and repair the common ones.

    python check_epub.py book.epub                    check it (and run EPUBCheck when it is installed)
    python check_epub.py book.epub --fix fixed.epub   write a repaired copy, then check the copy
    python check_epub.py folder/ --fix book.epub      pack an unpacked, edited book into an EPUB

Prints each problem in plain words: ERROR (readers or stores may refuse the book), WARN (should be
fixed), NOTE. The exit code is 1 when there are errors. The file being checked is never changed.

Needs lxml (the Ebooks plugin's own Python has it).
"""

import argparse
import datetime
import html.entities
import os
import posixpath
import re
import shutil
import struct
import subprocess
import sys
import uuid
import zipfile
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

try:
    from lxml import etree
    from lxml import html as lhtml
except ImportError:
    sys.exit("Missing the Python package lxml: run this with the Ebooks plugin's Python.")

OPF, DC, XHTML = "http://www.idpf.org/2007/opf", "http://purl.org/dc/elements/1.1/", "http://www.w3.org/1999/xhtml"
CONTAINER, NCX, ENC = "urn:oasis:names:tc:opendocument:xmlns:container", "http://www.daisy.org/z3986/2005/ncx/", \
    "http://www.w3.org/2001/04/xmlenc#"
XHTML_TYPE, NCX_TYPE = "application/xhtml+xml", "application/x-dtbncx+xml"
TYPES = {".xhtml": XHTML_TYPE, ".html": XHTML_TYPE, ".htm": XHTML_TYPE, ".css": "text/css", ".jpg": "image/jpeg",
         ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml",
         ".webp": "image/webp", ".ncx": NCX_TYPE, ".otf": "font/otf", ".ttf": "font/ttf", ".woff": "font/woff",
         ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "video/mp4",
         ".js": "application/javascript", ".smil": "application/smil+xml", ".xml": "application/xml"}
FONT_OBFUSCATION = {"http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"}
XML_ENTITIES = {"amp", "lt", "gt", "quot", "apos"}
PARSER = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)


class Report:
    def __init__(self):
        self.items = []

    def add(self, level, where, msg, fix=False):
        self.items.append((level, where, msg + (" [--fix repairs this]" if fix else "")))

    def count(self, level):
        return sum(1 for i in self.items if i[0] == level)


def q(ns, tag):
    return f"{{{ns}}}{tag}"


def read_book(path, report):
    """The book's files by their path inside it, in order."""
    files = {}
    if path.is_dir():
        for p in sorted(path.rglob("*")):
            if p.is_file() and p.name != ".DS_Store":
                files[p.relative_to(path).as_posix()] = p.read_bytes()
        return files
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        report.add("ERROR", path.name, "This is not an EPUB: an EPUB is a zip file, and this one cannot be opened as one.")
        return None
    infos = [i for i in z.infolist() if not i.is_dir()]
    if sum(i.file_size for i in infos) > 2 * 1024 ** 3 or len(infos) > 20000:
        report.add("ERROR", path.name, "Too big to check here (over 2 GB unpacked, or over 20,000 files).")
        return None
    if not infos or infos[0].filename != "mimetype":
        report.add("ERROR", "mimetype", "The file named mimetype must come first in the zip.", True)
    elif infos[0].compress_type != zipfile.ZIP_STORED or infos[0].extra:
        report.add("ERROR", "mimetype", "The mimetype file must be stored uncompressed, with no extra fields.", True)
    for i in infos:
        name = i.filename
        if name.startswith("/") or "\\" in name or ".." in name.split("/"):
            report.add("ERROR", name, "An unsafe file name in the zip: left out.", True)
            continue
        files[name] = z.read(i)
    return files


def locked(files):
    if any(n in files for n in ("META-INF/rights.xml", "META-INF/sinf.xml", "META-INF/license.lcpl")):
        return True
    enc = files.get("META-INF/encryption.xml")
    if not enc:
        return False
    try:
        algs = {m.get("Algorithm") for m in etree.fromstring(enc, PARSER).iter(q(ENC, "EncryptionMethod"))}
    except etree.XMLSyntaxError:
        return True
    return bool(algs - FONT_OBFUSCATION)


def image_size(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker, length = data[i + 1], struct.unpack(">H", data[i + 2:i + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            i += 2 + length
    return None


def fix_entities(text):
    """HTML names such as &nbsp; are not XML: write the characters themselves."""
    def one(m):
        name = m.group(1)
        if name in XML_ENTITIES:
            return m.group(0)
        return html.entities.html5.get(name + ";", m.group(0))
    return re.sub(r"&([A-Za-z][A-Za-z0-9]*);", one, text)


def rebuild_xhtml(data, lang, epub3=True):
    """Turn a page that is not well-formed (HTML habits) into well-formed XHTML, keeping its text and links."""
    text = re.sub(r"^\s*<\?xml[^>]*\?>", "", data.decode("utf-8", errors="replace"))
    doc = lhtml.document_fromstring(text)
    title = doc.findtext(".//title") or ""
    head = [etree.tostring(el, method="xml", encoding="unicode", with_tail=False)
            for el in doc.iter("link", "style") if el.tag == "style" or (el.get("rel") or "").lower() == "stylesheet"]
    body = doc.body
    battrs = "".join(f' {k}="{v.replace("&", "&amp;").replace(chr(34), "&quot;").replace("<", "&lt;")}"'
                     for k, v in body.attrib.items() if k in ("class", "id") or (epub3 and k == "epub:type"))
    inner = (body.text or "").replace("&", "&amp;").replace("<", "&lt;") + "".join(
        etree.tostring(el, method="xml", encoding="unicode") for el in body)
    lang_attr = (f' xml:lang="{lang}"' + (f' lang="{lang}"' if epub3 else "")) if lang else ""
    doctype = "<!DOCTYPE html>" if epub3 else ('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" '
                                              '"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">')
    epub_ns = ' xmlns:epub="http://www.idpf.org/2007/ops"' if epub3 else ""
    out = (f'<?xml version="1.0" encoding="utf-8"?>\n{doctype}\n<html xmlns="{XHTML}"'
           f'{epub_ns}{lang_attr}>\n<head>\n<title>{title.replace("&", "&amp;").replace("<", "&lt;")}</title>\n'
           + "\n".join(head) + f"\n</head>\n<body{battrs}>\n{inner}\n</body>\n</html>\n")
    etree.fromstring(out.encode("utf-8"), PARSER)
    return out.encode("utf-8")


def check(files, report, fix=None):
    """Check the files (and repair them in place when fix is a dict of options). Returns the EPUB version."""
    if locked(files):
        report.add("ERROR", "META-INF", "This book is locked with DRM by the shop it came from. It cannot be read or "
                   "changed here: open it in that shop's app. Removing DRM is not something to do.")
        return None
    mt = files.get("mimetype")
    if mt is None or mt.strip() != b"application/epub+zip":
        report.add("ERROR", "mimetype", "The mimetype file is missing or does not say application/epub+zip.", True)
    # The container points to the package file (the OPF).
    opf_path = None
    try:
        rf = etree.fromstring(files["META-INF/container.xml"], PARSER).find(f".//{q(CONTAINER, 'rootfile')}")
        opf_path = rf.get("full-path") if rf is not None else None
    except (KeyError, etree.XMLSyntaxError):
        pass
    if opf_path not in files:
        opfs = [n for n in files if n.endswith(".opf")]
        report.add("ERROR", "META-INF/container.xml", "Missing, broken, or not pointing to the package file (.opf).",
                   len(opfs) == 1)
        if fix is not None and len(opfs) == 1:
            opf_path = opfs[0]
            files["META-INF/container.xml"] = (
                f'<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="{CONTAINER}"><rootfiles>'
                f'<rootfile full-path="{opf_path}" media-type="application/oebps-package+xml"/></rootfiles></container>\n'
            ).encode()
        else:
            return None
    try:
        pkg = etree.fromstring(files[opf_path], PARSER)
    except etree.XMLSyntaxError as e:
        report.add("ERROR", opf_path, f"The package file is not well-formed XML ({e}). Rebuild the book from its text.")
        return None
    version = (pkg.get("version") or "?").strip()
    epub3 = version.startswith("3")
    base = posixpath.dirname(opf_path)
    full = lambda href, at=base: posixpath.normpath(posixpath.join(at, unquote(urlsplit(href).path)))
    md = pkg.find(q(OPF, "metadata"))
    manifest = pkg.find(q(OPF, "manifest"))
    spine = pkg.find(q(OPF, "spine"))
    if md is None or manifest is None or spine is None:
        report.add("ERROR", opf_path, "The package file lacks its metadata, manifest or spine. Rebuild the book from its text.")
        return version

    # Metadata
    def text_of(tag):
        el = md.find(q(DC, tag))
        return (el.text or "").strip() if el is not None else ""

    uid = pkg.get("unique-identifier")
    ident = next((el for el in md.iter(q(DC, "identifier")) if el.get("id") == uid and (el.text or "").strip()), None)
    if ident is None:
        report.add("ERROR", opf_path, "No identifier that the package's unique-identifier points to.", True)
        if fix is not None:
            ident = etree.SubElement(md, q(DC, "identifier"), id=uid or "bookid")
            ident.text = "urn:uuid:" + str(uuid.uuid4())
            pkg.set("unique-identifier", ident.get("id"))
    if not text_of("title"):
        report.add("ERROR", opf_path, "The book has no title.", True)
        if fix is not None:
            el = md.find(q(DC, "title"))
            el = el if el is not None else etree.SubElement(md, q(DC, "title"))
            el.text = fix["title"]
    lang = text_of("language")
    if not lang:
        report.add("ERROR", opf_path, "The book's language is not set.", True)
        if fix is not None:
            el = md.find(q(DC, "language"))
            el = el if el is not None else etree.SubElement(md, q(DC, "language"))
            el.text = lang = fix["language"]
    if not text_of("creator"):
        report.add("WARN", opf_path, "No author (dc:creator).")
    mods = [m for m in md.iter(q(OPF, "meta")) if m.get("property") == "dcterms:modified"]
    if epub3 and (len(mods) != 1 or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", (mods[0].text or "").strip())):
        report.add("ERROR", opf_path, "EPUB 3 needs one 'last modified' date (dcterms:modified) like 2026-11-04T10:00:00Z.", True)
    if fix is not None and epub3:  # a changed book gets a new modified date
        for m in mods[1:]:
            md.remove(m)
        m = mods[0] if mods else etree.SubElement(md, q(OPF, "meta"), property="dcterms:modified")
        m.text = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Manifest
    items, by_path = {}, {}
    for it in list(manifest.iter(q(OPF, "item"))):
        iid, href, mtype = it.get("id"), it.get("href") or "", it.get("media-type") or ""
        if not iid or iid in items:
            report.add("ERROR", opf_path, f"A manifest item has no id, or a repeated one ({iid}).")
            continue
        if urlsplit(href).scheme:
            report.add("WARN", opf_path, f"{href} is on the web: most readers will not fetch it.")
            items[iid] = it
            continue
        path = full(href)
        if path not in files:
            report.add("ERROR", opf_path, f"The manifest lists {href}, which is not in the book.", True)
            if fix is not None:
                manifest.remove(it)
            else:
                items[iid] = it
            continue
        want = TYPES.get(posixpath.splitext(path)[1].lower())
        if want and mtype != want and (want.startswith(("image/", "text/")) or want in (XHTML_TYPE, NCX_TYPE)):
            report.add("ERROR", opf_path, f"{href} is listed as {mtype or 'no type'}; it should be {want}.", True)
            if fix is not None:
                it.set("media-type", want)
        items[iid] = it
        by_path[path] = it
    listed = set(by_path) | {opf_path}
    unlisted = [n for n in files if n not in listed and n != "mimetype" and not n.startswith("META-INF/")]
    if unlisted:
        report.add("WARN", opf_path, f"{len(unlisted)} file(s) in the book are not in the manifest: {', '.join(unlisted[:5])}", True)
        if fix is not None:
            has_nav = any("nav" in (i.get("properties") or "").split() for i in items.values())
            for k, n in enumerate(unlisted, 1):
                it = etree.SubElement(manifest, q(OPF, "item"), id=f"added-{k}", href=quote(posixpath.relpath(n, base or ".")),
                                      **{"media-type": TYPES.get(posixpath.splitext(n)[1].lower(), "application/octet-stream")})
                if epub3 and not has_nav and it.get("media-type") == XHTML_TYPE and b'epub:type="toc"' in files[n]:
                    it.set("properties", "nav")  # the contents page, left out of the manifest
                    has_nav = True
                items[it.get("id")] = by_path[n] = it

    # Spine
    seen, in_spine = set(), set()
    for ref in list(spine.iter(q(OPF, "itemref"))):
        idref = ref.get("idref")
        it = items.get(idref)
        if it is None or idref in seen:
            report.add("ERROR", opf_path, f"The reading order (spine) names {idref!r} " +
                       ("twice." if idref in seen else "which is not in the manifest."), True)
            if fix is not None:
                spine.remove(ref)
            continue
        seen.add(idref)
        if not urlsplit(it.get("href") or "").scheme:
            in_spine.add(full(it.get("href")))
        if it.get("media-type") not in (XHTML_TYPE, "image/svg+xml") and not it.get("fallback"):
            report.add("ERROR", opf_path, f"{it.get('href')} is in the reading order but is not an XHTML page.")
    if not seen:
        report.add("ERROR", opf_path, "The reading order (spine) is empty.")
    ncx_item = next((i for i in items.values() if i.get("media-type") == NCX_TYPE), None)
    if not epub3 and ncx_item is None:
        report.add("ERROR", opf_path, "An EPUB 2 book needs a table of contents file (toc.ncx). Rebuild it as EPUB 3.")
    if ncx_item is not None and spine.get("toc") != ncx_item.get("id"):
        report.add("ERROR" if not epub3 else "WARN", opf_path, "The spine does not point to the toc.ncx file.", True)
        if fix is not None:
            spine.set("toc", ncx_item.get("id"))

    # Cover
    cover = next((i for i in items.values() if "cover-image" in (i.get("properties") or "").split()), None)
    if cover is None:
        meta_cover = next((m.get("content") for m in md.iter(q(OPF, "meta")) if m.get("name") == "cover"), None)
        cover = items.get(meta_cover)
    if cover is None:
        report.add("WARN", opf_path, "No cover picture is marked (properties=\"cover-image\"). Stores need a cover.")
    else:
        size = image_size(files.get(full(cover.get("href")), b""))
        if size and min(size) < 1400:
            report.add("WARN", cover.get("href"), f"The cover is {size[0]} x {size[1]} pixels. Apple Books asks for at "
                       "least 1400 on the short side; Kindle recommends 1600 x 2560.")

    # Pages: well-formed, with a language, and with links and pictures that lead somewhere.
    pages = {p: it for p, it in by_path.items() if it.get("media-type") == XHTML_TYPE}
    ids, links, no_alt, opt = {}, [], [], fix or {}
    for path, it in pages.items():
        data = files[path]
        if epub3 and re.search(rb"&(?!(?:amp|lt|gt|quot|apos);)[A-Za-z][A-Za-z0-9]*;", data):
            report.add("ERROR", path, "Uses HTML names for characters (such as &nbsp;), which EPUB 3 does not allow.", True)
            if fix is not None:
                data = files[path] = fix_entities(data.decode("utf-8", errors="replace")).encode("utf-8")
        try:
            root = etree.fromstring(data, PARSER)
            if root.tag != q(XHTML, "html"):
                raise etree.XMLSyntaxError("the page is not in the XHTML namespace", 0, 1, 1)
        except etree.XMLSyntaxError as e:
            report.add("ERROR", path, f"Not well-formed XHTML: {str(e)[:160]}", True)
            if fix is None:
                continue
            try:
                data = files[path] = rebuild_xhtml(data, lang or opt.get("language"), epub3)
                root = etree.fromstring(data, PARSER)
            except Exception as e2:  # noqa: BLE001 - say so and go on with the other pages
                report.add("ERROR", path, f"Could not be repaired automatically ({str(e2)[:100]}): edit it by hand.")
                continue
        if not (root.get("{http://www.w3.org/XML/1998/namespace}lang") or root.get("lang")):
            report.add("WARN", path, "The page does not say its language (lang).", True)
            if fix is not None and (lang or opt.get("language")):
                root.set("{http://www.w3.org/XML/1998/namespace}lang", lang or opt["language"])
                if epub3:  # XHTML 1.1 (EPUB 2) has xml:lang only
                    root.set("lang", lang or opt["language"])
                files[path] = etree.tostring(root.getroottree(), xml_declaration=True, encoding="utf-8")
        ids[path] = {el.get("id") for el in root.iter() if el.get("id")}
        here = posixpath.dirname(path)
        for el in root.iter():
            if not isinstance(el.tag, str):
                continue
            tag = etree.QName(el).localname
            for attr in ("href", "src", "{http://www.w3.org/1999/xlink}href"):
                ref = el.get(attr)
                if ref is None or tag in ("html",):
                    continue
                u = urlsplit(ref.strip())
                if u.scheme:
                    if tag in ("img", "image", "link", "script", "audio", "video", "source") and u.scheme in ("http", "https"):
                        report.add("ERROR", path, f"Uses {ref[:80]} from the web: put the file in the book instead.")
                    continue
                target = full(ref, here) if u.path else path
                if u.path and target not in files:
                    report.add("ERROR", path, f"Points to {ref}, which is not in the book.")
                elif u.path and target not in by_path:
                    report.add("ERROR", path, f"Uses {ref}, which is not in the manifest.")
                elif tag == "a" and u.path and target in pages and target not in in_spine:
                    report.add("ERROR", path, f"Links to {ref}, a page that is not in the reading order (spine).")
                elif tag == "a" and u.fragment:
                    links.append((path, ref, target, unquote(u.fragment)))
            if tag == "img" and el.get("alt") is None:
                no_alt.append(f"{path} ({posixpath.basename(el.get('src') or '?')})")
    for path, ref, target, frag in links:
        if target in ids and frag not in ids[target]:
            report.add("ERROR", path, f"A link to {ref} leads nowhere: there is no id {frag!r} there.")
    if no_alt:
        report.add("WARN", "pictures", f"{len(no_alt)} picture(s) have no description (alt text), which readers who "
                   f"cannot see them need: {', '.join(no_alt[:5])}")

    # Navigation (EPUB 3): a contents page the reader's menu uses.
    navs = [i for i in items.values() if "nav" in (i.get("properties") or "").split()]
    if epub3 and len(navs) != 1:
        report.add("ERROR", opf_path, "EPUB 3 needs exactly one contents page (an item with properties=\"nav\").",
                   not navs)
        if fix is not None and not navs:
            make_nav(files, pkg, items, manifest, base, lang or opt.get("language", "en"), full)
    if fix is not None:
        files[opf_path] = etree.tostring(pkg, xml_declaration=True, encoding="utf-8")
    return version


def make_nav(files, pkg, items, manifest, base, lang, full):
    """A contents page from the old toc.ncx, or else from each page's first heading."""
    entries = []
    ncx = next((i for i in items.values() if i.get("media-type") == NCX_TYPE), None)
    if ncx is not None and full(ncx.get("href")) in files:
        nbase = posixpath.dirname(full(ncx.get("href")))

        def walk(parent):
            out = []
            for np_ in parent.findall(q(NCX, "navPoint")):
                label = " ".join("".join(np_.find(q(NCX, "navLabel")).itertext()).split())
                src = np_.find(q(NCX, "content")).get("src")
                target = posixpath.normpath(posixpath.join(nbase, src))
                out.append((label, posixpath.relpath(target, base or "."), walk(np_)))
            return out
        try:
            entries = walk(etree.fromstring(files[full(ncx.get("href"))], PARSER).find(q(NCX, "navMap")))
        except (etree.XMLSyntaxError, AttributeError):
            entries = []
    if not entries:
        for ref in pkg.find(q(OPF, "spine")).iter(q(OPF, "itemref")):
            it = items.get(ref.get("idref"))
            if it is None or it.get("media-type") != XHTML_TYPE:
                continue
            try:
                root = etree.fromstring(files[full(it.get("href"))], PARSER)
            except (KeyError, etree.XMLSyntaxError):
                continue
            h = next((h for h in root.iter(*(q(XHTML, f"h{n}") for n in range(1, 4)))), None)
            label = " ".join("".join(h.itertext()).split()) if h is not None else ""
            entries.append((label or posixpath.basename(it.get("href")), it.get("href"), []))

    def ol(es):
        def e(s):
            return s.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")
        return "<ol>" + "".join(f'<li><a href="{e(h)}">{e(t)}</a>{ol(k) if k else ""}</li>' for t, h, k in es) + "</ol>"
    name = "nav.xhtml" if posixpath.join(base, "nav.xhtml").lstrip("/") not in files else "contents-nav.xhtml"
    files[posixpath.join(base, name).lstrip("/")] = (
        f'<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="{XHTML}" '
        f'xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}" lang="{lang}">\n<head><title>Contents</title></head>\n'
        f'<body>\n<nav epub:type="toc" id="toc"><h1>Contents</h1>{ol(entries)}</nav>\n</body>\n</html>\n').encode("utf-8")
    etree.SubElement(manifest, q(OPF, "item"), id="nav-added", href=name, properties="nav",
                     **{"media-type": XHTML_TYPE})


def write_epub(files, out):
    tmp = out.with_name(out.name + ".part")
    with zipfile.ZipFile(tmp, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for name, data in files.items():
            if name != "mimetype":
                z.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    os.replace(tmp, out)


def epubcheck(path, jar):
    """Run EPUBCheck when it is installed: the official checker, the one stores use."""
    jar = jar or os.environ.get("EPUBCHECK_JAR")
    if shutil.which("epubcheck"):
        cmd = [shutil.which("epubcheck")]
    elif jar and shutil.which("java") and Path(jar).is_file():
        cmd = [shutil.which("java"), "-jar", jar]
    else:
        return None
    if path.is_dir():
        cmd += ["--mode", "exp"]
    try:
        r = subprocess.run(cmd + [str(path)], capture_output=True, text=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired) as e:
        return [f"EPUBCheck could not run: {e}"], ""
    lines = (r.stdout + "\n" + r.stderr).splitlines()
    return [ln for ln in lines if re.match(r"(FATAL|ERROR|WARNING)\b", ln)], \
        next((ln for ln in lines if ln.startswith("Messages:")), "")


def main():
    ap = argparse.ArgumentParser(description="Check an EPUB, and repair the common problems into a new file.")
    ap.add_argument("book", type=Path, help="an .epub file, or the folder of an unpacked one")
    ap.add_argument("--fix", type=Path, metavar="OUT.epub", help="write a repaired (or packed) copy here, then check it")
    ap.add_argument("--language", help="with --fix: the language to set when the book has none (default en)")
    ap.add_argument("--title", help="with --fix: the title to set when the book has none")
    ap.add_argument("--no-epubcheck", action="store_true", help="skip EPUBCheck even when it is installed")
    ap.add_argument("--epubcheck-jar", help="the path of epubcheck.jar, when there is no epubcheck command")
    a = ap.parse_args()
    src = a.book.resolve()
    if not src.exists():
        sys.exit(f"No such file or folder: {src}")

    report = Report()
    files = read_book(src, report)
    if files is not None and a.fix:
        out = a.fix.resolve()
        if out == src:
            sys.exit("--fix must name a new file: the original stays as it is.")
        opts = {"language": a.language or "en", "title": a.title or src.stem}
        version = check(files, report, opts)
        if version is None:
            for lv, where, msg in report.items:
                print(f"{lv:5}  {where}: {msg}")
            sys.exit("Nothing was written: this book cannot be repaired automatically.")
        print(f"Repaired what could be repaired in {src.name}; wrote {out.name}. Checking it now:\n")
        write_epub(files, out)
        src, report = out, Report()
        files = read_book(src, report)
    version = check(files, report) if files is not None else None

    size = src.stat().st_size if src.is_file() else sum(len(v) for v in (files or {}).values())
    print(f"{src.name}: EPUB {version or '?'}, {len(files or {})} files, {size / 1024:,.0f} KB")
    for level in ("ERROR", "WARN", "NOTE"):
        for lv, where, msg in report.items:
            if lv == level:
                print(f"{lv:5}  {where}: {msg}")
    errors = report.count("ERROR")
    if not a.no_epubcheck and files is not None and version is not None:
        res = epubcheck(src, a.epubcheck_jar)
        if res is None:
            print("EPUBCheck: not installed, so only these checks ran. Stores run EPUBCheck: install it to be sure "
                  "(see the ebooks skill).")
        else:
            msgs, summary = res
            for m in msgs[:40]:
                print("EPUBCheck " + m)
            if len(msgs) > 40:
                print(f"EPUBCheck ... and {len(msgs) - 40} more")
            print("EPUBCheck: " + (summary or "finished"))
            errors += sum(1 for m in msgs if m.startswith(("ERROR", "FATAL")))
    fixable = any("[--fix" in m for _, _, m in report.items)
    print(f"Result: {errors} error(s), {report.count('WARN')} warning(s)."
          + (" Run again with --fix new.epub to repair the ones marked." if fixable and not a.fix else ""))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
