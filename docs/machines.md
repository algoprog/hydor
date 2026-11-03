# Several machines

Using agents on other machines from one Hydor. [Back to the README](../README.md).

Run Hydor on each machine where agents should work (a desktop, a GPU box, a cloud VM), then use them
all from one of them: Settings → Machines → Add a machine. Each machine keeps its own sessions, files,
terminals and sign-ins. The sidebar switches between them, and notices from every machine reach you on the
one you opened.

1. On the other machine, make an access token: in its own Settings → Machines, or run
   `node dist/server/cli.js access-token "my laptop"` in its Hydor folder.
2. On the machine you use, add it with that token:
   - **Over SSH**, the simplest: give the SSH host (an entry of `~/.ssh/config`, or `user@host`) and the port
     Hydor listens on there (8790). The server opens the tunnel itself with its own SSH keys, which
     must work without a passphrase prompt, and the other machine keeps listening on `127.0.0.1` only.
   - **By its address**, on a private network or a VPN such as Tailscale: for example `http://100.64.0.5:8790`.
     Set `HOST` on that machine so it listens on that address.

An access token can do all you can do on its machine, so make one for each machine that connects, and revoke
it when that machine no longer needs it. Dev-server previews work on the machine you opened only.
