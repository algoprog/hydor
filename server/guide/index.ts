// The guide (docs/guide): every feature of the app, for the people using it and for agents. The Help page reads
// it whole (GET /api/guide), the search box finds its sections (their vectors ship with the app), and every
// session's agent gets three tools: app_guide to answer questions about the app from it, app_api to do in the
// app what the user could do in its pages (api.ts: with the user's OK on a card), and ask_form to ask for several
// details at once with a form (form.ts).
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_TOPICS, type GuideResponse, type GuideTopic } from '../../shared/guide.ts';
import { isLang } from '../../shared/i18n.ts';
import { HttpError } from '../auth.ts';
import { userLang } from '../language/index.ts';
import type { Feature, RunTool } from '../features/types.ts';
import { appApi } from './api.ts';
import { findSections, GUIDE_DIR, guideTopics } from './content.ts';
import { askForm } from './form.ts';

/** Links in the guide are the app's own paths: made whole, so an agent can hand them on. */
const absolute = (md: string, base: string) => md.replace(/\]\(\/(?!\/)/g, `](${base}/`);

const SECTION_MAX = 4500;
const TOPIC_MAX = 40_000;

function contents(topics: GuideTopic[], base: string): string {
  const lines = [`Hydor’s guide (${base}/guide): its topics and their sections.`];
  for (const t of topics) {
    lines.push('', `- ${t.id} · ${t.title}${AGENT_TOPICS.includes(t.id) ? ' (for agents)' : ''}: ${t.summary.slice(0, 220)}`);
    if (t.sections.length) lines.push(`  ${t.sections.map((s) => `${s.title} [${s.id}]`).join(' · ')}`);
  }
  lines.push('', 'Read one with { topic } or { topic, section }; or find what answers a question with { query }.');
  return lines.join('\n');
}

const APP_GUIDE: RunTool = {
  name: 'app_guide',
  annotations: { readOnlyHint: true },
  description: [
    'The guide to Hydor, the app you run in: what every part of it does, where each setting is and how to use it, as the user sees it.',
    'Use it to answer the user’s questions about the app (how do I…, where is…, what does … do, why…), and before changing something in the app with app_api: its topic "api" lists the app’s endpoints and their bodies.',
    'With no arguments: the topics and their sections. query: the sections that answer a question, in full. topic (and section): a whole topic, or one section.',
    'Answer from it in the user’s language, briefly, with the steps and the place in the app; its links are the app’s own addresses, ready to give the user.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What the user wants to know or do, in a few words: "share a session with someone".' },
      topic: { type: 'string', description: 'A topic’s id from the contents ("projects", "api").' },
      section: { type: 'string', description: 'A section’s id in that topic ("make-a-project").' },
    },
  },
  async run(a, ctx) {
    const base = ctx.deps.publicBase();
    // In the language the user reads the app in, so its words are the ones on their screen; found by the English.
    const topics = guideTopics(userLang(ctx.deps.db));
    const local = (h: { topic: GuideTopic; section: { id: string } }) => {
      const t = topics.find((x) => x.id === h.topic.id) ?? h.topic;
      return { topic: t, section: t.sections.find((x) => x.id === h.section.id) ?? (h.section as GuideTopic['sections'][number]) };
    };
    if (!topics.length) return 'This copy of the app has no guide (docs/guide is missing).';
    const topic = typeof a.topic === 'string' ? a.topic.trim().toLowerCase().replace(/^\d+-|\.md$/g, '') : '';
    const query = typeof a.query === 'string' ? a.query.trim() : '';
    if (topic) {
      const t = topics.find((x) => x.id === topic);
      if (!t) return { text: `No topic "${topic}". The topics: ${topics.map((x) => x.id).join(', ')}.`, isError: true };
      const sid = typeof a.section === 'string' ? a.section.trim().replace(/^#/, '') : '';
      if (sid) {
        const s = t.sections.find((x) => x.id === sid) ?? t.sections.find((x) => x.title.toLowerCase() === sid.toLowerCase());
        if (!s) return { text: `No section "${sid}" in ${t.id}. Its sections: ${t.sections.map((x) => x.id).join(', ')}.`, isError: true };
        return `## ${s.title} (${t.title})\n${base}/guide/${t.id}#${s.id}\n\n${absolute(s.text, base)}`;
      }
      const body = absolute(t.body, base);
      return `# ${t.title}\n${base}/guide/${t.id}\n\n${body.length > TOPIC_MAX ? `${body.slice(0, TOPIC_MAX)}\n… (cut: read the rest by section)` : body}`;
    }
    if (!query) return contents(topics, base);
    const hits = (await findSections(ctx.deps.db, query, 6)).map((h) => ({ ...h, ...local(h) }));
    if (!hits.length) return `Nothing in the guide matches “${query}”. The contents:\n\n${contents(topics, base)}`;
    const full = hits.slice(0, 3).map((h) => {
      const text = absolute(h.section.text, base);
      return `## ${h.section.title} (${h.topic.title} · ${h.topic.id}#${h.section.id})\n${base}/guide/${h.topic.id}#${h.section.id}\n\n${text.length > SECTION_MAX ? `${text.slice(0, SECTION_MAX)}\n… (cut: read the section for the rest)` : text}`;
    });
    const more = hits.slice(3).map((h) => `- ${h.topic.id}#${h.section.id}: ${h.section.title} (${h.topic.title})`);
    return [`From the guide, for “${query}”:`, ...full, ...(more.length ? [`More that may help (read with { topic, section }):\n${more.join('\n')}`] : [])].join('\n\n');
  },
};

const APP_API: RunTool = {
  name: 'app_api',
  description: [
    'Do in Hydor what the user could do in its pages: read its state, change a setting, or make, change and delete things (projects, assistants, scheduled tasks, apps, pages, memory notes, connections, guidelines…), through the app’s own API as the signed-in user.',
    'app_guide topic "api" lists the endpoints and their bodies; read the current state (GET) before changing it.',
    'Reading runs at once. A change shows the user a card with what changes (before → after) and waits for their answer, up to about nine minutes; give summary, the change in a few plain words, as its title.',
    'To have the user fill in or check details on that card, give form: fields as a JSON schema’s properties, each named by its address in body ("name", "settings.results") and filled in from body; their answers go into body.',
    'Some things are only the user’s (the password, keys’ values, files and commands, answering approvals, permissions, spending caps): those are refused, with where the user does them. A session in Plan mode only reads.',
    'Settings kept on each device: PUT /device { theme: dark|light|system, themeName, language: en|zh|el, sound, enter: join|queue, terminalSuggestions, sidebar, groupSessions }, for the pages showing this session.',
    'Links into the app for the user: its address plus the page (/projects/<id>, /settings?s=<section>, /guide/<topic>).',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      path: { type: 'string', description: '"/api/projects", with a query string when the endpoint takes one; or "/device".' },
      body: { type: 'object', description: 'The JSON body, for POST, PUT and PATCH.' },
      summary: { type: 'string', description: 'For a change: what it does, as the user will read it on the card ("Make the project “Thesis”").' },
      form: {
        type: 'object',
        description: 'Optional, for a change: details for the user to fill in or check on the card before it is made.',
        properties: {
          fields: { type: 'object', description: 'A JSON schema’s properties (type, title, description, enum, default, format…), named by their address in body.' },
          required: { type: 'array', items: { type: 'string' } },
          message: { type: 'string', description: 'A line above the fields.' },
        },
      },
    },
    required: ['method', 'path'],
  },
  run: (a, ctx) => appApi(a, ctx),
};

const ASK_FORM: RunTool = {
  name: 'ask_form',
  description: [
    'Ask the user for several details at once with a form in the conversation (a trip’s dates and budget, a report’s audience and length…) instead of a list of questions in text.',
    'fields: a JSON schema’s properties, in order: string (format date, email or uri; maxLength 300 or more for a long text), number or integer (minimum, maximum), boolean (yes or no), enum (or oneOf of const and title) for one choice, an array of enum strings for several; each with title, description and a default when you can guess it.',
    'required: the ones you need. It waits for the answer and returns the values; the user may close it instead. A form not answered within about nine minutes stays open in the conversation, and the tool says so: then end your turn, as their answers come to you as their next message. For a change in the app itself, put the form on app_api’s card instead.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'What the form is for, as its title ("Your trip").' },
      message: { type: 'string', description: 'A line or two above the fields.' },
      fields: { type: 'object', description: 'A JSON schema’s properties.' },
      required: { type: 'array', items: { type: 'string' } },
      submit: { type: 'string', description: 'The send button’s label ("Plan it").' },
    },
    required: ['title', 'fields'],
  },
  run: (a, ctx) => askForm(a, ctx),
};

/** Every agent hears of the tools: Claude Code sees an MCP tool's name only until it looks it up. */
export const GUIDE_INSTRUCTIONS =
  'Hydor, the app you run in: when the user asks how to use it, where something is or what a feature does, look it up with app_guide and answer from the guide, with links to the place in the app. When they ask you to change one of its settings or to make, change or remove something in it (a project, an assistant, a scheduled task, an app, a page, memory notes, guidelines…), do it with app_api: find the endpoint in app_guide’s "api" topic, read what is there now, then make the change. The user confirms each change on a card (it can carry a form for details to fill in or check), so there is no need to ask for a go-ahead in text first. To ask for several details at once, ask_form shows a form. Settings kept on each device (theme, language, sound) change with app_api on /device.';

/** A question asked on the Help page (`extra.help`: true, or the topic open there): the session is about the app. */
export function helpInstructions(help: unknown): string | null {
  if (!help) return null;
  const topic = typeof help === 'string' ? guideTopics().find((t) => t.id === help) : undefined;
  return [
    `The user asked this from the app's Help page${topic ? `, while reading the guide's topic "${topic.title}" (${topic.id})` : ''}: their message is about Hydor.`,
    'Answer from the guide (app_guide), not from memory: briefly, in a few short paragraphs or numbered steps, in their language, with the place in the app as a link and the guide section that says more (/guide/<topic>#<section>).',
    'If they ask you to change a setting or set something up, do it with app_api as usual. Keep to the app: this session works in their home folder only because it needs one.',
  ].join(' ');
}

const IMAGE_TYPES: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };

export const guide: Feature = {
  id: 'guide',
  routes(d) {
    d.app.get('/api/guide', async (req): Promise<GuideResponse> => {
      const lang = (req.query as { lang?: string }).lang;
      return { topics: guideTopics(isLang(lang) ? lang : 'en') };
    });
    // The guide's pictures (docs/guide/images): `theme=light` takes the light one (<name>-light.webp) when there is one.
    d.app.get('/api/guide/images/:name', async (req, reply) => {
      const name = (req.params as { name: string }).name;
      const m = /^([a-z0-9-]+)\.(webp|png|jpg)$/.exec(name);
      if (!m) throw new HttpError(404, 'No such picture');
      const dir = path.join(GUIDE_DIR, 'images');
      const light = `${m[1]}-light.${m[2]}`;
      const file = (req.query as { theme?: string }).theme === 'light' && fs.existsSync(path.join(dir, light)) ? light : name;
      const p = path.join(dir, file);
      if (!fs.existsSync(p)) throw new HttpError(404, 'No such picture');
      // Its address carries the app's version, so it can be kept until the next one.
      reply.header('Cache-Control', 'private, max-age=604800');
      reply.header('Content-Type', IMAGE_TYPES[m[2]]);
      return reply.send(fs.createReadStream(p));
    });
  },
  tools: () => [APP_GUIDE, APP_API, ASK_FORM],
  spawn: (s) => {
    const help = helpInstructions(s.extra?.help);
    return { instructions: help ? [GUIDE_INSTRUCTIONS, help] : [GUIDE_INSTRUCTIONS] };
  },
};
