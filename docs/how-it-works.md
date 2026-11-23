# How it works

The architecture, what keeps sessions alive, and how the app is secured. [Back to the README](../README.md).

```
 browser ──HTTPS / WebSocket──▶ Hydor server (Node.js, Fastify)
                                  ├─ one small runner process per live session
                                  │    └─ claude (stream-json)  or  codex app-server
                                  ├─ indexer: reads the agents' transcripts into SQLite full-text search
                                  ├─ tmux server for the terminals (on Windows the server keeps them)
                                  └─ the web app (React), served from dist/web
```

- **Transcripts are the source of truth.** History comes from the files Claude Code and Codex write
  themselves, which is why sessions started in VS Code or a terminal show up too. The live stream only adds
  what is not written yet: text as it streams, commands still running, approvals.
- **Agents outlive the server.** Each live agent runs under a detached runner that holds its input and output
  and logs everything. Restart or upgrade the server and it reconnects, replaying what it missed. The server talks to
  a runner over a Unix socket only you can open; on Windows over a named pipe, which hears nothing from a client
  until it gives the key written in your data folder. A runner whose folder is deleted while its agent runs (the data
  folder of a copy of the app, removed) stops the agent within a minute, since no server could reach it again.
- **The desktop apps carry the server.** The Mac, Windows and Linux apps start the server with the Node.js inside
  them, talk to it over a message channel (its address, updates, quitting), and start it again whenever it exits. On
  Windows and from an AppImage, each version runs from a copy of itself in your local data folder, so agents that
  outlive the app and its updates never hold the app's own files.
- **Two browser engines.** The browser agents use, and your own on the Browser page, run on one of two engines that the
  server drives the same way, over the Chrome DevTools Protocol. In the desktop apps it is the app's own browser
  (Electron, so Chromium): `desktop/browser.cjs` answers that protocol over the same message channel, with each tab a
  view in the app. An agent's tabs are drawn off screen, so they work with the window closed, and reach the window as a
  fast local picture that takes your clicks and keys as real input; your own tabs are real pages the window shows where
  the Browser page puts them, and Chrome extensions load into them (`desktop/extensions.cjs`). Everywhere else, in Docker,
  on a server, or for a phone looking at one, the server starts a Chromium and the app shows an agent's pages as pictures
  (your own browser is in the desktop app only: streaming its pages made it lag). Every connection of an agent's browser
  passes a checkpoint of the server's that keeps it off this computer's network; your own tabs connect directly, as in any
  browser (an agent's tab in your browser, from **Do** in Ask, is still checked page by page).
- **Your own browsing's history, suggestions and ad blocker.** The server records the page each of your own tabs ends up
  on (web pages and files, with their titles and how often you typed their addresses) in a table of the app's database,
  the last 20,000, and ranks it with your open tabs and bookmarks for the address bar (`server/browser/history.ts`); the
  search engine you chose is asked for its suggestions as you type, with a short time-out, when you leave them on. With
  search by meaning on, the pages of your history, your bookmarks and your downloads (kept in a table too, the last 5,000) get
  a vector of their title and address from the same model, in the background (`server/browser/meaning.ts`), in a table of
  their own that nothing else reads; the address bar adds the pages alike in meaning to the ones with the words, fused by
  rank, and the search box finds them for the person at it, never for an agent's call. A vector goes with its page. The
  ad and tracker blocker is the app's (`desktop/adblock.cjs`): Ghostery's engine, on the sessions of your own browsing and
  its private tabs, made from uBlock Origin's default lists (its own lists, EasyList, EasyPrivacy, Peter Lowe's and the
  malicious URL list), EasyList's cookie notices with **Hide cookie banners**, and the lists you turned on; the server names
  them (`shared/browser.ts`, `AD_FILTER_LISTS`) and sends them with the setting and the sites you allowed ads on
  (`browser-prefs`). `desktop/adblock-lists.cjs` fetches each from the first mirror that answers, resolves its includes,
  keeps a copy in the app's data folder and fetches it again when the list says it expires (uBlock's quick fixes, where its
  YouTube fixes are, every 8 hours; most others every few days); a worker thread makes the engine from them
  (`desktop/adblock-build.cjs`: each list parsed on its own, `!#if` lines evaluated for a Chromium uBlock without HTML
  filtering, `trusted-` scriptlets only from uBlock's own lists), and the engine is saved and loaded at the next start
  without a download. Requests to ad and tracking servers are cancelled, and those a `$redirect` rule names get a harmless
  stand-in from a scheme of the app's own (`hydor-adblock:`, behind a secret that changes at each start, so a page cannot
  ask for one to find the blocker). In every frame of your own tabs (`nodeIntegrationInSubFrames`), a preload
  (`desktop/adblock-preload.cjs`) asks synchronously for its frame's scriptlets and style sheet and runs them before the
  page's own scripts, in the page's world, where its Content-Security-Policy and Trusted Types do not apply: that is what
  strips YouTube's ads from the player's data and defuses anti-adblock checks; procedural filters (`:has-text()` and the
  like) are evaluated in the page with Ghostery's evaluator. What it blocks is counted by kind (a tracker when a rule of the
  privacy lists blocked it, an ad otherwise), per tab and in statistics the app keeps in its data folder
  (`desktop/adblock-stats.cjs`; a private tab adds to the totals only), which the Browser page reads from the app. Electron's own
  request handlers go before an extension's, so with the blocker on an extension's request blocking may not run.
- **Your own browsing's private tabs, translation and reader view.** A private tab is a tab in a browser context of its
  own that the app keeps in memory (`desktop/browser.cjs`: a partition that is never saved) and disposes of when the last
  private tab closes, so its cookies, site data and cache go with it; the server never records its pages in the history,
  the closed tabs or the tabs saved for the next start, and refuses to copy its page for an agent. Translating a page is
  done by a code the app runs in the tab, out of reach of the page's own scripts: it finds the page's words, the server sends them
  in pieces (what is on screen first) to the helper model and writes the translations back into the same text, watching
  the page for words that come later. Reader view finds the article with Mozilla's Readability in the tab and shows it in a
  closed shadow root over the page (`server/browser/reader-view.ts`); nothing leaves the tab.
- **One memory, three parts.** Memory notes (short facts, in the app's database) are what every agent starts with;
  Wiki memory is linked Markdown articles with their sources, kept in plain files in a folder of yours (a shared
  wiki, and one folder for each project, by default inside it); documents are the files in knowledge bases, indexed
  for search. When the indexer reads a new or changed document, the helper model adds a few notes and updates the
  wiki, a little at a time (a project with more documents than its limit has the pinned, most used and newest read into the wiki; agents search all of them); about once a day it also adds what a project's recent conversations and commits settled to that
  project's wiki. Agents are given a few lines from the wiki, with the notes, when they bear on a request, and read and write the wiki only through tools that keep it inside its folder. Notes and articles that name a project's files are checked against the code as it changes. [How memory works](memory.md) says what agents are given and when and how it stays true, and [Memory internals](memory-internals.md) how it is built.
- **Your accounts, your machine.** The app talks to the agents through their official command-line tools and
  never sees your model credentials; sign-in happens in the agents' own login flows.

## Security

- Password stored as a scrypt hash.
- Wrong passwords are counted by address over an hour (IPv6 by its /64). From the third, the sign-in page also
  asks for the characters in a picture the server draws itself, with no outside service; each picture is good for
  one try, and a misread costs none. The tenth stops sign-ins from that address for an hour. Ten from anywhere bring
  the picture to everyone, sixty stop every sign-in. The counts are kept in the database, so a restart lifts no
  pause; `set-password` clears them.
- A visitor's address comes from `X-Forwarded-For` only when the request reaches the app from this computer or a
  private network (a proxy, Docker's network), read from the end the proxy adds to; otherwise it is the
  connection's own, so no one can claim a new address for each try.
- Session cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` over HTTPS.
- Every state-changing request and WebSocket has its `Origin` checked.
- Strict Content Security Policy.
- Files you open are served from a sandboxed origin, so they cannot run as part of the app.
- Listens on localhost only unless you change `HOST`.
- Access tokens for other machines are stored as hashes. The tokens this machine holds for others never reach
  the browser; its server adds them when it forwards your requests.
- No telemetry, analytics or crash reports, and the web app loads nothing from other sites. [What leaves your
  computer](privacy.md) lists every connection the app makes, what it sends and how to turn it off.

## Disclaimer

Hydor is an independent project, not affiliated with or endorsed by Anthropic or OpenAI.
Claude and Claude Code are trademarks of Anthropic; Codex and ChatGPT are trademarks of OpenAI. Using the
agents through this app is subject to your agreements with those companies.
