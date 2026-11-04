# Building an infographic, and exporting it

## The skeleton

A 1080×1350 graphic for phones (4:5), tested in Chrome: as a PNG at 2160×2700, and as a one-page PDF
of exactly the canvas. Its colours and fonts are its own, so it looks the same everywhere. The
picture is a file beside the page (`illustration.png`, made with `generate_image`); in a draft shown
with `show_html`, which cannot read files, put a plain box in its place:
`<rect x="80" y="304" width="920" height="392" fill="#E4DED2"/>`.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Repair café: spring and autumn 2026</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Inter:wght@400;600&display=block">
<style>
  @page { size: 1080px 1350px; margin: 0; }   /* for --print-to-pdf: one page, the canvas's size */
  html, body { margin: 0; background: #F7F3EA; }
  svg { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
<svg viewBox="0 0 1080 1350" role="img" aria-labelledby="ig-title ig-desc" xmlns="http://www.w3.org/2000/svg">
  <title id="ig-title">Spring fixed a bigger share of the items brought in</title>
  <desc id="ig-desc">Repair café, 2026. Spring: 18 of 30 items repaired (60%). Autumn: 24 of 60 items
    repaired (40%). Source: the club's repair log.</desc>
  <style>
    .ig-h1   { font: 700 68px Fraunces, Georgia, serif; fill: #1F2A37; }
    .ig-sub  { font: 400 34px Inter, Arial, sans-serif; fill: #4B5563; }
    .ig-h2   { font: 600 40px Inter, Arial, sans-serif; fill: #1F2A37; }
    .ig-text { font: 400 34px Inter, Arial, sans-serif; fill: #1F2A37; }
    .ig-big  { font: 700 96px Fraunces, Georgia, serif; }
    .ig-note { font: 400 30px Inter, Arial, sans-serif; fill: #4B5563; }
  </style>
  <rect width="1080" height="1350" fill="#F7F3EA"/>
  <!-- Grid: margins 80, columns from x=80 to x=1000 (920 wide), rows on multiples of 8. -->

  <!-- 1. Headline: the finding the numbers support; SVG text does not wrap, so one line each -->
  <text class="ig-h1" x="80" y="144">Spring fixed a bigger share</text>
  <text class="ig-sub" x="80" y="208">Autumn brought twice as many items,</text>
  <text class="ig-sub" x="80" y="256">but fewer than half of them were fixed.</text>

  <!-- 2. Picture: a plain box in a show_html draft; in the local file, an image beside the page -->
  <image href="illustration.png" x="80" y="304" width="920" height="392" preserveAspectRatio="xMidYMid slice"/>

  <!-- 3. Bars from the numbers: length = value / 100 × 920 (a rate out of 100%), from zero -->
  <text class="ig-h2" x="80" y="784">Share repaired</text>
  <rect x="80" y="816" width="920" height="56" fill="#E4DED2"/>
  <rect x="80" y="816" width="552" height="56" fill="#B23A0B"/>   <!-- 60% × 920 = 552 -->
  <text class="ig-text" x="80" y="920">Spring: 18 of 30 items, <tspan font-weight="600">60%</tspan></text>
  <rect x="80" y="960" width="920" height="56" fill="#E4DED2"/>
  <rect x="80" y="960" width="368" height="56" fill="#1F2A37"/>   <!-- 40% × 920 = 368 -->
  <text class="ig-text" x="80" y="1064">Autumn: 24 of 60 items, <tspan font-weight="600">40%</tspan></text>

  <!-- 4. What to do next (a fact the person gave), then the source -->
  <text class="ig-h2" x="80" y="1168">Next session: 14 March, Leith Library</text>
  <text class="ig-note" x="80" y="1272">Source: the club's repair log, March to November 2026</text>
</svg>
</body>
</html>
```

What to change: the size (`viewBox`, `@page`, and the coordinates), the words, the bars (their
widths from your numbers), the colours and the fonts. Prefix classes and ids with `ig-` (or the
graphic's own name) so they cannot clash with the page around it.

## Type sizes

| On a canvas 1080 wide, for phones | px |
| --- | --- |
| Headline | 64 to 96 |
| Section titles | 40 to 48 |
| Body text and labels | 34 to 40 |
| The smallest text (sources, notes) | 30 |

For print, work out units per point: canvas width ÷ paper width in mm × 0.353. A canvas 1000 wide on
A4 (210 mm) has 1.68 units to the point: body text of 10 to 11 pt is 17 to 19 units, a headline of 32
pt is 54 units, nothing under 8 pt (13 units). The same canvas on A3 has 1.19 units to the point.

## Text that fits

- SVG does not wrap text: one `<text>` per line, or `<tspan x="80" dy="1.25em">` for each further line.
- A line holds roughly its width ÷ (0.55 × font size) characters: 920 wide at 34 px is about 49.
  Count, then look at the render: a line that runs past the margin is the most common fault.
- Numbers line up with `font-variant-numeric: tabular-nums` on their class.
- Web fonts: a Google Fonts `<link>` with `display=block` loads before Chrome takes the picture
  (tested). Name a common fallback after each font (`Inter, Arial, sans-serif`).

## Finding Chrome or Chromium

- The browser the app itself uses: `app_api` with `GET /api/browser/settings`; its `chrome.path`.
  If there is none, **Settings → Browser** can download one.
- Otherwise: `google-chrome`, `chromium` or `chromium-browser` on Linux;
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on a Mac.

## Exporting

From the folder that holds the page and its pictures (Chrome wants whole paths):

```bash
CHROME="/path/to/chrome"
# A PNG at twice the canvas's pixels (2160x2700 here): sharp on every screen
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1080,1350 --screenshot="$PWD/infographic.png" "file://$PWD/infographic.html"
# A PDF of exactly the canvas (the page's @page rule sets its size), with sharp text for print
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PWD/infographic.pdf" "file://$PWD/infographic.html"
file infographic.png      # says: PNG image data, 2160 x 2700
pdfinfo infographic.pdf   # where installed; points are pixels × 0.75: 810 x 1013
```

- `--window-size` is the canvas's size; `--force-device-scale-factor=1` gives exactly that many pixels.
- If it stops with "No usable sandbox" (some Linux systems), add `--no-sandbox`: acceptable here,
  because the page is your own file.
- A page that draws with scripts (a chart library) may need `--virtual-time-budget=5000` so that it
  finishes before the picture is taken.
- For print, set the paper in the page: `@page { size: A3; margin: 0; }` with a canvas of the same
  shape (`viewBox="0 0 1000 1414"`) gives a one-page A3 PDF (tested). Ask the printer about bleed.
- Browsers leave out background colours when people print a page themselves unless the page says
  `html { print-color-adjust: exact; }`; the PDFs above keep them.

## A picture inside a page in the Library

A page kept with `save_page` (or shown with `show_html`) cannot read files, so a picture must be
pasted into it as base64. Make a small copy first, and paste the printed text into `href`:

```bash
ffmpeg -v error -y -i illustration.png -vf scale=480:-2 -q:v 5 small.jpg
python3 -c "import base64,sys; print(base64.b64encode(open(sys.argv[1],'rb').read()).decode())" small.jpg
```

`<image href="data:image/jpeg;base64,...">`. A 480-pixel copy is 30 to 45 KB, some 40,000 to 60,000
characters of text; the full picture would be many times that. Without ffmpeg, show the PNG instead.

## An SVG file

The `<svg>` element alone, saved as a `.svg` file, is a vector graphic that Inkscape or Illustrator
can edit; its pictures must sit beside it, and its fonts must be installed where it is opened. For a
printer, send the PDF: it carries its fonts.
