// Answer UIs for money: stock quotes, loans, budgets, savings growth, pricing plans, splitting a bill.
import type { AnswerUiSpec } from './types.ts';

export const MONEY: AnswerUiSpec[] = [
  {
    id: 'stock',
    title: 'Stock quote',
    group: 'money',
    use: 'A share, fund or coin: its price and change, the day’s and 52-week ranges, a price chart with a range switch, key figures and headlines.',
    keywords: 'stock quote share price ticker market chart etf fund crypto index investing earnings',
    shape: `{
  symbol: string               // "AAPL"
  name?: string
  exchange?: string            // "NASDAQ"
  price: number
  currency?: string            // "USD" unless set
  change?: number              // since the last close, in the currency
  change_pct?: number          // the same in % (1.2 for +1.2%)
  as_of?: datetime
  day?: { low: number, high: number }
  year?: { low: number, high: number }   // the 52-week range
  history?: { date: date, close: number }[]   // oldest first; the chart's switch shows its last 1M, 6M, 1Y or all of it
  stats?: { label: string, value: string | number }[]   // market cap, P/E, dividend yield…
  news?: { title: string, url?: url, source?: string, date?: date }[]
}`,
    example: {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchange: 'NASDAQ',
      price: 281.36,
      currency: 'USD',
      change: 2.75,
      change_pct: 0.99,
      as_of: '2026-11-06T16:00',
      day: { low: 277.85, high: 282.4 },
      year: { low: 228.94, high: 291.47 },
      history: [
        { date: '2025-11-07', close: 268.5 }, { date: '2025-11-14', close: 263.89 }, { date: '2025-11-21', close: 266.15 },
        { date: '2025-11-28', close: 270.91 }, { date: '2025-12-05', close: 274.64 }, { date: '2025-12-12', close: 270.59 },
        { date: '2025-12-19', close: 268.65 }, { date: '2025-12-26', close: 257.49 }, { date: '2026-01-02', close: 254.18 },
        { date: '2026-01-09', close: 249.75 }, { date: '2026-01-16', close: 242.07 }, { date: '2026-01-23', close: 245.77 },
        { date: '2026-01-30', close: 247.58 }, { date: '2026-02-06', close: 248.04 }, { date: '2026-02-13', close: 257.98 },
        { date: '2026-02-20', close: 263.66 }, { date: '2026-02-27', close: 262.49 }, { date: '2026-03-06', close: 256.96 },
        { date: '2026-03-13', close: 264.08 }, { date: '2026-03-20', close: 255.1 }, { date: '2026-03-27', close: 244.39 },
        { date: '2026-04-03', close: 237.56 }, { date: '2026-04-10', close: 233.31 }, { date: '2026-04-17', close: 236.59 },
        { date: '2026-04-24', close: 235.24 }, { date: '2026-05-01', close: 240.59 }, { date: '2026-05-08', close: 247.39 },
        { date: '2026-05-15', close: 253.42 }, { date: '2026-05-22', close: 259.89 }, { date: '2026-05-29', close: 258.55 },
        { date: '2026-06-05', close: 263.06 }, { date: '2026-06-12', close: 266.44 }, { date: '2026-06-19', close: 262.71 },
        { date: '2026-06-26', close: 259.4 }, { date: '2026-07-03', close: 253 }, { date: '2026-07-10', close: 260.94 },
        { date: '2026-07-17', close: 260.1 }, { date: '2026-07-24', close: 268.94 }, { date: '2026-07-31', close: 262.48 },
        { date: '2026-08-07', close: 259.07 }, { date: '2026-08-14', close: 270.44 }, { date: '2026-08-21', close: 270.67 },
        { date: '2026-08-28', close: 268.15 }, { date: '2026-09-04', close: 270.98 }, { date: '2026-09-11', close: 257.06 },
        { date: '2026-09-18', close: 269.59 }, { date: '2026-09-25', close: 278.96 }, { date: '2026-10-02', close: 288.3 },
        { date: '2026-10-09', close: 283.62 }, { date: '2026-10-12', close: 282.01 }, { date: '2026-10-13', close: 280.62 },
        { date: '2026-10-14', close: 280.99 }, { date: '2026-10-15', close: 282.81 }, { date: '2026-10-16', close: 283.87 },
        { date: '2026-10-19', close: 281.56 }, { date: '2026-10-20', close: 279.72 }, { date: '2026-10-21', close: 282.9 },
        { date: '2026-10-22', close: 278.9 }, { date: '2026-10-23', close: 276.27 }, { date: '2026-10-26', close: 280.09 },
        { date: '2026-10-27', close: 278.38 }, { date: '2026-10-28', close: 276.15 }, { date: '2026-10-29', close: 275.76 },
        { date: '2026-10-30', close: 276.76 }, { date: '2026-11-02', close: 279.1 }, { date: '2026-11-03', close: 277.61 },
        { date: '2026-11-04', close: 276.35 }, { date: '2026-11-05', close: 278.61 }, { date: '2026-11-06', close: 281.36 },
      ],
      stats: [
        { label: 'Market cap', value: '$4.18T' },
        { label: 'P/E ratio', value: 35.6 },
        { label: 'Earnings per share', value: '$7.90' },
        { label: 'Dividend yield', value: '0.37%' },
        { label: 'Volume', value: '42.6M' },
        { label: 'Next earnings', value: '29 Jan 2027' },
      ],
      news: [
        { title: 'Apple sets the date for its holiday-quarter results', source: 'Reuters', date: '2026-11-05' },
        { title: 'Analysts weigh iPhone demand ahead of the holiday season', source: 'Bloomberg', date: '2026-11-04' },
        { title: 'Apple brings its self-service repair program to more countries', source: 'The Verge', date: '2026-11-02' },
      ],
    },
  },
  {
    id: 'loan',
    title: 'Loan calculator',
    group: 'money',
    use: 'A loan or mortgage with sliders for amount, rate, years and extra payments: the monthly payment, total interest, a balance chart and a yearly table.',
    keywords: 'loan mortgage calculator monthly payment amortization interest principal schedule extra payments car loan',
    shape: `{
  title?: string
  principal: number            // the amount borrowed
  rate: number                 // the yearly interest in % (6.25)
  years: number
  extra?: number               // paid on top each month
  currency?: string            // "USD" unless set
  start?: string               // "YYYY-MM": the month of the first payment
  note?: md
}`,
    example: {
      title: 'A mortgage on a $525,000 house, 20% down',
      principal: 420000,
      rate: 6.25,
      years: 30,
      extra: 200,
      currency: 'USD',
      start: '2027-01',
      note: 'Paying $200 more each month ends it about five years sooner and saves over $100,000 in interest.',
    },
  },
  {
    id: 'budget',
    title: 'Budget',
    group: 'money',
    use: 'Income against spending for a month or a year: spending by category, what is left over and the savings rate.',
    keywords: 'budget monthly spending expenses income savings rate categories money plan household finances left over',
    shape: `{
  title?: string
  period?: string              // "November 2026", "a month"
  currency?: string            // "USD" unless set
  income: { name: string, amount: number }[]
  expenses: { name: string, amount: number, category?: string, note?: string }[]
  goal?: md                    // what the budget aims at
}`,
    example: {
      title: 'Our monthly budget',
      period: 'November 2026',
      currency: 'USD',
      income: [
        { name: 'Salary, after tax', amount: 4850 },
        { name: 'Tutoring', amount: 400 },
      ],
      expenses: [
        { name: 'Rent', amount: 1650, category: 'Housing' },
        { name: 'Utilities and internet', amount: 180, category: 'Housing' },
        { name: 'Groceries', amount: 520, category: 'Food' },
        { name: 'Eating out', amount: 240, category: 'Food' },
        { name: 'Student loan', amount: 380, category: 'Debt' },
        { name: 'Car insurance', amount: 110, category: 'Transport' },
        { name: 'Transit pass', amount: 90, category: 'Transport' },
        { name: 'Gifts', amount: 120, category: 'Fun', note: 'Two birthdays this month' },
        { name: 'Streaming', amount: 32, category: 'Fun' },
        { name: 'Phone', amount: 45, category: 'Bills' },
        { name: 'Gym', amount: 40, category: 'Health' },
      ],
      goal: 'Save **$1,500** a month toward a house deposit.',
    },
  },
  {
    id: 'savings',
    title: 'Savings growth',
    group: 'money',
    use: 'Compound growth to play with: sliders for the starting sum, monthly deposits, yearly return and years; deposits against growth, year by year.',
    keywords: 'savings compound interest growth investing retirement calculator deposits return future value inflation',
    shape: `{
  title?: string
  initial: number              // what there is at the start
  monthly?: number             // added each month
  rate: number                 // the yearly return in %
  years: number
  currency?: string            // "USD" unless set
  inflation?: number           // yearly in %: the end sum is also shown in today's money
  note?: md
}`,
    example: {
      title: 'Investing $500 a month for 30 years',
      initial: 10000,
      monthly: 500,
      rate: 7,
      years: 30,
      currency: 'USD',
      inflation: 2.5,
      note: 'About 7% a year is what a world stock index has returned over the long run, before inflation; some years lose money.',
    },
  },
  {
    id: 'pricing',
    title: 'Pricing plans',
    group: 'money',
    use: 'Plans side by side as cards: the price, what each includes, the recommended one marked, and a switch between monthly and yearly billing.',
    keywords: 'pricing plans tiers subscription monthly yearly billing features free pro team compare cost',
    shape: `{
  title?: string
  currency?: string            // "USD" unless set
  plans: {
    name: string
    price: number | string     // a month ("Free", "Custom" as words)
    yearly?: number            // the price of a whole year, paid yearly
    period?: string            // what the price is for ("per person / month")
    description?: md
    features: (string | { text: string, included: boolean })[]
    cta?: string               // the button's words
    url?: url
    highlight?: boolean        // the recommended plan
    badge?: string             // "Most popular"
  }[]
  note?: md
}`,
    example: {
      title: 'Fieldnote plans',
      currency: 'USD',
      plans: [
        {
          name: 'Free',
          price: 0,
          description: 'For trying it out on your own.',
          features: ['Up to 3 notebooks', '1 GB of attachments', 'Sync on 2 devices', { text: 'Offline access', included: false }, { text: 'Version history', included: false }],
          cta: 'Start free',
        },
        {
          name: 'Pro',
          price: 10,
          yearly: 96,
          description: 'For your own work, without limits.',
          features: ['Unlimited notebooks', '50 GB of attachments', 'Sync on all your devices', 'Offline access', '30 days of version history'],
          cta: 'Try Pro free for 14 days',
          highlight: true,
          badge: 'Most popular',
        },
        {
          name: 'Team',
          price: 18,
          yearly: 168,
          period: 'per person / month',
          description: 'Shared notebooks for teams of three or more.',
          features: ['Everything in Pro', 'Shared notebooks and comments', 'Admin controls and single sign-on', 'Unlimited version history', 'Priority support'],
          cta: 'Talk to us',
        },
      ],
      note: 'Prices before tax. Students get Pro for half price.',
    },
  },
  {
    id: 'split-bill',
    title: 'Split the bill',
    group: 'money',
    use: 'A shared bill split fairly: each person pays for what they had, with tax and a tip slider, and sees what they owe whoever paid.',
    keywords: 'split bill restaurant dinner share costs who owes tip tax calculator group expenses friends',
    shape: `{
  title?: string
  currency?: string            // "USD" unless set
  people: string[]
  items: { name: string, price: number, who?: string[] }[]   // who shared it (everyone unless set)
  tax?: number                 // % on the items
  tip?: number                 // % of the items before tax; the user can change it
  paid_by?: string             // who paid the bill: the others owe them
}`,
    example: {
      title: 'Dinner at Taverna Kriti',
      currency: 'USD',
      people: ['Chris', 'Maria', 'Nikos', 'Eleni'],
      items: [
        { name: 'Grilled octopus', price: 24, who: ['Chris', 'Maria'] },
        { name: 'Horiatiki salad', price: 16 },
        { name: 'Spanakopita', price: 14, who: ['Maria', 'Eleni'] },
        { name: 'Lamb kleftiko', price: 34, who: ['Chris'] },
        { name: 'Moussaka', price: 26, who: ['Nikos'] },
        { name: 'Sea bass', price: 38, who: ['Eleni'] },
        { name: 'Bottle of Assyrtiko', price: 58, who: ['Chris', 'Maria', 'Eleni'] },
        { name: 'Baklava', price: 12 },
      ],
      tax: 7,
      tip: 18,
      paid_by: 'Maria',
    },
  },
  {
    id: 'portfolio',
    title: 'Investment portfolio',
    group: 'money',
    use: 'Investments at a glance: total value, gain or loss overall and today, allocation by kind or by holding, and each holding with its weight, sortable.',
    keywords: 'portfolio investments holdings allocation stocks bonds etfs crypto gains losses net worth brokerage account asset mix diversification rebalance',
    shape: `{
  title?: string
  currency?: string            // "USD" unless set
  as_of?: date
  holdings: {
    name: string
    symbol?: string            // "VTI"
    kind?: string              // "stock", "bond", "fund", "cash", "crypto"…: the allocation by kind groups by it
    value: number              // what it is worth now, in the currency
    cost?: number              // what was paid for it in all: its gain is value − cost
    change_pct?: number        // today's change in % (1.2 for +1.2%)
  }[]
  note?: md
}`,
    example: {
      title: 'Brokerage and retirement accounts',
      currency: 'USD',
      as_of: '2026-11-06',
      holdings: [
        { name: 'Vanguard Total Stock Market ETF', symbol: 'VTI', kind: 'fund', value: 48620, cost: 39800, change_pct: 0.42 },
        { name: 'Vanguard Total International Stock ETF', symbol: 'VXUS', kind: 'fund', value: 21340, cost: 19950, change_pct: 0.18 },
        { name: 'Vanguard Total Bond Market ETF', symbol: 'BND', kind: 'bond', value: 18210, cost: 18900, change_pct: -0.12 },
        { name: 'US Treasury bills, 6 months', kind: 'bond', value: 10000, cost: 9760, change_pct: 0.01 },
        { name: 'Apple', symbol: 'AAPL', kind: 'stock', value: 9848, cost: 6120, change_pct: 0.99 },
        { name: 'Microsoft', symbol: 'MSFT', kind: 'stock', value: 8920, cost: 7410, change_pct: -0.35 },
        { name: 'NVIDIA', symbol: 'NVDA', kind: 'stock', value: 7480, cost: 3260, change_pct: 1.84 },
        { name: 'Bitcoin', symbol: 'BTC', kind: 'crypto', value: 4310, cost: 5050, change_pct: -2.6 },
        { name: 'Cash', kind: 'cash', value: 6500 },
      ],
      note: 'Stocks and stock funds are **71%** of it, above the 60% you aimed for: moving about $15,000 into bonds would bring it back.',
    },
  },
];
