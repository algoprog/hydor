---
name: presentations
description: Use when the user wants a PowerPoint file (.pptx) made or changed from code (a pitch deck, talk, lesson, report or summary to show in PowerPoint, Keynote or Google Slides), or wants an existing .pptx, .ppt or .odp read, summarised or edited. For new slides to edit and present in the app, make a deck with save_slides instead.
category: documents
---

# Presentations

First, the app's own slides: for a new deck, make it with the `save_slides` tool (naget-agent). It
shows in the conversation as a slideshow, the user edits and presents it in Pages (as in PowerPoint
or Google Slides), and `export_page` writes it as a .pptx or PDF to hand over with `present_files`.
Use this skill for a .pptx built from code in a folder, a .pptx of the user's own, or when they ask
for a file made this way.

You build the slides with **python-pptx**, through the small `deck.py` helper here, and hand them
over as a file. The scripts in `scripts/` (next to this file):

- `scripts/office-python` runs Python with python-pptx (and python-docx, openpyxl, reportlab, pypdf),
  installed once into a private environment in the app's data folder. If it says Python or its venv
  module is missing, tell the user the one command it gives.
- `scripts/deck.py`: clean 16:9 slides with one look throughout: titles that are real titles, an
  accent colour, bullets with levels, two columns, pictures fitted to the slide, tables, charts and
  speaker notes. Each call returns the slide, for anything more with python-pptx itself.
- `scripts/render-pages FILE` turns the slides into PNG images to look at (needs LibreOffice).

## Reading one

Use the `read_document` tool (naget-agent): each slide's title, text, tables, pictures (by their
description), charts (title and series) and speaker notes.

## Making one

1. **Plan** the story: one idea per slide, a title that says the point ("Sales grew 12%", not
   "Sales"), at most about six short bullets, numbers as charts or tables. Usually 6–12 slides for a
   talk. Put what the speaker should say in the notes, not on the slide.
2. **Write the script** and run it with `<this folder>/scripts/office-python make_deck.py`:

```python
import sys
sys.path.insert(0, "<this folder>/scripts")
from deck import Deck

d = Deck(accent="1F6FEB")                     # the brand colour, as hex
d.title("Launch plan", "Spring 2026 · Marketing team")
d.bullets("Sales grew 12% this year", ["Europe led the growth", ("Spain and Portugal most", 1), "Costs stayed flat"],
          notes="Mention the new stores.")
d.two_columns("Before and after", ["Slow checkout", "Paper forms"], ["Two-tap checkout", "Online forms"],
              left_title="Before", right_title="After")
d.image("The new store", "store.jpg", caption="Opening day in Lisbon")
d.table("Visitors", [["Month", "Visitors"], ["Jan", "1,000"], ["Feb", "1,300"]])
d.chart("Sales by quarter (€m)", ["Q1", "Q2", "Q3"], {"2025": [1.2, 2.0, 2.4], "2026": [2.1, 2.8, 3.3]})
d.chart("Where sales come from", ["Online", "Stores"], {"Share": [62, 38]}, kind="pie")
d.text("Next steps", ["We open the Lisbon store in May.", "The team reports back in June."])
d.section("Thank you", "Questions?")
d.save("launch-plan.pptx")
```

   Chart kinds: `column`, `bar`, `line`, `pie`, `stacked`. Pictures you need can come from the user,
   from the web, or from the `generate_image` tool.
3. **Look at it**: `<this folder>/scripts/render-pages launch-plan.pptx` and open the PNGs with your
   tool for viewing images. Check for text running out of its box, crowded slides, pictures too small,
   and slides that say the same thing; fix and run again. Without LibreOffice, read it back with
   `read_document` and keep each slide short.
4. **Hand it over** with `present_files` and a short caption; in your reply, a sentence or two on
   what the deck covers.

## Changing one

`Presentation("theirs.pptx")` keeps the user's theme and layouts: add slides with their layouts
(`prs.slide_layouts`), change text in `shape.text_frame`, and save under a new name. To build a new
deck on their template: `Deck(template="their-template.pptx")`. `.ppt` and `.odp`: convert first with
`soffice --headless --convert-to pptx file.ppt`. A PDF of the slides: `soffice --headless
--convert-to pdf deck.pptx`.
