<p align="center">
  <img src="web/public/icon-512.png" width="96" height="96" alt="" />
</p>

<h1 align="center">Naget Agent</h1>

<p align="center">
  Run <b>Claude Code</b>, <b>Codex</b> or <b>any model</b> on your own computer, access from any device.
</p>

<p align="center">
  <a href="docs/media/naget-agent-intro.mp4"><img src="docs/media/naget-agent-intro.webp" width="720" alt="A 90-second tour of Naget Agent: pick any agent and any model, even one on your own GPU, start it in a folder, follow its steps, approve a command and see the diff; start a Researcher that searches and reads the web, take over its browser to sign in, and get a spreadsheet with its sources and a memory note; carry on from a phone and turn a follow-up into a scheduled task, see child sessions and other machines, search everything at once, and the Git, models, apps, pages, connections and skills around them" /></a>
</p>

Naget Agent is a self-hosted agent harness. It works on top of the coding agents you already use,
running the official `claude` and `codex` command-line tools with your own subscriptions, and on top of the
models themselves: its own agent, Custom, gives any model, open-weight ones included, the same tools, skills
and MCP servers. All of it in one interface you can open from your desk or your phone. Sessions keep running
when you close the tab, and the ones you start in VS Code or a terminal show up too.

## What you can do

- Start Claude Code, Codex or another [ACP](https://agentclientprotocol.com) agent (Gemini CLI, OpenCode…) in any folder,
  their programs installed and kept up to date for you
- Find every session with activity in the last five minutes in the sidebar’s Active group, plus sessions
  waiting to resume automatically after a usage limit
- A rotating ring on the prompt bar’s Stop button makes running sessions easy to spot
- Follow every step in plain words, approve commands and edits, and see each change as a diff; Custom shows
  the vertically aligned Naget loading animation while it works
- Get a notification when a session finishes or needs you (approve right from it), see everything waiting on you
  in one inbox, and carry on from your phone, or talk to it hands-free while you walk
- Open pull requests on GitHub or Gitea, and review a branch file by file
- Use a terminal, a file browser (add files to a space or a new session in a click, a trash to put things back
  from, Word, Excel, CSV and LaTeX files edited in place in the editors below), git (one Sync button, the history
  as a graph, merges and conflicts in plain words), notebooks, scheduled tasks and your plans' limits in the same app
- Switch between several accounts and machines from the sidebar, and sign in several Claude or Codex plans: when
  one hits its limit, sessions carry on with another
- OpenRouter costs and token usage appear automatically, with prices fetched from OpenRouter
- Run Custom, the app’s own agent, with any model: OpenRouter, Ollama, or a Hugging Face model on your GPU with vLLM
- Get help with anything, not just code: assistants for research, writing and planning (switch between them
  mid-session), web search (Naget Search by default) and a browser you can watch and take over, documents in and
  out, small tools and pages you keep (watch them being written and change them yourself, in a visual editor that
  works on phones too, or in their code), slides to edit and present as in PowerPoint or Google Slides, documents,
  spreadsheets and LaTeX to edit as in Word, Excel and Overleaf (or opened from your files), PDF, Word, PowerPoint,
  Excel and LaTeX exports, an agent that changes what you have open, pictures and short videos made with
  OpenRouter's models once you check their settings and price, all kept in your Library (each image and video with
  a title and a description a model writes for it), and apps for tasks you repeat: one agent, or steps with data, a
  memory and a screen of their own, their answers in views made for them (pages, elements, buttons that act,
  maps, 2D and 3D plots, pictures, videos and widgets of their own), the keys they need asked for once and kept
  in the vault, shared as one file with their own pictures and videos (ready-made ones too); ask for what one
  does in any session and the agent runs it there, asking you for what is missing on the app's own card
- Give every agent memory of you and your projects, your documents (knowledge bases it searches and cites),
  your services (connected once, beside your apps), keys and sign-ins it uses without ever seeing them, skills, child
  sessions, and tasks that run on a schedule or when something changes
- Keep each project together in a space, with its own documents, guidelines and skills, run deep research that
  ends in a cited report, compare models side by side, and use the app in English, Chinese or Greek
- Write your Agent Guidelines once, for every session, a space or one session, and every agent follows them,
  whichever it is
- Ask any agent how the app works, from Help or in any session, or have it change a setting or set something up
  for you (a space, an assistant, a scheduled task): it reads the app's own guide and asks you to confirm each change
  on a card

See [all features](docs/features.md), or the [user guide](docs/guide/), which the app also shows under Help.

## Quick start

On a Mac (macOS 12 or newer, Apple silicon or Intel): download the Mac app from the
[latest release](https://github.com/Naget-Inc/naget-agent/releases/latest) (`…-arm64-mac.dmg` or `…-x64-mac.dmg`),
drag it to Applications and open it. It brings everything it needs, opens in its own window, stays in the menu bar
and keeps itself up to date: a new version installs itself a minute after it says so (or later, if you like). See
[the Mac app](docs/install.md#the-mac-app).

With Docker, on Linux, macOS or Windows (the image runs on Intel/AMD and ARM):

```bash
docker run -d --name naget-agent --restart unless-stopped -p 127.0.0.1:8790:8790 \
  -v naget-agent-home:/home/node -v "$PWD/workspace:/workspace" nagetai/naget-agent
docker logs naget-agent | grep setup   # your one-time setup link
```

Or build the image yourself, with your own user ids for the files the agents create:

```bash
git clone https://github.com/Naget-Inc/naget-agent && cd naget-agent
printf 'UID=%s\nGID=%s\n' "$(id -u)" "$(id -g)" > .env && mkdir -p workspace
docker compose up -d --build
docker compose logs | grep setup
```

Or on Linux, as a service of your user (needs Node.js 22.12+, git and tmux):

```bash
git clone https://github.com/Naget-Inc/naget-agent && cd naget-agent
./install.sh
```

Open the setup link it prints, choose a password, and a short tour sets up what you want to use: Claude Code,
Codex, models through OpenRouter or on your own GPU, or other agents. After it, tips introduce the rest of the
app the first time you come to each part.
To use it from your phone, put HTTPS in front of it: see [remote access](docs/remote-access.md).

## Documentation

- [Features](docs/features.md): everything the app does
- [Installation](docs/install.md): requirements, the Mac app, Docker, the installer and the service, updates
- [Configuration](docs/configuration.md): settings, where data lives, resetting the password
- [Remote access](docs/remote-access.md): your phone and other devices, over HTTPS
- [Several machines](docs/machines.md): agents on other machines, from one place
- [How it works](docs/how-it-works.md): architecture and security
- [Development](docs/development.md): building and changing the app

## License

[MIT](LICENSE). Naget Agent is an independent project, not affiliated with or endorsed by Anthropic or
OpenAI ([disclaimer](docs/how-it-works.md#disclaimer)).
