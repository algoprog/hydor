<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/hydor-logo-dark.svg" />
    <img src="docs/media/hydor-logo-light.svg" width="260" alt="Hydor" />
  </picture>
</h1>

<p align="center"><i>ὕδωρ, "water" in ancient Greek: it takes the shape of whatever holds it.</i></p>

<p align="center">
  Run <b>Claude Code</b>, <b>Codex</b> or <b>any model</b> on your own computer with unified memory, and use them from any device.
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
  <a href="docs/media/hydor-intro.mp4"><img src="docs/media/hydor-intro.webp" width="720" alt="A 110-second tour of Hydor: any agent and any model, sessions followed from any device, research with its sources, apps with views of their own, pictures, video and music made with AI, and the Library" /></a>
</p>

Hydor is a self-hosted home for AI agents. It runs the official `claude` and `codex` tools on the plans you already
pay for, and its own agent gives any model, open-weight ones included, the same tools, skills and connections.
Sessions keep running when you close the tab, and the ones you start in VS Code or a terminal show up too.

## What it does

- **Any agent, any model**: Claude Code, Codex, Gemini CLI and other [ACP](https://agentclientprotocol.com) agents, or
  any model through OpenRouter, Ollama or vLLM. Several plans, switched when one reaches its limit.
- **Follow and steer**: every step in plain words, approvals, diffs, notifications and one inbox; carry on from your
  phone, from a Telegram chat, or by voice. Send corrections into a running Custom turn, or queue them for later.
- **Answers you can use**: replies show maths, diagrams and pictures, and more than a hundred answer UIs (comparison
  tables, charts, maps, recipes, forecasts, itineraries, quizzes, calculators) that agents fill in as they answer.
- **Agents of your own**: say what one should do and it is drafted for you; each works everywhere or in some projects,
  on its own schedules, thinks with a model tier (Quick, Standard or Best, stepping up when a cheap try falls short),
  hands parts of its work to other agents, hands back checked results to files, the Library, webhooks or
  notifications, can keep one conversation with an inbox, and keeps to a monthly budget. A new project can get one
  fitted to it, in your language.
- **More than code**: web search with cited sources, deep research, a browser you can take over, and in
  the desktop apps your computer's own screen, mouse and keyboard, once you allow it.
- **Apps**: small tools for one job (a trip plan, a product comparison, a quiz), each with a view of its own.
- **A Library to keep things in**: pages and databases as in Notion; documents, spreadsheets, slides and LaTeX as in
  Word, Excel, PowerPoint and Overleaf, with AI built in; posters and social posts as in Canva; diagrams as in
  draw.io; picture, video and sound editors; Office files and PDFs in and out. Comment on words as you read, and have an
  agent make the changes and resolve the comments in one click. Share any of it with people by a link of their own, to
  comment or to edit.
- **Memory**: a profile of you, notes on your projects that the app checks against your conversations each day, your
  guidelines, and more than sixty skills and plugins. Bring in what ChatGPT, Claude, Claude Code, Codex, Hermes or
  OpenClaw already know about you.
- **For researchers**: a paper radar, a reading list synced with Zotero, a check before you submit a LaTeX paper, and
  experiments that wait for a free GPU.
- **For engineers**: failed CI runs looked into, issues triaged, dependencies updated, and large changes made by a team
  of agents.
- **Work that runs by itself**: scheduled tasks, watchers, webhooks, and goals an agent keeps working on.
- **Around the agents**: a terminal, files, Git, usage and limits (under System), several machines, and one search box
  (`Ctrl+K`).
- **Private when it must be**: confidential sessions on local models only, and a vault of keys agents use without
  seeing them.

See [all features](docs/features.md), or the [user guide](docs/guide/), which the app also shows under Help.

## Quick start

Download the app for Mac, Windows or Linux with the buttons above, or from the
[latest release](https://github.com/algoprog/hydor/releases/latest). It brings everything it needs and keeps itself
up to date; on Windows, install [Git for Windows](https://git-scm.com/download/win) too.
[Installation](docs/install.md) has the details.

With Docker, on Linux, macOS or Windows (Intel/AMD and ARM):

```bash
docker run -d --name hydor --restart unless-stopped -p 127.0.0.1:8790:8790 \
  -v hydor-home:/home/node -v "$PWD/workspace:/workspace" algoprog/hydor
docker logs hydor | grep setup   # your one-time setup link
```

On a cloud service, from the same image ([notes](docs/install.md#on-a-cloud-service)):

<p>
  <a href="https://render.com/deploy?repo=https://github.com/algoprog/hydor"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" height="32" /></a>
  <a href="https://cloud.digitalocean.com/apps/new?repo=https://github.com/algoprog/hydor/tree/main"><img src="https://www.deploytodo.com/do-btn-blue.svg" alt="Deploy to DigitalOcean" height="32" /></a>
  <a href="https://app.koyeb.com/deploy?name=hydor&type=docker&image=docker.io/algoprog/hydor:latest&ports=8790;http;/&instance_type=small"><img src="https://www.koyeb.com/static/images/deploy/button.svg" alt="Deploy to Koyeb" height="32" /></a>
</p>

On Linux, as a service of your user (needs Node.js 22.12+, git and tmux):

```bash
git clone https://github.com/algoprog/hydor && cd hydor
./install.sh
```

Open the setup link, choose a password, and a short tour sets up the plans or models you want to use. To reach it from
your phone, put HTTPS in front of it: see [remote access](docs/remote-access.md).

## Documentation

- [Features](docs/features.md): everything the app does
- [Installation](docs/install.md): requirements, the Mac app, Docker, the installer and the service, updates
- [Configuration](docs/configuration.md): settings, where data lives, resetting the password
- [Remote access](docs/remote-access.md): your phone and other devices, over HTTPS
- [Several machines](docs/machines.md): agents on other machines, from one place
- [How it works](docs/how-it-works.md): architecture and security
- [Development](docs/development.md): building and changing the app

## License

[Apache License 2.0](LICENSE). What you share that is built on Hydor keeps its [NOTICE](NOTICE) and says what you
changed. Hydor is independent, not affiliated with or endorsed by Anthropic or OpenAI
([disclaimer](docs/how-it-works.md#disclaimer)).
