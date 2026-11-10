<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/hydor-logo-dark.svg" />
    <img src="docs/media/hydor-logo-light.svg" width="260" alt="Hydor" />
  </picture>
</h1>

<p align="center"><i>ὕδωρ, "water" in ancient Greek: it takes the shape of whatever holds it.</i></p>

<p align="center">
  Run <b>Claude Code</b>, <b>Codex</b>, <b>Hermes Agent</b>, <b>pi</b> or <b>any model</b> on your own computer, with one memory, from any device.
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

Hydor is a free, open-source app that runs the AI agents you already use on your own computer, with one memory for
all of them and every session in your pocket: the official `claude` and `codex` tools on the plans you pay for, Hermes
Agent, pi, Gemini CLI and other agents, and its own agent for any model, open-weight ones included. Sessions keep
running when you close the tab, and the ones you start in VS Code or a terminal show up too.

## Three ways in

**For coding.** Run the official Claude Code and Codex on the plans you already pay for, and follow, steer and approve
their work from your phone: every step in plain words, every change as a diff. A strong model leads and hands the clear
parts to cheaper helpers: in our benchmark of 10 November 2026 the team passed every check at 9% less than the best
tier alone, and 67% less than running everything on the strongest model
([the numbers](docs/plans/tiers-and-the-team.md)). See [Sessions](docs/guide/02-sessions.md).

**For everything else.** Research with cited sources, a browser you can take over, and a Library where agents write
documents, slides, spreadsheets, LaTeX and diagrams that you edit as in Word, PowerPoint, Excel and Overleaf. Small
[apps](docs/guide/10-apps.md) do one job each, from a trip plan to a product comparison. See the
[Library](docs/guide/11-library.md) and [research](docs/guide/08-research.md).

**Private.** Confidential sessions that use only models on your own computer, a vault of keys that agents use without
seeing them, and no telemetry: there are no analytics libraries in the code. Your sessions, files and memory live on
your machine. See [keep a session confidential](docs/guide/02-sessions.md#keep-a-session-confidential) and
[how it works](docs/how-it-works.md).

## Already use another agent?

- **Run it inside Hydor.** Hermes Agent, pi, Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI and Auggie run as
  agents of Hydor, beside Claude Code, Codex and its own agent ([agents and models](docs/guide/16-agents-models.md)).
- **Bring in what it knows.** **Settings → Memory → Bring in** takes the memory and the skills you made in Hermes
  Agent, OpenClaw, pi and Atomic Agent, and what ChatGPT, Claude, Claude Code and Codex know about you. You see it
  all first and pick what comes over, and the setup tour offers it when it finds one of them
  ([memory](docs/guide/06-memory.md)).
- **Talk to your agents from a chat app.** Telegram, Discord or Slack, under **Settings → Chat apps**
  ([devices](docs/guide/20-devices.md)).

## Learns, with your OK

Memory is one set of notes for every agent, found by meaning and checked against your conversations each day. After a
hard task an agent can propose its method as a skill. Nothing is kept until you approve it, and you can read, edit and
delete all of it ([memory](docs/guide/06-memory.md), [skills](docs/guide/13-skills.md)).

## How it compares

As of 10 November 2026. Hydor runs the official Claude Code and Codex on your own plans, runs Hermes Agent, pi and
OpenClaw inside it, and gives all of them one memory, a phone app and a Library. Each page has its sources.

| | Hydor | [Hermes Agent](docs/compare/hermes-agent.md) | [pi](docs/compare/pi.md) | [Atomic Agent](docs/compare/atomic-agent.md) | [OpenClaw](docs/compare/openclaw.md) |
|---|---|---|---|---|---|
| Official Claude Code and Codex on your plans, with VS Code and terminal sessions shown | ✓ | Partial: Claude Code, through a skill | — Its own agent | Partial: drives your sign-ins | Partial: Claude CLI and Codex |
| Runs other agents inside it | ✓ | Partial: Claude Code | — | Partial: Claude Code and Codex | Partial: through ACP |
| One memory every agent shares, found by meaning | ✓ | Partial: two small files per profile | — Left to extensions | Partial: its own notes | Partial: its own memory |
| Phone app with notifications and approvals | ✓ | Partial: chat apps | Partial: terminal; Slack bot apart | Partial: Telegram and Discord | Partial: iOS and Android apps |
| Approvals, a command sandbox and a vault | ✓ | Partial: approvals, containers | — Run it in a container | Partial: approvals | Partial: pairing, optional sandbox |
| Confidential sessions on local models only | ✓ | Partial: local models | Partial: local models | Partial: local models | Partial: local models |
| No telemetry | ✓ | ✓ | — Reports on by default | — Analytics on by default | ✓ Daily version check only |
| A strong model leading cheaper helpers | ✓ 9% less than Best alone | Partial: subagents | — | Partial: Fusion | Partial: sub-agents |

Already use one of them? Keep it: Hermes Agent, pi and OpenClaw run inside Hydor as agents, and **Settings → Memory →
Bring in** takes the memory and skills of all four over. The full comparison, with every source, is at
[hydor.app/compare](https://hydor.app/compare/): [Hermes Agent](docs/compare/hermes-agent.md),
[pi](docs/compare/pi.md), [Atomic Agent](docs/compare/atomic-agent.md) and [OpenClaw](docs/compare/openclaw.md).

## What else it does

- **Agents of your own**: say what one should do and it is drafted for you; each works on its own schedules, on a model
  tier, with a monthly budget, and can hand parts of its work to other agents.
- **Work that runs by itself**: scheduled tasks, watchers, webhooks, and goals an agent keeps working on.
- **Answers you can use**: replies show maths, diagrams, pictures and more than a hundred answer UIs (tables, charts,
  maps, recipes, forecasts, quizzes) that agents fill in as they answer.
- **For researchers and engineers**: a paper radar and a check before you submit, experiments that wait for a free GPU,
  failed CI runs looked into, issues triaged, large changes made by a team of agents.
- **Your computer too**: in the desktop apps, agents can use your screen, mouse and keyboard once you allow it.
- **In your terminal**: the `hydor` command talks to an agent, runs one request from a script, and looks after
  sessions, models, agents, tasks and usage.
- **Your choice of permissions**: approvals for risky steps, Auto mode that checks them, a command sandbox, or Full
  access when you want none of it.
- **English, Chinese and Greek.**

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

The installer also links the `hydor` command, to use Hydor from a terminal:

```bash
hydor "add a --json flag to the export command"   # talk to an agent in this folder
git diff | hydor run "review this change"          # one request from a script: the reply on stdout
hydor sessions                                     # what each session is doing
```

## Documentation

- [Features](docs/features.md): everything the app does
- [Installation](docs/install.md): requirements, the Mac app, Docker, the installer and the service, updates
- [Configuration](docs/configuration.md): settings, where data lives, resetting the password
- [Remote access](docs/remote-access.md): your phone and other devices, over HTTPS
- [Several machines](docs/machines.md): agents on other machines, from one place
- [How it works](docs/how-it-works.md): architecture and security
- [Privacy](docs/privacy.md): what leaves your computer, host by host: no telemetry, and how to turn each connection off
- [Compared with other agents](docs/compare/README.md): Hermes Agent, pi, Atomic Agent and OpenClaw, with sources
- [Development](docs/development.md): building and changing the app
- [Contributing](CONTRIBUTING.md), [security](SECURITY.md) and the [code of conduct](CODE_OF_CONDUCT.md)

## License

[Apache License 2.0](LICENSE). What you share that is built on Hydor keeps its [NOTICE](NOTICE) and says what you
changed. Hydor is independent, not affiliated with or endorsed by Anthropic or OpenAI
([disclaimer](docs/how-it-works.md#disclaimer)).
