// What ships with the app that the search box (Ctrl+K) finds: its pages and actions, every Settings section and
// the options in them, and the built-in themes. The page makes its entries from these, and the server finds
// them by meaning with vectors made ahead of time (server/find/shipped-vectors.json), so nobody's computer has
// to. When you add or rename any of them (a page, a Settings section or option, a theme), change this file and
// make the vectors again: npm run find:vectors (CLAUDE.md). server/find/find-test.ts checks both: that sections
// and labels match the pages, and that every text here has its shipped vector.

export type CatalogGroup = 'Go to' | 'Actions' | 'Settings' | 'Themes';

export interface CatalogItem {
  id: string;
  group: CatalogGroup;
  title: string;
  /** Other words for it ("dark mode" for the theme). */
  keywords?: string;
  /** What it is or does. */
  text?: string;
  /** Where it is ("Settings › Capabilities › Memory"). */
  where?: string;
  /** What opening it does: a page, an action, a Settings section (and the words to point at there), a theme. */
  path?: string;
  act?: 'tour' | 'theme' | 'sidebar' | 'panel' | 'releases' | 'handsfree';
  section?: string;
  find?: string;
  theme?: string;
}

/** The text of an item that search by meaning reads (the same here, in the shipped vectors and on the server). */
export const catalogText = (it: { title: string; keywords?: string; text?: string; where?: string }) =>
  [it.title, it.keywords, it.text, it.where].filter(Boolean).join('. ').replace(/\s+/g, ' ').trim().slice(0, 400);

/** Every Settings section: id, label, tab, the line under its title (as SettingsPage.tsx and the features say). */
export const SECTIONS: [string, string, 'App' | 'Agents' | 'Capabilities', string][] = [
  ['general', 'General', 'App', 'Theme, and what Enter does while an agent works'],
  ['notifications', 'Notifications', 'App', 'When a session finishes, fails or needs your answer'],
  ['security', 'Password', 'App', 'The password for this app, and signing out'],
  ['scm', 'Source control', 'App', 'GitHub and Gitea accounts for opening pull requests'],
  ['connect', 'Connect other agents', 'App', 'Let agents elsewhere start and steer sessions here, through this app’s MCP server'],
  ['machines', 'Machines', 'App', 'Other machines running Naget Agent, to use from here, and access to this one'],
  ['accounts', 'Accounts', 'Agents', 'The Claude Code and Codex sign-ins every session uses'],
  ['agents', 'More agents', 'Agents', 'Gemini CLI, OpenCode, Qwen Code, Goose and other agents that speak ACP'],
  ['models', 'Models', 'Agents', 'Models for Custom, the app’s own agent: OpenRouter, Ollama, and Hugging Face models run here with vLLM'],
  ['guidelines', 'Agent Guidelines', 'Agents', 'What every agent follows: in every session, in a space, or in one session'],
  ['mcp', 'MCP servers', 'Agents', 'Tools the agents can call'],
  ['skills', 'Skills', 'Agents', 'Know-how the agents load when a task calls for it'],
  ['plugins', 'Plugins', 'Agents', 'Claude Code add-ons that bundle skills, commands, agents and MCP servers'],
  ['tasks', 'Scheduled tasks', 'Agents', 'Agent work that starts by itself: on a schedule, once, or when a webhook calls'],
  ['search', 'Search', 'Capabilities', 'How agents search the web: Naget Search and other providers'],
  ['browser', 'Browser', 'Capabilities', 'A web browser agents use, which you can watch and take over'],
  ['memory', 'Memory', 'Capabilities', 'What agents remember about you, your projects and each session, and when it was written'],
  ['children', 'Child sessions', 'Capabilities', 'Agents handing parts of a job to other agents, and swarms for hard problems'],
  ['images', 'Images', 'Capabilities', 'Pictures agents make for you, with an image model through OpenRouter'],
  ['connections', 'Connections', 'Capabilities', 'Apps every agent can use, from a marketplace anyone can add to, and a vault for keys'],
  ['voice', 'Voice', 'Capabilities', 'Dictate messages, and have replies read aloud'],
  ['assistants', 'Assistants', 'Capabilities', 'Presets to start sessions as (Researcher, Writer, Tutor…), and where task folders go'],
  ['skillpack', 'Skill library', 'Capabilities', 'Skills that come with the app, and the ones agents learned with your approval'],
  ['custom', 'Custom', 'Capabilities', 'Auto mode, a sandbox for commands, and how long goals run'],
];

/**
 * The options in each section: [section, the words the page shows (it points at them: keep them the same),
 * other words for it, what it does, a title when the words alone say too little].
 */
export const OPTIONS: [string, string, string, string, string?][] = [
  // App › General
  ['general', 'Theme', 'dark mode light system appearance colours colors look', 'Dark, light, or following your device; or a theme of your own'],
  ['general', 'New theme', 'custom colours colors make create theme editor', 'Make a theme of your own from any of them'],
  ['general', 'Import', 'import share theme', 'Add a theme someone shared', 'Import a theme'],
  ['general', 'Language', 'language translate translation chinese greek 中文 简体 ελληνικά english', 'The language the app is shown in, and agents write in'],
  ['general', 'Sending while an agent works', 'enter join turn queue wait steer message', 'Enter joins the running turn, or waits for it to end'],
  ['general', 'Terminal suggestions', 'autocomplete completion shell commands', 'Grey completions after the cursor in terminals'],
  ['general', 'Resume after usage limits', 'limit reset continue automatically plan', 'Continues a session a minute after a plan’s limit resets'],
  ['general', 'Start when this computer starts', 'boot startup login service autostart systemd', 'Starts the app when the computer starts'],
  ['general', 'Update automatically', 'updates upgrade auto update new version', 'Updates itself when you have not used it for a while'],
  ['general', 'Take the tour', 'tour help guide onboarding welcome', 'See what each part of the app does', 'Welcome tour'],
  ['general', 'Check now', 'update upgrade new version about', 'Look for a newer version now', 'Check for updates'],
  // App › Notifications
  ['notifications', 'Notify this device', 'push notifications alerts phone browser when an agent is done finishes fails needs you', 'A notice when a session finishes, fails or needs your answer, even with the app closed'],
  ['notifications', 'Sound', 'chime sound beep audio when done', 'A short chime with each notice while the app is open'],
  ['notifications', 'Send a test', 'test notification try', 'Send a notice to this device now', 'Send a test notification'],
  // App › Password
  ['security', 'Change password', 'password reset new security', 'Changing it signs out every other browser'],
  ['security', 'Sign out of this browser', 'log out logout sign out', 'You need the password to come back'],
  // App › Source control
  ['scm', 'Add an account', 'github gitea token pull request', 'An account to open pull requests with', 'Add a GitHub or Gitea account'],
  // App › Connect other agents
  ['connect', 'New token', 'mcp token claude code codex connect access', 'A token for an agent elsewhere to start and steer sessions here', 'Make a token for another agent'],
  ['connect', 'What they can do', 'mcp tools list sessions start session send message', 'The tools an agent with a token gets'],
  // App › Machines
  ['machines', 'Add a machine', 'remote ssh server computer connect', 'Another machine running Naget Agent, to use from here'],
  ['machines', 'Access from other machines', 'access token remote', 'Tokens other machines use to reach this one'],
  // Agents › Accounts
  ['accounts', 'Your sign-ins', 'login sign in claude code codex subscription email plan', 'The Claude Code and Codex accounts sessions use'],
  ['accounts', 'More accounts', 'second account work personal subscription', 'Another subscription for an agent'],
  ['accounts', 'Agent programs', 'install claude code codex gemini opencode qwen auggie version', 'Which agent programs are installed, and installing the others'],
  // Agents › More agents
  ['agents', 'Your agents', 'acp agents custom', 'Agents that show next to Claude Code and Codex'],
  ['agents', 'Add your own', 'acp command custom agent', 'Any agent that speaks ACP, by its command', 'Add your own agent'],
  ['agents', 'Agents that speak ACP', 'gemini cli opencode qwen code goose acp', 'Gemini CLI, OpenCode, Qwen Code and Goose, ready to add'],
  // Agents › Models
  ['models', 'Helper model', 'small model haiku memory tidy auto mode second opinion', 'The model for small jobs beside sessions'],
  ['models', 'On this machine', 'local models ollama vllm gpu download', 'Models installed here, and their downloads', 'Models on this machine'],
  ['models', 'Add a model from Hugging Face', 'hugging face hf download install gguf vllm ollama', 'Search, see how each would run here, and install it'],
  ['models', 'OpenRouter', 'openrouter api key models cloud', 'Models through OpenRouter, with your key'],
  ['models', 'Runtimes and endpoints', 'ollama vllm openai compatible endpoint url', 'Ollama, vLLM and other OpenAI-compatible endpoints'],
  ['models', 'Hugging Face token', 'hf token gated private', 'Only for gated or private models'],
  // Agents › Agent Guidelines
  ['guidelines', 'For every session', 'rules instructions preferences system prompt always never how to talk to you tone style claude.md agents.md', 'What every agent follows, in every session', 'Agent Guidelines for every session'],
  ['guidelines', 'For a space', 'space project guidelines instructions', 'Guidelines the sessions in a space follow', 'Guidelines for a space'],
  ['guidelines', 'For one session', 'session guidelines instructions start page', 'Guidelines for one session, from the start page or the session’s menu', 'Guidelines for one session'],
  ['guidelines', 'Files Claude Code and Codex read too', 'claude.md agents.md instruction files project folder', 'CLAUDE.md and AGENTS.md, which Claude Code and Codex read on their own', 'CLAUDE.md and AGENTS.md'],
  // Agents › MCP servers
  ['mcp', 'Add server', 'mcp tools server add', 'A tool server for Claude Code or Codex', 'Add an MCP server'],
  ['mcp', 'Check connections', 'mcp status connected failed', 'See whether each MCP server answers', 'Check MCP servers'],
  // Agents › Skills
  ['skills', 'New skill', 'skill create write', 'Write a skill for Claude Code or Codex'],
  // Agents › Plugins
  ['plugins', 'Installed', 'plugins claude code add-ons', 'The plugins Claude Code has', 'Installed plugins'],
  ['plugins', 'Browse', 'plugins install find', 'Find plugins to install', 'Browse plugins'],
  ['plugins', 'Marketplaces', 'plugins marketplace add', 'Where plugins come from', 'Plugin marketplaces'],
  // Agents › Scheduled tasks
  ['tasks', 'New task', 'schedule cron automation task timer webhook recurring', 'Agent work that starts by itself', 'New scheduled task'],
  ['tasks', 'Start from an example', 'task examples templates automation ideas', 'Ready-made scheduled tasks', 'Scheduled task examples'],
  ['tasks', 'Morning brief', 'daily news weather calendar summary', 'A ready-made scheduled task'],
  ['tasks', 'News on a topic', 'news watch topic daily', 'A ready-made scheduled task'],
  ['tasks', 'Price watch', 'price drop track deal', 'A ready-made scheduled task'],
  ['tasks', 'Page change alert', 'website changed monitor watch', 'A ready-made scheduled task'],
  ['tasks', 'Weekly report from a folder', 'report weekly summary folder', 'A ready-made scheduled task'],
  ['tasks', 'Inbox digest', 'email mail digest summary', 'A ready-made scheduled task'],
  ['tasks', 'Habit check-in', 'habit tracker daily check in', 'A ready-made scheduled task'],
  ['tasks', 'New releases', 'releases versions github watch', 'A ready-made scheduled task'],
  ['tasks', 'Site up check', 'uptime monitor website down', 'A ready-made scheduled task'],
  ['tasks', 'Disk space alert', 'disk storage full alert', 'A ready-made scheduled task'],
  ['tasks', 'Review new pull requests', 'pull requests code review github', 'A ready-made scheduled task'],
  ['tasks', 'New files in a folder', 'folder watch new files', 'A ready-made scheduled task'],
  ['tasks', 'Reminder', 'remind reminder alarm later', 'A ready-made scheduled task'],
  // Capabilities › Search
  ['search', 'Providers', 'web search naget search searxng brave duckduckgo', 'Which search providers agents use, and in what order', 'Web search providers'],
  ['search', 'Naget Search', 'naget search key credits', 'The app’s own web search'],
  ['search', 'SearXNG', 'searxng self-hosted search address', 'A search engine you run yourself'],
  ['search', 'Brave Search', 'brave search api key', 'Web search with a Brave key'],
  ['search', 'DuckDuckGo', 'duckduckgo ddg search', 'Web search without a key'],
  ['search', 'Results per search', 'results count number', 'How many results a search gives'],
  // Capabilities › Browser
  ['browser', 'A browser for agents', 'browser chromium chrome web pages agents', 'Agents open sites, click, type and read pages'],
  ['browser', 'Chromium', 'chrome chromium download browser', 'Which Chromium the browser runs', 'Which Chromium'],
  ['browser', 'Show a window', 'headless window visible browser', 'Run the browser in a window you can see'],
  ['browser', 'Keep pages off this machine and its network', 'localhost local network private security', 'Sites on this computer and its network stay off limits'],
  ['browser', 'Screenshots for models that see images', 'screenshots vision images', 'Models that see images get screenshots of the page'],
  ['browser', 'Sites', 'allow block sites domains list', 'Only these sites, or never these', 'Allowed and blocked sites'],
  ['browser', 'Profiles', 'logins cookies profile sign in sites', 'Separate sign-ins for the browser', 'Browser profiles'],
  // Capabilities › Memory
  ['memory', 'Memory', 'remember notes recall forget', 'Agents start with what earlier sessions kept, and save notes when you ask'],
  ['memory', 'Search by meaning', 'embeddings semantic mdenseon model gpu cpu', 'Finds notes, and anything in this search, by what it means'],
  ['memory', 'Tidy up each night', 'merge duplicates summaries topics profile consolidate', 'The helper model merges notes that say the same thing and sums related ones up'],
  ['memory', 'Tidy up now', 'merge duplicates consolidate clean', 'Tidies memory up at once'],
  ['memory', 'Clear all…', 'delete erase wipe forget everything', 'Deletes every note and its history', 'Clear all memory'],
  ['memory', 'Notes', 'memory notes remembered facts export json markdown', 'Every note kept, by place', 'Memory notes'],
  // Capabilities › Child sessions
  ['children', 'Working at once, per session', 'child sessions parallel subagents concurrency limit', 'How many child sessions one session runs at once'],
  ['children', 'Swarm size', 'swarm mode team of agents subagents parallel angles hard problems math proof', 'How many agents of a swarm work at once'],
  // Capabilities › Images
  ['images', 'Making images', 'image generation pictures openrouter', 'Let agents make images'],
  ['images', 'Image model', 'image model flux openrouter', 'The model that makes them'],
  // Capabilities › Connections
  ['connections', 'Marketplace', 'connections apps marketplace notion linear github google', 'Apps every agent can use, to connect once', 'Connections marketplace'],
  ['connections', 'Add a key', 'api key secret vault token', 'A key agents can use without seeing it', 'Add a key to the vault'],
  // Capabilities › Voice
  ['voice', 'Dictation', 'speech to text dictate microphone voice input', 'Speak a message instead of typing it'],
  ['voice', 'Language you speak', 'language dictation', 'The language dictation listens for'],
  ['voice', 'Speech recognition on the server', 'whisper speech recognition server transcription', 'Recognize speech on this computer or with a service'],
  ['voice', 'Read aloud', 'text to speech tts read replies voice speak', 'Have replies read aloud'],
  // Capabilities › Assistants
  ['assistants', 'New assistant', 'assistant preset create researcher writer tutor', 'A preset to start sessions as'],
  ['assistants', 'Clean up after a task', 'cleanup tidy up remove temp files scratch branches worktrees leftovers', 'Agents remove what they made along the way and no longer need'],
  ['assistants', 'Task folders', 'task folder default folder sessions', 'Where an assistant’s new task folders go'],
  // Capabilities › Skill library
  ['skillpack', 'Learned', 'skills learned approved', 'Skills agents learned with your approval', 'Learned skills'],
  ['skillpack', 'Built in', 'skills bundled', 'Skills that come with the app', 'Built-in skills'],
  ['skillpack', 'Bring skills in by keywords', 'skill triggers keywords auto load', 'Keywords in a message load skills by themselves'],
  // Capabilities › Custom
  ['custom', 'Auto mode', 'auto mode approvals permissions', 'Custom approves safe steps by itself'],
  ['custom', 'Sandbox for commands', 'sandbox bubblewrap security commands', 'Commands run in a sandbox'],
  ['custom', 'Goals', 'goals rounds autonomous long running', 'How many rounds a goal may run'],
];

/** The themes that come with the app: name, and whether it is dark or light. */
export const THEMES: [string, 'dark' | 'light'][] = [
  ['Naget Dark', 'dark'],
  ['Midnight', 'dark'],
  ['Naget Light', 'light'],
  ['Sage', 'light'],
];

const PAGES: [string, string, string, string, string][] = [
  // id, title, path, other words, what it is
  ['new', 'New session', '/', 'start new chat conversation task claude codex agent', 'Start a session with any agent and model, in any folder'],
  ['inbox', 'Inbox', '/inbox', 'waiting approvals approve deny questions forms needs you pending to do', 'Everything waiting on you, across sessions, tasks and machines'],
  ['files', 'Files', '/files', 'explorer browse folders documents', 'Browse, open and edit files'],
  ['search-files', 'Search in files', '/search', 'grep find text in files code', 'Find text in every file of a folder'],
  ['git', 'Git', '/git', 'repositories commits branches push pull diff', 'Repositories, changes, branches and history'],
  ['terminal', 'Terminal', '/terminal', 'shell console command line bash', 'Shells on this computer'],
  ['apps', 'Templates', '/apps', 'app apps gallery templates ready-made tasks tools forms', 'Tasks you run again and again: fill in a form, and an agent does the job'],
  ['new-app', 'New template', '/apps/new', 'create build make new template app apps form tool', 'A template anyone can run from a form'],
  ['spaces', 'Spaces', '/spaces', 'spaces projects workspace group sessions files documents knowledge memory guidelines instructions folder', 'Each project’s sessions, documents and guidelines, together'],
  ['knowledge', 'Shared knowledge', '/knowledge', 'knowledge base documents folder pdf files search rag library cite sources', 'Documents every session can search and cite'],
  ['pages', 'Pages', '/pages', 'saved pages html reports small tools app apps tracker calculator checklist', 'Small tools and pages agents made for you, and what you published'],
  ['published', 'Published pages', '/pages?tab=published', 'published public share link', 'Pages anyone with the link can open'],
  ['preview', 'Preview', '/preview', 'dev server localhost web app browser', 'Look at a dev server running here'],
  ['usage', 'Usage and limits', '/usage', 'usage limits plan quota reset tokens', 'What you have used of each plan, and when it resets'],
  ['arena', 'Model arena', '/arena', 'arena compare models side by side best answer leaderboard rating which model wins vote', 'Which models win on your own tasks, from the answers you kept'],
  ['stats', 'Activity', '/stats', 'activity stats statistics tokens cost', 'What the agents did, over time'],
  ['system', 'System', '/system', 'system cpu gpu memory ram disk processes', 'This computer: processors, GPUs, memory, disks, the busiest processes'],
  ['settings', 'Settings', '/settings', 'settings preferences options configuration', 'Everything the app can be set to'],
  ['guide', 'Help', '/guide', 'help guide manual documentation how to learn tutorial faq questions explain', 'The guide to every part of the app'],
];

const ACTIONS: [CatalogItem['act'] & string, string, string, string][] = [
  ['tour', 'Take the tour', 'help tour guide welcome onboarding how', 'A short walk through the app'],
  ['handsfree', 'Talk hands-free', 'voice speak talk hands free walking listen read aloud conversation microphone', 'Start, steer and check sessions by voice, and hear the results'],
  ['releases', 'Release notes', 'what is new whats new changelog changes version history updates', 'What changed in each version of the app'],
  ['theme', 'Switch between light and dark', 'theme dark light mode appearance night day', 'Turns the theme to light or dark'],
  ['sidebar', 'Show or hide the sidebar', 'sidebar toggle hide show', 'Ctrl+B'],
  ['panel', 'Show or hide the terminal panel', 'terminal panel toggle bottom', 'Ctrl+`'],
];

/** Everything above, as items: pages, actions, sections, options, themes. */
export function catalogItems(): CatalogItem[] {
  const tab = new Map(SECTIONS.map(([id, label, group]) => [id, { label, group }]));
  return [
    ...PAGES.map(([id, title, path, keywords, text]): CatalogItem => ({ id: `go:${id}`, group: 'Go to', title, keywords, text, path })),
    ...ACTIONS.map(([act, title, keywords, text]): CatalogItem => ({ id: `do:${act}`, group: 'Actions', title, keywords, text, act })),
    ...SECTIONS.map(([id, label, group, sub]): CatalogItem => ({ id: `sec:${id}`, group: 'Settings', title: label, keywords: `${group} settings`, text: sub, where: `Settings › ${group}`, section: id })),
    ...OPTIONS.map(([sid, find, keywords, text, title]): CatalogItem => {
      const s = tab.get(sid)!;
      return { id: `opt:${sid}:${find}`, group: 'Settings', title: title ?? find, keywords, text, where: `Settings › ${s.group} › ${s.label}`, section: sid, find };
    }),
    ...THEMES.map(([name, base]): CatalogItem => ({ id: `theme:${name}`, group: 'Themes', title: name, keywords: `theme appearance colours colors ${base}`, text: `A ${base} theme`, where: 'Settings › App › General', theme: name })),
  ];
}
