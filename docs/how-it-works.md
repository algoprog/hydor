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
  until it gives the key written in your data folder.
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
  browser (an agent's tab in your browser, from **Do this here**, is still checked page by page).
- **Your own browsing's history, suggestions and ad blocker.** The server records the page each of your own tabs ends up
  on (web pages and files, with their titles and how often you typed their addresses) in a table of the app's database,
  the last 20,000, and ranks it with your open tabs and bookmarks for the address bar (`server/browser/history.ts`); the
  search engine you chose is asked for its suggestions as you type, with a short time-out, when you leave them on. The
  ad and tracker blocker is the app's (`desktop/adblock.cjs`): Ghostery's engine on the session of your own browsing,
  made from its lists once and kept as a file in the app's data folder, made again when a week old (the old file stays in
  use when that fails). The server tells the app when the setting or the sites you allowed ads on change. Electron's own
  request handlers go before an extension's, so with the blocker on an extension's request blocking may not run.
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
