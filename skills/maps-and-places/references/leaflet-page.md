# A map page (Leaflet, on OpenFreeMap's map)

Tested in a browser. Look the places up first and put them in `places`; the page makes no lookups of
its own. It fits the view to the markers, shows the credit the map's makers ask for, and lists the
places under the map for phones and screen readers. Give it to `show_html` (a look now) or
`save_page` (a page the user keeps). The page kit's variables give it the app's colours; the
fallbacks after each `var()` are for the page opened on its own.

The map itself is OpenFreeMap's (OpenStreetMap's data; free, with no key and no limit, for apps and
public pages too), drawn by MapLibre as a Leaflet layer, light or dark with the page. Do not use
OpenStreetMap's own tile servers (`tile.openstreetmap.org`): they refuse pages shown in the app's
frames, which send no Referer, and apps that are not theirs.

```html
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pharmacies near the Brandenburg Gate</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css">
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js"></script>
<style>
  #map { height: 420px; border: 1px solid var(--n-line, #ddd); border-radius: var(--n-radius, 12px); }
  .places { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
            gap: 10px; margin: 14px 0 0; padding: 0; list-style: none; }
  .places li { background: var(--n-card, #fff); border: 1px solid var(--n-line, #ddd);
               border-radius: var(--n-radius, 12px); padding: 10px 12px; }
  .places small { color: var(--n-muted, #666); }
</style></head>
<body class="n-page">
<h1>Pharmacies within 1 km of the Brandenburg Gate</h1>
<p class="n-muted">From OpenStreetMap, 3 November 2026. Opening hours are volunteer data: check before you go.</p>
<div id="map" role="region" aria-label="Map of the pharmacies"></div>
<ul class="places" id="places"></ul>
<script>
const places = [
  { name: "Friedrichstadt Apotheke", lat: 52.5117692, lon: 13.3868843, note: "Mo-Fr 08:00-19:00; Sa 09:00-13:00" },
  { name: "Dorotheenstadt Apotheke", lat: 52.5185603, lon: 13.3879579, note: "Mo-Fr 08:00-19:00; Sa 09:00-14:00" },
  { name: "Aschenbachs Apotheke", lat: 52.5196854, lon: 13.3874475, note: "Mo-Fr 07:00-20:00; Sa 10:00-17:00" }
];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const map = L.map("map", { scrollWheelZoom: false });       // the page scrolls; the map zooms with its buttons
// Light or dark with the page: light words on it mean a dark page.
const fg = (getComputedStyle(document.body).color.match(/\d+/g) || [0, 0, 0]).map(Number);
const dark = (fg[0] * 299 + fg[1] * 587 + fg[2] * 114) / 1000 > 140;
L.maplibreGL({
  style: "https://tiles.openfreemap.org/styles/" + (dark ? "dark" : "positron"),
  attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
const markers = places.map((p) =>
  L.marker([p.lat, p.lon]).addTo(map).bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.note)}`));
map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
document.getElementById("places").innerHTML = places.map((p) =>
  `<li><b>${esc(p.name)}</b><br><small>${esc(p.note)}</small></li>`).join("");
</script>
</body></html>
```

Variations:

- **Other looks:** `liberty` (colourful, with parks and buildings, like OpenStreetMap's own map),
  `bright`, `fiord` (dark blue) in place of `positron` or `dark`.
- **A route:** draw OSRM's line (`overview=full&geometries=geojson`) with
  `L.geoJSON(route.geometry).addTo(map)`; fit the view to it with `map.fitBounds(layer.getBounds())`.
- **One place:** `map.setView([lat, lon], 16)` instead of `fitBounds`.
- **Many markers (hundreds):** use circle markers (`L.circleMarker([lat, lon], { radius: 6 })`), or
  group them; keep the list short (the nearest 20) and say how many there are.
- **Colours from the app's theme:** read them in the script with
  `getComputedStyle(document.body).getPropertyValue("--n-accent")` and pass them to
  `L.circleMarker(..., { color, fillColor })`.

MapLibre draws with WebGL: in a browser without it (rare, some virtual machines) the markers still
show, on a plain ground. Rules: keep the attribution visible (not hidden behind a toggle); no
"download for offline" features or bulk downloads of the map.
