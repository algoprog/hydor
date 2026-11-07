// Answer UIs for time and plans: timelines, agendas, calendars, roadmaps, steps, checklists, countdowns, boards, status.
import type { AnswerUiSpec } from './types.ts';

export const PLANS: AnswerUiSpec[] = [
  {
    id: 'timeline',
    title: 'Timeline',
    group: 'plans',
    use: 'Events in order down a line, dated as written (years, BCE years, full dates), with text, pictures and tags: histories, lives, project milestones.',
    keywords: 'timeline history chronology events dates milestones biography life story era sequence what happened when',
    shape: `{
  title?: string
  events: {
    date: string               // as it should read: "447 BCE", "1687", "20 June 2009"
    title: string
    text?: md
    image?: image
    tag?: string
    tone?: tone                // the dot's colour
  }[]                          // in order
}`,
    example: {
      title: 'The Acropolis through 3,000 years',
      events: [
        { date: 'c. 1250 BCE', title: 'A Mycenaean citadel', text: 'Cyclopean walls ring the rock, with a palace on its top.', tag: 'Bronze Age' },
        { date: '480 BCE', title: 'The Persians burn it', text: 'Xerxes’ army sacks the old temples; the Athenians later bury the broken statues.', tone: 'bad' },
        { date: '447–432 BCE', title: 'The Parthenon is built', text: 'Under Pericles, Ictinus and Callicrates build it and Phidias oversees its sculptures.', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/The_Parthenon_in_Athens.jpg/500px-The_Parthenon_in_Athens.jpg', tag: 'Classical', tone: 'good' },
        { date: '1458', title: 'The Ottomans take the rock', text: 'The Parthenon becomes a mosque, with a minaret in its corner.' },
        { date: '26 September 1687', title: 'The great explosion', text: 'A Venetian shell ignites Ottoman gunpowder stored in the Parthenon and blows out its middle.', tone: 'bad' },
        { date: '1801–1812', title: 'Elgin takes the marbles', text: 'About half the surviving sculptures are shipped to Britain; they are in the British Museum today.', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Elgin-marbles-jan-2024.jpg/500px-Elgin-marbles-jan-2024.jpg' },
        { date: '20 June 2009', title: 'The Acropolis Museum opens', text: 'Its top floor shows the frieze facing the temple, with gaps left for what is in London.', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Acropolis_and_Acropolis_Museum.jpg/500px-Acropolis_and_Acropolis_Museum.jpg', tone: 'info' },
      ],
    },
  },
  {
    id: 'agenda',
    title: 'Agenda',
    group: 'plans',
    use: 'A day’s schedule in time order, with places, people and free time between, a line at the time now on the day, and a calendar file.',
    keywords: 'agenda schedule day plan timetable program programme meetings conference event sessions today ics calendar',
    shape: `{
  title?: string
  date?: date                  // the day: a line marks the time now when it is today
  items: {
    start: time
    end?: time
    title: string
    place?: string
    who?: string               // "Dana Lee", "Everyone"
    tag?: string
    tone?: tone
  }[]
}`,
    example: {
      title: 'Hackathon, day two',
      date: '2026-11-07',
      items: [
        { start: '08:30', end: '09:00', title: 'Breakfast and check-in', place: 'Atrium', tag: 'Food' },
        { start: '09:00', end: '09:30', title: 'Kick-off: the challenges', place: 'Main hall', who: 'The organisers', tone: 'accent' },
        { start: '09:30', end: '12:30', title: 'Hacking, round one', place: 'Rooms 101–104' },
        { start: '12:30', end: '13:30', title: 'Lunch', place: 'Atrium', tag: 'Food' },
        { start: '13:30', end: '14:00', title: 'Workshop: a demo in five minutes', place: 'Main hall', who: 'Dana Lee', tag: 'Talk', tone: 'info' },
        { start: '14:00', end: '17:00', title: 'Hacking, round two', place: 'Rooms 101–104' },
        { start: '17:30', end: '19:00', title: 'Demos and judging', place: 'Main hall', who: 'All teams', tone: 'warn' },
        { start: '19:00', end: '20:30', title: 'Prizes and dinner', place: 'Roof terrace', tag: 'Food', tone: 'good' },
      ],
    },
  },
  {
    id: 'calendar',
    title: 'Calendar',
    group: 'plans',
    use: 'Events on a month grid, one for each month they span, today marked, with the events listed under it and a calendar file to save.',
    keywords: 'calendar month view events dates holidays deadlines trips schedule month at a glance planner ics',
    shape: `{
  title?: string
  month?: string               // "YYYY-MM": the first month shown; the first event's unless set
  events: {
    date: date
    end?: date                 // the last day, for an event of several days
    title: string
    tone?: tone
  }[]
}`,
    example: {
      title: 'The rest of the year',
      month: '2026-11',
      events: [
        { date: '2026-11-11', title: 'Veterans Day: no school', tone: 'info' },
        { date: '2026-11-13', title: 'Paper reviews due', tone: 'warn' },
        { date: '2026-11-19', end: '2026-11-24', title: 'Athens trip', tone: 'accent' },
        { date: '2026-11-26', title: 'Thanksgiving', tone: 'good' },
        { date: '2026-12-04', title: 'Grant deadline', tone: 'bad' },
        { date: '2026-12-12', title: 'Lab holiday party' },
        { date: '2026-12-21', end: '2026-12-31', title: 'Office closed', tone: 'info' },
      ],
    },
  },
  {
    id: 'roadmap',
    title: 'Roadmap',
    group: 'plans',
    use: 'A plan in phases, each with when it happens, its status (done, active, next, later) and its items, with what is done ticked.',
    keywords: 'roadmap plan phases milestones product roadmap project plan stages quarters release plan progress what is next',
    shape: `{
  title?: string
  phases: {
    name: string
    when?: string              // "Q1 2027", "Oct–Dec"
    status?: "done" | "active" | "next" | "later"
    items: (md | { text: md, done?: boolean })[]
  }[]
}`,
    example: {
      title: 'Mobile app roadmap',
      phases: [
        { name: 'Research', when: 'Aug–Sep 2026', status: 'done', items: [{ text: 'Interview 20 users', done: true }, { text: 'Map the main journeys', done: true }, { text: 'Choose React Native', done: true }] },
        { name: 'Beta', when: 'Oct–Dec 2026', status: 'active', items: [{ text: 'Sign-in and sync', done: true }, { text: 'Offline mode', done: true }, { text: 'Push notifications', done: false }, { text: 'TestFlight beta with 200 users', done: false }] },
        { name: 'Launch', when: 'Q1 2027', status: 'next', items: ['App Store and Google Play listings', 'Onboarding and in-app help', 'Launch post and press kit'] },
        { name: 'Grow', when: 'From Q2 2027', status: 'later', items: ['Home-screen widgets', 'Shared spaces for teams', 'Ten more languages'] },
      ],
    },
  },
  {
    id: 'steps',
    title: 'Step-by-step guide',
    group: 'plans',
    use: 'A numbered how-to to follow and tick off, with progress, the time it takes, difficulty and tools, and code, tips and warnings in its steps.',
    keywords: 'how to steps guide instructions tutorial walkthrough set up install procedure diy step by step method',
    shape: `{
  title?: string
  intro?: md
  time?: string                // "10 min"
  difficulty?: string          // "Easy"
  tools?: string[]             // what you need
  steps: {
    title: string
    text?: md
    image?: image
    code?: string              // shown as code, with a copy button
    lang?: string              // the code's language: "bash"
    tip?: md
    warning?: md
  }[]
}`,
    example: {
      title: 'Connect to GitHub with an SSH key',
      intro: 'Push and pull without typing a password: make a key on your computer and give GitHub its public half.',
      time: '10 min',
      difficulty: 'Easy',
      tools: ['A terminal', 'A GitHub account'],
      steps: [
        { title: 'Make a key', text: 'Use your GitHub email. Press Enter to keep the usual file, then choose a passphrase.', code: 'ssh-keygen -t ed25519 -C "you@example.com"', lang: 'bash' },
        { title: 'Add it to the SSH agent', text: 'So you type the passphrase once a session, not on every push.', code: 'eval "$(ssh-agent -s)"\nssh-add ~/.ssh/id_ed25519', lang: 'bash' },
        { title: 'Copy the public key', code: 'cat ~/.ssh/id_ed25519.pub', lang: 'bash', warning: 'Copy the file ending in **.pub** only: the other one is your private key, never to be shared.' },
        { title: 'Add it on GitHub', text: 'Open **Settings → SSH and GPG keys → New SSH key**, name it after this computer, paste the key and save.' },
        { title: 'Test the connection', code: 'ssh -T git@github.com', lang: 'bash', tip: 'The first time, type **yes** to trust GitHub. “Hi *username*! You’ve successfully authenticated” means it works.' },
        { title: 'Switch a repository to SSH', text: 'For one you cloned over HTTPS:', code: 'git remote set-url origin git@github.com:USER/REPO.git', lang: 'bash' },
      ],
    },
  },
  {
    id: 'checklist',
    title: 'Checklist',
    group: 'plans',
    use: 'Things to tick off, in groups, with a progress bar: the ticks stay when the conversation is opened again, and the list copies as text.',
    keywords: 'checklist todo to-do list tasks packing tick off before you go preparation items done',
    shape: `{
  title?: string
  groups?: { name: string, items: Item[] }[]
  items?: Item[]               // a list without groups
}
Item = md | { text: md, note?: string, done?: boolean }   // done: ticked to begin with`,
    example: {
      title: 'Packing for Athens in late November',
      groups: [
        { name: 'Documents', items: [{ text: 'Passport', done: true }, { text: 'Boarding passes', note: 'In the airline’s app' }, 'Travel insurance details', 'A little cash in euros'] },
        { name: 'Clothes', items: ['Light rain jacket', 'A warm sweater for the evenings', { text: 'Comfortable walking shoes', note: 'The marble on the Acropolis is slippery' }, 'Five days of clothes'] },
        { name: 'Toiletries', items: ['Toothbrush and toothpaste', 'Sunscreen', 'Medicines'] },
        { name: 'Gadgets', items: [{ text: 'Phone charger', done: true }, 'Plug adapter (type C or F)', 'Power bank'] },
      ],
    },
  },
  {
    id: 'countdown',
    title: 'Countdown',
    group: 'plans',
    use: 'The days, hours, minutes and seconds left until a moment, ticking live, with a picture and a note; once it comes, it says so.',
    keywords: 'countdown timer how long until days left event launch deadline birthday new year release date',
    shape: `{
  title: string
  to: datetime                 // local time; with Z or an offset (+03:00) for a time zone's
  image?: image
  note?: md
}`,
    example: {
      title: 'Total solar eclipse over Luxor',
      to: '2027-08-02T13:02+03:00',
      image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Total_Solar_Eclipse_8-21-17.jpg/960px-Total_Solar_Eclipse_8-21-17.jpg',
      note: 'About **6 min 20 s** of totality at Luxor with the Sun 82° high: the longest total eclipse seen from land between 1991 and 2114.',
    },
  },
  {
    id: 'kanban',
    title: 'Kanban board',
    group: 'plans',
    use: 'Cards in columns side by side (to do, doing, done…) with tags, people and due dates, late ones marked; the columns scroll sideways.',
    keywords: 'kanban board columns cards tasks to do in progress done project status workflow backlog sprint trello',
    shape: `{
  title?: string
  columns: {
    name: string
    tone?: tone
    cards: { title: string, text?: md, tag?: string, who?: string, due?: date }[]
  }[]                          // in order, the last for what is done
}`,
    example: {
      title: 'Website relaunch',
      columns: [
        { name: 'To do', cards: [{ title: 'Write the pricing page', tag: 'Content', who: 'Maya Chen', due: '2026-11-13' }, { title: 'Redirects from the old addresses', tag: 'Dev', who: 'Leo Park' }, { title: 'Cookie banner wording', tag: 'Legal', due: '2026-11-18' }] },
        { name: 'In progress', tone: 'info', cards: [{ title: 'New home page', text: 'Hero, three features, quotes from customers.', tag: 'Design', who: 'Sara Ruiz', due: '2026-11-10' }, { title: 'Move the blog', text: '**212 of 340** posts moved.', tag: 'Dev', who: 'Leo Park' }] },
        { name: 'Review', tone: 'warn', cards: [{ title: 'About us page', tag: 'Content', who: 'Maya Chen', due: '2026-11-06' }, { title: 'Accessibility pass', text: 'Contrast fixed; keyboard focus still to do.', tag: 'QA', who: 'Ana Silva' }] },
        { name: 'Done', tone: 'good', cards: [{ title: 'Brand colours and type', tag: 'Design', who: 'Sara Ruiz' }, { title: 'Choose the CMS', tag: 'Dev', who: 'Leo Park' }, { title: 'Domain and hosting', tag: 'Ops' }] },
      ],
    },
  },
  {
    id: 'status',
    title: 'Status board',
    group: 'plans',
    use: 'How each part of something stands (services, a project’s parts): a status in colour, details, figures, when checked, an overall verdict and progress.',
    keywords: 'status board health uptime services outage project report on track at risk blocked dashboard progress',
    shape: `{
  title?: string
  overall?: { label: string, tone: tone }
  items: {
    name: string
    status: string             // "ok", "degraded", "down", "on track", "at risk", "blocked", "done"…
    detail?: md
    value?: string             // a figure: "99.98%", "38 of 45"
    updated?: string           // "10 min ago"
  }[]
  progress?: number            // 0 to 100: how far the whole has come
}`,
    example: {
      title: 'Kitchen renovation, 7 November',
      overall: { label: 'At risk: the finish moves to early December', tone: 'warn' },
      progress: 60,
      items: [
        { name: 'Demolition', status: 'done', updated: '19 Oct' },
        { name: 'Plumbing', status: 'done', detail: 'New supply lines and the dishwasher drain are in.', updated: '30 Oct' },
        { name: 'Electrical', status: 'on track', detail: 'Inspection booked for **Tuesday 10 Nov**.', value: '80%', updated: 'Today' },
        { name: 'Cabinets', status: 'at risk', detail: 'Delivery moved from 12 to 19 November.', value: '1 week late', updated: 'Yesterday' },
        { name: 'Countertops', status: 'blocked', detail: 'Cannot be measured until the cabinets are in.', updated: 'Yesterday' },
        { name: 'Budget', status: 'on track', value: '€18,400 of €21,000', updated: '5 Nov' },
      ],
    },
  },
  {
    id: 'go-no-go',
    title: 'Go or no-go',
    group: 'plans',
    use: 'A verdict on whether to go ahead (a drone flight, stargazing, a hike, a launch), each condition checked with its value and status.',
    keywords: 'go no-go decision conditions safe to fly hike stargazing weather check launch readiness verdict criteria',
    shape: `{
  title: string
  verdict: "go" | "caution" | "no-go"
  summary?: md
  checks: {
    name: string
    value?: string             // what it is: "12 km/h", "5%"
    status: "go" | "caution" | "no-go"
    note?: md
  }[]
}`,
    example: {
      title: 'Stargazing at Cherry Springs tonight',
      verdict: 'go',
      summary: 'A clear, moonless night, the best in weeks. Dress for frost, and expect dew after midnight.',
      checks: [
        { name: 'Cloud cover', value: '5%', status: 'go', note: 'Clear from dusk until dawn.' },
        { name: 'Moon', value: '4% crescent, rises 4:40', status: 'go', note: 'No moonlight all evening.' },
        { name: 'Transparency', value: 'Above average', status: 'go' },
        { name: 'Seeing', value: '3 of 5', status: 'caution', note: 'Fine for galaxies; planets will shimmer at high power.' },
        { name: 'Wind', value: '6 km/h', status: 'go' },
        { name: 'Dew', value: 'Dew point −2 °C, air −1 °C', status: 'caution', note: 'Frost on the optics after midnight: bring a dew heater or hand warmers.' },
        { name: 'Temperature', value: '−1 °C by 22:00', status: 'caution', note: 'Layers, a hat and a hot drink.' },
      ],
    },
  },
];
