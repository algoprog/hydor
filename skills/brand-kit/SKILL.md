---
name: brand-kit
description: Use when a small business, club, project or person wants a brand worked out or written down (who it is for, voice, colours, fonts, logo ideas, a brand card or book) or put to use on profiles and cards. Not for one picture (image-prompts).
category: creative
triggers: [brand kit, brand identity, brand guide*, brand book, brand colo*, brand voice, brand font*, visual identity, logo and colo*, rebrand*, branding for, my branding]
---

# Brand kit

A brand is how a business, club, project or person comes across, the same way every time: what it
promises, how it sounds and how it looks. Settle the strategy in a few lines first; voice, colours,
fonts and the logo then follow from it. Write it on a one-page brand card (and a fuller brand book
when others will use it), and put it to work where people meet it. A small kit used everywhere beats
a big one used once. Pictures follow the image-prompts skill, long texts in the voice the writing
skill, posts the social-media skill.

## 1. Start from what exists

- Find out what they do and for whom, where people meet them (a shop sign, Instagram, a website, a
  market stall, email, a club shirt), and what they have already: a name, a logo, colours, photos,
  printed things. `ask_form` gathers several answers at once; a vague whole goes to clarify-first.
- A brand people already recognise is tidied and written down, not reinvented: keep what is known,
  fix what is weak (a colour that fails contrast, five different fonts).
- Ask for three brands they admire and why, and what they never want to look like.
- Look at four or five others in the same trade and place (`web_search`; the research skill). Decide
  where to fit in, so people recognise the trade, and where to stand out.
- Note the limits: budget for print or a designer, a club's existing colours, rules for signs.

## 2. The strategy in a few lines

Half a page, agreed before any design, because everything after follows from it:

- **Who it is for:** particular people in a particular situation. "Parents in Leith on the school
  run", not "everyone".
- **What it offers, and why them:** the one difference that matters to those people.
- **The promise**, one sentence: "For [who], [name] is the [what] that [difference]."
- **Personality:** three to five words, each with what it is not ("warm, not cutesy"; "expert, not
  stuffy"). Stuck? Choose which one or two lead: sincere, exciting, competent, sophisticated, rugged.
- **Values** only if they decide real things ("we repair before we replace").

## 3. Voice and tone

The voice is the personality in words and stays the same; the tone shifts with the moment (a launch,
a late order, a complaint, a club win). For each personality word, one line that does it and one that
does not:

| Trait | Do | Don't |
| --- | --- | --- |
| Warm | "Pop in, the kettle's on." | "Customers are welcome during opening hours." |
| Clear | "Open 7 to 3, Monday to Saturday." | "We operate extended hours on most weekdays." |
| Local | "Oats from a farm in Fife." | "Locally sourced premium ingredients." |

Add words they use and avoid ("pupils" or "students"), how the tone shifts in their real situations,
and two or three before-and-after rewrites of their own texts (the plain-language skill helps).

## 4. Colours

- Four to six: one main colour people will remember, one or two accents, and neutrals for text and
  backgrounds (a near-black, a light background). Choose from the personality and the trade.
- Each gets a name, a hex value and a job (text, backgrounds, buttons, highlights). CMYK or a Pantone
  number only when a printer asks for one.
- Check every pair that will carry words with `scripts/palette_contrast.py` (in this skill's folder):
  `python3 scripts/palette_contrast.py ink=#1F2A37 oat=#F7F3EA rust=#C8481D white=#FFFFFF`.
  It marks each pair `text` (4.5:1, any size), `large` (3:1: headings of 24 px or more, icons, chart
  marks) or `decoration` (never text), and gives the nearest shade that passes as text on the
  lightest and darkest colours; for another background, run it with just the two colours. Bright
  yellows and oranges often fail on white: keep a darker version of them for text.
- Meaning never by colour alone (red against green above all). Try the palette on dark backgrounds.

## 5. Fonts

- Free fonts with a clear licence: Google Fonts, mostly under the SIL Open Font License (print, web
  and commercial use; check each font's page). No "free for personal use" fonts in a business.
- Two at most: one with character for headings and a plain, readable one for text, or one family in
  two weights. Pairs that work: Fraunces with Inter (warm), DM Serif Display with DM Sans (friendly),
  Space Grotesk with IBM Plex Sans (technical), Playfair Display with Source Sans 3 (classic),
  Atkinson Hyperlegible alone (made for easy reading).
- Sizes: text 16 px on screens and 10 to 11 pt in print; headings up a scale of about 1.25 (20, 25,
  31, 39 px); line height about 1.5 for text, 1.1 to 1.2 for headings.
- Fallbacks where the fonts are missing: a stack on the web (`Inter, Arial, sans-serif`), and in email
  and office documents the nearest common font (Arial, Georgia).

## 6. Logo directions

- Choose the kind first: a wordmark (the name in a chosen font: cheapest and clearest), a monogram,
  a symbol with the name, or a badge (clubs, crafts).
- Make three or four concepts with `generate_image` (the image-prompts skill): different ideas, not
  colour swaps; flat vector style, a plain background, the palette's hex values, the name in quotes,
  `transparent` where the model offers it. Check every letter.
- The person sees the concepts with your reply. To judge them, put them on a page beside the files
  (by file name), each on light and on dark, large and tiny (a 32 px browser tab, a 40 px round
  profile picture), and look at it with `ui_screenshot` (phase `check`), which they see too. A logo
  that fails small is not finished.
- A generated logo is a sketch: not a vector, perhaps close to someone's mark, and its ownership is
  unsettled in many countries. Redraw the chosen one as a vector: a designer, a vector editor (Inkscape
  is free), or for a wordmark or simple mark, SVG written by hand (the diagrams skill's SVG method),
  with the text turned into outlines before it goes to a printer.
- Before money goes into signs and print, search the name and the mark: the trademark register where
  they trade (UK IPO, EUIPO, USPTO, or WIPO's Global Brand Database), company registers, domain names,
  social handles, and a reverse image search. This finds obvious clashes; it is not legal advice, and
  a business should ask a trademark attorney.
- Final versions: full colour, one colour (black, white), on dark; wide and stacked; the symbol
  alone, square; with the clear space around it and a smallest size.

## 7. Put it to work

- Profile pictures (shown as circles, often tiny), banners, business cards, an email signature,
  slides and post templates: sizes, safe areas and tested templates are in `references/applications.md`.
- Make them in the brand's colours and fonts: posts and banners as pages rendered to picture files
  (as the infographics skill does), slides with `save_slides`, letters and handouts with `save_doc`.
- Keep a style line for generated pictures (palette, photo or illustration style, mood) and paste it
  into every prompt, as the image-prompts skill does for a series.

## 8. The brand card and the brand book

- **Brand card**, one page, the part people really use: name and promise, logo versions, swatches
  with names, hex and the text pairs that pass, the two fonts with sizes, the personality words, and
  the voice with a do and a don't. Draft it with `show_html`; keep it with `save_page` (it opens on a
  phone) and make a PDF with `export_page`.
- **Brand book**, when others will write or design for them (staff, volunteers, a printer): strategy,
  voice and tone with examples, logo rules, colours, type, pictures, applications, where the files
  live, who to ask, the date. Write it with `save_doc` (they edit, print and export it).
- A tested brand card page and the brand book's outline are in `references/brand-book.md`.
- If later conversations should use the brand, offer a short memory note (`remember`, only if they
  agree): name, hex values, fonts, the voice in a line, and where the brand book is.

## 9. Where the files live

One folder with plain names, in the project's folder when there is a project, so every session there
finds it. Hand files over with `present_files`.

```
Brand/
  brand-card.pdf, brand-book.pdf   (both also in the Library)
  logo/        logo.svg, logo-black.svg, logo-white.svg, symbol.svg, symbol-512.png, favicon-32.png
  colours.txt  names, hex values and jobs; the palette check's output
  fonts.txt    the fonts, where to get them, their licences
  templates/   post, banner, email signature, business card
  photos/      each with where it came from and the right to use it
```

## 10. Check before handing over

- Every text and background pair in use passes; the palette check's output is in colours.txt.
- The logo reads at 32 px and in one colour, on light and on dark.
- Names, hex values and fonts are the same on the card, in the book and in every template.
- The fonts' licences cover print, web and commercial use.
- The name and mark searches are done, or recommended in writing.
- The voice examples, read aloud, sound like the person.

## Pitfalls

- A logo before anyone knows who the brand is for.
- Too many colours and fonts; a pale brand colour used for text.
- A generated logo used as the final one, not redrawn and not checked.
- "Free for personal use" fonts in a business.
- Values and slogans that could belong to anyone.
- A look borrowed too closely from a famous brand or a competitor.
- A forty-page book nobody opens, instead of a one-page card everyone uses.
