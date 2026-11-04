<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/hydor-logo-dark.svg" />
    <img src="docs/media/hydor-logo-light.svg" width="260" alt="Hydor" />
  </picture>
</h1>

<p align="center"><i>ὕδωρ, "water" in ancient Greek: it takes the shape of whatever holds it.</i></p>

<p align="center">
  Run <b>Claude Code</b>, <b>Codex</b> or <b>any model</b> on your own computer, and use them from any device.
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
- **Follow and steer**: every step in plain words, approvals for commands and edits, each change as a diff.
  Notifications and one inbox for what needs you; carry on from your phone, or hands-free by voice.
- **Replies made to read**: maths drawn from LaTeX, Mermaid diagrams in the app's colours, charts and small tools that
  run right inside a reply, and pictures from the web or your files.
- **Help with anything, not just code**: assistants (Researcher, Writer, Tutor, Planner, Analyst, Coder, App
  builder), web search with the sources each reply cites, a browser you can watch and take over, and deep
  research that ends in a cited report.
- **Apps**: small tools for one job (a trip plan, a product comparison, the weather, a quiz) whose answers open in
  views of their own, with maps, charts, pictures and videos. Use the ready-made ones or make your own; agents
  run them for you in any chat.
- **Things to keep**: pages, slides, documents, spreadsheets and LaTeX, edited in the app and exported to PDF,
  Word, PowerPoint or Excel; pictures, videos, music and voice-overs made through OpenRouter. All of it waits in
  your Library, by project.
- **Memory and know-how**: agents remember you and your projects (found by meaning, on your own computer), follow
  your Agent Guidelines, search your documents, and use more than sixty built-in skills, your own, and plugins.
- **Work that runs by itself**: scheduled tasks, watchers and webhooks, child sessions, and goals an agent keeps
  working on until they hold.
- **Everything around the agents**: a terminal, files, Git (one Sync button, the history as a graph, pull requests),
  usage and limits, several machines, and one search box (`Ctrl+K`) for all of it.
- **Yours**: keys and sign-ins in a vault agents use without seeing them; the app in English, Chinese or Greek;
  ask any agent how the app works, or have it change a setting for you once you confirm.

See [all features](docs/features.md), or the [user guide](docs/guide/), which the app also shows under Help.

## Quick start

On a Mac (macOS 12 or newer, Apple silicon or Intel): download the Mac app from the
[latest release](https://github.com/algoprog/hydor/releases/latest) (`…-arm64-mac.dmg` or `…-x64-mac.dmg`) and drag
it to Applications. It brings everything it needs and keeps itself up to date. See [the Mac app](docs/install.md#the-mac-app).

With Docker, on Linux, macOS or Windows (Intel/AMD and ARM):

```bash
docker run -d --name hydor --restart unless-stopped -p 127.0.0.1:8790:8790 \
  -v hydor-home:/home/node -v "$PWD/workspace:/workspace" algoprog/hydor
docker logs hydor | grep setup   # your one-time setup link
```

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

[MIT](LICENSE). Hydor is an independent project, not affiliated with or endorsed by Anthropic or
OpenAI ([disclaimer](docs/how-it-works.md#disclaimer)).
