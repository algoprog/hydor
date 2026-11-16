// `hydor phone`: Settings → App → Use on your phone, the app on your own phone through Tailscale (server/phone). Where things
// stand (Tailscale here, signed in, this machine's name; the address it is served at, with a QR code drawn in the
// terminal), `serve` to publish it over HTTPS to your own devices only (never Funnel), and `stop` to undo exactly that.
import { qrCode, type QrCode } from '../../../shared/qr.ts';
import { PHONE_PATH, type PhoneState } from '../../../shared/phone.ts';
import type { Paint } from '../term.ts';
import { fields, flag, mark, num, type Area, type Ctx } from './kit.ts';

/**
 * A QR code in the terminal: each square two full blocks wide (the one block glyph every terminal font draws), black on
 * white whatever the terminal's colours, with a quiet margin of two squares round it.
 */
export function qrLines(code: QrCode, p: Pick<Paint, 'on'>): string[] {
  const quiet = 2;
  const n = code.size + quiet * 2;
  const dark = (x: number, y: number) => x >= quiet && y >= quiet && x < code.size + quiet && y < code.size + quiet && code.modules[y - quiet][x - quiet];
  const lines: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) row += dark(x, y) ? '██' : '  ';
    lines.push(p.on ? `\x1b[30;47m${row}\x1b[0m` : row);
  }
  return lines;
}

/** Why Tailscale is not ready here, and what to do, as the page says it. */
function notReady(st: PhoneState): string {
  const t = st.tailscale;
  const linux = st.platform === 'linux';
  switch (t.state) {
    case 'missing':
      return `Tailscale isn’t installed on this computer. Install it from ${st.download}, sign in, then run hydor phone again.`;
    case 'not-running':
      return linux ? 'Tailscale is installed but not running: sudo systemctl start tailscaled' : 'Tailscale is installed but not running: open the Tailscale app.';
    case 'signed-out':
      return linux ? 'Tailscale isn’t signed in here: run tailscale up and sign in.' : 'Tailscale isn’t signed in here: sign in from the Tailscale app.';
    case 'stopped':
      return linux ? 'Tailscale is turned off here: run tailscale up.' : 'Tailscale is turned off here: turn it on in the Tailscale app.';
    case 'needs-approval':
      return 'This computer waits for an admin of your tailnet to approve it, in Tailscale’s admin console.';
    case 'too-old':
      return `This Tailscale (${t.version}) is too old to serve the app: update it from ${st.download}.`;
    default:
      return '';
  }
}

function show(ctx: Ctx, st: PhoneState, o: { qr?: boolean } = {}) {
  const { p } = ctx.look;
  const t = st.tailscale;
  const lines: string[] = [];
  const ready = t.state === 'ready';
  lines.push(
    ...fields(ctx, [
      ['Tailscale', ready ? `${mark(p, 'on')} signed in${t.version ? p.dim(` · ${t.version}`) : ''}` : `${mark(p, t.state === 'missing' ? 'off' : 'attention')} ${t.state.replace('-', ' ')}`],
      ['This computer', ready ? `${t.machine ?? ''}${t.tailnet ? p.dim(` on ${t.tailnet}`) : ''}` : undefined],
      ['Address', st.serving ? p.bold(st.serving.url) : ready ? p.dim('not served') : undefined],
    ]),
  );
  if (!ready) lines.push('', notReady(st));
  else if (!st.serving) {
    if (st.taken) lines.push('', `Something else is already published at https://${t.dnsName} (${st.taken.target}), so Hydor won’t replace it.${st.taken.free ? ` hydor phone serve --port ${st.taken.free} serves it there instead.` : ''}`);
    else lines.push('', 'hydor phone serve publishes it over HTTPS to the devices signed in to your Tailscale account only, never the public internet; the password is still asked.');
  } else {
    if (st.serving.funnel) lines.push('', p.red(`Funnel is on for this address: anyone on the internet can reach it. Turn it off: tailscale funnel --https=${st.serving.port} off`));
    if (!st.accepted) lines.push('', p.yellow('The app doesn’t accept this address yet: hydor phone serve adds it.'));
    if (t.https === false) lines.push('', p.yellow('HTTPS certificates are off in your tailnet: turn on MagicDNS and HTTPS Certificates at https://login.tailscale.com/admin/dns'));
    if (o.qr) lines.push('', 'Scan it with your phone’s camera. The phone needs the Tailscale app, signed in to the same account:', '', ...qrLines(qrCode(`${st.serving.url}${PHONE_PATH}`, { level: 'M' }), p));
    lines.push('', p.dim('hydor phone stop takes it off your tailnet.'));
  }
  ctx.out(lines);
}

export const phone: Area = {
  name: 'phone',
  aliases: ['tailscale'],
  summary: 'Use the app on your phone, by Tailscale',
  help: 'Settings → App → Use on your phone: the app on your own phone, privately. It is served with Tailscale Serve over HTTPS to the devices signed in to your Tailscale account only (never Funnel, which is public), and the app accepts that address by itself; the password is still asked. On the phone, open the address (or scan the QR code), sign in, then Add to Home Screen and Notify this device on the page that opens.',
  group: 'this',
  default: 'status',
  verbs: [
    {
      name: 'status',
      aliases: ['show'],
      args: [],
      options: { qr: { type: 'boolean', desc: 'Draw the QR code even when not at a terminal' }, 'no-qr': { type: 'boolean', desc: 'Leave the QR code out' } },
      summary: 'Tailscale here, and the address with a QR code',
      examples: ['hydor phone', 'hydor phone --json'],
      async run(ctx, _a, v) {
        const st = await ctx.conn.api<PhoneState>('GET', '/api/phone');
        if (ctx.o.json) return ctx.json(st);
        show(ctx, st, { qr: !flag(v, 'no-qr') && (flag(v, 'qr') || ctx.interactive) });
      },
    },
    {
      name: 'serve',
      aliases: ['on', 'start'],
      args: [],
      options: { port: { type: 'string', value: '<port>', desc: 'Its HTTPS port on your tailnet: 443, 8443 or 10000' } },
      summary: 'Publish it to your own devices, over HTTPS',
      help: 'With Tailscale Serve, on your tailnet only. When something stands in the way (Serve or HTTPS not turned on in the tailnet, Linux wanting you to be Tailscale’s operator, another service at that address), it says what to do.',
      examples: ['hydor phone serve', 'hydor phone serve --port 8443'],
      async run(ctx, _a, v) {
        const port = num(v, 'port', 1);
        const st = await ctx.conn.api<PhoneState>('POST', '/api/phone/serve', port ? { port } : {});
        if (ctx.o.json) return ctx.json(st);
        show(ctx, st, { qr: ctx.interactive });
      },
    },
    {
      name: 'stop',
      aliases: ['off'],
      args: [],
      summary: 'Take it off your tailnet again',
      help: 'Undoes exactly what serve did: its one handler in Tailscale Serve, and the address the app accepted, if serve added it.',
      examples: ['hydor phone stop'],
      async run(ctx) {
        const st = await ctx.conn.api<PhoneState>('POST', '/api/phone/stop');
        if (ctx.o.json) return ctx.json(st);
        ctx.out(st.serving ? `Still served at ${st.serving.url}.` : 'Stopped: the app is no longer served on your tailnet.');
      },
    },
  ],
};
