// The page that notebook HTML outputs (tables, interactive plots) render in. It loads in an iframe
// sandboxed to an opaque origin, so its scripts get no cookies, no app API and no access to the
// page around it; the HTML arrives by postMessage, and the page reports its height back.
export const FRAME_CSP = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'";

export const FRAME_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<style>
html, body { margin: 0; padding: 0; background: transparent; }
body { font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--fg, #1f2328); overflow-x: auto; overflow-y: hidden; }
#out { display: flow-root; padding: 2px 0 6px; }
table { border: none; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; margin: 2px 0; }
th, td { padding: 4px 10px; text-align: right; border: none; border-bottom: 1px solid var(--line, #d0d7de); white-space: nowrap; }
thead th { border-bottom: 1px solid var(--line-2, #afb8c1); font-weight: 600; }
tbody tr:nth-child(odd) { background: var(--stripe, rgba(0, 0, 0, 0.03)); }
tbody tr:hover { background: var(--hover, rgba(0, 0, 0, 0.06)); }
a { color: var(--accent, #0969da); }
pre, code { font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace; font-size: 12px; }
img, svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
<div id="out"></div>
<script>
(function () {
  var out = document.getElementById('out');
  function size() {
    parent.postMessage({ type: 'wa-nb-size', h: Math.ceil(out.offsetTop + out.offsetHeight) }, '*');
  }
  window.addEventListener('message', function (e) {
    if (e.source !== parent || !e.data || (e.data.type !== 'wa-nb-html' && e.data.type !== 'wa-nb-vars')) return;
    var vars = e.data.vars || {};
    for (var k in vars) document.documentElement.style.setProperty(k, vars[k]);
    document.documentElement.style.colorScheme = e.data.dark ? 'dark' : 'light';
    // A theme change: new colours, same output.
    if (e.data.type === 'wa-nb-vars') return;
    out.innerHTML = e.data.html;
    // innerHTML does not run scripts: put each one back as a new element, in order.
    out.querySelectorAll('script').forEach(function (old) {
      var s = document.createElement('script');
      for (var i = 0; i < old.attributes.length; i++) s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      if (old.src) s.async = false;
      s.text = old.text;
      old.replaceWith(s);
    });
    size();
  });
  new ResizeObserver(size).observe(out);
  window.addEventListener('load', size);
  parent.postMessage({ type: 'wa-nb-ready' }, '*');
})();
</script>
</body>
</html>
`;
