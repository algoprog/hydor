---
name: text-from-pictures
description: Use when text has to be read from a picture, a photo of a document, a screenshot, a receipt or a scanned PDF whose pages have no selectable text.
category: documents
triggers: [ocr, scanned pdf, text from this image, read this receipt, photo of a document, scanned document]
---

# Text from pictures

The Text from pictures plugin gives you `ocr_image` and `ocr_pdf`. They run on this computer, so
private documents (IDs, bills, letters) are not sent anywhere.

## 1. Pick the right route

- A PDF that has a text layer (you can select text in it) reads better as text: use your document
  tools or the pdf skill first. Use `ocr_pdf` only when that text comes back empty or garbled.
- A picture: `ocr_image`. For a picture you can also see, look at it too: OCR gets the characters,
  you get the layout and meaning.

## 2. Read it

- Full paths only.
- `ocr_pdf` takes `pages` ("1-3,7") and `dpi` (200 by default; 300 for small print). Over 50 pages:
  work in batches and tell the user it takes a while.
- Ask for `lines: true` when you need confidence: low scores (under about 0.8) mark words to check.

## 3. Check what matters

- Numbers, dates, amounts, names and codes: check each one you will use against the picture or a
  second read at a higher dpi. OCR confuses 0/O, 1/l/I, 5/S, 8/B, and drops decimal points.
- Tables come back line by line: rebuild columns by position and check the totals add up.
- Say where it could not read (blurred, cut off, handwriting) instead of guessing.

## 4. Hand over

Give the text in the shape the user needs (a cleaned document, a table, the fields they asked for)
and say which parts were uncertain.

## Pitfalls

- OCR on a PDF that already has text: slower and worse.
- Rotated or skewed photos: straighten or rotate them first (ffmpeg or an image tool), then read.
- Handwriting: it reads print well and handwriting poorly; say so.
