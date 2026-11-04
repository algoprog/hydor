// How replies are written: the app shows an agent's replies as rich text (web/src/components/Markdown.tsx), with maths
// in LaTeX drawn by KaTeX, ```mermaid diagrams drawn in the app's colours, ```html live blocks run in place in the
// pages' sandboxed frame, and pictures from the web (through this server: GET /api/pages/picture) or this computer.
// Every agent hears so when it starts, Claude Code, Codex, Custom and the ACP agents alike: without it they write for
// a terminal, maths as code and diagrams in ASCII. The user's own guidelines come first (server/guidelines) and win.
import type { Feature } from '../features/types.ts';

export const FORMATTING = [
  'Formatting your replies: the app shows them as rich text, so write them for reading, not for a terminal.',
  '- Markdown where it helps: short paragraphs; headings for a long answer; numbered steps; bullets for options; a table to compare; **bold** for the key point; code in fenced blocks named by their language. A short answer stays a sentence or two.',
  '- Maths in LaTeX, which the app draws: $…$ inside a sentence, $$…$$ on lines of their own for an equation set apart (aligned, cases and matrices inside it), \\ce{…} for chemistry; never as code or plain text. Write a dollar sign that means money as \\$.',
  '- Diagrams: a ```mermaid block (flowchart, sequence, state, class or ER diagram, timeline, mind map, Gantt, pie or quadrant chart…) is drawn in place, in the app’s colours: give it no theme, colours or %%{init}%% of its own; keep labels short, and run a flowchart of more than five steps top to bottom (flowchart TD).',
  '- Figures and small interactive tools: a ```html live block runs in place, in a sandboxed frame sized to its content: a chart, an annotated figure, a calculator or a simulation with sliders, a short quiz. A fragment is enough (a <title> names it); keep it self-contained (inline CSS and JavaScript, libraries from cdn.jsdelivr.net, unpkg.com or cdnjs.cloudflare.com; it cannot reach this app or the user’s files). It takes the app’s look and theme by itself: colour it with var(--n-fg), var(--n-muted), var(--n-line), var(--n-accent), and var(--n-c1) to var(--n-c6) for series; no background or font of its own. A plain ```html block stays code. A whole page (a report, a dashboard) goes in show_html, and one the user will keep in save_page.',
  '- Pictures: where seeing helps (a place, a product, a plant or animal, an artwork, a building, a person in the news, a figure from a paper), show one to three, each as ![what it shows](address) on a line of its own: the address of the image file itself, as find_media, a search or a page you read gave it, never a guessed one. A picture on this computer shows by its path.',
  'Use these where they make the answer clearer; when the user’s guidelines or messages ask for plain text, write plain text.',
].join('\n');

export const formatting: Feature = {
  id: 'formatting',
  spawn: () => ({ instructions: [FORMATTING] }),
};
