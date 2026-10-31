# Features

Everything Naget Agent does, by area. [Back to the README](../README.md).

## Sessions
- Start a Claude Code or Codex session in any folder, optionally in a worktree of its own (a new branch in a
  separate folder, so several agents can change one repository at once). Pick the model, how hard it
  thinks, and what it may do without asking you.
- Switch models mid-session, even to the other company's agent: the conversation is handed over.
- Fork a session from any reply, or edit an earlier message and go on from there, with the files put back as
  they were. Compact a long session, stop a turn, resume an old one.
- Give a session a goal (`/goal`): the agent keeps working, turn after turn, until it holds.
- Every session on the machine is listed, including ones open in VS Code or a terminal, with what each is
  doing right now. Snooze one until later, or settle it when you are done for now.
- More agents: besides Claude Code and Codex, any agent that speaks the Agent Client Protocol (Gemini CLI,
  OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, or a command of your own).
- Several accounts per agent: sign in more than one Claude or Codex account and pick one per session; each
  shows its own usage and limits.

## Help with anything

Every agent here gets the same help from the app, whatever its model: Claude Code, Codex, Custom, and the
agents that speak ACP and take MCP servers.

- **Assistants**: start as a Researcher, Writer, Tutor, Planner, Analyst or Coder, or one of your own (its
  instructions, model, tools and connected apps; import Claude Code's agent files). A task without a folder gets
  one of its own (`~/Naget/<date>-<task>`), and you can say once how the agents should talk to you.
- **The web**: search with Naget Search (its own index of the web, papers, patents and filings; free daily
  searches without a key) or SearXNG, Brave Search and DuckDuckGo, by category, site or date, up to 100 results;
  read whole pages, or only the parts that answer a question. Each search shows its results, and each reply its
  sources. [Search providers](search-providers.md).
- **A browser**: agents open sites, click, type and read pages, in a Chromium of their own. You watch it live
  above the message box and take over to log in, solve a check or pay, on a computer or a phone; sites on your
  own network stay off limits unless you allow one.
- **Memory**: after each reply, notes about you, the project and the session are written or updated, and a chip
  under the reply shows what changed (undo, edit, delete). Turn it off for one session or for all; Settings →
  Memory lists every note with when it was written and changed. Agents can also look up earlier sessions.
- **Documents**: agents read PDF, Word, Excel, PowerPoint, OpenDocument and EPUB files, and make them with the
  app's document skills; the file viewer previews them, and finished files show as cards to open or download.
  Images can be made and edited through OpenRouter.
- **Connections**: a marketplace of apps and services (Notion, Linear, GitHub, Google, Stripe and more), signed
  in once for every agent; anyone can add one with a pull request to `catalog/`. Keys live in an encrypted
  vault: agents ask for one with a card and use it without ever seeing it.
- **Child sessions**: an agent hands parts of a job to new sessions, with any agent and model, and gets their
  results back; they show under it in the sidebar.
- **Pages and apps**: pages the agents show can answer back (pick an option, fill in a form), stay in a library
  with storage of their own and an address for a phone's home screen, and folders publish at a link. Apps are
  tasks you repeat, each with a form: from templates or your own, run from the gallery, the API, MCP, a public
  page, or once for each row of a CSV.
- **Skills**: a library that comes with the app (clarify first, check before saying it is done,
  troubleshooting, research, writing, documents) for every agent. Agents propose new skills or fixes to them,
  saved only when you approve.
- **Voice**: dictate into the message box, with the browser's own recognition or, when you turn it on, a model
  on this machine; replies can be read aloud.
- **A second opinion, and caps**: one click has another company's model check a turn's work against what you
  asked; a spending cap stops a session, or a scheduled task's run, at its limit.

## Custom: any model

Custom is the app's own agent, for models beyond Claude Code's and Codex's. It works like them: it reads,
edits and searches files, runs commands, keeps a plan, loads skills, uses the MCP servers set up for Claude
Code and for Codex (and the project's `.mcp.json`), asks before edits and commands (or not, by mode), and condenses a
long conversation to stay within the model's context. In Auto mode routine steps go ahead and a quick check asks you
about risky ones, and commands can run in a sandbox that lets them change files only in the folder and /tmp. Forks,
"Edit from here" (with the files put back) and `/goal` work for it as they do for Claude Code and Codex.

- **A helper for anything**: research, writing, documents and everyday tasks, with an engineer's habits in a code
  project (it runs the project's checks before it says it is done). It reads PDFs, Office files and images
  (described by the helper model for a model that does not see), and web pages as clean Markdown.
- **Careful with commands**: each part of a command is checked. "Always allow" covers just the commands you
  approved (`git status`, `npm run build`), so nothing can ride along after `&&`; commands that only look
  around run freely; risky ones (sudo, deleting outside the folder, running a download) ask every time, in every
  mode. Files outside the folder and files with keys or passwords ask before they are read or changed.
- **Made for any model**: long output is kept in a file the model can page through, repeated or stuck steps
  are caught, malformed tool calls are repaired, independent reads run together, servers run in the
  background, and each model family gets its maker's sampling, edit format and reasoning effort. With many
  tools, the model sees a short catalog and looks up the ones it needs.

Its models come from Settings → Models:

- **OpenRouter**: add a key, then search its catalog (each model's maker, context, longest reply, price,
  release date, and whether it reasons, sees images or calls tools; filter and sort) and add the models to offer.
- **Ollama**: the models of an Ollama server, with GGUF weights pulled straight from Hugging Face.
- **vLLM**: Hugging Face models downloaded here and served on a GPU, started when a session first uses them.
- **Any OpenAI-compatible endpoint** (LM Studio, llama.cpp's server, another provider).

Hugging Face is searched by name, like OpenRouter's catalog: each model shows its maker, size, format (GGUF
for Ollama, safetensors for vLLM), downloads, likes and date, and a first verdict from its size on how it
would run here (a model too big for vLLM as stored may still run at 4-bit with Ollama). Filter to what runs
well here, a format, or models that see images; order by downloads, trend, likes or date. Before anything
downloads, Check tells exactly how it would run on this machine: where (a GPU, or the CPU),
the memory it needs, about how fast, and the disk it takes. Installed models show their size and remove
with one click. Models without native tool calls are told about the tools in their own format, or in the
prompt, and their calls are read from what they write.

The agents' own programs install by themselves when first needed (Claude Code, Gemini CLI, OpenCode…,
with npm into the app's folder), and the copies the app installed are kept up to date.

## Following along
- A readable timeline: the agent's messages read like a chat, and its commands fold into small boxes with
  plain-words names ("Run the tests", "Read index.ts"), each a click away from its full output.
- Agents can answer with a page (a chart, a report, a mock-up), shown in the conversation.
- Every file a turn changed, with its diff. Screenshots you attach show in the conversation and open full size.
- Approve or deny commands and edits, approve plans, and answer the agent's questions from cards in the page.
- Message the agent while it works: your note joins the running turn, or waits in a queue you can reorder and
  edit, attachments included. Quote any part of a reply into your next message.
- Notifications when a session finishes, fails or needs you: in the app, as a system notification, or as a
  push notification on your phone with the app closed.

## Shipping the work
- Open a pull request on GitHub or Gitea from a session's branch, with a description written for you; its
  state and checks show in the sidebar.
- Review what a branch changes file by file, mark files viewed, and let a guide put them in an order that is
  easy to read, with a note on each.
- Share a session with a read-only link that ends when you want.

## Around the agents
- Files: a file browser with git status, an editor, Markdown and HTML preview, diffs, search across files,
  quick open and uploads. Jupyter notebooks open and run.
- Git: your repositories with their changes, ahead/behind counts, fetch, pull and push. Commit from the app (pick
  the files, see each diff, have the message drafted from the changes, commit and push in one go), discard a
  file's changes, switch or create branches and delete merged ones, stash and apply, and open any commit to
  see what it changed.
- Terminal: real shells that survive reloads and server restarts, with suggestions as you type (from your
  history, branches, scripts and folders, or written from a plain description) and an extra row of keys on
  phones.
- Scheduled tasks: agent work, by any agent (Custom included), that starts at a time of day in your time zone,
  every few minutes, once, by a cron expression, when a webhook is called, or when a watcher sees a change (new
  items in a feed, a page or a value in JSON changing, new files in a folder, a command's output): watchers
  check without a model and wake the agent only then. Ask in any conversation ("remind me Friday at 9", "every
  Monday summarize…") and confirm the task in a card; or start from a template, or turn a session that worked
  into one. Each run reports how it went: its history keeps the outcome, a summary, the cost and the session,
  and runs again with the same input. Runs with nothing to report stay quiet, failures always tell you, and
  failures in a row pause the task. Webhooks can require a signature, skip repeated deliveries, filter on the
  payload, and wait for the reply (`?wait=60`). Sessions stopped by a usage limit can continue by themselves
  when it resets.
- Usage: how much of each plan's limits you have used and when they reset, what the same work would cost
  through the API, and activity over time.
- System: CPU, memory, GPUs, disks, network and the busiest processes, live.
- Settings: sign the agents in and out from the browser, and manage MCP servers, skills, plugins and the
  CLAUDE.md / AGENTS.md instruction files.
- An MCP server of its own, so an agent elsewhere can list, read, start and steer sessions here.

## Everywhere
- Works on phones and can be installed as an app. Four themes, light and dark, and your own: every colour
  can be changed.
- Search across all sessions, `Ctrl+K` for anything, `Ctrl+F` within a conversation.
- A short welcome tour asks what you want to use (Claude Code, Codex, models through OpenRouter or on this
  computer, other agents), sets those up in place, then shows you around; the ? button shows it again.
- Starts when the computer starts (on by default; Settings → General), as a service of your user.
- Several machines: add other machines running Naget Agent, over SSH or by address, and switch between
  them from the sidebar. Notices from all of them reach you wherever you are.
