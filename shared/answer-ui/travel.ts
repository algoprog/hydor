// Answer UIs for places and travel: maps of places, a place, itineraries, directions, flights, stays, weather, time zones.
import type { AnswerUiSpec } from './types.ts';

export const TRAVEL: AnswerUiSpec[] = [
  {
    id: 'places',
    title: 'Places on a map',
    group: 'travel',
    use: 'Several places on a map with numbered pins and a list beside it (pictures, ratings, notes), optionally joined in order as a route.',
    keywords: 'map places nearby restaurants sights attractions locations pins where to go things to do near me route walk',
    shape: `{
  title?: string
  places: {
    name: string
    lat: number
    lng: number
    kind?: string              // "Museum", "Café"
    image?: image
    rating?: number            // out of 5
    price?: string             // "€€"
    address?: string
    note?: md
    url?: url
  }[]
  route?: boolean              // join them in order with a line (a walk, a road trip)
}`,
    example: {
      title: 'A day of Lisbon’s sights, west to east',
      route: true,
      places: [
        { name: 'Belém Tower', lat: 38.6916, lng: -9.216, kind: 'Monument', rating: 4.6, image: 'https://thespotguide.com/media/CACHE/images/articles/covers/belem_tower_lisbon_river_1/5fa0c5eef8cc65c183a110b939760b36.webp', note: 'Go at opening (10:00) to beat the queue.' },
        { name: 'Jerónimos Monastery', lat: 38.6979, lng: -9.2068, kind: 'Monastery', rating: 4.7, image: 'https://2gbzzxp7mkrqpgpz.public.blob.vercel-storage.com/lisbon-jeronimos/exterior_00.webp', note: 'Then a pastel de nata at Pastéis de Belém, next door.' },
        { name: 'LX Factory', lat: 38.7034, lng: -9.1784, kind: 'Market and shops', rating: 4.5, image: 'https://www.novo-monde.com/app/uploads/2026/02/lx-factory-1-1024x536.jpg', note: 'Lunch, and the Ler Devagar bookshop.' },
        { name: 'Time Out Market', lat: 38.7069, lng: -9.1459, kind: 'Food hall', rating: 4.4, price: '€€', image: 'https://media.timeout.com/images/106331852/image.jpg' },
        { name: 'Praça do Comércio', lat: 38.7075, lng: -9.1364, kind: 'Square', rating: 4.7, image: 'https://www.lisbontourism.org/wp-content/uploads/2026/10/rua-augusta-arch-jos-i-statue-stand-before.jpg' },
        { name: 'São Jorge Castle', lat: 38.7139, lng: -9.1335, kind: 'Castle', rating: 4.5, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Castelo_Sao_Jorge_Lisboa_1.JPG/960px-Castelo_Sao_Jorge_Lisboa_1.JPG', note: 'Sunset over the river from its walls.' },
      ],
    },
  },
  {
    id: 'weather',
    title: 'Weather forecast',
    group: 'travel',
    use: 'Current conditions, the next hours and the coming days, with icons, rain chances and any alerts.',
    keywords: 'weather forecast temperature rain snow wind sunny cloudy today tomorrow this week hourly daily umbrella',
    shape: `{
  location: string
  unit?: "C" | "F"             // C unless set
  now?: { temp: number, feels?: number, condition: string, icon?: Icon, humidity?: number, wind?: string, uv?: number }
  hourly?: { time: time, temp: number, icon?: Icon, rain?: number }[]          // rain: chance in %
  daily?: { date: date, high: number, low: number, icon?: Icon, condition?: string, rain?: number }[]
  alerts?: { title: string, text?: md, tone?: tone }[]
  note?: md
  source?: { name: string, url?: url }
}
Icon = "sun" | "partly" | "cloud" | "rain" | "showers" | "storm" | "snow" | "sleet" | "fog" | "wind" | "night" | "partly-night"`,
    example: {
      location: 'Amherst, Massachusetts',
      unit: 'C',
      now: { temp: 9, feels: 6, condition: 'Partly cloudy', icon: 'partly', humidity: 62, wind: '14 km/h NW', uv: 2 },
      hourly: [
        { time: '14:00', temp: 9, icon: 'partly', rain: 5 },
        { time: '15:00', temp: 10, icon: 'partly', rain: 5 },
        { time: '16:00', temp: 9, icon: 'cloud', rain: 10 },
        { time: '17:00', temp: 7, icon: 'cloud', rain: 20 },
        { time: '18:00', temp: 6, icon: 'showers', rain: 45 },
        { time: '19:00', temp: 5, icon: 'rain', rain: 70 },
        { time: '20:00', temp: 4, icon: 'rain', rain: 65 },
        { time: '21:00', temp: 4, icon: 'cloud', rain: 30 },
      ],
      daily: [
        { date: '2026-11-07', high: 10, low: 3, icon: 'showers', condition: 'Showers this evening', rain: 70 },
        { date: '2026-11-08', high: 8, low: -1, icon: 'sun', condition: 'Sunny and crisp', rain: 0 },
        { date: '2026-11-09', high: 7, low: -3, icon: 'sun', condition: 'Clear, frost at night', rain: 0 },
        { date: '2026-11-10', high: 11, low: 2, icon: 'partly', condition: 'Milder', rain: 10 },
        { date: '2026-11-11', high: 12, low: 6, icon: 'rain', condition: 'Steady rain', rain: 90 },
        { date: '2026-11-12', high: 9, low: 1, icon: 'cloud', condition: 'Cloudy, breezy', rain: 20 },
        { date: '2026-11-13', high: 6, low: -2, icon: 'snow', condition: 'Flurries possible', rain: 35 },
      ],
      alerts: [{ title: 'Frost advisory, Sunday night', text: 'Lows near −3 °C: cover tender plants.', tone: 'warn' }],
    },
  },
  {
    id: 'place',
    title: 'Place',
    group: 'travel',
    use: 'One place in depth: pictures, rating, price, opening hours with today marked, address, phone and website, highlights, tips and a small map.',
    keywords: 'place details restaurant museum cafe shop venue attraction opening hours address phone website reviews about',
    shape: `{
  name: string
  kind?: string                // "Museum", "Café"
  image?: image
  images?: image[]             // more pictures, after the first
  rating?: number              // out of 5
  reviews?: number             // how many ratings
  price?: string               // "€€", "€20"
  address?: string
  lat?: number
  lng?: number                 // with lat: a small map
  hours?: { day: string, hours: string }[] | string   // { day: "Mon–Thu", hours: "9:00–17:00" }, or one line
  open_now?: boolean
  phone?: string
  website?: url
  summary?: md
  highlights?: md[]
  tips?: md[]
}`,
    example: {
      name: 'Acropolis Museum',
      kind: 'Archaeological museum',
      image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Acropolis_and_Acropolis_Museum.jpg/960px-Acropolis_and_Acropolis_Museum.jpg',
      images: [
        'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Porch_of_the_Maidens_%28Caryatids%29_2.jpg/500px-Porch_of_the_Maidens_%28Caryatids%29_2.jpg',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/EHGritaly_120304-08_%28Acropolis_Museum_2%29.JPG/500px-EHGritaly_120304-08_%28Acropolis_Museum_2%29.JPG',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/ACMA_Moschophoros.jpg/500px-ACMA_Moschophoros.jpg',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/New_Acropolis_Museum_5.jpg/500px-New_Acropolis_Museum_5.jpg',
      ],
      rating: 4.7,
      reviews: 68400,
      price: '€20',
      address: 'Dionysiou Areopagitou 15, Athens 117 42',
      lat: 37.9684,
      lng: 23.7285,
      hours: [
        { day: 'Mon–Thu', hours: '9:00–17:00' },
        { day: 'Fri', hours: '9:00–22:00' },
        { day: 'Sat–Sun', hours: '9:00–20:00' },
      ],
      open_now: true,
      phone: '+30 210 900 0900',
      website: 'https://www.theacropolismuseum.gr/en',
      summary: 'Bernard Tschumi’s glass museum at the foot of the rock holds what was found on the Acropolis, from the archaic korai to the **Parthenon frieze**, shown at its true size in a top-floor gallery that faces the temple itself.',
      highlights: ['The **Parthenon Gallery**: the frieze in its true order, with casts where the originals are in London', 'Five of the six **Caryatids** of the Erechtheion', 'An ancient neighbourhood seen through the glass floor at the entrance'],
      tips: ['Fridays it stays open until 22:00, and the evening is the quietest time.', 'Have lunch on the second-floor terrace: it looks straight at the Parthenon.', 'Last entry is half an hour before closing.'],
    },
  },
  {
    id: 'itinerary',
    title: 'Itinerary',
    group: 'travel',
    use: 'A trip day by day: switch between days, each with its stops in time order, notes, durations and costs, and a map of the day.',
    keywords: 'itinerary trip plan travel day-by-day vacation holiday tour schedule stops sightseeing things to do',
    shape: `{
  title?: string
  days: {
    date?: date
    title?: string             // what the day is about: "Arashiyama"
    items: {
      time?: time
      title: string
      place?: string           // where, when the title does not say
      note?: md
      kind?: "sight" | "food" | "travel" | "stay" | "activity"
      duration?: string        // "1 h 30 min"
      cost?: string            // "¥1,000", "Free"
      lat?: number
      lng?: number             // the day's stops with a position go on its map, joined in order
      image?: image
    }[]
  }[]
}`,
    example: {
      title: 'Three autumn days in Kyoto',
      days: [
        {
          date: '2026-11-20',
          title: 'Fushimi Inari and Higashiyama',
          items: [
            { time: '07:30', title: 'Fushimi Inari Taisha', kind: 'sight', duration: '2 h', cost: 'Free', lat: 34.9671, lng: 135.7727, note: 'Start early: the torii tunnels are quiet before 9. The **Yotsutsuji** crossroads has the view.' },
            { time: '10:15', title: 'Tōfuku-ji', kind: 'sight', duration: '1 h', cost: '¥1,000', lat: 34.9772, lng: 135.7746, note: 'Its Tsūten-kyō bridge looks over a valley of maples, reddest in late November.' },
            { time: '12:30', title: 'Lunch at Okutan', place: 'Kiyomizu', kind: 'food', duration: '1 h', cost: '¥4,400', lat: 34.9978, lng: 135.7809, note: 'Simmered tofu in a garden, served here since 1635.' },
            { time: '14:00', title: 'Kiyomizu-dera', kind: 'sight', duration: '1 h 30 min', cost: '¥500', lat: 34.9943, lng: 135.7844 },
            { time: '15:45', title: 'Sannenzaka and Ninenzaka', kind: 'activity', duration: '1 h', lat: 34.9965, lng: 135.7813, note: 'Stone lanes of tea houses and craft shops, down to Yasaka Shrine.' },
            { time: '19:00', title: 'Dinner in Pontochō', kind: 'food', lat: 35.0042, lng: 135.7712, note: 'A lantern-lit alley by the Kamo River: book on Fridays.' },
          ],
        },
        {
          date: '2026-11-21',
          title: 'Arashiyama',
          items: [
            { time: '07:45', title: 'Train to Saga-Arashiyama', place: 'JR Sagano Line from Kyoto Station', kind: 'travel', duration: '15 min', cost: '¥240', lat: 35.0207, lng: 135.681 },
            { time: '08:15', title: 'Bamboo Grove', kind: 'sight', duration: '45 min', cost: 'Free', lat: 35.0167, lng: 135.6711, note: 'Walk it uphill before the tour groups arrive.' },
            { time: '09:15', title: 'Tenryū-ji', kind: 'sight', duration: '1 h 15 min', cost: '¥800', lat: 35.0162, lng: 135.6729, note: 'A pond garden laid out in the 14th century.' },
            { time: '11:30', title: 'Lunch at Shigetsu', place: 'Inside Tenryū-ji', kind: 'food', cost: '¥3,300', note: 'Buddhist vegetarian cooking, *shōjin ryōri*.' },
            { time: '13:00', title: 'Ōkōchi Sansō', kind: 'sight', duration: '1 h', cost: '¥1,000', lat: 35.0166, lng: 135.6696, note: 'An actor’s hillside villa; matcha and a sweet come with the ticket.' },
            { time: '17:30', title: 'Hōgon-in by night', kind: 'activity', duration: '1 h', cost: '¥1,000', lat: 35.0142, lng: 135.674, note: 'The moss garden lit up for the autumn colours.' },
          ],
        },
        {
          date: '2026-11-22',
          title: 'The Golden and Silver Pavilions',
          items: [
            { time: '09:00', title: 'Kinkaku-ji', kind: 'sight', duration: '45 min', cost: '¥500', lat: 35.0395, lng: 135.7295 },
            { time: '10:15', title: 'Ryōan-ji', kind: 'sight', duration: '1 h', cost: '¥600', lat: 35.0335, lng: 135.7181, note: 'Fifteen stones: from any seat you see only fourteen.' },
            { time: '12:30', title: 'Nishiki Market', kind: 'food', duration: '1 h', lat: 35.005, lng: 135.7656, note: 'Graze: tamagoyaki, yuba, pickles, grilled mochi.' },
            { time: '14:30', title: 'Ginkaku-ji', kind: 'sight', duration: '1 h', cost: '¥500', lat: 35.0269, lng: 135.7984 },
            { time: '15:45', title: 'Philosopher’s Path', kind: 'activity', duration: '45 min', lat: 35.0225, lng: 135.7948, note: '2 km along a canal under maples.' },
            { time: '17:00', title: 'Eikan-dō at dusk', kind: 'sight', duration: '1 h 30 min', cost: '¥1,000', lat: 35.0147, lng: 135.7938, note: 'Kyoto’s most famous maples, lit up after dark.' },
          ],
        },
      ],
    },
  },
  {
    id: 'directions',
    title: 'Directions',
    group: 'travel',
    use: 'How to get from one place to another: time and distance, turn-by-turn steps, the route drawn on a map, and other ways to go.',
    keywords: 'directions route how to get there navigation walking driving transit cycling turn-by-turn distance travel-time',
    shape: `{
  from: string
  to: string
  mode?: "drive" | "walk" | "transit" | "bike"
  distance?: string            // "3.7 km"
  duration?: string            // "50 min"
  steps: { text: md, distance?: string, duration?: string }[]
  path?: { lat: number, lng: number }[]   // the route's line from start to end, 10 to 40 points along it
  alternatives?: { name: string, duration: string, distance?: string, note?: md }[]   // other ways to go
}`,
    example: {
      from: 'Louvre Pyramid',
      to: 'Eiffel Tower',
      mode: 'walk',
      distance: '3.7 km',
      duration: '50 min',
      steps: [
        { text: 'From the **Pyramid**, walk round by the Place du Musée du Louvre and down to the river.', distance: '650 m', duration: '8 min' },
        { text: 'Cross the Seine on **Pont Royal**.', distance: '150 m', duration: '2 min' },
        { text: 'Turn right past the **Musée d’Orsay**, then left onto **Rue de Lille**.', distance: '500 m', duration: '6 min' },
        { text: 'Cross the **Place du Palais Bourbon** and keep west along **Rue de l’Université**.', distance: '1.6 km', duration: '20 min' },
        { text: 'Turn left on **Avenue Bosquet**, then right onto **Rue de Monttessuy**.', distance: '600 m', duration: '8 min' },
        { text: 'Cross **Avenue Gustave Eiffel**: the tower’s east pillar is ahead.', distance: '200 m', duration: '3 min' },
      ],
      path: [
        { lat: 48.86076, lng: 2.33649 }, { lat: 48.86148, lng: 2.33599 }, { lat: 48.86167, lng: 2.33523 }, { lat: 48.86082, lng: 2.33472 }, { lat: 48.86106, lng: 2.33369 },
        { lat: 48.86027, lng: 2.33308 }, { lat: 48.86074, lng: 2.33077 }, { lat: 48.86054, lng: 2.33033 }, { lat: 48.85956, lng: 2.32958 }, { lat: 48.86062, lng: 2.32565 },
        { lat: 48.86003, lng: 2.32447 }, { lat: 48.86108, lng: 2.32089 }, { lat: 48.86062, lng: 2.31988 }, { lat: 48.8612, lng: 2.31343 }, { lat: 48.86125, lng: 2.30242 },
        { lat: 48.86085, lng: 2.30094 }, { lat: 48.85978, lng: 2.30059 }, { lat: 48.85923, lng: 2.29791 }, { lat: 48.85789, lng: 2.29531 },
      ],
      alternatives: [
        { name: 'RER C from Musée d’Orsay', duration: '25 min', note: 'Three stops to Champ de Mars–Tour Eiffel; €2.50.' },
        { name: 'Bus 69', duration: '35 min', distance: '4.1 km', note: 'From the Louvre to the Champ de Mars, past the Invalides.' },
        { name: 'Vélib’ bike', duration: '15 min', distance: '3.9 km', note: 'Docks at both ends; by the river most of the way.' },
      ],
    },
  },
  {
    id: 'flights',
    title: 'Flight options',
    group: 'travel',
    use: 'Flights between two airports, each with times, duration, stops and price, sortable by price, duration or departure, the cheapest and fastest marked.',
    keywords: 'flights airfare plane tickets airline fly cheapest fastest nonstop layover departure arrival compare flights',
    shape: `{
  from: string                 // "New York (JFK)"
  to: string
  date?: date
  flights: {
    airline: string
    number?: string            // "LH 401 · LH 1284"
    depart: time
    arrive: time
    next_day?: boolean         // lands the day after
    duration: string           // "9 h 10 min"
    stops: number              // 0 for nonstop
    via?: string               // "FRA"
    price: number | string
    currency?: string          // "USD"
    cabin?: string             // "Economy"
    tag?: "cheapest" | "fastest" | "best"
    url?: url
  }[]
}`,
    example: {
      from: 'New York (JFK)',
      to: 'Athens (ATH)',
      date: '2026-11-19',
      flights: [
        { airline: 'Emirates', number: 'EK 210', depart: '22:30', arrive: '14:40', next_day: true, duration: '9 h 10 min', stops: 0, price: 945, currency: 'USD', cabin: 'Economy', tag: 'best' },
        { airline: 'Delta', number: 'DL 200', depart: '17:05', arrive: '09:10', next_day: true, duration: '9 h 5 min', stops: 0, price: 1012, currency: 'USD', cabin: 'Economy', tag: 'fastest' },
        { airline: 'TAP Air Portugal', number: 'TP 202 · TP 1754', depart: '21:55', arrive: '16:40', next_day: true, duration: '11 h 45 min', stops: 1, via: 'LIS', price: 598, currency: 'USD', cabin: 'Economy', tag: 'cheapest' },
        { airline: 'ITA Airways', number: 'AZ 611 · AZ 722', depart: '17:55', arrive: '12:35', next_day: true, duration: '11 h 40 min', stops: 1, via: 'FCO', price: 642, currency: 'USD', cabin: 'Economy' },
        { airline: 'Air France', number: 'AF 11 · AF 1032', depart: '19:30', arrive: '13:55', next_day: true, duration: '11 h 25 min', stops: 1, via: 'CDG', price: 689, currency: 'USD', cabin: 'Economy' },
        { airline: 'Lufthansa', number: 'LH 401 · LH 1284', depart: '18:00', arrive: '13:50', next_day: true, duration: '12 h 50 min', stops: 1, via: 'FRA', price: 731, currency: 'USD', cabin: 'Economy' },
      ],
    },
  },
  {
    id: 'stays',
    title: 'Places to stay',
    group: 'travel',
    use: 'Hotels and rentals as cards: pictures, stars, guest rating, price a night and in all, area, amenities and notes, sortable and shown on a map.',
    keywords: 'hotels stays accommodation lodging rentals apartments hostel where to stay rooms price per night booking',
    shape: `{
  location?: string
  dates?: string               // "20–24 Nov · 4 nights"
  stays: {
    name: string
    image?: image
    rating?: number            // guests' score: out of 5, or out of 10 (8.9)
    reviews?: number
    stars?: number             // its class, 1 to 5
    price: number | string     // for one night (or one \`per\`)
    currency?: string          // "EUR"
    per?: string               // "night" unless set
    total?: number | string    // for the whole stay
    area?: string
    amenities?: string[]
    note?: md
    url?: url
    lat?: number
    lng?: number
  }[]
}`,
    example: {
      location: 'Near the Acropolis, Athens',
      dates: '20–24 Nov · 4 nights · 2 adults',
      stays: [
        { name: 'Herodion Hotel', image: 'https://www.herodion.gr/_storageWeb_/n/17804338812446/b/692033667068/HerodionHotel_homepage1.jpeg', stars: 4, rating: 9.1, reviews: 2840, price: 165, currency: 'EUR', total: 660, area: 'Makrygianni', amenities: ['Breakfast included', 'Rooftop with Acropolis view', 'Free Wi-Fi'], note: 'Two minutes from the Acropolis Museum.', url: 'https://www.herodion.gr/en', lat: 37.9684, lng: 23.7271 },
        { name: 'AthensWas', image: 'https://www.athenswas.gr/app/uploads/sites/13/2019/05/drz-athenswas0961-scaled.jpg', stars: 5, rating: 9.3, reviews: 1650, price: 290, currency: 'EUR', total: 1160, area: 'Makrygianni', amenities: ['Rooftop restaurant', 'Breakfast included', 'Gym'], note: 'A design hotel on the walkway below the Acropolis.', url: 'https://www.athenswas.gr/', lat: 37.9702, lng: 23.7297 },
        { name: 'Electra Palace Athens', image: 'https://www.electrahotels.gr/app/uploads/2025/07/electra-palace-athens-hotel-exterior-flags-balcony.jpg', stars: 5, rating: 9, reviews: 4210, price: 260, currency: 'EUR', total: 1040, area: 'Plaka', amenities: ['Rooftop pool', 'Spa', 'Breakfast included'], note: 'Ask for a room on the Acropolis side.', url: 'https://www.electrahotels.gr/hotels/electra-palace-athens/', lat: 37.9739, lng: 23.7317 },
        { name: 'Plaka Hotel', image: 'https://imgcy.trivago.com/c_fill,d_dummy.jpeg,e_sharpen:60,f_auto,h_627,q_auto,w_1200/hotelier-images/5b/18/cdcb2de28a38b16acd9c4bc5006ceb9899e9143ab92fd6d5cfbc243dc3e7.jpeg', stars: 3, rating: 8.7, reviews: 3120, price: 135, currency: 'EUR', total: 540, area: 'Plaka', amenities: ['Roof garden', 'Free Wi-Fi'], note: 'Simple rooms; the roof garden faces the Parthenon.', lat: 37.9758, lng: 23.7283 },
        { name: 'Hotel Grande Bretagne', image: 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Athens-Grande1.jpg', stars: 5, rating: 9.4, reviews: 5980, price: 480, currency: 'EUR', total: 1920, area: 'Syntagma', amenities: ['Spa', 'Indoor pool', 'Rooftop restaurant'], note: 'The grand old hotel of Athens, across from Parliament.', url: 'https://www.grandebretagne.gr/', lat: 37.9766, lng: 23.7354 },
      ],
    },
  },
  {
    id: 'world-clock',
    title: 'World clock',
    group: 'travel',
    use: 'The time now in several cities, ticking live, with a 24-hour bar of each one’s working hours to find the time that suits everyone.',
    keywords: 'time zones world clock what time is it meeting planner overlap working hours cities international',
    shape: `{
  title?: string
  zones: { city: string, tz: string, note?: string }[]   // tz: an IANA name, "Europe/Athens"; the bar reads in the first one's time
  hours?: [number, number]     // working hours, from and to on a 24-hour clock: 9 to 17 unless set
}`,
    example: {
      title: 'When the team can meet',
      zones: [
        { city: 'Amherst', tz: 'America/New_York', note: 'You' },
        { city: 'São Paulo', tz: 'America/Sao_Paulo', note: 'Lucas' },
        { city: 'London', tz: 'Europe/London', note: 'Tom' },
        { city: 'Lagos', tz: 'Africa/Lagos', note: 'Amara' },
        { city: 'Athens', tz: 'Europe/Athens', note: 'Eleni and Nikos' },
      ],
      hours: [9, 17],
    },
  },
  {
    id: 'currency',
    title: 'Currency converter',
    group: 'travel',
    use: 'Converts an amount between two currencies as you type, with a swap button, the rate, and the same amount in other currencies.',
    keywords: 'currency converter exchange rate convert money dollars euros pounds yen forex foreign exchange how much is',
    shape: `{
  from: string                 // an ISO code: "USD"
  to: string                   // "EUR"
  rate: number                 // 1 from = rate to
  amount?: number              // 1 unless set
  as_of?: date
  others?: { code: string, rate: number }[]   // 1 from in other currencies
}`,
    example: {
      from: 'USD',
      to: 'EUR',
      rate: 0.862,
      amount: 250,
      as_of: '2026-11-06',
      others: [
        { code: 'GBP', rate: 0.757 },
        { code: 'JPY', rate: 152.4 },
        { code: 'CHF', rate: 0.801 },
        { code: 'CAD', rate: 1.392 },
      ],
    },
  },
  {
    id: 'departures',
    title: 'Departures board',
    group: 'travel',
    use: 'The next trains, buses, trams or ferries from a stop: line, destination, platform, delays and cancellations, and the minutes until each leaves, counted live.',
    keywords: 'departures next train bus tram metro subway ferry station stop platform delays cancelled leaving public transport',
    shape: `{
  station: string
  updated?: time               // when the times were read
  tz?: string                  // the station's time zone ("Europe/Zurich") when it is not the user's
  departures: {
    time: time                 // as timetabled
    line?: string              // "S8", "IC 1", "42"
    destination: string
    via?: string
    platform?: string
    delay?: number             // minutes late
    status?: "on time" | "delayed" | "cancelled"
    mode?: "train" | "bus" | "tram" | "metro" | "ferry"
    color?: string             // the line's own colour: "#e2001a"
  }[]                          // in time order
}`,
    example: {
      station: 'Zürich HB',
      updated: '17:58',
      tz: 'Europe/Zurich',
      departures: [
        { time: '18:02', line: 'S8', destination: 'Winterthur', via: 'Zürich Oerlikon', platform: '34', mode: 'train' },
        { time: '18:04', line: 'IC 1', destination: 'Genève-Aéroport', via: 'Bern, Lausanne', platform: '31', mode: 'train' },
        { time: '18:07', line: 'S24', destination: 'Zug', via: 'Thalwil', platform: '43', delay: 3, mode: 'train' },
        { time: '18:09', line: 'EC', destination: 'Milano Centrale', via: 'Arth-Goldau, Lugano', platform: '9', mode: 'train' },
        { time: '18:13', line: 'IR 36', destination: 'Basel SBB', via: 'Brugg', platform: '16', delay: 6, status: 'delayed', mode: 'train' },
        { time: '18:16', line: 'S16', destination: 'Zürich Flughafen', platform: '42', status: 'cancelled', mode: 'train' },
        { time: '18:19', line: '10', destination: 'Zürich Flughafen', via: 'Bahnhofplatz/HB', mode: 'tram' },
        { time: '18:21', line: 'ICE', destination: 'Frankfurt (Main) Hbf', via: 'Basel SBB, Freiburg', platform: '7', mode: 'train' },
        { time: '18:30', line: 'RJX', destination: 'Wien Hbf', via: 'Sargans, Innsbruck', platform: '6', mode: 'train' },
        { time: '18:35', line: 'IC 5', destination: 'Lausanne', via: 'Biel/Bienne, Neuchâtel', platform: '17', mode: 'train' },
      ],
    },
  },
  {
    id: 'elevation',
    title: 'Elevation profile',
    group: 'travel',
    use: 'A hike or ride’s elevation profile: height over distance with a crosshair reading both, waypoints, the climb and descent, and the route on a map.',
    keywords: 'elevation profile hike trail climb ascent descent altitude height mountain summit ride cycling running gpx',
    shape: `{
  title?: string
  unit?: "km" | "mi"           // the distances': km unless set (with mi, heights show in feet)
  points: {
    d: number                  // distance from the start, in the unit
    ele: number                // height in metres
    lat?: number
    lng?: number               // with positions, the route goes on a map
  }[]                          // in order: 20 to 200 along the way
  waypoints?: { d: number, label: string }[]
  stats?: {                    // worked out from the points unless given
    distance?: number          // in the unit
    gain?: number              // metres climbed in all
    loss?: number              // metres descended
    high?: number              // the highest point, in metres
    low?: number
    time?: string              // "4–5 h up"
  }
}`,
    example: {
      title: 'Mount Washington by the Tuckerman Ravine Trail',
      unit: 'mi',
      points: [
        { d: 0, ele: 622, lat: 44.25797, lng: -71.25331 },
        { d: 0.23, ele: 656, lat: 44.26075, lng: -71.25569 },
        { d: 0.28, ele: 660, lat: 44.26058, lng: -71.25628 },
        { d: 0.41, ele: 703, lat: 44.25982, lng: -71.25799 },
        { d: 0.51, ele: 728, lat: 44.26084, lng: -71.25892 },
        { d: 0.6, ele: 739, lat: 44.25988, lng: -71.25968 },
        { d: 0.69, ele: 765, lat: 44.26107, lng: -71.26031 },
        { d: 0.78, ele: 793, lat: 44.26156, lng: -71.26202 },
        { d: 1.1, ele: 892, lat: 44.26162, lng: -71.26844 },
        { d: 1.33, ele: 964, lat: 44.26254, lng: -71.27284 },
        { d: 1.56, ele: 1025, lat: 44.26392, lng: -71.27681 },
        { d: 1.61, ele: 1043, lat: 44.26399, lng: -71.27769 },
        { d: 1.79, ele: 1076, lat: 44.26193, lng: -71.27952 },
        { d: 1.89, ele: 1101, lat: 44.26128, lng: -71.28099 },
        { d: 2.02, ele: 1138, lat: 44.26234, lng: -71.28317 },
        { d: 2.07, ele: 1152, lat: 44.2617, lng: -71.28338 },
        { d: 2.25, ele: 1182, lat: 44.26005, lng: -71.28608 },
        { d: 2.39, ele: 1200, lat: 44.26045, lng: -71.28842 },
        { d: 2.53, ele: 1278, lat: 44.26123, lng: -71.29087 },
        { d: 2.81, ele: 1347, lat: 44.26173, lng: -71.29614 },
        { d: 2.85, ele: 1364, lat: 44.26199, lng: -71.29697 },
        { d: 2.9, ele: 1399, lat: 44.26252, lng: -71.29748 },
        { d: 2.95, ele: 1446, lat: 44.26317, lng: -71.29736 },
        { d: 2.99, ele: 1483, lat: 44.26329, lng: -71.29792 },
        { d: 3.08, ele: 1532, lat: 44.26287, lng: -71.29957 },
        { d: 3.22, ele: 1624, lat: 44.2635, lng: -71.30203 },
        { d: 3.68, ele: 1887, lat: 44.26961, lng: -71.30199 },
      ],
      waypoints: [
        { d: 0, label: 'Pinkham Notch' },
        { d: 0.35, label: 'Crystal Cascade' },
        { d: 2.25, label: 'Hermit Lake shelters' },
        { d: 3.26, label: 'Tuckerman Junction' },
        { d: 3.68, label: 'Summit' },
      ],
      stats: { time: '4–5 h up' },
    },
  },
];
