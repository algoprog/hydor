// Answer UIs that compare options and help decide: comparison tables, pros and cons, scores, rankings, picks…
import type { AnswerUiSpec } from './types.ts';

export const COMPARE: AnswerUiSpec[] = [
  {
    id: 'comparison',
    title: 'Comparison table',
    group: 'compare',
    use: 'Two to six options side by side, attribute by attribute, with the best value in each row marked and an optional pick.',
    keywords: 'compare versus side by side specs differences table features options alternatives which is better',
    shape: `{
  title?: string
  items: { name: string, image?: image, subtitle?: string, badge?: string, url?: url }[]   // the columns, 2 to 6
  rows: {
    label: string
    values: (md | number | boolean | null)[]   // one per item, in order: true/false show as ✓/✗, null as —
    best?: "high" | "low" | number             // mark the highest or lowest number, or the item at that index (from 0)
    unit?: string                               // shown after each number ("g", "h", "GB")
    prefix?: string                             // shown before each number ("$")
    group?: string                              // rows with the same group sit under one heading
  }[]
  winner?: number      // the item to mark as the pick (its index from 0)
  verdict?: md         // a line under the table
}`,
    example: {
      title: 'E-readers for reading in bed and on the beach',
      items: [
        { name: 'Kindle Paperwhite', subtitle: '2024, 16 GB', image: 'https://www.zdnet.com/wp-content/uploads/sites/3/Kindle-Paperwhite-1.jpg' },
        { name: 'Kobo Clara BW', subtitle: '2024, 16 GB', image: 'https://ereader.kobo.com/cdn/shop/files/1-Dual_Device-UK-ANZ_1080x1080_8783d29f-1db3-4f71-a028-fabe94de4892_1200x1200.png?v=1757384449' },
        { name: 'Kobo Libra Colour', subtitle: '2024, 32 GB', badge: 'Pick', image: 'https://ereader.kobo.com/cdn/shop/products/IO_Dual_EN_1200x1200.jpg?v=1633065973' },
      ],
      rows: [
        { label: 'Price', values: [160, 130, 220], prefix: '$', best: 'low' },
        { label: 'Screen', values: [7, 6, 7], unit: '″', best: 'high' },
        { label: 'Weight', values: [211, 174, 199], unit: 'g', best: 'low' },
        { label: 'Battery', values: ['up to 12 weeks', 'up to 6 weeks', 'up to 6 weeks'], best: 0 },
        { label: 'Waterproof (IPX8)', values: [true, true, true], group: 'Features' },
        { label: 'Colour screen', values: [false, false, true], group: 'Features' },
        { label: 'Page-turn buttons', values: [false, false, true], group: 'Features' },
        { label: 'Library loans', values: ['Libby (US)', 'OverDrive built in', 'OverDrive built in'], group: 'Features' },
      ],
      winner: 2,
      verdict: 'The **Libra Colour** is worth the extra for its buttons and colour covers; the **Clara BW** is the lightest for one-handed reading.',
    },
  },
  {
    id: 'pros-cons',
    title: 'Pros and cons',
    group: 'compare',
    use: 'The pros and cons of one thing in two columns with a verdict, or of several options, switched between with a toggle.',
    keywords: 'pros cons advantages disadvantages benefits drawbacks upsides downsides good bad tradeoffs should i worth it',
    shape: `{
  subject?: string
  pros: md[]
  cons: md[]
  verdict?: md
}
// or several options, each with its own (a switch picks one):
{
  subject?: string
  options: { name: string, pros: md[], cons: md[], verdict?: md }[]
}`,
    example: {
      subject: 'Ways to learn Spanish',
      options: [
        {
          name: 'An app',
          pros: ['Costs little or nothing', 'Ten minutes a day fits anywhere', 'Streaks and reminders keep you going'],
          cons: ['Little real speaking practice', 'Hard to get past the basics'],
          verdict: 'Good for building a habit and vocabulary; pair it with conversation.',
        },
        {
          name: 'Group classes',
          pros: ['A set time each week keeps you on track', 'You practise with other learners', 'A teacher explains the grammar'],
          cons: ['Moves at the pace of the group', 'About $150–300 a term', 'Fixed times, and getting there'],
          verdict: 'Best if you like structure and company.',
        },
        {
          name: 'Online tutor',
          pros: ['Lessons fit your goals and your level', 'You speak for most of the hour', 'Book at any time of day'],
          cons: ['$15–35 an hour adds up', 'You plan what to work on'],
          verdict: '**The fastest way to start speaking**: two lessons a week move most people along quickly.',
        },
      ],
    },
  },
  {
    id: 'decision-matrix',
    title: 'Decision matrix',
    group: 'compare',
    use: 'Options scored against weighted criteria: sliders change how much each criterion matters and the weighted totals re-rank live, the leader marked.',
    keywords: 'decision matrix weighted scoring criteria options score sliders weigh choose decide trade-offs evaluation',
    shape: `{
  title?: string
  options: string[]                  // 2 to 5
  criteria: {
    name: string
    weight: number                   // how much it matters, 1 to 5 (the user can change it)
    scores: number[]                 // 0 to 10, one per option, in order
    note?: string
  }[]
  recommendation?: md
}`,
    example: {
      title: 'Where to work remotely from January to March',
      options: ['Lisbon', 'Mexico City', 'Chiang Mai'],
      criteria: [
        { name: 'Cost of living', weight: 5, scores: [6, 7, 9] },
        { name: 'Overlap with New York hours', weight: 4, scores: [6, 10, 2], note: 'Chiang Mai is 12 hours ahead' },
        { name: 'Internet', weight: 4, scores: [9, 7, 8] },
        { name: 'Weather', weight: 3, scores: [6, 8, 7], note: 'Smoky air in Chiang Mai from February' },
        { name: 'Safety', weight: 3, scores: [9, 5, 8] },
        { name: 'Remote-work community', weight: 2, scores: [9, 8, 9] },
      ],
      recommendation: '**Mexico City** comes out ahead because its working day matches New York’s. Turn that weight down and **Chiang Mai** wins on cost.',
    },
  },
  {
    id: 'choices',
    title: 'Choices',
    group: 'compare',
    use: 'Options as cards with pictures, tags and prices to pick one or several from; the pick goes to the message box as the answer.',
    keywords: 'choices options pick one choose select which would you like vote alternatives menu poll decide',
    shape: `{
  question?: string
  options: {
    title: string
    description?: md
    image?: image
    tags?: string[]
    price?: string
    recommended?: boolean
  }[]                          // 2 to 6
  multiple?: boolean           // several may be picked
}`,
    example: {
      question: 'Which weekend trip from Boston sounds best?',
      options: [
        { title: 'Acadia National Park', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Acadia_National_Park_02.JPG/500px-Acadia_National_Park_02.JPG', description: 'Granite coast, quiet carriage roads and the sunrise from Cadillac Mountain. **4½ hours** by car.', tags: ['Hiking', 'Coast'], price: 'about $650 for two', recommended: true },
        { title: 'Cape Cod', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/White_Crest_Beach_Wellfleet.jpg/500px-White_Crest_Beach_Wellfleet.jpg', description: 'Dunes and empty beaches on the National Seashore, lobster rolls and lighthouses. **2 hours**.', tags: ['Beach', 'Seafood'], price: 'about $550 for two' },
        { title: 'Montreal', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Montreal%2C_Quebec_skyline.jpg/500px-Montreal%2C_Quebec_skyline.jpg', description: 'Cobbled Old Montreal, bagels and the view from Mount Royal. **5 hours**; bring your passport.', tags: ['City', 'Food'], price: 'about $700 for two' },
        { title: 'White Mountains', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/White_Mountains_12_30_09_81.jpg/500px-White_Mountains_12_30_09_81.jpg', description: 'Waterfall hikes, the Kancamagus Highway and the cog railway up Mount Washington. **2½ hours**.', tags: ['Hiking', 'Scenic drives'], price: 'about $500 for two' },
      ],
    },
  },
  {
    id: 'recommendation',
    title: 'Recommendation',
    group: 'compare',
    use: 'One clear pick with its picture, price and why, the runners-up for other needs below it, and what to avoid.',
    keywords: 'recommendation best pick top choice which should i buy winner runner up alternatives avoid verdict suggestion',
    shape: `{
  title?: string               // what it is a pick for
  pick: { name: string, image?: image, why: md, price?: string, url?: url, rating?: number }   // rating out of 5
  alternatives?: { name: string, why: md, best_for?: string, price?: string, url?: url }[]
  avoid?: { name: string, why: md }[]
}`,
    example: {
      title: 'Noise-cancelling headphones for long flights',
      pick: {
        name: 'Sony WH-1000XM6',
        image: 'https://www.zdnet.com/wp-content/uploads/sites/3/bcbcfb27-7128-4d42-9fe7-44083cd2a713.jpg',
        why: 'The best at shutting out engine drone, **30 hours** of battery with noise cancelling on, and it folds into a slim case that fits a seat pocket.',
        price: '$449',
        rating: 4.7,
        url: 'https://www.theguardian.com/technology/2025/jul/09/sony-wh-1000xm6-review-raising-the-bar-for-noise-cancelling-headphones',
      },
      alternatives: [
        { name: 'Bose QuietComfort Ultra', best_for: 'Comfort', why: 'Lighter on the head and nearly as quiet; the sound is a little less detailed.', price: '$449' },
        { name: 'Sennheiser Momentum 4', best_for: 'Battery life', why: '**60 hours** on a charge: a week of travel without the cable.', price: '$379' },
        { name: 'Soundcore Space One', best_for: 'A tight budget', why: 'Good noise cancelling for under a quarter of the price; plasticky, but light.', price: '$99' },
      ],
      avoid: [{ name: 'Apple AirPods Max', why: 'Heavy at 385 g, and its case leaves the headband bare in a bag. Worth it only if everything else you own is Apple.' }],
    },
  },
  {
    id: 'ranking',
    title: 'Ranking',
    group: 'compare',
    use: 'A ranked list with rank numbers, pictures, value bars and how many places each moved since the last ranking.',
    keywords: 'ranking ranked top 10 list leaderboard league order best most chart positions standings movers places',
    shape: `{
  title?: string
  metric?: string              // what the value is: "Gold medals", "Visitors a year"
  unit?: string                // after each value ("km", "%")
  prefix?: string              // before each value ("$")
  items: {
    name: string
    value?: number             // drawn as a bar against the largest
    image?: image
    detail?: md
    change?: number            // places moved since last time: 2 up, -1 down, 0 the same
    tag?: string
  }[]                          // in rank order: the first is number 1
  note?: md                    // what it is based on; since when the changes are counted
}`,
    example: {
      title: 'Paris 2024: the medal table',
      metric: 'Gold medals',
      items: [
        { name: 'United States', value: 40, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Flag_of_the_United_States.svg/120px-Flag_of_the_United_States.svg.png', detail: '44 silver · 42 bronze · **126** in all', change: 0 },
        { name: 'China', value: 40, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Flag_of_the_People%27s_Republic_of_China.svg/120px-Flag_of_the_People%27s_Republic_of_China.svg.png', detail: '27 silver · 24 bronze · **91** in all', change: 0 },
        { name: 'Japan', value: 20, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Flag_of_Japan.svg/120px-Flag_of_Japan.svg.png', detail: '12 silver · 13 bronze · **45** in all', change: 0 },
        { name: 'Australia', value: 18, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Flag_of_Australia.svg/120px-Flag_of_Australia.svg.png', detail: '19 silver · 16 bronze · **53** in all', change: 2 },
        { name: 'France', value: 16, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Flag_of_France.svg/120px-Flag_of_France.svg.png', detail: '26 silver · 22 bronze · **64** in all', change: 3, tag: 'Host' },
        { name: 'Netherlands', value: 15, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Flag_of_the_Netherlands.svg/120px-Flag_of_the_Netherlands.svg.png', detail: '7 silver · 12 bronze · **34** in all', change: 1 },
        { name: 'Great Britain', value: 14, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Flag_of_the_United_Kingdom_%283-5%29.svg/120px-Flag_of_the_United_Kingdom_%283-5%29.svg.png', detail: '22 silver · 29 bronze · **65** in all', change: -3 },
        { name: 'South Korea', value: 13, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Flag_of_South_Korea.svg/120px-Flag_of_South_Korea.svg.png', detail: '9 silver · 10 bronze · **32** in all', change: 8 },
      ],
      note: 'Ranked by gold medals, then silver. Places moved since Tokyo 2020.',
    },
  },
  {
    id: 'scorecard',
    title: 'Scorecard',
    group: 'compare',
    use: 'A review’s scores: the overall score in a ring and a bar for each aspect, with a note on each and a verdict.',
    keywords: 'scorecard review rating score out of 10 grades aspects verdict assessment report card evaluation marks',
    shape: `{
  subject: string
  subtitle?: string
  image?: image
  overall?: number             // the average of the aspects when left out
  max?: number                 // the top of the scale: 10 unless set
  aspects: { name: string, score: number, note?: string }[]
  verdict?: md
}`,
    example: {
      subject: 'Framework Laptop 13',
      subtitle: 'AMD Ryzen AI 7 350, 2025',
      image: 'https://img.frontdeskreview.com/products/framework-laptop-13-amd-ryzen-ai-300.jpg?v=74a80dae97',
      overall: 8.2,
      aspects: [
        { name: 'Repairability', score: 10, note: 'Every part has a QR code and a guide; one screwdriver opens it' },
        { name: 'Performance', score: 8.5, note: 'Fast for work, code and light photo editing' },
        { name: 'Keyboard', score: 8, note: 'Quiet and accurate, with 1.5 mm of travel' },
        { name: 'Display', score: 7.5, note: 'The 2.8K 120 Hz option is sharp; the base screen is dimmer' },
        { name: 'Battery', score: 7, note: 'About 9 hours of mixed work' },
        { name: 'Value', score: 7, note: 'Costs more than laptops you can’t upgrade' },
      ],
      verdict: 'The laptop to buy if you want to keep it for ten years: you swap the mainboard, not the whole machine. Others last longer on a charge for the money.',
    },
  },
  {
    id: 'versus',
    title: 'Versus',
    group: 'compare',
    use: 'Two things head to head, row by row, with mirrored bars where both sides are numbers, each row’s winner marked and a tally of wins.',
    keywords: 'versus vs head-to-head which is better face-off matchup duel compare two rivals',
    shape: `{
  left: { name: string, image?: image, subtitle?: string }
  right: { name: string, image?: image, subtitle?: string }
  rows: {
    label: string
    left: md | number
    right: md | number
    winner?: "left" | "right" | "tie"    // the better side
    unit?: string                        // after numbers ("g", "GB")
    prefix?: string                      // before numbers ("$")
  }[]
  verdict?: md
}`,
    example: {
      left: { name: 'Nintendo Switch 2', subtitle: '2025 · 256 GB', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Nintendo_Switch_2_in_Handheld_Mode.png/500px-Nintendo_Switch_2_in_Handheld_Mode.png' },
      right: { name: 'Steam Deck OLED', subtitle: '2023 · 512 GB', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Steam_Deck_OLED_framsida_hemsk%C3%A4rm.jpg/500px-Steam_Deck_OLED_framsida_hemsk%C3%A4rm.jpg' },
      rows: [
        { label: 'Price', left: 449, right: 549, prefix: '$', winner: 'left' },
        { label: 'Screen size', left: 7.9, right: 7.4, unit: '″', winner: 'left' },
        { label: 'Screen', left: '1080p LCD, 120 Hz', right: '800p OLED, 90 Hz', winner: 'right' },
        { label: 'Weight', left: 534, right: 640, unit: 'g', winner: 'left' },
        { label: 'Battery', left: '2 to 6½ hours', right: '3 to 12 hours', winner: 'right' },
        { label: 'Storage', left: 256, right: 512, unit: 'GB', winner: 'right' },
        { label: 'Games', left: 'Mario, Zelda and Pokémon, only here', right: 'Your Steam library and other PC games', winner: 'tie' },
        { label: 'On the TV', left: 'Dock in the box', right: 'Dock sold separately', winner: 'left' },
      ],
      verdict: 'Get the **Switch 2** for Nintendo’s games and playing on the TV; the **Steam Deck OLED** if your games are on Steam.',
    },
  },
  {
    id: 'quadrant',
    title: 'Quadrant chart',
    group: 'compare',
    use: 'Items placed on a 2×2 grid by two measures, such as effort and impact or cost and quality, with named quadrants and notes on hover.',
    keywords: 'quadrant 2x2 matrix effort impact priority magic quadrant cost quality urgent important scatter positioning',
    shape: `{
  title?: string
  x: { label: string, low?: string, high?: string }   // the axis across: its name and the words at each end
  y: { label: string, low?: string, high?: string }   // the axis up
  quadrants?: [string, string, string, string]        // their names: top left, top right, bottom left, bottom right
  items: { name: string, x: number, y: number, note?: string }[]   // x and y from 0 to 100
}`,
    example: {
      title: 'Ideas for the shop’s next quarter',
      x: { label: 'Effort', low: 'Low', high: 'High' },
      y: { label: 'Impact', low: 'Low', high: 'High' },
      quadrants: ['Quick wins', 'Big bets', 'Fill-ins', 'Money pits'],
      items: [
        { name: 'Saved carts', x: 22, y: 80, note: 'A week of work; a quarter of carts are left behind' },
        { name: 'One-click reorder', x: 36, y: 68, note: 'Coffee customers buy the same bag every month' },
        { name: 'Gift cards', x: 30, y: 42, note: 'Busy in December, quiet the rest of the year' },
        { name: 'Dark mode', x: 14, y: 16, note: 'Asked for twice; nice to have' },
        { name: 'Loyalty points', x: 64, y: 72, note: 'Raises repeat orders, but needs rules and a page of its own' },
        { name: 'Mobile app', x: 88, y: 58, note: 'Months of work; most customers already shop on their phones' },
        { name: 'New checkout', x: 80, y: 30, note: 'A big job, and the checkout already converts well' },
        { name: 'Live chat', x: 58, y: 22, note: 'Someone has to answer it all day' },
      ],
    },
  },
  {
    id: 'swot',
    title: 'SWOT analysis',
    group: 'compare',
    use: 'Strengths, weaknesses, opportunities and threats in a 2×2 grid, for a business, a plan, a product or a career move.',
    keywords: 'swot strengths weaknesses opportunities threats analysis strategy business plan assessment internal external',
    shape: `{
  subject?: string
  strengths: md[]
  weaknesses: md[]
  opportunities: md[]
  threats: md[]
  summary?: md                 // what follows from it, in a line or two
}`,
    example: {
      subject: 'Little Fig Bakery: adding online orders',
      strengths: ['A loyal neighbourhood following, rated 4.8 on Google', 'Sourdough sells out by 11 a.m. most days', 'The kitchen stands idle in the afternoons'],
      weaknesses: ['No website beyond an Instagram page', 'Two staff, both busy at the counter', 'Bread is best eaten the day it is baked'],
      opportunities: ['Pre-orders for pickup cut waste and queues', 'Office catering for the business park nearby', 'Holiday boxes, and a loaf every Saturday by subscription'],
      threats: ['Delivery apps take 25–30% of each order', 'A supermarket is opening an in-store bakery', 'Flour and butter prices are still rising'],
      summary: 'Start with **pre-orders for pickup** on the bakery’s own page: little cost, less waste, and no delivery app taking a cut.',
    },
  },
];
