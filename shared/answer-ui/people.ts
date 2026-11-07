// Answer UIs for people and sports: profiles, people, org charts, matches, league tables, fixtures.
import type { AnswerUiSpec } from './types.ts';

export const PEOPLE: AnswerUiSpec[] = [
  {
    id: 'profile',
    title: 'Profile',
    group: 'people',
    use: 'One person at a glance: photo, role, a short bio, key facts, a timeline of their life or career, and links.',
    keywords: 'person profile biography bio who is about someone career life timeline facts famous author scientist founder',
    shape: `{
  name: string
  image?: image                // a portrait
  role?: string                // "Biochemist"
  org?: string                 // where they work or belong
  location?: string
  bio?: md                     // two or three sentences
  facts?: { label: string, value: md }[]       // born, known for, education, awards…
  links?: { label: string, url: url }[]
  tags?: string[]
  timeline?: { year: string | number, text: md }[]   // in order, oldest first
}`,
    example: {
      name: 'Katalin Karikó',
      image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Katalin_Karik%C3%B3_by_Christopher_Michel_in_2024_02.jpg/330px-Katalin_Karik%C3%B3_by_Christopher_Michel_in_2024_02.jpg',
      role: 'Biochemist',
      org: 'University of Szeged',
      bio: 'Hungarian-American biochemist whose work on **modified mRNA**, with Drew Weissman, made the COVID-19 mRNA vaccines possible. For decades the idea drew little funding; she kept at it, and the two shared the 2023 Nobel Prize.',
      tags: ['mRNA', 'Vaccines', 'Nobel laureate'],
      facts: [
        { label: 'Born', value: '17 January 1955, Szolnok, Hungary' },
        { label: 'Known for', value: 'Nucleoside-modified mRNA' },
        {
          label: 'Education',
          value: 'PhD in biochemistry, University of Szeged (1982)',
        },
        {
          label: 'Awards',
          value: 'Nobel Prize in Physiology or Medicine (2023), Lasker Award (2021)',
        },
        {
          label: 'Memoir',
          value: '*Breaking Through: My Life in Science* (2023)',
        },
      ],
      timeline: [
        {
          year: 1982,
          text: 'PhD at the University of Szeged; research at the Biological Research Centre',
        },
        {
          year: 1985,
          text: 'Leaves for Temple University in Philadelphia, with £900 sewn into her daughter’s teddy bear',
        },
        {
          year: 1989,
          text: 'Joins the University of Pennsylvania to work on messenger RNA',
        },
        {
          year: 2005,
          text: 'With Drew Weissman, shows that **modified nucleosides** keep mRNA from setting off inflammation',
        },
        {
          year: 2013,
          text: 'Joins BioNTech in Germany; senior vice president from 2019',
        },
        {
          year: 2023,
          text: 'Nobel Prize in Physiology or Medicine, shared with Weissman',
        },
      ],
      links: [
        {
          label: 'Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Katalin_Karik%C3%B3',
        },
        {
          label: 'The 2023 Nobel Prize',
          url: 'https://www.nobelprize.org/prizes/medicine/2023/press-release/',
        },
      ],
    },
  },
  {
    id: 'people',
    title: 'People',
    group: 'people',
    use: 'Several people side by side, each with a photo, role and a line about them: a team, a cast, a panel of speakers, a crew.',
    keywords: 'people team members cast crew speakers panel staff who is who lineup founders board authors group',
    shape: `{
  title?: string
  people: {
    name: string
    image?: image              // a portrait
    role?: string              // their part: "Commander", "Keynote speaker"
    note?: md                  // a line or two about them
    url?: url
  }[]
}`,
    example: {
      title: 'The Artemis II crew',
      people: [
        {
          name: 'Reid Wiseman',
          role: 'Commander · NASA',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Jsc2023e0016434_alt.jpg/330px-Jsc2023e0016434_alt.jpg',
          note: 'Navy test pilot; flew to the space station in 2014 and led the Astronaut Office from 2020 to 2022.',
          url: 'https://en.wikipedia.org/wiki/Reid_Wiseman',
        },
        {
          name: 'Victor Glover',
          role: 'Pilot · NASA',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Jsc2023e0016433_alt.jpg/330px-Jsc2023e0016433_alt.jpg',
          note: 'Piloted Crew-1, the first operational Crew Dragon flight, in 2020, then lived aboard the station for almost six months.',
          url: 'https://en.wikipedia.org/wiki/Victor_J._Glover',
        },
        {
          name: 'Christina Koch',
          role: 'Mission specialist · NASA',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Jsc2023e0016435_alt.jpg/330px-Jsc2023e0016435_alt.jpg',
          note: 'Engineer; holds the record for the longest single spaceflight by a woman and was on the first all-woman spacewalk.',
          url: 'https://en.wikipedia.org/wiki/Christina_Koch',
        },
        {
          name: 'Jeremy Hansen',
          role: 'Mission specialist · CSA',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Jsc2023e0016436_alt2.jpg/330px-Jsc2023e0016436_alt2.jpg',
          note: 'Canadian fighter pilot; on his first spaceflight he became the first person from outside the US to travel around the Moon.',
          url: 'https://en.wikipedia.org/wiki/Jeremy_Hansen',
        },
      ],
    },
  },
  {
    id: 'org-chart',
    title: 'Org chart',
    group: 'people',
    use: 'Who reports to whom: boxes from the top down joined by lines, the lower levels listed one under another when room is short.',
    keywords: 'org chart organization structure hierarchy reporting lines team tree management company departments who reports to',
    shape: `{
  title?: string
  root: Node
}
Node = { name: string, role?: string, image?: image, children?: Node[] }   // children: who reports to them`,
    example: {
      title: 'Larkspur Health, product and operations',
      root: {
        name: 'Maya Okafor',
        role: 'Chief executive',
        children: [
          {
            name: 'Daniel Reyes',
            role: 'Chief technology officer',
            children: [
              {
                name: 'Priya Natarajan',
                role: 'Engineering manager, Platform',
                children: [
                  { name: 'Tom Becker', role: 'Backend engineer' },
                  { name: 'Aiko Tanaka', role: 'Site reliability' },
                  { name: 'Luis Ortega', role: 'Backend engineer' },
                ],
              },
              {
                name: 'Sam Whitfield',
                role: 'Engineering manager, Apps',
                children: [
                  { name: 'Hannah Cole', role: 'iOS engineer' },
                  { name: 'Omar Haddad', role: 'Web engineer' },
                  { name: 'Elena Petrova', role: 'Product designer' },
                ],
              },
            ],
          },
          {
            name: 'Grace Liu',
            role: 'Chief operating officer',
            children: [
              { name: 'Marcus Bell', role: 'Customer success' },
              { name: 'Sofia Romano', role: 'Finance and people' },
              { name: 'Jonas Weber', role: 'Marketing' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'match',
    title: 'Match',
    group: 'people',
    use: 'A game’s scoreboard (live, final or upcoming), its goals, cards and substitutions minute by minute, and team stats as paired bars.',
    keywords: 'match game score result live scoreboard football soccer goals scorers cards stats possession fixture who won',
    shape: `{
  competition?: string
  date?: datetime              // kick-off
  status?: "scheduled" | "live" | "final"
  minute?: number | string     // while live: 67, "45+2"
  venue?: string
  home: Team
  away: Team
  events?: {
    minute: number | string
    team: "home" | "away"      // the side it counts for (an own goal: the side it was scored for)
    type: "goal" | "penalty" | "own-goal" | "yellow" | "red" | "sub"
    player: string             // a sub: who came on
    detail?: string            // the assist, or who came off
  }[]
  stats?: { label: string, home: number, away: number, unit?: string }[]   // unit: "%"
  note?: md
}
Team = { name: string, logo?: image, color?: string, score?: number }   // color: the kit's, "#EF0107"`,
    example: {
      competition: 'Premier League',
      date: '2026-11-07T17:30',
      status: 'final',
      venue: 'Emirates Stadium, London',
      home: {
        name: 'Arsenal',
        score: 2,
        color: '#EF0107',
        logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/5/53/Arsenal_FC.svg/330px-Arsenal_FC.svg.png',
      },
      away: {
        name: 'Liverpool',
        score: 1,
        color: '#C8102E',
        logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0c/Liverpool_FC.svg/330px-Liverpool_FC.svg.png',
      },
      events: [
        {
          minute: 23,
          team: 'home',
          type: 'goal',
          player: 'Bukayo Saka',
          detail: 'Assist: Martin Ødegaard',
        },
        {
          minute: 41,
          team: 'away',
          type: 'yellow',
          player: 'Alexis Mac Allister',
        },
        {
          minute: 58,
          team: 'away',
          type: 'goal',
          player: 'Mohamed Salah',
          detail: 'Assist: Florian Wirtz',
        },
        {
          minute: 64,
          team: 'away',
          type: 'sub',
          player: 'Alexander Isak',
          detail: 'Hugo Ekitiké off',
        },
        {
          minute: 71,
          team: 'home',
          type: 'sub',
          player: 'Gabriel Martinelli',
          detail: 'Leandro Trossard off',
        },
        {
          minute: 77,
          team: 'home',
          type: 'penalty',
          player: 'Viktor Gyökeres',
        },
        { minute: '90+2', team: 'home', type: 'yellow', player: 'Declan Rice' },
      ],
      stats: [
        { label: 'Possession', home: 46, away: 54, unit: '%' },
        { label: 'Shots', home: 14, away: 11 },
        { label: 'Shots on target', home: 6, away: 4 },
        { label: 'Expected goals', home: 1.9, away: 1.2 },
        { label: 'Corners', home: 7, away: 5 },
        { label: 'Fouls', home: 11, away: 9 },
      ],
      note: 'Gyökeres’s penalty, after Van Dijk tripped Saka, settled it; Arsenal go three points clear at the top.',
    },
  },
  {
    id: 'standings',
    title: 'League table',
    group: 'people',
    use: 'A league’s standings: played, won, drawn, lost, goal difference, points and recent form, with promotion, qualification and relegation zones.',
    keywords: 'standings league table ranking points position promotion relegation zone form season division group football',
    shape: `{
  title?: string
  rows: {
    pos: number
    team: string
    logo?: image
    played?: number, won?: number, drawn?: number, lost?: number
    gd?: number                // goal difference
    points: number
    form?: string              // the last results, oldest first: "WWDLW"
  }[]
  zones?: { from: number, to: number, label: string, tone: tone }[]   // places that go up, qualify or go down
  highlight?: string           // a team to mark (the one asked about)
}`,
    example: {
      title: 'Riverside Sunday League · Division One',
      highlight: 'Clapton Park Rovers',
      zones: [
        { from: 1, to: 2, label: 'Promotion', tone: 'good' },
        { from: 3, to: 4, label: 'Promotion play-offs', tone: 'info' },
        { from: 9, to: 10, label: 'Relegation', tone: 'bad' },
      ],
      rows: [
        {
          pos: 1,
          team: 'Marsh Lane FC',
          played: 12,
          won: 9,
          drawn: 2,
          lost: 1,
          gd: 22,
          points: 29,
          form: 'WWWDW',
        },
        {
          pos: 2,
          team: 'Victoria Park Rangers',
          played: 12,
          won: 8,
          drawn: 2,
          lost: 2,
          gd: 15,
          points: 26,
          form: 'WLWWD',
        },
        {
          pos: 3,
          team: 'Lea Bridge Athletic',
          played: 12,
          won: 7,
          drawn: 3,
          lost: 2,
          gd: 12,
          points: 24,
          form: 'DWWLW',
        },
        {
          pos: 4,
          team: 'Millfields United',
          played: 11,
          won: 7,
          drawn: 1,
          lost: 3,
          gd: 8,
          points: 22,
          form: 'WWLWW',
        },
        {
          pos: 5,
          team: 'Hackney Downs',
          played: 12,
          won: 6,
          drawn: 2,
          lost: 4,
          gd: 5,
          points: 20,
          form: 'LWDWL',
        },
        {
          pos: 6,
          team: 'Clapton Park Rovers',
          played: 12,
          won: 4,
          drawn: 4,
          lost: 4,
          gd: 0,
          points: 16,
          form: 'DDWLD',
        },
        {
          pos: 7,
          team: 'Homerton Harriers',
          played: 12,
          won: 3,
          drawn: 3,
          lost: 6,
          gd: -6,
          points: 12,
          form: 'LWLDL',
        },
        {
          pos: 8,
          team: 'Springfield Albion',
          played: 12,
          won: 2,
          drawn: 1,
          lost: 9,
          gd: -14,
          points: 7,
          form: 'LLWLL',
        },
        {
          pos: 9,
          team: 'Walthamstow Marsh',
          played: 11,
          won: 2,
          drawn: 1,
          lost: 8,
          gd: -17,
          points: 7,
          form: 'LDLLW',
        },
        {
          pos: 10,
          team: 'Leyton Grange',
          played: 12,
          won: 1,
          drawn: 1,
          lost: 10,
          gd: -25,
          points: 4,
          form: 'LLDLL',
        },
      ],
    },
  },
  {
    id: 'fixtures',
    title: 'Fixtures and results',
    group: 'people',
    use: 'Matches by day: final scores, live games and kick-off times for those to come, with the venue.',
    keywords: 'fixtures results matches schedule games this weekend kick-off times scores matchday round calendar football',
    shape: `{
  title?: string
  matches: {
    date: datetime             // kick-off
    home: string
    away: string
    score?: string             // "2-1", once played or under way
    status?: "scheduled" | "live" | "final" | "postponed"
    venue?: string
    competition?: string       // when they are from several
  }[]
}`,
    example: {
      title: 'Premier League · Matchweek 11',
      matches: [
        {
          date: '2026-11-07T12:30',
          home: 'Chelsea',
          away: 'Newcastle United',
          score: '1-1',
          status: 'final',
          venue: 'Stamford Bridge',
        },
        {
          date: '2026-11-07T15:00',
          home: 'Aston Villa',
          away: 'Brighton',
          score: '2-0',
          status: 'final',
          venue: 'Villa Park',
        },
        {
          date: '2026-11-07T15:00',
          home: 'Fulham',
          away: 'Manchester City',
          score: '0-3',
          status: 'final',
          venue: 'Craven Cottage',
        },
        {
          date: '2026-11-07T17:30',
          home: 'Arsenal',
          away: 'Liverpool',
          score: '2-1',
          status: 'final',
          venue: 'Emirates Stadium',
        },
        {
          date: '2026-11-07T20:00',
          home: 'Crystal Palace',
          away: 'Tottenham Hotspur',
          score: '1-1',
          status: 'live',
          venue: 'Selhurst Park',
        },
        {
          date: '2026-11-08T14:00',
          home: 'Manchester United',
          away: 'Everton',
          status: 'scheduled',
          venue: 'Old Trafford',
        },
        {
          date: '2026-11-08T16:30',
          home: 'Brentford',
          away: 'Bournemouth',
          status: 'scheduled',
          venue: 'Gtech Community Stadium',
        },
      ],
    },
  },
  {
    id: 'contact',
    title: 'Contact cards',
    group: 'people',
    use: 'Contact details as cards with call, email, website and map buttons, hours and notes; each saves to the address book as a vCard, or copies.',
    keywords: 'contact details phone number email address call vcard vcf address book business card reach',
    shape: `{
  title?: string
  contacts: {
    name: string               // a person, or a place or business
    role?: string
    org?: string               // where they work
    image?: image              // a portrait or a logo
    phone?: string             // "+1 617-555-0134"
    email?: string
    website?: url
    address?: string
    lat?: number, lng?: number // where the address is: the map button goes there
    hours?: string             // "Mon–Fri 8:00–18:00"
    note?: md
  }[]
}`,
    example: {
      title: 'Your first week at Larkspur Health: who to ask',
      contacts: [
        { name: 'Priya Natarajan', role: 'Engineering manager, Platform · your manager', org: 'Larkspur Health', phone: '+1 617-555-0134', email: 'priya.natarajan@example.com', note: 'Book a 30-minute one-to-one with her on Monday: she will walk you through the on-call rota.' },
        { name: 'Aiko Tanaka', role: 'Site reliability engineer · your onboarding buddy', org: 'Larkspur Health', phone: '+1 617-555-0178', email: 'aiko.tanaka@example.com', note: 'Ask her anything, however small: laptop setup, how deploys work, where the good coffee is.' },
        { name: 'Sofia Romano', role: 'Finance and people', org: 'Larkspur Health', phone: '+1 617-555-0112', email: 'sofia.romano@example.com', note: 'Payroll, your parking permit, and benefits: enrol within **30 days** of your start date.' },
        { name: 'IT help desk', role: 'Laptops, accounts and door badges', org: 'Larkspur Health', phone: '+1 617-555-0100', email: 'help@example.com', website: 'https://example.com/it', address: 'One Broadway, 4th floor, Cambridge, MA 02142', lat: 42.3628, lng: -71.0835, hours: 'Mon–Fri 8:00–18:00' },
      ],
    },
  },
  {
    id: 'bracket',
    title: 'Knockout bracket',
    group: 'people',
    use: 'A knockout bracket: rounds as columns joined by lines, winners in bold, the champion at the end; hovering a team traces its path through it.',
    keywords: 'bracket knockout tournament cup draw elimination playoffs quarter-finals semi-finals final winner advances head to head',
    shape: `{
  title?: string
  rounds: {
    name: string               // "Quarter-finals"
    matches: {
      a: Side
      b: Side
      winner?: "a" | "b"       // once it is decided
      date?: date | datetime
      note?: string            // "After extra time", "France won 5–3 on penalties"
    }[]                        // in bracket order: matches 1 and 2 feed the next round's first, 3 and 4 its second…
  }[]                          // the first round first; the final's winner is the champion
}
Side = { name: string, seed?: number, score?: string, logo?: image }   // score: "2", or "1 (5)" with penalties`,
    example: {
      title: 'UEFA Euro 2024, knockout stage',
      rounds: [
        {
          name: 'Round of 16',
          matches: [
            { a: { name: 'Spain', score: '4' }, b: { name: 'Georgia', score: '1' }, winner: 'a', date: '2024-06-30' },
            { a: { name: 'Germany', score: '2' }, b: { name: 'Denmark', score: '0' }, winner: 'a', date: '2024-06-29' },
            { a: { name: 'Portugal', score: '0 (3)' }, b: { name: 'Slovenia', score: '0 (0)' }, winner: 'a', date: '2024-07-01', note: 'On penalties' },
            { a: { name: 'France', score: '1' }, b: { name: 'Belgium', score: '0' }, winner: 'a', date: '2024-07-01' },
            { a: { name: 'England', score: '2' }, b: { name: 'Slovakia', score: '1' }, winner: 'a', date: '2024-06-30', note: 'After extra time' },
            { a: { name: 'Switzerland', score: '2' }, b: { name: 'Italy', score: '0' }, winner: 'a', date: '2024-06-29' },
            { a: { name: 'Netherlands', score: '3' }, b: { name: 'Romania', score: '0' }, winner: 'a', date: '2024-07-02' },
            { a: { name: 'Austria', score: '1' }, b: { name: 'Turkey', score: '2' }, winner: 'b', date: '2024-07-02' },
          ],
        },
        {
          name: 'Quarter-finals',
          matches: [
            { a: { name: 'Spain', score: '2' }, b: { name: 'Germany', score: '1' }, winner: 'a', date: '2024-07-05', note: 'After extra time' },
            { a: { name: 'Portugal', score: '0 (3)' }, b: { name: 'France', score: '0 (5)' }, winner: 'b', date: '2024-07-05', note: 'On penalties' },
            { a: { name: 'England', score: '1 (5)' }, b: { name: 'Switzerland', score: '1 (3)' }, winner: 'a', date: '2024-07-06', note: 'On penalties' },
            { a: { name: 'Netherlands', score: '2' }, b: { name: 'Turkey', score: '1' }, winner: 'a', date: '2024-07-06' },
          ],
        },
        {
          name: 'Semi-finals',
          matches: [
            { a: { name: 'Spain', score: '2' }, b: { name: 'France', score: '1' }, winner: 'a', date: '2024-07-09' },
            { a: { name: 'England', score: '2' }, b: { name: 'Netherlands', score: '1' }, winner: 'a', date: '2024-07-10' },
          ],
        },
        {
          name: 'Final',
          matches: [{ a: { name: 'Spain', score: '2' }, b: { name: 'England', score: '1' }, winner: 'a', date: '2024-07-14', note: 'Olympiastadion, Berlin' }],
        },
      ],
    },
  },
];
