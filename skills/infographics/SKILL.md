---
name: infographics
description: Use when someone wants a one-page visual explainer, such as an infographic, a poster comparing options, a process or timeline graphic, an illustrated guide or a data story. Not for a single chart or dashboard (dashboards).
category: creative
triggers: [infographic*, visual explainer, visual summary, visual guide, comparison poster, poster comparing, poster explaining, process graphic, timeline graphic, illustrated guide, data story, cheat sheet]
---

# Infographics

An infographic explains one thing on one page, so that its reader understands, compares, chooses or
acts. It is an explanation first and a picture second: settle the reader and the message, then the
few facts behind it, then a structure that matches how they relate, then a style. Exact words and
numbers go in HTML or SVG, where they stay exact; `generate_image` adds illustration and atmosphere,
never the numbers. Check the real exported file at the size people will see it, and hand over a text
version with it. A single chart is the dashboards skill's, a single diagram the diagrams skill's.

## 1. Who reads it, where, and what they should take away

- Write down who reads it and what they already know, where they will see it, and one sentence on
  what they should understand or do afterwards ("New volunteers know the four steps of a repair
  session and where the tools are").
- Settle the files: a picture for a feed (PNG), a print file (PDF), a page to keep, a slide. A text
  version always goes with them.
- Assume what is safe and say so; ask only what would change the result (`ask_form` for several
  questions). A family packing guide needs a minute of this; a poster with statistics, all of it.

| Where it is seen | Canvas |
| --- | --- |
| A phone feed (Instagram, LinkedIn, Facebook) | 1080×1350 (4:5); the social-media skill has each platform's sizes |
| Stories, a phone screen | 1080×1920 (9:16) |
| A slide or a screen | 1920×1080 (16:9) |
| A web page or an article | 1200 wide, any height |
| Printed A4 or A3, a poster | the paper's shape, 1:1.414 (a canvas 1000 wide and 1414 high) |

## 2. The message and the facts, before any design

- **The headline is the finding,** as a sentence the evidence supports ("Spring fixed a bigger
  share"), not a label ("Repair café results"). When the evidence is mixed, it can be a question.
- **Three to six supporting facts,** each noted with its unit, place, period, source (title, link,
  date) and how you worked it out.
- **Nothing invented.** Facts come from the person or from sources you checked (the research skill).
  Never make up a statistic, quote, date or source to fill a panel; "make it convincing" is not
  evidence. Without sources, make a version without numbers (a process, a checklist, how it works),
  or mark example numbers as examples on the graphic.
- **Check the arithmetic before drawing anything:**
  - recompute every total and percentage; 20% to 30% is up 10 points, or 50%, not 10%;
  - a rate needs its base: 18 of 30 repaired (60%) is a better rate than 24 of 60 (40%), though
    more items were repaired in the second;
  - compare like with like: the same period, unit, place and way of counting; forecasts marked as
    forecasts; rounding the same everywhere, with "figures are rounded" if parts no longer add up.
- **Caveats sit beside the claim they limit,** not in a footnote. An arrow says "causes" or "leads
  to", and a sequence says "comes next": draw them only where the source shows it.
- **Cut, don't shrink.** What the reader does not need goes. If it still will not fit, make two
  pieces (a carousel, a front and a back) rather than smaller text.

## 3. Choose the structure from how the facts relate

| The reader wants to... | Structure | Watch for |
| --- | --- | --- |
| Compare options | columns or rows with the same criteria in the same order | panels of equal size and the same units, or one looks more important |
| Follow steps | numbered steps from start to end, branches shown | numbers say "in this order": none on things that are only a list |
| See change over time | a timeline | even spacing says even time: space by date, or say it is not to scale |
| See how something works, or what causes what | an annotated drawing, a cutaway, a chain of causes | label each arrow with what it means: flows, causes, leads to |
| Understand parts and wholes, or a hierarchy | a tree or nested groups | a box inside a box says "belongs to" |
| Understand a place | a map or a route | only when position matters; mark a schematic "not to scale" |
| Take in a few numbers | one main chart and a few big numbers with their labels | bars start at zero; side-by-side charts share a scale (dashboards skill) |
| Look something up | a grid, checklist or table (a cheat sheet) | no story forced on it |
| A cycle that repeats | a loop | only if it truly repeats |

- Write the reading path in a few words: where the eye lands first (the headline, one big number or
  picture), the order after that, where it ends (the action, the source line). One main structure;
  arrows, boxes, numbers and position all say something, so use each on purpose.
- Test it: read only the headline, the section titles and the big shapes. Does the message survive?

## 4. Choose a style, separately

- The same timeline can be a sober editorial page, a cut-paper scene or a technical plate. Choose for
  the reader, the subject and the medium, and follow the person's brand if they have one (brand-kit).
- When the look matters (a public poster, a brand piece), show two or three directions on the same
  content as small mockups with `show_html`, as the ui-mockups skill does, and let the person choose.
  Otherwise choose one and say why in a line.
- Fourteen styles, each with what it suits, its look, its limits and a line for picture prompts:
  `references/styles.md`.
- Whatever the style: two typefaces at most; one accent colour for what matters and quiet neutrals
  for the rest; a grid with equal gaps; colour never the only signal.

## 5. Draft it as a page, with the real content

- Build it as HTML with an SVG canvas of the final shape (`viewBox="0 0 1080 1350"`, full width),
  everything placed on a grid. A tested skeleton, type sizes and the export commands are in
  `references/build-and-export.md`.
- Give it its own colours as hex values, not the page kit's theme variables: an infographic must look
  the same in the app's dark mode, in the PDF and in the PNG.
- Real words from the first draft, at their real size. Charts from the checked numbers: a bar's
  length is its value divided by the largest value, times the full length; bars from zero; circles
  and icons sized by area.
- Show the draft with `show_html`, with plain boxes where pictures will go, and get the person's yes
  on the words and the layout before making pictures: pictures cost money and time.

## 6. Make the pictures

- `generate_image` for illustration, scenes, texture and mood, following the image-prompts skill:
  the style's prompt line, one style line for every picture in the piece, and space left where the
  words go ("a plain area across the top third").
- Keep words and numbers out of generated pictures: models misspell, and a chart drawn by an image
  model has the wrong proportions. A title of one to three words is the most to ask for, with every
  letter checked.
- A real photo the person has (the product, the place, the team) beats a generated one. Label a
  generated scene as an illustration wherever it could pass for a real photo.
- Look at each picture before using it: hands, faces, extra objects, and details that state facts
  the graphic does not (a clock's time, a uniform, a price tag).

## 7. Put it together and export

- **No pictures, or small ones:** keep it with `save_page` and make a PDF with `export_page`. It
  prints on A4, so a canvas taller than the A4 shape (1:1.41) runs onto a second page.
- **With generated pictures:** write the final page as an HTML file in the session's folder, next to
  its pictures, which it names by file name, and render it with Chrome or Chromium: a PNG at the exact
  size (sharper at twice the pixels) and a PDF of exactly the canvas, with sharp text for print. How
  to find the browser, and the commands: `references/build-and-export.md`.
- A page in the Library cannot read files: a picture in it is pasted in as base64 text, which is
  long (a 100 KB picture is about 135,000 characters). Use a small copy, or show the PNG instead.

## 8. Check the real export, at the size people will see it

Open the exported file itself, not the source, at full size and at the size it will be seen:

- **Legible:** a 1080-wide graphic shows about 360 to 400 pixels wide on a phone. On that canvas no
  text under 30 px (it shows at about 11 px), body text 36 px or more. In print, 10 pt or more on A4
  held in the hand; 24 pt or more on a poster read from two metres.
- **True:** every word and number matches the fact list; percentages recomputed; every arrow traced.
- **Contrast:** 4.5:1 for text, 3:1 for large text (24 px as seen, 19 px bold) and for chart marks;
  text on a picture sits on a plain area or a solid panel. Check pairs with the frontend-polish skill's
  contrast script, or brand-kit's palette check for a whole palette.
- **Without colour:** in greyscale the meaning survives (labels, patterns, positions).
- **Craft:** nothing cut off or overlapping; even gaps; one number format, one capitalisation, one
  icon style; no stray marks in the pictures.
- Look at an HTML file with `ui_screenshot` (phase `check`, viewport `both`), and at the PNG itself.
  Fix content and structure first, polish after; render and look again after each fix. If two fixes
  for one problem fail, change the approach: a bigger format, fewer facts, another structure.

## 9. Hand it over

- The files with `present_files`: the PNG or PDF, the editable source (the HTML file or the saved
  page), and the pictures it uses.
- A text version: the headline, the points in reading order, the numbers (a small table when they
  matter) and the sources in full. Posted, a one- or two-sentence version is its alt text (the
  social-media skill); the full one goes beside it on a web page or in a document.
- Say what you checked and what you could not ("not tried with real readers", "printer colours not
  proofed").

## Pitfalls

- Designing before the message and the facts are settled.
- Numbers, quotes or sources nobody can trace; a headline bolder than its evidence.
- Words, numbers or charts drawn by the image model.
- Shrinking text to fit everything in.
- Every topic as a column of identical cards, whatever the facts' relationships.
- Arrows that claim causes nobody showed; numbered "steps" that are only a list.
- An evenly spaced timeline over uneven years, without saying so.
- Colour as the only signal; text over a busy part of a picture.
- Checking the source page but not the exported file.
- Only a picture handed over: no text version, no sources.
