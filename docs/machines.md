# Several machines

Using agents on other machines from one Hydor. [Back to the README](../README.md).

Run Hydor on each machine where agents should work (a desktop, a GPU box, a cloud VM), then use them
all from one of them: Settings → Machines → Add a machine. Each machine keeps its own sessions, files,
terminals and sign-ins. The sidebar switches between them, and notices from every machine reach you on the
one you opened. The machine row at the top of the sidebar tells you what happened on the others: a number for
sessions that finished there since you last looked, and a dot for sessions waiting on you. Its menu lists each
machine's recent finished sessions (one click opens one on its machine), and says when a machine is updating
("Updating · 45%") or restarting into a new version ("Restarting…"). With the sidebar hidden, the rail's Sessions
tile carries a dot for the same.

1. On the other machine, make an access token: in its own Settings → Machines, or run
   `node dist/server/cli.js access-token "my laptop"` in its Hydor folder.
2. On the machine you use, add it with that token:
   - **Over SSH**, the simplest: give the SSH host (an entry of `~/.ssh/config`, or `user@host`) and the port
     Hydor listens on there (8790). The server opens the tunnel itself with its own SSH keys, which
     must work without a passphrase prompt, and the other machine keeps listening on `127.0.0.1` only.
   - **By its address**, on a private network or a VPN such as Tailscale: for example `http://100.64.0.5:8790`.
     Set `HOST` on that machine so it listens on that address.

A project can go from one machine to another too: its ⋯ menu → **Send to another machine…** copies it, moves it or keeps it
in sync with a copy there, with its files and Git history, skills, notes, wiki, documents and agents (its conversations stay
where they were). Both machines need Hydor 0.120.0 or newer. See [Send a project to another machine](guide/04-projects.md#send-a-project-to-another-machine).

An access token can do all you can do on its machine, so make one for each machine that connects, and revoke
it when that machine no longer needs it. Dev-server previews work on the machine you opened only.

Keep the machines on the same Hydor version. The app you open shows another machine's pages in its own version, so a
machine with an older Hydor can lack what some of its pages need. Opening one offers to update it from there (as its own
Settings → General Update now does, with agents there carrying on), or to open it anyway. The page shows how far a
copy from git has got (a percentage, a bar, the step and about how long is left); an older Hydor there can't say, so
the page estimates it from the step it is on. A copy from git or Docker
older than 0.78.0 can't update itself past Hydor's rewritten history ("Not possible to fast-forward, aborting."): the
page then gives the command to run on that machine once ([install.md](install.md) has the other ways).
