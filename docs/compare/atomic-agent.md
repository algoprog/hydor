# Hydor and Atomic Agent

Atomic Agent is a local-first agent built to get good results from small open-weight models on your own machine. Hydor is an app that runs many agents, with one memory, from any device. This page says where each is the better fit, and how to use both. Checked 10 November 2026.

## Who Atomic Agent is for

People who want to run open-weight models on their own computer and have an agent that is designed around what small models can and cannot do. It runs its own build of llama.cpp, grammar-constrains the tool calls the model makes, and keeps the prompt small [1]. It is by AtomicBot, under the MIT license, written in TypeScript, and as of 10 November 2026 its repository has 3.5k stars [2]. Its README calls it a developer preview [1].

## What Atomic Agent does better than Hydor

- **Small local models.** Grammar-constrained tool calls on llama.cpp, a model recommender for your RAM and GPU, a context-frugal loop and a KV-cache compression build [1]. Hydor's own agent, Custom, runs any model through Ollama, vLLM, OpenRouter or any OpenAI-compatible endpoint, and is built for breadth of models rather than for tuning to small ones.
- **A published result.** On the public GAIA validation Level 1 split (53 tasks), with the same local Qwen 3.6 35B-A3B for both, Atomic Agent scored 69.8% and Hermes Agent 58.5% [1]. This was run by Atomic's own team, and its write-up and raw runs are published [1]. We have not run GAIA on Hydor, so we have no number to set beside it.
- **Overnight runs.** `atomic-agent overnight` runs one long task with nobody watching, capped by a dollar budget and a number of hours [1].
- **Fusion.** One model plans and a pool of workers does the clear parts [1]. Hydor does this too with its tiers and team; the two are different designs, and we have not compared them.

## Where Hydor is ahead

- **Official Claude Code and Codex on your plans.** Atomic Agent is its own agent; it can take over a Claude Code or Codex session you stopped, and import from them [1]. Hydor runs the official programs, and sessions started in VS Code or a terminal show up.
- **More agents.** Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Hermes Agent and pi run inside Hydor beside its own.
- **A phone and every screen.** A web app that installs on a phone with notifications and approvals, desktop apps for Mac, Windows and Linux, the `hydor` command, and Telegram, Discord and Slack. Atomic Agent has a terminal interface, a desktop app and Telegram and Discord [1]. On a Mac its builds are for Apple silicon; Intel Macs are not supported yet [1]. Hydor has an app for Intel Macs too.
- **One memory for every agent**, checked each day against your conversations, with skills proposed after hard tasks and approved by you.
- **A Library and apps.** Documents, slides, spreadsheets, LaTeX and diagrams that agents write into, and small apps with views of their own.
- **No telemetry.** Atomic Agent's README says "Anonymous usage analytics is on by default", with crash reports to Sentry on the same switch; it honours `DO_NOT_TRACK` [1]. Hydor has no analytics libraries to switch off.
- **Lower requirements.** Atomic Agent needs Node.js 25.7 or newer [1]. The Hydor apps bring everything they need; building from source takes Node.js 22.12 or newer.

## How to switch

1. Keep Atomic Agent for the local-model work it is built for; it runs on its own, and Hydor does not need to know.
2. Use Hydor's Custom agent against the same llama.cpp server, Ollama or vLLM endpoint, and turn on **Confidential** for a session that must stay on your computer.
3. To bring over what Atomic Agent knows, open [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6): it reads Atomic Agent's memory and skills and shows them as notes you pick from; nothing is added until you do. The setup tour offers it too.

Going the other way, Atomic Agent's own `atomic-agent import` command brings in Claude Code, Codex, Hermes, OpenClaw and pi data [1].

## Sources

1. [Atomic Agent README](https://github.com/AtomicBot-ai/atomic-agent#readme): local models, GAIA benchmark, Fusion, overnight runs, platforms, importers, privacy and egress, requirements. Its site is [atomicagent.io](https://atomicagent.io).
2. [GitHub API, AtomicBot-ai/atomic-agent](https://api.github.com/repos/AtomicBot-ai/atomic-agent): stars, license, language.

Checked 10 November 2026. Something out of date? [Open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected. Hydor is not affiliated with AtomicBot.

[Back to all comparisons](README.md)
