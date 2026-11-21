// The free data services the ready-made apps call (forecasts, places, encyclopedia pages, exchange rates), for the
// agents that build apps (app_services): each with what it gives, a request to start from, whether it needs a key,
// and how often it may be called, so an app is built on an address known to work rather than one from memory.
// A first few: a fuller list replaces this one.

export interface AppService {
  id: string;
  name: string;
  /** The hosts its requests go to. */
  hosts: string[];
  /** What it gives, in a sentence. */
  about: string;
  /** It answers without a key. */
  keyless: boolean;
  /** About how many requests a second it takes from one caller. */
  perSecond?: number;
  /** How long an answer stays good to keep, in seconds. */
  cacheSeconds?: number;
  /** Requests to start from, each with what it gets. */
  examples?: { what: string; url: string }[];
}

export const APP_SERVICES: AppService[] = [
  {
    id: 'open-meteo',
    name: 'Open-Meteo forecast',
    hosts: ['api.open-meteo.com'],
    about: 'Weather forecasts for up to 16 days anywhere, by latitude and longitude: hourly and daily temperature, rain, wind, UV, sunrise and sunset. Free for non-commercial use, about 10,000 requests a day.',
    keyless: true,
    perSecond: 10,
    cacheSeconds: 1800,
    examples: [
      { what: 'The next 7 days in Lisbon: highs, lows and the chance of rain', url: 'https://api.open-meteo.com/v1/forecast?latitude=38.72&longitude=-9.14&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto' },
      { what: 'The next 48 hours, hour by hour', url: 'https://api.open-meteo.com/v1/forecast?latitude=38.72&longitude=-9.14&hourly=temperature_2m,precipitation,wind_speed_10m&forecast_hours=48&timezone=auto' },
    ],
  },
  {
    id: 'open-meteo-geocoding',
    name: 'Open-Meteo geocoding',
    hosts: ['geocoding-api.open-meteo.com'],
    about: 'A place name to its latitude, longitude, country and time zone (towns and cities, in many languages): what a forecast or a map needs first.',
    keyless: true,
    perSecond: 10,
    cacheSeconds: 86400,
    examples: [{ what: 'Where Lisbon is', url: 'https://geocoding-api.open-meteo.com/v1/search?name=Lisbon&count=1&language=en&format=json' }],
  },
  {
    id: 'wikipedia-summary',
    name: 'Wikipedia page summaries',
    hosts: ['en.wikipedia.org'],
    about: 'The first paragraph of a Wikipedia page, with its picture, coordinates (for places) and link; other languages at their own host (de.wikipedia.org…). Send a User-Agent that names the app.',
    keyless: true,
    perSecond: 50,
    cacheSeconds: 86400,
    examples: [
      { what: 'A summary of the page on Lisbon', url: 'https://en.wikipedia.org/api/rest_v1/page/summary/Lisbon' },
      { what: 'Pages whose titles match some words', url: 'https://en.wikipedia.org/w/api.php?action=opensearch&search=tram%2028&limit=5&format=json' },
    ],
  },
  {
    id: 'frankfurter',
    name: 'Frankfurter exchange rates',
    hosts: ['api.frankfurter.dev'],
    about: 'Exchange rates of the European Central Bank for about 30 currencies, today’s and back to 1999, updated each working day around 16:00 CET.',
    keyless: true,
    perSecond: 5,
    cacheSeconds: 3600,
    examples: [
      { what: 'Today’s rates from euros to dollars and pounds', url: 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP' },
      { what: 'Euros to dollars over a month', url: 'https://api.frankfurter.dev/v1/2026-10-01..2026-10-31?base=EUR&symbols=USD' },
    ],
  },
];

/** The service a host belongs to (its own, or a subdomain of it). */
export function serviceOf(host: string): AppService | undefined {
  const h = String(host ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!h) return undefined;
  return APP_SERVICES.find((s) => s.hosts.some((x) => h === x || h.endsWith(`.${x}`)));
}
