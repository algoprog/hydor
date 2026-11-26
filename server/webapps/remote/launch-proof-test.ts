// The proof of launching, over real SSH to a machine with real Docker: a stand-in for a server (fixtures/standin: an Ubuntu
// with systemd and sshd in a privileged container that runs its own Docker), reached with the key Hydor makes, on free ports
// of this computer. Two real apps, built from scratch in plain Node, are copied into a scratch folder, given a hydor.json and
// launched to it: a food bank's stock list (no packages) and a crews app (Express), neither with a Dockerfile of its own,
// from ../fixtures/apps/.
//
// Needs Docker (privileged containers), ssh, ssh-keygen, ssh-keyscan, tar, git, the network (Docker Hub, ghcr.io, Docker's
// apt repository, npm) and about ten minutes. Everything it makes is named hydor-launch-proof-<id>-… or lives in a scratch
// folder, and is removed at the end by its exact name (KEEP=1 leaves it).
//
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/remote/launch-proof-test.ts
//   HYDOR_LAUNCH_PROOF=1 node dist/dev/launch-proof-test.js
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import fs from "node:fs";
import { request } from "node:https";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { readHydorText } from "../../../shared/hydor-file.ts";
import { APP_ROOT } from "../../config.ts";
import {
  acceptHost, addHost, backups, checkHost, connectSsh, history, launch, logs, NOT_STRUCTURED, offerHost, Refused, restart, rollback, status, takeDown,
  type CheckOutcome, type Connect, type LaunchOptions, type LaunchOutcome, type Place, type RemoteContract, type SmokeRunner,
} from "./index.ts";

if (process.env.HYDOR_LAUNCH_PROOF !== "1") {
  console.log("skipped: the launch proof needs Docker and the network; set HYDOR_LAUNCH_PROOF=1 (see the file's head)");
  process.exit(0);
}
const FOOD = path.join(APP_ROOT, "server", "webapps", "fixtures", "apps", "food-bank");
const CREWS = path.join(APP_ROOT, "server", "webapps", "fixtures", "apps", "crews");

const RUN = randomBytes(3).toString("hex");
const NAMES = { server: `hydor-launch-proof-${RUN}-server`, image: `hydor-launch-proof-${RUN}-standin`, docker: `hydor-launch-proof-${RUN}-docker`, containerd: `hydor-launch-proof-${RUN}-containerd` };
const root = fs.mkdtempSync(path.join(os.tmpdir(), "hydor-launch-proof-"));
const hostsDir = path.join(root, "hosts");

const API_KEY = `proof-key-${randomBytes(18).toString("hex")}`;
const S3_SECRET = `proof-s3-${randomBytes(18).toString("hex")}`;
const HIDDEN: [string, string][] = [[root, "<scratch>"], [API_KEY, "«proof key»"], [S3_SECRET, "«storage secret»"], [os.homedir(), "~"]];

const failures: string[] = [];
let checks = 0;
const said: string[] = [];
const say = (text = "") => {
  let out = text;
  for (const [from, to] of HIDDEN) if (from.length > 3) out = out.split(from).join(to);
  said.push(out);
  console.log(out);
};
const expect = (condition: unknown, message: string) => {
  checks++;
  if (condition) say(`  ok    ${message}`);
  else {
    say(`  FAIL  ${message}`);
    failures.push(message);
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tail = (text: string, n = 15) => text.trim().split("\n").slice(-n).map((l) => `        ${l}`).join("\n");

const sh = (cmd: string, args: string[], input?: string) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", input, maxBuffer: 1 << 28 });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
};
const docker = (...args: string[]) => sh("docker", args);
/** A command on the stand-in, run from outside (what a person sees on the machine itself), as root. */
const onServer = (command: string, input?: string) => sh("docker", ["exec", ...(input === undefined ? [] : ["-i"]), NAMES.server, "bash", "-c", command], input);
const inApp = (app: string, command: string) => onServer(`cd ~deploy/hydor-apps/${app} && ${command}`);

async function freePort(): Promise<number> {
  for (;;) {
    const port = randomInt(20_000, 30_000);
    const ok = await new Promise<boolean>((resolve) => {
      const s = createServer();
      s.once("error", () => resolve(false));
      s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
    });
    if (ok) return port;
  }
}

// ---- over https, trusting only the authority Caddy made --------------------------------------------------------------

interface Got {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}
let httpsPort = 0;
let CA = "";
const site = (domain: string, method: string, at: string, o: { json?: unknown; cookie?: string; ca?: string | null } = {}): Promise<Got> =>
  new Promise((resolve, reject) => {
    const body = o.json === undefined ? undefined : JSON.stringify(o.json);
    const req = request(
      {
        method,
        hostname: "127.0.0.1",
        port: httpsPort,
        path: at,
        servername: domain,
        ...(o.ca === null ? {} : { ca: o.ca ?? CA }),
        headers: { host: `${domain}:${httpsPort}`, ...(body ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) },
        timeout: 15_000,
        agent: false,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (d: string) => (text += d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text, headers: res.headers }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
const cookieOf = (g: Got) => ([] as string[]).concat(g.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");

// ---- the connection, with everything it is given written down ---------------------------------------------------------

const scriptsSent: string[] = [];
const printed: string[] = [];
const recording: Connect = (dir, host) => {
  const real = connectSsh(dir, host);
  const note = async <T extends { out: string; err: string }>(script: string, p: Promise<T>) => {
    scriptsSent.push(script);
    const r = await p;
    // What the server printed, but for the one script that reads the key files to hide their values.
    if (!script.startsWith("# hydor:held")) printed.push(r.out, r.err);
    return r;
  };
  return {
    run: (s, o) => note(s, real.run(s, o)),
    runWithFile: (s, f, o) => {
      fs.copyFileSync(f, path.join(root, `sent-${scriptsSent.length}.tar.gz`));
      return note(s, real.runWithFile(s, f, o));
    },
    runToFile: (s, f, o) => note(s, real.runToFile(s, f, o)),
    close: () => real.close(),
  };
};

// ---- the apps ----------------------------------------------------------------------------------------------------------

const copyApp = (from: string, to: string) => fs.cpSync(from, to, { recursive: true, filter: (src) => !/(^|\/)(node_modules|data|\.git|judge\.json)(\/|$)/.test(path.relative(from, src)) });
const edit = (file: string, find: string, replace: string) => {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(find)) throw new Error(`${path.basename(file)} no longer has: ${find}`);
  fs.writeFileSync(file, text.replace(find, replace));
};
const writeContract = (dir: string, value: Record<string, unknown>): RemoteContract => {
  fs.writeFileSync(path.join(dir, "hydor.json"), `${JSON.stringify(value, null, 2)}\n`);
  const read = readHydorText(fs.readFileSync(path.join(dir, "hydor.json"), "utf8"));
  if (!read.ok) throw new Error(read.problems.join(" "));
  return read.file;
};
/** The caller's contract check, here only as far as reading the file (Hydor gives its own, which runs the app). */
const checkOf = (dir: string) => async (): Promise<CheckOutcome> => {
  const read = readHydorText(fs.readFileSync(path.join(dir, "hydor.json"), "utf8"));
  return { lines: [{ id: "file", title: "hydor.json says what is needed", state: read.ok ? "passed" : "failed", text: read.ok ? "It reads." : read.problems.join(" ") }] };
};

const smokeRunner: SmokeRunner = async ({ line, dir, env, ca }) => {
  const caFile = path.join(root, "smoke-ca.pem");
  if (ca) fs.writeFileSync(caFile, ca);
  return new Promise((resolve) => {
    execFile("sh", ["-c", line], { cwd: dir, timeout: 60_000, env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, ...env, ...(ca ? { NODE_EXTRA_CA_CERTS: caFile } : {}) } }, (error, out, err) => resolve({ code: error ? 1 : 0, output: `${out}${err}` }));
  });
};

const report = (label: string, out: LaunchOutcome, t0: number) => {
  say(`        -- ${label}: ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const s of out.steps) say(`        ${s.state.padEnd(7)} ${s.id.padEnd(9)} ${(s.say ?? "").slice(0, 230)}`);
  say(`        => ${out.summary}`);
  for (const n of out.notes) say(`        note: ${n.slice(0, 300)}`);
  if (out.problems.length && !out.ok) say(tail(out.problems.join("\n"), 12));
};
const run = async (label: string, options: LaunchOptions) => {
  const t0 = Date.now();
  const out = await launch(options);
  report(label, out, t0);
  return out;
};
const refusal = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return "";
  } catch (e) {
    if (e instanceof Refused) return e.message;
    throw e;
  }
};

async function main() {
  const started = Date.now();
  say(`run ${RUN}; scratch folder: ${root}`);
  const imagesBefore = new Set(docker("images", "--format", "{{.Repository}}:{{.Tag}}").out.split("\n"));
  try {
    say("\n== 1. The stand-in for a server: an Ubuntu with systemd and sshd, in a privileged container that runs its own Docker (none installed yet)");
    const built = docker("build", "-q", "-t", NAMES.image, path.join(process.cwd(), "server/webapps/remote/fixtures/standin"));
    expect(built.code === 0, `the image ${NAMES.image} is built from fixtures/standin/Dockerfile${built.code === 0 ? "" : `\n${tail(built.err)}`}`);
    const sshPort = await freePort();
    const httpPort = await freePort();
    httpsPort = await freePort();
    for (const v of [NAMES.docker, NAMES.containerd]) docker("volume", "create", v);
    const ran = docker("run", "-d", "--name", NAMES.server, "--hostname", "standin", "--privileged", "--cgroupns=private", "--cpus=8", "--tmpfs", "/run", "--tmpfs", "/run/lock", "-v", `${NAMES.docker}:/var/lib/docker`, "-v", `${NAMES.containerd}:/var/lib/containerd`, "-p", `127.0.0.1:${sshPort}:22`, "-p", `127.0.0.1:${httpPort}:80`, "-p", `127.0.0.1:${httpsPort}:443`, NAMES.image);
    expect(ran.code === 0, `the container ${NAMES.server} runs, ssh on 127.0.0.1:${sshPort}, 80 on ${httpPort}, 443 on ${httpsPort}${ran.code === 0 ? "" : `\n${tail(ran.err)}`}`);
    for (let i = 0; i < 90 && onServer("systemctl is-active ssh").out.trim() !== "active"; i++) await sleep(1000);
    expect(onServer("systemctl is-active ssh").out.trim() === "active" && onServer("command -v docker || echo none").out.trim() === "none", "sshd is up, and there is no Docker in it");

    say("\n== 2. A host: a key Hydor makes, the machine's fingerprints, nothing recorded until one is accepted");
    const made = await addHost(hostsDir, "stand", `deploy@127.0.0.1:${sshPort}`);
    expect(made.state === "made" && made.publicKey.startsWith("ssh-ed25519 "), "a host is added with a key pair made for it in the hosts folder (your own ~/.ssh is never read)");
    onServer("cat > ~deploy/.ssh/authorized_keys && chown deploy:deploy ~deploy/.ssh/authorized_keys && chmod 600 ~deploy/.ssh/authorized_keys", `${made.publicKey}\n`);
    const offer = await offerHost(hostsDir, "stand");
    const ed = offer.offered.find((o) => o.type === "ssh-ed25519")?.fingerprint ?? "";
    const truth = onServer("ssh-keygen -l -E sha256 -f /etc/ssh/ssh_host_ed25519_key.pub").out;
    expect(!!ed && truth.includes(ed) && !fs.existsSync(path.join(hostsDir, "known_hosts")), `the machine's fingerprints are shown (${offer.offered.length}), the ed25519 one is the machine's own (${ed}), and nothing is recorded`);
    expect(/does not show the key you accepted/.test(await refusal(() => acceptHost(hostsDir, "stand", "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))), "a fingerprint that is not the machine's is refused");
    const recorded = await acceptHost(hostsDir, "stand", ed);
    expect(recorded.state === "recorded" && (fs.statSync(path.join(hostsDir, "hosts.json")).mode & 0o077) === 0, "with the right one the host is recorded, in files only their owner reads");

    say("\n== 3. A changed host key is refused before anything is sent");
    const food = path.join(root, "foodbank");
    copyApp(FOOD, food);
    edit(path.join(food, "server.js"), "async function handle(req, res) {\n", "async function handle(req, res) {\n  res.setHeader('X-Proof-Version', '1.0.0');\n");
    const foodValue = {
      name: "Eastgate Food Bank",
      start: "node --disable-warning=ExperimentalWarning server.js",
      env: { port: "PORT", data: "DATA_DIR" },
      ready: "/sign-in",
      signIn: "own",
      database: { file: "foodbank.db", sqlite: true },
      keys: [{ name: "PROOF_API_KEY", from: "you", why: "A key of the proof's, to see where it goes and where it does not.", how: ["make one up"] }],
    };
    let contract = writeContract(food, foodValue);
    execFileSync("git", ["init", "-q"], { cwd: food });
    const foodAddress = `https://foodbank.localhost:${httpsPort}`;
    const place: Place = { hostsDir, host: "stand", app: "foodbank", connect: recording };
    const options = (more: Partial<LaunchOptions> = {}): LaunchOptions => ({ ...place, dir: food, contract, address: foodAddress, keys: { PROOF_API_KEY: API_KEY }, check: checkOf(food), by: "the proof", ...more });

    onServer("mkdir -p /root/kept && cp -p /etc/ssh/ssh_host_* /root/kept/ && rm -f /etc/ssh/ssh_host_* && ssh-keygen -A >/dev/null && systemctl restart ssh");
    await sleep(2000);
    const knownBefore = fs.readFileSync(path.join(hostsDir, "known_hosts"), "utf8");
    const checkRefused = await refusal(() => checkHost(hostsDir, "stand"));
    expect(/is not the one you accepted\. Nothing was sent to it/.test(checkRefused), `checking the host says: “${checkRefused.slice(0, 130)}…”`);
    const refusedLaunch = await launch(options());
    expect(refusedLaunch.result === "failed" && /is not the one you accepted/.test(refusedLaunch.summary) && !refusedLaunch.steps.some((s) => s.id === "send" && s.state !== "waiting"), "a launch is refused too, at the host step, before anything is sent");
    expect(onServer("ls ~deploy").out.trim() === "" && fs.readFileSync(path.join(hostsDir, "known_hosts"), "utf8") === knownBefore, "nothing arrived on the machine, and the accepted key was not replaced");
    onServer("rm -f /etc/ssh/ssh_host_* && cp -p /root/kept/ssh_host_* /etc/ssh/ && systemctl restart ssh");
    await sleep(2000);

    say("\n== 4. check and prepare");
    const bare = await checkHost(hostsDir, "stand");
    expect(!bare.ok && /Docker is not installed/.test(bare.summary) && onServer("command -v docker || echo none").out.trim() === "none", `check says what is missing and installs nothing: “${bare.summary.slice(0, 120)}”`);
    const t4 = Date.now();
    const lines: string[] = [];
    const prepared = await checkHost(hostsDir, "stand", { prepare: true, onLine: (l) => lines.push(l) });
    say(`        -- prepare: ${Math.round((Date.now() - t4) / 1000)} s (${lines.join("; ")})`);
    for (const f of prepared.looked) say(`        ${f.ok === true ? "ok     " : f.ok === false ? "MISSING" : "note   "} ${f.say}`);
    expect(prepared.ok && prepared.prepared, "prepare installs Docker from Docker's own repository and cron, and the host is ready");
    const ufw = onServer("ufw status").out;
    expect(/Status: active/.test(ufw) && /22\/tcp\s+ALLOW/.test(ufw) && /80\/tcp\s+ALLOW/.test(ufw) && /443\/tcp\s+ALLOW/.test(ufw), "the firewall is on and lets in SSH, 80 and 443");

    say("\n== 5. The first launch of the food bank (plain Node, no packages, no Dockerfile)");
    const first = await run("first launch", options());
    expect(first.ok && first.steps.every((s) => s.state === "passed" || (s.id === "snapshot" && s.state === "skipped")), "every step passes (nothing to snapshot before the first)");
    expect(first.backup?.verified === true && first.downtimeSeconds === null, "a backup was made, read back, and there was no downtime to measure");
    CA = inApp("foodbank", "docker compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt").out;
    const page = await site("foodbank.localhost", "GET", "/sign-in");
    expect(page.status === 200 && page.headers["x-proof-version"] === "1.0.0", `over https, trusting only Caddy's own authority, /sign-in answers ${page.status}`);
    const noCa = await site("foodbank.localhost", "GET", "/sign-in", { ca: null }).then(() => "reached", (e: NodeJS.ErrnoException) => e.code ?? e.message);
    expect(/CERT|SELF_SIGNED|UNABLE_TO/.test(noCa), `without that authority the same connection is refused (${noCa})`);
    const signUp = await site("foodbank.localhost", "POST", "/api/sign-up", { json: { name: "Ada Proof", email: "ada.proof@example.com", password: "correct-horse-battery" } });
    const cookie = cookieOf(signUp);
    expect(signUp.status === 201 && /Secure/.test(String(signUp.headers["set-cookie"])), `an account is made over https (${signUp.status}), its cookie marked Secure`);
    const added = await site("foodbank.localhost", "POST", "/api/stock", { cookie, json: { name: "Tinned tomatoes", category: "tinned", quantity: 12 } });
    const stock = async () => (JSON.parse((await site("foodbank.localhost", "GET", "/api/stock", { cookie })).body) as { rows: { name: string }[] }).rows.map((r) => r.name);
    expect(added.status === 201 && (await stock()).join() === "Tinned tomatoes", "a row is added over https and the list has it");
    expect(inApp("foodbank", "docker compose exec -T app sh -c 'id -un; stat -c %U /data /data/foodbank.db'").out.trim() === "node\nnode\nnode", "the app runs as an unprivileged user that owns its data folder");
    expect(!/0\.0\.0\.0:3000|:::3000/.test(onServer("docker ps --format '{{.Ports}}'").out), "the app's own port is not published");

    say("\n== 5b. The provider's address about the machine: the machine reaches it, nothing in the app's containers does");
    // A stand-in for it behind this machine, as a provider's is: in a network of its own, at the address providers use,
    // reached by what the machine forwards.
    const fake = onServer([
      "docker run -d --name provider-metadata --network none --entrypoint node node:22-bookworm-slim -e 'require(\"http\").createServer((q, s) => s.end(\"the setup text\")).listen(80, \"0.0.0.0\")'",
      "pid=$(docker inspect -f '{{.State.Pid}}' provider-metadata)",
      "ip link add veth-prov type veth peer name veth-meta",
      "ip link set veth-meta netns $pid",
      "ip addr add 192.0.2.1/30 dev veth-prov && ip link set veth-prov up",
      "nsenter -t $pid -n sh -ec 'ip addr add 192.0.2.2/30 dev veth-meta; ip addr add 169.254.169.254/32 dev veth-meta; ip link set veth-meta up; ip link set lo up; ip route add default via 192.0.2.1'",
      "ip route add 169.254.169.254/32 via 192.0.2.2",
      "for i in $(seq 1 60); do curl -s -m 2 http://169.254.169.254/ >/dev/null && break; sleep 1; done",
    ].join(" && "));
    expect(fake.code === 0, `a stand-in for the provider's address is up${fake.code === 0 ? "" : `\n${tail(fake.err + fake.out)}`}`);
    expect(onServer("curl -s -m 4 http://169.254.169.254/").out === "the setup text", "the machine itself reaches it (as its own start-up does)");
    const ask = (service: string) => inApp("foodbank", `docker compose exec -T ${service} node -e 'fetch("http://169.254.169.254/", { signal: AbortSignal.timeout(4000) }).then((r) => r.text()).then((t) => console.log("got " + t), (e) => console.log("failed " + (e.cause?.code ?? e.name)))'`).out.trim();
    const fromApp = ask("app");
    expect(fromApp.startsWith("failed "), `a request from inside the app's container fails: “${fromApp}”`);
    expect(ask("backup").startsWith("failed "), "and from the backup service's");
    // Without the rule the same request goes through: it is the rule that stops it.
    onServer("iptables -t raw -D PREROUTING -d 169.254.169.254/32 -j DROP");
    const open = ask("app");
    expect(open === "got the setup text", `with the rule taken out it goes through: “${open}”`);
    inApp("foodbank", "docker compose restart guard");
    await sleep(4000);
    expect(ask("app").startsWith("failed "), "the guard puts it back when it starts");
    const rules = onServer("iptables -t raw -S PREROUTING; ip6tables -t raw -S PREROUTING").out;
    expect(["169.254.169.254/32", "fd00:ec2::254/128", "fe80::a9fe:a9fe/128"].every((a) => rules.includes(a)), "the IPv4 address and the IPv6 ones are refused");
    expect(onServer("systemctl is-enabled hydor-metadata.service").out.trim() === "enabled", "prepare left the same rules as a unit that runs before Docker");
    onServer("docker rm -f provider-metadata; ip link del veth-prov 2>/dev/null; true");

    say("\n== 6. status and logs");
    const st = await status(place);
    say(`        ${st.say} ${st.disk.say}; last backup ${st.lastBackup?.id} (${st.lastBackup?.ageHours} h); schedule ${st.schedule?.at} UTC / ${st.schedule?.keepDays} days; ${st.logSay}`);
    expect(st.up === true && st.version === "1.0.0" && !!st.lastBackup && st.services.length === 4 && st.errors === null && st.logSay === NOT_STRUCTURED && !st.problems.length, "status says it is up at its address, since when, the version, the last launch and backup, the disk, and that its log is not structured");
    // As the app's own user: the container's first process is that user's, and its output is the app's log.
    onServer(`cid=$(cd ~deploy/hydor-apps/foodbank && docker compose ps -q app); docker exec -i -u node $cid sh -c 'read -r k; echo "debug key=$k end" > /proc/1/fd/1'`, `${API_KEY}\n`);
    const logLines = await logs(place, { since: "30m" });
    expect(logLines.some((l) => l.includes("is running")) && logLines.some((l) => l.includes("debug key=") && l.includes("«hidden»")) && !logLines.join().includes(API_KEY), "logs show the app's own lines, and a line holding a key is masked");

    say("\n== 7. A backup, a change, the backup put back");
    const one = await backups.now(place);
    expect(one.verified && !one.problems.length && one.backup.tables.stock === 1, `backup now makes ${one.backup.id} and reads it back (stock ${one.backup.tables.stock} row)`);
    const pulled = await backups.pull(place, one.backup.id, path.join(root, "pulled"));
    const listing = sh("tar", ["-tzf", pulled.file]).out;
    expect(/foodbank\.db/.test(listing) && /manifest\.json/.test(listing), `it is pulled here (${pulled.bytes} bytes), with the database and a manifest`);
    await site("foodbank.localhost", "POST", "/api/stock", { cookie, json: { name: "Added after the backup", category: "fresh", quantity: 1 } });
    expect((await stock()).length === 2, "a second row is added after the backup");
    expect(/replaces the app's data/.test(await refusal(() => backups.restore(place, one.backup.id))) && (await stock()).length === 2, "a restore without yes is refused and changes nothing");
    const back = await backups.restore(place, one.backup.id, { yes: true });
    say(`        => ${back.summary}`);
    expect((await stock()).join() === "Tinned tomatoes" && !!back.safety, "the backup is put back: the second row is gone, and a safety copy of what was there is kept");
    expect((await site("foodbank.localhost", "GET", "/api/stock", { cookie })).status === 200, "the session made before still works");
    const scheduled = await backups.schedule(place, { at: "02:15", keepDays: 30 });
    expect(scheduled.at === "02:15" && inApp("foodbank", "docker compose exec -T backup printenv HYDOR_BACKUP_AT HYDOR_BACKUP_KEEP_DAYS").out.trim() === "02:15\n30", "the schedule is changed on the running backup service (02:15 UTC, 30 days)");

    say("\n== 8. A second launch of a changed version, with its own smoke line and a copy of backups to S3-compatible storage");
    const s3 = onServer(`docker run -d --name s3 --network hydor-foodbank_default --network-alias s3 -e ROOT_ACCESS_KEY=proofaccess -e ROOT_SECRET_KEY=${S3_SECRET} --entrypoint sh ghcr.io/versity/versitygw:latest -c 'mkdir -p /data/hydor-backups && exec versitygw posix /data'`);
    expect(s3.code === 0, `an S3-compatible server (VersityGW) runs on the app's network${s3.code === 0 ? "" : `\n${tail(s3.err)}`}`);
    edit(path.join(food, "server.js"), "'X-Proof-Version', '1.0.0'", "'X-Proof-Version', '1.1.0'");
    edit(path.join(food, "package.json"), '"version": "1.0.0"', '"version": "1.1.0"');
    fs.writeFileSync(
      path.join(food, "smoke.mjs"),
      `import { request } from 'node:https';
const url = new URL(process.env.SMOKE_URL);
request({ hostname: process.env.SMOKE_CONNECT_TO || url.hostname, port: url.port, path: '/sign-in', servername: url.hostname, headers: { host: url.host } }, (res) => {
  res.resume();
  const version = res.headers['x-proof-version'];
  if (res.statusCode !== 200 || version !== '1.1.0') { console.error('the live app says ' + res.statusCode + ' ' + version); process.exit(1); }
  console.log('smoke ok');
}).end();
`,
    );
    contract = writeContract(food, { ...foodValue, smoke: "node smoke.mjs" });
    const storage = { BACKUP_S3_ENDPOINT: "http://s3:7070", BACKUP_S3_BUCKET: "hydor-backups", BACKUP_S3_ACCESS_KEY_ID: "proofaccess", BACKUP_S3_SECRET_ACCESS_KEY: S3_SECRET, BACKUP_S3_PREFIX: "foodbank" };
    let polling = true;
    const gaps: number[] = [];
    let polls = 0;
    let downSince: number | null = null;
    const poller = (async () => {
      while (polling) {
        const t = Date.now();
        const up = await site("foodbank.localhost", "GET", "/sign-in").then((x) => x.status === 200, () => false);
        polls++;
        if (!up && downSince === null) downSince = t;
        if (up && downSince !== null) {
          gaps.push((t - downSince) / 1000);
          downSince = null;
        }
        await sleep(100);
      }
    })();
    const commandLines: string[] = [];
    const watcher = setInterval(() => commandLines.push(sh("ps", ["-eo", "args"]).out.split("\n").filter((l) => l.startsWith("ssh ") || l.includes("hydor")).join("\n")), 700);
    const second = await run("second launch (1.1.0)", options({ storage, smokeRunner, keys: {} }));
    clearInterval(watcher);
    polling = false;
    await poller;
    expect(second.ok && second.steps.find((s) => s.id === "snapshot")!.state === "passed" && second.steps.find((s) => s.id === "keys")!.say!.includes("already on the server"), "it passes: what ran was backed up first, and the key did not have to be given again");
    expect(second.steps.find((s) => s.id === "smoke")!.say!.includes("own smoke line passes"), "the app's own smoke line ran against the live address");
    const reported = second.downtimeSeconds;
    const worst = gaps.length ? Math.max(...gaps) : 0;
    say(`        downtime reported: ${reported} s; an independent poller every 100 ms (${polls} polls) saw ${gaps.length} outage(s), the longest ${worst.toFixed(1)} s, ${gaps.reduce((a, g) => a + g, 0).toFixed(1)} s in all`);
    expect(reported !== null && reported > 0 && reported < 45 && Math.abs(reported - gaps.reduce((a, g) => a + g, 0)) < 5, `the downtime is measured: ${reported} seconds`);
    expect((await site("foodbank.localhost", "GET", "/sign-in")).headers["x-proof-version"] === "1.1.0" && (await stock()).join() === "Tinned tomatoes", "the new version answers, and the data is intact");
    expect((await site("foodbank.localhost", "GET", "/api/stock", { cookie })).status === 200, "and the same session still works");
    const copied = await backups.now(place);
    const objects = onServer("docker exec s3 ls /data/hydor-backups/foodbank").out;
    expect(copied.backup.elsewhere === true && objects.includes(`${copied.backup.id}.tar.gz`), `a backup is copied to the storage too (foodbank/${copied.backup.id}.tar.gz in the bucket)`);

    say("\n== 9. The way back, and forward again");
    const rb = await rollback(place);
    say(`        => ${rb.summary}`);
    expect(rb.ok && (await site("foodbank.localhost", "GET", "/sign-in")).headers["x-proof-version"] === "1.0.0" && (await stock()).join() === "Tinned tomatoes", "going back: 1.0.0 answers again, on the data as it is");
    const fwd = await rollback(place);
    say(`        => ${fwd.summary}`);
    expect(fwd.ok && (await site("foodbank.localhost", "GET", "/sign-in")).headers["x-proof-version"] === "1.1.0", "going back again goes forward to 1.1.0");

    say("\n== 10. A launch broken on purpose: it changes the database and its first page answers 500");
    edit(path.join(food, "server.js"), "'X-Proof-Version', '1.1.0');\n", "'X-Proof-Version', '1.2.0');\n  if (req.url === '/') { res.writeHead(500); return res.end('boom'); }\n");
    edit(path.join(food, "package.json"), '"version": "1.1.0"', '"version": "1.2.0"');
    fs.appendFileSync(path.join(food, "src/db.js"), "\ndb.exec(\"CREATE TABLE IF NOT EXISTS proof_broken (id INTEGER); INSERT INTO proof_broken VALUES (1)\");\n");
    contract = writeContract(food, foodValue);
    const tables = () => inApp("foodbank", "docker compose run --rm --no-deps -T --entrypoint sqlite3 backup /data/foodbank.db .tables").out;
    const broken = await run("third launch (1.2.0, broken)", options({ keys: {} }));
    expect(broken.result === "rolled-back" && broken.previousBack && broken.steps.find((s) => s.id === "smoke")!.state === "failed", "it fails at its smoke look and the version before is put back by itself");
    expect(/the data was put back/.test(broken.notes.join(" ")), "and the data too, because the new version had changed it");
    expect((await site("foodbank.localhost", "GET", "/sign-in")).headers["x-proof-version"] === "1.1.0" && (await stock()).join() === "Tinned tomatoes" && !/proof_broken/.test(tables()), "1.1.0 answers with its row, and the broken version's table is gone");
    const hist = await history(place);
    for (const h of hist) say(`        ${h.at.slice(0, 19)}  ${h.action.padEnd(8)} ${h.result.padEnd(11)} ${h.version}  ${h.id}${h.failedStep ? `  failed at ${h.failedStep}` : ""}`);
    expect(hist.length === 5 && hist[0]!.result === "rolled-back" && hist.filter((h) => h.action === "rollback").length === 2, "history lists the launches and the ways back, newest first");

    say("\n== 11. A polite stop and a restart");
    const t11 = Date.now();
    const stopped = inApp("foodbank", `docker compose stop app 2>&1; docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' $(docker compose ps -a -q app)`);
    expect(/\n0 false\s*$/.test(`\n${stopped.out}`), `told to stop, the app ends by itself with code 0 (${((Date.now() - t11) / 1000).toFixed(1)} s)`);
    const rs = await restart(place);
    expect(rs.ok && (await site("foodbank.localhost", "GET", "/sign-in")).status === 200, `restart brings it back: ${rs.summary}`);

    say("\n== 12. Where the keys are, and where they are not");
    const modes = inApp("foodbank", "stat -c '%a %U' app.env backup.env; grep -c PROOF_API_KEY app.env; grep -c BACKUP_S3_SECRET app.env; grep -c BACKUP_S3_SECRET backup.env").out.trim();
    expect(modes === "600 deploy\n600 deploy\n1\n0\n1", `on the server they are in files only their owner reads: the app's in app.env, the storage's in backup.env alone (${modes.replace(/\n/g, " | ")})`);
    // Every layer of every image, unpacked: the patterns come in on standard input.
    const layers = onServer(
      `cat > /root/patterns; total=0; images=0
for img in $(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep '^hydor-'); do
  images=$((images+1)); d=$(mktemp -d); docker save "$img" | tar -x -C "$d"
  for f in $(find "$d" -type f); do total=$((total+1)); if zcat -f "$f" | grep -a -q -F -f /root/patterns; then echo "HIT $img"; fi; done
  if docker history --no-trunc "$img" | grep -q -F -f /root/patterns; then echo "HIT history $img"; fi
  rm -rf "$d"
done
echo "images=$images files=$total"; rm -f /root/patterns`,
      `${API_KEY}\n${S3_SECRET}\n`,
    ).out;
    expect(!/HIT/.test(layers) && /images=[1-9]\d* files=[1-9]/.test(layers), `no key is in any layer or in the history of any image (${layers.trim().split("\n").pop()})`);
    const files = onServer("cat > /root/patterns; grep -r -l -F -f /root/patterns ~deploy/hydor-apps; rm -f /root/patterns", `${API_KEY}\n${S3_SECRET}\n`).out.trim().split("\n").map((f) => f.replace(/^.*\/hydor-apps\//, "")).sort();
    const only = files.join() === "foodbank/app.env,foodbank/backup.env";
    expect(only, `on the server's disk they are in those two files and nowhere else (sources, compose files, records and the rest)${only ? "" : `: found in ${files.join(", ")}`}`);
    const sentTars = fs.readdirSync(root).filter((f) => f.endsWith(".tar.gz"));
    const inSent = sentTars.filter((f) => {
      const dir = fs.mkdtempSync(path.join(root, "untar-"));
      execFileSync("tar", ["-xzf", path.join(root, f), "-C", dir]);
      return spawnSync("grep", ["-r", "-q", "-F", "-e", API_KEY, "-e", S3_SECRET, dir]).status === 0;
    });
    expect(sentTars.length >= 3 && !inSent.length, `none is in any of the ${sentTars.length} sources sent`);
    expect(scriptsSent.length > 30 && !scriptsSent.some((s) => s.includes(API_KEY) || s.includes(S3_SECRET)), `none is in any of the ${scriptsSent.length} scripts given to ssh (its command lines)`);
    expect(commandLines.length > 3 && commandLines.some((l) => l.includes("ssh ")) && !commandLines.join().includes(API_KEY) && !commandLines.join().includes(S3_SECRET), "nor in this computer's process list, watched through the second launch");
    // The server's raw output holds the app's log, and that holds the one line this proof wrote into it (masked before anyone sees it).
    const shown: Record<string, string> = {
      "an outcome, record or status": JSON.stringify([first, second, broken, rb, fwd, hist, st]),
      "what this proof printed": said.join("\n"),
      "the masked log": logLines.join("\n"),
      "what the server printed back": printed.join("\n").split(`debug key=${API_KEY} end`).join(""),
      "the backup service's log": (await logs(place, { service: "backup", since: "1h" })).join("\n"),
      "Caddy's log": (await logs(place, { service: "caddy", since: "1h" })).join("\n"),
    };
    const holding = Object.entries(shown).filter(([, text]) => text.includes(API_KEY) || text.includes(S3_SECRET)).map(([name]) => name);
    expect(!holding.length, `nor in any outcome, record, step, log or line the server printed back${holding.length ? `: found in ${holding.join(", ")}` : " (but for the line the proof wrote into the app's own log)"}`);
    expect(spawnSync("grep", ["-r", "-q", "-F", "-e", API_KEY, "-e", S3_SECRET, hostsDir, food]).status === 1, "nor in the hosts folder or the app's folder");

    say("\n== 13. The second app: crews (Express, installed by its build line, in the image Hydor writes)");
    onServer("docker rm -f s3");
    const down = await takeDown(place);
    say(`        => ${down.summary}`);
    const crews = path.join(root, "crews");
    copyApp(CREWS, crews);
    const crewsValue = { name: "Kestrel Crews", build: "npm ci --omit=dev", start: "node --disable-warning=ExperimentalWarning server.js", env: { port: "PORT", data: "DATA_DIR", url: "APP_URL" }, ready: "/sign-in", signIn: "own", database: { file: "kestrel.db", sqlite: true } };
    let crewsContract = writeContract(crews, crewsValue);
    const crewsPlace: Place = { hostsDir, host: "stand", app: "crews", connect: recording };
    const crewsOptions = (): LaunchOptions => ({ ...crewsPlace, dir: crews, contract: crewsContract, address: `https://crews.localhost:${httpsPort}`, check: checkOf(crews) });
    const c1 = await run("crews, first launch", crewsOptions());
    expect(c1.ok, "the second app launches to the same server once the first is taken down");
    CA = inApp("crews", "docker compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt").out;
    const lead = await site("crews.localhost", "POST", "/api/sign-up", { json: { name: "Lee Proof", email: "lee.proof@example.com", password: "correct-horse-battery" } });
    const leadCookie = cookieOf(lead);
    const crew = JSON.parse((await site("crews.localhost", "POST", "/api/crews", { cookie: leadCookie, json: { name: "North" } })).body) as { id: number };
    const customer = await site("crews.localhost", "POST", "/api/customers", { cookie: leadCookie, json: { crew: crew.id, name: "Mrs Proof" } });
    const customers = async () => (JSON.parse((await site("crews.localhost", "GET", "/api/customers", { cookie: leadCookie })).body) as { rows: { name: string }[] }).rows.map((r) => r.name);
    expect(lead.status === 201 && customer.status === 201 && (await customers()).join() === "Mrs Proof", "an account, a crew and a customer are made over https");
    expect(inApp("crews", "docker compose exec -T app sh -c 'ls node_modules/express/package.json'").code === 0, "express was installed on the server by the build line");

    say("\n== 14. An app with no SQLite file named: stopped while it is copied, and its daily copy by the server's cron");
    // The same app, its database not said to be SQLite, to try the other way of backing up.
    crewsContract = writeContract(crews, { ...crewsValue, database: { file: "kestrel.db", sqlite: false } });
    const c2 = await run("crews, copied stopped", crewsOptions());
    expect(c2.ok && /with the app stopped/.test(c2.steps.find((s) => s.id === "backup")!.say!) && c2.notes.some((n) => /stopped while its data folder is copied/.test(n)), "it launches, and says that the app is stopped for the copy");
    const c3 = await run("crews, again", crewsOptions());
    expect(c3.ok && /with the app stopped for the copy/.test(c3.steps.find((s) => s.id === "snapshot")!.say!), "the next launch takes its snapshot with the app stopped");
    expect((await customers()).join() === "Mrs Proof", "the data is intact");
    const cron = onServer("crontab -u deploy -l").out;
    expect(/hydor-apps\/crews\/backup\.sh .*# hydor:crews/.test(cron), `the server's crontab has its daily copy (${cron.trim().split("\n").pop()?.split(" /")[0]})`);
    const byCron = onServer("su - deploy -c '$HOME/hydor-apps/crews/backup.sh'");
    const listed = await backups.list(crewsPlace);
    expect(byCron.code === 0 && listed.backups.some((b) => b.label === "scheduled" && b.stopped), `run as cron runs it, it makes ${listed.backups.find((b) => b.label === "scheduled")?.id} with the app stopped and started again`);
    await sleep(1500);
    expect((await site("crews.localhost", "GET", "/api/customers", { cookie: leadCookie })).status === 200, "and the app answers again");
    const byHand = await backups.now(crewsPlace);
    expect(byHand.verified, `backup now: ${byHand.summary}`);
    await site("crews.localhost", "POST", "/api/customers", { cookie: leadCookie, json: { crew: crew.id, name: "After the copy" } });
    await backups.restore(crewsPlace, byHand.backup.id, { yes: true });
    expect((await customers()).join() === "Mrs Proof", "its folder is put back from that copy");
    const crewStatus = await status(crewsPlace);
    expect(crewStatus.up === true && !crewStatus.problems.length, `status: ${crewStatus.say}`);
    say(`        => ${(await takeDown(crewsPlace)).summary}`);
    expect(!/hydor:crews/.test(onServer("crontab -u deploy -l").out) && onServer("docker ps -q").out.trim() === "", "taken down: no container and no cron line left");
  } catch (error) {
    // Counted, so that the end says how far it got.
    expect(false, `the proof stopped: ${(error as Error).message}`);
  } finally {
    say("\n== Clean-up");
    if (process.env.KEEP) say(`  KEEP is set: ${NAMES.server}, ${NAMES.docker}, ${NAMES.containerd}, ${NAMES.image} and ${root} are left`);
    else {
      const removed: string[] = [];
      if (docker("rm", "-f", NAMES.server).code === 0) removed.push(`container ${NAMES.server}`);
      for (const v of [NAMES.docker, NAMES.containerd]) if (docker("volume", "rm", v).code === 0) removed.push(`volume ${v}`);
      if (docker("image", "rm", NAMES.image).code === 0) removed.push(`image ${NAMES.image}`);
      if (!imagesBefore.has("ubuntu:24.04") && docker("image", "rm", "ubuntu:24.04").code === 0) removed.push("image ubuntu:24.04 (pulled for the stand-in)");
      fs.rmSync(root, { recursive: true, force: true });
      removed.push("the scratch folder");
      say(`  removed: ${removed.join("; ")}`);
    }
  }
  say(`\n${checks - failures.length} of ${checks} checks held, in ${Math.round((Date.now() - started) / 1000)} seconds${failures.length ? `; ${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}` : "."}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
