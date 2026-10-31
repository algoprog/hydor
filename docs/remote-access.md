# Remote access

Using Naget Agent from your phone or another computer. [Back to the README](../README.md).

Naget Agent can run any command as your user, so treat access to it like SSH access to your machine.
It listens on `127.0.0.1` only by default. To use it from your phone or another computer, put an HTTPS
layer in front instead of opening the port:

- **Tailscale:** `tailscale serve --bg 8790` serves it at `https://<machine>.<tailnet>.ts.net`, reachable only
  from your own devices.
- **Cloudflare Tunnel:** point a tunnel at `http://localhost:8790`. Cloudflare Access can add a second login.
- **Your own reverse proxy**, for example Caddy:

  ```
  agents.example.com {
      reverse_proxy 127.0.0.1:8790
  }
  ```

If the proxy changes the `Host` header, set `ALLOWED_ORIGINS=https://agents.example.com`.

HTTPS is also what phones need for push notifications and to install the app.
