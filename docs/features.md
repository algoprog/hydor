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

## Custom: any model

Custom is the app's own agent, for models beyond Claude Code's and Codex's. It works like them: it reads,
edits and searches files, runs commands, keeps a plan, loads skills, uses the MCP servers set up for Claude
Code and for Codex (and the project's `.mcp.json`), asks before edits and commands (or not, by mode), and condenses a
long conversation to stay within the model's context.

Its models come from Settings → Models:

- **OpenRouter**: add a key, then search its catalog (each model's maker, context, longest reply, price,
  release date, and whether it reasons, sees images or calls tools; filter and sort) and add the models to offer.
- **Ollama**: the models of an Ollama server, with GGUF weights pulled straight from Hugging Face.
- **vLLM**: Hugging Face models downloaded here and served on a GPU, started when a session first uses them.
- **Any OpenAI-compatible endpoint** (LM Studio, llama.cpp's server, another provider).

Before anything downloads, the app checks how a model would run on this machine: where (a GPU, or the CPU),
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
- Scheduled tasks: agent work that starts on a schedule, once, or when a webhook is called. Sessions stopped
  by a usage limit can continue by themselves when it resets.
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
- Several machines: add other machines running Naget Agent, over SSH or by address, and switch between
  them from the sidebar. Notices from all of them reach you wherever you are.
