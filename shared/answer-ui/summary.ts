// Answer UIs that sum things up or lay out notes: key points, callouts, fact sheets, definitions, FAQs, tabs…
import type { AnswerUiSpec } from './types.ts';

export const SUMMARY: AnswerUiSpec[] = [
  {
    id: 'key-points',
    title: 'Key points',
    group: 'summary',
    use: 'The answer in one line, then the few points that matter, each with optional detail: a TL;DR for a long or nuanced answer.',
    keywords: 'tldr summary takeaways verdict highlights main points bottom line conclusion recap',
    shape: `{
  verdict?: md          // the answer in a line, shown first and largest
  points: (md | { text: md, detail?: md, icon?: string })[]   // 2 to 7; icon: one emoji
  caveat?: md           // what it depends on, or what is uncertain
  confidence?: "high" | "medium" | "low"
}`,
    example: {
      verdict: 'Yes, for most homes: a **cold-climate heat pump** heats well down to −25 °C and costs less to run than oil or propane.',
      points: [
        { icon: '💸', text: 'Running costs fall 30–50% against oil heat', detail: 'Each kWh of electricity moves 2.5–3.5 kWh of heat into the house over a winter.' },
        { icon: '❄️', text: 'Cold-climate models keep their output in deep cold', detail: 'Look for the NEEP cold-climate list and a rated capacity at −15 °C close to its nominal one.' },
        { icon: '🏠', text: 'Insulation and air sealing come first', detail: 'A leaky house needs a bigger unit; sealing first can save a size step.' },
        { icon: '🧾', text: 'Rebates often cover a third or more of the price' },
      ],
      caveat: 'The savings depend on your electricity price: above about \\$0.30 per kWh, gas can still be cheaper to run.',
      confidence: 'high',
    },
  },
  {
    id: 'callout',
    title: 'Callout',
    group: 'summary',
    use: 'A note, tip, warning or danger notice set apart from the answer, with an icon and a colour by its tone.',
    keywords: 'note tip warning caution danger important alert notice heads up admonition highlight success reminder',
    shape: `{
  tone: "note" | "tip" | "important" | "warning" | "danger" | "success"
  title?: string        // a few words; the tone's name when left out
  text: md
}`,
    example: {
      tone: 'warning',
      title: 'Turn the power off at the breaker first',
      text: 'A wall switch breaks only one wire, so the fixture can still be live. Switch the circuit off at the panel, then check the wires with a **non-contact voltage tester** before you touch them.',
    },
  },
  {
    id: 'fact-sheet',
    title: 'Fact sheet',
    group: 'summary',
    use: 'The key facts about one thing in an infobox, with a picture, more facts under headings and links: a country, company, planet, animal or building.',
    keywords: 'facts infobox profile overview about stats at a glance country city company planet animal element building',
    shape: `{
  title: string
  subtitle?: string          // what it is, in a few words
  image?: image
  summary?: md               // a sentence or two
  facts: Fact[]              // the key facts, 4 to 10
  sections?: { title: string, facts: Fact[] }[]   // more facts under headings
  links?: { label: string, url: url }[]
}
Fact = { label: string, value: md, note?: string }   // note: a short line under the value`,
    example: {
      title: 'Saturn',
      subtitle: 'The sixth planet from the Sun',
      image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Saturn_global_view_from_Cassini%2C_rings_open_Better_Colour.png/960px-Saturn_global_view_from_Cassini%2C_rings_open_Better_Colour.png',
      summary: 'The second-largest planet, a ball of hydrogen and helium so light it would float in water, circled by the brightest rings in the Solar System.',
      facts: [
        { label: 'Type', value: 'Gas giant' },
        { label: 'Distance from the Sun', value: '1.43 billion km', note: '9.6 times Earth’s' },
        { label: 'Diameter', value: '120,536 km', note: '9.4 × Earth, at the equator' },
        { label: 'Mass', value: '95 × Earth' },
        { label: 'Day', value: '10 h 33 min' },
        { label: 'Year', value: '29.5 Earth years' },
        { label: 'Moons', value: '274 known', note: 'Titan is the largest' },
        { label: 'Density', value: '0.69 g/cm³', note: 'less than water' },
      ],
      sections: [
        {
          title: 'Atmosphere',
          facts: [
            { label: 'Made of', value: '96% hydrogen, 3% helium' },
            { label: 'Temperature', value: 'about −140 °C', note: 'at the cloud tops' },
            { label: 'Winds', value: 'up to 1,800 km/h' },
          ],
        },
        {
          title: 'Rings',
          facts: [
            { label: 'Span', value: '7,000 – 80,000 km', note: 'above the equator' },
            { label: 'Thickness', value: 'about 10 m in places' },
            { label: 'Made of', value: 'water ice, rock and dust' },
          ],
        },
      ],
      links: [
        { label: 'NASA: Saturn', url: 'https://science.nasa.gov/saturn/' },
        { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Saturn' },
      ],
    },
  },
  {
    id: 'definition',
    title: 'Definition',
    group: 'summary',
    use: 'A dictionary entry: pronunciation with a listen button, each sense with examples, synonyms and antonyms, and where the word comes from.',
    keywords: 'define definition meaning dictionary word pronunciation synonyms antonyms etymology origin what does mean',
    shape: `{
  term: string
  phonetic?: string            // IPA: "/ˈsæŋɡwɪn/"
  lang?: string                // the term's language, BCP-47 ("en", "fr-FR"): the listen button speaks in it
  senses: {
    pos?: string               // part of speech: "noun", "adjective"
    meaning: md
    examples?: string[]        // sentences that use it
    synonyms?: string[]
    antonyms?: string[]
  }[]
  origin?: md                  // where the word comes from
  forms?: string[]             // its other forms: "sanguinely"
  related?: string[]           // words that go with it or are easily confused with it
}`,
    example: {
      term: 'sanguine',
      phonetic: '/ˈsæŋɡwɪn/',
      lang: 'en',
      senses: [
        {
          pos: 'adjective',
          meaning: 'Hopeful and confident, especially when things look bad.',
          examples: ['She stayed sanguine about the launch despite the delays.'],
          synonyms: ['optimistic', 'hopeful', 'upbeat', 'confident'],
          antonyms: ['pessimistic', 'gloomy'],
        },
        { pos: 'adjective', meaning: '*Literary.* Blood-red, or of a ruddy, healthy colour.', examples: ['the sanguine glow of the evening sky'], synonyms: ['ruddy', 'florid'] },
        { pos: 'noun', meaning: 'A reddish-brown chalk or crayon, or a drawing made with it.', examples: ['a sanguine study of a woman’s head'] },
      ],
      origin: 'Middle English, from Old French *sanguin*, from Latin *sanguineus* “of blood”. Medieval medicine held that a body ruled by blood, one of the four humours, had a ruddy face and a cheerful, hopeful temper.',
      forms: ['sanguinely', 'sanguineness'],
      related: ['sanguinary (bloodthirsty)', 'consanguinity'],
    },
  },
  {
    id: 'glossary',
    title: 'Glossary',
    group: 'summary',
    use: 'Terms and their meanings with a filter box and topic chips, grouped by letter when there are many: the words of a field or document.',
    keywords: 'glossary terms terminology vocabulary jargon definitions acronyms abbreviations key terms words list',
    shape: `{
  title?: string
  terms: { term: string, meaning: md, tag?: string }[]   // tag: a topic, to filter by
}`,
    example: {
      title: 'Photography terms',
      terms: [
        { term: 'Aperture', meaning: 'The opening in the lens that lets light in, written as an f-number: **f/1.8** is wide open, **f/16** is narrow.', tag: 'Exposure' },
        { term: 'Bokeh', meaning: 'The soft, blurred look of the parts of a photo that are out of focus.', tag: 'Lens' },
        { term: 'Depth of field', meaning: 'How much of the scene, front to back, looks sharp. A wide aperture makes it shallow.', tag: 'Lens' },
        { term: 'Exposure', meaning: 'How much light reaches the sensor, set by the aperture, the shutter speed and the ISO together.', tag: 'Exposure' },
        { term: 'Focal length', meaning: 'How zoomed-in a lens is: 24 mm is wide, 85 mm suits portraits, 200 mm brings far things close.', tag: 'Lens' },
        { term: 'Golden hour', meaning: 'The hour after sunrise and before sunset, when light is warm, soft and low.', tag: 'Light' },
        { term: 'Histogram', meaning: 'A graph of a photo’s tones from black on the left to white on the right: bunched at an edge means lost detail.', tag: 'Editing' },
        { term: 'ISO', meaning: 'How sensitive the sensor is to light. A higher ISO shoots in the dark but adds grain.', tag: 'Exposure' },
        { term: 'RAW', meaning: 'A file that keeps everything the sensor saw, so exposure and white balance can be changed later without loss.', tag: 'Editing' },
        { term: 'Rule of thirds', meaning: 'Placing the subject on the lines that split the frame into thirds, rather than in the middle.', tag: 'Composition' },
        { term: 'Shutter speed', meaning: 'How long the shutter stays open: **1/1000 s** freezes motion, **1 s** blurs it.', tag: 'Exposure' },
        { term: 'White balance', meaning: 'The setting that makes white look white under warm lamps or in cool shade.', tag: 'Light' },
      ],
    },
  },
  {
    id: 'faq',
    title: 'FAQ',
    group: 'summary',
    use: 'Questions and answers as an accordion, the first open, with a button to open them all: an FAQ, or the questions a topic always raises.',
    keywords: 'faq frequently asked questions answers accordion q&a common questions help expandable',
    shape: `{
  title?: string
  items: { q: string, a: md }[]
}`,
    example: {
      title: 'Composting at home',
      items: [
        { q: 'What can go in the compost?', a: 'Fruit and vegetable scraps, coffee grounds and filters, tea leaves, eggshells, grass clippings and leaves, and shredded cardboard. Leave out **meat, fish, dairy, oils** and pet waste: they smell and draw pests.' },
        { q: 'Why does my compost smell bad?', a: 'A sour or rotten smell means it is too wet or has too many greens (scraps, grass). Mix in browns such as dry leaves or cardboard, and turn it to let air in. Good compost smells like earth.' },
        { q: 'How long does it take?', a: 'Two to six months in a hot pile you turn every week or two; six months to a year in a cold pile you leave alone. It is ready when it is dark and crumbly and you can no longer tell what went in.' },
        { q: 'Can I compost in winter?', a: 'Yes. The pile slows down or freezes, but keep adding scraps: it picks up again in spring. A bigger pile, or one wrapped in straw or leaves, keeps working longer.' },
        { q: 'Do I need worms?', a: 'No: worms find an outdoor pile by themselves. A **worm bin** is worth it when you have no garden, though: it fits under a sink and turns kitchen scraps into rich compost.' },
      ],
    },
  },
  {
    id: 'tabs',
    title: 'Tabs',
    group: 'summary',
    use: 'The same topic in tabs the user switches between: steps for each operating system, each skill level, each option or plan.',
    keywords: 'tabs tabbed per operating system windows mac linux platform options versions levels alternatives switch',
    shape: `{
  title?: string
  tabs: { label: string, icon?: string, content: md }[]   // 2 to 6; icon: one emoji
}`,
    example: {
      title: 'Taking a screenshot',
      tabs: [
        { label: 'Windows', icon: '🪟', content: '- **Win + Shift + S** (or **PrtScn** on Windows 11) opens the Snipping Tool: drag over an area, then paste it anywhere.\n- **Win + PrtScn** saves the whole screen to *Pictures → Screenshots*.' },
        { label: 'Mac', icon: '🍎', content: '- **⌘ Shift 3** takes the whole screen.\n- **⌘ Shift 4** lets you drag over an area; press **Space** to take one window instead.\n- **⌘ Shift 5** opens a toolbar with screen recording and a timer.\n\nScreenshots are saved on the desktop.' },
        { label: 'Linux', icon: '🐧', content: 'On GNOME (Ubuntu, Fedora), **PrtScn** opens the screenshot tool: pick an area, a window or the whole screen. **Shift + PrtScn** takes the whole screen at once, **Alt + PrtScn** the window you are in. They are saved in *Pictures → Screenshots*.' },
        { label: 'Chromebook', icon: '💻', content: '- **Ctrl + Show windows** takes the whole screen.\n- **Ctrl + Shift + Show windows** lets you take an area or a window.\n\nThey are saved in *Downloads*.' },
      ],
    },
  },
  {
    id: 'columns',
    title: 'Columns',
    group: 'summary',
    use: 'Two to four columns side by side, stacked when narrow: do and don’t, myth and fact, before and after, plan A and plan B.',
    keywords: 'columns side by side do dont dos and donts myth fact before after two columns contrast',
    shape: `{
  title?: string
  columns: { title: string, tone?: tone, icon?: string, content: md }[]   // 2 to 4; icon: one emoji (good and bad tones get ✓ and ✗ without one)
  note?: md
}`,
    example: {
      title: 'Looking after a cast-iron pan',
      columns: [
        { title: 'Do', tone: 'good', content: '- Wash it while it is warm, with hot water and a brush; a little soap is fine\n- Dry it on the stove for a minute so no water is left\n- Wipe in a thin film of oil while it is still warm\n- Cook with it often: every meal adds to the seasoning' },
        { title: 'Don’t', tone: 'bad', content: '- Leave it soaking in the sink or put it in the dishwasher\n- Let it air-dry: it rusts overnight\n- Simmer tomato sauce or wine for hours in a new pan\n- Store it with the lid on, which traps moisture' },
      ],
      note: 'Rust is not the end of it: scrub it off with steel wool, oil the pan and bake it upside down at 230 °C for an hour.',
    },
  },
  {
    id: 'quote',
    title: 'Quote',
    group: 'summary',
    use: 'A quotation set as a pull quote, with who said it, their picture, and where and when it was said or written.',
    keywords: 'quote quotation saying citation words said by pull quote epigraph testimonial famous line',
    shape: `{
  text: md
  author?: string
  role?: string          // who they are, in a few words
  source?: string        // where it was said or written
  url?: url              // the source, online
  image?: image          // the author's portrait
  date?: string          // date (YYYY-MM-DD), or a year
}`,
    example: {
      text: 'The first principle is that you must not fool yourself, and you are the easiest person to fool.',
      author: 'Richard Feynman',
      role: 'Physicist, Nobel Prize 1965',
      source: '“Cargo Cult Science”, Caltech commencement address',
      url: 'https://calteches.library.caltech.edu/51/2/CargoCult.htm',
      image: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/42/Richard_Feynman_Nobel.jpg/330px-Richard_Feynman_Nobel.jpg',
      date: '1974-06-14',
    },
  },
  {
    id: 'cards',
    title: 'Cards',
    group: 'summary',
    use: 'A grid or list of cards with pictures, tags and links, for anything list-like: ideas, resources, options, places to start.',
    keywords: 'cards grid tiles list gallery ideas resources suggestions options collection picks recommendations',
    shape: `{
  title?: string
  layout?: "grid" | "list"     // grid unless set
  cards: {
    title: string
    text?: md
    image?: image
    tag?: string               // a short label on the card
    meta?: string              // a line of small print: a price, a time, a place
    url?: url
  }[]
}`,
    example: {
      title: 'Houseplants that are hard to kill',
      cards: [
        { title: 'Snake plant', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Snake_Plant_%28Sansevieria_trifasciata_%27Laurentii%27%29.jpg/500px-Snake_Plant_%28Sansevieria_trifasciata_%27Laurentii%27%29.jpg', tag: 'Low light', meta: 'Water every 2–3 weeks', text: 'Stiff, upright leaves that put up with dim corners, dry air and being forgotten.' },
        { title: 'ZZ plant', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Zamioculcas_zamiifolia_1.jpg/500px-Zamioculcas_zamiifolia_1.jpg', tag: 'Low light', meta: 'Water every 2–3 weeks', text: 'Glossy leaves on thick stems that store water: it would rather be ignored than overwatered.' },
        { title: 'Pothos', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Money_Plant_%28Epipremnum_aureum%29_4.jpg/500px-Money_Plant_%28Epipremnum_aureum%29_4.jpg', tag: 'Fast grower', meta: 'Water weekly', text: 'A trailing vine for a shelf; its leaves droop when it is thirsty and lift again within hours.' },
        { title: 'Spider plant', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Hierbabuena_0611_Revised.jpg/500px-Hierbabuena_0611_Revised.jpg', tag: 'Safe for pets', meta: 'Water weekly', text: 'Arching striped leaves, and baby plants on runners you can pot up and give away.' },
        { title: 'Peace lily', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Spathiphyllum_cochlearispathum_RTBG.jpg/500px-Spathiphyllum_cochlearispathum_RTBG.jpg', tag: 'Flowers', meta: 'Water when it droops', text: 'White flowers even in shade, and it wilts dramatically to tell you it needs water.' },
        { title: 'Cast-iron plant', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Aspidistra_elatior1.jpg/500px-Aspidistra_elatior1.jpg', tag: 'Safe for pets', meta: 'Water every 1–2 weeks', text: 'Named for being nearly indestructible: cold rooms, deep shade and dust do not bother it.' },
      ],
    },
  },
];
