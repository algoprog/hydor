// The page kit's stylesheet: the ready-made classes every page agents make can use (options, picture cards,
// compare tables, pros and cons, buttons, fields), and the colours, font and corners they take, as CSS
// variables. Its colours are Naget's own, light, and dark for a page with body.n-page in the dark; inside
// the app, the app gives the page its current theme's colours and font in their place (pages/frame.tsx), so a
// page made with them looks like part of the app. Shared: the server puts it in every page, and a page saved
// as a file takes it along.

/** The ready-made classes and their colours. Light by default; body.n-page follows the app's dark theme. */
export const KIT_CSS = `
:root{--n-bg:#f6f5f1;--n-card:#fff;--n-fg:#1b1915;--n-muted:#615a4d;--n-line:#e0dbd0;--n-soft:#eae7df;--n-accent:#805a00;--n-accent-fg:#fff;--n-accent-soft:rgba(128,90,0,.12);--n-ok:#156b35;--n-warn:#9c4704;--n-err:#bd2525;--n-info:#1d4ed8;--n-c1:#805a00;--n-c2:#1d4ed8;--n-c3:#156b35;--n-c4:#9c4704;--n-c5:#c25a37;--n-c6:#5f4fd0;--n-radius:12px;--n-font:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;--n-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
html[data-n-theme=dark] .n-page{--n-bg:#121110;--n-card:#1b1a17;--n-fg:#f2eee7;--n-muted:#9b9386;--n-line:#302c26;--n-soft:#22201c;--n-accent:#d4b158;--n-accent-fg:#1a1306;--n-accent-soft:rgba(212,177,88,.14);--n-ok:#6dbb84;--n-warn:#e0a25a;--n-err:#e57373;--n-info:#82a8ff;--n-c1:#d4b158;--n-c2:#82a8ff;--n-c3:#6dbb84;--n-c4:#e0a25a;--n-c5:#e8916f;--n-c6:#ada1ff;color-scheme:dark}
html[data-n-theme=dark]:has(>body.n-page){color-scheme:dark}
.n-page{margin:0 auto;padding:20px;background:var(--n-bg);color:var(--n-fg);font:15px/1.55 var(--n-font);-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
.n-page code,.n-page kbd,.n-page samp,.n-page pre{font-family:var(--n-mono)}
@media (max-width:480px){.n-page{padding:14px}}
.n-page h1{font-size:22px;line-height:1.25;margin:0 0 6px;letter-spacing:-.01em}
.n-page h2{font-size:17px;line-height:1.3;margin:22px 0 8px}
.n-page a{color:var(--n-accent)}
.n-muted{color:var(--n-muted)}
.n-options{display:flex;flex-direction:column;gap:10px;margin:14px 0}
.n-option{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card);color:inherit;font:inherit;text-align:left}
.n-letter{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--n-soft);color:var(--n-muted);font-weight:600;font-size:13px}
.n-option h3,.n-card h3{margin:0 0 2px;font-size:15px;line-height:1.35}
.n-option p,.n-card p{margin:0;color:var(--n-muted);font-size:13.5px;line-height:1.45}
.n-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,200px),1fr));gap:12px;margin:14px 0}
.n-card{position:relative;display:flex;flex-direction:column;padding:0;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card);overflow:hidden;color:inherit;font:inherit;text-align:left}
.n-card>img,.n-media{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--n-soft)}
.n-body{padding:12px 14px}
[data-choice]{cursor:pointer;-webkit-tap-highlight-color:transparent;transition:border-color .15s,box-shadow .15s,background-color .15s}
.n-option:hover,.n-card:hover{border-color:var(--n-accent)}
[data-choice]:focus-visible{outline:2px solid var(--n-accent);outline-offset:2px}
.n-selected{border-color:var(--n-accent)!important;box-shadow:0 0 0 3px var(--n-accent-soft)}
.n-option.n-selected .n-letter{background:var(--n-accent);color:var(--n-accent-fg)}
.n-card.n-selected::after{content:"✓";position:absolute;top:8px;right:8px;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--n-accent);color:var(--n-accent-fg);font-size:13px;font-weight:700}
.n-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:14px 0}
.n-compare{width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--n-line);border-radius:var(--n-radius);overflow:hidden;background:var(--n-card);font-size:14px;margin:14px 0}
.n-scroll>.n-compare{margin:0}
.n-compare th,.n-compare td{padding:9px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--n-line)}
.n-compare tr:last-child>*{border-bottom:0}
.n-compare thead th{background:var(--n-soft);font-weight:600}
.n-compare tbody th{font-weight:500;color:var(--n-muted)}
.n-compare .n-selected,.n-best{box-shadow:none;background:var(--n-accent-soft)}
.n-yes{color:var(--n-ok)}
.n-no{color:var(--n-err)}
.n-proscons{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
@media (max-width:520px){.n-proscons{grid-template-columns:1fr}}
.n-pros,.n-cons{padding:12px 14px;border-radius:var(--n-radius);background:var(--n-soft)}
.n-pros h4,.n-cons h4{margin:0 0 6px;font-size:13px;font-weight:600}
.n-pros h4{color:var(--n-ok)}
.n-cons h4{color:var(--n-err)}
.n-pros ul,.n-cons ul{margin:0;padding-left:18px;font-size:14px;line-height:1.5}
.n-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.n-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border:1px solid var(--n-line);border-radius:10px;background:var(--n-card);color:var(--n-fg);font:inherit;font-size:14px;font-weight:500;text-decoration:none;cursor:pointer}
.n-btn:hover{background:var(--n-soft)}
.n-btn.n-primary{border-color:transparent;background:var(--n-accent);color:var(--n-accent-fg)}
.n-btn.n-primary:hover{filter:brightness(1.07)}
.n-field{display:flex;flex-direction:column;gap:5px;margin:0 0 12px;font-size:13.5px;font-weight:500}
.n-field input,.n-field select,.n-field textarea{padding:8px 10px;border:1px solid var(--n-line);border-radius:10px;background:var(--n-card);color:var(--n-fg);font:inherit;font-size:16px;font-weight:400;outline:none}
.n-field input:focus,.n-field select:focus,.n-field textarea:focus{border-color:var(--n-accent);box-shadow:0 0 0 3px var(--n-accent-soft)}
.n-row>.n-field{margin:0}
.n-tag{display:inline-block;padding:1px 8px;border-radius:999px;background:var(--n-soft);color:var(--n-muted);font-size:12px;font-weight:500;line-height:1.6}
`
  .trim()
  .replace(/\n/g, '');
