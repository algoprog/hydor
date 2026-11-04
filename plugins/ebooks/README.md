# Ebooks

Teaches agents to read, make, check and repair EPUB ebooks, the format Kindle, Apple Books, Kobo and
most reading apps take. It sets up a Python environment of its own (in the plugin's data folder, not
your system's Python) with **lxml**, **Markdown** and **Beautiful Soup**, and gives agents three scripts:

- `read_epub.py`: a book's details (title, author, language, cover, length), its contents and reading
  order, and its text as Markdown, with the pictures beside it.
- `make_epub.py`: a valid EPUB 3 from Markdown or HTML chapters, with a cover page, a table of
  contents, footnotes, pictures, metadata and a stylesheet.
- `check_epub.py`: checks a book for what stops readers opening it or stores accepting it, explains
  each problem in plain words, and writes a repaired copy of the common ones (the original is never
  changed). It also packs an unpacked, edited book back into an EPUB.

**EPUBCheck**, the official checker that stores use, runs as well when it is installed (it needs
Java). **pandoc**, when installed, turns Word files into ebooks. Both are optional; the plugin's page
says how to get them.

Books locked with DRM are not read or changed. Setting it up downloads a few MB of packages.
