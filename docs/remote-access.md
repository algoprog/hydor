# Remote access

Using Hydor from your phone or another computer. [Back to the README](../README.md).

Hydor can run any command as your user, so treat access to it like SSH access to your machine.
It listens on `127.0.0.1` only by default. To use it from your phone or another computer, put an HTTPS
layer in front instead of opening the port.

## Use on your phone, with Tailscale

The app does this itself: **Settings → App → Use on your phone** (or `hydor machines phone serve` in a terminal).

1. Install [Tailscale](https://tailscale.com/download) on the computer that runs Hydor and sign in. The section says
   whether it is installed, running and signed in, and this computer's name on your tailnet.
2. Press **Serve it on my devices**. The app is published with Tailscale Serve over HTTPS at
   `https://<machine>.<tailnet>.ts.net`, reachable only from devices signed in to your Tailscale account (never
   Tailscale Funnel, which is public), and the server accepts that address by itself: no `ALLOWED_ORIGINS` to set.
   The password is still asked.
3. Install Tailscale on your phone, signed in to the same account, and scan the QR code the section shows. The page
   opens on the phone, where it walks you through Add to Home Screen and Notify this device.

When something stands in the way, the section says what to do: turn on Serve and HTTPS certificates in the tailnet
(Tailscale's link, one click), on Linux run `sudo tailscale set --operator=$USER` once, or serve on port 8443 when
something else is already published at the address. **Stop serving** undoes exactly what was done: the one handler
it added (`tailscale serve --https=443 --set-path=/ off`) and the address it added to the ones the server accepts.
It runs the `tailscale` command it finds on `PATH` or where Tailscale's installers put it; `TAILSCALE_BIN` names
another (see [configuration](configuration.md)). Agents can turn it on only through a card you answer each time. While
it serves, the links the app hands out (chat apps' Open in Hydor, links agents give to sessions and kept pages)
start with that address, unless `ALLOWED_ORIGINS` names one, which they keep using.

## Other ways

- **Tailscale by hand:** `tailscale serve --bg 8790` serves it at `https://<machine>.<tailnet>.ts.net`, reachable only
  from your own devices.
- **Cloudflare Tunnel:** point a tunnel at `http://localhost:8790`. Cloudflare Access can add a second login.
- **Your own reverse proxy**, for example Caddy:

  ```
  agents.example.com {
      reverse_proxy 127.0.0.1:8790
  }
  ```

If the proxy changes the `Host` header, set `ALLOWED_ORIGINS=https://agents.example.com`.

Wrong passwords are counted by the visitor's address (a picture to read after three, an hour's pause after ten).
The app takes it from the `X-Forwarded-For` header that a proxy on this computer or your own network adds; Cloudflare
Tunnel and Caddy add it by themselves, and nginx needs `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.
Without it every visitor counts as the proxy, so one person's wrong passwords would pause everyone.

HTTPS is also what phones need for push notifications and to install the app (and, installed, to take what other apps
share with it: [Share to Hydor](guide/20-devices.md#share-to-hydor-from-other-apps)).
