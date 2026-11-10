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
