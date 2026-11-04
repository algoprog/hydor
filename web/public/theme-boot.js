// Paints the last theme before the app loads, so a light or custom theme does not flash dark first.
// lib/theme.ts writes what to paint; until it has, the mode alone (from the saved UI state) decides.
(function () {
  var root = document.documentElement;
  // In the Mac app this page follows its own starting page, where the water has already risen in the logo's Ω
  // (index.html #boot): it stays full rather than rising again.
  if (/HydorMac\//.test(navigator.userAgent)) root.classList.add('boot-full');
  try {
    var b = JSON.parse(localStorage.getItem('wa.theme.boot') || 'null');
    var mode = b ? b.mode : (JSON.parse(localStorage.getItem('wa.ui.v1') || '{}').theme || 'dark');
    var dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
    var t = b && (dark ? b.dark : b.light);
    if (!t) return;
    for (var k in t.vars) root.style.setProperty('--' + k, t.vars[k]);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && t.color) meta.setAttribute('content', t.color);
  } catch (e) {}
})();
