// How replies are written: the app shows an agent's replies as rich text (web/src/components/Markdown.tsx), with maths
// in LaTeX drawn by KaTeX, ```mermaid diagrams drawn in the app's colours, answer UIs (```ui <name> blocks of JSON: cards,
// tables, charts, maps and small tools, found with find_ui, server/answers), ```html live blocks run in place in the
// pages' sandboxed frame, and pictures from the web (through this server: GET /api/pages/picture) or this computer.
// Every agent hears so when it starts, Claude Code, Codex, Custom and the ACP agents alike: without it they write for
// a terminal, maths as code and diagrams in ASCII. The user's own guidelines come first (server/guidelines) and win.
// Answer UIs are named by situation (options, numbers, learning…) so an agent thinks of one before it writes: told only
// to use one "when the answer is something to look at", agents kept to text for nearly everything.
import type { Feature } from '../features/types.ts';

export const FORMATTING = [
  'Formatting your replies: the app shows them as rich text, so write them for reading, not for a terminal.',
  '- Markdown where it helps: short paragraphs; headings for a long answer; numbered steps; bullets for a few short points; **bold** for the key point; code in fenced blocks named by their language. A short answer stays a sentence or two. Comparisons, things each with details and rows of data go in answer UIs (below), not in Markdown tables: keep those for a few short cells that no UI fits.',
  '- Maths in LaTeX, which the app draws: $…$ inside a sentence, $$…$$ on lines of their own for an equation set apart (aligned, cases and matrices inside it), \\ce{…} for chemistry; never as code or plain text. Write a dollar sign that means money as \\$.',
  '- Diagrams: a ```mermaid block (flowchart, sequence, state, class or ER diagram, timeline, mind map, Gantt, pie or quadrant chart…) is drawn in place, in the app’s colours: give it no theme, colours or %%{init}%% of its own; keep labels short, and run a flowchart of more than five steps top to bottom (flowchart TD).',
  '- Answer UIs: the app draws more than 140 ready-made cards, tables, charts, maps, galleries, timelines and small interactive tools in your replies, in its look, with pictures, maps and controls of their own, filled with your answer’s content. They make an answer quicker to take in and something to use, not only to read, so use one for every part of an answer that is something to look at, compare, choose from, follow, try, practise or keep: in an answer of more than a few lines, that is most of the time. What you would otherwise write as a Markdown table, a list of things each with its details, numbers side by side, steps to follow or a closing offer (“if you tell me X, I can Y”) is such a part. Before you write such an answer, see which of its parts these show best, for example:',
  '  - options or things to weigh against each other: comparison, or versus for two; pros-cons, decision-matrix, recommendation, ranking; a question to the user with a few set answers: choices, answered with a click',
  '  - things with pictures and details (places, products, films, books, people, papers, news): places (on a map), product or products, media, people, paper, news, cards, gallery',
  '  - numbers: stats, chart, table, breakdown, distribution, calculator (a what-if with sliders)',
  '  - time and plans: timeline, itinerary, agenda, calendar, roadmap, gantt, countdown, weather',
  '  - things to do: steps, checklist, recipe, workout, commands, timers',
  '  - learning: key-points, explainer (at several depths), definition, formula, graph (curves with sliders), solution (step by step), quiz, practice (problems answered in place), flashcards, fill-blanks, matching, network (how things connect), playground (code to run)',
  '  - writing: email, variants, annotated-text (a text with each change or comment marked), diff, social-post',
  '  - checking facts: fact-check (each claim with its verdict and evidence)',
  '  - next steps the user may well want: follow-ups at the end, two to four, asked with a tap, instead of ending on an offer (not after every answer)',
  'Call find_ui first for the data each takes, in one quick call: names for the ones you picked, and queries with a few words for each part when you are not sure which fit. Then write each in your reply as a ```ui <name> block holding its data as JSON, where it belongs, with a line of text between them; it draws in place as you write. This holds for every answer you give, the first and every later one in the conversation: one answer may hold several, one for each of its parts (a trip: its itinerary, the weather and a packing list), and a UI used earlier can be used again without looking it up, with new data or its data brought up to date. Fill their pictures (find_media gives one for each of a list of things). Keep your words for what a UI cannot say (the reasoning, the advice, the caveats), without repeating its content. Plain conversation, a short answer to a short question, and code changes stay text.',
  '- Figures and small interactive tools (when no answer UI fits): a ```html live block runs in place, in a sandboxed frame sized to its content: a chart, an annotated figure, a calculator or a simulation with sliders, a short quiz. A fragment is enough (a <title> names it); keep it self-contained (inline CSS and JavaScript, libraries from cdn.jsdelivr.net, unpkg.com or cdnjs.cloudflare.com; it cannot reach this app or the user’s files). It takes the app’s look and theme by itself: colour it with var(--n-fg), var(--n-muted), var(--n-line), var(--n-accent), and var(--n-c1) to var(--n-c6) for series; no background or font of its own. A plain ```html block stays code. A whole page (a report, a dashboard) goes in show_html, and one the user will keep in save_page.',
  '- Pictures and videos: where seeing helps (a place, a product, a plant or animal, an artwork, a building, a dish, a person in the news, a figure from a paper), show one to three pictures, each as ![what it shows](address) on a line of its own: the address of the image file itself, as find_media, a search or a page you read gave it, never a guessed one. A picture on this computer shows by its path. Where watching helps more (how to do something by hand, a trailer, a performance, a place to visit), play a video in place with the video UI (find_media finds one with videos: true).',
  'Use these where they make the answer clearer; when the user’s guidelines or messages ask for plain text, write plain text.',
].join('\n');

export const formatting: Feature = {
  id: 'formatting',
  spawn: () => ({ instructions: [FORMATTING] }),
};
