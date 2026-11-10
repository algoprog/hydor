# What leaves your computer

Every connection Hydor makes to the outside, what it sends and how to turn it off. [Back to the README](../README.md).

## The short answer

- **Hydor has no telemetry.** No analytics, no usage counters, no crash reports, no account with us, no
  install ID, nothing that says who you are or how you use the app. There is no Hydor server in the middle: the
  app does not report to anyone.
- **The app you open loads nothing from other sites.** Its fonts, scripts and pictures come from your own
  server, and its security policy forbids the page from loading more. The one exception is the video players of
  YouTube and Vimeo, which a reply or an app can show in a frame.
- **Your conversations go to the model you chose, and nowhere else.** Claude Code talks to Anthropic, Codex to
  OpenAI, Custom to the model service or the model on your computer you picked. Hydor adds no copy or middleman.
- **What else leaves is small and listed here**: update checks, price and model lists, one-time downloads, and
  the lookups your agents ask for (a web search, a paper, a font). Most of them are on a page below with the
  host they go to. Most carry no words of yours; the few that do are marked.
- **A confidential session sends nothing out.** It runs on a model on your computer and Hydor turns every tool
  that would reach the internet off for it (see [Confidential sessions](#confidential-sessions)).

This page lists what Hydor itself does. What the agents do on a task (run commands, browse, call a service you
connected) is theirs to decide, and no list could cover it. What the model companies do with your conversations
is in their own terms.

## What was checked

Every place the server, the desktop apps, the command line, the web app, the installer and the Docker image
make a network request: web requests, sockets, hard-coded hosts, downloads and package installs. The dependencies
were read too for analytics or crash-reporting libraries; there are none, and nothing in the code sends an
identifier of the install or the person. Hydor asks the programs it starts to send no usage statistics where it
can (vLLM, for one). Claude Code and Codex are separate programs, with settings and policies of their own, and
Hydor leaves those as they are.

Every host you read below sees your IP address and the usual headers of the request, as any website would. Hydor
adds the name of the program (`Hydor`, with its version only to the update check) and no identifier that stays the
same from one request to the next.

You can check it yourself: the code is open, and a network monitor (Little Snitch, OpenSnitch, Wireshark, or
`ss -tp` on Linux) shows each connection as it happens.

## On by default, in the background

These need nothing from you and are on from the first start, except where noted.

| Host | When | What is sent |
| --- | --- | --- |
| `github.com` (and the download servers it redirects to) | **Desktop apps:** a minute after they start, then every 4 hours. **Installs from git** (the installer, Docker): 3 minutes after the server starts, then once a day. | The apps ask for one small file that names the newest version for your system, with `hydor/<version>` as the program's name. A copy from git runs an ordinary `git fetch` against the address it was cloned from. GitHub sees your IP address, as any website would. With **Update automatically** on, a new version of the app is downloaded too. |
| `registry.npmjs.org` (or the registry your npm is set to) | About 10 minutes after the app starts, then once a day. Also the first time an agent program is needed and not installed. | npm asks for the newest version of each agent program on the computer (Claude Code, Codex, Gemini CLI…), by its package name, with npm's usual headers (npm and Node.js versions, your system). With **Update automatically** on, newer versions are downloaded. |
| `naget.com` | While Naget Search is on (it is by default): when the server starts if the list is older than a day, then once a day. | A request for Naget Search's list of categories. No search words and no key of yours are in it. |
| `raw.githubusercontent.com` | The first time after a start that the app works out what usage would cost, then at most once a day. | A request for a public price table (LiteLLM's). Nothing of yours. |
| `pypi.org`, `files.pythonhosted.org`, `huggingface.co` | Once, a minute after the first start, to set up search by meaning (about 350 MB with its Python packages). | The names of three Python packages, and the model's files at a fixed version. The model then runs on your computer: your notes and searches never go anywhere. |
| `api.anthropic.com` | While the app is open and reads your Claude plan's usage, and while a session waits for a limit to lift. Only when Claude Code is signed in with a claude.ai account. | The sign-in token Claude Code already keeps, to read your plan's limits and any limit resets you hold. Nothing from your conversations. |

**Small jobs by the helper model.** By default the helper model is Automatic: Claude Haiku through Claude Code
(or Codex if Claude is not signed in), with your own sign-in. It names new sessions from your first message, and,
with memory on (it is on by default), writes memory notes, tidies them and learns from your conversations; it
also checks steps in Auto mode, drafts agents and reads pages for one question. Those go to Anthropic or OpenAI
the way a session does, so they carry words of yours.

## Only when you turn something on or use it

None of these happens until you do the thing in the first column.

| You | Host | What is sent |
| --- | --- | --- |
| Add an OpenRouter key and use it (Custom, pictures, videos, sound, captions) | `openrouter.ai` | The conversation or the prompt, and your key, as the model needs. The app names itself in the headers (`Hydor`, with its GitHub address). The model list, and its prices, are fetched without a key: when you open the pickers, while you have pinned models, and when a session runs on one. |
| Add another model service or a server of your own to Custom | The address you give | The conversation and the key you gave. |
| Look at, install or run Hugging Face models | `huggingface.co` | Model names, and your token if you gave one, to read sizes and to download files. |
| Turn on speech recognition on the server, "On this machine" | `github.com`, `huggingface.co` | Downloads of whisper.cpp and the model, once. Your voice stays on your computer. |
| Pick "A service" for speech recognition | The address you give | Your recordings, and the key you gave. |
| Press the download in the Browser settings | `googlechromelabs.github.io`, `storage.googleapis.com` | A request for Chrome for Testing, once. |
| Set up the picture tools on this computer | `huggingface.co`, `pypi.org`, `files.pythonhosted.org` | Downloads of three models and Python packages, once. Your pictures stay on your computer. |
| Link a Telegram bot | `api.telegram.org` | Your bot's token, and what the chat carries: your messages, the agents' replies, buttons and notices. Hydor asks Telegram for new messages (long polling) while the bot is linked. |
| Press **Notify this device** | The push service of your browser (Google, Mozilla or Apple) | An encrypted message that a session finished or needs you. The push service cannot read it; it sees that one was sent, its size, and your server's address. |
| Connect GitHub or Gitea to open pull requests | `api.github.com`, or the address you gave | Your token, and requests for the pull requests of your sessions, every 3 minutes while one is open. |
| Add another machine, or connect an app (MCP) | The address you give | Your requests for that machine or app, with the token you gave. |
| Dictate with the browser's own recognition | Whoever makes your browser (Chrome: Google; Safari: Apple) | Your voice. This is the browser, not Hydor. Choose **The server** in the Voice settings to keep it on your machine. |
| Schedule a task that watches a page | The page's own address | A plain request, as a browser would make. |
| Install an app, a plugin or a skill that needs packages | `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, and what the plugin names | Package names, to install them (without running their install scripts for Node packages). |
| Read or look at a PDF on a computer without poppler | `registry.npmjs.org`, once, or `cdn.jsdelivr.net` | A request for the pdf.js library. The PDF stays on your computer. |

## When an agent uses a tool Hydor gives it

Hydor gives its agents tools. The agent decides when to call one, and the call is what leaves.

| Tool | Host | What is sent |
| --- | --- | --- |
| Web search | `naget.com` (Naget Search, the first provider), then `html.duckduckgo.com` if it cannot answer. Also `api.search.brave.com` with a key, and your own SearXNG address. | **The search words** and the filters the agent set (sites, dates, languages), the name `Hydor`, and your IP address. Without a key, Naget Search gives a free daily allowance counted per network. |
| Reading a page with a question | `naget.com`, only with a Naget key | The page's address (a public one only) and the question; the page's text too when Naget cannot fetch it. Without a key the page is read on your computer. |
| Pictures and videos for things | `en.wikipedia.org`; the sites a search finds; `api.openverse.org`, `commons.wikimedia.org`, `upload.wikimedia.org` for photos | The name of the thing. A YouTube video is found by a web search, not by asking YouTube. |
| Papers and references | `arxiv.org`, `export.arxiv.org`, `doi.org`, `api.crossref.org`, `api.openalex.org`, `api.datacite.org`, `dblp.org`, `api.semanticscholar.org`, `aclanthology.org`, `api2.openreview.net` | A DOI, an arXiv id, or a title and authors, to find or read a paper or check a reference. `api.unpaywall.org` is asked only when you set `HYDOR_CONTACT_EMAIL`, and then gets that address, as Unpaywall requires. |
| Exporting a document, slides or a PDF | `fonts.googleapis.com`, `fonts.gstatic.com` | The names of the fonts used, to embed them. For text in a PDF that no font on your computer can draw, **the characters themselves** (at most 100 per request) are sent so that Google returns a font that has them. |
| Showing a source, a picture or a video in a reply or a deck | The sites involved, `i.ytimg.com`, `vimeo.com` | The server fetches the cited site's icon and the pictures a reply or deck shows, so your browser doesn't. Those sites see your server's IP address, not your browser. |
| Pages and slides the agent makes | `cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `tiles.openfreemap.org`, YouTube and Vimeo players | A page may load a chart library, a font, map tiles or a video from these. They sit in a sandboxed frame, and **your browser** makes the requests, so they see your IP address and the page's address. |

## Turning each one off

- **Update checks of the apps.** There is no switch that stops the look itself. **Update automatically**
  (Settings → General) stops the download and install. To stop the look, point `HYDOR_UPDATE_FEED` at an
  address that does not answer. For a copy from git, `git branch --unset-upstream` makes it stop asking.
- **Agent programs' updates.** **Update automatically**, under Settings → Agents → Accounts → Agent programs,
  stops installs: the daily run then only reads the newest versions from npm. The look has no switch. An agent
  program that is missing and needed is installed once, and the Docker image starts with Claude Code's own
  updates off.
- **Naget Search.** Turn it off in Settings → Capabilities → Search: the app then sends it nothing, not even the
  daily request for its categories. Searches go to the next provider, and DuckDuckGo is on by default too. Turn off every provider you do not want, and add your own SearXNG address to keep
  searches on your own server. With none on, Claude Code and Codex use their own built-in search.
- **Price table.** Set `PRICES_URL` to nothing (an empty value). Estimates then use only the prices you set.
- **Search by meaning.** Turn off **Search by meaning** in Settings → Capabilities → Memory, or start with
  `HYDOR_EMBED=off` to never set it up. `HF_ENDPOINT` sends the model download to a mirror, and
  `HYDOR_EMBED_PYTHON` uses a Python you already prepared, which needs no Python packages from the internet.
- **Helper model.** Pick a model on your computer under Settings → Agents → Models → Helper model. Then titles,
  memory notes, Auto mode's checks and the rest stay on your computer. Turn **Memory** off in Settings →
  Capabilities → Memory to send no conversation to it for notes.
- **Claude plan usage.** Nothing is sent while Claude Code is not signed in with a claude.ai account.
- **Model lists and prices from OpenRouter.** Do not add a key, pin no models and open no OpenRouter pickers.
- **Everything under "Only when you turn something on".** Leave it off, or take it away where you added it:
  remove the key, the bot, the machine or the connected app; use **Off** or the browser's own switch for
  speech recognition.
- **Pictures, videos and sound.** The switches **Let agents make images**, **videos** and **audio** (Settings →
  Capabilities → Images) keep agents from calling those tools.
- **Pages and slides that load libraries.** Their requests come from your browser, so your own firewall,
  browser settings or a blocker apply. In a confidential session they load nothing.

## Confidential sessions

For work that must not leave your computer, start a session with **Options → Confidential**. It runs on a model
on your computer or your private network, and Hydor turns off everything that reaches the internet for it: web
search and pages, the browser, connected apps, picture, video and sound tools, publishing and share links. Its
title comes from a local model or your first words, its notices carry no words of it, its pages load nothing, and
agents in other sessions cannot read it. The guide, under "Keep a session confidential", lists what stays on.

## Running with no connection to the outside

Hydor works with no internet at all if you use a model on your computer. Start with `HYDOR_EMBED=off`,
`PRICES_URL=` (empty) and `HYDOR_UPDATE_FEED` pointing nowhere; choose a helper model on your computer; use
Ollama or vLLM for Custom; and block the host list above with your firewall. Each of the checks, lists and downloads is something the app
can do without: a refused one fails and the app carries on.
