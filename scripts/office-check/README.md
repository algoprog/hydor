# Office files, checked against Office without Office

Scripts that check the files the editors export the way an Office user's computer shows them: LibreOffice in Docker
stands in for Office, with the fonts an Office computer has and none of the app's, and the ECMA-376 schemas stand in for
what Office refuses or "repairs".

The LibreOffice image they use, `hydor-office-check`, is built once from this Dockerfile (`docker build -t hydor-office-check .`):

```dockerfile
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation2 fonts-dejavu-core fonts-noto-cjk \
      poppler-utils \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /work
```

## Word (.docx) and Excel (.xlsx)

`word-check.ts` makes the sample documents of `word-samples.ts` (headings, fonts and sizes, spacing, lists of every
kind, checklists, callouts, quotes, code, tables with merged, filled and sized cells, two tables in a row, a long table
over pages, pictures with captions, equations, a table of contents, a header and footer with page numbers, a title page,
comments and suggested changes, Chinese and Greek, Office's own fonts, an eleven-page document) with the app's own code,
keeps each as a page of a scratch Library, and for each one:

1. exports it as Word and as the app's PDF (which matches the editor's pages), as the Library's export does;
2. opens the .docx in LibreOffice (in Docker, without the network) and prints it, and lists the fonts LibreOffice drew
   with: the document's own (Inter, Lora, JetBrains Mono…) when it read the fonts the file carries;
3. puts each page's two pictures side by side, with a third where they differ (grey in both, blue only the app's, red
   only LibreOffice's), in `word.html`;
4. validates every XML part of the .docx against the ECMA-376 Transitional schemas with xmllint (they are fetched into
   `--schemas` the first time), after taking out what Office's Markup Compatibility lets an Office that does not know
   Microsoft's extensions ignore; checks those extensions by hand against [MS-DOCX] (w14 paragraph ids, checkboxes,
   ligatures; w15 comment threads), and the package as Office does before it "repairs" a file (content types,
   relationships, the ids parts use);
5. reads the .docx back as the app opens a Word file and says what came back different.

Build it with the server's bundler and run it from the checkout's top folder, with a scratch data folder:

```bash
OUTDIR=dist/dev node scripts/build-server.mjs scripts/office-check/word-check.ts
DATA_DIR=/tmp/office-check-data node dist/dev/word-check.js --out /tmp/word-check --schemas /tmp/office-check-schemas
```

`--only word-tables,word-long` checks some documents; `--image NAME` names LibreOffice's image (`hydor-office-check`);
`--dpi N` the pictures' resolution (60). It needs Docker with the image, xmllint (`XMLLINT` says where), and a
Chromium for the app's PDFs (Playwright's headless shell, `PLAYWRIGHT_BROWSERS_PATH`). It ends with a line a document:
its pages in the app and in LibreOffice, and whether its schemas, package and round trip came out right (it exits 1 when
a schema or the package does not).

For equations LibreOffice needs its Math part, and an Office computer has an emoji font: add them to the image's
packages (`libreoffice-math-nogui fonts-noto-color-emoji`) or build one on it:

```dockerfile
FROM hydor-office-check
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-math-nogui fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*
```

What still differs, and why:

- LibreOffice reads the fonts a .docx carries, so it draws the document's own; Word does too (Word 2010 and later on
  Windows, 2019 and later on a Mac). Word on the web does not, and falls back to each font's other name (Inter's is
  Arial). Office's own fonts (Georgia, Times New Roman, Courier New, Microsoft YaHei for Chinese, Segoe UI Symbol for
  checkboxes, Segoe UI Emoji) are not in the image: LibreOffice draws stand-ins (DejaVu, Liberation, Noto CJK).
- Equations: Word draws its own (OMML) at the sizes the file gives them, as large as the editor's; LibreOffice turns
  them into its own formulas, smaller.
- Lines are given to Word in points, as the editor draws them (Word lays fonts like Merriweather or Poppins out with
  far taller single lines than a browser does). Where a paragraph's lines must grow with what they hold (maths among
  its words, words larger than its own) and its font's Word line is taller than the editor's, the file gives a
  multiple of Word's line: right in Word, which lays fonts out by their Windows metrics, shorter in LibreOffice, which
  uses others.
- Within its line, Word puts words a point or so higher or lower than a browser, so a page's lines can sit a little
  apart; where lines break and where pages break match, but for a word or a line here and there.
