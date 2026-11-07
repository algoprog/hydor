// Answer UIs for numbers: charts, tables, figures, gauges, breakdowns, calculators, results.
import type { AnswerUiSpec } from './types.ts';

export const DATA: AnswerUiSpec[] = [
  {
    id: 'chart',
    title: 'Chart',
    group: 'data',
    use: 'Numbers drawn as a line, area, bar, stacked bar, horizontal bar, pie, donut, scatter or radar chart, with a legend and values on hover.',
    keywords: 'chart graph plot trend over time line bar pie donut scatter radar series data visualization statistics',
    shape: `{
  title?: string
  kind: "line" | "area" | "bar" | "stacked-bar" | "hbar" | "pie" | "donut" | "scatter" | "radar"
  x?: (string | number)[]      // the labels along the x axis: dates, months, categories (a pie's slices, a radar's axes)
  series: {
    name: string
    values: number[]           // one per x, in order (null for a gap); scatter: { x: number, y: number, label?: string, size?: number }[]
  }[]                          // one series for a pie or donut; at most 8 otherwise
  unit?: string                // shown after values ("%", "°C", " km")
  prefix?: string              // shown before values ("$", "€")
  y_label?: string
  x_label?: string
  min?: number                 // the value axis' start (0 unless set, except for lines)
  marks?: { x: string | number, label: string }[]   // notes at points along a line or area chart
  note?: md                    // under the chart
  source?: { name: string, url?: url }
}`,
    example: {
      title: 'Average daily high, Athens and Boston',
      kind: 'line',
      x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      series: [
        { name: 'Athens', values: [13.6, 14.5, 16.6, 20.3, 25.4, 30.4, 33.2, 33.0, 28.6, 23.4, 18.7, 15.0] },
        { name: 'Boston', values: [2.2, 3.4, 7.4, 13.6, 19.6, 24.8, 28.0, 27.2, 23.2, 16.8, 11.1, 5.4] },
      ],
      unit: '°C',
      marks: [{ x: 'Jul', label: 'Hottest month in both' }],
      note: 'Athens stays above 13 °C all winter; Boston spends three months near freezing.',
      source: { name: 'NOAA and HNMS climate normals, 1991–2020' },
    },
  },
  {
    id: 'table',
    title: 'Data table',
    group: 'data',
    use: 'Rows of data with typed columns (numbers, money, dates, links, pictures, tags, bars, ratings): sort by any column, filter, add totals, copy or download as CSV.',
    keywords: 'table rows columns data dataset spreadsheet list records sortable filter csv results numbers',
    shape: `{
  title?: string
  columns: {
    key: string                // the field of each row it shows
    label: string
    type?: "text" | "number" | "money" | "percent" | "date" | "link" | "image" | "tag" | "bar" | "rating" | "md"
    unit?: string              // after numbers
    currency?: string          // money: "USD", "EUR"
  }[]
  rows: Record<string, string | number | boolean | null>[]   // values by column key; percent as 0.25 for 25%
  sort?: string                // the column to sort by first ("-key": highest first)
  totals?: string[]            // number columns to add up in a last row
  note?: md
}`,
    example: {
      title: 'The ten largest moons in the Solar System',
      columns: [
        { key: 'moon', label: 'Moon' },
        { key: 'planet', label: 'Planet', type: 'tag' },
        { key: 'diameter', label: 'Diameter', type: 'bar', unit: 'km' },
        { key: 'gravity', label: 'Surface gravity', type: 'number', unit: 'm/s²' },
        { key: 'discovered', label: 'Discovered' },
      ],
      rows: [
        { moon: 'Ganymede', planet: 'Jupiter', diameter: 5268, gravity: 1.43, discovered: '1610' },
        { moon: 'Titan', planet: 'Saturn', diameter: 5150, gravity: 1.35, discovered: '1655' },
        { moon: 'Callisto', planet: 'Jupiter', diameter: 4821, gravity: 1.24, discovered: '1610' },
        { moon: 'Io', planet: 'Jupiter', diameter: 3643, gravity: 1.8, discovered: '1610' },
        { moon: 'The Moon', planet: 'Earth', diameter: 3475, gravity: 1.62, discovered: '—' },
        { moon: 'Europa', planet: 'Jupiter', diameter: 3122, gravity: 1.31, discovered: '1610' },
        { moon: 'Triton', planet: 'Neptune', diameter: 2707, gravity: 0.78, discovered: '1846' },
        { moon: 'Titania', planet: 'Uranus', diameter: 1578, gravity: 0.37, discovered: '1787' },
        { moon: 'Rhea', planet: 'Saturn', diameter: 1527, gravity: 0.26, discovered: '1672' },
        { moon: 'Oberon', planet: 'Uranus', diameter: 1523, gravity: 0.35, discovered: '1787' },
      ],
      sort: '-diameter',
      note: 'Ganymede is wider than the planet Mercury, though only half as massive.',
    },
  },
  {
    id: 'stats',
    title: 'Key figures',
    group: 'data',
    use: 'Key numbers as tiles, each with its change since before (green when better, red when worse), a small trend line and a note.',
    keywords: 'kpi metrics key figures stats dashboard numbers tiles change growth trend sparkline scorecard',
    shape: `{
  title?: string
  period?: string              // what the numbers cover ("October 2026, against September")
  stats: {
    label: string
    value: string | number     // a number is written in the app's language; text as it is ("2m 41s")
    unit?: string              // after the value ("%", "ms", "users")
    prefix?: string            // before it ("$")
    change?: number | string   // the change against before: 3.2, -1.5, "+12"
    change_unit?: string       // after the change ("%", " pts")
    good?: "up" | "down"       // which way is better (up unless set)
    trend?: number[]           // recent values, oldest first: a small line
    note?: string              // a few words under it ("vs September")
  }[]                          // 2 to 8
  note?: md
}`,
    example: {
      title: 'Clay & Kiln shop',
      period: 'October 2026, against September',
      stats: [
        { label: 'Revenue', value: 18420, prefix: '$', change: 12.4, change_unit: '%', trend: [12140, 13420, 12810, 14930, 15260, 16790, 16390, 18420] },
        { label: 'Orders', value: 412, change: 8.1, change_unit: '%', trend: [301, 322, 310, 348, 352, 377, 381, 412] },
        { label: 'Average order', value: 44.71, prefix: '$', change: 3.9, change_unit: '%', trend: [40.33, 41.68, 41.32, 42.9, 43.35, 44.54, 43.02, 44.71] },
        { label: 'Conversion rate', value: 2.6, unit: '%', change: -0.3, change_unit: ' pts', trend: [2.4, 2.6, 2.5, 2.7, 2.8, 2.9, 2.9, 2.6], note: 'More visitors from ads, fewer buying' },
        { label: 'Refund rate', value: 1.4, unit: '%', change: -0.5, change_unit: ' pts', good: 'down', trend: [2.6, 2.3, 2.4, 2.1, 1.9, 2.0, 1.9, 1.4] },
        { label: 'Time to ship', value: '1.8 days', change: -0.4, change_unit: ' days', good: 'down', note: 'Since the second kiln' },
      ],
      note: 'The best month of the year so far: the holiday mugs sold out in nine days.',
    },
  },
  {
    id: 'heatmap',
    title: 'Heatmap',
    group: 'data',
    use: 'A grid of values shaded by size, rows against columns (hours by weekday, a correlation matrix), with a colour scale and each value on hover.',
    keywords: 'heatmap grid matrix colour scale intensity hours weekdays correlation density shaded cells',
    shape: `{
  title?: string
  x: string[]                  // the column labels
  y: string[]                  // the row labels
  values: (number | null)[][]  // a row for each y, a value for each x (null for none)
  unit?: string
  min?: number                 // the scale's ends (the data's lowest and highest unless set)
  max?: number
  diverging?: boolean          // two hues either side of a grey middle: values above and below 0 (or mid)
  mid?: number                 // a diverging scale's middle (0 unless set)
  note?: md
}`,
    example: {
      title: 'Bike-share trips by hour of the day, an average October week',
      x: ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'],
      y: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      values: [
        [110, 440, 860, 600, 310, 310, 360, 360, 310, 300, 490, 860, 850, 490, 170, 70],
        [120, 450, 900, 660, 320, 330, 380, 370, 330, 330, 500, 870, 930, 530, 180, 80],
        [130, 480, 920, 680, 350, 330, 410, 380, 350, 340, 560, 910, 940, 550, 200, 80],
        [120, 470, 900, 630, 320, 310, 390, 390, 320, 330, 500, 900, 950, 520, 180, 80],
        [110, 420, 870, 620, 290, 310, 350, 340, 290, 280, 580, 940, 990, 560, 200, 80],
        [60, 80, 120, 190, 290, 420, 510, 640, 680, 630, 530, 410, 300, 240, 150, 100],
        [50, 70, 110, 170, 260, 340, 440, 550, 570, 520, 470, 350, 260, 160, 110, 70],
      ],
      unit: 'trips',
      note: 'Weekdays peak with the commutes, at **8:00** and **17:00–18:00**; weekends rise to one hump in the early afternoon.',
    },
  },
  {
    id: 'gauge',
    title: 'Gauge',
    group: 'data',
    use: 'One reading on a half-ring dial with coloured bands (an air quality index, a credit score, a battery), naming the band it falls in.',
    keywords: 'gauge dial meter reading level score index air quality aqi credit score battery bands range',
    shape: `{
  label: string                // what it measures
  sub?: string                 // a line under it: where, when
  value: number
  min?: number                 // 0 unless set
  max?: number                 // 100 unless set
  unit?: string
  bands?: { to: number, tone: tone, label?: string }[]   // stretches of the scale from min up, each ending at "to"
  note?: md
}`,
    example: {
      label: 'Air quality (US AQI)',
      sub: 'Athens, Patission Street station, 14:00',
      value: 72,
      min: 0,
      max: 300,
      bands: [
        { to: 50, tone: 'good', label: 'Good' },
        { to: 100, tone: 'warn', label: 'Moderate' },
        { to: 150, tone: 'warn', label: 'Unhealthy for sensitive groups' },
        { to: 200, tone: 'bad', label: 'Unhealthy' },
        { to: 300, tone: 'bad', label: 'Very unhealthy' },
      ],
      note: 'Fine particles (PM2.5) from traffic and a light Saharan dust haze. People with asthma should take it easy outdoors this afternoon.',
    },
  },
  {
    id: 'funnel',
    title: 'Funnel',
    group: 'data',
    use: 'Stages that narrow from first to last (visitors to buyers, applications to offers), with the share kept at each step and the biggest drop marked.',
    keywords: 'funnel conversion stages pipeline drop off steps sales signups checkout applications hiring',
    shape: `{
  title?: string
  stages: { name: string, value: number, note?: string }[]   // from the first stage to the last
  unit?: string
  note?: md
}`,
    example: {
      title: 'My job search, September to November',
      stages: [
        { name: 'Applications sent', value: 64 },
        { name: 'Heard back', value: 23 },
        { name: 'Recruiter calls', value: 14, note: '9 of them came with a referral' },
        { name: 'Technical interviews', value: 8 },
        { name: 'Final rounds', value: 4 },
        { name: 'Offers', value: 2 },
      ],
      note: 'Most applications get no answer at all; a referral roughly triples the chance of a call.',
    },
  },
  {
    id: 'breakdown',
    title: 'Breakdown',
    group: 'data',
    use: 'The parts of a whole and their shares: a donut with the list, or one segmented bar for two or three parts.',
    keywords: 'breakdown parts of a whole share split composition donut pie percentage proportion allocation mix',
    shape: `{
  title?: string
  parts: { name: string, value: number, note?: string }[]   // up to 8 shown; more fold into Other
  total?: number               // the whole, when the parts do not add up to it (the rest shows as Other)
  unit?: string
  prefix?: string
  note?: md
  source?: { name: string, url?: url }
}`,
    example: {
      title: 'Where the world’s electricity came from in 2024',
      parts: [
        { name: 'Coal', value: 10600 },
        { name: 'Gas', value: 6800 },
        { name: 'Hydro', value: 4400 },
        { name: 'Nuclear', value: 2800 },
        { name: 'Wind', value: 2500 },
        { name: 'Solar', value: 2100, note: 'The fastest growing, up 29% in a year' },
        { name: 'Other fossil', value: 800 },
        { name: 'Bioenergy and other renewables', value: 800 },
      ],
      unit: 'TWh',
      note: 'Low-carbon sources made **41%** of the world’s electricity, the most since the 1940s.',
      source: { name: 'Ember, Global Electricity Review 2025', url: 'https://ember-energy.org/latest-insights/global-electricity-review-2025/' },
    },
  },
  {
    id: 'plot',
    title: 'Scientific plot',
    group: 'data',
    use: 'A Plotly figure for what the native chart cannot draw (3D surfaces and scatters, contours, box and violin plots, histograms) to turn, zoom and hover.',
    keywords: 'plotly 3d surface contour histogram box plot violin scatter3d mesh scientific figure distribution',
    shape: `{
  title?: string
  figure: {
    data: object[]             // Plotly traces: { type: "surface", z: number[][], x?, y? }, { type: "histogram", x: number[] }, { type: "box", y: number[], name }…
    layout?: object            // Plotly layout: axis titles, scene.camera, barmode…; colours and fonts follow the app's
  }
  height?: number              // px, 380 unless set
  note?: md
}`,
    example: {
      title: 'The sombrero: z = sin(r) / r',
      figure: {
        data: [
          {
            type: 'surface',
            x: [-8, -7.2, -6.4, -5.6, -4.8, -4, -3.2, -2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4, 3.2, 4, 4.8, 5.6, 6.4, 7.2, 8],
            y: [-8, -7.2, -6.4, -5.6, -4.8, -4, -3.2, -2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4, 3.2, 4, 4.8, 5.6, 6.4, 7.2, 8],
            z: [
              [-0.08, -0.09, -0.07, -0.03, 0.01, 0.05, 0.08, 0.11, 0.12, 0.12, 0.12, 0.12, 0.12, 0.11, 0.08, 0.05, 0.01, -0.03, -0.07, -0.09, -0.08],
              [-0.09, -0.07, -0.02, 0.03, 0.08, 0.11, 0.13, 0.13, 0.12, 0.11, 0.11, 0.11, 0.12, 0.13, 0.13, 0.11, 0.08, 0.03, -0.02, -0.07, -0.09],
              [-0.07, -0.02, 0.04, 0.09, 0.12, 0.13, 0.11, 0.08, 0.05, 0.03, 0.02, 0.03, 0.05, 0.08, 0.11, 0.13, 0.12, 0.09, 0.04, -0.02, -0.07],
              [-0.03, 0.03, 0.09, 0.13, 0.12, 0.08, 0.03, -0.03, -0.08, -0.1, -0.11, -0.1, -0.08, -0.03, 0.03, 0.08, 0.12, 0.13, 0.09, 0.03, -0.03],
              [0.01, 0.08, 0.12, 0.12, 0.07, -0.01, -0.09, -0.15, -0.19, -0.2, -0.21, -0.2, -0.19, -0.15, -0.09, -0.01, 0.07, 0.12, 0.12, 0.08, 0.01],
              [0.05, 0.11, 0.13, 0.08, -0.01, -0.1, -0.18, -0.21, -0.21, -0.2, -0.19, -0.2, -0.21, -0.21, -0.18, -0.1, -0.01, 0.08, 0.13, 0.11, 0.05],
              [0.08, 0.13, 0.11, 0.03, -0.09, -0.18, -0.22, -0.19, -0.12, -0.05, -0.02, -0.05, -0.12, -0.19, -0.22, -0.18, -0.09, 0.03, 0.11, 0.13, 0.08],
              [0.11, 0.13, 0.08, -0.03, -0.15, -0.21, -0.19, -0.07, 0.09, 0.23, 0.28, 0.23, 0.09, -0.07, -0.19, -0.21, -0.15, -0.03, 0.08, 0.13, 0.11],
              [0.12, 0.12, 0.05, -0.08, -0.19, -0.21, -0.12, 0.09, 0.34, 0.55, 0.62, 0.55, 0.34, 0.09, -0.12, -0.21, -0.19, -0.08, 0.05, 0.12, 0.12],
              [0.12, 0.11, 0.03, -0.1, -0.2, -0.2, -0.05, 0.23, 0.55, 0.8, 0.9, 0.8, 0.55, 0.23, -0.05, -0.2, -0.2, -0.1, 0.03, 0.11, 0.12],
              [0.12, 0.11, 0.02, -0.11, -0.21, -0.19, -0.02, 0.28, 0.62, 0.9, 1, 0.9, 0.62, 0.28, -0.02, -0.19, -0.21, -0.11, 0.02, 0.11, 0.12],
              [0.12, 0.11, 0.03, -0.1, -0.2, -0.2, -0.05, 0.23, 0.55, 0.8, 0.9, 0.8, 0.55, 0.23, -0.05, -0.2, -0.2, -0.1, 0.03, 0.11, 0.12],
              [0.12, 0.12, 0.05, -0.08, -0.19, -0.21, -0.12, 0.09, 0.34, 0.55, 0.62, 0.55, 0.34, 0.09, -0.12, -0.21, -0.19, -0.08, 0.05, 0.12, 0.12],
              [0.11, 0.13, 0.08, -0.03, -0.15, -0.21, -0.19, -0.07, 0.09, 0.23, 0.28, 0.23, 0.09, -0.07, -0.19, -0.21, -0.15, -0.03, 0.08, 0.13, 0.11],
              [0.08, 0.13, 0.11, 0.03, -0.09, -0.18, -0.22, -0.19, -0.12, -0.05, -0.02, -0.05, -0.12, -0.19, -0.22, -0.18, -0.09, 0.03, 0.11, 0.13, 0.08],
              [0.05, 0.11, 0.13, 0.08, -0.01, -0.1, -0.18, -0.21, -0.21, -0.2, -0.19, -0.2, -0.21, -0.21, -0.18, -0.1, -0.01, 0.08, 0.13, 0.11, 0.05],
              [0.01, 0.08, 0.12, 0.12, 0.07, -0.01, -0.09, -0.15, -0.19, -0.2, -0.21, -0.2, -0.19, -0.15, -0.09, -0.01, 0.07, 0.12, 0.12, 0.08, 0.01],
              [-0.03, 0.03, 0.09, 0.13, 0.12, 0.08, 0.03, -0.03, -0.08, -0.1, -0.11, -0.1, -0.08, -0.03, 0.03, 0.08, 0.12, 0.13, 0.09, 0.03, -0.03],
              [-0.07, -0.02, 0.04, 0.09, 0.12, 0.13, 0.11, 0.08, 0.05, 0.03, 0.02, 0.03, 0.05, 0.08, 0.11, 0.13, 0.12, 0.09, 0.04, -0.02, -0.07],
              [-0.09, -0.07, -0.02, 0.03, 0.08, 0.11, 0.13, 0.13, 0.12, 0.11, 0.11, 0.11, 0.12, 0.13, 0.13, 0.11, 0.08, 0.03, -0.02, -0.07, -0.09],
              [-0.08, -0.09, -0.07, -0.03, 0.01, 0.05, 0.08, 0.11, 0.12, 0.12, 0.12, 0.12, 0.12, 0.11, 0.08, 0.05, 0.01, -0.03, -0.07, -0.09, -0.08],
            ],
            colorscale: [
              [0, '#a9cbef'],
              [1, '#174a8b'],
            ],
            contours: { z: { show: true, usecolormap: true, project: { z: true } } },
            showscale: false,
          },
        ],
        layout: { scene: { camera: { eye: { x: 1.5, y: 1.5, z: 0.8 } }, zaxis: { title: { text: 'z' } } }, margin: { l: 0, r: 0, t: 0, b: 0 } },
      },
      note: 'The ripples fade as 1/r: each ring is lower than the one inside it. Drag to turn it.',
    },
  },
  {
    id: 'calculator',
    title: 'Calculator',
    group: 'data',
    use: 'A what-if tool: sliders and boxes for inputs, results from formulas updating as they change, and a chart of one result against an input.',
    keywords: 'calculator what if estimate formula sliders inputs outputs compute interactive tool scenario',
    shape: `{
  title: string
  inputs: {
    id: string                 // its name in the formulas: letters, digits and _
    label: string
    value: number              // where it starts
    min?: number               // with max: a slider (a number box without)
    max?: number
    step?: number
    unit?: string
    prefix?: string
    options?: { label: string, value: number }[]   // a choice instead of a number
  }[]
  outputs: {
    label: string
    formula: string            // of the inputs' ids and earlier outputs' ids: + - * / ^ ( ), min max round floor ceil abs sqrt log (base 10) ln exp pow, pi
    id?: string                // a name later formulas may use
    unit?: string
    prefix?: string
    decimals?: number          // fixed decimals (as many as needed unless set)
    big?: boolean              // shown large
  }[]
  formula_tex?: string         // the formulas in LaTeX, shown under the title
  chart?: { x: string, y: string, from?: number, to?: number }   // an output (y: its label) against an input (x: its id), over from..to (its slider's range unless set)
  note?: md
}`,
    example: {
      title: 'What an eyepiece gives on a 127 mm Maksutov',
      inputs: [
        { id: 'D', label: 'Aperture', value: 127, min: 60, max: 300, step: 1, unit: 'mm' },
        { id: 'F', label: 'Focal length', value: 1500, min: 400, max: 3000, step: 10, unit: 'mm' },
        { id: 'fe', label: 'Eyepiece', value: 25, min: 5, max: 40, step: 1, unit: 'mm' },
        { id: 'afov', label: 'Eyepiece field', value: 52, unit: '°', options: [{ label: 'Plössl 52°', value: 52 }, { label: 'Wide 68°', value: 68 }, { label: 'Ultra-wide 82°', value: 82 }] },
      ],
      outputs: [
        { id: 'M', label: 'Magnification', formula: 'F / fe', unit: '×', decimals: 0, big: true },
        { label: 'True field', formula: 'afov / M * 60', unit: '′', decimals: 0, big: true },
        { label: 'Exit pupil', formula: 'D / M', unit: 'mm', decimals: 1 },
        { label: 'Focal ratio', formula: 'F / D', prefix: 'f/', decimals: 1 },
        { label: 'Highest useful power', formula: '2 * D', unit: '×', decimals: 0 },
        { label: 'Finest detail (Dawes)', formula: '116 / D', unit: '″', decimals: 2 },
      ],
      formula_tex: 'M = \\frac{F}{f_e} \\qquad \\text{true field} = \\frac{\\text{eyepiece field}}{M} \\qquad \\text{exit pupil} = \\frac{D}{M}',
      chart: { x: 'fe', y: 'Magnification' },
      note: 'The full Moon is 31′ wide: a field over about 40′ frames it whole. Past twice the aperture in mm, the view only gets dimmer and softer.',
    },
  },
  {
    id: 'progress',
    title: 'Progress toward goals',
    group: 'data',
    use: 'How far along each goal is: a bar and a percentage toward its target, what is left, and the days to its due date.',
    keywords: 'progress goals targets tracker percent complete milestones resolutions savings goal challenge',
    shape: `{
  title?: string
  goals: {
    name: string
    value: number              // where it is now
    target: number
    start?: number             // where it began (0 unless set); a target below it counts down (a debt, a weight)
    unit?: string
    prefix?: string
    due?: date
    note?: string
  }[]
  note?: md
}`,
    example: {
      title: 'My 2026 goals, on 7 November',
      goals: [
        { name: 'Read 24 books', value: 19, target: 24, unit: 'books', due: '2026-12-31', note: 'One every 11 days from here' },
        { name: 'Run 1,000 km', value: 812, target: 1000, unit: 'km', due: '2026-12-31' },
        { name: 'Photograph the Messier catalogue', value: 64, target: 110, unit: 'objects' },
        { name: 'Save for an EQ6-R Pro mount', value: 1350, target: 2000, prefix: '$', due: '2027-03-01' },
        { name: 'Pay off the car loan', start: 9600, value: 3150, target: 0, prefix: '$', due: '2027-06-30' },
        { name: 'Visit five new countries', value: 5, target: 5, unit: 'countries', note: 'Portugal, Japan, Iceland, Peru, Georgia' },
      ],
    },
  },
  {
    id: 'results',
    title: 'Experiment results',
    group: 'data',
    use: 'Results as papers show them: methods by metrics, the best bold and the second underlined, ± spread, differences from a baseline, sorting by a metric.',
    keywords: 'results benchmark experiments evaluation metrics baseline ablation leaderboard models scores paper table sota',
    shape: `{
  title?: string
  metrics: string[]            // the columns
  higher_better?: boolean[]    // per metric: true unless set (false for latency, error, perplexity)
  rows: {
    name: string
    values: (number | null)[]  // one per metric
    std?: (number | null)[]    // ± spread, one per metric
    group?: string             // rows of a group sit under its heading
    baseline?: boolean         // the row differences are taken against
    note?: string              // after the name: a setting, a citation
  }[]
  decimals?: number | number[] // one for all, or one per metric (as written unless set)
  note?: md
}`,
    example: {
      title: 'Zero-shot retrieval on BEIR (13 datasets, averages)',
      metrics: ['nDCG@10', 'Recall@100', 'Latency (ms)'],
      higher_better: [true, true, false],
      decimals: [1, 1, 0],
      rows: [
        { name: 'BM25', group: 'Sparse', values: [42.9, 65.8, 21], baseline: true, note: 'Pyserini, flat' },
        { name: 'SPLADE++', group: 'Sparse', values: [50.7, 71.9, 48], note: 'CoCondenser-EnsembleDistil' },
        { name: 'Contriever', group: 'Dense', values: [47.5, 69.7, 35], note: 'fine-tuned on MS MARCO' },
        { name: 'E5-base-v2', group: 'Dense', values: [50.3, 71.1, 36] },
        { name: 'ColBERTv2', group: 'Dense', values: [49.9, 70.4, 64], note: 'PLAID' },
        { name: 'monoT5-3B', group: 'Re-ranking BM25’s top 100', values: [52.1, 65.8, 1340] },
        { name: 'RankZephyr-7B', group: 'Re-ranking BM25’s top 100', values: [52.9, 65.8, 2950], note: 'listwise' },
        { name: 'Reasoning re-ranker, 1.7B (ours)', group: 'Re-ranking BM25’s top 100', values: [53.4, 65.8, 980], std: [0.3, null, 40] },
      ],
      note: '± is the standard deviation over 3 seeds. Re-rankers re-score BM25’s top 100, so their Recall@100 is BM25’s. Latency per query on one A100.',
    },
  },
  {
    id: 'sankey',
    title: 'Sankey diagram',
    group: 'data',
    use: 'Flows from stage to stage as bands as wide as their amounts (income to spending, energy sources to uses), with values on hover.',
    keywords: 'sankey flow diagram flows sources uses money flow energy flow allocation budget where it goes alluvial',
    shape: `{
  title?: string
  links: { from: string, to: string, value: number }[]   // the nodes are named by the links, left to right; what flows into a node should match what flows out
  unit?: string
  prefix?: string
  note?: md
}`,
    example: {
      title: 'Where our money went in October',
      links: [
        { from: 'Salary', to: 'Income', value: 6400 },
        { from: 'Freelance', to: 'Income', value: 1100 },
        { from: 'Income', to: 'Taxes', value: 1720 },
        { from: 'Income', to: 'Housing', value: 2150 },
        { from: 'Income', to: 'Food', value: 860 },
        { from: 'Income', to: 'Transport', value: 430 },
        { from: 'Income', to: 'Savings', value: 1500 },
        { from: 'Income', to: 'Everything else', value: 840 },
        { from: 'Housing', to: 'Rent', value: 1850 },
        { from: 'Housing', to: 'Utilities', value: 300 },
        { from: 'Food', to: 'Groceries', value: 610 },
        { from: 'Food', to: 'Eating out', value: 250 },
        { from: 'Savings', to: 'Pension', value: 700 },
        { from: 'Savings', to: 'Index funds', value: 500 },
        { from: 'Savings', to: 'Emergency fund', value: 300 },
      ],
      prefix: '$',
      note: 'A fifth of the income was saved; housing took the largest share, at 29%.',
    },
  },
  {
    id: 'distribution',
    title: 'Histogram and box plots',
    group: 'data',
    use: 'How values spread: a histogram marking the mean and median, the summary (count, quartiles, spread), or groups compared as box plots; counts on hover.',
    keywords: 'distribution histogram box plot spread frequency bins quartiles median mean standard deviation outliers percentiles exam scores',
    shape: `{
  title?: string
  values?: number[]            // the raw values: the bins are worked out from them
  bins?: { from: number, to: number, count: number }[]   // counts already in bins, instead of values
  bin_width?: number           // the width of a bin for values (worked out unless set)
  groups?: { name: string, values: number[] }[]   // groups to compare: a box plot each, on one scale (at most 8)
  unit?: string                // after values ("min", "kg", "%")
  marks?: { value: number, label: string }[]      // lines at values of note: a pass mark, a target, your own
  note?: md
}
Values or bins draw a histogram, groups draw box plots; give both to show both.`,
    example: {
      title: 'Physics midterm, 58 students',
      values: [58, 89, 85, 80, 78, 38, 68, 87, 81, 23, 76, 70, 62, 72, 70, 58, 71, 68, 76, 52, 70, 69, 72, 91, 77, 58, 80, 61, 71, 31, 69, 84, 71, 86, 67, 61, 70, 46, 78, 64, 66, 78, 64, 80, 71, 61, 77, 85, 69, 67, 53, 68, 58, 94, 67, 69, 70, 67],
      bin_width: 5,
      groups: [
        { name: 'Came to the review session', values: [89, 80, 68, 81, 70, 72, 71, 76, 69, 91, 80, 71, 84, 86, 70, 78, 78, 80, 77, 69, 68, 94, 70, 67] },
        { name: 'Did not', values: [58, 85, 78, 38, 87, 23, 76, 62, 70, 58, 68, 52, 70, 72, 77, 58, 61, 31, 69, 71, 67, 61, 46, 64, 66, 64, 71, 61, 85, 67, 53, 58, 67, 69] },
      ],
      marks: [{ value: 50, label: 'Pass mark' }],
      note: 'Four students failed, none of them from the review session. Those who came scored a median **10 points** higher, and their scores spread about half as widely.',
    },
  },
  {
    id: 'waterfall',
    title: 'Waterfall chart',
    group: 'data',
    use: 'How a total got from start to end: a bar rising or falling for each gain and loss, running totals, the overall change, values on hover.',
    keywords: 'waterfall bridge profit loss walk what changed drivers increases decreases net change variance year over year reconciliation',
    shape: `{
  title?: string
  start: { label: string, value: number }   // where it begins: last year's profit, the opening balance
  steps: {
    label: string
    value?: number             // the change: positive for a gain, negative for a loss
    subtotal?: boolean         // a bar of the running total so far instead ("Gross profit"): no value
    note?: string
  }[]
  end?: { label: string, value?: number }   // the last bar: the total, worked out (a given value that differs adds an "Other" step)
  unit?: string
  prefix?: string              // before values ("$")
  note?: md
}`,
    example: {
      title: 'Why Hearth & Crumb’s profit rose in 2026',
      start: { label: '2025 profit', value: 182000 },
      steps: [
        { label: 'More customers', value: 64000, note: 'The second shop, open since March' },
        { label: 'Higher prices', value: 23000, note: 'Up 6% in January' },
        { label: 'Flour and butter', value: -31000 },
        { label: 'Two new bakers', value: -38000 },
        { label: 'Rent', value: -12000 },
        { label: 'Wholesale to cafés', value: 27000, note: 'Nine cafés take bread every morning' },
        { label: 'Energy', value: 6000, note: 'The new ovens use a third less' },
      ],
      end: { label: '2026 profit' },
      prefix: '$',
      note: 'Profit rose **$39,000 (21%)**: the second shop and the wholesale orders brought in more than the extra bakers and dearer ingredients cost.',
    },
  },
  {
    id: 'treemap',
    title: 'Treemap',
    group: 'data',
    use: 'Rectangles sized by value, nested in groups (disk space, team costs, market sectors): click a group to open it, hover for value and share.',
    keywords: 'treemap nested rectangles sizes disk space storage usage hierarchy largest biggest what takes up room sectors departments',
    shape: `{
  title?: string
  items: {
    name: string
    value?: number             // a group's is its children's sum (a larger one given adds an "Other" child)
    children?: { name: string, value: number, note?: string }[]
    note?: string
  }[]                          // up to 8 take the palette's colours; more are grey
  unit?: string                // after values ("GB", "people")
  prefix?: string              // before them ("$")
  note?: md
}`,
    example: {
      title: 'What fills my 512 GB laptop drive',
      unit: 'GB',
      items: [
        { name: 'Photos', children: [{ name: 'Photos library', value: 118 }, { name: 'Lightroom previews', value: 16, note: 'Rebuilt when needed' }, { name: 'Screenshots and recordings', value: 8 }] },
        { name: 'Developer', children: [{ name: 'Docker images', value: 41, note: '23 images, 14 not used since spring' }, { name: 'Xcode simulators', value: 29 }, { name: 'node_modules in 37 projects', value: 18 }, { name: 'Python environments', value: 8 }] },
        { name: 'Applications', value: 64 },
        { name: 'Videos', children: [{ name: 'Family videos', value: 34 }, { name: 'Downloaded courses', value: 24 }] },
        { name: 'macOS and system data', value: 38 },
        { name: 'Music', children: [{ name: 'Logic Pro sound library', value: 19 }, { name: 'Music library', value: 8 }] },
        { name: 'Documents', value: 21 },
        { name: 'Messages and Mail', children: [{ name: 'Messages attachments', value: 11 }, { name: 'Mail', value: 3 }] },
      ],
      note: '**460 GB of 512 GB** used. Docker images and simulators take 70 GB that can be rebuilt any time: `docker system prune -a` and deleting old simulators would free most of it.',
    },
  },
  {
    id: 'activity',
    title: 'Activity calendar',
    group: 'data',
    use: 'Days shaded by how much was done (practice, runs, commits, sleep), weeks as columns: the total, longest and current streaks, each day on hover.',
    keywords: 'activity calendar heatmap streak habit tracker daily log contributions commits practice consistency days in a row year in review',
    shape: `{
  title?: string
  days: Record<date, number>   // each day's amount: { "2026-11-02": 25, … }; days left out count as none (a list of { date, value } works too)
  unit?: string                // what the amounts are in: "min", "km", "commits"
  start?: date                 // the first day shown (the data's first unless set)
  end?: date                   // the last (the data's last unless set)
  note?: md
}`,
    example: {
      title: 'Guitar practice since May',
      unit: 'min',
      start: '2026-05-01',
      days: {
        '2026-05-01': 20, '2026-05-03': 40, '2026-05-04': 25, '2026-05-05': 35, '2026-05-06': 15, '2026-05-08': 10, '2026-05-09': 45, '2026-05-10': 60, '2026-05-11': 30, '2026-05-12': 30, '2026-05-13': 25, '2026-05-14': 10, '2026-05-15': 30, '2026-05-19': 30, '2026-05-20': 20, '2026-05-21': 30,
        '2026-05-22': 40, '2026-05-23': 45, '2026-05-24': 35, '2026-05-25': 40, '2026-05-27': 35, '2026-05-29': 35, '2026-05-30': 50, '2026-06-01': 25, '2026-06-02': 20, '2026-06-03': 30, '2026-06-04': 20, '2026-06-05': 30, '2026-06-06': 75, '2026-06-07': 55, '2026-06-08': 45, '2026-06-09': 35,
        '2026-06-10': 10, '2026-06-15': 25, '2026-06-16': 35, '2026-06-17': 30, '2026-06-18': 30, '2026-06-19': 20, '2026-06-20': 50, '2026-06-21': 30, '2026-06-22': 35, '2026-06-23': 10, '2026-06-24': 35, '2026-06-25': 30, '2026-06-26': 10, '2026-06-27': 35, '2026-06-28': 60, '2026-06-29': 45,
        '2026-06-30': 30, '2026-07-03': 10, '2026-07-04': 40, '2026-07-05': 35, '2026-07-06': 20, '2026-07-07': 25, '2026-07-08': 30, '2026-07-09': 25, '2026-07-10': 35, '2026-07-12': 25, '2026-07-13': 35, '2026-07-14': 20, '2026-07-15': 50, '2026-07-17': 30, '2026-07-18': 40, '2026-07-19': 55,
        '2026-07-20': 25, '2026-07-22': 35, '2026-07-23': 50, '2026-07-24': 45, '2026-07-25': 50, '2026-07-26': 55, '2026-07-27': 40, '2026-07-28': 35, '2026-07-29': 45, '2026-07-30': 15, '2026-07-31': 35, '2026-08-02': 50, '2026-08-03': 10, '2026-08-04': 25, '2026-08-05': 50, '2026-08-07': 35,
        '2026-08-17': 35, '2026-08-18': 45, '2026-08-19': 30, '2026-08-20': 30, '2026-08-21': 20, '2026-08-22': 55, '2026-08-23': 40, '2026-08-24': 45, '2026-08-25': 25, '2026-08-26': 30, '2026-08-27': 40, '2026-08-28': 25, '2026-08-29': 65, '2026-08-30': 35, '2026-08-31': 30, '2026-09-01': 15,
        '2026-09-02': 45, '2026-09-03': 25, '2026-09-04': 10, '2026-09-05': 35, '2026-09-06': 40, '2026-09-07': 45, '2026-09-08': 25, '2026-09-09': 35, '2026-09-10': 25, '2026-09-11': 30, '2026-09-12': 50, '2026-09-13': 35, '2026-09-14': 30, '2026-09-15': 20, '2026-09-16': 15, '2026-09-17': 15,
        '2026-09-18': 30, '2026-09-19': 60, '2026-09-20': 60, '2026-09-21': 50, '2026-09-22': 35, '2026-09-23': 35, '2026-09-24': 50, '2026-09-25': 20, '2026-09-26': 65, '2026-09-28': 35, '2026-09-29': 30, '2026-10-01': 45, '2026-10-02': 20, '2026-10-03': 55, '2026-10-04': 50, '2026-10-05': 40,
        '2026-10-06': 25, '2026-10-07': 35, '2026-10-08': 25, '2026-10-09': 20, '2026-10-11': 60, '2026-10-12': 15, '2026-10-13': 40, '2026-10-15': 15, '2026-10-16': 10, '2026-10-17': 65, '2026-10-18': 50, '2026-10-19': 40, '2026-10-20': 35, '2026-10-21': 45, '2026-10-22': 45, '2026-10-23': 55,
        '2026-10-24': 45, '2026-10-25': 55, '2026-10-26': 35, '2026-10-27': 40, '2026-10-28': 25, '2026-10-29': 30, '2026-10-30': 40, '2026-10-31': 50, '2026-11-01': 55, '2026-11-02': 20, '2026-11-03': 45, '2026-11-04': 20, '2026-11-05': 50, '2026-11-06': 35, '2026-11-07': 60,
      },
      note: '**93 hours** since May, on 159 of 191 days. October was the biggest month yet, at 18½ hours, and today makes 24 days in a row: 18 more beat the record of 41, set after the August holiday.',
    },
  },
  {
    id: 'map-values',
    title: 'Values on a map',
    group: 'data',
    use: 'Numbers at places (city populations, earthquakes, sales by store): circles sized by value on a map, beside a ranked list with bars.',
    keywords: 'map values bubble map circles sized by value cities populations earthquakes sales by store region geography per city choropleth',
    shape: `{
  title?: string
  points: { name: string, lat: number, lng: number, value: number, note?: string }[]
  unit?: string                // after values ("orders", "people")
  prefix?: string              // before them ("$")
  note?: md
}`,
    example: {
      title: 'Where Clay & Kiln’s October orders went',
      unit: 'orders',
      points: [
        { name: 'Portland', lat: 45.5152, lng: -122.6784, value: 64, note: 'Home: local pickup at the studio' },
        { name: 'Seattle', lat: 47.6062, lng: -122.3321, value: 47 },
        { name: 'New York', lat: 40.7128, lng: -74.006, value: 38, note: 'Up 60% since the gift guide feature' },
        { name: 'San Francisco', lat: 37.7749, lng: -122.4194, value: 33 },
        { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, value: 29 },
        { name: 'Chicago', lat: 41.8781, lng: -87.6298, value: 22 },
        { name: 'Austin', lat: 30.2672, lng: -97.7431, value: 18 },
        { name: 'Denver', lat: 39.7392, lng: -104.9903, value: 16 },
        { name: 'Boston', lat: 42.3601, lng: -71.0589, value: 15 },
        { name: 'Washington', lat: 38.9072, lng: -77.0369, value: 12 },
        { name: 'Minneapolis', lat: 44.9778, lng: -93.265, value: 11 },
        { name: 'Philadelphia', lat: 39.9526, lng: -75.1652, value: 9 },
        { name: 'Atlanta', lat: 33.749, lng: -84.388, value: 9 },
        { name: 'San Diego', lat: 32.7157, lng: -117.1611, value: 8 },
        { name: 'Salt Lake City', lat: 40.7608, lng: -111.891, value: 7 },
      ],
      note: '**44%** of the 412 orders went to five West Coast cities; New York is the largest market outside it.',
    },
  },
];
