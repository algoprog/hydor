# Inside an EPUB

Open this when a check fails, EPUBCheck reports a code, or a book has to be edited by hand.

## The parts

```text
book.epub                      a zip file
├── mimetype                   says "application/epub+zip": first in the zip, not compressed
├── META-INF/container.xml     says where the package file is
└── OEBPS/
    ├── content.opf            the package: metadata, manifest (every file), spine (reading order)
    ├── nav.xhtml              the contents (EPUB 3): <nav epub:type="toc"> with a list of links
    ├── toc.ncx                the old contents file (EPUB 2), kept for old readers
    ├── Text/chapter-001.xhtml the pages, in XHTML
    ├── Styles/book.css
    └── Images/cover.jpg       marked properties="cover-image" in the manifest
```

The rules that break books when they are not kept:

- Every file the book uses is in the manifest, with the right media type (`application/xhtml+xml`
  for pages, `image/jpeg`, `text/css`...). The spine lists pages by their manifest id, each once.
- Pages are XHTML, so well-formed XML: every tag closed (`<br/>`, `<img .../>`, `</p>`), `&amp;` for
  &, the character itself instead of an HTML name (a no-break space, not `&nbsp;`; `—`, not
  `&mdash;`), and `xmlns="http://www.w3.org/1999/xhtml"` on `<html>`.
- EPUB 3 needs an identifier (the one the package's `unique-identifier` names), a title, a language,
  one `dcterms:modified` date (`2026-11-04T10:00:00Z`) and exactly one nav item.
- Links lead to pages in the spine, and each `#id` they name exists in that page. Nothing comes from
  the web: pictures, fonts and styles are files in the book.
- File names: letters, digits and dashes. Spaces work but older readers trip on them.

## EPUBCheck's messages

Each line names the file, the line and column, and a code.

| Code | What it means | What to do |
| --- | --- | --- |
| PKG-006 | mimetype missing, or not the first file | `check_epub.py book.epub --fix new.epub` |
| PKG-007 | mimetype does not say exactly `application/epub+zip` | `--fix` |
| PKG-010 (warning) | a file name has spaces | rename it and every reference, or rebuild |
| RSC-001 | the manifest lists a file that is not in the book | put the file back, or `--fix` drops the entry |
| RSC-005 | the XML breaks a rule: an element not allowed there (`font`, `center`; `figure` in EPUB 2), a missing `dc:language`, no `dcterms:modified`, no nav | read the message; `--fix` repairs metadata and nav; for a wrong element, edit the page (a `span` with a class instead of `font`) or rebuild |
| RSC-007 | a page uses a file that is not in the book | add the file, or remove the reference |
| RSC-008 | a page uses a file that is not in the manifest | `--fix` lists it |
| RSC-011 | a link leads to a page outside the reading order | add the page to the spine, or remove the link |
| RSC-012 | a link's `#id` does not exist in that page | correct the link, or add the id |
| RSC-016 (fatal) | the page is not well-formed XML: an unclosed tag, `&nbsp;` | `--fix` |
| OPF-014 | a page holds inline SVG (or a script, or something from the web) and its manifest item does not say so | add `properties="svg"` (or `scripted`, `remote-resources`) to that item |
| OPF-049 | the spine names an id the manifest lacks | `--fix` |
| HTM-004 (EPUB 2) | a page's DOCTYPE is not XHTML 1.1 | rebuild the book as EPUB 3 |

EPUBCheck does not complain about a picture without alt text, or a file nobody uses that is missing
from the manifest; `check_epub.py` warns about both.

## Editing by hand

1. Unpack it into a new folder: `python3 -m zipfile -e book.epub work/`.
2. Change the pages with the plugin's Python. BeautifulSoup in XML mode keeps a page valid:

   ```python
   from pathlib import Path
   from bs4 import BeautifulSoup

   page = Path("work/OEBPS/Text/chapter-002.xhtml")
   soup = BeautifulSoup(page.read_bytes(), "xml")
   for img in soup.find_all("img"):
       if not img.get("alt"):
           img["alt"] = "A hand-drawn map of the harbour"   # say what the picture shows
   page.write_text(str(soup), encoding="utf-8")
   ```

3. Pack and check: `check_epub.py work/ --fix book-v2.epub`. It writes the mimetype first and
   uncompressed, sets a new `dcterms:modified`, lists any file you added, and checks the result.
   Never zip the folder with the system's zip tool or the file manager's Compress: the mimetype
   comes out compressed or in the wrong place.

- Title, author, description: edit `<dc:title>`, `<dc:creator>`, `<dc:description>` in
  `content.opf`. Keep `<dc:identifier>` unless this is a new edition.
- A new page: the file in `Text/`, an `<item>` in the manifest, an `<itemref>` in the spine at its
  place, and a link in `nav.xhtml` (and `toc.ncx`). Rebuilding with `make_epub.py` is usually simpler.

## Fixed layout

`make_epub.py` makes flowing (reflowable) books: the text rewraps to the screen and the reader chooses
the size. Picture books, comics and heavily designed books use fixed layout, one picture-like page per
screen. `read_epub.py` says which a book is. To make a fixed-layout book, use a tool built for it, such
as Apple Pages (File, Export To, EPUB, Fixed layout) or Amazon's Kindle Create, then check it here.
