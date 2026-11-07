---
name: maps-and-places
description: Use when a task involves places, such as coordinates for an address or the address at a point, what is nearby, distances, routes and travel times, time zones, opening hours, or a map in a page, without paid map services.
category: research
triggers: [geocode, geocoding, reverse geocod*, coordinates of, latitude and longitude, nearby places, places near, driving distance, travel time, how far is, on a map, openstreetmap]
---

# Maps and places

Most place questions can be answered with free OpenStreetMap services: Nominatim finds coordinates
for an address and back, Overpass finds things near a point, and OSRM gives routes and travel times.
Volunteers run them on donated servers under strict usage rules: name yourself, go slowly, keep what
you fetched, and never build them into an app for everyone. Use them for the user's own questions;
for an app, a public page or heavy use, pick a provider with the user's own key. A map to look at
comes from OpenFreeMap (OpenStreetMap's data, free with no key and no limit, apps and public pages
included). Request examples are in `references/osm-services.md`.

## 1. Pick the tool for the question

| Question | Use | Watch out |
| --- | --- | --- |
| Where is this address? (geocoding) | Nominatim `/search` | One request per second; check which match it chose |
| What is at these coordinates? | Nominatim `/reverse` | `zoom` sets the detail: 18 a building, 10 a city |
| What is near here? (pharmacies, chargers) | Overpass API | Small areas; the main server is often busy |
| Route, distance, time by car, bike or on foot | OSRM at routing.openstreetmap.de | Longitude first; no traffic |
| Times between many points | OSRM `/table` | Keep it to a few dozen points |
| Distance as the crow flies | The haversine formula, no service | Say it is straight-line |
| Time zone of a place | `timezonefinder` (offline) or Open-Meteo | Use zone names, not fixed offsets |
| Open now? | OSM's `opening_hours` tag | Volunteer data: confirm what matters |
| Public transport | No free general service: give a directions link | |
| A map to look at | Leaflet on OpenFreeMap's map in `show_html` or `save_page` | Attribution |

## 2. Keep to the usage rules

They are conditions of use, not suggestions; the servers block clients that ignore them.

- **Name yourself.** Send a `User-Agent` header that names the project and a real contact the user
  agrees to (ask: their email or a project page), like `trip-planner/1.0 (+mailto:<contact>)`. A
  library's default is blocked, and so is a placeholder such as example.org.
- **Go slowly.** Nominatim and OSRM: at most one request per second, one at a time. Overpass: no
  parallel queries; on 429 or 504 wait 30 seconds before trying again.
- **Keep results.** Cache every answer and never ask the same thing twice. Long or recurring jobs on
  Nominatim are limited to 4 requests a minute; no lookups as the user types, and no systematic
  sweeps (a grid of points, every street of a town, every shop of a region: use a data extract).
- **Not inside apps and pages for everyone.** Nominatim's policy forbids building the public service
  into apps made with no-code or AI builders, which includes apps and pages made here. A page you
  make gets its coordinates from you, worked out beforehand; a tool that looks up addresses each
  time it runs needs a geocoding provider with the user's own key (several have free tiers) or
  their own Nominatim.
- **Say so when you suggest it.** If you recommend Nominatim to the user, link its usage policy
  (operations.osmfoundation.org/policies/nominatim) and explain the limits in a sentence.
- **No personal data.** Do not send lists of people's home addresses to the public services; use a
  provider with a data-processing agreement, or geocode on the user's own machine.
- **Credit the data.** Anything showing OpenStreetMap data says "© OpenStreetMap contributors",
  linked to openstreetmap.org/copyright.

## 3. Find coordinates, and check them

- Ask with as much as you know: `q=Brandenburger Tor, Berlin`, or the structured fields `street`,
  `city`, `postalcode`, `country`; add `countrycodes=de` and `limit=5`; `format=jsonv2`.
- Read what came back: `display_name`, `category` and `type`, and how many candidates. "Springfield"
  has dozens; pick by context, or ask the user which one.
- Nominatim answers latitude and longitude as strings; turn them into numbers. Keep six decimals
  (about 10 cm); more is false precision.

## 4. Find what is nearby

Write an Overpass query for a tag, a radius and a point, and ask for a centre point and the tags:

```
[out:json][timeout:25];
nwr["amenity"="pharmacy"](around:1000,52.5163,13.3777);
out center tags 20;
```

Find the right tag on the OpenStreetMap wiki ("Map features"): `amenity=cafe`, `shop=supermarket`,
`amenity=charging_station`, `tourism=hotel`, `leisure=playground`, `amenity=toilets`. Keep areas
small. The data is mapped by volunteers: places can be missing, closed or out of date. Say so, and
for anything that matters (a pharmacy open on Sunday), check the place's own page.

## 5. Routes and travel times

`GET https://routing.openstreetmap.de/routed-car/route/v1/driving/13.38886,52.51704;13.39763,52.52941?overview=false`

- Coordinates go **longitude,latitude**, separated by `;`. Swap `routed-car` for `routed-bike` or
  `routed-foot`; the `driving` in the path stays.
- The answer gives `distance` in metres and `duration` in seconds. Car times assume free-flowing
  roads: add a margin for rush hour and say so. `steps=true` gives turn-by-turn directions;
  `overview=full&geometries=geojson` gives the line to draw.
- Public transport is not covered. Give a directions link the user opens, such as
  `https://www.google.com/maps/dir/?api=1&origin=<from>&destination=<to>&travelmode=transit`, or
  the local operator's journey planner.

## 6. Time zones and opening hours

- **Time zone:** `TimezoneFinder().timezone_at(lng=..., lat=...)` from the `timezonefinder` package
  works offline; or Open-Meteo's `timezone=auto` (free for non-commercial use) answers the zone name.
  Convert times with the zone name (Python's `zoneinfo`), never a fixed offset: daylight saving
  moves it.
- **Opening hours** in OSM look like `Mo-Fr 08:00-19:00; Sa 09:00-13:00; PH off`: rules separated by
  `;`, a later rule replacing an earlier one for the days it names, `PH` for public holidays, `off`
  for closed, `24/7`. To answer "is it open now?" reliably, evaluate with the `opening_hours`
  JavaScript library (example in `references/osm-services.md`). It reads times in the computer's own
  time zone, so run it with the place's (`TZ=Europe/Berlin node check.mjs`).

## 7. Show a map

- Look everything up first, then put the coordinates in the page: the page itself never calls
  Nominatim or Overpass.
- Use Leaflet with OpenFreeMap's map (drawn by MapLibre as a Leaflet layer, light or dark with the
  page), the attribution visible, markers with popups, the view fitted to the markers, and a list of
  the places beside the map (for phones and screen readers). A tested template is in
  `references/leaflet-page.md`.
- Not OpenStreetMap's own tile servers (`tile.openstreetmap.org`): they refuse pages in the app's
  frames, which send no Referer, and an app's or a public site's use of them.
- `show_html` for a map to look at now; `save_page` for one the user will come back to; a published
  site can use OpenFreeMap too. No bulk downloads or offline copies of the map.
- Often a link is enough: `https://www.openstreetmap.org/?mlat=52.5163&mlon=13.3777#map=17/52.5163/13.3777`.

## 8. Check before you answer

Put a looked-up point on a map or reverse-geocode it to confirm it is the right place; check that
distances and times are plausible (a 2 km walk is about 25 minutes); name the sources and the date
for anything that changes (opening hours, routes).

## Pitfalls

- Latitude and longitude swapped: OSRM and GeoJSON want longitude first, Nominatim answers latitude
  first.
- Trusting the first match for an ambiguous name.
- Driving times given for a question about the bus.
- A loop of lookups with no pause and no cache.
- A map without "© OpenStreetMap contributors".
