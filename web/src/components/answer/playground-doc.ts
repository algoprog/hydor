// The page a code playground runs its code in (uis/code.tsx, `playground`): one whole HTML document per run, drawn in the
// app's sandboxed page frame, never in the app's own window. JavaScript runs in an async function and Python in Pyodide
// (loaded from jsDelivr, with the packages it names), each in a Worker the page makes from a blob: URL (Python's from a data: URL), so code that never
// ends freezes nothing: the page stops the Worker after a time limit and says so. Their console, errors, output and matplotlib
// figures come back as messages and are written as lines on the page. JavaScript that uses the page itself (document, alert…)
// has no page in a Worker and runs on the page's own thread instead; an HTML page is the page. The page takes the app's
// look (var(--n-fg) and the others of the pages' kit) and has no colour or font of its own.

export type PlayLang = 'javascript' | 'python' | 'html';

/** The Pyodide release Python runs on (its newest stable one; the `latest` tag of the npm package on jsDelivr). */
export const PYODIDE_VERSION = '314.0.8';
export const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** How long code may run before the page stops it, in seconds: JavaScript from the start, Python once it and its packages are loaded. */
export const JS_LIMIT = 10;
export const PY_LIMIT = 30;

/** The words the page says by itself, in the app's language (the view translates them). */
export interface PlayWords {
  /** "Loading Python…" */
  loading: string;
  /** "Loading packages…" */
  packages: string;
  /** "Running…", while code takes a moment. */
  running: string;
  /** "(no output)" */
  none: string;
  /** What shows when Python could not be loaded. */
  failed: string;
  /** What shows when a package could not be loaded, with {0} for its name. */
  package: string;
  /** What shows in place of the lines past the most it writes. */
  cut: string;
  /** What shows when the code was stopped for running too long, with {0} for the seconds. */
  stopped: string;
}

/** A value inside a <script>: JSON that cannot end the script or the line. */
const js = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(new RegExp('[\\u2028\\u2029]', 'g'), (c) => `\\u${c.charCodeAt(0).toString(16)}`);

/** An HTML fragment as a page of its own in the app's look; a whole page as it is (as the ```html live blocks of replies do). */
export function htmlPage(code: string): string {
  if (/<(html|body)[\s>]/i.test(code)) return code;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="n-page" style="padding:14px 16px">${code}</body></html>`;
}

/** JavaScript that talks to the page (it has a document, a window, dialogs, animation frames): a Worker has none of them. */
export const usesPage = (code: string) => /\bdocument\b|\bwindow\s*[.[]|\b(alert|prompt|confirm)\s*\(|requestAnimationFrame/.test(code);

const CSS = String.raw`html,body{margin:0}
body.n-page{padding:10px 14px}
#st{color:var(--n-muted);font:13px/1.5 var(--n-font,system-ui,sans-serif)}
#st[hidden]{display:none}
#out{font:12.5px/1.55 var(--n-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);color:var(--n-fg)}
.l{white-space:pre-wrap;overflow-wrap:anywhere;min-height:1.55em}
.l.warn{color:var(--n-warn,#9c4704)}
.l.error{color:var(--n-err,#bd2525)}
.l.none{color:var(--n-muted);font-family:var(--n-font,system-ui,sans-serif);font-size:13px}
#out img{display:block;max-width:100%;height:auto;margin:6px 0;border-radius:6px;background:#fff}`;

/** How an error reads: its name and message. Used by the page and by the Workers. */
const MSG = String.raw`function msg(e){return e&&e.name&&e.message!==undefined?e.name+': '+e.message:String(e&&e.message!==undefined?e.message:e)}`;

// What the page does with lines: write them, at most so many, and say when there was nothing.
const OUT = String.raw`var out=document.getElementById('out'),st=document.getElementById('st'),count=0,capped=false,W=cfg.words;
function add(kind,text){var n=out.querySelector('.none');if(n)n.remove();var d=document.createElement('div');d.className='l '+kind;d.textContent=text;out.appendChild(d);return d}
function line(kind,text){if(count>=1000){if(!capped){capped=true;add('warn',W.cut)}return}count++;add(kind,text)}
function status(t){st.textContent=t||'';st.hidden=!t}
function finish(){status('');if(!out.firstChild)add('none',W.none)}
function clearOut(){out.textContent='';count=0;capped=false}
${MSG}`;

// The page's side of a Worker: it starts one from its source, writes what it posts back, and stops it when it is done or has
// run too long (`late`: the time limit starts when the Worker says it is running, not before; `module`: a module Worker, which
// Pyodide's release needs (it refuses to load in a classic one), made from a data: URL because a sandboxed page's blob: URL cannot
// be a module). False when no Worker can be made.
const DRIVE = String.raw`function launch(src,limit,late,module){
  var w,url,timer,showT,ended=false;
  function end(){if(ended)return;ended=true;clearTimeout(timer);clearTimeout(showT);try{w.terminate()}catch(e){}try{URL.revokeObjectURL(url)}catch(e){}finish()}
  function arm(){showT=setTimeout(function(){status(W.running)},300);timer=setTimeout(function(){line('error',W.stopped.replace('{0}',String(limit/1000)));end()},limit)}
  try{url=module?'data:text/javascript;charset=utf-8,'+encodeURIComponent(src):URL.createObjectURL(new Blob([src],{type:'text/javascript'}));w=new Worker(url,module?{type:'module'}:undefined)}catch(e){return false}
  w.onmessage=function(e){
    var d=e.data||{};if(ended)return;
    if(d.t==='line')line(d.k,d.s);
    else if(d.t==='img'){var im=document.createElement('img');im.src='data:image/png;base64,'+d.b;im.alt='';out.appendChild(im)}
    else if(d.t==='clear')clearOut();
    else if(d.t==='st')status(W.packages);
    else if(d.t==='run'){status('');arm()}
    else if(d.t==='done')end();
  };
  w.onerror=function(e){if(ended)return;if(e&&e.preventDefault)e.preventDefault();line('error',(e&&e.message)||W.failed);end()};
  if(!late)arm();
  return true;
}`;

// How JavaScript values are written (console.log's way, as JSON): the same in the page and in its Worker.
const FMT = String.raw`function inspect(v,pretty){
  var t=typeof v;
  if(v===undefined)return 'undefined';
  if(v===null)return 'null';
  if(t==='function')return '[Function'+(v.name?': '+v.name:' (anonymous)')+']';
  if(t==='symbol')return v.toString();
  if(t==='bigint')return v+'n';
  if(t!=='object')return String(v);
  if(v instanceof Error)return msg(v);
  var path=[];
  try{
    var s=JSON.stringify(v,function(k,x){
      var y=x;
      if(typeof x==='bigint')return x+'n';
      if(typeof x==='function')return '[Function'+(x.name?': '+x.name:'')+']';
      if(typeof x==='symbol')return x.toString();
      if(x instanceof Error)return msg(x);
      if(x&&typeof x==='object'){
        while(path.length&&path[path.length-1].conv!==this)path.pop();
        for(var i=0;i<path.length;i++)if(path[i].orig===x)return '[Circular]';
        if(x instanceof Map){y={};y['Map('+x.size+')']=Array.from(x.entries())}
        else if(x instanceof Set){y={};y['Set('+x.size+')']=Array.from(x)}
        path.push({orig:x,conv:y});
      }
      return y;
    },pretty?2:undefined);
    return s===undefined?String(v):s;
  }catch(e){try{return String(v)}catch(_){return '[object]'}}
}
function fmt(v){if(typeof v==='string')return v;var c=inspect(v,false);return c.length>72?inspect(v,true):c}`;

// The console and the uncaught errors, written with `emit(kind, text)` and `clearOut()` (the page's own, or posts to the page).
const CONSOLE = String.raw`var depth=0;
function say(kind,args){var s=Array.prototype.map.call(args,fmt).join(' ');if(depth)s=s.replace(/^/gm,'  '.repeat(depth));emit(kind,s)}
var real={};
['log','info','debug','dir','trace'].forEach(function(k){real[k]=console[k]&&console[k].bind(console);console[k]=function(){say('log',arguments);try{real[k]&&real[k].apply(null,arguments)}catch(e){}}});
console.warn=function(){say('warn',arguments)};
console.error=function(){say('error',arguments)};
console.table=function(){say('log',arguments)};
console.assert=function(ok){if(!ok){var a=Array.prototype.slice.call(arguments,1);emit('error','Assertion failed'+(a.length?': '+a.map(fmt).join(' '):''))}};
console.group=console.groupCollapsed=function(){if(arguments.length)say('log',arguments);depth++};
console.groupEnd=function(){depth=Math.max(0,depth-1)};
console.clear=function(){clearOut()};
addEventListener('error',function(e){emit('error',e.error?msg(e.error):(e.message||'Error'));e.preventDefault()});
addEventListener('unhandledrejection',function(e){emit('error','Uncaught (in promise) '+fmt(e.reason));e.preventDefault()});`;

// JavaScript on the page's own thread (it uses the page).
const JS_PAGE = String.raw`function runHere(){
${FMT}
function emit(k,s){line(k,s)}
${CONSOLE}
(async function(){
  try{
    var AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
    await new AsyncFunction(cfg.code)();
  }catch(e){line('error',e&&typeof e==='object'&&'message' in e?msg(e):'Uncaught '+fmt(e))}
  finish();
})();
}`;

// JavaScript in a Worker: done when the code has run and its timeouts have fired (intervals are left to the time limit's end).
const JS_WORKER = String.raw`function emit(k,s){postMessage({t:'line',k:k,s:s})}
function clearOut(){postMessage({t:'clear'})}
${CONSOLE}
var pending=0,ids={},oST=setTimeout,oCT=clearTimeout,mainDone=false,sent=false;
function check(){if(mainDone&&pending===0&&!sent){sent=true;oST(function(){postMessage({t:'done'})},30)}}
self.setTimeout=function(f,ms){
  if(typeof f!=='function')return oST(f,ms);
  var a=Array.prototype.slice.call(arguments,2);pending++;
  var id=oST(function(){delete ids[id];pending--;try{f.apply(null,a)}finally{check()}},ms);
  ids[id]=1;return id;
};
self.clearTimeout=function(id){if(ids[id]){delete ids[id];pending--;check()}oCT(id)};
(async function(){
  try{
    var AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
    await new AsyncFunction(cfg.code)();
  }catch(e){emit('error',e&&typeof e==='object'&&'message' in e?msg(e):'Uncaught '+fmt(e))}
  mainDone=true;check();
})();`;

// Python in a (module) Worker: Pyodide, the packages, the code, and each open matplotlib figure as a PNG.
const PY_WORKER = String.raw`function trace(e){
  var ls=String(e&&e.message!==undefined?e.message:e).replace(/\s+$/,'').split('\n'),keep=[],skip=false;
  for(var i=0;i<ls.length;i++){
    var l=ls[i];
    if(/^\s*File "[^"]*_pyodide[^"]*"/.test(l)){skip=true;continue}
    if(skip&&/^\s{4,}/.test(l))continue;
    skip=false;keep.push(l);
  }
  return keep.slice(-14).join('\n');
}
var FIGS="import io, base64, json, sys, warnings\ndef _hydor_figs():\n    plt = sys.modules.get('matplotlib.pyplot')\n    if plt is None:\n        return '[]'\n    found = []\n    with warnings.catch_warnings():\n        warnings.simplefilter('ignore')\n        for n in plt.get_fignums():\n            b = io.BytesIO()\n            plt.figure(n).savefig(b, format='png', dpi=100, bbox_inches='tight')\n            found.append(base64.b64encode(b.getvalue()).decode())\n        plt.close('all')\n    return json.dumps(found)\n_hydor_figs()";
var AGG="import os, warnings\nos.environ['MPLBACKEND'] = 'AGG'\nimport matplotlib\nmatplotlib.use('agg')\nwarnings.filterwarnings('ignore', message='.*non-interactive.*')";
function pl(k,s){postMessage({t:'line',k:k,s:s})}
(async function(){
  var py,W=cfg.words;
  try{
    py=await (await import(cfg.base+'pyodide.mjs')).loadPyodide({indexURL:cfg.base});
  }catch(e){pl('error',W.failed);postMessage({t:'done'});return}
  py.setStdout({batched:function(s){pl('log',s)}});
  py.setStderr({batched:function(s){pl('warn',s)}});
  var quiet={messageCallback:function(){},errorCallback:function(){}};
  postMessage({t:'st'});
  for(var i=0;i<cfg.packages.length;i++){
    try{await py.loadPackage(cfg.packages[i],quiet)}catch(e){pl('warn',W.package.replace('{0}',cfg.packages[i]))}
  }
  try{await py.loadPackagesFromImports(cfg.code,quiet)}catch(e){pl('warn',msg(e))}
  var plot=!!(py.loadedPackages&&py.loadedPackages.matplotlib);
  try{if(plot)py.runPython(AGG)}catch(e){plot=false}
  postMessage({t:'run'});
  try{await py.runPythonAsync(cfg.code)}catch(e){pl('error',trace(e))}
  if(plot){
    try{JSON.parse(py.runPython(FIGS)).forEach(function(b){postMessage({t:'img',b:b})})}catch(e){pl('warn',msg(e))}
  }
  postMessage({t:'done'});
})();`;

/** The whole document one run draws: `code` as the language runs it, `packages` the Python ones to load first. */
export function playgroundDoc(lang: PlayLang, code: string, o: { packages?: string[]; words: PlayWords }): string {
  if (lang === 'html') return htmlPage(code);
  const python = lang === 'python';
  const here = !python && usesPage(code);
  const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style></head><body class="n-page" data-n-fit><div id="st"${python ? '' : ' hidden'}></div><div id="out"></div><script>`;
  const tail = '</script></body></html>';
  const packages = (o.packages ?? []).filter((p) => /^[\w.-]{1,60}$/.test(p)).slice(0, 20);
  let body: string;
  if (python) {
    const worker = `var cfg=${js({ code, words: o.words, base: PYODIDE_BASE, packages })};${MSG}${PY_WORKER}`;
    body = `var cfg=${js({ words: o.words })};${OUT}${DRIVE}if(!launch(${js(worker)},${PY_LIMIT * 1000},true,true)){line('error',W.failed);finish()}`;
  } else if (here) {
    body = `var cfg=${js({ code, words: o.words })};${OUT}${JS_PAGE}runHere();`;
  } else {
    const worker = `var cfg=${js({ code })};${MSG}${FMT}${JS_WORKER}`;
    body = `var cfg=${js({ code, words: o.words })};${OUT}${DRIVE}${JS_PAGE}if(!launch(${js(worker)},${JS_LIMIT * 1000},false))runHere();`;
  }
  return head + body + tail;
}
