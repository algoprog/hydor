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

`excel-check.ts` does the same for the sample workbooks of `excel-samples.ts` (number formats and Excel's own codes,
fonts, sizes, colours, fills, borders of every kind, alignment, wrapped and turned words, widths and heights, merged and
hidden cells, frozen panes, formulas, a filter, conditional formatting of every kind, lists with coloured options,
checkboxes, ratings, every kind of chart, notes and comments, several sheets, a long sheet and a wide one), into
`excel.html`, checking the .xlsx's parts against the schemas and Microsoft's extensions it uses:

```bash
OUTDIR=dist/dev node scripts/build-server.mjs scripts/office-check/excel-check.ts
DATA_DIR=/tmp/office-check-data node dist/dev/excel-check.js --out /tmp/excel-check --schemas /tmp/office-check-schemas
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
- Spreadsheets: Excel can carry no fonts, so cells are in Arial (the Office font closest to the app's Inter) at the
  editor's 10pt. LibreOffice sets a column's width from Arial's digit at 7.4 px; Excel (and the file) at 7 px, so
  LibreOffice's columns come out about 6% wider than Excel's, which are the editor's. The app's PDF prints charts one
  after another under a sheet's cells; Excel and LibreOffice print them where they stand over the cells. Excel has no
  checkboxes or stars in cells: they are TRUE or FALSE and numbers there (LibreOffice shows TRUE and FALSE as 1 and 0).
  Words that start or end with a space keep the mark Excel's own files give them (`xml:space="preserve"`), which
  ECMA-376's schema lacks there and Office's own has.

## PowerPoint (.pptx)

`pptx-check.mjs` makes the sample decks of `pptx-samples.mjs` (every layout and theme, text in every format, bullets
and numbers, spacing, words made smaller to fit, every shape, turns and flips, groups, pictures cropped and recoloured,
tables, every kind of chart, icons, equations, a video, connectors, comments, the footer, notes, animations and
transitions, Chinese and Greek words) in a running copy of the app, and for each one:

1. exports it as PowerPoint and as the app's own pictures of its slides (which match the editor);
2. validates every XML part of the .pptx against the ECMA-376 Transitional schemas with xmllint (Microsoft's
   extensions inside `mc:AlternateContent` and `extLst` are left to the schemas' lax parts; check them by hand against
   [MS-PPTX] and [MS-ODRAWXML]);
3. opens the .pptx in LibreOffice (in Docker, without the network) and prints its slides: once as it is, and once with
   the fonts the file carries installed (taken out of its Embedded OpenType parts, their MicroType Express undone by the
   app's own decoder), which is how PowerPoint shows a file whose embedded fonts it loads (LibreOffice 7.4 does not read
   fonts embedded in a .pptx itself);
4. puts each slide's three pictures side by side with how much they differ, worst first, in `report.html`, and lists
   the fonts LibreOffice drew with.

Run it against the demo app (`scripts/guide-shots/run.mjs --serve`, see its README) or any copy you can sign in to:

```bash
node scripts/office-check/pptx-check.mjs --url http://127.0.0.1:8795 --password 'a demo password' --out /tmp/pptx-check
```

`--only text,shapes` checks some decks; `--schemas DIR` keeps the schemas somewhere (they are fetched from
ecma-international.org the first time); `--image NAME` and `--prefix NAME` name LibreOffice's image and its containers;
`--no-office` checks the schemas alone; `--decks DIR` checks decks already exported there. It needs xmllint (`XMLLINT`
says where), Docker with the image above, and Playwright's Chromium headless shell to compare the pictures.

The other way round, PowerPoint files opened as slides:

```bash
# Each sample's own .pptx opened again (beside the deck it came from, with what changed part by part), and a copy
# LibreOffice saves itself (beside LibreOffice's pictures of it); --reuse takes the samples exported before.
node scripts/office-check/pptx-check.mjs --url http://127.0.0.1:8795 --out /tmp/pptx-check --roundtrip
# Other files, beside LibreOffice's pictures of them (a deck PowerPoint made, say).
node scripts/office-check/pptx-check.mjs --url http://127.0.0.1:8795 --out /tmp/pptx-check --files a.pptx,b.pptx
```

Both write `import.html`: the notes each file came in with, what came back otherwise, and the slides side by side.

What still differs, and why:

- LibreOffice fits words that are made smaller to fit its own way (it fits them again); PowerPoint draws the file's
  `fontScale` as it is until the words are edited.
- LibreOffice spaces lines by each font's own height; PowerPoint (and the file) by 1.2 times the size, as the app does.
  Fonts with tall metrics (Poppins, Nunito, Open Sans) come out with taller lines in LibreOffice than in PowerPoint.
- Fonts the app does not serve (Georgia, Courier New, Times New Roman) are Office's own: LibreOffice in the image draws
  its stand-ins for them.
