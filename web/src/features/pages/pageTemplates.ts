// Pages to start from in New (Notion's templates): meeting notes, a project plan, a wiki, a journal, a reading list, a trip
// plan and a habit tracker, made of the page editor's blocks (headings, to-dos, callouts, toggles, a table of contents)
// and its databases (a board, a calendar, a gallery, a timeline, a sum under a column), so everything in them is changed
// in Edit as anything the editor makes. Their words are English, as a page's own words are the person's.
import type { Starter } from './templates';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const page = (title: string, icon: string, cover: string, body: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>\nbody{max-width:760px;margin:0 auto}\n</style>\n</head>\n<body class="n-page">\n<div class="n-cover" style="background-image:${cover}"></div>\n<div class="n-icon">${icon}</div>\n<h1>${esc(title)}</h1>\n${body}\n</body>\n</html>\n`;
/** A database, its first columns, rows and view (its rows then live in the page's data). */
const db = (name: string, title: string, schema: Record<string, unknown>) => `<div class="n-db" data-db="${name}" data-title="${esc(title)}" data-schema="${esc(JSON.stringify(schema))}"></div>`;
const todo = (...items: string[]) => `<ul class="n-todo">${items.map((t) => `<li><input type="checkbox"><span>${t}</span></li>`).join('')}</ul>`;
const callout = (icon: string, words: string) => `<div class="n-callout"><span class="n-callout-icon">${icon}</span><div class="n-callout-text">${words}</div></div>`;
const toggle = (title: string, inner: string) => `<details class="n-toggle" open><summary>${title}</summary>${inner}</details>`;
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export const PAGE_TEMPLATES: Starter[] = [
  {
    id: 'meeting',
    label: 'Meeting notes',
    hint: 'Who came, the agenda, what was decided and who does what',
    title: 'Meeting notes',
    html: (t) =>
      page(
        t,
        '🗓️',
        'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
        `<p><strong>Date:</strong> ${today()} · <strong>Who:</strong> </p>\n<h2>Agenda</h2>\n<ol><li>Where we are</li><li>What is in the way</li><li>Next steps</li></ol>\n<h2>Notes</h2>\n<p><br></p>\n<h2>Decisions</h2>\n<ul><li><br></li></ul>\n<h2>Action items</h2>\n${todo('Someone does something by Friday', 'Send these notes around')}\n${callout('✨', 'Pick these notes and press Ctrl+J, then <em>Find action items</em> or <em>Summarize</em>: the AI writes them for you.')}`,
      ),
  },
  {
    id: 'project',
    label: 'Project plan',
    hint: 'Goals, milestones, and tasks on a board and a timeline',
    title: 'Project plan',
    html: (t) =>
      page(
        t,
        '🚀',
        'linear-gradient(135deg,#667eea,#764ba2)',
        `${callout('🎯', '<strong>Goal:</strong> what this project is for, in one sentence.')}\n<h2>Milestones</h2>\n${todo('Plan agreed', 'First version out', 'Launch')}\n<h2>Tasks</h2>\n${db('tasks', 'Tasks', {
          cols: [
            { name: 'Task' },
            { name: 'Status', kind: 'select', options: [{ name: 'To do', color: 'grey' }, { name: 'Doing', color: 'blue' }, { name: 'Done', color: 'green' }] },
            { name: 'Owner' },
            { name: 'Start', kind: 'date' },
            { name: 'Due', kind: 'date' },
          ],
          rows: [
            { Task: 'Write the brief', Status: 'Done', Start: inDays(-6), Due: inDays(-3) },
            { Task: 'Design', Status: 'Doing', Start: inDays(-2), Due: inDays(5) },
            { Task: 'Build', Status: 'To do', Start: inDays(4), Due: inDays(18) },
            { Task: 'Test and launch', Status: 'To do', Start: inDays(17), Due: inDays(24) },
          ],
          view: 'board',
          group: 'Status',
          start: 'Start',
          end: 'Due',
        })}\n<h2>Risks</h2>\n<ul><li><br></li></ul>`,
      ),
  },
  {
    id: 'wiki',
    label: 'Wiki',
    hint: 'A home for what a team knows, with its contents on top',
    title: 'Team wiki',
    html: (t) =>
      page(
        t,
        '📚',
        'linear-gradient(135deg,#d4fc79,#96e6a1)',
        `<nav class="n-toc"></nav>\n${callout('👋', 'Start here: what this team does, and where to find things.')}\n<h2>How we work</h2>\n<p>The way we plan, meet and decide.</p>\n<h2>Who is who</h2>\n${db('people', 'People', {
          cols: [{ name: 'Name' }, { name: 'Role' }, { name: 'Email', kind: 'email' }, { name: 'Phone', kind: 'phone' }],
          rows: [{ Name: 'Ana', Role: 'Lead' }, { Name: 'Bo', Role: 'Design' }],
        })}\n<h2>Questions people ask</h2>\n${toggle('Where are the files?', '<p>In the shared folder.</p>')}\n${toggle('Who do I ask about money?', '<p>Ana.</p>')}`,
      ),
  },
  {
    id: 'journal',
    label: 'Journal',
    hint: 'An entry a day on a calendar, each its own page',
    title: 'Journal',
    html: (t) =>
      page(
        t,
        '📔',
        'linear-gradient(135deg,#fbc2eb,#a6c1ee)',
        `<p class="n-muted">Click a day to write in it: each entry opens as a page of its own.</p>\n${db('entries', 'Entries', {
          cols: [
            { name: 'Entry' },
            { name: 'Date', kind: 'date' },
            { name: 'Mood', kind: 'select', options: [{ name: 'Great', color: 'green' }, { name: 'Fine', color: 'blue' }, { name: 'Low', color: 'grey' }] },
            { name: 'Written', kind: 'created' },
          ],
          rows: [{ Entry: 'First day', Date: today(), Mood: 'Great', page: 'What happened today, and what I want to remember.' }],
          view: 'calendar',
          dateCol: 'Date',
        })}`,
      ),
  },
  {
    id: 'reading',
    label: 'Reading list',
    hint: 'Books with their covers, status and rating',
    title: 'Reading list',
    html: (t) =>
      page(
        t,
        '📖',
        'linear-gradient(135deg,#f6d365,#fda085)',
        `${db('books', 'Books', {
          cols: [
            { name: 'Title' },
            { name: 'Author' },
            { name: 'Status', kind: 'select', options: [{ name: 'To read', color: 'grey' }, { name: 'Reading', color: 'blue' }, { name: 'Read', color: 'green' }] },
            { name: 'Rating', kind: 'select', options: ['★', '★★', '★★★', '★★★★', '★★★★★'] },
            { name: 'Cover', kind: 'files' },
            { name: 'Finished', kind: 'date' },
          ],
          rows: [
            { Title: 'The first book', Author: 'Someone', Status: 'Reading' },
            { Title: 'The next one', Author: 'Someone else', Status: 'To read' },
          ],
          view: 'gallery',
          cover: 'Cover',
        })}\n<h2>Quotes I liked</h2>\n<blockquote>Write them here.</blockquote>`,
      ),
  },
  {
    id: 'trip',
    label: 'Trip plan',
    hint: 'Days on a calendar, what to pack, and a budget that adds up',
    title: 'Trip plan',
    html: (t) =>
      page(
        t,
        '✈️',
        'linear-gradient(135deg,#89f7fe,#66a6ff)',
        `<h2>Plan</h2>\n${db('days', 'Days', {
          cols: [{ name: 'What' }, { name: 'Day', kind: 'date' }, { name: 'Where' }, { name: 'Booked', kind: 'check' }, { name: 'Link', kind: 'link' }],
          rows: [{ What: 'Flight out', Day: inDays(30), Booked: true }, { What: 'Old town walk', Day: inDays(31) }, { What: 'Flight back', Day: inDays(35) }],
          view: 'calendar',
          dateCol: 'Day',
        })}\n<h2>Packing</h2>\n${todo('Passport', 'Chargers', 'Comfortable shoes')}\n<h2>Budget</h2>\n${db('budget', 'Budget', {
          cols: [{ name: 'Item' }, { name: 'Cost', kind: 'number' }, { name: 'Paid', kind: 'check' }],
          rows: [{ Item: 'Flights', Cost: 240, Paid: true }, { Item: 'Hotel', Cost: 420 }, { Item: 'Food', Cost: 200 }],
          calc: { Cost: 'sum', Paid: 'pctChecked' },
        })}`,
      ),
  },
  {
    id: 'habits',
    label: 'Habit tracker',
    hint: 'A row a day, a box for each habit, a score worked out',
    title: 'Habit tracker',
    html: (t) =>
      page(
        t,
        '✅',
        'linear-gradient(135deg,#d4fc79,#96e6a1)',
        `${db('habits', 'Days', {
          cols: [
            { name: 'Day', kind: 'date' },
            { name: 'Exercise', kind: 'check' },
            { name: 'Read', kind: 'check' },
            { name: 'Water', kind: 'check' },
            { name: 'Score', kind: 'formula', formula: 'round((toNumber(prop("Exercise")) + toNumber(prop("Read")) + toNumber(prop("Water"))) / 3 * 100) + "%"' },
          ],
          rows: [{ Day: inDays(-1), Exercise: true, Read: true }, { Day: today() }],
          calc: { Exercise: 'pctChecked', Read: 'pctChecked', Water: 'pctChecked' },
          sort: { col: 'Day', dir: 'desc' },
        })}\n${callout('💡', 'New adds today’s row; tick what you did. The footer shows how often you kept each habit.')}`,
      ),
  },
];
