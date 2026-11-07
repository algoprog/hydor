// Answer UIs for work and business: invoices, review findings, action items, job openings, QR codes and more.
import type { AnswerUiSpec } from './types.ts';

export const WORK: AnswerUiSpec[] = [
  {
    id: 'invoice',
    title: 'Invoice',
    group: 'work',
    use: 'An invoice, quote or receipt with its totals worked out, marked paid or due, to copy as text or save as a page to print.',
    keywords: 'invoice billing quote estimate receipt line items subtotal tax vat total amount due client freelance',
    shape: `{
  kind?: "invoice" | "quote" | "receipt"   // "invoice" unless set
  number?: string
  date?: date                  // when it was issued
  due?: date                   // pay by (an invoice); valid until (a quote)
  from: { name: string, address?: md, email?: string, tax_id?: string }   // who it is from
  to: { name: string, address?: md, email?: string }                      // who it is for
  currency?: string            // an ISO code: "USD" unless set
  items: {
    description: md
    qty?: number               // 1 unless set
    unit_price: number
    tax?: number               // % on this line, in place of the invoice's
  }[]
  discount?: number            // an amount off the subtotal, before tax
  tax?: number                 // % on every line without its own
  notes?: md
  paid?: boolean
  payment?: md                 // how to pay: bank details, a link
}`,
    example: {
      kind: 'invoice',
      number: '2026-047',
      date: '2026-10-28',
      due: '2026-11-11',
      from: { name: 'Lena Fischer Design', address: 'Oranienstraße 34\n10999 Berlin, Germany', email: 'hello@lenafischer.design', tax_id: 'DE298417563' },
      to: { name: 'Kaffeebar Nord GmbH', address: 'Schönhauser Allee 120\n10437 Berlin, Germany', email: 'accounts@kaffeebar-nord.de' },
      currency: 'EUR',
      items: [
        { description: 'Brand refresh: logo, colours and type', qty: 1, unit_price: 1800 },
        { description: 'Menu boards, designed for print', qty: 3, unit_price: 240 },
        { description: 'Website pages: home, menu and visit us', qty: 3, unit_price: 380 },
        { description: 'Half-day photo shoot for the website', qty: 1, unit_price: 450 },
      ],
      discount: 150,
      tax: 19,
      notes: 'Thank you for working with me again! The final files are in our shared folder.',
      payment: 'Bank transfer to **Lena Fischer**\nIBAN DE89 3704 0044 0532 0130 00 · BIC COBADEFFXXX\nPlease put **2026-047** in the reference.',
    },
  },
  {
    id: 'issues',
    title: 'Review findings',
    group: 'work',
    use: 'Code, document or contract review findings by severity, filterable; each opens to its quote, why and fix, with “Ask to fix” for one or all.',
    keywords: 'review findings code review issues bugs severity critical audit feedback problems contract lint pull request comments',
    shape: `{
  title?: string
  subject?: string             // what was reviewed: "PR #214 · Password reset", "Lease for 14 Elm Street"
  summary?: md
  issues: {
    title: string
    severity: "critical" | "major" | "minor" | "nit" | "info"   // info: a note or praise, nothing to fix
    where?: string             // file:line, a section, a page
    quote?: string             // the lines or words in question, as they are
    why?: md
    fix?: md
    code?: string              // the fix as code
    lang?: string
  }[]                          // the most serious first
}`,
    example: {
      title: 'Code review',
      subject: 'PR #214 · Add password reset by email',
      summary: 'The flow works, but **two problems must be fixed before merging**: reset links never expire, and the link in the email can point at another site. The rest is small.',
      issues: [
        {
          title: 'The expiry is saved but never checked',
          severity: 'critical',
          where: 'src/auth/reset.ts:42',
          quote: 'const user = await db.users.findOne({ resetToken: token });',
          why: 'A link from an old email, a forwarded message or a shared screen works **forever**. Reset links should stop working after an hour, and after one use.',
          fix: 'Look the user up only while the link is fresh, and clear the token once it is used.',
          code: "const user = await db.users.findOne({\n  resetTokenHash: sha256(token),\n  resetExpires: { $gt: new Date() },\n});\nif (!user) return res.status(400).json({ error: 'This link has expired' });\nawait db.users.updateOne({ _id: user._id }, { $unset: { resetTokenHash: 1, resetExpires: 1 } });",
          lang: 'ts',
        },
        {
          title: 'The link is built from the Host header',
          severity: 'critical',
          where: 'src/auth/forgot.ts:27',
          quote: 'const link = `https://${req.headers.host}/reset?token=${token}`;',
          why: 'Anyone can send a request with a Host header of their own, so the email you send carries a link to *their* site, with the token in it.',
          fix: 'Build the link from the app’s own address in its settings, never from the request.',
          code: 'const link = new URL(`/reset?token=${token}`, process.env.APP_URL).toString();',
          lang: 'ts',
        },
        {
          title: 'It tells strangers which emails have accounts',
          severity: 'major',
          where: 'src/auth/forgot.ts:19',
          quote: "return res.status(404).json({ error: 'No account with that email' });",
          why: 'Someone can try a list of addresses and learn who uses the app.',
          fix: 'Answer the same way whether or not there is an account.',
          code: "return res.json({ message: 'If that address has an account, we’ve sent it a link.' });",
          lang: 'ts',
        },
        {
          title: 'Tokens are stored as they are',
          severity: 'major',
          where: 'src/auth/forgot.ts:23',
          quote: '{ $set: { resetToken: token, resetExpires: Date.now() + 3600000 } }',
          why: 'Anyone who can read the database (a backup, a leaked copy) can reset the password of anyone with a pending request.',
          fix: 'Store a SHA-256 hash of the token and compare hashes; only the email carries the token itself.',
        },
        {
          title: 'No limit on reset requests',
          severity: 'minor',
          where: 'src/auth/routes.ts:12',
          why: 'A script can flood someone’s inbox with reset emails, and your mail provider may block you for it.',
          fix: 'Allow about five requests an hour per address, with the limiter the login route already uses.',
          code: "router.post('/forgot', loginLimiter, forgot);",
          lang: 'ts',
        },
        { title: '`resetPasword` is misspelled', severity: 'nit', where: 'src/auth/routes.ts:18', quote: "router.post('/reset', resetPasword);", fix: 'Rename it `resetPassword`.' },
        { title: 'A bare number for the link’s lifetime', severity: 'nit', where: 'src/auth/forgot.ts:23', quote: 'Date.now() + 3600000', fix: 'Give it a name: `const RESET_LINK_LIFETIME = 60 * 60 * 1000`.' },
        { title: 'Good: the email has a plain-text version', severity: 'info', where: 'src/emails/reset.tsx', why: 'Some mail apps and screen readers show only plain text, so the link reaches everyone.' },
      ],
    },
  },
  {
    id: 'action-items',
    title: 'Action items',
    group: 'work',
    use: 'What a meeting leaves to do, by owner or due date, late ones marked and ticks kept, with its decisions and open questions; copies as Markdown.',
    keywords: 'action items meeting notes next steps follow-ups owners assignments due dates decisions open questions minutes',
    shape: `{
  title?: string
  meeting?: string             // which meeting or plan: "Website relaunch, weekly sync"
  date?: date                  // when it was
  items: {
    task: md
    owner?: string             // who does it
    due?: date
    status?: "todo" | "doing" | "done" | "blocked"
    priority?: "high" | "medium" | "low"
    note?: md
  }[]
  decisions?: md[]             // what was decided
  questions?: md[]             // what is still open
}`,
    example: {
      title: 'Action items',
      meeting: 'Website relaunch · weekly sync',
      date: '2026-11-05',
      items: [
        { task: 'Send the new home page copy to legal', owner: 'Priya', due: '2026-11-06', priority: 'high' },
        { task: 'Fix the menu covering the logo on small phones', owner: 'Marcus', due: '2026-11-10', status: 'doing', priority: 'high', note: 'Only in Safari on screens under 375 px wide' },
        { task: 'Check the contrast of every button colour', owner: 'Jen', due: '2026-11-07', priority: 'medium' },
        { task: 'Book the photographer for the team page', owner: 'Jen', due: '2026-11-12', status: 'done' },
        { task: 'Write redirects for all the old addresses', owner: 'Tom', due: '2026-11-16', priority: 'medium' },
        { task: 'Move the blog’s 140 posts to the new CMS', owner: 'Marcus', due: '2026-11-20', status: 'blocked', note: 'Waiting for the export key from IT' },
        { task: 'Tell customer support the launch date', owner: 'Priya', due: '2026-11-24', priority: 'low' },
        { task: 'Find out who looks after the old domain’s DNS', priority: 'medium' },
      ],
      decisions: ['Launch moves to **Tuesday 1 December**, after the Black Friday rush', 'The pricing page keeps three plans; the comparison table goes', 'Dark mode waits for the second release'],
      questions: ['Does the new analytics tool need a cookie banner?', 'Who signs off the copy if legal is still reviewing it on the 25th?'],
    },
  },
  {
    id: 'qr',
    title: 'QR code',
    group: 'work',
    use: 'A QR code of a link, Wi-Fi login, contact card, email, phone number or words, shown with what it holds and saved as SVG or PNG.',
    keywords: 'qr code scan barcode wifi password join network contact card link phone camera share',
    shape: `{
  title?: string
  kind?: "url" | "text" | "wifi" | "contact" | "email" | "phone"   // what it holds: a link unless set
  value?: string               // the link, the words, the email address or the phone number
  wifi?: { ssid: string, password?: string, security?: "WPA" | "WEP" | "nopass", hidden?: boolean }   // WPA unless set
  contact?: { name: string, phone?: string, email?: string, org?: string, url?: url }
  caption?: md
  level?: "L" | "M" | "Q" | "H"   // how much of it may be covered and still scan: M unless set (H for a logo over it)
}`,
    example: {
      title: 'Guest Wi-Fi at the studio',
      kind: 'wifi',
      wifi: { ssid: 'Northlight Studio Guest', password: 'blue-heron-42', security: 'WPA' },
      caption: 'Print it for the front desk: guests point their phone’s camera at it and join without typing the password.',
    },
  },
  {
    id: 'jobs',
    title: 'Job openings',
    group: 'work',
    use: 'Job openings as cards with company, place, pay and when posted; filter by remote or type, sort by newest, apply or ask about one.',
    keywords: 'job openings hiring vacancies careers positions roles apply remote hybrid salary employer company work',
    shape: `{
  title?: string
  jobs: {
    title: string
    company: string
    logo?: image               // a square logo reads best
    location?: string
    remote?: "remote" | "hybrid" | "onsite"
    salary?: string            // as published; an estimate starts "est."
    type?: "full-time" | "part-time" | "contract" | "internship"
    posted?: date
    url?: url                  // the posting, or the company's jobs page
    tags?: string[]
    summary?: md
    why?: md                   // why it fits the person asking
  }[]
}`,
    example: {
      title: 'Senior front-end roles: remote or in New York',
      jobs: [
        {
          title: 'Senior Frontend Engineer, Plan',
          company: 'GitLab',
          logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/GitLab_icon.svg/120px-GitLab_icon.svg.png',
          location: 'Anywhere in the Americas',
          remote: 'remote',
          salary: 'est. $140k–185k',
          type: 'full-time',
          posted: '2026-11-05',
          url: 'https://about.gitlab.com/jobs/all-jobs/',
          tags: ['Vue', 'GraphQL', 'TypeScript'],
          summary: 'The issue boards and planning tools teams run their work in. Everything at GitLab is written down, and you set your own hours.',
          why: 'Fully remote, as you asked. The front end is Vue rather than React, which most React developers pick up in a few weeks.',
        },
        {
          title: 'Senior Web Engineer, Spotify for Artists',
          company: 'Spotify',
          logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Spotify_icon.svg/120px-Spotify_icon.svg.png',
          location: 'New York',
          remote: 'hybrid',
          salary: 'est. $170k–220k',
          type: 'full-time',
          posted: '2026-11-06',
          url: 'https://www.lifeatspotify.com/jobs',
          tags: ['React', 'TypeScript', 'Charts'],
          summary: 'The web app musicians use to see who listens and plan their releases: audience charts, maps and release tools.',
          why: 'Your chart work fits its audience pages, and it is React all the way through.',
        },
        {
          title: 'Senior Developer, Checkout',
          company: 'Shopify',
          location: 'Remote, US or Canada',
          remote: 'remote',
          salary: 'est. $150k–200k',
          type: 'full-time',
          posted: '2026-11-02',
          url: 'https://www.shopify.com/careers',
          tags: ['React', 'Performance', 'Accessibility'],
          summary: 'The checkout millions of shops share, where every millisecond and every accessibility fix shows up in sales.',
        },
        {
          title: 'Frontend Engineer, Games (six months)',
          company: 'The New York Times',
          logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/New_York_Times_T_icon.svg/120px-New_York_Times_T_icon.svg.png',
          location: 'New York',
          remote: 'hybrid',
          salary: 'est. $85–110 an hour',
          type: 'contract',
          posted: '2026-10-30',
          url: 'https://www.nytco.com/careers/',
          tags: ['React', 'Animation'],
          summary: 'Build a new daily puzzle with the Games team, from the first prototype to launch.',
          why: 'Short and creative, and it starts in December, when you said you would be free.',
        },
        {
          title: 'Senior Software Engineer, Terminal Web',
          company: 'Bloomberg',
          location: 'New York (Midtown)',
          remote: 'onsite',
          salary: 'est. $180k–240k',
          type: 'full-time',
          posted: '2026-10-21',
          url: 'https://www.bloomberg.com/company/careers/',
          tags: ['TypeScript', 'Live data'],
          summary: 'The screens traders read all day: live prices, charts and news, where speed and density matter more than looks.',
        },
      ],
    },
  },
];
