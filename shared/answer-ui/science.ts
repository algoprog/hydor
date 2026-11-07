// Answer UIs for science and the sky: the night sky, unit conversion, formulas.
import type { AnswerUiSpec } from './types.ts';

export const SCIENCE: AnswerUiSpec[] = [
  {
    id: 'sky',
    title: 'Night sky',
    group: 'science',
    use: 'A night’s sky for observing: the Moon’s phase, twilight and the dark hours, when the Moon and planets are up, events, targets and conditions.',
    keywords: 'night sky tonight astronomy stargazing moon phase planets visible twilight dark hours astrophotography meteors seeing',
    shape: `{
  location?: string
  date: date                   // the evening it is about
  sun?: { set?: time, civil_dusk?: time, nautical_dusk?: time, astro_dusk?: time, astro_dawn?: time, nautical_dawn?: time, civil_dawn?: time, rise?: time }
  moon?: { phase?: string, illumination: number, waxing?: boolean, rise?: time, set?: time }   // illumination in % (0 to 100)
  planets?: { name: string, visible?: boolean, rise?: time, set?: time, best?: time, direction?: string, magnitude?: number, note?: string }[]
  targets?: { name: string, kind?: string, best?: time, magnitude?: number, note?: string }[]   // what to point a telescope at
  events?: { time?: time, title: string, note?: md }[]
  conditions?: { clouds?: string, seeing?: string, transparency?: string, bortle?: number, wind?: string, dew?: string }
  verdict?: md
}
Times are local, from the afternoon to the next morning (a rise of "02:10" is after midnight).`,
    example: {
      location: 'Amherst, Massachusetts',
      date: '2026-11-14',
      sun: { set: '16:28', civil_dusk: '16:59', nautical_dusk: '17:32', astro_dusk: '18:06', astro_dawn: '05:03', nautical_dawn: '05:36', civil_dawn: '06:10', rise: '06:40' },
      moon: { phase: 'Waxing crescent', illumination: 27, waxing: true, rise: '11:29', set: '20:34' },
      planets: [
        { name: 'Saturn', rise: '14:46', set: '02:51', best: '20:48', direction: 'S', magnitude: 0.6, note: 'Rings tilted 6°, opening again' },
        { name: 'Uranus', rise: '17:01', set: '07:41', best: '00:21', direction: 'S', magnitude: 5.6, note: 'At opposition on 26 November' },
        { name: 'Mars', rise: '23:10', set: '13:03', best: '05:00', direction: 'SE', magnitude: 0.7 },
        { name: 'Jupiter', rise: '23:15', set: '12:58', best: '05:00', direction: 'SE', magnitude: -1.9, note: '1.2° from Mars' },
        { name: 'Venus', rise: '04:12', set: '14:58', best: '06:00', direction: 'ESE', magnitude: -4.3 },
      ],
      targets: [
        { name: 'M57, the Ring Nebula', kind: 'Planetary nebula', best: '18:10', magnitude: 8.8, note: 'Low in the west by 21:00: start with it' },
        { name: 'NGC 7662, the Blue Snowball', kind: 'Planetary nebula', best: '19:40', magnitude: 8.6, note: 'Straight overhead, small and bright: made for a long focal length' },
        { name: 'M1, the Crab Nebula', kind: 'Supernova remnant', best: '01:48', magnitude: 8.4 },
        { name: 'M42, the Orion Nebula', kind: 'Nebula', best: '01:49', magnitude: 4, note: 'The core and the Trapezium; short exposures keep them from burning out' },
      ],
      events: [
        { time: '20:34', title: 'Moonset', note: 'Dark and moonless from here until 05:03.' },
        { time: '22:56', title: 'The Leonid radiant rises', note: 'A few early meteors after midnight; the peak is on the night of 16–17 November, 10–15 an hour.' },
        { time: '23:15', title: 'Jupiter and Mars rise together', note: 'Just **1.2°** apart in Leo: too wide for one field at 1500 mm, a fine pair in binoculars.' },
      ],
      conditions: { clouds: 'Clear all night', seeing: 'Good (4/5) until 01:00', transparency: 'Above average', bortle: 5, wind: 'N 5 km/h', dew: 'Frost likely after midnight (low −3 °C)' },
      verdict: '**A fine night for small, bright targets.** Start with the crescent Moon low in the southwest and Saturn, turn to the planetary nebulae once the Moon sets (8½ hours of dark), and end on Jupiter and Mars before dawn. Keep a dew heater on the corrector plate.',
    },
  },
  {
    id: 'unit-converter',
    title: 'Unit converter',
    group: 'science',
    use: 'Converts a value between units as you type (length, mass, temperature, volume, speed, area, data, time, energy, pressure), listing it in other units too.',
    keywords: 'unit converter convert units metric imperial length weight temperature volume speed miles km pounds celsius',
    shape: `{
  quantity: "length" | "mass" | "temperature" | "volume" | "speed" | "area" | "data" | "time" | "energy" | "pressure"
  from: string                 // a unit's symbol or name: "mi", "kg", "°F", "cup", "MB"
  to: string
  value?: number               // 1 unless set
  show?: string[]              // the units to list it in too
}
Units: length nm µm mm cm m km in ft yd mi nmi au ly pc · mass mg g kg t oz lb st ton · temperature °C °F K · volume ml cl l m³ tsp tbsp floz cup pt qt gal · speed m/s km/h mph kn ft/s · area mm² cm² m² ha km² in² ft² yd² ac mi² · data bit B kB MB GB TB KiB MiB GiB TiB · time ns µs ms s min h d wk mo yr · energy J kJ MJ cal kcal Wh kWh BTU eV · pressure Pa hPa kPa bar mbar atm psi mmHg inHg`,
    example: {
      quantity: 'length',
      from: 'mi',
      to: 'km',
      value: 26.2,
      show: ['m', 'ft', 'yd', 'nmi'],
    },
  },
  {
    id: 'formula',
    title: 'Formula',
    group: 'science',
    use: 'A formula as a reference card: typeset, each symbol’s meaning and unit, how it works, and a worked example.',
    keywords: 'formula equation maths physics chemistry statistics latex symbols variables reference explain',
    shape: `{
  name: string
  field?: string               // "Information retrieval", "Optics"
  tex: string                  // the formula in LaTeX, without $ signs
  variables: { symbol: string, meaning: md, unit?: string }[]   // symbol in LaTeX
  explanation?: md
  example?: md                 // a worked example, with numbers
}`,
    example: {
      name: 'BM25',
      field: 'Information retrieval',
      tex: '\\operatorname{score}(D, Q) = \\sum_{i=1}^{n} \\operatorname{IDF}(q_i) \\cdot \\frac{f(q_i, D)\\,(k_1 + 1)}{f(q_i, D) + k_1 \\left(1 - b + b \\, \\frac{|D|}{\\mathrm{avgdl}}\\right)}',
      variables: [
        { symbol: 'q_i', meaning: 'The query’s $i$-th term, of $n$' },
        { symbol: 'f(q_i, D)', meaning: 'How often $q_i$ occurs in document $D$' },
        { symbol: '|D|', meaning: 'The document’s length', unit: 'terms' },
        { symbol: '\\mathrm{avgdl}', meaning: 'The average document length in the collection', unit: 'terms' },
        { symbol: 'k_1', meaning: 'How soon repeats stop adding: usually 0.9 to 1.5' },
        { symbol: 'b', meaning: 'How much long documents are held back, from 0 (not at all) to 1: usually 0.75' },
        { symbol: '\\operatorname{IDF}(q_i)', meaning: 'How rare the term is: $\\ln\\left(1 + \\frac{N - n(q_i) + 0.5}{n(q_i) + 0.5}\\right)$ for $N$ documents, $n(q_i)$ of them with $q_i$' },
      ],
      explanation: 'Each query term adds its rarity times a count that saturates: the first few occurrences matter most, and a long document needs more of them to score as high as a short one.',
      example: 'The term “maksutov” occurs 3 times in a 600-term document (avgdl = 400), and in 1,200 of $N$ = 1,000,000 documents. With $k_1 = 1.2$ and $b = 0.75$: IDF = ln 833 ≈ **6.73**, the count part is 6.6 / 4.65 ≈ **1.42**, so the term adds **9.55** to the score.',
    },
  },
];
