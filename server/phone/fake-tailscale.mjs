// A stand-in for the `tailscale` command, for server/phone/phone-test.ts and for trying Settings → App → Use on your
// phone in a scratch copy of the app without touching the computer's real Tailscale. Copy it into a folder of its own as
// `tailscale` (made executable), put that folder first on PATH (or point TAILSCALE_BIN at it), and write the state it
// plays beside it, in state.json:
//   version      "1.76.6" (from 1.52 Serve takes --bg and --https=; before, https:443 / <target>)
//   daemon       false: tailscaled is not running
//   backend      "Running" | "NeedsLogin" | "Stopped" | "NeedsMachineAuth"
//   certs        false: HTTPS certificates are off in the tailnet
//   serveEnabled false: serve prints the link that turns Serve on; with wait: true it then waits, as Tailscale can
//   operator     false: serve is refused as on Linux for a user who is not Tailscale's operator
//   serve        the Serve config, as `tailscale serve status --json` prints it ({} for none)
// Every call is added to calls.log beside it, one a line. It never does anything to the network: it only reads and
// writes those two files. Funnel, up, down and set are refused (and logged), so a test can check they were never asked.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(fs.realpathSync(process.argv[1]));
const stateFile = path.join(dir, 'state.json');
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, 'calls.log'), `${args.join(' ')}\n`);
const state = (() => {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
})();
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
const version = state.version ?? '1.76.6';
const [maj, min] = version.split('.').map(Number);
const modern = maj > 1 || min >= 52;
const host = 'laptop.tail1234.ts.net';
const out = (s) => process.stdout.write(s);
const fail = (s, code = 1) => {
  process.stderr.write(s);
  process.exit(code);
};

if (args[0] === 'version') {
  out(`${version}\n  tailscale commit: 0123456789abcdef\n  other commit: fedcba9876543210\n  go version: go1.23.4\n`);
  process.exit(0);
}
if (state.daemon === false) fail("failed to connect to local tailscaled; it doesn't appear to be running (sudo systemctl start tailscaled ?)\n");

if (args[0] === 'status' && args.includes('--json')) {
  const backend = state.backend ?? 'Running';
  out(
    JSON.stringify(
      {
        Version: `${version}-t0123456789-gfedcba987`,
        BackendState: backend,
        AuthURL: backend === 'NeedsLogin' ? 'https://login.tailscale.com/a/abc123' : '',
        TailscaleIPs: ['100.101.102.103'],
        Self: { ID: 'n1', HostName: 'laptop', DNSName: backend === 'NeedsLogin' ? '' : `${host}.`, OS: 'linux', Online: backend === 'Running' },
        CurrentTailnet: backend === 'NeedsLogin' ? null : { Name: 'you@example.com', MagicDNSSuffix: 'tail1234.ts.net', MagicDNSEnabled: true },
        CertDomains: state.certs === false || backend === 'NeedsLogin' ? null : [host],
        Health: [],
      },
      null,
      2,
    ) + '\n',
  );
  process.exit(0);
}

if (args[0] === 'serve') {
  const sc = state.serve ?? {};
  const rest = args.slice(1);
  if (rest[0] === 'status') {
    out(`${JSON.stringify(sc, null, 2)}\n`);
    process.exit(0);
  }
  if (rest.includes('funnel') || rest.some((a) => a.startsWith('--funnel'))) fail('refused: the fake never turns on Funnel\n');
  let port;
  let mount = '/';
  let target;
  let off = rest.at(-1) === 'off';
  if (modern) {
    const p = rest.find((a) => a.startsWith('--https='));
    if (!p) fail('error: the fake only knows --https=<port>\n');
    if (rest.some((a) => /^https:\d+$/.test(a))) fail('error: invalid argument "https:443"; the CLI changed in 1.52, see tailscale serve --help\n');
    port = Number(p.slice(8));
    const sp = rest.find((a) => a.startsWith('--set-path='));
    if (sp) mount = sp.slice(11);
    target = rest.filter((a) => !a.startsWith('--') && a !== 'off')[0];
  } else {
    if (rest.some((a) => a.startsWith('--'))) fail(`flag provided but not defined: ${rest.find((a) => a.startsWith('--'))}\n`);
    const m = /^https:(\d+)$/.exec(rest[0] ?? '');
    if (!m) fail('error: the fake only knows https:<port> / <target>\n');
    port = Number(m[1]);
    mount = rest[1];
    target = off ? undefined : rest[2];
  }
  if (state.operator === false) {
    fail(`Access denied: serve config denied\n\nUse 'sudo tailscale ${args.join(' ')}'.\nTo not require root, use 'sudo tailscale set --operator=$USER' once.\n`);
  }
  const hp = `${host}:${port}`;
  if (off) {
    const handlers = sc.Web?.[hp]?.Handlers;
    if (!handlers || !handlers[mount]) fail(`error: handler does not exist\n`);
    delete handlers[mount];
    if (!Object.keys(handlers).length) {
      delete sc.Web[hp];
      delete sc.TCP?.[String(port)];
      if (!Object.keys(sc.Web).length) delete sc.Web;
      if (sc.TCP && !Object.keys(sc.TCP).length) delete sc.TCP;
    }
    state.serve = sc;
    save();
    process.exit(0);
  }
  if (state.serveEnabled === false) {
    out('\nServe is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/serve?node=nFAKE123\n\n');
    if (state.wait) setInterval(() => {}, 1000);
    else process.exit(0);
  } else {
    if (!target) fail('error: a target is needed\n');
    if (modern && !rest.includes('--bg')) fail('the fake only serves in the background (--bg)\n');
    const proxy = /^\d+$/.test(target) ? `http://127.0.0.1:${target}` : target;
    sc.TCP = { ...(sc.TCP ?? {}), [String(port)]: { HTTPS: true } };
    sc.Web = { ...(sc.Web ?? {}), [hp]: { Handlers: { ...(sc.Web?.[hp]?.Handlers ?? {}), [mount]: { Proxy: proxy } } } };
    state.serve = sc;
    save();
    out(`Available within your tailnet:\n\nhttps://${host}${port === 443 ? '' : `:${port}`}/\n|-- proxy ${proxy}\n\nServe started and running in the background.\nTo disable the proxy, run: tailscale serve --https=${port} off\n`);
    process.exit(0);
  }
} else {
  fail(`refused: the fake only answers version, status and serve (asked: ${args.join(' ')})\n`);
}
