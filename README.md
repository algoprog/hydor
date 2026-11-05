<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/hydor-logo-dark.svg" />
    <img src="docs/media/hydor-logo-light.svg" width="260" alt="Hydor" />
  </picture>
</h1>

<p align="center"><i>ὕδωρ, "water" in ancient Greek: it takes the shape of whatever holds it.</i></p>

<p align="center">
  Run <b>Claude Code</b>, <b>Codex</b> or <b>any model</b> on your own computer with a unified memory layer, and use them from any device.
</p>

<p align="center"><a href="https://hydor.app"><b>hydor.app</b></a></p>

<p align="center">
  <a href="https://github.com/algoprog/hydor/releases/latest/download/Hydor-arm64-mac.dmg"><img src="https://img.shields.io/badge/Download_for_Mac-Apple_silicon-111?style=for-the-badge&logo=apple&logoColor=white" alt="Download for Mac (Apple silicon)" /></a>
  <a href="https://github.com/algoprog/hydor/releases/latest/download/Hydor-x64-mac.dmg"><img src="https://img.shields.io/badge/Download_for_Mac-Intel-111?style=for-the-badge&logo=apple&logoColor=white" alt="Download for Mac (Intel)" /></a>
  <a href="https://github.com/algoprog/hydor/releases/latest/download/Hydor-x64-win.exe"><img src="https://img.shields.io/badge/Download_for_Windows-x64-111?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjIiIHk9IjMiIHdpZHRoPSIyMCIgaGVpZ2h0PSIxNCIgcng9IjIiLz48cGF0aCBkPSJNOCAyMWg4TTEyIDE3djQiLz48L3N2Zz4=" alt="Download for Windows (x64)" /></a>
</p>
<p align="center">
  <a href="https://github.com/algoprog/hydor/releases/latest/download/Hydor-x64-linux.deb"><img src="https://img.shields.io/badge/Download_for_Linux-.deb-111?style=for-the-badge&logo=ubuntu&logoColor=white" alt="Download for Linux (.deb, for Ubuntu and Debian)" /></a>
  <a href="https://github.com/algoprog/hydor/releases/latest/download/Hydor-x64-linux.AppImage"><img src="https://img.shields.io/badge/Download_for_Linux-AppImage-111?style=for-the-badge&logo=linux&logoColor=white" alt="Download for Linux (AppImage)" /></a>
  <a href="https://hub.docker.com/r/algoprog/hydor"><img src="https://img.shields.io/badge/Docker-algoprog%2Fhydor-1D63ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker image algoprog/hydor" /></a>
</p>
<p align="center">
  <a href="https://github.com/algoprog/hydor/releases/latest"><img src="https://img.shields.io/docker/v/algoprog/hydor?sort=semver&label=latest&color=0a7ea4" alt="Latest release" /></a>
  <a href="https://hub.docker.com/r/algoprog/hydor"><img src="https://img.shields.io/docker/pulls/algoprog/hydor?color=0a7ea4" alt="Docker pulls" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/algoprog/hydor?color=0a7ea4" alt="License" /></a>
</p>

<p align="center">
  <a href="docs/media/hydor-intro.mp4"><img src="docs/media/hydor-intro.webp" width="720" alt="A 110-second tour of Hydor, drawn in its water style: pick any agent and any model, even one on your own computer, start it in a folder, follow its steps, approve a command and see the diff; ask the Researcher for an e-bike: it searches and reads the web, hands you its browser to sign in, and answers with its sources, a spreadsheet and a memory note; carry on from a phone and turn a follow-up into a scheduled task; run the Trip planner app and see its own view, with pictures and a map; make a picture, a clip and a song; open slides in the Library; then sessions across agents and machines, one search for everything, and the terminal, files, Git, models, projects, skills, plugins, connected apps and usage around them" /></a>
</p>

Hydor is a self-hosted home for AI agents. It runs the official `claude` and `codex` command-line tools with the
plans you already pay for, and its own agent, Custom, gives any model, open-weight ones included, the same tools,
skills and connections. Open it in a browser or on your phone: sessions keep running when you close the tab, and
the ones you start in VS Code or a terminal show up too.

## What it does

- **Any agent, any model**: Claude Code, Codex, Gemini CLI and other [ACP](https://agentclientprotocol.com) agents,
  or Custom with models from OpenRouter, Ollama, or Hugging Face on your own graphics card or Mac (vLLM). Sign in
  several plans, and sessions move to another when one hits its limit.
- **Follow and steer**: every step in plain words, approvals for commands and edits, each change as a diff, and the
  agent's pointer plain to see when it uses its browser or your computer.
  Sessions name themselves from what you asked. Notifications and one inbox for what needs you; carry on from your
  phone, or hands-free by voice.
- **Replies made to read**: maths drawn from LaTeX, Mermaid diagrams in the app's colours, charts and small tools that
  run right inside a reply, and pictures from the web or your files.
- **Help with anything, not just code**: assistants (Researcher, Writer, Tutor, Planner, Analyst, Coder, App
  builder), web search with the sources each reply cites, a browser you can watch and take over, and deep
  research that ends in a cited report. In the desktop apps, agents can also use your computer itself, its screen,
  mouse and keyboard in any app, once you allow it: a glow lines the screen while they work, and Esc stops them.
- **Apps**: small tools for one job (a trip plan, a product comparison, the weather, a quiz) whose answers open in
  views of their own, with maps, charts, pictures and videos. Use the ready-made ones or make your own; agents
  run them for you in any chat. **Explore**, at the top right of the start page, is a magazine made for you:
  articles and recent news on what you work on and care about, picked from your profile and your sessions, and
  updated every day if you like.
- **Things to keep**: pages you write in as in Notion, databases too; slides, documents, spreadsheets and LaTeX you edit as in
  PowerPoint, Word, Excel and Airtable, and Overleaf, with menus you can search, comments agents answer, suggestions
  and tracked changes you accept or reject (an agent's edits too), documents on real pages, equations, charts that sit
  on their cells, filters and dropdowns, videos and connectors on slides, Morph and a visual LaTeX mode with IEEE, ACM
  and Springer papers, exported to Word, PowerPoint or Excel files that look the same in Office (their fonts inside)
  or to PDF; you watch an agent write them as it goes; PowerPoint files open as decks; PDF forms filled and signed,
  by you or an agent, with a signature you draw once; and pictures, videos, music and voice-overs made through
  OpenRouter. Drop files or folders on it and all of it waits in your Library, by project and in folders of your own.
- **Memory and know-how**: agents keep a profile of you and remember your projects, starting each session with what
  bears on your request (found by words and by meaning, on your own computer), follow your Agent Guidelines, search
  your documents, and use more than sixty built-in skills, your own, and plugins, each switched on or off for every
  session or for one project.
- **For researchers**: papers to keep up with (a Paper radar ranked against your projects, citation alerts, new models,
  deadlines), a reading list kept in step with Zotero, a check before you submit a LaTeX paper (references verified
  online, anonymity, page limits, the numbers in your tables) and an arXiv package, simulated reviews and rebuttals, a
  paper turned into a talk, poster and thread, PDFs you highlight and ask about, LaTeX projects shown as a tree of their
  files, and **Experiments**: training runs that wait for a free GPU on your
  machines or a SLURM cluster, kept as records, with an agent on call, sweeps and results tables with significance.
- **For engineers**: failed CI runs looked into, new issues triaged, dependencies kept up to date, alerts answered, the
  commit that broke something found by git bisect, and big changes made in parts by a campaign of agents.
- **Confidential when it must be**: a session on models on your own computer only, for a submission you review,
  patient data or a client's code, with no web, no outside services and commands without network.
- **Work that runs by itself**: scheduled tasks, watchers and webhooks, child sessions, and goals an agent keeps
  working on until they hold.
- **Everything around the agents**: a terminal, files, Git (one Sync button, the history as a graph, pull requests),
  usage and limits, several machines, and one search box (`Ctrl+K`) for all of it.
- **Yours**: share a project with your advisor or students by a link each (they read its drafts and sessions, comment
  by name, and edit if you let them); keys and sign-ins in a vault agents use without seeing them; the app in English, Chinese or Greek;
  ask any agent how the app works, or have it change a setting for you once you confirm.

See [all features](docs/features.md), or the [user guide](docs/guide/), which the app also shows under Help.

## Quick start

Download the app for your computer. Each one brings everything it needs, runs Hydor in a window of its own, and
keeps itself up to date:

- **Mac** (macOS 12 or newer): for [Apple silicon](https://github.com/algoprog/hydor/releases/latest/download/Hydor-arm64-mac.dmg) or [Intel](https://github.com/algoprog/hydor/releases/latest/download/Hydor-x64-mac.dmg); drag it
  to Applications. See [the Mac app](docs/install.md#the-mac-app).
- **Windows** (10 or 11, x64): [the installer](https://github.com/algoprog/hydor/releases/latest/download/Hydor-x64-win.exe), for your account. Agents run their commands in
  [Git for Windows](https://git-scm.com/download/win)' bash, so install that too. See
  [the Windows app](docs/install.md#the-windows-app).
- **Linux** (x64 or ARM, from 2022 on: Ubuntu 22.04, Debian 12, Fedora 36 or newer): the `.deb` for Ubuntu and Debian
  ([x64](https://github.com/algoprog/hydor/releases/latest/download/Hydor-x64-linux.deb), [ARM](https://github.com/algoprog/hydor/releases/latest/download/Hydor-arm64-linux.deb)), or the AppImage for any other
  ([x64](https://github.com/algoprog/hydor/releases/latest/download/Hydor-x64-linux.AppImage), [ARM](https://github.com/algoprog/hydor/releases/latest/download/Hydor-arm64-linux.AppImage)). See
  [the Linux app](docs/install.md#the-linux-app).

Or pick one from the [latest release](https://github.com/algoprog/hydor/releases/latest).

With Docker, on Linux, macOS or Windows (Intel/AMD and ARM):

```bash
docker run -d --name hydor --restart unless-stopped -p 127.0.0.1:8790:8790 \
  -v hydor-home:/home/node -v "$PWD/workspace:/workspace" algoprog/hydor
docker logs hydor | grep setup   # your one-time setup link
```

Or run it on a cloud service, straight from the [Docker image](https://hub.docker.com/r/algoprog/hydor), billed to
your account there:

<p>
  <a href="https://render.com/deploy?repo=https://github.com/algoprog/hydor"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" height="32" /></a>
  <a href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/algoprog/hydor/tree/main"><img src="https://www.deploytodo.com/do-btn-blue.svg" alt="Deploy to DigitalOcean" height="32" /></a>
  <a href="https://app.koyeb.com/deploy?name=hydor&type=docker&image=docker.io/algoprog/hydor:latest&ports=8790;http;/&instance_type=small"><img src="https://www.koyeb.com/static/images/deploy/button.svg" alt="Deploy to Koyeb" height="32" /></a>
</p>

Render keeps your settings and sessions on a disk (a paid plan); on DigitalOcean App Platform and Koyeb they start
afresh when the app is redeployed. Then open the address the service gives you with `/setup?token=…` from its logs.
See [On a cloud service](docs/install.md#on-a-cloud-service).

Or on Linux, as a service of your user (needs Node.js 22.12+, git and tmux):

```bash
git clone https://github.com/algoprog/hydor && cd hydor
./install.sh
```

Open the setup link it prints and choose a password. A short tour, made for people new to AI, sets up what you
want to use: Claude or ChatGPT with the plan you pay for, models through OpenRouter, or a model suggested for your
computer. To use it from your phone, put HTTPS in front of it: see [remote access](docs/remote-access.md).
To build the Docker image yourself, see [With Docker](docs/install.md#with-docker).

## Documentation

- [Features](docs/features.md): everything the app does
- [Installation](docs/install.md): requirements, the Mac app, Docker, the installer and the service, updates
- [Configuration](docs/configuration.md): settings, where data lives, resetting the password
- [Remote access](docs/remote-access.md): your phone and other devices, over HTTPS
- [Several machines](docs/machines.md): agents on other machines, from one place
- [How it works](docs/how-it-works.md): architecture and security
- [Development](docs/development.md): building and changing the app

## License

[Apache License 2.0](LICENSE). Use it, change it and share it as you like; whatever you share that is built on
Hydor keeps its credit, the [NOTICE](NOTICE) file (in your own NOTICE file, your documentation, or where your product
shows the notices of the work it builds on), and says what you changed. Hydor is an independent project, not
affiliated with or endorsed by Anthropic or OpenAI ([disclaimer](docs/how-it-works.md#disclaimer)).
