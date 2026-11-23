// npm run guide:settings: writes the guide's "Every setting" topic (docs/guide/30-settings.md, and its translations
// in docs/guide/<lang>/ for every language of TEXT) from what the search box knows of Settings (shared/find-catalog.ts: each
// section and the options in it), the app's own translations of those words (web/src/i18n), and the translated
// topics' titles. Run it after adding, renaming or rewording a Settings section or option (AGENTS.md, "Docs").
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GUIDE = path.join(ROOT, 'docs', 'guide');
const src = fs.readFileSync(path.join(ROOT, 'shared', 'find-catalog.ts'), 'utf8');

/** The quoted strings (single, or double where one has an apostrophe) of each `[…]` row of an exported list. */
function rows(name) {
  const at = src.indexOf(`export const ${name}`);
  const body = src.slice(at, src.indexOf('];', at));
  return body
    .split('\n')
    .filter((l) => l.trim().startsWith('['))
    .map((l) => [...l.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]));
}
const SECTIONS = rows('SECTIONS'); // [id, label, tab, sub]
/** A section whose label is the words of one part of the app (data-i18n in the page): the dictionary may hold its own entry ("goal::Goals"). */
const SECTION_PART = { goals: 'goal' };
const OPTIONS = rows('OPTIONS'); // [section, words, keywords, text, title?]

/** The guide topic that explains each section (SECTION_TOPIC in shared/find-catalog.ts, which the sections' "Learn more" opens too). */
const TOPIC = (() => {
  const at = src.indexOf('export const SECTION_TOPIC');
  return Object.fromEntries([...src.slice(at, src.indexOf('};', at)).matchAll(/^\s+([a-z-]+): '([a-z-]+)',$/gm)].map((m) => [m[1], m[2]]));
})();

/** An on-screen label as the app shows it in a language (its dictionary): the bold words of the newer languages' texts. */
const DICTS = {};
function ui(lang, s) {
  DICTS[lang] ??= JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'src', 'i18n', `${lang}.json`), 'utf8'));
  return DICTS[lang][s] ?? s;
}

/** A button's words without the shortcut its label ends with ("Hide sidebar ({0}B)"). */
const bare = (lang, s) => ui(lang, `${s} ({0}B)`).replace(/\s*[（(]\{0\}B[）)]\s*$/u, '');

const TEXT = {
  en: {
    title: 'Every setting',
    intro:
      'Every section of Settings and what is in it, in the order the app shows them, with a link to each and to the part of this guide that explains it. Use it to find where something is set; the topics explain how to use it.',
    layout: 'How Settings is laid out',
    layoutText: [
      'Open **Settings** from the rail. On a computer, Settings has a column at the left, the same kind as the Library’s, with every section in one list under three headings: **App** (the app itself), **Agents** (the agents and what they read) and **Capabilities** (what the app adds to every agent: search, the browser, memory and the rest). Click a section and it fills the page, under its title. **Hide sidebar** (Ctrl+B) hides the column, and **Show sidebar** at the start of the title brings it back. On a phone, Settings lists every section in one list; tap one to open it, and the arrow at the top to go back.',
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
  de: {
    title: 'Alle Einstellungen',
    intro:
      'Hier findest du sämtliche Einstellungsbereiche in der Reihenfolge der App, jeweils mit einem direkten Link und einem Verweis auf den passenden Hilfeartikel. Nutze diese Übersicht, um eine Einstellung zu finden. Die verlinkten Artikel erklären ihre Verwendung.',
    layout: 'Aufbau der Einstellungen',
    layoutText: [
      'Öffne **Einstellungen** in der Werkzeugleiste. Am Computer hat Einstellungen links eine Spalte wie die Bibliothek, mit allen Bereichen in einer Liste unter drei Überschriften: **App** für die Anwendung selbst, **Agenten** für die Agenten und ihre Anweisungen sowie **Funktionen** für gemeinsame Ergänzungen wie Suche, Browser und Memory. Klicke einen Bereich an, dann füllt er die Seite unter seinem Titel. **Seitenleiste ausblenden** (Strg+B) blendet die Spalte aus, und **Seitenleiste anzeigen** vor dem Titel holt sie zurück. Auf dem Handy erscheinen alle Bereiche in einer Liste. Tippe einen an, um ihn zu öffnen; der Pfeil oben führt zurück.',
      'Du musst nicht wissen, wo eine Option liegt: Gib in der Suche (Strg+K, auf dem Mac ⌘K) beispielsweise „dunkles Design“ oder „Benachrichtigungen“ ein und wähle den Treffer. Die App öffnet den richtigen Bereich und hebt die Option hervor. Du kannst auch einen Agenten mit der Änderung beauftragen ([Agenten die App bedienen lassen](/guide/ask-agents)).',
    ],
    more: 'Mehr dazu unter',
    stop: '.',
    colon: ': ',
    gap: ' ',
    ask: 'Beispielaufträge',
    examples: ['Wo ändere ich die Funktion von Enter während der Agent arbeitet?', 'Aktiviere den Benachrichtigungston.', 'Zeige meine Sucheinstellungen.', 'Wähle das günstigste Hilfsmodell.', 'Deaktiviere Memory für neue Sitzungen.'],
    quote: (s) => `„${s}“`,
  },
  es: {
    title: ui('es', 'Every setting'),
    intro:
      'Cada sección de la configuración y lo que contiene, en el orden en que la app las muestra, con un enlace a cada una y a la parte de esta guía que la explica. Úsala para encontrar dónde se ajusta algo; los temas explican cómo usarlo.',
    layout: 'Cómo está organizada la configuración',
    layoutText: [
      `Abre **${ui('es', 'Settings')}** desde la barra de iconos. En una computadora, la configuración tiene una columna a la izquierda, como la de la Biblioteca, con todas las secciones en una lista bajo tres encabezados: **${ui('es', 'App')}** (la app en sí), **${ui('es', 'Agents')}** (los agentes y lo que leen) y **${ui('es', 'Capabilities')}** (lo que la app añade a cada agente: la búsqueda, el navegador, la memoria y lo demás). Haz clic en una sección y ocupa la página, bajo su título. **${bare('es', 'Hide sidebar')}** (Ctrl+B) oculta la columna, y **${bare('es', 'Show sidebar')}**, al principio del título, la vuelve a mostrar. En un teléfono, la configuración muestra todas las secciones en una lista; toca una para abrirla, y la flecha de arriba para volver.`,
      `No hace falta saber dónde está una opción: escribe lo que buscas en el cuadro de búsqueda (Ctrl+K, ⌘K en una Mac), por ejemplo "modo oscuro" o "notificaciones", y elígelo. La app abre la sección correcta y señala la opción. También puedes pedirle a cualquier agente que cambie un ajuste por ti ([${topicTitle('es', 'ask-agents')}](/guide/ask-agents)).`,
    ],
    more: 'Más en',
    stop: '.',
    colon: ': ',
    gap: ' ',
    ask: ui('es', 'Ask an agent'),
    examples: ['¿Dónde cambio lo que hace Enter mientras un agente trabaja?', 'Activa el sonido de las notificaciones.', 'Muéstrame mis ajustes de búsqueda.', 'Pon como modelo auxiliar el más barato.', 'Desactiva la memoria para las sesiones nuevas.'],
    quote: (s) => `"${s}"`,
  },
  fr: {
    title: ui('fr', 'Every setting'),
    intro:
      'Chaque section des paramètres et ce qu’elle contient, dans l’ordre où l’app les affiche, avec un lien vers chacune et vers la partie de ce guide qui l’explique. Servez-vous-en pour trouver où se règle quelque chose ; les sujets expliquent comment s’en servir.',
    layout: 'Comment les paramètres sont organisés',
    layoutText: [
      `Ouvrez **${ui('fr', 'Settings')}** depuis la barre d’icônes. Sur un ordinateur, les paramètres ont une colonne à gauche, comme celle de la Bibliothèque, avec toutes les sections dans une liste sous trois titres : **${ui('fr', 'App')}** (l’app elle-même), **${ui('fr', 'Agents')}** (les agents et ce qu’ils lisent) et **${ui('fr', 'Capabilities')}** (ce que l’app ajoute à chaque agent : la recherche, le navigateur, la mémoire et le reste). Cliquez sur une section et elle occupe la page, sous son titre. **${bare('fr', 'Hide sidebar')}** (Ctrl+B) masque la colonne, et **${bare('fr', 'Show sidebar')}**, au début du titre, la fait revenir. Sur un téléphone, les paramètres affichent toutes les sections dans une liste ; touchez-en une pour l’ouvrir, et la flèche en haut pour revenir.`,
      `Inutile de savoir où se trouve une option : tapez ce que vous voulez dans le champ de recherche (Ctrl+K, ⌘K sur un Mac), par exemple « mode sombre » ou « notifications », puis choisissez-la. L’app ouvre la bonne section et vous montre l’option. Vous pouvez aussi demander à n’importe quel agent de modifier un réglage pour vous ([${topicTitle('fr', 'ask-agents')}](/guide/ask-agents)).`,
    ],
    more: 'Pour en savoir plus :',
    stop: '.',
    colon: ' : ',
    gap: ' ',
    ask: ui('fr', 'Ask an agent'),
    examples: ['Où changer ce que fait Entrée pendant qu’un agent travaille ?', 'Active le son des notifications.', 'Montre-moi mes réglages de recherche.', 'Choisis le modèle d’appoint le moins cher.', 'Désactive la mémoire pour les nouvelles sessions.'],
    quote: (s) => `« ${s} »`,
  },
  pt: {
    title: ui('pt', 'Every setting'),
    intro:
      'Cada seção das configurações e o que há nela, na ordem em que o app as mostra, com um link para cada uma e para a parte deste guia que a explica. Use-a para descobrir onde algo é ajustado; os tópicos explicam como usar.',
    layout: 'Como as configurações são organizadas',
    layoutText: [
      `Abra **${ui('pt', 'Settings')}** na barra de ícones. No computador, as configurações têm uma coluna à esquerda, como a da Biblioteca, com todas as seções em uma lista sob três títulos: **${ui('pt', 'App')}** (o próprio app), **${ui('pt', 'Agents')}** (os agentes e o que eles leem) e **${ui('pt', 'Capabilities')}** (o que o app acrescenta a cada agente: a busca, o navegador, a memória e o resto). Clique em uma seção e ela ocupa a página, abaixo do título. **${bare('pt', 'Hide sidebar')}** (Ctrl+B) esconde a coluna, e **${bare('pt', 'Show sidebar')}**, no início do título, a traz de volta. No celular, as configurações mostram todas as seções em uma lista; toque em uma para abri-la, e na seta no alto para voltar.`,
      `Você não precisa saber onde fica uma opção: digite o que quer na caixa de busca (Ctrl+K, ⌘K no Mac), como "modo escuro" ou "notificações", e escolha. O app abre a seção certa e aponta a opção. Você também pode pedir a qualquer agente que mude uma configuração para você ([${topicTitle('pt', 'ask-agents')}](/guide/ask-agents)).`,
    ],
    more: 'Mais em',
    stop: '.',
    colon: ': ',
    gap: ' ',
    ask: ui('pt', 'Ask an agent'),
    examples: ['Onde eu mudo o que o Enter faz enquanto um agente trabalha?', 'Ative o som das notificações.', 'Mostre minhas configurações de busca.', 'Defina o modelo auxiliar como o mais barato.', 'Desative a memória para novas sessões.'],
    quote: (s) => `"${s}"`,
  },
  ja: {
    title: ui('ja', 'Every setting'),
    intro: '設定のすべてのセクションとその内容を、アプリに表示される順に並べ、それぞれの場所と、このガイドの説明部分へのリンクを付けています。何がどこで設定できるかを探すときに使ってください。使い方は各トピックで説明しています。',
    layout: '設定の構成',
    layoutText: [
      `アイコンバーから**${ui('ja', 'Settings')}**を開きます。パソコンでは、設定の左側にライブラリと同じような列があり、すべてのセクションが3つの見出しの下に1つのリストで並んでいます。**${ui('ja', 'App')}**（アプリそのもの）、**${ui('ja', 'Agents')}**（エージェントと、エージェントが読むもの）、**${ui('ja', 'Capabilities')}**（アプリがすべてのエージェントに加える機能：検索、ブラウザ、メモリなど）です。セクションをクリックすると、そのタイトルの下にページいっぱいに表示されます。**${bare('ja', 'Hide sidebar')}**（Ctrl+B）で列を隠し、タイトルの先頭にある**${bare('ja', 'Show sidebar')}**で元に戻せます。スマートフォンでは、設定のすべてのセクションが1つのリストに表示されます。タップして開き、上部の矢印で戻ります。`,
      `オプションの場所を知らなくてもかまいません。検索ボックス（Ctrl+K、Macでは⌘K）に「ダークモード」や「通知」のように探しているものを入力して選ぶと、アプリが正しいセクションを開き、そのオプションを示します。どのエージェントにも設定の変更を頼めます（[${topicTitle('ja', 'ask-agents')}](/guide/ask-agents)）。`,
    ],
    more: '詳しくは',
    stop: '。',
    colon: '：',
    gap: '',
    ask: ui('ja', 'Ask an agent'),
    examples: ['エージェントの作業中にEnterで何が起きるかは、どこで変えられますか？', '通知音をオンにして。', '検索の設定を見せて。', '補助モデルをいちばん安いものにして。', '新しいセッションではメモリをオフにして。'],
    quote: (s) => `「${s}」`,
  },
  zh: {
    title: '所有设置',
    intro: '设置中的每个部分及其内容，按应用中的顺序排列，每项都链接到设置中的位置，以及本指南中讲解它的部分。用它查找某项在哪里设置；各主题会讲解如何使用。',
    layout: '设置的布局',
    layoutText: [
      '从工具栏打开**设置**。在电脑上，设置在左侧有一栏，和资料库的那一栏同类，把所有部分列在一个列表里，分在三个标题下：**应用**（应用本身）、**智能体**（智能体以及它们读取的内容）和**功能**（应用为每个智能体添加的能力：搜索、浏览器、记忆等）。点一个部分，它就在自己的标题下占满页面。**隐藏侧边栏**（Ctrl+B）会隐藏这一栏，标题开头的**显示侧边栏**可以把它找回来。在手机上，设置把所有部分列在一个列表中；点一下即可打开，点顶部的箭头返回。',
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
      'Ανοίξτε τις **Ρυθμίσεις** από τη μπάρα εργαλείων. Σε υπολογιστή, οι Ρυθμίσεις έχουν αριστερά μια στήλη, του ίδιου είδους με της Βιβλιοθήκης, με όλες τις ενότητες σε μία λίστα κάτω από τρεις επικεφαλίδες: **Εφαρμογή** (η ίδια η εφαρμογή), **Πράκτορες** (οι πράκτορες και ό,τι διαβάζουν) και **Δυνατότητες** (ό,τι προσθέτει η εφαρμογή σε κάθε πράκτορα: αναζήτηση, πρόγραμμα περιήγησης, μνήμη και τα υπόλοιπα). Πατήστε μια ενότητα και γεμίζει τη σελίδα, κάτω από τον τίτλο της. Το **Απόκρυψη πλευρικής στήλης** (Ctrl+B) κρύβει τη στήλη, και το **Εμφάνιση πλευρικής στήλης** στην αρχή του τίτλου την επαναφέρει. Σε κινητό, οι Ρυθμίσεις δείχνουν όλες τις ενότητες σε μία λίστα· πατήστε μία για να ανοίξει, και το βέλος επάνω για να επιστρέψετε.',
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

/** The words to point at, for a link: brackets too are %-encoded, or a Markdown link would end at the first ). */
const findParam = (words) => encodeURIComponent(words).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const PROPER = /^(CLAUDE|Gemini|GitHub|Claude|Codex|OpenRouter|Ollama|MCP|ACP|Naget|Hydor)/;
const lower = (s, lang) => (PROPER.test(s) || ['zh', 'ja', 'de'].includes(lang) ? s : s[0].toLocaleLowerCase(lang) + s.slice(1));

for (const lang of Object.keys(TEXT)) {
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
      const name = (SECTION_PART[id] && dict[`${SECTION_PART[id]}::${label}`]) || tr(label);
      out.push(`### ${name}`, '');
      out.push(`[${tr('Settings')} → ${name}](/settings?s=${id})${t.colon}${lower(tr(sub), lang)}${t.stop}${t.gap}${t.more}${t.gap}[${topicTitle(lang, topic)}](/guide/${topic})${t.stop}`, '');
      for (const [sid, words, , text] of OPTIONS) {
        if (sid !== id) continue;
        const x = tr(text).replace(/[.。]$/, '');
        out.push(`- [**${tr(words)}**](/settings?s=${id}&find=${findParam(words)})${t.colon}${x}${t.stop}`);
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
