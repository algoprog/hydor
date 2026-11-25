---
title: Meet Hydor: a home for your AI agents
description: What Hydor is, what a day with it looks like and how to start: Claude Code, Codex or any model on your own computer, with the plans you already pay for, one memory for all of them and every session on your phone.
date: 2026-11-25
tags: Product, Introduction
cover: /img/blog/meet-hydor/cover.webp
coverAlt: A glowing arch of clear water, shaped like the Ω of Hydor's logo, stands on a dark mirror floor while thin streams of coral, lavender, blue, green and amber light flow into it.
og: /img/blog/meet-hydor/og.jpg
order: 1
---

If you use AI agents every day, you know the scatter. Claude Code lives in one terminal, Codex in another, a chat app in a browser tab. Each has its own memory, or none, so you explain yourself again every time. Each runs on its own subscription. And when you leave your desk, the work either stops, or carries on where you cannot see it.

Hydor gives them one home. It is free and open source, and it runs on your own computer: a Mac, a Windows PC, a Linux machine, or a server you rent. It runs the agents and models you already use, with the plans and keys you already have. Then it gives all of them the same memory, the same way of asking for your approval, and the same app on your phone.

The name is *ὕδωρ*, “water” in ancient Greek: it takes the shape of whatever holds it. The Ω in the logo is that water.

## One home for many agents

An agent is a program that works on a task for you: it reads and writes files, runs commands, searches the web and tells you what it did. Hydor runs several kinds, side by side:

- **Claude Code and Codex**, the official programs, on the plans you already pay for. Sign in with a Claude plan (Pro, Max or Team) or a ChatGPT plan (Plus, Pro, Business or Enterprise), and Hydor runs them on it.
- **Other agents** such as Gemini CLI, and any that speak the Agent Client Protocol, a shared way for apps to talk to coding agents: OpenCode, Qwen Code, Goose, Kimi CLI and Auggie.
- **Custom**, Hydor’s own agent, which gives any model the same tools: through OpenRouter, through Ollama, or through vLLM on your own graphics card.

Each conversation with an agent is a session, and you choose the agent and the model when you start one. You can hand a conversation over to another agent later. Nothing about how you work changes when the agent does.

<!-- figure: home -->

## A request, start to finish

Here is what a request looks like, using a job from Hydor’s own home page: some checkout tests have started failing, and you want them fixed.

You write it in plain words, as you would to a colleague. Before the agent starts, Hydor adds the notes from memory that bear on the request. Then the agent works, and every step shows in plain words as it happens: what it read, what it ran, which file it edited, with the change counted. When it wants to run a command, a card asks first, with **Allow**, **Always allow** and **Deny**. Every change comes with its diff, and you can add a note while the agent works. If a step goes the wrong way, go back to any message and try again, files and all.

The answer comes back in whatever form suits it best: a sentence, a table, a chart, a document. All of it is kept in the project, the folder the work belongs to, with its sessions, files and memory together. If you have left the desk, a notification reaches your phone.

<!-- figure: request -->

![A session fixing failing checkout tests: its steps in plain words, an edited file with its changes counted, and a card asking to run the test suite with Allow, Always allow and Deny.](/img/app-session.webp "A real session in Hydor: the steps, an edited file, and the card that asks before a command runs.")

## One memory for every agent

Most agents remember you on their own terms, or not at all. Hydor keeps one memory for all of them. It holds a profile of you and notes on your projects, and each session starts with the ones that bear on your request, found by their words and by their meaning. Tell one agent that you are vegetarian, or that payments in your shop go through Stripe, and every agent knows it from then on.

You can see, edit or undo every note. The search by meaning runs on your own computer, and the notes stay there. Your guidelines work the same way: written once, followed by every agent.

[How Hydor remembers](/blog/how-hydor-remembers) goes into the details: how notes are written, how they are found, and what an agent is given. The [memory guide](/docs/memory) covers the settings.

## Help with anything, not just code

If you do code, Hydor has what that needs: a terminal beside the agent, files, Git, and every change as a diff. But you do not have to code to use it. Start a session as a Researcher, Writer, Tutor, Planner or Analyst, and ask in plain words. The agent searches and reads the web, cites the pages it used, and hands you a spreadsheet or a document when that is the answer.

A few things worth knowing about:

- **Answers as cards.** When a card is clearer than a paragraph, you get one: charts, maps, tables, quizzes and small tools, 150 kinds. Pin the ones you want to keep to a **board**, and an agent can keep each one current on a schedule. [Dynamic UIs](/blog/dynamic-uis) shows them at work.
- **Apps.** For a job you do again and again, such as a trip plan, a product comparison or a quiz, an app asks a few questions and opens its answer in a view of its own, with maps, charts and pictures. 45 ready-made apps come with Hydor. You can also describe a job, and an agent builds an app for it: a sketch first, which you can change before anything is made.
- **Documents you keep.** Pages, slides, documents, spreadsheets and LaTeX, edited right in the app and exported to PDF, Word, PowerPoint or Excel. Pictures, video, music and voice-overs made with AI are kept in the project too.
- **Deep research.** Rounds of searching and reading that end in a report with its sources.
- **A browser you can watch.** Agents can work in a browser while you look on, and you can take over to sign in or to pay. In the desktop apps, Hydor has a browser of its own, with tabs and an ad blocker.

<!-- figure: tour -->

Every tab above is a real screenshot of the app in its dark theme. The [guide](/docs/) has a page for each part of it.

## Work that runs by itself

An agent does not have to wait for you to open the app.

A **scheduled task** is a request with a trigger: at a time of day, every few minutes or hours, once, or when something changes. A watcher can look at a web page, a feed, a value, a folder, a command’s output or a new email, and it does so without a model, so checking costs nothing in tokens: the agent wakes only when something has changed. A webhook can start one too. If the computer was off at the time, the run happens at the next chance. [The tasks guide](/docs/tasks) has the full list.

A **goal** is for work that takes many rounds. You and the agent first agree what “done” means, as a short list of checks: a command that must pass, a number to reach, a sentence a reviewer must find true, or something only you can confirm. After every round the app itself runs the checks, and decides whether things got closer. The agent saying it is done changes nothing: only the checks can end a goal. You set the limits: rounds (30 unless you change it), money and time. [The goals guide](/docs/goals) says how, and for a hard problem a goal can drive a whole swarm of agents: [Goals and swarms](/blog/goals-and-swarms) explains how, and what this year's reports on agent swarms show.

For researchers, **Experiments** are training and evaluation runs that wait for a free GPU, then run on their own and are kept: their code, settings, log and metrics. You get live charts, sweeps over settings, and a results table with significance tests for your paper, as LaTeX too. Agents can start and watch runs for you. See [Experiments](/docs/experiments).

## On your phone

Hydor works from any browser, so it works on your phone. Add it to the home screen and it opens like an app, with notifications. **Settings → App → Use on your phone** reaches it privately through Tailscale, and shows a QR code to scan; [remote access](/docs/remote-access) has other ways, such as a tunnel of your own.

Sessions keep running when you close the tab. A notification arrives when a session finishes, fails or needs your answer, and a plain yes or no has **Approve** and **Deny** right on it. One inbox shows everything waiting on you, across sessions, tasks and machines. You can talk to an agent and hear its answers, and add your other computers to switch between them. You can also message your agents from Telegram, Discord or Slack.

<!-- figure: phone -->

## Words as you type

While you write, the rest of the word shows in grey after the cursor, and the next word dimmer still. <kbd>Tab</kbd> takes it. It works in the message box, in documents and in notes, in whatever language you write.

A small model on your own computer makes the suggestions, and it learns how you write. Nothing you type leaves your computer. It is on from the start, with one switch to turn it off. [Word suggestions that never leave your computer](/blog/on-device-word-suggestions) goes into how the model is made.

## Yours: your computer, your plans, your data

Hydor is not a service you sign up for. It is an app that runs where you choose, with the AI you choose.

- **It runs where you are.** Your sessions, files, memory and keys are kept on the computer that runs Hydor, not in a Hydor cloud.
- **It uses what you pay for.** Hydor itself is free. The AI it uses is yours: a plan you already pay for, API keys, models you pay for as you go, or free models on your own computer.
- **Keys stay out of sight.** Passwords and keys live in an encrypted vault. Agents use them by name, only on the sites you allow.
- **No telemetry.** No analytics, no crash reports, no account with us and no install ID. Your conversations go only to the model you chose. The few other connections Hydor makes, such as update checks, price and model lists, one-time downloads and the searches your agents ask for, are listed host by host in [What leaves your computer](/docs/privacy), with how to turn each off. For work that must not leave the machine, a confidential session runs on a model on your computer and sends nothing out.
- **Open source.** Hydor is under the GNU AGPL 3.0: you can read every line and change what you like, and whoever shares a changed version, or runs one for others, shares their changes too. The code is on [GitHub](https://github.com/algoprog/hydor).

<!-- figure: plans -->

Hydor is an independent project, not affiliated with or endorsed by Anthropic or OpenAI. It runs their official command-line tools, signed in with your own account.

## Getting started

Download the app for [Mac, Windows or Linux](/#download); it brings what it needs and keeps itself up to date. On Windows, install [Git for Windows](https://git-scm.com/download/win) too, since agents run their commands in it. There is also a Docker image and a Linux server installer, and the [install guide](/docs/install) has the details. A short tour then sets up the plans or models you want to use.

If you are coming from ChatGPT or Claude, keep your plan and bring what it knows about you. Ask them for your data export, then add the file under **Settings → Capabilities → Memory → Bring in…**. Hydor reads your custom instructions or memory and what you wrote in your chats, not the replies or the files you attached, and proposes notes. You pick what to keep. [How it works](/docs/memory#bring-in-from-other-assistants), and [how Hydor compares](/compare/chatgpt-and-claude) with their apps, with sources, if you want to see where each is stronger.

Then watch the tour, two minutes of it, to see these parts at work.

<!-- figure: film -->

Everything the app does is listed in [Features](/docs/features), and [how it works](/docs/how-it-works) says how it is built. Questions and bug reports go to [GitHub](https://github.com/algoprog/hydor/issues).
