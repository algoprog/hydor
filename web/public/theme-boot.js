// Paints the last theme before the app loads, so a light or custom theme does not flash dark first.
// lib/theme.ts writes what to paint; until it has, the mode alone (from the saved UI state) decides.
(function () {
  var root = document.documentElement;
  // How much moves (Settings → General → Appearance → Motion): the stylesheet's motion block reads it from <html>.
  try {
    var m = JSON.parse(localStorage.getItem('wa.ui.v1') || '{}').motion;
    root.dataset.motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : m === 'calm' || m === 'off' ? m : 'full';
  } catch (e) {}
  // How big reading text is (Settings → General → Appearance → Text size): the stylesheet's --n-text-scale reads it.
  try {
    var ts = JSON.parse(localStorage.getItem('wa.ui.v1') || '{}').textSize;
    root.dataset.textSize = ts === 'large' || ts === 'larger' ? ts : 'default';
  } catch (e) {}
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
