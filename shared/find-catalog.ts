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
  act?: 'tour' | 'ask' | 'theme' | 'sidebar' | 'groups' | 'panel' | 'releases' | 'handsfree';
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
  ['machines', 'Machines', 'App', 'Other machines running Hydor, to use from here, and access to this one'],
  ['accounts', 'Accounts', 'Agents', 'The Claude Code and Codex sign-ins every session uses'],
  ['agents', 'More agents', 'Agents', 'Gemini CLI, OpenCode, Qwen Code, Goose and other agents that speak ACP'],
  ['models', 'Models', 'Agents', 'Models for Custom, the app’s own agent: OpenRouter, Ollama, and Hugging Face models run here with vLLM'],
  ['guidelines', 'Agent Guidelines', 'Agents', 'What every agent follows: in every session, in a project, or in one session'],
  ['mcp', 'MCP servers', 'Agents', 'Tools the agents can call'],
  ['skills', 'Skills', 'Agents', 'Written methods agents load when a task calls for one: built in, yours, from plugins and the agents’ own'],
  ['plugins', 'Plugins', 'Agents', 'Add-ons that bring skills, tools and instructions to every agent'],
  ['tasks', 'Scheduled tasks', 'Agents', 'Agent work that starts by itself: on a schedule, once, or when a webhook calls'],
  ['search', 'Search', 'Capabilities', 'How agents search the web: Naget Search and other providers'],
  ['browser', 'Browser', 'Capabilities', 'A web browser agents use, which you can watch and take over'],
  ['computer', 'Computer use', 'Capabilities', 'Agents see your screen and use the mouse and keyboard, in the desktop app'],
  ['memory', 'Memory', 'Capabilities', 'What agents remember about you, your projects and each session, and when it was written'],
  ['children', 'Child sessions', 'Capabilities', 'Agents handing parts of a job to other agents, and swarms for hard problems'],
  ['images', 'Images, video and audio', 'Capabilities', 'Pictures, videos, music and voices agents make for you through OpenRouter, and who writes their captions in the Library'],
  ['voice', 'Voice', 'Capabilities', 'Dictate messages, and have replies read aloud'],
  ['assistants', 'Assistants', 'Capabilities', 'Presets to start sessions as (Researcher, Writer, Tutor…), and where task folders go'],
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
  ['general', 'Delete inactive sessions', 'delete old sessions clean up retention history keep conversations inactive year months', 'Deletes sessions nobody used for a year, or as long as you choose; until then every conversation is kept'],
  ['general', 'Start when this computer starts', 'boot startup login service autostart systemd', 'Starts the app when the computer starts'],
  ['general', 'Update automatically', 'updates upgrade auto update new version restart install', 'Installs new versions by itself: the desktop apps as soon as they are out, after a minute’s notice; a copy from git when you have not used it for a while'],
  ['general', 'Take the tour', 'tour help guide onboarding welcome', 'See what each part of the app does', 'Welcome tour'],
  ['general', 'Tips', 'tips hints help onboarding introduce features skip guide', 'Points out a part of the app the first time you come to it, after the welcome tour'],
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
  ['machines', 'Add a machine', 'remote ssh server computer connect', 'Another machine running Hydor, to use from here'],
  ['machines', 'Access from other machines', 'access token remote', 'Tokens other machines use to reach this one'],
  // Agents › Accounts
  ['accounts', 'Your accounts', 'login sign in claude code codex subscription email plan second account work personal add', 'The Claude Code and Codex sign-ins sessions use, and more you add'],
  ['accounts', 'Switch accounts at a limit', 'auto switch rotate use all accounts usage limit continue other account', 'A session that runs out of usage carries on with another account'],
  ['accounts', 'Agent programs', 'install claude code codex gemini opencode qwen auggie version', 'Which agent programs are installed, and installing the others'],
  ['accounts', 'Update automatically', 'update upgrade newest latest version claude code codex gemini opencode agent programs daily', 'Keeps Claude Code, Codex and the other agent programs at their newest version', 'Update agent programs automatically'],
  // Agents › More agents
  ['agents', 'Your agents', 'acp agents custom', 'Agents that show next to Claude Code and Codex'],
  ['agents', 'Add your own', 'acp command custom agent', 'Any agent that speaks ACP, by its command', 'Add your own agent'],
  ['agents', 'Agents that speak ACP', 'gemini cli opencode qwen code goose acp', 'Gemini CLI, OpenCode, Qwen Code and Goose, ready to add'],
  // Agents › Models
  ['models', 'Helper model', 'small model haiku memory tidy auto mode second opinion', 'The model for small jobs beside sessions'],
  ['models', 'On this machine', 'local models ollama vllm gpu download', 'Models installed here, and their downloads', 'Models on this machine'],
  ['models', 'Add a model from Hugging Face', 'hugging face hf download install gguf vllm ollama suggested recommended for this computer lfm3 gemma flint glm', 'The ones suggested for this computer, or search, see how each would run here, and install it'],
  ['models', 'OpenRouter', 'openrouter api key models cloud suggested gpt grok claude opus', 'Models through OpenRouter, with your key'],
  ['models', 'Runtimes and endpoints', 'ollama vllm openai compatible endpoint url', 'Ollama, vLLM and other OpenAI-compatible endpoints'],
  ['models', 'Hugging Face token', 'hf token gated private', 'Only for gated or private models'],
  // Agents › Agent Guidelines
  ['guidelines', 'For every session', 'rules instructions preferences system prompt always never how to talk to you tone style claude.md agents.md', 'What every agent follows, in every session', 'Agent Guidelines for every session'],
  ['guidelines', 'For a project', 'project space guidelines instructions', 'Guidelines the sessions in a project follow', 'Guidelines for a project'],
  ['guidelines', 'For one session', 'session guidelines instructions start page', 'Guidelines for one session, from the start page or the session’s menu', 'Guidelines for one session'],
  ['guidelines', 'Files Claude Code and Codex read too', 'claude.md agents.md instruction files project folder', 'CLAUDE.md and AGENTS.md, which Claude Code and Codex read on their own', 'CLAUDE.md and AGENTS.md'],
  // Agents › MCP servers
  ['mcp', 'Add server', 'mcp tools server add', 'A tool server for Claude Code or Codex', 'Add an MCP server'],
  ['mcp', 'Check connections', 'mcp status connected failed', 'See whether each MCP server answers', 'Check MCP servers'],
  // Agents › Skills
  ['skills', 'New skill', 'skill create write own add', 'Write a skill for every agent, or for Claude Code or Codex alone'],
  ['skills', 'Built in', 'skills bundled come with the app library', 'The skills that come with the app', 'Built-in skills'],
  ['skills', 'Yours', 'skills learned approved my own written', 'Skills you wrote, or approved when an agent suggested them', 'Your skills'],
  ['skills', 'From plugins', 'plugin skills', 'Skills your plugins bring', 'Skills from plugins'],
  ['skills', 'Claude Code and Codex', 'claude code codex own skills folder', 'The agents’ own skills, which only they get', 'Claude Code’s and Codex’s own skills'],
  ['skills', 'Suggest skills that fit', 'skill suggestions match retrieval relevant meaning words', 'A new session’s agent hears which skills fit its first message'],
  ['skills', 'Bring skills in by keywords', 'skill triggers keywords auto load', 'Keywords in a message load skills by themselves'],
  ['skills', 'Make my own version', 'change edit built-in skill override customise customize', 'Change a built-in skill: your version takes its place', 'Change a built-in skill'],
  // Agents › Plugins
  ['plugins', 'Your plugins', 'plugins installed added on off every agent', 'The plugins you added, on or off for every agent'],
  ['plugins', 'Come with the app', 'built-in plugins add sqlite speech to text transcribe ocr python data audio video ebooks epub library docs meeting recordings', 'Plugins that come with the app, ready to add', 'Built-in plugins'],
  ['plugins', 'Make a plugin', 'create build new plugin package share editor own', 'Bundle skills, tools, instructions and files of your own as a plugin'],
  ['plugins', 'From a link', 'add plugin github git repository url install', 'Add a plugin from GitHub or another Git address', 'Add a plugin from a link'],
  ['plugins', 'From a .zip file', 'add plugin zip file import upload', 'Add a plugin someone packed into a .zip', 'Add a plugin from a file'],
  ['plugins', 'Pack into a .zip', 'export share package plugin zip download', 'A plugin as one file to share', 'Pack a plugin into a .zip'],
  ['plugins', 'Claude Code', 'claude code plugins marketplaces install', 'Claude Code’s own plugins and marketplaces', 'Claude Code’s plugins'],
  ['plugins', 'Codex', 'codex plugins marketplaces', 'Codex’s own plugins and marketplaces', 'Codex’s plugins'],
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
  ['tasks', 'CI doctor', 'ci failed build flaky tests github actions gitlab buildkite circleci logs fix rerun webhook', 'A ready-made scheduled task'],
  ['tasks', 'Issue triage', 'new issues labels duplicates bug reports reproduction github gitea webhook', 'A ready-made scheduled task'],
  ['tasks', 'Dependency gardener', 'dependencies upgrades outdated packages npm pip security advisories pull requests weekly', 'A ready-made scheduled task'],
  ['tasks', 'Incident first responder', 'incident alert outage sentry grafana datadog better stack rollback postmortem on call', 'A ready-made scheduled task'],
  ['tasks', 'New files in a folder', 'folder watch new files', 'A ready-made scheduled task'],
  ['tasks', 'Reminder', 'remind reminder alarm later', 'A ready-made scheduled task'],
  // Capabilities › Search
  ['search', 'Providers', 'web search naget search searxng brave duckduckgo', 'Which search providers agents use, and in what order', 'Web search providers'],
  ['search', 'Naget Search', 'naget search key credits', 'The app’s own web search'],
  ['search', 'SearXNG', 'searxng self-hosted search address', 'A search engine you run yourself'],
  ['search', 'Brave Search', 'brave search api key', 'Web search with a Brave key'],
  ['search', 'DuckDuckGo', 'duckduckgo ddg search', 'Web search without a key'],
  ['search', 'Results per search', 'results count number', 'How many results a search gives'],
  // Capabilities › Computer use
  ['computer', 'Let agents use this computer', 'computer use control mac windows pc linux desktop apps screen mouse keyboard click type screenshot glow esc stop', 'Agents see the screen and use the mouse and keyboard, in any app (for websites they keep to the browser). Each session asks you first'],
  ['computer', 'Accessibility', 'accessibility permission mouse keyboard control macos privacy', 'macOS’s permission for Hydor to use the mouse and keyboard', 'Accessibility permission'],
  ['computer', 'Screen Recording', 'screen recording permission screenshot see screen macos privacy', 'macOS’s permission for Hydor to see the screen', 'Screen Recording permission'],
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
  ['memory', 'Notes each agent starts with', 'top k how many notes retrieval relevant context memory count', 'Besides your profile: the notes that bear most on what you ask, then the latest'],
  ['memory', 'Tidy up each night', 'merge duplicates summaries topics profile consolidate', 'The helper model merges notes that say the same thing and sums related ones up'],
  ['memory', 'Tidy up now', 'merge duplicates consolidate clean', 'Tidies memory up at once'],
  ['memory', 'Your profile', 'user profile about me who i am preferences personal edit', 'What every agent gets about you at the start of a session; agents keep it current'],
  ['memory', 'Profile length', 'profile longest words limit maximum size shorten', 'The most words your profile may have; longer, the helper model shortens it'],
  ['memory', 'Notes', 'memory notes remembered facts export json markdown', 'Every note kept, by place', 'Memory notes'],
  ['memory', 'Add a note', 'remember new note write fact tell agents', 'Write a note for agents to remember, about you or a project', 'Add a memory note'],
  ['memory', 'Deleted notes', 'trash bin restore undelete recover erase', 'Notes deleted in the last 30 days, to restore', 'Deleted memory notes'],
  ['memory', 'Export', 'download backup save copy json markdown', 'Every note as Markdown to read, or as JSON with histories', 'Export memory notes'],
  ['memory', 'Clear all…', 'delete erase wipe forget everything', 'Deletes every note and its history', 'Clear all memory'],
  // Capabilities › Child sessions
  ['children', 'Working at once, per session', 'child sessions parallel subagents concurrency limit', 'How many child sessions one session runs at once'],
  ['children', 'Swarm size', 'swarm mode team of agents subagents parallel angles hard problems math proof campaign migration', 'How many agents of a swarm or campaign work at once'],
  // Capabilities › Images, video and audio
  ['images', 'Making images', 'image generation pictures openrouter', 'Let agents make images'],
  ['images', 'Image model', 'image model seedream flux gemini openrouter', 'The model that makes them'],
  ['images', 'Making videos', 'video generation clips movies animation openrouter', 'Let agents make videos'],
  ['images', 'Video model', 'video model seedance veo kling wan openrouter price a second', 'The model that makes videos'],
  ['images', 'Making audio', 'audio generation music songs jingles voice over narration speech text to speech tts sound effects ambience openrouter', 'Let agents make audio'],
  ['images', 'Music model', 'music model lyria songs jingles openrouter price a song', 'The model that makes music'],
  ['images', 'Voice and sound model', 'voice model speech tts narration sound effects seed audio elevenlabs gemini voice cloning copy a voice openrouter', 'The model that makes voices and sounds'],
  ['images', 'Captions in the Library', 'caption title description vision model library media frames provider claude ollama', 'The model that writes the titles and descriptions of the images, videos and audio you keep', 'Captions for images, videos and audio'],
  // Capabilities › Connections
  // Capabilities › Voice
  ['voice', 'Dictation', 'speech to text dictate microphone voice input', 'Speak a message instead of typing it'],
  ['voice', 'Language you speak', 'language dictation', 'The language dictation listens for'],
  ['voice', 'Speech recognition on the server', 'whisper speech recognition server transcription', 'Recognize speech on this computer or with a service'],
  ['voice', 'Read aloud', 'text to speech tts read replies voice speak', 'Have replies read aloud'],
  // Capabilities › Assistants
  ['assistants', 'New assistant', 'assistant preset create researcher writer tutor', 'A preset to start sessions as'],
  ['assistants', 'Clean up after a task', 'cleanup tidy up remove temp files scratch branches worktrees leftovers', 'Agents remove what they made along the way and no longer need'],
  ['assistants', 'Task folders', 'task folder default folder sessions', 'Where an assistant’s new task folders go'],
  // Capabilities › Custom
  ['custom', 'Auto mode', 'auto mode approvals permissions', 'Custom approves safe steps by itself'],
  ['custom', 'Sandbox for commands', 'sandbox bubblewrap security commands', 'Commands run in a sandbox'],
  ['custom', 'Goals', 'goals rounds autonomous long running', 'How many rounds a goal may run'],
];

/** The themes that come with the app: name, and whether it is dark or light. */
export const THEMES: [string, 'dark' | 'light'][] = [
  ['Hydor Dark', 'dark'],
  ['Midnight', 'dark'],
  ['Hydor Light', 'light'],
  ['Sage', 'light'],
];

const PAGES: [string, string, string, string, string][] = [
  // id, title, path, other words, what it is
  ['new', 'New session', '/', 'start new chat conversation task claude codex agent', 'Start a session with any agent and model, in any folder'],
  ['inbox', 'Inbox', '/inbox', 'waiting approvals approve deny questions forms needs you pending to do', 'Everything waiting on you, across sessions, tasks and machines'],
  ['files', 'Files', '/files', 'explorer browse folders documents system', 'Browse, open and edit the files on this computer'],
  ['search-files', 'Search in files', '/search', 'grep find text in files code names where folder', 'Find files by their names and the text inside them, in any folder'],
  ['files-recent', 'Recent files', '/files?place=recent', 'recent files opened lately last history', 'The files you opened lately'],
  ['files-trash', 'Trash', '/files?place=trash', 'trash deleted files put back restore undelete recycle bin empty', 'What you deleted in Files, to put back or delete for good'],
  ['git', 'Git', '/git', 'repositories commits branches push pull sync diff merge conflicts rebase stash clone tags history graph', 'Repositories, changes, branches and history'],
  ['git-bisect', 'Find what broke it', '/git?tab=history&bisect=1', 'bisect git bisect regression first bad commit which commit broke worked before used to work', 'An agent finds the commit that broke something, between where it worked and now'],
  ['terminal', 'Terminal', '/terminal', 'shell console command line bash', 'Shells on this computer'],
  ['apps', 'Apps', '/apps', 'app apps agent apps gallery templates ready-made tasks tools forms install uninstall download file view chart map weather recipes quiz find', 'Small tools that find things out and show them clearly: open one here, or ask in any chat'],
  ['connected', 'Connected apps', '/apps/connected', 'connections connected accounts services integrations notion linear github google gmail slack calendar sign in oauth mcp', 'Services every agent can use, connected once'],
  ['connections-market', 'Connect a service', '/apps/connected?tab=market', 'marketplace services connect add catalog notion linear github google', 'The marketplace of services agents can use, to connect once'],
  ['keys', 'Keys', '/apps/connected?tab=keys', 'api key secret vault token password sign-in login credentials add a key', 'Keys agents use without seeing them: your vault'],
  ['new-app', 'New app', '/apps/new', 'create build make new template app apps form tool', 'An app anyone can run from a form'],
  ['spaces', 'Projects', '/projects', 'projects spaces project workspace group sessions files documents knowledge memory guidelines instructions skills folder library overview', 'Each project’s sessions, files, documents and Library, together'],
  ['knowledge', 'Shared knowledge', '/knowledge', 'knowledge base documents folder pdf files search rag library cite sources', 'Documents every session can search and cite'],
  ['library', 'Library', '/library', 'library saved pages html reports small tools tracker calculator checklist edit editor notion blocks slash slides decks presentations documents spreadsheets notebooks jupyter images pictures videos audio sounds music media kept export pdf word powerpoint projects spaces by project move', 'What agents made for you and what you kept: pages, slides, documents, pictures, videos and sounds, by project'],
  ['media', 'Pictures', '/library?kind=image', 'images pictures photos drawings media kept saved generated library titles descriptions captions', 'The pictures agents made that you kept, each with a title and a description'],
  ['videos', 'Videos', '/library?kind=video', 'videos clips movies films media kept saved generated library titles descriptions captions frames', 'The videos agents made that you kept, each with a title and a description'],
  ['audio', 'Audio', '/library?kind=audio', 'audio sounds music songs jingles voices voice overs speech narration sound effects recordings media kept saved generated library titles descriptions', 'The music, voices and sounds agents made that you kept, each with a title and a description'],
  ['new-page', 'New page', '/library?new=1', 'make create new page blank notes checklist tracker write design editor', 'A page of your own: blank, notes, a checklist or a tracker, or one an agent makes'],
  ['new-slides', 'New slides', '/library?new=slides', 'make create new slides slide deck presentation powerpoint keynote google slides talk pitch present morph icons equations video groups laser pen captions', 'Slides of your own to edit and present, or a deck an agent makes'],
  ['new-doc', 'New document', '/library?new=doc', 'make create new document doc word docx google docs write letter report cv essay notes open import comments table of contents equations header footer page numbers', 'A document to write and edit as in Word, or one an agent writes'],
  ['new-sheet', 'New spreadsheet', '/library?new=sheet', 'make create new spreadsheet sheet excel xlsx csv google sheets airtable table budget formulas open import filters charts conditional formatting dropdowns checkboxes kanban pivot', 'A spreadsheet with formulas as in Excel, or one an agent makes'],
  ['new-tex', 'New LaTeX document', '/library?new=tex', 'make create new latex tex overleaf paper thesis article math equations pdf typeset bibtex visual symbols references doi arxiv templates beamer cv poster', 'LaTeX source beside its typeset pages, or a paper an agent writes'],
  ['new-notebook', 'New notebook', '/library?new=notebook', 'make create new notebook jupyter ipynb python colab cells code run data analysis plot chart open import', 'A Jupyter notebook to write and run here, or one an agent makes'],
  ['published', 'Published', '/library?tab=published', 'published public share link site pages folder', 'Pages and sites anyone with the link can open'],
  ['preview', 'Preview', '/preview', 'dev server localhost web app browser phone tablet screen picture screenshot', 'The web apps running on this computer, to look at from any device'],
  ['usage', 'Usage and limits', '/usage', 'usage limits plan quota reset tokens', 'What you have used of each plan, and when it resets'],
  ['arena', 'Model arena', '/arena', 'arena compare models side by side best answer leaderboard rating which model wins vote', 'Which models win on your own tasks, from the answers you kept'],
  ['stats', 'Activity', '/stats', 'activity stats statistics tokens cost', 'What the agents did, over time'],
  ['system', 'System', '/system', 'system computer overview machine files git terminal preview monitor', 'This computer: its files, Git, terminals, the web apps running on it, and how busy it is'],
  ['monitor', 'Monitor', '/system/monitor', 'cpu gpu memory ram disk processes network temperature busy load notebook kernels', 'How busy this computer is: processors, graphics cards, memory, disks and the busiest processes'],
  ['settings', 'Settings', '/settings', 'settings preferences options configuration', 'Everything the app can be set to'],
  ['guide', 'Help', '/guide', 'help guide manual documentation how to learn tutorial faq questions explain ask agent', 'The guide to every part of the app, and an agent to ask about it'],
];

const ACTIONS: [CatalogItem['act'] & string, string, string, string][] = [
  ['tour', 'Take the tour', 'help tour guide welcome onboarding how', 'A short walk through the app'],
  ['ask', 'Ask an agent about the app', 'help question how do i where is what does explain ask agent support', 'An agent answers from the guide, and can change a setting or set something up for you'],
  ['handsfree', 'Talk hands-free', 'voice speak talk hands free walking listen read aloud conversation microphone', 'Start, steer and check sessions by voice, and hear the results'],
  ['releases', 'Release notes', 'what is new whats new changelog changes version history updates', 'What changed in each version of the app'],
  ['theme', 'Switch between light and dark', 'theme dark light mode appearance night day', 'Turns the theme to light or dark'],
  ['sidebar', 'Show or hide the sidebar', 'sidebar toggle hide show', 'Ctrl+B'],
  ['groups', 'Group sessions by folder or project', 'sidebar session list group by folder project space organize sort by date day', 'In the sidebar: a group for each project and each folder you work in, or every session by day'],
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
