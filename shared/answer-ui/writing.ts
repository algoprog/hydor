// Answer UIs for writing: emails, alternatives to pick from, social posts, changes to a text.
import type { AnswerUiSpec } from './types.ts';

export const WRITING: AnswerUiSpec[] = [
  {
    id: 'email',
    title: 'Email draft',
    group: 'writing',
    use: 'An email ready to send: switch between versions (shorter, firmer…), copy it, or open it in the mail app with everything filled in.',
    keywords: 'email draft write message letter reply follow-up mail compose subject line polite firm template send',
    shape: `{
  to?: string                  // "Mark Ellison <mark@example.com>"; several with commas
  cc?: string
  subject: string
  body: md                     // plain paragraphs; a line break shows as one
  label?: string               // this version's name in the switch ("Polite")
  variants?: { label: string, subject?: string, body: md }[]   // other versions: "Shorter", "Firmer"
}`,
    example: {
      to: 'Mark Ellison <mark.ellison@example.com>',
      subject: 'No heating at Flat 3, 14 Elm Road',
      label: 'Polite',
      body: 'Hi Mark,\n\nThe boiler at Flat 3 stopped heating on **Tuesday 3 November**: the radiators stay cold and the pressure gauge reads zero, even after I re-pressurised it as the manual says.\n\nWith nights near freezing, could you send an engineer **this week**? I’m home Wednesday and Thursday after 2 pm, or the engineer can collect a key from the concierge.\n\nThanks,\nAlex',
      variants: [
        {
          label: 'Firmer',
          subject: 'Second request: no heating at Flat 3, 14 Elm Road',
          body: 'Hi Mark,\n\nI wrote on Tuesday about the boiler at Flat 3, which hasn’t heated since **3 November**, and haven’t heard back.\n\nHeating repairs fall to the landlord (section 11 of the Landlord and Tenant Act 1985), and with temperatures near freezing this is now urgent. Please tell me by **Friday 13 November** when an engineer will come.\n\nRegards,\nAlex',
        },
        {
          label: 'Shorter',
          body: 'Hi Mark,\n\nThe boiler at Flat 3 has given no heat since 3 November (the pressure reads zero, even after re-pressurising). Could an engineer come this week? I’m in Wednesday and Thursday after 2 pm.\n\nThanks,\nAlex',
        },
      ],
    },
  },
  {
    id: 'variants',
    title: 'Options to pick from',
    group: 'writing',
    use: 'Alternatives to choose from (names, headlines, taglines, replies), each with a note and its length against a limit: copy one, or pick it to reply.',
    keywords: 'options alternatives variants ideas names headlines taglines slogans subject lines titles captions choose pick wording',
    shape: `{
  title?: string
  kind?: string                // what they are: "Subject lines", "Names"
  items: { text: string, note?: md, tag?: string }[]   // 3 to 10; tag: a short label ("Playful")
  limit?: number               // the most characters each may have: lengths show against it
}`,
    example: {
      title: 'The November newsletter',
      kind: 'Subject lines',
      limit: 50,
      items: [
        {
          text: 'Five slow Sunday recipes for colder days',
          tag: 'Safe',
          note: 'Plain and useful: what a list of home cooks opens.',
        },
        {
          text: 'Soup season starts now',
          tag: 'Short',
          note: 'Reads whole even in a narrow phone inbox.',
        },
        {
          text: 'The one-pot dinner readers made 3,000 times',
          tag: 'Proof',
          note: 'The number does the persuading.',
        },
        { text: 'Your weekend, sorted: a stew, a loaf, a pie', tag: 'Playful' },
        {
          text: 'Is this the easiest bread you will ever bake?',
          tag: 'Curious',
          note: 'Questions lift opens; make sure the recipe lives up to it.',
        },
        {
          text: 'What we are cooking this November, and why you should too',
          tag: 'Long',
          note: 'Over the limit: a phone’s inbox cuts the end off.',
        },
      ],
    },
  },
  {
    id: 'social-post',
    title: 'Social media post',
    group: 'writing',
    use: 'Posts or a thread previewed as the platform shows them (X, LinkedIn, Instagram, Threads, Bluesky, Facebook, Mastodon), with each one’s length against its limit and a copy button.',
    keywords: 'social media post tweet thread linkedin instagram caption threads bluesky facebook mastodon announcement character limit',
    shape: `{
  platform?: "x" | "linkedin" | "instagram" | "threads" | "bluesky" | "facebook" | "mastodon"   // x unless set
  author?: { name: string, handle?: string, avatar?: image, headline?: string }   // headline: LinkedIn's line under the name
  posts: {
    text: string               // as it will be posted: line breaks, #tags, @names and links as written
    image?: image
    alt?: string               // the picture's description
    note?: md                  // advice for this one, not posted ("Post at 9 am")
  }[]                          // several make a thread, in order
}`,
    example: {
      platform: 'x',
      author: { name: 'Priya Raman', handle: '@priyaraman_dev' },
      posts: [
        {
          text: 'We cut our CI from 22 minutes to 6 without new hardware. Four changes did almost all of it 🧵',
          note: 'Pin this one: it carries the thread.',
        },
        {
          text: '1/ Cache dependencies by lockfile hash, not by branch.\n\nCache hits went from 40% to 95%, which alone saved 7 minutes.',
        },
        {
          text: '2/ Split the tests by timing data, not by file count. Our eight shards now finish within 20 seconds of each other.',
        },
        {
          text: '3/ Run lint and type checks next to the tests instead of before them. A red lint still fails the build; it just doesn’t hold up the queue.',
        },
        {
          text: '4/ Skip the Docker build on pull requests that don’t touch its inputs. Most of ours skip it now.\n\nThe full write-up, with configs: https://example.com/blog/faster-ci #DevOps',
          note: 'Links cut reach on X: you could move this one to a reply.',
        },
      ],
    },
  },
  {
    id: 'diff',
    title: 'Changes to a text',
    group: 'writing',
    use: 'What changed between two versions of a text or code, marked word by word for prose or line by line for code, inline or side by side.',
    keywords: 'diff changes edits compare versions before after revision proofread track changes rewrite redline code changes',
    shape: `{
  title?: string
  before: string
  after: string
  lang?: string                // a code language ("ts", "python"): compared line by line; prose ("text", the default) word by word
  notes?: md[]                 // what changed and why
}`,
    example: {
      title: 'The opening announcement, edited',
      before:
        'The new library opens on Saturday the 14th. There will be a ribbon cutting at 10am, followed by tours of the building, a story time for kids and free coffee from the cafe next door. Parking is limited so we recommend to come by bus or bike.',
      after:
        'The new library opens on Saturday 14 November. A ribbon-cutting at 10 am starts the day, followed by building tours, story time for children and free coffee from the café next door. Parking is limited, so we recommend coming by bus or bike.',
      notes: ['The full date, so nobody has to work out which month.', '“We recommend coming”, not “to come”: *recommend* takes the *-ing* form.', 'A comma before *so* when it joins two full sentences.'],
    },
  },
];
