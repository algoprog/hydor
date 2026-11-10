# Hydor vs other agents

Hydor runs the official Claude Code and Codex on your own plans, runs Hermes Agent, pi, OpenClaw and other agents inside it, and gives all of them one memory, a phone app and a Library. You do not have to give up the agent you use today. Checked 10 November 2026.

## Hydor beside the others

Hydor does every row. The others do the parts their own pages describe, and each page below has the sources for its column.

| | Hydor | [Hermes Agent](hermes-agent.md) | [pi](pi.md) | [Atomic Agent](atomic-agent.md) | [OpenClaw](openclaw.md) |
|---|---|---|---|---|---|
| **Runs the official Claude Code and Codex on your own plans, and shows the sessions you started in VS Code or a terminal** | ✓ | Partial: Claude Code only, through a bundled skill | — Its own agent | Partial: drives your Claude Code and Codex sign-ins; a handoff command picks up a stopped session | Partial: runs the Claude CLI and Codex |
| **Runs other agents inside it**: Hermes Agent, pi, OpenClaw, Gemini CLI, OpenCode, Goose and more | ✓ | Partial: hands coding to Claude Code | — | Partial: Claude Code and Codex | Partial: Claude Code, Gemini CLI, OpenCode and others through ACP |
| **One memory that every agent shares**, found by meaning and checked against your conversations each day | ✓ | Partial: two small files per profile (2,200 and 1,375 characters by default) and search over past sessions | — None built in; left to extensions | Partial: its own notes, lessons and procedures | Partial: its own memory, on your computer |
| **On your phone**: installs as an app with notifications, and you approve or deny from the notification | ✓ | Partial: chat apps | Partial: a terminal program; its Slack bot is a separate package | Partial: Telegram and Discord, with approval buttons | Partial: iOS and Android apps, and chat apps |
| **Desktop apps** for Mac (Apple silicon and Intel), Windows and Linux | ✓ | Partial: apps for macOS and Windows | — Terminal only | Partial: no Intel Macs yet | ✓ Companion apps for macOS, Windows and Linux |
| **Approvals, a command sandbox and a vault** that agents use without seeing your keys | ✓ | Partial: command approval and container isolation | — No built-in permission system; run it in a container | Partial: approvals, and keys kept out of the commands it runs | Partial: sender pairing, a sandbox you set up, approvals in chat apps |
| **Confidential sessions**: local models only, with every network tool off | ✓ | Partial: local models | Partial: local models | Partial: local models, which it is built for | Partial: local models |
| **No telemetry** | ✓ | ✓ None by default, says its own page | — Install and update reports on by default | — Anonymous usage analytics on by default | ✓ A daily version check; statistics are opt-in |
| **A strong model leading cheaper helpers** | ✓ 9% less than Best alone and 67% less than everything on Max, in Hydor's own benchmark | Partial: subagents on a model you choose | — No sub-agents by design | Partial: Fusion, a planner with workers | Partial: sub-agents |

On top of this, Hydor has a **Library** of documents, slides, spreadsheets, LaTeX and diagrams that you edit in the app, **apps** with views of their own, more than 100 ready-made views for replies (charts, maps, tables), and a setup tour and a full guide inside the app that its agents read to answer your questions and change settings for you.

## Already using one? Bring it with you

- **Hermes Agent, pi and OpenClaw run inside Hydor** as agents, beside Claude Code and Codex. Add them under [Settings → Agents → More agents](/settings?s=agents&find=Agents%20that%20speak%20ACP). They keep working the way they do, and you add one memory, the phone app and the Library on top.
- **Their memory and skills come over.** [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6) reads what Hermes Agent, OpenClaw, pi and Atomic Agent know about you and the skills you made in them. You see it all first, and nothing is added until you pick it. The setup tour offers it when it finds one of them.
- **Atomic Agent's local models work in Hydor too.** Point Hydor's own agent at the same llama.cpp, Ollama or vLLM endpoint, and turn on **Confidential** for sessions that must stay on your computer.

## The pages

- **[Hydor vs Hermes Agent](hermes-agent.md)**: keep Hermes, and add the official Claude Code on your plan, one memory and a phone app.
- **[Hydor vs pi](pi.md)**: keep pi, and add approvals, a phone and a memory.
- **[Hydor vs Atomic Agent](atomic-agent.md)**: bring in its memory and skills, and run your local models in Hydor.
- **[Hydor vs OpenClaw](openclaw.md)**: keep OpenClaw, and add a coding-first app with one memory and a Library.

## How we compared

- Every claim about another project comes from its own README, documentation, site or GitHub page, listed on its page, and was checked on 10 November 2026. Where we could not check something, the table says what the project's own pages say, or leaves the row out.
- Numbers come with their source. The one number that is Hydor's own, the cost of a team of agents, is from our benchmark of seven coding tasks that we ran ourselves ([Tiers and the team](../plans/tiers-and-the-team.md)); it says nothing about the other projects. The 67% is over the six tasks that Max alone was run on.
- Projects change fast. If something here is out of date, [open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected.
- Hydor is not affiliated with Anthropic, OpenAI, Nous Research, Earendil, AtomicBot or the OpenClaw Foundation.
