// The built-in templates the gallery shows beside your own apps. Each runs as it is (with the agent
// and model picked on its page) or starts an app of your own. Prompts say how to work, not only what
// to make, and every template has answer fields, so its result comes back as a card or a table.
import type { AppTemplate } from '../../shared/apps.ts';
import { cleanRecipe } from '../../shared/apps.ts';

type Draft = Omit<AppTemplate, 'agent' | 'tools' | 'limits'>;

const T: Draft[] = [
  {
    id: 'deep-research',
    name: 'Deep research report',
    icon: 'telescope',
    color: 'violet',
    category: 'Research',
    description: 'A sourced report on any question: the web searched, facts cross-checked, every claim cited.',
    fields: [
      { id: 'topic', label: 'What should be researched?', type: 'long', required: true, placeholder: 'e.g. How well do heat pumps work in cold climates, and what do they cost to run compared with gas?' },
      { id: 'focus', label: 'Focus on, or leave out', type: 'text', placeholder: 'e.g. Only studies from the last five years' },
      { id: 'depth', label: 'Depth', type: 'choice', options: ['Quick overview', 'Thorough', 'Exhaustive'], default: 'Thorough' },
      { id: 'audience', label: 'Written for', type: 'choice', options: ['Anyone', 'Experts', 'Decision makers'], default: 'Anyone' },
    ],
    prompt: `Research the topic below and write a report I can rely on.

Topic: {{topic}}
{{#focus}}Focus: {{focus}}
{{/focus}}Depth: {{depth}}
Written for: {{audience}}

How to work:
1. Break the topic into the three to six questions a careful researcher would need answered.
2. Search the web for each one. Prefer primary sources (official statistics, papers, filings, documentation) and recent, reputable reporting. Open and read the pages you rely on; never cite a page from its search snippet alone.
3. Check every important fact against a second, independent source. Where sources disagree, say so and explain which is more credible and why.
4. Keep track of what stays uncertain, disputed or unknown instead of smoothing it over.

Then write the report in Markdown:
- Open with the answer in three to five sentences.
- Then the findings, one section per question, with numbered citations like [1] after the claims they support.
- Close with "Open questions" and the numbered list of sources (title, publisher, date, address).

Length: a quick overview is about 400 words, a thorough report about 1,200, an exhaustive one as long as it needs. Be concrete (numbers, dates, names) and leave out filler. Today is {{today}}.`,
    answer: [
      { id: 'summary', label: 'Summary', type: 'markdown', required: true, description: 'The answer in three to five sentences' },
      { id: 'key_findings', label: 'Key findings', type: 'list', required: true, description: 'The most important findings, one sentence each' },
      { id: 'report', label: 'Report', type: 'markdown', required: true, description: 'The full report in Markdown, with numbered citations' },
      {
        id: 'sources',
        label: 'Sources',
        type: 'table',
        required: true,
        columns: [
          { id: 'title', label: 'Title', type: 'text' },
          { id: 'publisher', label: 'Publisher', type: 'text' },
          { id: 'date', label: 'Date', type: 'text', description: 'When it was published, as precisely as known' },
          { id: 'url', label: 'Link', type: 'url' },
        ],
      },
      { id: 'confidence', label: 'Confidence', type: 'text', description: 'High, medium or low, with the reason in one sentence' },
    ],
  },
  {
    id: 'trip-planner',
    name: 'Trip planner',
    icon: 'plane',
    color: 'indigo',
    category: 'Planning',
    description: 'A day-by-day plan checked against your dates: opening hours, events, travel times, budget and what to book.',
    fields: [
      { id: 'destination', label: 'Where to', type: 'text', required: true, placeholder: 'e.g. Lisbon, or the west coast of Ireland' },
      { id: 'start', label: 'First day', type: 'date', required: true },
      { id: 'days', label: 'How many days', type: 'number', required: true, default: '4' },
      { id: 'travelers', label: 'Who’s going', type: 'text', placeholder: 'e.g. Two adults and a six-year-old' },
      { id: 'budget', label: 'Budget', type: 'text', placeholder: 'e.g. About €1,500 without flights' },
      { id: 'interests', label: 'What you enjoy', type: 'long', placeholder: 'Food markets, easy hikes, museums, no nightlife…' },
      { id: 'pace', label: 'Pace', type: 'choice', options: ['Relaxed', 'Balanced', 'Packed'], default: 'Balanced' },
    ],
    prompt: `Plan a {{days}}-day trip to {{destination}}, starting on {{start}}.
{{#travelers}}Travelers: {{travelers}}
{{/travelers}}{{#budget}}Budget: {{budget}}
{{/budget}}{{#interests}}What we enjoy: {{interests}}
{{/interests}}Pace: {{pace}}

Before planning, check what holds for these dates, on the web and from recent sources: the season and the usual weather, the opening days and hours of the places you suggest, closures and renovations, public holidays, and events or festivals during the stay.

Then make a day-by-day plan:
- Keep each day to one or two areas, so the distances are short; give rough travel times and how to get around (on foot, transit, car).
- Plan the meals too: a specific place or a good area to eat, within the budget.
- Match the pace: relaxed means two or three things a day with time to wander; packed fits more in.
- Suit the plan to the travelers (children, mobility, interests).
- Say what should be booked ahead, and how far ahead.

Finish with a budget estimate in the local currency (and in the travelers' own, if it is clearly a different one), and practical tips: getting in from the airport or station, transport passes, money, safety, and what to pack for the weather.`,
    answer: [
      { id: 'overview', label: 'Overview', type: 'markdown', required: true, description: 'The trip in a few sentences: the idea of the plan, where to stay, the weather to expect' },
      {
        id: 'days',
        label: 'Day by day',
        type: 'table',
        required: true,
        columns: [
          { id: 'day', label: 'Day', type: 'number' },
          { id: 'date', label: 'Date', type: 'date' },
          { id: 'area', label: 'Area', type: 'text' },
          { id: 'morning', label: 'Morning', type: 'text' },
          { id: 'afternoon', label: 'Afternoon', type: 'text' },
          { id: 'evening', label: 'Evening', type: 'text' },
        ],
      },
      { id: 'book_ahead', label: 'Book ahead', type: 'list', description: 'What to book, and how far ahead' },
      {
        id: 'budget',
        label: 'Budget',
        type: 'table',
        columns: [
          { id: 'item', label: 'Item', type: 'text' },
          { id: 'estimate', label: 'Estimate', type: 'text' },
        ],
      },
      { id: 'tips', label: 'Tips', type: 'list' },
    ],
  },
  {
    id: 'compare-products',
    name: 'Compare products',
    icon: 'scale',
    color: 'orange',
    category: 'Shopping',
    description: 'Current prices, independent reviews and known problems, weighed against what matters to you, with a clear pick.',
    fields: [
      { id: 'products', label: 'What to compare', type: 'long', required: true, placeholder: 'Name the products, one per line, or describe what you need: e.g. a quiet dishwasher under $900' },
      { id: 'needs', label: 'What matters to you', type: 'long', required: true, placeholder: 'e.g. Quiet, reliable, fits a 60 cm space, enough for a family of four' },
      { id: 'budget', label: 'Budget', type: 'text' },
      { id: 'region', label: 'Where you’ll buy', type: 'text', placeholder: 'e.g. Germany, or online in the US' },
    ],
    prompt: `Help me choose. Compare these products; or, if I described a need rather than naming products, find the three to five strongest current options for it:

{{products}}

What matters to me: {{needs}}
{{#budget}}Budget: {{budget}}
{{/budget}}{{#region}}Buying in: {{region}}
{{/region}}
For each product, find out on the web:
- the current price{{#region}} in {{region}}{{/region}}, from a real shop or the maker, with the date you saw it;
- the specifications that bear on what matters to me;
- what independent testers and long-term owners report: strengths, weaknesses, reliability and known problems;
- whether it is still sold, or about to be replaced by a newer model.

Prefer independent reviews to the makers' claims, and recent sources to old ones. Say when you could not confirm something.

Then compare them against what matters to me and recommend one, with a runner-up for a different priority (cheaper, or better at one thing). Be honest when the differences are small.`,
    answer: [
      { id: 'recommendation', label: 'Recommendation', type: 'text', required: true, description: 'The pick, in one sentence' },
      { id: 'why', label: 'Why', type: 'markdown', required: true, description: 'The reasoning, against what matters to the user, and the runner-up' },
      {
        id: 'comparison',
        label: 'Comparison',
        type: 'table',
        required: true,
        columns: [
          { id: 'product', label: 'Product', type: 'text' },
          { id: 'price', label: 'Price', type: 'text' },
          { id: 'strengths', label: 'Strengths', type: 'text' },
          { id: 'weaknesses', label: 'Weaknesses', type: 'text' },
          { id: 'best_for', label: 'Best for', type: 'text' },
          { id: 'link', label: 'Link', type: 'url' },
        ],
      },
      { id: 'watch_out', label: 'Watch out for', type: 'list' },
    ],
  },
  {
    id: 'document-qa',
    name: 'Document Q&A',
    icon: 'file-search',
    color: 'teal',
    category: 'Work',
    description: 'Answers from a document you give it, each with the exact passage and where it is.',
    fields: [
      { id: 'document', label: 'Document', type: 'file', required: true, help: 'A PDF, Word document, spreadsheet or text file' },
      { id: 'questions', label: 'Your questions', type: 'long', required: true, placeholder: 'One per line' },
    ],
    prompt: `Answer my questions about the attached document: {{document}}

Questions:
{{questions}}

Read the whole document before answering: all pages, tables and appendices. For each question:
- answer it from the document alone, plainly and briefly;
- quote the passage the answer rests on, word for word, and say where it is (page, section or clause);
- if the document does not answer it, say so. Don't fill the gap with outside knowledge or guesses.

Also say briefly what the document is and what its main points are.`,
    answer: [
      {
        id: 'answers',
        label: 'Answers',
        type: 'table',
        required: true,
        columns: [
          { id: 'question', label: 'Question', type: 'text' },
          { id: 'answer', label: 'Answer', type: 'text' },
          { id: 'quote', label: 'Quote', type: 'text' },
          { id: 'location', label: 'Where', type: 'text' },
        ],
      },
      { id: 'summary', label: 'About the document', type: 'markdown', required: true },
    ],
  },
  {
    id: 'meeting-actions',
    name: 'Meeting notes to actions',
    icon: 'list-checks',
    color: 'green',
    category: 'Work',
    description: 'Decisions, action items with owners and dates, open questions, and a follow-up email, from raw notes.',
    fields: [
      { id: 'notes', label: 'Notes or transcript', type: 'long', required: true, placeholder: 'Paste them here' },
      { id: 'meeting', label: 'Meeting', type: 'text', placeholder: 'e.g. Weekly product sync' },
      { id: 'date', label: 'Date', type: 'date' },
      { id: 'attendees', label: 'Who was there', type: 'text' },
    ],
    prompt: `Turn these meeting notes into decisions and actions.
{{#meeting}}Meeting: {{meeting}}
{{/meeting}}{{#date}}Date: {{date}}
{{/date}}{{#attendees}}Attendees: {{attendees}}
{{/attendees}}
Notes:
{{notes}}

Be faithful to the notes: add nothing that was not said. Then:
- Summarize the meeting in a few sentences.
- List each decision that was made.
- List each action item: the task, who owns it and when it is due. Name an owner only when the notes say or clearly imply who; otherwise leave it empty. Turn relative dates ("next Friday") into real dates{{#date}}, counting from {{date}}{{/date}}.
- List the open questions and anything left unresolved.
- Draft a short, friendly follow-up email to the attendees with the decisions and the actions.`,
    answer: [
      { id: 'summary', label: 'Summary', type: 'markdown', required: true },
      { id: 'decisions', label: 'Decisions', type: 'list' },
      {
        id: 'actions',
        label: 'Actions',
        type: 'table',
        required: true,
        columns: [
          { id: 'task', label: 'Task', type: 'text' },
          { id: 'owner', label: 'Owner', type: 'text' },
          { id: 'due', label: 'Due', type: 'date' },
          { id: 'notes', label: 'Notes', type: 'text' },
        ],
      },
      { id: 'open_questions', label: 'Open questions', type: 'list' },
      { id: 'email', label: 'Follow-up email', type: 'markdown' },
    ],
  },
  {
    id: 'cover-letter',
    name: 'Cover letter',
    icon: 'pen-line',
    color: 'pink',
    category: 'Writing',
    description: 'A letter for one job, built on real evidence from your background, with the gaps named honestly.',
    fields: [
      { id: 'job', label: 'The job', type: 'long', required: true, placeholder: 'Paste the posting, or its address' },
      { id: 'background', label: 'Your background', type: 'long', required: true, placeholder: 'Paste your CV, or a few lines about your experience' },
      { id: 'company', label: 'What you know about the company', type: 'long' },
      { id: 'tone', label: 'Tone', type: 'choice', options: ['Warm', 'Confident', 'Formal'], default: 'Confident' },
      { id: 'length', label: 'Length', type: 'choice', options: ['Short', 'Standard'], default: 'Standard', help: 'Short is about 200 words, standard about 350' },
    ],
    prompt: `Write a cover letter for this job.

The job:
{{job}}

My background:
{{background}}
{{#company}}
What I know about the company:
{{company}}
{{/company}}
Tone: {{tone}}. Length: {{length}} (short is about 200 words, standard about 350).

How to write it:
1. If the job is given as an address, open it and read the posting. Look the company up briefly too: what it does, and anything recent that shows why this role matters to it.
2. Pick the three or four requirements that matter most for this role.
3. Match each one to concrete evidence from my background: what I did, with numbers where there are some. Never invent or stretch experience; a requirement my background does not cover stays out of the letter and goes on the list of gaps.
4. Write the letter: an opening specific to this company and role (not "I am writing to express my interest"), one or two paragraphs of evidence, and a short close that asks for a conversation. Plain words, active voice, no clichés.`,
    answer: [
      { id: 'letter', label: 'Letter', type: 'markdown', required: true },
      { id: 'subject', label: 'Email subject line', type: 'text' },
      {
        id: 'matched',
        label: 'How you match',
        type: 'table',
        columns: [
          { id: 'requirement', label: 'Requirement', type: 'text' },
          { id: 'evidence', label: 'Your evidence', type: 'text' },
        ],
      },
      { id: 'gaps', label: 'Gaps', type: 'list', description: 'Requirements the background does not show, and how to address each in an interview' },
    ],
  },
  {
    id: 'lesson-plan',
    name: 'Lesson plan',
    icon: 'graduation-cap',
    color: 'amber',
    category: 'Learning',
    description: 'A timed lesson planned back from its goals: activities, checks for understanding, support and stretch.',
    fields: [
      { id: 'topic', label: 'Topic', type: 'text', required: true },
      { id: 'learners', label: 'Learners', type: 'text', required: true, placeholder: 'e.g. Year 7, or adult beginners' },
      { id: 'minutes', label: 'Length in minutes', type: 'number', required: true, default: '50' },
      { id: 'goals', label: 'What they should be able to do afterwards', type: 'long' },
      { id: 'setting', label: 'Setting', type: 'choice', options: ['Classroom', 'Online', 'One-to-one', 'Home school'], default: 'Classroom' },
      { id: 'materials', label: 'What you have to work with', type: 'text', placeholder: 'e.g. A projector, mini whiteboards, no devices' },
    ],
    prompt: `Plan a {{minutes}}-minute lesson on {{topic}} for {{learners}}. Setting: {{setting}}.
{{#goals}}By the end, they should be able to: {{goals}}
{{/goals}}{{#materials}}Available: {{materials}}
{{/materials}}
Plan it backwards from the goals:
- Two or three learning objectives, each something a learner can show, not "understand".
- How you will know they got there: success criteria, and a quick check at the end.
- A timeline whose minutes add up to exactly {{minutes}}: a hook to start, teaching, guided practice, independent practice and a wrap-up. For each step, what the teacher does and what the learners do.
- The misconceptions to expect, and how to address them.
- Support for those who struggle, and a stretch for those who are ahead.
- Every material needed, with worksheets or examples written out in full.

Keep it practical and pitched to the learners' age and level. Check any facts the topic rests on (dates, figures, science) before using them.`,
    answer: [
      { id: 'objectives', label: 'Objectives', type: 'list', required: true },
      {
        id: 'timeline',
        label: 'Timeline',
        type: 'table',
        required: true,
        columns: [
          { id: 'minutes', label: 'Minutes', type: 'number' },
          { id: 'activity', label: 'Activity', type: 'text' },
          { id: 'teacher', label: 'Teacher', type: 'text' },
          { id: 'learners', label: 'Learners', type: 'text' },
        ],
      },
      { id: 'materials', label: 'Materials', type: 'list' },
      { id: 'differentiation', label: 'Support and stretch', type: 'markdown' },
      { id: 'assessment', label: 'Checking understanding', type: 'markdown' },
      { id: 'plan', label: 'Full plan', type: 'markdown', required: true, description: 'The whole plan, ready to print' },
    ],
  },
  {
    id: 'news-digest',
    name: 'Weekly news digest',
    icon: 'newspaper',
    color: 'blue',
    category: 'Research',
    description: 'The past week on the topics you follow: original reporting only, duplicates merged, why each story matters.',
    fields: [
      { id: 'topics', label: 'Topics', type: 'long', required: true, placeholder: 'One per line, e.g. battery technology, EU AI rules, our competitors Acme and Globex' },
      { id: 'region', label: 'Region or language', type: 'text' },
      { id: 'skip', label: 'Leave out', type: 'text', placeholder: 'Subjects or sources to skip' },
      { id: 'length', label: 'Length', type: 'choice', options: ['Brief', 'Standard', 'Detailed'], default: 'Standard' },
    ],
    prompt: `Write my news digest for the week ending {{today}}: what happened in the past seven days on these topics.

Topics:
{{topics}}
{{#region}}Region or language: {{region}}
{{/region}}{{#skip}}Leave out: {{skip}}
{{/skip}}Length: {{length}} (brief is three or four stories, standard up to eight, detailed up to fifteen).

How to work:
- Search the news for each topic, limited to the past week. Check each story's date: nothing older than seven days.
- Prefer original reporting and primary sources (announcements, filings, papers) to aggregators and rewrites; merge coverage of the same event into one story.
- For each story: what happened, in two or three sentences, and why it matters.
- If a topic had no real news this week, say so instead of padding.`,
    answer: [
      { id: 'headline', label: 'The week in a sentence', type: 'text', required: true },
      {
        id: 'stories',
        label: 'Stories',
        type: 'table',
        required: true,
        columns: [
          { id: 'topic', label: 'Topic', type: 'text' },
          { id: 'title', label: 'Story', type: 'text' },
          { id: 'summary', label: 'What happened', type: 'text' },
          { id: 'why', label: 'Why it matters', type: 'text' },
          { id: 'date', label: 'Date', type: 'date' },
          { id: 'source', label: 'Source', type: 'text' },
          { id: 'url', label: 'Link', type: 'url' },
        ],
      },
      { id: 'digest', label: 'Digest', type: 'markdown', required: true, description: 'The whole digest, ready to read' },
    ],
  },
  {
    id: 'explain-contract',
    name: 'Explain a contract',
    icon: 'scroll-text',
    color: 'slate',
    category: 'Work',
    description: 'What an agreement really says, in plain words: key terms, dates, what is unusual, and what to ask before signing.',
    fields: [
      { id: 'contract', label: 'The contract', type: 'file', help: 'A PDF, Word document or text file' },
      { id: 'text', label: 'Or paste it here', type: 'long' },
      { id: 'side', label: 'Your side', type: 'text', placeholder: 'e.g. The tenant, the freelancer, the buyer' },
      { id: 'concerns', label: 'Anything you’re worried about', type: 'long' },
    ],
    prompt: `Explain this contract to me in plain language. I am not a lawyer.
{{#contract}}The contract is in this file: {{contract}}
{{/contract}}{{#text}}
The contract:
{{text}}
{{/text}}{{#side}}
I am {{side}}.
{{/side}}{{#concerns}}What I'm worried about: {{concerns}}
{{/concerns}}
Read all of it, including schedules and anything attached that it refers to. Then:
1. Say what kind of agreement it is, who the parties are, and what each one gives and gets, in a few sentences.
2. Go through the terms that matter: how long it runs and how it renews, money (amounts, when, penalties, increases), ending it (notice, fees), liability and indemnities, confidentiality, intellectual property, non-compete or exclusivity, and how disputes are settled. For each one, say what it means for me in practice, with the clause number.
3. List every date and deadline, and what happens on each.
4. Point out anything unusual, one-sided or risky compared with what is typical for this kind of agreement, how serious it is, and what I could ask to change.
5. Suggest questions to ask the other side before signing.

Quote the contract where the exact words matter, and be clear about what is uncertain. This is an explanation, not legal advice: for anything serious, say I should have a lawyer check it.`,
    answer: [
      { id: 'summary', label: 'In short', type: 'markdown', required: true },
      {
        id: 'terms',
        label: 'Key terms',
        type: 'table',
        required: true,
        columns: [
          { id: 'term', label: 'Term', type: 'text' },
          { id: 'meaning', label: 'What it means for you', type: 'text' },
          { id: 'clause', label: 'Clause', type: 'text' },
        ],
      },
      {
        id: 'dates',
        label: 'Dates and deadlines',
        type: 'table',
        columns: [
          { id: 'when', label: 'When', type: 'text' },
          { id: 'what', label: 'What happens', type: 'text' },
        ],
      },
      {
        id: 'red_flags',
        label: 'Watch out',
        type: 'table',
        columns: [
          { id: 'clause', label: 'Clause', type: 'text' },
          { id: 'issue', label: 'Issue', type: 'text' },
          { id: 'severity', label: 'How serious', type: 'text' },
          { id: 'ask', label: 'What to ask for', type: 'text' },
        ],
      },
      { id: 'questions', label: 'Questions to ask', type: 'list' },
    ],
  },
  {
    id: 'small-web-app',
    name: 'Build a small web app',
    icon: 'app-window',
    color: 'cyan',
    category: 'Build',
    description: 'A working app from a description: plain HTML, CSS and JavaScript that opens from a file, tested before it is handed over.',
    fields: [
      { id: 'idea', label: 'What should it do?', type: 'long', required: true, placeholder: 'e.g. A tracker for my plants: when I watered each one, and which are due' },
      { id: 'users', label: 'Who it’s for', type: 'text' },
      { id: 'features', label: 'Must-haves', type: 'long' },
      { id: 'style', label: 'Look and feel', type: 'text', placeholder: 'e.g. Calm and minimal, big buttons for a phone' },
    ],
    prompt: `Build a small web app in this folder.

What it should do: {{idea}}
{{#users}}Who it's for: {{users}}
{{/users}}{{#features}}Must-haves:
{{features}}
{{/features}}{{#style}}Look and feel: {{style}}
{{/style}}
Requirements:
- A static app that opens straight from index.html: plain HTML, CSS and JavaScript in a few files (index.html, style.css, app.js), no build step, nothing loaded from other sites.
- Works well on a phone and on a computer, in light and dark mode, and with the keyboard.
- Keeps its data in the browser (localStorage) when it has any, with a way to export it to a file and import it back.
- Clear, friendly wording, sensible empty states, and no placeholder text left in.

Work in steps: plan the screens and the data, build it, then check it: open the page (or serve the folder) and try every feature, with no data and with a lot. Fix what you find. Finish with a README.md that says what the app does and how to open it.`,
    answer: [
      { id: 'summary', label: 'What was built', type: 'markdown', required: true },
      { id: 'files', label: 'Files', type: 'list', required: true },
      { id: 'how_to_open', label: 'How to open it', type: 'text', required: true },
      { id: 'next', label: 'Ideas for next', type: 'list' },
    ],
  },
];

/** The templates, tidied like any recipe. They run with Claude Code unless their page picks another agent. */
export const TEMPLATES: AppTemplate[] = T.map((t) => ({ ...cleanRecipe({ ...t, agent: 'claude', tools: null, limits: {} }), id: t.id }));

export const templateById = (id: string): AppTemplate | null => TEMPLATES.find((t) => t.id === id) ?? null;
