// Designs as agents make them: what save_page's description says of them, the whole of how to write one (how_to_make
// answers it for every kind of design, with the user's brand kit when they have one), and what a save does to one:
// its stylesheet and fitting script put in its head, and its videos (files of the session) kept to play in it.
import { DESIGN_SIZES, isDesignHtml, sizeText, withDesignKit } from '../../shared/design.ts';
import { DESIGN_FONTS } from '../../shared/design-fonts.ts';
import { FRAME_IDS, SHAPE_IDS } from '../../shared/design-shapes.ts';
import type { DB } from '../db.ts';
import { keepVideoFile, videoAddress } from './videos.ts';

export const DESIGN_SAVE_NOTE =
  'A design (a poster, a flyer, a social media post, a story, a thumbnail, a banner, a card, an invitation, a certificate, a menu, a logo) is a page of fixed-size artboards the user edits as in Canva and downloads as a PNG, JPG or a PDF to print: how_to_make with "design" says how to write one, its sizes and its elements.';

/** The sizes, as the answer lists them. */
const sizes = () => DESIGN_SIZES.map((s) => `${s.label} ${s.w}×${s.h}${s.unit !== 'px' ? ` (${sizeText(s)})` : ''}`).join('; ');

/** How to write a design, in full: the agents' guide to the format the editor edits. */
export function designHow(): string {
  return [
    'How a design is written (save_page, with the whole page as html). Sizes, in CSS pixels at 96 to the inch: ' + sizes() + '; any other "WxH" too.',
    'Its body: <body class="n-design-page"><main class="n-design" data-size="instagram-post"><section class="n-artboard" data-w="1080" data-h="1080" style="width:1080px;height:1080px;background:#f4efe6"> … elements … </section></main></body>. Several artboards (sections) make a piece of several pages (a carousel, a two-sided card, a menu of pages); each has its own size.',
    'Every element is a direct child of an artboard (or of a group), placed by its own style in pixels: left, top, width (and height, but for words, whose box is as tall as they are), and a transform of rotate(Ndeg) only when it is turned (scaleX(-1) flips it). No margins, no flex or grid layout around elements, no translate: the editor reads and writes exactly these.',
    'Elements: words <div class="n-el n-text" style="left:80px;top:96px;width:920px;font-family:\'Montserrat\', sans-serif;font-size:96px;font-weight:800;line-height:1.05;color:#1d1b17">Summer sale</div> (<br> for a new line; effects as CSS: text-shadow, -webkit-text-stroke with paint-order:stroke fill for an outline, a gradient with background-clip:text; data-effect names it: shadow, lift, hollow, outline, glow, neon, echo, splice, gradient); a box <div class="n-el n-box" style="…;background:#ff5a36;border-radius:24px"></div> (border-radius:50% for a circle); a shape <div class="n-el n-shape" data-shape="star" style="…;color:#ffd23f"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="…" vector-effect="non-scaling-stroke"/></svg></div> (fill is its color; an outline: --n-stroke:#000;--n-sw:4px; shapes: ' +
      SHAPE_IDS.join(', ') +
      '; draw the path in the 100×100 box); a picture in a frame <div class="n-el n-pic" data-frame="circle" style="…;border-radius:50%"><img src="images/photo.png" alt="…"></div> (the img covers its frame; frames: ' +
      FRAME_IDS.join(', ') +
      ', cut with border-radius or a CSS mask of the shape; a place for the user to drop a picture: <div class="n-el n-pic n-ph" data-hint="Product photo" style="…;background:linear-gradient(135deg,#d8d2c6,#b9b1a3)"></div>); an icon <div class="n-el n-icon" style="…;color:#e4572e"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">…</svg></div>; a line <div class="n-el n-line n-arrow" style="left;top;width:300px;height:16px;color:#222;--n-lw:4px;--n-ls:dashed"></div> (n-arrow for an arrowhead); a QR code <div class="n-el n-qr" data-qr="https://…">an SVG of it</div>; a video <div class="n-el n-vid" style="…"><video src="clip.mp4" autoplay muted loop playsinline></video></div> (a video file of your folder: it is kept and plays in the page; controls instead of autoplay muted loop for one people play); a group <div class="n-el n-group" style="left;top;width;height"> elements placed inside it </div>. data-locked="1" keeps an element in place.',
    'Fonts: Google Fonts, loaded with <link id="n-fonts" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;700&display=swap"> in the head, asking only for weights each font has (fonts the editor offers: ' +
      DESIGN_FONTS.map((f) => f.name).join(', ') +
      '). A display font for the headline, a plain one for the rest.',
    'Pictures: make them with generate_image (a picture, a photo, a background; a cut-out of a person or a product with a transparent background) and name the file as an img\'s src (or in the artboard\'s background:url(images/bg.png) center/cover), never words in a picture: words are text elements, so the user can change them.',
    'Design well: one clear message, a big headline (a tenth of the artboard\'s width or more on a poster or a post), a clear order (headline, then details, then a call to act), two fonts at most, three or four colours (strong contrast between words and what is behind them), generous margins (at least 6% of the shorter side), everything inside the artboard (a YouTube banner\'s words inside its middle 1546×423), elements lined up with each other. The app adds the design\'s stylesheet and its fitting script when it is saved.',
  ].join('\n');
}

const HAS_VIDEO = /<video\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

/**
 * A page as save_page keeps it: a design with its stylesheet and script; a video an agent named by a file of its
 * session (a page's or a design's) kept by the app, at its address, its first frame as its still.
 */
export async function designForSave(db: DB, p: { html: unknown; notes: string[] }, cwd: string | undefined): Promise<{ html: unknown; notes: string[] }> {
  if (typeof p.html !== 'string') return p;
  let html = p.html;
  const notes = [...p.notes];
  const found = [...html.matchAll(HAS_VIDEO)].map((m) => ({ tag: m[0], src: m[1] })).filter((v) => !/^(https?:|data:|\/pg\/video\/|blob:)/i.test(v.src));
  for (const v of found.slice(0, 12)) {
    try {
      const kept = await keepVideoFile(db, v.src, cwd ?? '');
      const url = videoAddress(kept.src.slice('naget-video:'.length));
      let tag = v.tag.replace(v.src, url);
      if (kept.frame && !/\bposter\s*=/i.test(tag)) tag = tag.replace(/<video\b/i, `<video poster="data:image/jpeg;base64,${kept.frame.toString('base64')}"`);
      html = html.replace(v.tag, tag);
    } catch (e) {
      notes.push(`The video ${v.src} could not be kept (${(e as Error).message}): it will not play.`);
    }
  }
  return { html: isDesignHtml(html) ? withDesignKit(html) : html, notes };
}
