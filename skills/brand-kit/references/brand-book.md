# The brand card and the brand book

## The brand card, as a page

Tested: it shows with `show_html`, keeps with `save_page`, and `export_page` prints it on one A4 page.
It uses the brand's own colours and fonts, not the app's theme, because it shows the brand.

What to change: the colours and fonts in `:root` and the Google Fonts link; the texts; one swatch per
colour, with its job; the text pairs, copied from the palette check's output; the logo, once there
are files (an SVG pasted in as `<img src="data:image/svg+xml;base64,…">` is small; until then the
wordmark in its font stands in). Keep the print block: it fits the card on one page.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spurtle: brand card</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;600&display=swap">
<style>
  :root { --ink: #1F2A37; --paper: #F7F3EA; --accent: #C8481D; --quiet: #4B5563; --edge: #1F2A3726;
          --head: Fraunces, Georgia, serif; --text: Inter, Arial, sans-serif; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.5 var(--text); }
  .card { padding: 28px clamp(16px, 4vw, 48px); }
  h1, h2 { margin: 0; font-family: var(--head); font-weight: 600; }
  h1 { font-size: 40px; line-height: 1.1; }
  h2 { margin: 26px 0 10px; font-size: 22px; }
  p { margin: 0; }
  .promise { margin-top: 8px; font-size: 18px; }
  .row { display: flex; flex-wrap: wrap; gap: 12px; }
  .logo { display: grid; place-items: center; min-width: 96px; height: 88px; padding: 0 20px;
          border-radius: 12px; border: 1px solid var(--edge); font: 600 32px var(--head); }
  .swatches { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .swatch { overflow: hidden; border-radius: 12px; border: 1px solid var(--edge); background: #fff; font-size: 14px; }
  .chip { height: 64px; }
  .swatch p { padding: 8px 12px 0; }
  .swatch p + p { padding: 0 12px 10px; color: var(--quiet); }
  .type { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
  .note { margin-top: 8px; color: var(--quiet); font-size: 14px; }
  .tag { padding: 4px 12px; border-radius: 999px; border: 1px solid var(--edge); background: #fff; }
  table { width: 100%; margin-top: 12px; border-collapse: collapse; font-size: 15px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid var(--edge); text-align: left; vertical-align: top; }
  html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }   /* print the colours */
  @media print {   /* one A4 page */
    body { font-size: 13px; }
    .card { padding: 0; }
    h1 { font-size: 32px; }
    h2 { margin: 16px 0 8px; font-size: 18px; }
    .promise { font-size: 15px; }
    .logo { height: 60px; font-size: 26px; }
    .chip { height: 36px; }
    .swatch, .note, table { font-size: 12px; }
  }
</style>
</head>
<body>
<div class="card">
  <h1>Spurtle</h1>
  <p class="promise">For parents in Leith on the school run, Spurtle is the porridge bar with a warm, healthy
    breakfast ready in two minutes, made from oats grown in Fife.</p>

  <h2>Logo</h2>
  <div class="row">
    <!-- The logo's files go here (<img src="data:image/svg+xml;base64,…">); until then, the wordmark in its font. -->
    <div class="logo" style="background: var(--paper); color: var(--accent)">Spurtle</div>
    <div class="logo" style="background: var(--ink); color: var(--paper)">Spurtle</div>
    <div class="logo" style="background: var(--accent); color: #fff">S</div>
  </div>
  <p class="note">Clear space: the height of the S on every side. Smallest: 24 mm wide in print, 96 px on screens.</p>

  <h2>Colours</h2>
  <div class="swatches">
    <div class="swatch"><div class="chip" style="background: #1F2A37"></div><p><b>Ink</b> #1F2A37</p><p>Text; the logo on light</p></div>
    <div class="swatch"><div class="chip" style="background: #F7F3EA"></div><p><b>Oat</b> #F7F3EA</p><p>Backgrounds</p></div>
    <div class="swatch"><div class="chip" style="background: #C8481D"></div><p><b>Rust</b> #C8481D</p><p>The logo, buttons, highlights</p></div>
    <div class="swatch"><div class="chip" style="background: #E9B44C"></div><p><b>Honey</b> #E9B44C</p><p>Accents, never text</p></div>
    <div class="swatch"><div class="chip" style="background: #5E7A52"></div><p><b>Sage</b> #5E7A52</p><p>Labels for vegan dishes</p></div>
  </div>
  <p class="note">Text that passes (4.5:1): ink on oat, white or honey; rust or sage on white; white on rust.
    Rust on oat only for headings of 24 px or more (4.31:1).</p>

  <h2>Type</h2>
  <div class="type">
    <div><p style="font: 600 32px/1.15 var(--head)">Fraunces SemiBold</p>
      <p class="note">Headings: 40, 31, 25 and 20 px. Georgia where Fraunces is missing.</p></div>
    <div><p>Inter Regular for all text: 16 px on screens, 10.5 pt in print, line height 1.5.</p>
      <p class="note">Arial where Inter is missing (email, office documents).</p></div>
  </div>

  <h2>Personality and voice</h2>
  <div class="row"><span class="tag">Warm, not cutesy</span><span class="tag">Clear</span><span class="tag">Local</span></div>
  <table>
    <tr><th>Do</th><th>Don't</th></tr>
    <tr><td>"Pop in, the kettle's on."</td><td>"Customers are welcome during opening hours."</td></tr>
    <tr><td>"Oats from a farm in Fife."</td><td>"Locally sourced premium ingredients."</td></tr>
  </table>

  <p class="note">Files: the Brand folder (logo, fonts, templates). The full rules: "Spurtle brand book" in the
    Library. Version 1, November 2026. Questions: Mairi.</p>
</div>
</body>
</html>
```

## The brand book

Write it with `save_doc`, in this order; a heading per part, short paragraphs, tables for values.
Pictures of the logo go in as files of the session (`![Logo on dark](logo/logo-white.png){width=40%}`).

1. **Who we are:** who it is for, the promise, the personality words with what each is not, the
   values that decide things.
2. **How we sound:** each voice word with a do and a don't; how the tone shifts (launch, late order,
   complaint, apology, event); words we use and avoid; two or three before-and-after rewrites.
3. **Logo:** each version (full colour, one colour, on dark, wide, stacked, symbol) with a picture and
   when to use it; the clear space; the smallest size; what never to do: stretch it, recolour it,
   turn it, add shadows or outlines, put it on a busy photo.
4. **Colours:** a table (name, hex, job, which colours may be text on it), the palette check's
   output, and CMYK values only if a printer gave them.
5. **Type:** the fonts, where to download them and their licence; sizes for screen and print;
   fallbacks (Arial, Georgia) for email and office documents.
6. **Pictures:** what photos show (real people, real places, natural light) and what to avoid; the
   illustration style; the style line pasted into every `generate_image` prompt.
7. **Where it goes:** profile pictures, banners, business card, email signature, slides, posts:
   the sizes, and where each template is.
8. **Files and contact:** the folder and what is in it; who decides when something is unclear; the
   version and the date, and what changed since the last one.

## An example of the first part

> **Who we are.** Spurtle is a porridge bar in Leith for parents on the school run. For them,
> Spurtle is the porridge bar with a warm, healthy breakfast ready in two minutes, made from oats
> grown in Fife.
>
> **Personality.** Warm, not cutesy. Clear, not curt. Local, not twee.
>
> **What we stand by.** We name the farm. We would rather sell out than reheat.
