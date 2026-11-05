// The page kit's stylesheet: the ready-made classes every page agents make can use (options, picture cards,
// compare tables, pros and cons, buttons, fields), and the colours, font and corners they take, as CSS
// variables. Its colours are Hydor's own, light, and dark for a page with body.n-page in the dark; inside
// the app, the app gives the page its current theme's colours and font in their place (pages/frame.tsx), so a
// page made with them looks like part of the app. Shared: the server puts it in every page, and a page saved
// as a file takes it along.
//
// It also styles the blocks the page editor writes as Notion does (to-dos, toggles, callouts, columns, a table of
// contents, a cover and an icon, a video's still, maths, colours of words and of blocks, a block kept under a list's
// item): in a page with the kit's look they take its colours; in a page of its own look, shades of its own text colour,
// so they suit it light or dark.

/** The ready-made classes and their colours. Light by default; body.n-page follows the app's dark theme. */
export const KIT_CSS = `
:root{--n-bg:#f6f5f1;--n-card:#fff;--n-fg:#1b1915;--n-muted:#615a4d;--n-line:#e0dbd0;--n-soft:#eae7df;--n-accent:#805a00;--n-accent-fg:#fff;--n-accent-soft:rgba(128,90,0,.12);--n-ok:#156b35;--n-warn:#9c4704;--n-err:#bd2525;--n-info:#1d4ed8;--n-c1:#805a00;--n-c2:#1d4ed8;--n-c3:#156b35;--n-c4:#9c4704;--n-c5:#c25a37;--n-c6:#5f4fd0;--n-radius:12px;--n-font:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;--n-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
html[data-n-theme=dark] .n-page{--n-bg:#000000;--n-card:#151820;--n-fg:#e9edf5;--n-muted:#8f99ab;--n-line:#262b36;--n-soft:#1b1f27;--n-accent:#8aa8ff;--n-accent-fg:#0b1226;--n-accent-soft:rgba(138,168,255,.14);--n-ok:#6fd39a;--n-warn:#f2b468;--n-err:#f28b8b;--n-info:#5cc8e8;--n-c1:#8aa8ff;--n-c2:#5cc8e8;--n-c3:#6fd39a;--n-c4:#f2b468;--n-c5:#f0a07f;--n-c6:#b9a9ff;color-scheme:dark}
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
.n-scroll>.n-compare,.n-scroll>.n-tbl{margin:0}
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
.n-todo{list-style:none;padding-left:0}
.n-todo li{display:flex;flex-wrap:wrap;align-items:flex-start;gap:0 .55em;margin:.2em 0}
.n-todo li>input[type=checkbox]{flex:none;width:1.05em;height:1.05em;margin:.25em 0 0;accent-color:currentColor;cursor:pointer}
.n-page .n-todo li>input[type=checkbox]{accent-color:var(--n-accent)}
.n-todo li>span{flex:1;min-width:0}
.n-todo li>input:checked+span{text-decoration:line-through;opacity:.6}
.n-todo li>ul,.n-todo li>ol{flex-basis:100%;margin:0;padding-left:1.6em}
li.n-block{display:block;list-style:none}
li.n-block>:not(ul,ol){margin-top:.1em;margin-bottom:.1em}
.n-toggle{margin:.3em 0}
.n-toggle>summary{cursor:pointer;padding:.1em 0}
.n-toggle>summary::marker{color:color-mix(in srgb,currentColor 55%,transparent)}
.n-toggle>:not(summary){margin-left:1.3em}
.n-callout{display:flex;align-items:flex-start;gap:.65em;margin:.7em 0;padding:.85em 1em;border-radius:var(--n-radius,12px);background:color-mix(in srgb,currentColor 6%,transparent)}
:where(.n-page) .n-callout{background:var(--n-soft)}
.n-callout-icon{flex:none;font-size:1.2em;line-height:1.3}
.n-callout-text{flex:1;min-width:0}
.n-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:1.25em;margin:.8em 0}
.n-cols>*{min-width:0}
.n-cols>*>:first-child{margin-top:0}
.n-toc{display:flex;flex-direction:column;align-items:flex-start;gap:.2em;margin:.8em 0}
.n-toc a{color:inherit;text-decoration:none;opacity:.78;border-bottom:1px solid color-mix(in srgb,currentColor 25%,transparent)}
.n-toc a:hover{opacity:1}
.n-toc .n-toc-2{margin-left:1.2em}
.n-toc .n-toc-3{margin-left:2.4em}
.n-cover{display:block;box-sizing:border-box;width:100%;height:clamp(120px,24vw,240px);margin:0 0 1.2em;border:0;border-radius:var(--n-radius,12px);object-fit:cover;background-color:color-mix(in srgb,currentColor 8%,transparent);background-position:center;background-size:cover}
.n-icon{font-size:56px;line-height:1.1;margin:.1em 0 .2em}
.n-cover+.n-icon{position:relative;margin-top:-50px;padding-left:12px}
.n-video{position:relative;display:block;aspect-ratio:16/9;margin:.8em 0;border-radius:var(--n-radius,12px);overflow:hidden;background:#15161a;color:#fff;text-decoration:none}
.n-video>img{display:block;width:100%;height:100%;object-fit:cover}
.n-video::after{content:"";position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(0,0,0,.62) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='white' d='M8 5.5v13l11-6.5z'/%3E%3C/svg%3E") center/30px no-repeat}
.n-math{margin:.8em 0;overflow-x:auto;overflow-y:hidden;text-align:center}
.n-tbl{width:100%;border-collapse:collapse;margin:.8em 0}
.n-tbl th,.n-tbl td{padding:.45em .7em;border:1px solid color-mix(in srgb,currentColor 18%,transparent);text-align:left;vertical-align:top}
.n-tbl th{font-weight:600;background:color-mix(in srgb,currentColor 5%,transparent)}
.n-page .n-tbl th,.n-page .n-tbl td{border-color:var(--n-line)}
.n-page .n-tbl th{background:var(--n-soft)}
pre.n-code{padding:.85em 1em;border-radius:var(--n-radius,12px);background:color-mix(in srgb,currentColor 7%,transparent);overflow-x:auto;font-size:.88em;line-height:1.55;white-space:pre}
:where(.n-page) pre.n-code{background:var(--n-soft)}
img.n-pic{display:block;max-width:100%;height:auto;margin:.8em 0;border-radius:calc(var(--n-radius,12px) * .6)}
.n-tc-grey{color:color-mix(in srgb,#787774 78%,currentColor)}
.n-tc-brown{color:color-mix(in srgb,#9f6b53 78%,currentColor)}
.n-tc-orange{color:color-mix(in srgb,#d9730d 78%,currentColor)}
.n-tc-yellow{color:color-mix(in srgb,#cb912f 78%,currentColor)}
.n-tc-green{color:color-mix(in srgb,#448361 78%,currentColor)}
.n-tc-blue{color:color-mix(in srgb,#337ea9 78%,currentColor)}
.n-tc-purple{color:color-mix(in srgb,#9065b0 78%,currentColor)}
.n-tc-pink{color:color-mix(in srgb,#c14c8a 78%,currentColor)}
.n-tc-red{color:color-mix(in srgb,#d44c47 78%,currentColor)}
.n-hl-grey{background-color:color-mix(in srgb,#787774 20%,transparent)}
.n-hl-brown{background-color:color-mix(in srgb,#9f6b53 20%,transparent)}
.n-hl-orange{background-color:color-mix(in srgb,#d9730d 20%,transparent)}
.n-hl-yellow{background-color:color-mix(in srgb,#dfab01 24%,transparent)}
.n-hl-green{background-color:color-mix(in srgb,#448361 20%,transparent)}
.n-hl-blue{background-color:color-mix(in srgb,#337ea9 20%,transparent)}
.n-hl-purple{background-color:color-mix(in srgb,#9065b0 20%,transparent)}
.n-hl-pink{background-color:color-mix(in srgb,#c14c8a 20%,transparent)}
.n-hl-red{background-color:color-mix(in srgb,#d44c47 20%,transparent)}
mark[class*=n-hl-]{color:inherit;padding:0 .1em;border-radius:.2em}
:is(p,h1,h2,h3,h4,h5,h6,li,blockquote,details,div):not(.n-callout)[class*=n-hl-]{padding:.15em .4em;border-radius:.3em}
n-form,n-result,n-table,n-runs,n-count,n-chat{display:block}
n-button{display:inline-block}
.n-app-form{display:grid;gap:12px}
.n-app-form .n-field{margin:0}
.n-app-check{display:flex;align-items:center;gap:8px;font-size:14px}
.n-app-check input{width:18px;height:18px;accent-color:var(--n-accent)}
.n-app-status{font-size:13px;color:var(--n-muted)}
.n-app-status.n-app-ok{color:var(--n-ok)}
.n-app-status.n-app-err{color:var(--n-err)}
.n-app-result{display:grid;grid-template-columns:minmax(110px,max-content) 1fr;gap:8px 16px;margin:0;padding:14px 16px;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card);font-size:14px}
.n-app-result dt{color:var(--n-muted)}
.n-app-result dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-width:520px){.n-app-result{grid-template-columns:1fr}.n-app-result dd{margin-bottom:6px}}
.n-app-table{overflow-x:auto;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card)}
.n-app-table table{width:100%;border-collapse:collapse;font-size:14px}
.n-app-table th{text-align:left;font-weight:500;color:var(--n-muted);padding:8px 12px;border-bottom:1px solid var(--n-line);white-space:nowrap}
.n-app-table td{padding:8px 12px;border-bottom:1px solid var(--n-line);vertical-align:top;overflow-wrap:anywhere}
.n-app-table tr:last-child td{border-bottom:0}
.n-app-table input[type=checkbox]{width:17px;height:17px;accent-color:var(--n-accent)}
.n-app-x{border:0;background:none;color:var(--n-muted);cursor:pointer;font:inherit;font-size:17px;line-height:1;padding:0 4px}
.n-app-x:hover{color:var(--n-err)}
.n-app-search{display:block;width:100%;box-sizing:border-box;margin:0 0 10px;padding:8px 10px;border:1px solid var(--n-line);border-radius:10px;background:var(--n-card);color:var(--n-fg);font:inherit;font-size:15px;outline:none}
.n-app-search:focus{border-color:var(--n-accent);box-shadow:0 0 0 3px var(--n-accent-soft)}
.n-app-empty{padding:12px 14px;color:var(--n-muted);font-size:14px}
.n-app-runs{list-style:none;margin:0;padding:0;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card)}
.n-app-runs li{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;padding:8px 12px;border-bottom:1px solid var(--n-line);font-size:14px}
.n-app-runs li:last-child{border-bottom:0}
.n-app-runs .n-app-ok{color:var(--n-ok)}
.n-app-runs .n-app-err{color:var(--n-err)}
.n-app-count{font-size:34px;font-weight:700;letter-spacing:-.02em;line-height:1.1}
.n-chat-msgs{display:flex;flex-direction:column;gap:8px;max-height:460px;overflow-y:auto;padding:12px;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card)}
.n-chat-msgs>.n-app-empty{padding:2px 0}
.n-chat-msg{max-width:85%;padding:8px 12px;border-radius:12px;font-size:14.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.n-chat-you{align-self:flex-end;background:var(--n-accent-soft)}
.n-chat-agent{align-self:flex-start;background:var(--n-soft)}
.n-chat-queued{opacity:.6}
.n-chat-form{display:grid;gap:8px;margin-top:10px}
.n-chat-box{box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--n-line);border-radius:10px;background:var(--n-card);color:var(--n-fg);font:inherit;font-size:16px;resize:vertical;outline:none}
.n-chat-box:focus{border-color:var(--n-accent);box-shadow:0 0 0 3px var(--n-accent-soft)}
.n-chat-more{display:flex;gap:12px;margin-left:auto}
.n-chat-link{border:0;padding:0;background:none;color:var(--n-muted);font:inherit;font-size:13px;cursor:pointer}
.n-chat-link:hover{color:var(--n-accent)}
.n-chat-menu{list-style:none;margin:0;padding:0;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card)}
.n-chat-menu button{display:flex;gap:10px;width:100%;padding:8px 12px;border:0;border-bottom:1px solid var(--n-line);background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
.n-chat-menu li:last-child button{border-bottom:0}
.n-chat-menu button:hover{background:var(--n-soft)}
.n-chat-first{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.n-chat-menu .n-muted{flex:none}
n-form:not(:defined),n-result:not(:defined),n-table:not(:defined),n-runs:not(:defined),n-count:not(:defined),n-chat:not(:defined),n-button:not(:defined){display:block;padding:14px;border:1px dashed var(--n-line);border-radius:var(--n-radius);color:var(--n-muted);font-size:13px}
n-form:not(:defined)::before{content:var(--n-w-form-a,"Form: ") attr(flow) var(--n-w-form-b,"")}
n-result:not(:defined)::before{content:var(--n-w-answer-a,"Answer: ") attr(flow) var(--n-w-answer-b,"")}
n-table:not(:defined)::before{content:var(--n-w-table-a,"Table: ") attr(data) var(--n-w-table-b,"")}
n-runs:not(:defined)::before{content:var(--n-w-runs-a,"Runs: ") attr(flow) var(--n-w-runs-b,"")}
n-count:not(:defined)::before{content:var(--n-w-count-a,"Count: ") attr(data) var(--n-w-count-b,"")}
n-chat:not(:defined)::before{content:var(--n-w-chat-a,"A conversation with its agent") var(--n-w-chat-b,"")}
`
  .trim()
  .replace(/\n/g, '');
