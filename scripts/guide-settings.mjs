// npm run guide:settings: writes the guide's "Every setting" topic (docs/guide/30-settings.md, and its translations
// in docs/guide/zh/ and docs/guide/el/) from what the search box knows of Settings (shared/find-catalog.ts: each
// section and the options in it), the app's own translations of those words (web/src/i18n), and the translated
// topics' titles. Run it after adding, renaming or rewording a Settings section or option (CLAUDE.md, "Docs").
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GUIDE = path.join(ROOT, 'docs', 'guide');
const src = fs.readFileSync(path.join(ROOT, 'shared', 'find-catalog.ts'), 'utf8');

/** The single-quoted strings of each `[…]` row of an exported list. */
function rows(name) {
  const at = src.indexOf(`export const ${name}`);
  const body = src.slice(at, src.indexOf('];', at));
  return body
    .split('\n')
    .filter((l) => l.trim().startsWith('['))
    .map((l) => [...l.matchAll(/'([^']*)'/g)].map((m) => m[1]));
}
const SECTIONS = rows('SECTIONS'); // [id, label, tab, sub]
const OPTIONS = rows('OPTIONS'); // [section, words, keywords, text, title?]

/** The guide topic that explains each section. */
const TOPIC = {
  general: 'app',
  notifications: 'inbox',
  security: 'app',
  scm: 'devices',
  connect: 'devices',
  machines: 'devices',
  accounts: 'agents-models',
  agents: 'agents-models',
  models: 'agents-models',
  guidelines: 'guidelines',
  mcp: 'connections',
  skills: 'skills',
  plugins: 'connections',
  tasks: 'tasks',
  search: 'web',
  browser: 'web',
  computer: 'web',
  memory: 'memory',
  children: 'research',
  images: 'documents-voice',
  voice: 'documents-voice',
  assistants: 'assistants',
  skillpack: 'skills',
  custom: 'custom',
};

const TEXT = {
  en: {
    title: 'Every setting',
    intro:
      'Every section of Settings and what is in it, in the order the app shows them, with a link to each and to the part of this guide that explains it. Use it to find where something is set; the topics explain how to use it.',
    layout: 'How Settings is laid out',
    layoutText: [
      'Open **Settings** from the sidebar. On a computer, Settings has three tabs at the top: **App** (the app itself), **Agents** (the agents and what they read) and **Capabilities** (what the app adds to every agent: search, the browser, memory and the rest). Each tab lists its sections on the left, and the open section fills the page. On a phone, Settings lists every section in one list; tap one to open it, and the arrow at the top to go back.',
      'You don’t have to know where an option lives: type what you want in the search box (Ctrl+K, ⌘K on a Mac), such as "dark mode" or "notifications", and pick it. The app opens the right section and points at the option. You can also ask any agent to change a setting for you ([Let agents work the app for you](/guide/ask-agents)).',
    ],
    more: 'More in',
    stop: '.',
    colon: ': ',
    gap: ' ',
    ask: 'Ask an agent',
    examples: ['Where do I change what Enter does while an agent works?', 'Turn on the notification sound.', 'Show me my search settings.', 'Set the helper model to the cheapest one.', 'Turn off memory for new sessions.'],
    quote: (s) => `"${s}"`,
  },
  zh: {
    title: '所有设置',
    intro: '设置中的每个部分及其内容，按应用中的顺序排列，每项都链接到设置中的位置，以及本指南中讲解它的部分。用它查找某项在哪里设置；各主题会讲解如何使用。',
    layout: '设置的布局',
    layoutText: [
      '从侧边栏打开**设置**。在电脑上，设置顶部有三个标签页：**应用**（应用本身）、**智能体**（智能体以及它们读取的内容）和**功能**（应用为每个智能体添加的能力：搜索、浏览器、记忆等）。每个标签页在左侧列出它的部分，打开的部分占满页面。在手机上，设置把所有部分列在一个列表中；点一下即可打开，点顶部的箭头返回。',
      '你不必知道某个选项在哪里：在搜索框（Ctrl+K，Mac 上为 ⌘K）中输入你想要的内容，例如“深色模式”或“通知”，然后选中它。应用会打开正确的部分并指向该选项。你也可以让任何智能体替你更改设置（[让智能体替你操作应用](/guide/ask-agents)）。',
    ],
    more: '详见',
    stop: '。',
    colon: '：',
    gap: '',
    ask: '问问智能体',
    examples: ['在哪里更改智能体工作时 Enter 键的作用？', '打开通知提示音。', '给我看看我的搜索设置。', '把辅助模型设为最便宜的那个。', '为新会话关闭记忆。'],
    quote: (s) => `“${s}”`,
  },
  el: {
    title: 'Όλες οι ρυθμίσεις',
    intro:
      'Κάθε ενότητα των Ρυθμίσεων και ό,τι περιέχει, με τη σειρά που τις δείχνει η εφαρμογή, με σύνδεσμο προς την καθεμία και προς το μέρος αυτού του οδηγού που την εξηγεί. Χρησιμοποιήστε τη για να βρείτε πού ρυθμίζεται κάτι· τα θέματα εξηγούν πώς χρησιμοποιείται.',
    layout: 'Πώς είναι οργανωμένες οι Ρυθμίσεις',
    layoutText: [
      'Ανοίξτε τις **Ρυθμίσεις** από την πλαϊνή στήλη. Σε υπολογιστή, οι Ρυθμίσεις έχουν τρεις καρτέλες επάνω: **Εφαρμογή** (η ίδια η εφαρμογή), **Πράκτορες** (οι πράκτορες και ό,τι διαβάζουν) και **Δυνατότητες** (ό,τι προσθέτει η εφαρμογή σε κάθε πράκτορα: αναζήτηση, πρόγραμμα περιήγησης, μνήμη και τα υπόλοιπα). Κάθε καρτέλα δείχνει τις ενότητές της αριστερά, και η ενότητα που ανοίγετε γεμίζει τη σελίδα. Σε κινητό, οι Ρυθμίσεις δείχνουν όλες τις ενότητες σε μία λίστα· πατήστε μία για να ανοίξει, και το βέλος επάνω για να επιστρέψετε.',
      'Δεν χρειάζεται να ξέρετε πού βρίσκεται μια επιλογή: γράψτε αυτό που θέλετε στο πλαίσιο αναζήτησης (Ctrl+K, ⌘K σε Mac), για παράδειγμα «σκοτεινό θέμα» ή «ειδοποιήσεις», και επιλέξτε το. Η εφαρμογή ανοίγει τη σωστή ενότητα και δείχνει την επιλογή. Μπορείτε επίσης να ζητήσετε από οποιονδήποτε πράκτορα να αλλάξει μια ρύθμιση για εσάς ([Αφήστε τους πράκτορες να χειρίζονται την εφαρμογή για εσάς](/guide/ask-agents)).',
    ],
    more: 'Περισσότερα στο',
    stop: '.',
    colon: ': ',
    gap: ' ',
    ask: 'Ρωτήστε έναν πράκτορα',
    examples: ['Πού αλλάζω τι κάνει το Enter όσο δουλεύει ένας πράκτορας;', 'Ενεργοποίησε τον ήχο των ειδοποιήσεων.', 'Δείξε μου τις ρυθμίσεις αναζήτησης.', 'Βάλε ως βοηθητικό μοντέλο το φθηνότερο.', 'Απενεργοποίησε τη μνήμη για τις νέες συνεδρίες.'],
    quote: (s) => `«${s}»`,
  },
};

/** A topic's title in a language: its translated file's, else the English one's. */
function topicTitle(lang, id) {
  const file = fs.readdirSync(GUIDE).find((f) => f.replace(/\.md$/, '').replace(/^\d+-/, '') === id);
  for (const p of [path.join(GUIDE, lang, file), path.join(GUIDE, file)]) {
    if (lang === 'en' && p !== path.join(GUIDE, file)) continue;
    try {
      const m = /^# (.+)$/m.exec(fs.readFileSync(p, 'utf8'));
      if (m) return m[1].trim();
    } catch {}
  }
  return id;
}

const PROPER = /^(CLAUDE|Gemini|GitHub|Claude|Codex|OpenRouter|Ollama|MCP|ACP|Naget)/;
const lower = (s, lang) => (PROPER.test(s) || lang === 'zh' ? s : s[0].toLocaleLowerCase(lang) + s.slice(1));

for (const lang of ['en', 'zh', 'el']) {
  const t = TEXT[lang];
  const dict = lang === 'en' ? {} : JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'src', 'i18n', `${lang}.json`), 'utf8'));
  const tr = (s) => dict[s] ?? s;
  const out = [`# ${t.title}`, '', t.intro, '', `## ${t.layout}`, '', ...t.layoutText.flatMap((p) => [p, ''])];
  for (const tab of ['App', 'Agents', 'Capabilities']) {
    out.push(`## ${tr(tab)}`, '');
    for (const [id, label, group, sub] of SECTIONS) {
      if (group !== tab) continue;
      const topic = TOPIC[id];
      if (!topic) throw new Error(`No guide topic for the Settings section "${id}": add it to TOPIC in scripts/guide-settings.mjs`);
      out.push(`### ${tr(label)}`, '');
      out.push(`[${tr('Settings')} → ${tr(label)}](/settings?s=${id})${t.colon}${lower(tr(sub), lang)}${t.stop}${t.gap}${t.more}${lang === 'zh' ? '' : ' '}[${topicTitle(lang, topic)}](/guide/${topic})${t.stop}`, '');
      for (const [sid, words, , text] of OPTIONS) {
        if (sid !== id) continue;
        const x = tr(text).replace(/[.。]$/, '');
        out.push(`- [**${tr(words)}**](/settings?s=${id}&find=${encodeURIComponent(words)})${t.colon}${x}${t.stop}`);
      }
      out.push('');
    }
  }
  out.push(`## ${t.ask}`, '', ...t.examples.map((e) => `- ${t.quote(e)}`), '');
  const file = lang === 'en' ? path.join(GUIDE, '30-settings.md') : path.join(GUIDE, lang, '30-settings.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out.join('\n'));
  console.log(`Wrote ${path.relative(ROOT, file)}: ${SECTIONS.length} sections, ${OPTIONS.length} options.`);
}
