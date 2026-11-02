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
