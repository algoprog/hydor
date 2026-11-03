# OpenStreetMap services: requests that work

Every request carries a `User-Agent` naming the project and a real contact the user agreed to.
With `http_request`, pass it in `headers`:

```json
{ "url": "https://nominatim.openstreetmap.org/search?q=Alexanderplatz%2C%20Berlin&format=jsonv2&limit=5",
  "headers": { "User-Agent": "trip-planner/1.0 (+mailto:<contact>)" } }
```

Placeholders (example.org, test@test) and library defaults (python-requests, curl) get 403.

## Nominatim: addresses and coordinates

Policy: https://operations.osmfoundation.org/policies/nominatim/ (1 request per second at most,
cache results, no autocomplete, no systematic queries, not built into no-code or AI-made apps).

```
# Free text
GET https://nominatim.openstreetmap.org/search?q=Pariser+Platz+1,+Berlin&format=jsonv2&limit=5&countrycodes=de
# Structured (more precise)
GET https://nominatim.openstreetmap.org/search?street=1+Pariser+Platz&city=Berlin&country=Germany&format=jsonv2
# Reverse: what is at a point (zoom 18 = building, 14 = suburb, 10 = city, 3 = country)
GET https://nominatim.openstreetmap.org/reverse?lat=52.5163&lon=13.3777&format=jsonv2&zoom=18
```

Useful extras: `addressdetails=1` (the parts: road, postcode, city), `accept-language=en`,
`extratags=1` (website, opening hours, wheelchair access when mapped).

Several addresses from a script, cached, one request a second (tested):

```python
import json, os, time, urllib.parse, urllib.request

UA = "trip-planner/1.0 (+mailto:<contact>)"   # your project and a real contact
CACHE = "geocode-cache.json"
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}

def geocode(address, country=None):
    key = f"{address}|{country}"
    if key not in cache:
        params = {"q": address, "format": "jsonv2", "limit": 1}
        if country:
            params["countrycodes"] = country
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
            hits = json.load(r)
        cache[key] = {"lat": float(hits[0]["lat"]), "lon": float(hits[0]["lon"]),
                      "name": hits[0]["display_name"]} if hits else None
        json.dump(cache, open(CACHE, "w"), ensure_ascii=False, indent=1)
        time.sleep(1.1)                                  # at most one request per second
    return cache[key]
```

More than a few hundred addresses, recurring jobs, or people's addresses: use a provider with the
user's own key (LocationIQ, OpenCage, Geoapify, MapTiler and others offer free tiers; check their
terms), or run Nominatim locally.

## Overpass: what is near a point, or in an area

Main server `https://overpass-api.de/api/interpreter` (often at capacity: on 429 or 504 wait 30 s,
then retry; or use `https://overpass.private.coffee/api/interpreter`). Fine for one-off use under
about 10,000 queries and 1 GB a day; divide by 100 for anything that runs regularly. One query at a
time. Send the query as `data`:

```bash
curl -sS -A "trip-planner/1.0 (+mailto:<contact>)" -G https://overpass-api.de/api/interpreter \
  --data-urlencode 'data=[out:json][timeout:25];nwr["amenity"="pharmacy"](around:1000,52.5163,13.3777);out center tags 20;'
```

- `nwr` asks for nodes, ways and relations (a shop can be a point or a building outline); `out
  center` gives buildings a centre point (`center.lat`, `center.lon`); `20` caps the count.
- An area instead of a radius: a bounding box `(south,west,north,east)`, for example
  `nwr["shop"="bakery"](52.50,13.36,52.53,13.42);`.
- Several kinds at once: `(nwr["amenity"="cafe"](around:500,LAT,LON); nwr["amenity"="restaurant"](around:500,LAT,LON););`
- Tags: wiki.openstreetmap.org/wiki/Map_features, or taginfo.openstreetmap.org for how often a tag
  is used. Try queries by hand at overpass-turbo.eu.

## OSRM: routes, distances, travel times

FOSSGIS servers: car, bike and foot, worldwide; at most one request per second; reasonable,
non-commercial use; data updated every few days. Coordinates are `longitude,latitude`.

```
GET https://routing.openstreetmap.de/routed-car/route/v1/driving/13.38886,52.51704;13.39763,52.52941?overview=false
GET https://routing.openstreetmap.de/routed-foot/route/v1/driving/13.38886,52.51704;13.39763,52.52941?overview=false
GET https://routing.openstreetmap.de/routed-bike/route/v1/driving/13.38886,52.51704;13.39763,52.52941?overview=full&geometries=geojson&steps=true
# Many-to-many (a matrix of durations in seconds and distances in metres)
GET https://routing.openstreetmap.de/routed-car/table/v1/driving/13.38886,52.51704;13.39763,52.52941;13.41320,52.52190?annotations=duration,distance
```

`routes[0].distance` is metres, `routes[0].duration` seconds; `code` is `Ok` when it worked.
router.project-osrm.org answers the same requests, for cars only.

Straight-line distance needs no service:

```python
from math import radians, sin, cos, asin, sqrt
def haversine_km(lat1, lon1, lat2, lon2):
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(a))
```

## Time zones

```python
from datetime import datetime
from zoneinfo import ZoneInfo
from timezonefinder import TimezoneFinder        # pip install timezonefinder (works offline)

zone = TimezoneFinder().timezone_at(lng=139.6503, lat=35.6762)        # "Asia/Tokyo"
meeting = datetime(2026, 3, 30, 9, 0, tzinfo=ZoneInfo("Europe/Berlin"))
print(meeting.astimezone(ZoneInfo(zone)))
```

Without installing anything: `GET https://api.open-meteo.com/v1/forecast?latitude=35.6762&longitude=139.6503&current=temperature_2m&timezone=auto`
answers `timezone` ("Asia/Tokyo") and `utc_offset_seconds` (free for non-commercial use, under
10,000 calls a day; credit Open-Meteo).

## Opening hours

The `opening_hours` tag's syntax: wiki.openstreetmap.org/wiki/Key:opening_hours; check a value at
openingh.openstreetmap.de/evaluation_tool/. Evaluate it with the `opening_hours` library (in a
scratch folder: `npm install opening_hours`), in the place's time zone (tested):

```js
// check.mjs, run as: TZ=Europe/Berlin node check.mjs
import opening_hours from 'opening_hours';
const place = { lat: 52.5163, lon: 13.3777, address: { country_code: 'de', state: 'Berlin' } };  // for public holidays
const oh = new opening_hours('Mo-Fr 08:00-19:00; Sa 09:00-13:00; PH off', place);
const when = new Date('2026-11-07T14:00:00+01:00');
console.log(oh.getState(when), oh.getNextChange(when));   // false, and when it next opens
```

## Directions links (no service needed)

- OpenStreetMap: `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=52.5163,13.3777;52.5219,13.4132`
  (`fossgis_osrm_car`, `fossgis_osrm_bicycle`, `fossgis_osrm_foot`; here latitude comes first).
- Google Maps, including public transport: `https://www.google.com/maps/dir/?api=1&origin=Brandenburger+Tor,+Berlin&destination=Alexanderplatz,+Berlin&travelmode=transit`
  (`driving`, `walking`, `bicycling`, `transit`).
