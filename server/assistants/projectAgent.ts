// An agent for a project that has none of its own (made with the project, or from its Agents tab). With enough to
// go on (what the project says it is about and its guidelines, or a README or agent notes in its folder), the helper
// model drafts one fitted to it, starting from the template for its kind. With little to go on, the template that
// its kind calls for, from what its folder holds or the words it was described with: software, a website, machine
// learning experiments, data analysis, a paper in LaTeX, research reading, writing, design and media, or slides. With
// nothing that points anywhere, the default project agent. It works only in the project, in its folder, and the
// project's sessions start as it unless the project names another agent.
import fs from 'node:fs';
import path from 'node:path';
import { ASSISTANT_ICONS, TOOL_KINDS, type Assistant, type ToolKind } from '../../shared/assistants.ts';
import type { Space } from '../../shared/spaces.ts';
import { isTier, type Tier } from '../../shared/tiers.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { helperJson } from '../helper.ts';
import { spaceById, updateSpace } from '../spaces/index.ts';
import { userLang } from '../language/index.ts';
import { cleanAssistant, saveAssistant } from './store.ts';

export type ProjectKind = 'software' | 'web' | 'ml' | 'data' | 'paper' | 'research' | 'writing' | 'media' | 'slides' | 'default';

export interface ProjectTemplate {
  kind: ProjectKind;
  /** What the agent is in the project ("engineer"): its name is the project's name and this. */
  role: string;
  icon: (typeof ASSISTANT_ICONS)[number];
  /** One line; "{project}" is the project's name. */
  description: string;
  /** Its instructions; "{project}" is the project's name. */
  instructions: string;
  tools?: ToolKind[];
  tier?: Tier;
  /** Bundled skills it favors. */
  skills?: string[];
}

const READ_FIRST = 'Before you start, read what the project says about itself: its guidelines, and its README or agent notes (AGENTS.md, CLAUDE.md) when there are some.';

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    kind: 'software',
    role: 'engineer',
    icon: 'code',
    description: 'Builds, fixes and reviews the code of {project}',
    instructions: [
      'You are the engineer of {project}, a software project in this folder.',
      READ_FIRST,
      '- Follow the code base: its language, style, structure, libraries and the commands it uses to build, test and lint.',
      '- Make small, focused changes; read the code around a change before you make it, and keep unrelated changes out.',
      '- Run the tests and checks that cover what you changed before you say it is done, and say what you ran.',
      '- When a bug is reported, reproduce it first, then fix the cause rather than the symptom.',
      '- End with what changed and why, the files touched, and anything left open.',
    ].join('\n'),
    tier: 'standard',
    skills: ['debugging-code', 'code-review', 'test-first'],
  },
  {
    kind: 'web',
    role: 'web developer',
    icon: 'palette',
    description: 'Builds and polishes the website or web app {project}',
    instructions: [
      'You are the web developer of {project}, a website or web app in this folder.',
      READ_FIRST,
      '- Use the framework, components and styles already there; keep pages fast, accessible and right on phones as well as computers.',
      '- Run its development server and look at what you changed in a browser, with screenshots before and after a change people will see.',
      '- Run its tests, type checks and linters before you say it is done.',
      '- End with what changed, how to see it, and anything left open.',
    ].join('\n'),
    tier: 'standard',
    skills: ['frontend-polish', 'web-app-qa', 'debugging-code'],
  },
  {
    kind: 'ml',
    role: 'ML researcher',
    icon: 'lightbulb',
    description: 'Runs and compares the machine learning experiments of {project}',
    instructions: [
      'You are the machine learning researcher of {project}: models, training and evaluation in this folder.',
      READ_FIRST,
      '- Keep experiments reproducible: fixed seeds, recorded settings and data versions, and results that can be traced to the run that made them.',
      '- Send long training or evaluation runs to Experiments (experiment_run, experiment_sweep) rather than running them in the foreground, and never start runs on the GPUs unless asked.',
      '- Compare against the baselines with the same evaluation; report means and spread over seeds, and test whether differences hold.',
      '- End with what you ran, the results (the results UI, methods by metrics with the best marked, when there are several), what they mean, and what to try next.',
    ].join('\n'),
    tier: 'standard',
    skills: ['model-evaluation', 'fine-tuning', 'notebooks'],
  },
  {
    kind: 'data',
    role: 'analyst',
    icon: 'chart-column',
    description: 'Answers questions from the data of {project}',
    instructions: [
      'You are the data analyst of {project}: its data files and notebooks in this folder.',
      READ_FIRST,
      '- Look at the data before you trust it: its columns, types, missing values, duplicates and odd values; say what you cleaned and why.',
      '- Answer with numbers you can show: the query or code that made them, kept in a script or notebook in the folder.',
      '- Show results in the answer UIs made for numbers when they help (the key figures, a plain chart, a table to sort and filter), and say what they mean in words.',
      '- Keep the original files as they are; write what you derive to new files.',
    ].join('\n'),
    tier: 'standard',
    skills: ['data-analysis', 'notebooks', 'spreadsheets'],
  },
  {
    kind: 'paper',
    role: 'paper writer',
    icon: 'graduation-cap',
    description: 'Writes, revises and checks the paper {project}',
    instructions: [
      'You are the co-author of {project}, a paper written in LaTeX in this folder.',
      READ_FIRST,
      '- Keep the paper compiling: typeset it after each change, and fix the errors and warnings you cause.',
      "- Keep to its style: the venue's template, its notation, how it cites and its spelling; change what you are asked to and leave the rest.",
      '- Every claim has its support: a citation in the bibliography (never invented), a result in the paper, or a proof.',
      '- End with what changed, section by section, and anything that needs the authors.',
    ].join('\n'),
    tier: 'standard',
    skills: ['papers', 'figures-for-papers', 'peer-review'],
  },
  {
    kind: 'research',
    role: 'researcher',
    icon: 'telescope',
    description: 'Reads, compares and sums up the sources of {project}',
    instructions: [
      'You are the researcher of {project}: the papers, reports and notes in this folder, and what more there is to find.',
      READ_FIRST,
      "- Read the sources that matter rather than answering from snippets; search the project's own documents first, then the web.",
      '- Cite as you write, each claim with its source, and never invent a source, a quote or a number.',
      '- Keep apart what is established, what is contested and what is unknown (a fact-check of the claims, when there are several), and say how current the answer is.',
      '- Keep a reading list and notes in the folder as the work goes on.',
    ].join('\n'),
    tier: 'standard',
    skills: ['research', 'papers'],
  },
  {
    kind: 'writing',
    role: 'writer',
    icon: 'pen-line',
    description: 'Drafts and edits the writing of {project}',
    instructions: [
      'You are the writer and editor of {project}: the documents in this folder.',
      READ_FIRST,
      '- Keep the voice, terms and format the documents already have; ask about the audience and purpose only when they are unclear and matter.',
      '- When you edit, keep the meaning, fix what is wrong, tighten what is loose, and list the main changes.',
      '- Save what you write as files in the folder, in the format the project uses, and say where.',
    ].join('\n'),
    tier: 'standard',
    skills: ['writing', 'word-documents'],
  },
  {
    kind: 'media',
    role: 'designer',
    icon: 'palette',
    description: 'Makes and edits the pictures, videos and designs of {project}',
    instructions: [
      'You are the designer of {project}: the pictures, videos and designs in this folder.',
      READ_FIRST,
      '- Keep to the look the project already has: its colours, type, sizes and style.',
      '- Work on copies, never over the originals, and name new files so they sort with the rest.',
      '- Look at what you made before you hand it over, and say what each file is.',
    ].join('\n'),
    tier: 'standard',
    skills: ['image-prompts', 'brand-kit'],
  },
  {
    kind: 'slides',
    role: 'presenter',
    icon: 'megaphone',
    description: 'Makes the talks, decks and plans of {project}',
    instructions: [
      'You are the presenter of {project}: its talks, decks and the plans behind them, in this folder.',
      READ_FIRST,
      '- One idea per slide, few words, the point in each title; numbers as charts, sources in the notes.',
      "- Keep to the deck's look; make slides people can edit and present (save_slides), unless a file is asked for.",
      '- End with the outline, how long it runs, and what still needs the presenter.',
    ].join('\n'),
    tier: 'standard',
    skills: ['presentations', 'project-plan'],
  },
  {
    kind: 'default',
    role: 'agent',
    icon: 'bot',
    description: 'Works on {project}, in its folder',
    instructions: [
      'You are the agent of {project}: you work on it, in its folder.',
      READ_FIRST,
      '- Work out what is asked and do it; ask one short question only when the request is unclear in a way that changes the result.',
      "- Keep what you make in the project's folder, or in the Library when it is something to use or change again, and say where.",
      '- Lead with the answer, then the detail that matters, in plain words.',
    ].join('\n'),
  },
];

export const templateOf = (kind: ProjectKind): ProjectTemplate => PROJECT_TEMPLATES.find((t) => t.kind === kind) ?? PROJECT_TEMPLATES[PROJECT_TEMPLATES.length - 1];

// ---- what kind of project it is ------------------------------------------------------------------------------

const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', 'env', 'dist', 'build', 'target', '__pycache__', '.next', '.cache', '.idea', '.vscode', 'coverage', '.mypy_cache', '.pytest_cache']);

const EXT: Record<string, string> = {};
const add = (kind: string, exts: string) => exts.split(' ').forEach((e) => (EXT[e] = kind));
add('code', 'ts tsx js jsx mjs cjs py rs go java kt swift c cc cpp h hpp cs rb php scala sh lua dart zig ex exs');
add('web', 'html htm css scss sass less vue svelte astro');
add('notebook', 'ipynb');
add('data', 'csv tsv xlsx xls parquet feather arrow jsonl ndjson sqlite db sql dta sav rds');
add('weights', 'pt pth ckpt safetensors onnx h5 gguf');
add('tex', 'tex bib cls sty bst');
add('pdf', 'pdf');
add('docs', 'docx doc odt md markdown txt rtf pages epub fountain');
add('media', 'png jpg jpeg gif webp svg psd ai fig sketch xcf kra mp4 mov mkv webm avi wav mp3 aiff flac');
add('slides', 'pptx ppt key odp');

const MARKERS = [
  'package.json',
  'pyproject.toml',
  'setup.py',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'CMakeLists.txt',
  'Makefile',
  'Gemfile',
  'composer.json',
  'mix.exs',
  'pubspec.yaml',
];
const WEB_DEPS = /"(react|vue|svelte|next|nuxt|astro|vite|@angular\/core|solid-js|preact|gatsby|remix|@sveltejs\/kit)"\s*:/;
const ML_DEPS = /\b(torch|pytorch|transformers|jax|flax|tensorflow|keras|lightning|accelerate|datasets|scikit-learn|sklearn|xgboost|wandb)\b/i;

interface Scan {
  counts: Record<string, number>;
  markers: string[];
  /** The start of its README, AGENTS.md or CLAUDE.md, when it has one. */
  readme: string;
  webDeps: boolean;
  mlDeps: boolean;
  mlFiles: boolean;
}

const read = (f: string, n = 4000): string => {
  try {
    const fd = fs.openSync(f, 'r');
    const b = Buffer.alloc(n);
    const got = fs.readSync(fd, b, 0, n, 0);
    fs.closeSync(fd);
    return b.subarray(0, got).toString('utf8');
  } catch {
    return '';
  }
};

/** What a folder holds, two levels down at most, and at most a few thousand entries. */
export function scanFolder(dir: string): Scan {
  const s: Scan = { counts: {}, markers: [], readme: '', webDeps: false, mlDeps: false, mlFiles: false };
  let seen = 0;
  const walk = (d: string, depth: number) => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of names) {
      if (++seen > 4000) return;
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue;
        if (/^(wandb|mlruns|checkpoints|runs)$/.test(e.name)) s.mlFiles = true;
        if (depth < 2) walk(p, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = e.name.includes('.') ? e.name.split('.').pop()!.toLowerCase() : '';
      const kind = EXT[ext];
      if (kind) s.counts[kind] = (s.counts[kind] ?? 0) + 1;
      if (depth === 0 && MARKERS.includes(e.name)) s.markers.push(e.name);
      if (/^train.*\.py$/i.test(e.name) || kind === 'weights') s.mlFiles = true;
      if (depth === 0 && !s.readme && /^(readme|agents|claude)(\.md|\.markdown|\.txt|\.rst)?$/i.test(e.name)) s.readme = read(p).trim();
      if (depth === 0 && e.name === 'package.json' && WEB_DEPS.test(read(p, 20000))) s.webDeps = true;
      if (depth === 0 && /^(requirements\.txt|pyproject\.toml|environment\.ya?ml|setup\.py)$/.test(e.name) && ML_DEPS.test(read(p, 20000))) s.mlDeps = true;
    }
  };
  walk(dir, 0);
  return s;
}

/** Words that say what kind a project is, when its folder says little. */
const WORDS: [ProjectKind, RegExp][] = [
  ['ml', /\b(machine learning|deep learning|neural|model training|fine-?tun\w*|training runs?|experiments?|benchmarks?|llms?|embeddings?)\b/i],
  ['paper', /\b(paper|thesis|dissertation|latex|manuscript|camera.ready|submission|arxiv|preprint)\b/i],
  ['web', /\b(website|web ?site|web app|landing page|front.?end|react|next\.?js|blog site)\b/i],
  ['software', /\b(app|code|codebase|library|api|backend|cli|script|software|repo(sitory)?|bug|feature)\b/i],
  ['data', /\b(data|dataset|analysis|analytics|dashboard|spreadsheet|survey|statistics|csv)\b/i],
  ['slides', /\b(slides|deck|talk|presentation|pitch|keynote|lecture)\b/i],
  ['research', /\b(research|literature|reading|sources|study|review|papers)\b/i],
  ['writing', /\b(book|novel|story|stories|essay|articles?|blog|newsletter|writing|chapters?|letters?)\b/i],
  ['media', /\b(design|logo|brand|photos?|video|film|youtube|podcast|illustrations?|art)\b/i],
];

/** The kind of a project, from its folder's files first and the words it was described with next; default when neither says. */
export function kindOf(s: Scan, words: string): ProjectKind {
  const c = (k: string) => s.counts[k] ?? 0;
  const code = c('code');
  if ((s.mlFiles || s.mlDeps) && code + c('notebook') > 0) return 'ml';
  if (c('tex') > 0) return 'paper';
  if (s.webDeps || (c('web') >= 3 && c('web') >= code)) return 'web';
  if (s.markers.length || code >= 3) return 'software';
  if (c('data') >= 2 || c('notebook') >= 1) return 'data';
  if (c('slides') >= 1 && c('slides') >= c('docs')) return 'slides';
  if (c('pdf') >= 3 && c('pdf') >= c('docs')) return 'research';
  if (c('docs') >= 2) return 'writing';
  if (c('media') >= 5) return 'media';
  for (const [k, re] of WORDS) if (re.test(words)) return k;
  return 'default';
}

// ---- making it ----------------------------------------------------------------------------------------------

const fill = (t: string, name: string) => t.replaceAll('{project}', name);

/** The templates' names and lines in the languages the app speaks besides English (their instructions stay in English, for the agent). */
const IN: Record<'zh' | 'el', Record<ProjectKind, { role: string; description: string }>> = {
  zh: {
    software: { role: '工程师', description: '构建、修复和审查 {project} 的代码' },
    web: { role: 'Web 开发者', description: '构建并打磨网站或 Web 应用 {project}' },
    ml: { role: 'ML 研究员', description: '运行并比较 {project} 的机器学习实验' },
    data: { role: '分析师', description: '根据 {project} 的数据回答问题' },
    paper: { role: '论文作者', description: '撰写、修改并检查论文 {project}' },
    research: { role: '研究员', description: '阅读、比较并总结 {project} 的资料' },
    writing: { role: '撰稿人', description: '起草并编辑 {project} 的文字' },
    media: { role: '设计师', description: '制作并编辑 {project} 的图片、视频和设计' },
    slides: { role: '演讲者', description: '制作 {project} 的演讲、幻灯片和计划' },
    default: { role: '智能体', description: '在 {project} 的文件夹中处理它的工作' },
  },
  el: {
    software: { role: 'μηχανικός', description: 'Φτιάχνει, διορθώνει και ελέγχει τον κώδικα του {project}' },
    web: { role: 'web developer', description: 'Φτιάχνει και γυαλίζει τον ιστότοπο ή την web εφαρμογή {project}' },
    ml: { role: 'ερευνητής ML', description: 'Τρέχει και συγκρίνει τα πειράματα μηχανικής μάθησης του {project}' },
    data: { role: 'αναλυτής', description: 'Απαντά σε ερωτήσεις από τα δεδομένα του {project}' },
    paper: { role: 'συγγραφέας δημοσίευσης', description: 'Γράφει, αναθεωρεί και ελέγχει τη δημοσίευση {project}' },
    research: { role: 'ερευνητής', description: 'Διαβάζει, συγκρίνει και συνοψίζει τις πηγές του {project}' },
    writing: { role: 'συγγραφέας', description: 'Γράφει και επιμελείται τα κείμενα του {project}' },
    media: { role: 'σχεδιαστής', description: 'Φτιάχνει και επεξεργάζεται τις εικόνες, τα βίντεο και τα σχέδια του {project}' },
    slides: { role: 'παρουσιαστής', description: 'Φτιάχνει τις ομιλίες, τις διαφάνειες και τα σχέδια του {project}' },
    default: { role: 'πράκτορας', description: 'Δουλεύει στο {project}, στον φάκελό του' },
  },
};

/** The template's agent for a project, as it would be saved. */
export function fromTemplate(t: ProjectTemplate, s: Pick<Space, 'id' | 'name'>, lang: string = 'en'): Partial<Assistant> {
  const words = lang === 'zh' || lang === 'el' ? IN[lang][t.kind] : { role: t.role, description: t.description };
  return {
    name: `${s.name} ${words.role}`.slice(0, 60),
    icon: t.icon,
    description: fill(words.description, s.name).slice(0, 160),
    instructions: fill(t.instructions, s.name),
    ...(t.tools ? { tools: t.tools } : {}),
    ...(t.tier ? { tier: t.tier } : {}),
    ...(t.skills ? { skills: t.skills } : {}),
    folder: 'project',
    projects: [s.id],
  };
}

const DRAFT = [
  'You write the agent for one project: who it is there and how it works. Answer with one JSON object and nothing else:',
  '{"name": 1 to 4 words, "icon": one of ICONS, "description": one line of at most 120 characters on what it does in the project,',
  '"instructions": second person, 4 to 12 short lines: what the project is, how to work in it (its conventions, tools and checks), and what to hand back,',
  '"tools": the kinds it needs, from read, edit, run, web, mcp; "tier": "quick", "standard" or "best"}.',
  'Start from the template given and make it fit this project. Never invent facts the project does not state; write in the language the project is described in.',
].join(' ');

/** Whether a project says enough about itself for the helper model to fit an agent to it. */
export const enoughToGoOn = (s: Pick<Space, 'description' | 'instructions'>, scan: Scan): boolean => `${s.description ?? ''} ${s.instructions ?? ''}`.trim().length >= 120 || scan.readme.length >= 300;

export interface ProjectAgentResult {
  agent: Assistant;
  /** How it was made: drafted to fit the project, a kind's template, or the default. */
  how: 'drafted' | 'template' | 'default';
  kind: ProjectKind;
}

/**
 * Makes and saves an agent for a project: drafted when the project says enough about itself (the template for its
 * kind as the start), else its kind's template, else the default one. The project's sessions start as it unless the
 * project names another agent.
 */
export async function makeProjectAgent(db: DB, spaceId: string, o: { draft?: (db: DB, system: string, prompt: string) => Promise<Record<string, unknown>> } = {}): Promise<ProjectAgentResult> {
  const s = spaceById(db, spaceId);
  if (!s) throw new HttpError(404, 'No such project');
  const scan = scanFolder(s.folder);
  const words = `${s.name} ${s.description ?? ''} ${s.instructions ?? ''} ${scan.readme.slice(0, 1500)}`;
  const kind = kindOf(scan, words);
  const t = templateOf(kind);
  let a: Partial<Assistant> = fromTemplate(t, s, userLang(db));
  let how: ProjectAgentResult['how'] = kind === 'default' ? 'default' : 'template';
  if (enoughToGoOn(s, scan)) {
    const kinds = Object.entries(scan.counts)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ');
    const prompt = [
      `Project: ${s.name}`,
      s.description ? `What it is about: ${s.description}` : '',
      s.instructions ? `Its guidelines:\n${s.instructions.slice(0, 3000)}` : '',
      `Its folder: ${s.folder}${kinds ? ` (files: ${kinds}${scan.markers.length ? `; ${scan.markers.join(', ')}` : ''})` : ''}`,
      scan.readme ? `Its README or agent notes begin:\n${scan.readme.slice(0, 2500)}` : '',
      `Template (the ${t.role} of a ${kind} project):\n${a.instructions}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      const ask = o.draft ?? ((db2: DB, system: string, p: string) => helperJson<Record<string, unknown>>(db2, { system, prompt: p, timeoutMs: 60_000 }, 'an agent'));
      const raw = await ask(db, DRAFT.replace('ICONS', ASSISTANT_ICONS.join(', ')), prompt);
      const tools = Array.isArray(raw.tools) ? raw.tools.filter((x) => TOOL_KINDS.some((k) => k.id === x)) : undefined;
      const instructions = typeof raw.instructions === 'string' && raw.instructions.trim().length > 40 ? raw.instructions.trim() : a.instructions;
      a = {
        ...a,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : a.name,
        icon: ASSISTANT_ICONS.includes(raw.icon as (typeof ASSISTANT_ICONS)[number]) ? String(raw.icon) : a.icon,
        description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim().slice(0, 160) : a.description,
        instructions,
        ...(tools?.length ? { tools: tools.length === TOOL_KINDS.length ? undefined : tools } : {}),
        ...(isTier(raw.tier) ? { tier: raw.tier } : {}),
      };
      how = 'drafted';
    } catch {
      // No helper model to ask, or no answer from it: the template, as with little to go on.
    }
  }
  const saved = saveAssistant(db, cleanAssistant(a) as Partial<Record<keyof Assistant, unknown>>);
  if (!s.assistant) updateSpace(db, s.id, { assistant: saved.id });
  return { agent: saved, how, kind };
}
