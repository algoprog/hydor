# Hydor compared with other agents

Hermes Agent, pi, Atomic Agent and OpenClaw are good open-source agents, and each is the best fit for somebody. This page puts them beside Hydor in one table, says which job each suits, and links to a page for each with its sources. Checked 10 November 2026.

## Which one fits

- **Hydor**: you use Claude Code or Codex on your plans, or several agents, and want one memory, your phone, approvals and a Library, on your own computer.
- **[Hermes Agent](hermes-agent.md)**: you want an always-on agent in your chat apps that learns by itself, on a server or in the cloud.
- **[pi](pi.md)**: you want a minimal terminal coding agent that you build up with TypeScript extensions.
- **[Atomic Agent](atomic-agent.md)**: you want the best results from small models running on your own machine.
- **[OpenClaw](openclaw.md)**: you want a personal assistant in WhatsApp, iMessage, Telegram and 20 more channels, with phone apps.

They are not exclusive. Hydor runs Hermes Agent, pi, Gemini CLI, OpenCode and others as agents of its own, and brings in memory and skills from Hermes, OpenClaw, pi and Atomic Agent.

## The table

As of 10 November 2026. Each page has the sources for its column.

| | Hydor | [Hermes Agent](hermes-agent.md) | [pi](pi.md) | [Atomic Agent](atomic-agent.md) | [OpenClaw](openclaw.md) |
|---|---|---|---|---|---|
| **Official Claude Code and Codex on your plan** | Yes: it runs the official programs, and shows sessions from VS Code or a terminal | Claude by API key or Nous Portal; its page says a Max sign-in uses only extra usage credits and Pro cannot sign in | Its own agent: sign in to providers with OAuth or an API key | Its own agent; can take over a Claude Code or Codex session | Reuses the Claude CLI and runs Codex through its app-server |
| **Interfaces and phone** | Web app that installs on a phone, with notifications and approvals; desktop apps; the `hydor` command; Telegram | Terminal interface, desktop app, chat gateway | Terminal interface; print, JSON, RPC and SDK modes | Terminal interface, desktop app, Telegram and Discord | Web control UI, command line, terminal interface, apps for macOS, iOS, Android, Windows and Linux |
| **Memory** | One for every agent: notes found by meaning, checked against each day's conversations | MEMORY.md (2,200 characters) and USER.md (1,375) per profile by default, and search over past sessions | Left to extensions | Local notes, lessons and procedures with hybrid recall | Kept on your computer |
| **Learning** | Agents propose skills after hard tasks; you approve | Nudges every 10 and 15 turns in its example config; a background review writes skills | Skills and packages you write or install | Reflection after turns writes memory | Skills and plugins, shared through ClawHub |
| **Chat apps** | Telegram, Discord, Slack | More than 20 platforms | Slack and chat automation in a separate package | Telegram, Discord | 20 or more channels |
| **Local models** | Any model through Ollama, vLLM, OpenRouter or an OpenAI-compatible endpoint; confidential sessions use only local ones | Any OpenAI-compatible endpoint, local models | llama.cpp and other providers | Built for it: llama.cpp with grammar-constrained tool calls | Local model providers |
| **Safety** | Approvals on your phone; checks on risky steps; optional command sandbox; Full access if you choose; a vault agents use without seeing keys | Command approval, DM pairing, container isolation | No permission prompts; run it in a container | Approvals for dangerous actions | Pairs unknown senders; tools run on the host unless you sandbox |
| **Telemetry** | None: no analytics libraries | None by default, says its own page | Anonymous install and update reports on by default; off with a setting | Anonymous analytics and crash reports on by default | Daily update check; feature statistics opt-in |
| **Documents and apps** | Library of pages, documents, slides, spreadsheets, LaTeX and diagrams; apps | Tools and skills | Coding core; the rest by extensions | Browser, files and document tools | Canvas and device actions in the companion apps |
| **Strong lead, cheaper helpers** | Tiers and a team: 9% less than Best alone, 67% less than all on Max, in Hydor's own benchmark | Subagents on a model you choose | None by design | Fusion: a planner with workers | Not checked |
| **License and language** | Apache-2.0, TypeScript | MIT, Python | MIT, TypeScript | MIT, TypeScript | MIT, TypeScript |
| **GitHub stars** | Public since late October 2026, 0 | 262k | 121k | 3.5k | 394k |

## How we compared

- Every claim about another project comes from its own README, documentation, site or GitHub page, listed on its page, and was checked on 10 November 2026. Where we could not check something, the table says so or leaves it out.
- Numbers come with their source. The one number that is Hydor's own, the cost of a team of agents, is from our benchmark of seven coding tasks that we ran ourselves ([Tiers and the team](../plans/tiers-and-the-team.md)); it says nothing about the other projects.
- Projects change fast. If something here is out of date, [open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected.
- Hydor is not affiliated with Anthropic, OpenAI, Nous Research, Earendil, AtomicBot or the OpenClaw Foundation.
