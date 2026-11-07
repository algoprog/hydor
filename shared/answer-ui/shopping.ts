// Answer UIs for shopping: products, product grids, spec sheets, price history.
import type { AnswerUiSpec } from './types.ts';

export const SHOPPING: AnswerUiSpec[] = [
  {
    id: 'product',
    title: 'Product',
    group: 'shopping',
    use: 'One product in depth: pictures to flip through, price and savings, rating, key specs, pros and cons, and which stores sell it for how much.',
    keywords: 'product item price deal sale where to buy stores offers specs reviews rating details listing shop',
    shape: `{
  name: string
  brand?: string
  image?: image
  images?: image[]                 // more pictures, as thumbnails to flip through
  price?: string                   // "$429.95"
  was?: string                     // the price before a sale
  rating?: number                  // out of 5
  reviews?: number                 // how many reviews
  badges?: string[]                // "Best seller", "Editor's choice"
  summary?: md
  specs?: { label: string, value: md }[]
  pros?: md[]
  cons?: md[]
  offers?: { store: string, price: string, url?: url, note?: string, in_stock?: boolean }[]
  url?: url                        // the product's own page
}`,
    example: {
      name: 'Bambino Plus',
      brand: 'Breville',
      image: 'https://assets.breville.com/cdn-cgi/image/width=1300,format=auto/BES500/BES500BSS1BUS1/pdp_1300px.png?pdp',
      images: [
        'https://assets.breville.com/cdn-cgi/image/width=1304,format=auto,quality=75/BES500/BES500USCM_CAROUSEL2.png',
        'https://assets.breville.com/cdn-cgi/image/width=1304,format=auto,quality=75/BES500/BES500USCM_CAROUSEL4.png',
        'https://assets.breville.com/cdn-cgi/image/width=1304,format=auto,quality=75/BES500/BES500USCM_CAROUSEL5.png',
        'https://assets.breville.com/cdn-cgi/image/width=1304,format=auto,quality=75/BES500/BES500US_DNA3.jpg',
      ],
      price: '$429.95',
      was: '$499.95',
      rating: 4.2,
      reviews: 1024,
      badges: ['Good for beginners', 'Brushed stainless steel'],
      summary: 'A small espresso machine that is ready in **3 seconds** and froths milk by itself: flat whites and lattes without learning to steam.',
      specs: [
        { label: 'Heats up in', value: '3 seconds' },
        { label: 'Portafilter', value: '54 mm, 18 g dose' },
        { label: 'Milk', value: 'Automatic, 3 temperatures and 3 textures' },
        { label: 'Water tank', value: '1.9 L' },
        { label: 'Power', value: '1560 W' },
        { label: 'Temperature', value: 'Digital (PID) control' },
      ],
      pros: ['Ready to brew in seconds, not minutes', 'Hands-free milk frothing that really works', 'Small enough for a narrow counter'],
      cons: ['No grinder: you need one, or ground coffee', 'Fewer accessories fit its 54 mm basket than the usual 58 mm', 'The small drip tray fills quickly'],
      offers: [
        { store: 'Amazon', price: '$429.95', note: 'Free delivery by Tuesday', in_stock: true, url: 'https://www.amazon.com/s?k=breville+bambino+plus' },
        { store: 'Best Buy', price: '$449.99', note: 'Pick up today', in_stock: true, url: 'https://www.bestbuy.com/site/searchpage.jsp?st=breville+bambino+plus' },
        { store: 'Williams Sonoma', price: '$449.95', note: 'Back in about two weeks', in_stock: false, url: 'https://www.williams-sonoma.com/search/results.html?words=bambino+plus' },
        { store: 'Breville', price: '$499.95', note: 'Free shipping', in_stock: true, url: 'https://www.breville.com/en-us/product/bes500' },
      ],
      url: 'https://www.breville.com/en-us/product/bes500',
    },
  },
  {
    id: 'products',
    title: 'Products',
    group: 'shopping',
    use: 'A grid of products with pictures, prices, sales, ratings and stores, sorted by price or rating with a tap.',
    keywords: 'products shopping list grid buy options under budget best deals prices compare items catalog gift ideas',
    shape: `{
  title?: string
  items: {
    name: string
    image?: image
    price?: number | string      // a number, with currency, sorts best
    currency?: string            // "USD", "EUR"
    was?: number | string        // the price before a sale
    rating?: number              // out of 5
    reviews?: number
    tag?: string                 // "Best value", "Our pick"
    note?: md
    store?: string
    url?: url
  }[]
}`,
    example: {
      title: 'Cast-iron skillets, 10 to 10½ inches',
      items: [
        { name: 'Lodge 10.25″ Skillet', image: 'https://www.lodgecastiron.com/cdn/shop/files/L8SKA250_3000x3000_9b9bb353-5179-4dbe-85c2-971104cd6e39.jpg?v=1767622561&width=800', price: 24.95, currency: 'USD', rating: 4.7, reviews: 128000, tag: 'Best value', note: 'Heavy and a little rough, but nearly indestructible.', store: 'Lodge', url: 'https://www.lodgecastiron.com/products/lodge-10-25-inch-seasoned-cast-iron-skillet-usa-icons' },
        { name: 'Victoria 10″ Skillet', image: 'https://victoriacookware.com/cdn/shop/files/01.jpg?v=1767730910', price: 29.99, was: 39.99, currency: 'USD', rating: 4.5, reviews: 23000, note: 'A longer handle and a helper handle.', store: 'Victoria', url: 'https://victoriacookware.com/products/10-inch-cast-iron-skillet' },
        { name: 'Stargazer 10.5″ Skillet', image: 'https://stargazercastiron.com/cdn/shop/products/SKT-105-S-Top-1200x1200.png?v=1636745832&width=800', price: 115, currency: 'USD', rating: 4.8, reviews: 2100, note: 'Smooth inside, with a flared rim for pouring.', store: 'Stargazer', url: 'https://stargazercastiron.com/products/10-5-inch-cast-iron-skillet' },
        { name: 'Field No. 8 Skillet', image: 'https://fieldcompany.com/cdn/shop/files/Frame28_2b91a1f5-e28c-4d5b-8d2f-21ed5b6e01cd_1200x1200.jpg?v=1725546739', price: 165, currency: 'USD', rating: 4.8, reviews: 3400, tag: 'Lightest', note: 'Machined smooth and a pound lighter than most.', store: 'Field Company', url: 'https://fieldcompany.com/products/field-cast-iron-skillet' },
        { name: 'Smithey No. 10 Chef Skillet', image: 'https://snakeriverfarms.com/cdn/shop/files/SmitheyNo10-1.jpg?v=1742842263&width=800', price: 200, currency: 'USD', rating: 4.9, reviews: 1800, tag: 'Our pick', note: 'Polished inside, with sloped sides for tossing.', store: 'Snake River Farms', url: 'https://snakeriverfarms.com/products/no-10-chef-skillet' },
      ],
    },
  },
  {
    id: 'specs',
    title: 'Spec sheet',
    group: 'shopping',
    use: 'Technical specs in groups (display, battery, size…) with a filter box when long: for a laptop, phone, car or camera.',
    keywords: 'specs specifications technical details spec sheet features dimensions weight battery laptop phone car camera',
    shape: `{
  title: string
  subtitle?: string
  image?: image
  groups: { name: string, specs: { label: string, value: md }[] }[]
  note?: md
}`,
    example: {
      title: 'MacBook Air 13-inch',
      subtitle: 'M4, 2025 · from $999',
      image: 'https://cdn.mos.cms.futurecdn.net/WcS4jaahBp6jrbiU8acZsQ-2501-80.jpg',
      groups: [
        { name: 'Display', specs: [
          { label: 'Size', value: '13.6″ Liquid Retina' },
          { label: 'Resolution', value: '2560 × 1664, 224 ppi' },
          { label: 'Brightness', value: '500 nits' },
          { label: 'Colour', value: 'P3 wide colour, True Tone' },
        ] },
        { name: 'Performance', specs: [
          { label: 'Chip', value: 'Apple M4, 10-core CPU' },
          { label: 'Graphics', value: '8-core GPU (10-core on higher models)' },
          { label: 'Memory', value: '16 GB, up to 32 GB' },
          { label: 'Storage', value: '256 GB SSD, up to 2 TB' },
        ] },
        { name: 'Battery and power', specs: [
          { label: 'Battery life', value: 'Up to 18 hours of video' },
          { label: 'Charger', value: '30 W USB-C (35 W dual-port on higher models)' },
          { label: 'Charging', value: 'MagSafe 3 or USB-C, fast charge' },
        ] },
        { name: 'Size and weight', specs: [
          { label: 'Thickness', value: '1.13 cm' },
          { label: 'Width × depth', value: '30.41 × 21.5 cm' },
          { label: 'Weight', value: '1.24 kg' },
        ] },
        { name: 'Connections', specs: [
          { label: 'Ports', value: '2 × Thunderbolt 4, MagSafe 3, headphone jack' },
          { label: 'Wireless', value: 'Wi-Fi 6E, Bluetooth 5.3' },
          { label: 'External displays', value: 'Up to two' },
        ] },
        { name: 'Camera and sound', specs: [
          { label: 'Camera', value: '12 MP Center Stage' },
          { label: 'Speakers', value: 'Four, with Spatial Audio' },
          { label: 'Microphones', value: 'Three' },
        ] },
      ],
      note: 'No fan: it is silent, and slows down a little under long heavy loads.',
    },
  },
  {
    id: 'price-history',
    title: 'Price history',
    group: 'shopping',
    use: 'A product’s price over time, charted with its low and high, where today’s price stands, and whether to buy now or wait.',
    keywords: 'price history tracker over time deal when to buy lowest price drop sale black friday',
    shape: `{
  item: string
  currency?: string                       // "USD", "EUR"
  points: { date: date, price: number }[] // oldest first; the price holds until the next point
  current?: number                        // the price now: the last point's unless set
  low?: number                            // the lowest and highest known: from the points unless set
  high?: number
  verdict?: md                            // is now a good time to buy?
  stores?: { store: string, price: number, url?: url }[]   // what it costs where, now
}`,
    example: {
      item: 'Kindle Paperwhite (16 GB, 2024)',
      currency: 'USD',
      points: [
        { date: '2025-11-07', price: 159.99 },
        { date: '2025-11-26', price: 124.99 },
        { date: '2025-12-03', price: 159.99 },
        { date: '2025-12-14', price: 134.99 },
        { date: '2026-01-04', price: 159.99 },
        { date: '2026-02-12', price: 149.99 },
        { date: '2026-02-24', price: 159.99 },
        { date: '2026-04-18', price: 139.99 },
        { date: '2026-05-02', price: 159.99 },
        { date: '2026-07-07', price: 119.99 },
        { date: '2026-07-12', price: 159.99 },
        { date: '2026-08-29', price: 144.99 },
        { date: '2026-09-09', price: 159.99 },
        { date: '2026-10-06', price: 129.99 },
        { date: '2026-10-10', price: 159.99 },
        { date: '2026-11-03', price: 134.99 },
      ],
      verdict: 'A fair price, but not the best: it fell to **$119.99** on Prime Day and is usually about $125 for Black Friday, three weeks from now. Wait if you can.',
      stores: [
        { store: 'Amazon', price: 134.99, url: 'https://www.amazon.com/s?k=kindle+paperwhite' },
        { store: 'Best Buy', price: 139.99, url: 'https://www.bestbuy.com/site/searchpage.jsp?st=kindle+paperwhite' },
        { store: 'Target', price: 159.99, url: 'https://www.target.com/s?searchTerm=kindle+paperwhite' },
      ],
    },
  },
  {
    id: 'listings',
    title: 'Home listings',
    group: 'shopping',
    use: 'Homes to buy or rent as cards with pictures, price, beds, baths, area and price per area, sortable by price and size, and on a map when they have positions.',
    keywords: 'homes houses apartments flats condos sale rent rental real estate property listings bedrooms bathrooms square feet',
    shape: `{
  title?: string
  listings: {
    title: string                  // "Restored 1915 foursquare"
    image?: image
    images?: image[]               // more pictures, flipped through on the card
    price: number | string         // a number, with currency, sorts and gives the price per area
    currency?: string              // "USD", "EUR"
    per?: string                   // "month" for a rent; a price to buy unless set
    beds?: number                  // 0 for a studio
    baths?: number
    area?: number
    area_unit?: "m²" | "ft²"       // m² unless set
    type?: string                  // "House", "Condo"
    address?: string
    lat?: number
    lng?: number                   // with lat: on the map
    tags?: string[]
    note?: md
    url?: url
  }[]
}`,
    example: {
      title: 'Houses for sale in Amherst under $700,000',
      listings: [
        {
          title: 'Restored 1915 foursquare',
          images: [
            'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/831Richland.jpg/960px-831Richland.jpg',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Faubourg_Marigny%2C_New_Orleans_-_Interior_of_recently_renovated_house_-_04.jpg/960px-Faubourg_Marigny%2C_New_Orleans_-_Interior_of_recently_renovated_house_-_04.jpg',
            'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Faubourg_Marigny%2C_New_Orleans_-_Interior_of_recently_renovated_house_-_05.jpg/960px-Faubourg_Marigny%2C_New_Orleans_-_Interior_of_recently_renovated_house_-_05.jpg',
          ],
          price: 649000,
          currency: 'USD',
          beds: 4,
          baths: 2,
          area: 2380,
          area_unit: 'ft²',
          address: 'Lincoln Avenue, Amherst',
          lat: 42.3805,
          lng: -72.5243,
          tags: ['Walk to UMass', 'New kitchen', 'Fireplace'],
          note: 'A butcher-block island in the kitchen and the old fireplace kept; **open house Sunday 1–3 PM**.',
          url: 'https://www.zillow.com/amherst-ma/',
        },
        {
          title: 'Dutch colonial near the town center',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Dutch_Colonial_Revival_house_in_Plainfield%2C_New_Jersey.jpg/500px-Dutch_Colonial_Revival_house_in_Plainfield%2C_New_Jersey.jpg',
          price: 689000,
          currency: 'USD',
          beds: 4,
          baths: 2.5,
          area: 2160,
          area_unit: 'ft²',
          address: 'Amity Street, Amherst',
          lat: 42.3757,
          lng: -72.5262,
          tags: ['Screened porch', 'Garage'],
          note: 'Five minutes’ walk to the Common and the Jones Library.',
        },
        {
          title: 'Brick bungalow with a front porch',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/149MyrtleReedsburgWI.JPG/960px-149MyrtleReedsburgWI.JPG',
          price: 419000,
          currency: 'USD',
          beds: 2,
          baths: 1,
          area: 1180,
          area_unit: 'ft²',
          address: 'Fearing Street, Amherst',
          lat: 42.3851,
          lng: -72.5196,
          tags: ['Needs updating'],
          note: 'Small but bright; the attic could be a third bedroom.',
        },
        {
          title: 'One-floor ranch on half an acre',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/HouseII2007.jpg/960px-HouseII2007.jpg',
          price: 465000,
          currency: 'USD',
          beds: 3,
          baths: 2,
          area: 1450,
          area_unit: 'ft²',
          address: 'South East Street, South Amherst',
          lat: 42.3488,
          lng: -72.5021,
          tags: ['One floor', 'Big yard'],
          note: 'On the bus line to the colleges.',
        },
        {
          title: 'Split-level with a finished basement',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Split-Level_Houses_in_Gang_Mills_04.jpg/960px-Split-Level_Houses_in_Gang_Mills_04.jpg',
          price: 539000,
          currency: 'USD',
          beds: 3,
          baths: 2,
          area: 1860,
          area_unit: 'ft²',
          address: 'Pine Street, North Amherst',
          lat: 42.4012,
          lng: -72.5236,
          tags: ['Solar panels', 'Garage'],
          note: 'The solar panels bring the electric bill to about **$20 a month**.',
        },
      ],
    },
  },
];
