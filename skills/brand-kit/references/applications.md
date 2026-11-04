# Putting the brand to work

## Sizes and safe areas

As the platforms' own help pages gave them in November 2026. They change: when a size matters, check
the upload screen or the help page first.

| Where | Make it | Keep in mind |
| --- | --- | --- |
| Profile picture (every platform) | square, 800×800 | shown as a circle, often 40 px or smaller: the symbol alone, centred, inside the middle 70%; no small words |
| X header | 1500×500 | the profile picture covers part of the bottom left |
| LinkedIn personal background | 1584×396 | the profile picture covers the left; keep words to the right |
| LinkedIn company page, Facebook cover | check the upload screen | sizes differ between sources in 2026; shown wider on computers than on phones, so words go in the middle |
| YouTube channel banner | 2560×1440 (at least 2048×1152) | words and logo inside the centre 1546×423 (1235×338 on a 2048×1152 picture); phones and computers crop the rest |
| Posts and stories | see the social-media skill | |
| Browser tab icon | a 32×32 PNG and an SVG; 180×180 PNG for Apple devices | the symbol only |
| Slides | 16:9, with `save_slides` | title, section and content slides in the brand's colours and fonts |
| Business card | 85×55 mm (Europe) or 3.5×2 in (US), plus 3 mm bleed on each side | text at least 7 pt and 3 mm or more inside the cut; the printer's own template and rules win |
| Email signature | at most 600 px wide | text as text; a small logo |

## Banners and profile pictures

- Make each as a page of exactly its size with the brand's colours and fonts (the logo as an `<img>`
  or inline SVG beside the page), and render it to a PNG with Chrome as the infographics skill's
  build-and-export reference shows.
- While drafting, draw the safe area as a dashed rectangle on top; take it out before the final
  render. Look at the result small (a profile picture at 40 px) before handing it over.

## Business card, as a print-ready PDF

Tested: Chrome prints it as two pages (front, back) of exactly 91×61 mm, which is the card plus its
bleed. The colour runs to the edge of the bleed; words stay 4 mm inside the cut. Change the colours,
fonts and words; check the printer's own rules (bleed, colour, file type) before ordering.

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;600&display=block">
<style>
  @page { size: 91mm 61mm; margin: 0; }   /* an 85 × 55 mm card with 3 mm bleed on every side */
  html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { margin: 0; }
  .side { box-sizing: border-box; width: 91mm; height: 61mm; padding: 7mm; overflow: hidden;
          font: 8.5pt/1.35 Inter, Arial, sans-serif; }   /* 7 mm = 3 mm bleed + 4 mm inside the cut */
  .side + .side { break-before: page; }
  .front { display: grid; place-items: center; background: #C8481D; color: #FFFFFF; }
  .front div { font: 600 26pt Fraunces, Georgia, serif; }
  .back { background: #F7F3EA; color: #1F2A37; }
  .back p { margin: 0; }
  .back .who { margin-bottom: 1.5mm; font: 600 11pt Fraunces, Georgia, serif; }
</style></head>
<body>
  <div class="side front"><div>Spurtle</div></div>
  <div class="side back">
    <p class="who">Mairi Campbell</p>
    <p>Owner, Spurtle porridge bar</p>
    <p style="margin-top: 4mm">0131 496 0123<br>hello@spurtle.example<br>Leith, Edinburgh</p>
  </div>
</body></html>
```

Print it with Chrome's `--print-to-pdf` (the command is in the infographics skill's build-and-export
reference); `export_page` would put it on an A4 page instead.

## Email signature

Text as text, not a picture: pictures are often blocked, and screen readers cannot read them. Email
programs lack web fonts, so use Arial or Georgia. The logo comes from a public `https` address on the
person's own website (128×128 file, shown at 64 px), with `width`, `height` and `alt` set. Tested:

```html
<table cellpadding="0" cellspacing="0" border="0" style="font: 14px/1.4 Arial, sans-serif; color: #1F2A37;">
  <tr>
    <td style="padding-right: 14px; vertical-align: top;">
      <img src="https://spurtle.example/logo-email.png" width="64" height="64" alt="Spurtle" style="display: block;">
    </td>
    <td style="padding-left: 14px; border-left: 2px solid #C8481D; vertical-align: top;">
      <strong style="font-size: 15px;">Mairi Campbell</strong><br>
      Owner, Spurtle porridge bar<br>
      <a href="tel:+441314960123" style="color: #1F2A37; text-decoration: none;">0131 496 0123</a> &middot;
      <a href="https://spurtle.example" style="color: #C8481D;">spurtle.example</a>
    </td>
  </tr>
</table>
```

Show it with `show_html` (the logo will not load until its address is real), then the person selects
it, copies it and pastes it into their email program's signature setting.
