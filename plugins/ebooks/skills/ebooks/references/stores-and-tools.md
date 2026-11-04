# Stores and tools

Open this when a book is going to a store, or to install or use EPUBCheck, pandoc or a previewer.
Stores change their rules: check their current help pages (`web_search`) before quoting a number.

## What the stores take

- **Kindle** (Kindle Direct Publishing): upload the EPUB (a Word file works too; MOBI is no longer
  taken for flowing ebooks). The cover goes up separately as a JPEG, ideally 1600 × 2560 pixels. No
  ISBN is needed. KDP asks whether the book contains AI-generated text, pictures or translations:
  the person answers, so tell them plainly what you wrote.
- **Apple Books**: an EPUB that passes EPUBCheck (Apple runs it on upload); a cover at least 1400
  pixels on its short side. No ISBN is needed.
- **Kobo, Google Play Books, Barnes & Noble**: EPUB. Aggregators (Draft2Digital, PublishDrive and
  others) send one EPUB to many stores for a share of each sale.
- **ISBN**: optional for ebooks in most stores. If the person uses one, the ebook gets its own,
  never the print edition's. Where to get one depends on the country (a national agency; some, such
  as Canada's, are free).
- The store's form, not the file, decides the listing: keep its title, author, series and
  description the same as in the book.
- Size: pictures make books big, and Kindle's 70% royalty option charges a delivery fee per
  megabyte. Keep photos to what the screen needs (about 1600 pixels on the long side).

## Accessibility

- `make_epub.py` writes the accessibility metadata from what the book has: how it can be read
  (text, pictures), its navigation, and whether every picture is described. Describe every picture
  that carries meaning (alt text), keep headings in order (a chapter `#`, its sections `##`), and
  set the right language.
- In the EU, the European Accessibility Act has required ebooks sold there to be accessible since
  28 June 2025; very small businesses (under 10 people and €2 million turnover) are exempt, but
  stores may ask for the metadata anyway.
- For a full accessibility report, the free Ace checker by the DAISY Consortium reads an EPUB and
  lists what to fix.

## EPUBCheck

The official checker (W3C), the same stores run. It needs Java.

- On a Mac: `brew install epubcheck`. On Ubuntu or Debian: `sudo apt install epubcheck`.
- Elsewhere: install Java, download the zip from github.com/w3c/epubcheck/releases, unpack it, and
  pass its jar: `check_epub.py book.epub --epubcheck-jar /path/to/epubcheck.jar` (or set
  `EPUBCHECK_JAR` to that path).
- On its own: `epubcheck book.epub`; an unpacked folder: `epubcheck work/ --mode exp`; a report to
  keep: `epubcheck book.epub --json report.json`.

## pandoc

When pandoc is installed (`pandoc --version`), it turns a Word file into an ebook in one step:

```bash
pandoc book.docx -o book.epub --toc --split-level=1 --epub-cover-image=cover.jpg \
  --metadata title="The Lighthouse Keeper" --metadata author="Ana Silva" --metadata lang=en-GB
```

- Chapter titles must use Word's **Heading 1** style: each starts a new chapter. Delete Word's own
  table of contents first; the ebook makes its own.
- pandoc 2 calls `--split-level` `--epub-chapter-level`.
- It takes Markdown files the same way, but passes any HTML inside them through unchanged.
- Check what it makes with `check_epub.py`: its books can still have broken links or invalid HTML.
- Without pandoc: save the Word file as a web page (Word: File, Save As, Web Page, Filtered;
  LibreOffice: `soffice --headless --convert-to html book.docx`) and give that file to
  `make_epub.py`. It drops Word's styling and keeps the text, headings, italics, tables, footnotes
  and pictures (Word's lists may come out as plain paragraphs).

## Looking at the book

- Kindle Previewer (free, from Amazon) shows how Kindle devices and apps will show an EPUB.
- Apple Books on a Mac, iPhone or iPad; Thorium Reader (free, Windows, Mac, Linux); Calibre's viewer.
- Look at the cover, the contents (click a few entries), the first page of a chapter, a scene
  break, a footnote, the pictures, and a page with a large font and in dark mode.
