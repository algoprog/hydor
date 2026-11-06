# Agents can do on every kind of page what people do in its editor: the audit

*6 November 2026. The owner: "agents should be able to do all types of actions on top of all doc types, not just the user
from the UI", and "especially the agent right next to them when users click Ask the agent". For each kind the Library
keeps (slides, documents, spreadsheets, pages of HTML, LaTeX, notebooks, its pictures, videos and sounds, the Library
itself), every action its editor offers in its menus, toolbars, panels and right-click menus, and how an agent does it.
Workstream H of `media-and-rich-slides.md`, written against `mr/int` with every builder of the round merged (A1–A3, B,
C1, C2, D, E1–E3, F1, F2, G) and main's page descriptions.*

## How an agent does things

- **Its save tool**: `save_slides`, `save_doc`, `save_sheet`, `save_latex`, `save_notebook`, `save_page`. The kind's model,
  whole or in parts (slides changed, added or taken out; edits in a document's Markdown or a LaTeX file; cells updated),
  with comments, suggestions and tracked changes answered. Most of what an editor does to a part, a slide, a paragraph,
  a cell or a file is a field there; **save** below names the field.
- **`page_action`** (new: `server/pages/actions.ts`): what an editor does in one click to the whole of a page, which the
  save tool would have the agent write out (and sometimes could not: formulas that must follow a row, comments that must
  move with it, references that must follow a file). It runs the editor's own code (`shared/`), keeps a new version as
  the save tools do (an agent's saves of a page in one turn are one version; the user's changes and the comments stay),
  and the editor open on the page shows it at once. Listed by kind at the end.
- **The picture, drawing, plot, video and sound tools**: `generate_image` (Quick or Best; a picture of the page as a
  reference by its `naget-asset:` source), `make_svg`, `make_plot`, `remove_background`, `erase_from_image`, `edit_image`,
  `generate_video`, `edit_video` (a deck's video by its `naget-video:` source), `generate_audio`, `find_photos`. Each
  makes a file in the agent's folder, which the save tool puts in its place.
- **`app_api`**: the app's own routes (`docs/guide/90-api.md`); reading is free, a change shows a card. The writing
  helpers (`POST /api/write/design-ideas`, `/rewrite`, `/describe`) are free.
- **Reading and handing over**: `get_page` (any page whole, with its comments, suggestions, tracked changes, a deck's
  accessibility problems, a LaTeX document's errors and word count), `export_page` (every file the Download menus make),
  `publish_site` (the user confirms on its card), `latex_check`, `how_to_make` (the gallery's kinds, D).

**A person's** marks what only a person does (presenting, recording, the camera, the microphone, the views of an
editor); each kind ends with them in a line. **Not yet** marks what an agent cannot do; they are gathered at the end.

## Slide decks

`slides/SlidesMenus.tsx`, the Inspector's Format, Animate, Slide and Theme tabs, the canvas's and the strip's right-click
menus, the text bar, the side panels (design ideas, accessibility, comments, notes), the present menu.

| In the editor | An agent |
|---|---|
| Edit → Undo, Redo | The version before: `POST /api/pages/:id/versions/:v/restore` (a card), or the slides saved back as they were |
| Edit → Cut, Copy, Paste, Duplicate, Delete (parts), the right-click menu's | save: `change` (the slide with its parts moved, copied with an id of their own, or taken out) |
| Edit → Find and replace | save: `change`, the slides whose words change |
| Edit → Copy the look, Paste the look; Format → Format painter | save: `change`, the parts' look fields |
| View → Zoom, grid, snap, rulers, speaker notes, every slide | A person's (views); View → Guides: save `guides` |
| Insert → New slide, From a layout | save: `add` (a layout and its words) |
| Insert → Slides from another deck (E3) | **page_action `reuse_slides`** (fresh ids, their notes, their look or this deck's) |
| Insert → Slide made with AI (D) | `how_to_make` (the gallery's request), then save `add` |
| Insert → Text box, Shape, Line or arrow, connectors, Table, Chart → New chart, Icon or emoji, Equation, Code | save: a part (`text`, `shape`, `line` with `from`/`to`, `table`, `chart`, `icon`, `math`, `code`) |
| Insert → Chart → From a spreadsheet (E3) | save: a chart's `source` {page, sheet, range}, read on save; **page_action `update_charts`** reads them again |
| Insert → Picture → From this device, From a web address | save: an `image` part's `src` (a file of the session, an https address) |
| Insert → Picture → Free photos (E3), Make with AI, Drawing (SVG) | `find_photos`, `generate_image`, `make_svg`, then save |
| Insert → QR code (E3) | save: a `qr` part |
| Insert → Plot | `make_plot` (a picture, or an interactive plot for the web format), then save (`image`, or `html` with `file`) |
| Insert → Video → YouTube or Vimeo, From this device, Make with AI | save: a `video` part; `generate_video` first for one made with AI |
| Insert → Interactive → Custom code, Web page, Quiz, Quiz score, 3D | save: `html`, `embed`, `quiz`, `score`, `scene3d` |
| Insert → Comment; the Comments tab's reply, resolve, reopen, delete | save: `comments` |
| Format → Text (bold … clear the formatting), Paragraph (alignment, lists, indents) | save: `change` (Markdown in the words, `align`, bullets) |
| The text bar's Rewrite (E1) | `POST /api/write/rewrite` (free), or the agent's own words; then save `change` |
| Format → Edit picture (F1) | `edit_image` on the picture's `naget-asset:` source, then save `change` with the new file |
| Format → Crop the picture, Reset the picture | save: the image's `crop` and `adjust` (or `edit_image`) |
| Format → Change with AI, Remove the background, Erase part of it | `generate_image` (the picture as a reference), `remove_background`, `erase_from_image`; then save |
| Format → Edit video (F2) | `edit_video` on its `naget-video:` source, then save |
| Format → Make a plot of this (a chart) | `make_plot` with the chart's numbers, then save |
| Format → Edit the equation, Another icon | save: `math`'s `tex`, `icon`'s `icon` |
| Format → Run it here, Stop it | A person's (a live part running in the editor) |
| Format options: every part's place, size, words, fill, border, picture (shape and frame, E3), line, table, chart, icon, equation, video (start and end, E3), web parts, hover, link, name | save: `change`, the part's fields as `save_slides` lists them |
| Arrange → Group, Ungroup, order, line up, spread, turn, flip, lock | save: `change` (a `group` part, the parts' order, `x`, `y`, `rot`, `flipH`, `flipV`) |
| Slide → New slide, Delete slide, Skip this slide | save: `add`, `remove`, a slide's `hidden` |
| Slide → Duplicate slide | **page_action `reuse_slides`** from the same deck, after it (or save `add`) |
| Slide → Design ideas (E1) | `POST /api/write/design-ideas` {deck: its id, slide} (free), then save `change` with the one picked |
| Slide → Background, Transition; the Slide tab | save: a slide's `bg`, `transition` |
| Slide → Animations; the Animate tab's effects, triggers and timings | save: a slide's `anims` |
| The Animate tab's Animate every slide (E1) | **page_action `animate`** (Subtle, Lively, Striking, or none; every slide or some) |
| Slide → Theme; the Theme tab's Ready-made and My themes (E3) | **page_action `theme`** (a preset, or one of the user's by its name, its logo with it); save `theme` too |
| The Theme tab's Save as my theme, rename, delete (E3) | `POST`, `PATCH`, `DELETE /api/slides/themes` (cards) |
| The Theme tab's Logo (E3), Colours, Fonts, Progress bar | save: `logo`, `theme` {colours, fonts}, `progress` |
| The Theme tab's Slide shape | **page_action `slide_shape`** (every part kept in step) |
| The Theme tab's Made for; Tools → PowerPoint compatible | **page_action `powerpoint`** (it says what changed); save `format` with the whole deck |
| Slide → Slide numbers and footer | save: `footer` |
| Slide → Save this slide as a picture | `export_page` png with `slide` |
| The Slide tab's Narration (E2): Make with AI | `generate_audio` (the notes read out), then save the slide's `narration` {file, text} |
| The Slide tab's speaker notes | save: a slide's `notes` |
| Tools → Check accessibility (E1) | `get_page` lists the problems; **page_action `fix_accessibility`** and **`describe_pictures`**; `POST /api/write/describe` for one (free) |
| Tools → Translate the slides (E1) | The agent writes them in the language, then save `change` (the panel only asks an agent) |
| Download: PowerPoint, PDF, web page, pictures | `export_page` (pptx, pdf, html, png) |
| Publish | `publish_site` with `page` |

A person's: presenting (from the start, from here, the presenter's view), Play the narration, Record a video of the
slideshow, the camera bubble, rehearsing with the coach (its Use these timings sets each slide's `transition.auto`,
which an agent sets with save), the phone as a remote, recording a narration with the microphone, the eyedropper, the
keyboard shortcuts.

## Documents

`docs/menu.tsx`, `Toolbar.tsx`, `Slash.tsx`, the picture's bar (`Picture.tsx`), the table's menu, the comments column,
the suggestions' buttons, Page setup.

| In the editor | An agent |
|---|---|
| Edit → Undo, Redo | The version before (`POST …/versions/:v/restore`, a card) |
| Edit → Cut, Copy, Paste, Paste without formatting | save: `edits` (or the whole Markdown) |
| Edit → Find, Find and replace | save: `edits` {find, replace, all} |
| View → Editing or suggesting | Not kept with the document (the editor's mode): an agent suggests rather than changes with save `suggest: true` |
| View → Outline, Comments, Show resolved, Zoom, Check spelling, the word count while typing | A person's (views); `get_page` gives the outline and the word count |
| Insert → Picture: this device, the web, Free photos (E3), made with AI, a drawing | A file of the session (or `find_photos`, `generate_image`, `make_svg`), then save (an image in the Markdown) |
| Insert → Signature | `place_signature` (the user allows each on a card), or `ask_signature` |
| Insert → Table (sizes), Link, Equation (a line, among the words), Special characters, Callout, Table of contents (`[TOC]`), A line across, A page break (`\pagebreak`), Today's date | save: `edits` or the Markdown |
| Insert → Plot; the table menu's Make a plot of this table | `make_plot`, then save |
| Insert → Comment; the comments column's reply, resolve, reopen, delete | save: `comments` |
| Insert → Section made with AI (D) | `how_to_make`, then save `edits` |
| Insert → Header and footer, Page numbers | **page_action `header_footer`** (`{page}`, `{pages}`; none on the title page); save `header`/`footer` with the whole document |
| Format → Text, Paragraph styles, Align and indent, Line spacing, Bullets and numbering, Callout's emoji and colour, Clear the formatting; the toolbar's font, size, colours, highlight | save: the Markdown and its attributes (`{.title}`, `{line=1.5}`, `<span style>`, `==highlight==` …) |
| Format → Table (rows, columns, merging, cell colour, alignment, header row, delete) | save: the table in the Markdown (or `blocks`) |
| Format → Page setup | **page_action `page_setup`** (paper, margins, font, size) |
| The toolbar's and the words' bar's Rewrite (E1) | `POST /api/write/rewrite` (free), or the agent's own words; then save `edits` |
| The picture's bar: Another picture, Change it with AI, Edit picture (F1), description, caption, its place, Delete | A new file (`generate_image` with it as a reference, `edit_image` on its source), then save; the rest is the Markdown |
| A suggestion's Accept, Reject; Tools → Accept all, Reject all | **page_action `accept_suggestions`, `reject_suggestions`** (all or by id); save `suggestions` with the whole document |
| Tools → Word count | `get_page` (about how many words) |
| Tools → Compare with a version | `GET /api/pages/:id/versions/:v?model=1` (free), compared by the agent |
| Tools → Print; Download: Word, PDF, Markdown | `export_page` (docx, pdf, md) |

A person's: zoom, the spelling check, the outline view, the print dialog, the keyboard shortcuts, the format painter's
double click.

## Spreadsheets

`sheets/menus.tsx`, `Toolbar.tsx`, the grid's right-click menu, the sheet tabs, the filter menus, the panels
(conditional formatting, data validation, charts, comments), the Kanban board, Expand row.

| In the editor | An agent |
|---|---|
| Edit → Undo, Redo | The version before (`POST …/versions/:v/restore`, a card) |
| Edit → Cut, Copy, Paste; Paste special (values, formats, formulas, transposed) | save: `update` (the cells written as they are to be) |
| Edit → Find and replace | save: `update`, the cells that change |
| Edit → Fill down, Fill right | **page_action `fill`** (formulas move as copied ones do) |
| Edit → Clear; Format → Clear formatting | **page_action `clear`** (contents, formatting or all); save `update` with null cells too |
| View → Freeze | save: `update` {freeze} (tested: as easy as an action, the cells left as they were) |
| View → Show formulas, Zoom, Comments | A person's (views); `get_page` gives every cell's formula and value |
| View → Kanban board, Open the sheet on its board | save: a sheet's `board` (`open`) |
| View, Format → Show all hidden rows and columns; Hide | save: `hidden` |
| Insert → Rows above or below, Columns left or right; the right-click menu's | **page_action `insert_rows`, `insert_columns`** (every formula that points past them follows) |
| Insert → Chart; the charts' panel | save: `charts` |
| Insert → Checkbox, Dropdown, Rating, Date | save: `validation` (checkbox, list, rating), a date `format` |
| Insert → Note, Comment; the comments panel | save: `notes`; `comments` |
| Insert → Function, Special character | save: the formula or the words in `update` |
| Insert → Sheet; the tabs' Add a sheet from a CSV file | save: `update` naming a new sheet; a sheet's `file` (a CSV of the session) |
| Format → Number, Date, Currency, Text, Font, Type size, Alignment, Wrap, Rotation, Borders; the toolbar's | save: `formats`, `styles` |
| Format → Merge cells | save: `merges` |
| Format → Rows and columns → Delete; the right-click menu's | **page_action `delete_rows`, `delete_columns`** (formulas follow; a reference to a cell that went is #REF!) |
| Format → Conditional formatting | save: `conditional` |
| Data → Sort range, Sort sheet by column A to Z or Z to A; the filter menu's sort | **page_action `sort`** (one column or several; whole rows move, their formulas and comments along) |
| Data → Create a filter, Remove the filter; the filter menu's values and conditions | save: `update` {filter} (tested) |
| Data → Data validation | save: `validation` |
| Data → Remove duplicates | **page_action `remove_duplicates`** |
| Data → Split text to columns | **page_action `split_text`** (it asks for `overwrite` before writing over cells, as the editor asks) |
| Data → Trim spaces | **page_action `trim_spaces`** |
| Data → Summarize by | **page_action `summarize`** (a sheet of formulas after it) |
| The tabs: Rename, Duplicate, Delete this sheet, Move left, Move right | **page_action `rename_sheet`** (formulas that name it follow), **`duplicate_sheet`, `delete_sheet`, `move_sheet`** |
| The board's cards moved between lanes; Expand row's fields | save: `update` (the row's cells) |
| Download: Excel, CSV, PDF | `export_page` (xlsx, csv, pdf) |

A person's: zoom, the keyboard shortcuts, Expand row as a view, the cell picked.

## Pages of HTML

The page studio (`studio/`): Edit and Code, the Add panel, the Inspector's Part, Layers and Page tabs, the comments, a
page's databases and stored data.

| In the editor | An agent |
|---|---|
| Everything that changes the page: parts added, moved, styled, written, deleted; the Page tab; the code | save_page (the whole page) |
| Add → a part made with AI (D) | `how_to_make`, then save_page |
| Pictures: made with AI, a picture's address, Free photos (E3), a drawing, a plot; Change it with AI; Edit picture (F1) | `generate_image`, `make_svg`, `make_plot`, `find_photos`, `edit_image`; the file as an `img`'s src in save_page |
| Comments on blocks: add, reply, resolve | save_page `comments` |
| A database's rows and columns | save_page `databases` |
| What it keeps (its data): look, forget | `GET /api/pages/:id/data` (free); `DELETE /api/pages/:id/data` (asks every time) |
| A new own address | `POST /api/pages/:id/link` (asks every time) |
| Undo, Redo, versions | The version before (`POST …/restore`, a card) |
| Download: PDF, Word, web page; Publish | `export_page`; `publish_site` |

A person's: the preview at a phone's or a tablet's width, using the page, the keyboard shortcuts.

## LaTeX documents

`latex/LatexEditor.tsx`'s menus and toolbar, the files tree, the preview, the outline, comments, symbols and
references panels, the table editor, Check before submitting, the arXiv package, Compare, Word count.

| In the editor | An agent |
|---|---|
| Edit → Undo, Redo | The version before (`POST …/restore`, a card) |
| Edit → Find and replace, Comment or uncomment | save_latex `edits` |
| Insert → headings, lists, a table (the table editor), a figure, equations, a symbol, a citation, a cross-reference, a footnote, a link, quotes, verbatim, a proof, the table of contents, a page break | save_latex `edits` (the LaTeX) |
| Insert → Reference from the web | `POST /api/pages/tex/reference` (a card; it only looks up), then `edits` to the .bib |
| Insert → Comment; the comments panel | save_latex `comments` |
| Format → bold … clear formatting, size, alignment, colour | save_latex `edits` |
| Tools → Recompile now, Typeset with | Each save_latex typesets (`engine` picks the engine); its answer has the errors |
| Tools → Track changes; Accept all changes, Reject all changes | save_latex `track`; `changes` ("accept all", "reject all", or by id) |
| Tools → Word count | `get_page` (as texcount counts) |
| Tools → Compare versions | `GET /api/pages/:id/versions/:v?model=1` (free) |
| Tools → Show the log, Open the PDF | `get_page` (the last typesetting's errors); `export_page` pdf |
| The files tree: a new file or folder, delete | save_latex `files`, `remove` |
| The files tree: rename or move a file, a picture, a folder | **page_action `move_files`** (every `\input`, `\include`, `\includegraphics` follows; comments and tracked changes along) |
| The files tree: add a picture | save_latex `pictures` (a file of the session) |
| Check before submitting | `latex_check` |
| The arXiv package | `POST /api/pages/tex/arxiv` (a card) makes it; **not yet** its .zip (binary, out of `app_api`'s reach); `export_page` zip gives the project |
| Camera-ready, a move to another venue (the paper tools' requests) | The agent does them with save_latex (the panel only asks an agent) |
| Download: PDF, .tex, the project's .zip | `export_page` (pdf, tex, zip) |

A person's: the visual mode, recompiling as one types, folding, Show this line in the PDF, dark pages, presenting the
pages, the keyboard shortcuts.

## Notebooks

`notebook/NotebookView.tsx`: the toolbar, a cell's buttons, More, the kernel picker.

| In the editor | An agent |
|---|---|
| Run a cell, Run all, Interrupt, Restart, Restart and run all | The agent runs the code itself: `export_page` ipynb into its folder, runs it, save_notebook `path` (the outputs come along); `/api/kernels` is its own tools' |
| Clear all outputs | **page_action `clear_outputs`** (all, or the cells named) |
| Add, move, edit, delete a cell | save_notebook (the whole notebook, the cells and ids it keeps) |
| View the file (JSON); Download | `get_page`; `export_page` (ipynb, py, pdf, html) |

A person's: the kernel picker (the Python it runs in), the keyboard shortcuts.

## The Library's pictures, videos and sounds

`media/MediaView.tsx`, and the picture and video editors in their tabs (`mediaedit/`, F1 and F2).

| In the editor | An agent |
|---|---|
| Find them | `GET /api/media` (free): each item's title, description and `file`, the Library's copy, which the tools take |
| Download | Its `file` is on this computer |
| Edit the title and description; Write them again | `PATCH /api/media/:id`; `POST /api/media/:id/caption` (cards) |
| Move to a project, to a folder | `PATCH /api/media/:id` {space, folder} |
| Delete | `DELETE /api/media/:id` (asks every time) |
| The picture editor: crop, turn, flip, adjust, filters, words, arrows, boxes and ovals, blurred or pixelated areas | `edit_image` on its `file` |
| The picture editor: the pen and the highlighter, plain lines, emoji, straightening by a few degrees | **Not yet** in `edit_image` |
| The picture editor's AI: Remove the background, Erase, Change with AI | `remove_background`, `erase_from_image`, `generate_image` with it as a reference |
| The picture editor's AI: Expand the picture | **Not yet** (`generate_image` makes a new picture from it, not the same picture made wider) |
| The video editor: trim, cut, speed, crop, turn, mirror, words, colour, fades, sound, music, a frame, a GIF | `edit_video` on its `file` |
| Save a copy in the Library | `POST /api/media` {path} with the new file (a card) |
| Save over it (the editors' Save) | **Not yet**: `/api/mediaedit/*` is refused to agents, and `edit_image`, `edit_video` always make a new file |
| Start a session with it | `POST /api/sessions` (asks every time); an agent in a session already works with its file |

Sounds have no editor: `generate_audio` makes them, and their title, description and place change as above.

## The Library itself

`pages/Library.tsx`: New, a card's More, folders, Published, versions.

| In the editor | An agent |
|---|---|
| New: a page, slides, a document, a spreadsheet, a LaTeX document, a notebook | The save tools (`project`, `libraryFolder`) |
| New: made with AI from the gallery (D) | `how_to_make`, then the save tool |
| New: open a PowerPoint, Word, Excel, CSV, .tex or .ipynb file | `POST /api/pages/import` {path} (a card) |
| Upload files, files dropped on it | `POST /api/library/move` (a file moved in), `POST /api/media` (a copy), `POST /api/pages/import` (cards) |
| New → Folder; a folder's Rename, Move, Delete; Import a folder | `POST`, `PATCH`, `DELETE /api/pages/folders` (cards; delete asks every time); `POST /api/pages/import-folder` |
| A card's Rename | `PATCH /api/pages/:id` {title} |
| A card's Move to a project, Move to a folder | `PATCH /api/pages/:id` {space, folder}; the save tools' `libraryFolder` |
| A card's Duplicate | **page_action `duplicate`** (or `POST /api/pages/:id/copy`, a card) |
| A card's Turn it into (D): slides, a document, a page | **page_action `turn_into`** gives the Library's request; the agent then makes it with the save tool |
| A card's Download as | `export_page` |
| A card's Delete | `DELETE /api/pages/:id` (asks every time) |
| A page's History: a version, Restore | `GET /api/pages/:id/versions/:v` (free); `POST …/restore` (a card) |
| Publish; Published → Unpublish | `publish_site` (the user confirms); `DELETE /api/sites/:id` (asks every time) |

A person's: Present and Edit (opening it), Start a session with it, finding, sorting and the kinds filter (`get_page`
lists everything).

## The Apps page (G)

Not a kind of page, but a place with actions of its own (`apps/Gallery.tsx`, `Recent.tsx`): every one has its agent's way.

| In the page | An agent |
|---|---|
| Pin an app to the top, unpin, put the pinned in another order | `PUT /api/apps/pins` {ids} (a card); `GET /api/apps/pins` (free) |
| The find box, the kinds and their counts | `find_apps` (the pinned and the lately used first) |
| The apps run lately: how it went, Open the result, Run again | `GET /api/apps/:id/runs`, `GET /api/apps/runs/:runId` (free); `use_app` runs one in the session |
| Start with (for someone new), a card's marks (its own view, agents may run it, it needs a key) | `GET /api/apps` (free) |
| Uninstall, install again, delete; an app file dropped on the page | `POST /api/apps/:id/uninstall`, `…/install`, `DELETE /api/apps/:id`; `POST /api/apps/install` (asks every time) |

A person's: dragging the pinned tiles, the cards' sorting, opening an app's view.

## page_action, by kind

Each answers what changed, saying "Saved "…" (page …, version …)" first when it saved one; one that has nothing to do
saves nothing and says why.

- **Slide decks**: `animate` {style: subtle, lively, bold or none; slides}, `fix_accessibility` {slides},
  `describe_pictures` {slides, parts} (the model that describes the Library's pictures: it may cost a little; up to 12 a
  call), `powerpoint` {on}, `theme` {a preset, or one of the user's by its name}, `slide_shape` {16:9 or 4:3},
  `reuse_slides` {from, slides, after, keep_look}, `update_charts` {slides}.
- **Documents**: `accept_suggestions`, `reject_suggestions` {ids}, `page_setup` {paper, margin, font, size},
  `header_footer` {header, footer, title_page}.
- **Spreadsheets** (`sheet`; `range`, or the table around a cell, or around A1; `header_row` told as the editor tells
  it): `sort` {by, descending}, `remove_duplicates` {columns}, `fill` {range, direction}, `clear` {range, what},
  `trim_spaces`, `split_text` {range, separator, overwrite}, `summarize` {by, across, values}, `insert_rows` and
  `insert_columns` {at, count}, `delete_rows` {rows}, `delete_columns` {columns}, `rename_sheet` {name},
  `duplicate_sheet` {name}, `delete_sheet`, `move_sheet` {to}.
- **LaTeX documents**: `move_files` {moves} (typeset again, as save_latex is).
- **Notebooks**: `clear_outputs` {cells}.
- **Any kind**: `turn_into` {to: slides, doc or page}, `duplicate` {title}.

The code each runs, shared with the editor: `shared/deck-animate.ts`, `deck-check.ts`, `deck-shape.ts` (moved out of
the Theme tab), `slides.ts`' `toPowerPoint`, `slides-reuse.ts`, `slides-sheet.ts`' `chartRefreshed` (moved out of the
chart's Update), `docs.ts`' `resolveSuggestion`, `sheet-tools.ts` (the sheet editor's data tools, moved out of
`sheets/ops.ts` and `tools.ts`), `sheets.ts`' `adjustForInsert`, `adjustForDelete`, `renameSheet`, `removeSheet`,
`latex-files.ts`' `texMoveFiles`, `content-asks.ts`' `turnAsk`; the pictures' descriptions through `server/write`'s
`describe`. Left to the save tools, as easy there: freezing, a filter, hiding, merging, rules, charts, a sheet's board;
a part's, a slide's, a paragraph's or a cell's own look and words; a deck's footer, logo, guides and progress bar; a
LaTeX document's track changes and engine.

## The agent beside the page (Ask the agent)

- **What it is told** (`server/pages/index.ts` `askInstructions`): which page it is and how to change it, as before, and
  now, for its kind: its `page_action` actions; the picture, drawing, plot and video tools for a part picked by its
  `naget-asset:` or `naget-video:` source, the save tool putting the result in its place (decks, documents, pages); the
  design ideas and rewrite routes, free through `app_api` (decks; rewriting in documents); `export_page` and
  `publish_site` when asked.
- **What was picked reaches it by its ids**: a slide's lead is "On slide 3 (“Pricing”, id k2j3…): ", a part's "On slide 3
  (id k2j3…), the picture: … (image part p9…, naget-asset:…): " (the Tools menu's, the right-click menus' and the Ask
  panel's chips alike); a document's picture carries its source; a notebook's cell its id. A sheet's cells (the sheet's
  name and the range), a LaTeX file's lines and a page's part (its CSS selector) said exactly where already.
- **What it changes shows as it works**: a `page_action` keeps its version as the save tools do, so the pages hear of it
  and the editor open on the page shows it at once; in the conversation, a version it saved shows as the saves' card
  (one card for a page's saves in a turn, and beside the conversation), and one that changed nothing is a step of the
  work. Unlike a save, it has no draft to watch come in: it is done in a moment.

## The routes behind the editors' actions

Every route behind an editor's action is in the API topic: `server/guide/guide-test.ts` fails otherwise, and passes. Those
an agent must not use are refused with a pointer to its tool: the editors' AI routes (`/api/images/make|edit|svg|cutout|
erase`, `/api/plots/make`, `/api/videos/make`, `/api/mediaedit/*`, `/api/photos/*`) to `generate_image`, `make_svg`,
`remove_background`, `erase_from_image`, `make_plot`, `generate_video`, `edit_image`, `edit_video` and `find_photos`; the
slideshow's (`/api/slides/sounds|narration|shows`) to `generate_audio` and save_slides' `narration`; `/api/kernels`,
`/api/fs` to the agent's own tools; `POST /api/sites` to `publish_site`; `/api/signatures` to `ask_signature` and
`place_signature`. The writing helpers (`/api/write/*`) are free. None was found missing, so none was added.

Worth a look (not changed here): `POST /api/pages/tex/reference`, `POST /api/pages/tex/compile` and
`POST /api/pages/docs/print` change nothing and could be free rather than carded.

## Not yet

1. Saving an edited picture or video over the Library's own item (the picture and video editors' Save). The smallest
   way: `edit_image` and `edit_video` taking a Library item (`media: id`) and saving over it with
   `server/mediaedit`'s `replaceInLibrary`, as `POST /api/mediaedit/image` does for the editor.
2. The picture editor's pen and highlighter, plain lines, emoji, straightening and Expand the picture, in `edit_image`.
3. The arXiv package's .zip for an agent: `POST /api/pages/tex/arxiv` could write it into the session's folder, as
   `export_page` writes its files.
4. Find and replace in a deck or a workbook in one call (the agent writes the slides or cells that change).
