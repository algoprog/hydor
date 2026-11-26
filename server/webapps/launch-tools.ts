// The agents' tools for the Launch and Run stages, beside the webapp_* ones: webapp_places, webapp_host, webapp_launch, webapp_status and
// webapp_backup. Each describes first and asks the person on a card before it changes anything (a launch, a host's key to accept,
// putting a backup back, going back to the launch before and taking an app off a server always ask: they are outward-facing or hard to undo, and "Full access"
// does not answer for the person). They go through the app's own routes, so what an agent does is what the pages do. Values of keys
// never pass through them: a key is named, the app's own, and asked for on the keys card (key-tools.ts).
import type { LaunchHost, LaunchJob, LaunchKey, LaunchRecord, LaunchStep, RunBackup, RunStatus, WebAppDetail, WebAppKeys, WebAppLaunchView, WeeklyCheck } from "../../shared/webapps.ts";
import { count } from "../../shared/webapps.ts";
import { stillMissing } from "../../shared/keys.ts";
import type { RunCtx, RunTool, ToolOutput } from "../features/types.ts";
import { confirmChange } from "../guide/api.ts";
import { askForKeys } from "./key-tools.ts";
import { PLAIN_CARDS, type CardWords } from "./plain-cards.ts";
import { technicalFor } from "./simple.ts";

type Json = Record<string, any>;

export const LAUNCH_TOOL_NAMES = ["webapp_places", "webapp_host", "webapp_launch", "webapp_status", "webapp_backup"];

/** What the agents are told of Launch and Run (appended to the web apps note). */
export const LAUNCH_NOTE =
  "Launching: webapp_places shows where an app can go (inside this Hydor, or a server of the person's own, added with webapp_host) and where it is now; webapp_launch launches (after the person's yes on a card), shows the history, goes back to the launch before and takes it off a server, webapp_status says whether it is up and reads its log, webapp_backup lists, makes and puts back backups. An app with signIn hydor cannot go to a server. A key the app needs is named, never seen: webapp_keys asks the person for what is missing on a card (webapp_launch does that itself before its own card). The method is in the web-app-builder skill.";

interface Helpers {
  api: <T = Json>(ctx: RunCtx, method: string, url: string, body?: Json) => Promise<T>;
  findApp: (ctx: RunCtx, ref: unknown) => Promise<WebAppDetail>;
  text: (t: string, isError?: boolean) => ToolOutput;
  marker: (a: { id: string }) => string;
  pageOf: (ctx: RunCtx, a: { id: string }, tab?: string) => string;
}

const when = (t: number) => (t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "?");
const mark = (s: LaunchStep) => ({ passed: "done", failed: "FAILED", running: "running", skipped: "skipped", waiting: "waiting" })[s.state];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function stepsText(j: LaunchJob): string {
  return j.steps.map((s) => `- ${s.title}: ${mark(s)}${s.say ? ` — ${s.say}` : ""}${s.ms ? ` (${Math.max(1, Math.round(s.ms / 1000))} s)` : ""}`).join("\n");
}

export function jobText(j: LaunchJob): string {
  const head = j.state === "running" ? "Still going." : j.state === "asking" ? "Waiting for the person's answer." : j.state === "done" ? "Done." : "It did NOT finish.";
  return [
    head,
    stepsText(j),
    j.summary ? `\n${j.summary}` : "",
    j.problems?.length ? `\nWhat went wrong: ${j.problems.join(" ")}` : "",
    j.notes?.length ? `\nAlso: ${j.notes.join(" ")}` : "",
    j.previousBack ? "\nThe version before came back by itself." : "",
    j.needsData ? "\nTo go back all the same, call back again with restore: true (the person is asked, as what was written since is lost)." : "",
    typeof j.downtimeSeconds === "number" ? `\nPeople reached nothing for ${count(j.downtimeSeconds, "second")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const keyWords: Record<string, string> = { vault: "saved for it", server: "held by the server", made: "made by the server", missing: "MISSING: ask with webapp_keys" };

const recordText = (r: LaunchRecord) => `- ${when(r.at)}: ${r.result}${r.version ? `, version ${r.version}` : ""}${r.commit ? `, commit ${r.commit.slice(0, 8)}` : ""}${r.by ? `, by ${r.by}` : ""}${r.address ? `, ${r.address}` : ""}${r.ms ? `, ${Math.round(r.ms / 1000)} s` : ""}${r.overrides.length ? `, let through: ${r.overrides.join(", ")}` : ""}${typeof r.downtimeSeconds === "number" ? `, down ${r.downtimeSeconds} s` : ""}`;

export function statusText(s: RunStatus): string {
  return [
    `${s.kind === "hydor" ? "Inside this Hydor" : `On the server (${s.place})`}: ${s.up === true ? "UP" : s.up === false ? "DOWN" : "not known"}. ${s.say}`,
    s.version ? `Version ${s.version}${s.since ? `, since ${when(s.since)}` : ""}.` : "",
    s.address ? `Address ${s.address}.` : "",
    s.lastLaunch ? `Last launch ${when(s.lastLaunch.at)}: ${s.lastLaunch.result}.` : "",
    s.lastBackup ? `Last backup ${s.lastBackup.id}, ${s.lastBackup.ageHours < 48 ? count(Math.round(s.lastBackup.ageHours), "hour") : count(Math.round(s.lastBackup.ageHours / 24), "day")} old.` : "No backup yet.",
    s.disk ? `Disk: ${s.disk.say}.` : "",
    typeof s.errors === "number" ? `${count(s.errors, "error")} and ${s.requests === undefined ? "? requests" : count(s.requests, "request")} in its log.` : "",
    s.problem ? `Problem: ${s.problem}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function weeklyText(w: WeeklyCheck | null): string {
  if (!w) return "The weekly check has not run yet.";
  return `Weekly check, ${when(w.at)}: ${w.needs.length ? `NEEDS YOU: ${w.needs.map((n) => n.say).join(" ")}` : "nothing needs you."} Looked at: ${w.looked.join("; ") || "nothing"}.`;
}

export function launchTools(ctx: RunCtx, h: Helpers): RunTool[] {
  const { api, findApp, text, marker } = h;
  const APP = { type: "string", description: "The web app (its id, address or name); left out: the one in this folder, or the only one." };
  const PLACE = { type: "string", description: "hydor (the launched version inside this Hydor), or the name of a place on a server (production)." };
  const id = (a: { id: string }) => encodeURIComponent(a.id);
  /** A card as it is, or in plain words when the person has Technical details off. */
  const card = <C extends Parameters<typeof confirmChange>[1]>(technical: C, plain: () => CardWords): C => (technicalFor(ctx.deps, ctx.key) ? technical : { ...technical, ...plain() });

  /** Follows a job of the launch routes, putting the person's questions on cards, until it ends or the time is up. */
  async function follow(app: WebAppDetail, j0: LaunchJob, waitMs: number): Promise<string> {
    const end = Date.now() + waitMs;
    let job = j0;
    for (;;) {
      if (job.state === "asking" && job.ask?.kind === "override") {
        const lines = job.ask.stops.map((s) => `• ${s.title} (${s.id}${s.group ? `, ${s.group}` : ""}): ${s.text}${s.details?.length ? ` [${s.details.join("; ")}]` : ""}${s.hint ? ` To do: ${s.hint}` : ""}`).join("\n");
        const stopped = job.ask.stops.map((s) => s.id);
        const no = await confirmChange(ctx, card({
          title: `Let ${job.ask.stops.length === 1 ? "a failed line" : `${job.ask.stops.length} failed lines`} of the check through?`,
          detail: `The check of ${app.name} found ${job.ask.stops.length === 1 ? "a line that failed" : "lines that failed"}, which stop a launch:\n\n${lines}\n\nFixing it is better. If you let ${job.ask.stops.length === 1 ? "it" : "them"} through, the launch goes on and it is written down in the launch record, with your name.`,
          level: "ask",
          label: "Let through and go on",
        }, () => PLAIN_CARDS.failedChecks(app.name, stopped)));
        const done = await api<{ job: LaunchJob }>(ctx, "POST", `/api/webapps/${id(app)}/launch/answer`, no ? { cancel: true } : { override: job.ask.stops.map((s) => s.id) });
        job = done.job;
        if (no) return `${jobText(job)}\n${no}`;
      }
      if ((job.state !== "running" && job.state !== "asking") || Date.now() >= end || ctx.signal?.aborted) break;
      await sleep(1500);
      job = (await api<{ job: LaunchJob | null }>(ctx, "GET", `/api/webapps/${id(app)}/launch/job`)).job ?? job;
    }
    return jobText(job);
  }
  const seconds = (v: unknown, d: number, max: number) => Math.round(Math.max(1, Math.min(max, Number.isFinite(Number(v)) && v !== undefined ? Number(v) : d)) * 1000);

  return [
    {
      name: "webapp_places",
      description:
        "Shows where a web app can be launched and where it is launched now: the places card (inside this Hydor, or a server of the person's own), each with what it means, what it costs the person in effort and each month, the hosts, what runs on servers with its keys, and the launch history. Read only.",
      inputSchema: { type: "object", properties: { app: APP } },
      annotations: { readOnlyHint: true },
      async run(a) {
        try {
          const app = await findApp(ctx, a.app);
          const v = await api<WebAppLaunchView>(ctx, "GET", `/api/webapps/${id(app)}/launch`);
          const lines: string[] = [`Places for ${app.name}:`];
          for (const p of v.places) lines.push(`- ${p.title} [${p.state === "ready" ? "Hydor does it" : `not for this app: ${p.unavailable}`}]: ${p.line} Effort: ${p.effort} Cost: ${p.cost}${p.launched ? ` LAUNCHED here: ${when(p.launched.at)}${p.launched.version ? `, version ${p.launched.version}` : ""}${p.launched.address ? `, ${p.launched.address}` : ""}.` : ""}${(p.offers ?? []).map((o) => `\n    ${o.name}${o.recommended ? " (recommended)" : ""}: ${o.why} ${o.price ? `${o.price} (read ${o.readOn})` : `check the current price: ${o.page}`}.${o.catch ? ` Catch: ${o.catch}` : ""}`).join("")}${(p.notOffered ?? []).map((x) => `\n    Not offered for now: ${x.name}, ${x.why} (${x.url})`).join("")}`);
          if (v.hydor.launched) lines.push(`\nInside Hydor: the launched version is commit ${v.hydor.launched.commit.slice(0, 8)} (${when(v.hydor.launched.at)}); the version being changed is ${v.hydor.ahead ? `${v.hydor.ahead} step${v.hydor.ahead === 1 ? "" : "s"} ahead (launch again to put it live)` : "the same"}${v.hydor.unsaved ? "; some changes are not saved as a step yet (a launch saves them first)" : ""}. ${v.hydor.previous ? "There is a launch before it to go back to." : "There is no launch before it."}`);
          if (v.hosts.length) lines.push(`\nHosts: ${v.hosts.map((x: LaunchHost) => `${x.name} (${x.ssh}, ${x.state === "recorded" ? "recorded" : "waiting for its fingerprint to be accepted"})`).join("; ")}.`);
          for (const e of v.envs) lines.push(`On a server, ${e.env}: ${e.address} on ${e.host}, commit ${e.commit.slice(0, 8)}; keys ${e.keys.map((k) => `${k.name} [${keyWords[k.state]}]`).join(", ") || "none"}.`);
          if (v.serverBuild) lines.push(`To a server it is built so: ${v.serverBuild.say}`);
          if (v.history.length) lines.push(`\nHistory:\n${v.history.slice(0, 8).map(recordText).join("\n")}`);
          if (v.job) lines.push(`\nThe latest launch job (${v.job.state}):\n${jobText(v.job)}`);
          if (v.blocked) lines.push(`\nBlocked: ${v.blocked}`);
          return text(`${lines.join("\n")}\n${marker(app)}`);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_host",
      description:
        "A server of the person's own, for launching. Actions: list; add (name, ssh as user@address[:port]: Hydor makes an ed25519 key pair for it in its own folder, never the person's ~/.ssh, and gives the public key with the one line to put on the server, in ~/.ssh/authorized_keys or the provider's SSH keys box; asks first); connect (reads the fingerprints the machine offers, records nothing); accept (name, fingerprint: records the host with a fingerprint the PERSON compared with their provider's or the machine's own: asks on a card that says where to compare, and is asked every time); check (what is on the machine, in plain lines: Docker, memory, disk, ports 80 and 443); prepare (check with --prepare: installs Docker and a firewall on Debian or Ubuntu: asks first, saying what it will install); remove (asks first). Never ask the person to paste a private key or a password into a conversation.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "add", "connect", "accept", "check", "prepare", "remove"] },
          name: { type: "string", description: "The host's name (lower case, like my-server)." },
          ssh: { type: "string", description: "add: user@address or user@address:port." },
          fingerprint: { type: "string", description: "accept: the SHA256:… fingerprint the person compared." },
        },
        required: ["action"],
      },
      async run(a) {
        try {
          const action = String(a.action ?? "list");
          const name = String(a.name ?? "");
          if (action === "list") {
            const r = await api<{ hosts: LaunchHost[] }>(ctx, "GET", "/api/webapps/hosts");
            return text(r.hosts.length ? r.hosts.map((x) => `- ${x.name}: ${x.ssh}, ${x.state === "recorded" ? `recorded (${x.fingerprint})` : "key made, not yet recorded"}${x.checked ? `; checked ${when(x.checked.at)}: ${x.checked.ok ? "ready" : "not ready"}` : ""}${x.state === "made" && x.authorizedLine ? `\n  Put this line on the server (in ~/.ssh/authorized_keys): ${x.authorizedLine}` : ""}`).join("\n") : "No hosts yet. webapp_host add makes one.");
          }
          if (action === "add") {
            const no = await confirmChange(ctx, card({ title: `Add the server ${name}?`, detail: `Hydor makes a key pair of its own for ${a.ssh} and keeps it in its own folder (never your ~/.ssh). Nothing is sent to the server yet. You then put the public key on the server, and compare the machine's fingerprint yourself before it is recorded.`, level: "always", label: "Make the key" }, () => PLAIN_CARDS.addServer()));
            if (no) return text(no, true);
            const r = await api<{ host: LaunchHost }>(ctx, "POST", "/api/webapps/hosts", { name, ssh: a.ssh });
            return text(`Host ${r.host.name} (${r.host.ssh}) is made. Tell the person to put this one line on the server, in ~/.ssh/authorized_keys of ${r.host.user ?? "that user"} (or in the provider's SSH keys box):\n${r.host.authorizedLine}\nThen webapp_host connect shows the fingerprints the machine offers, for the person to compare.`);
          }
          if (action === "connect") {
            const r = await api<{ offered: { type: string; fingerprint: string }[]; where: string; problem?: string }>(ctx, "POST", `/api/webapps/hosts/${encodeURIComponent(name)}/connect`, {});
            return text(r.offered.length ? `The machine offers:\n${r.offered.map((o) => `- ${o.type}: ${o.fingerprint}`).join("\n")}\n${r.where}\nNothing is recorded until the person accepts one (webapp_host accept, on a card).` : `The machine did not answer with a key: ${r.problem}`, !r.offered.length);
          }
          if (action === "accept") {
            const no = await confirmChange(ctx, card({ title: `Is this the fingerprint of ${name}?`, detail: `Fingerprint ${a.fingerprint}.\n\nCompare it with the one your provider shows for the server (its dashboard or console), or on the machine itself: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub. If they differ, do not accept: you are not reaching the machine you mean. Once recorded, a machine that shows another key is refused and nothing is sent to it.`, level: "ask", label: "They are the same" }, () => PLAIN_CARDS.acceptServer(String(a.fingerprint ?? ""))));
            if (no) return text(no, true);
            const r = await api<{ host: LaunchHost }>(ctx, "POST", `/api/webapps/hosts/${encodeURIComponent(name)}/accept`, { fingerprint: a.fingerprint });
            return text(`Host ${r.host.name} is recorded with the fingerprint ${r.host.fingerprint ?? a.fingerprint}. webapp_host check says what is on it.`);
          }
          if (action === "check" || action === "prepare") {
            if (action === "prepare") {
              const no = await confirmChange(ctx, card({ title: `Prepare the server ${name}?`, detail: "On Debian or Ubuntu, as root or with sudo without a password, this installs Docker and Compose from Docker's own apt repository, adds the login user to the docker group, and sets a firewall with ufw that lets in SSH, ports 80 and 443 and nothing else. It does nothing else, and nothing without this yes.", level: "ask", label: "Prepare it" }, () => PLAIN_CARDS.setUpServer()));
              if (no) return text(no, true);
            }
            const r = await api<{ ok: boolean; looked: { what: string; ok: boolean | null; say: string }[]; steps: string[]; summary: string }>(ctx, "POST", `/api/webapps/hosts/${encodeURIComponent(name)}/check`, { prepare: action === "prepare" });
            return text(`${r.summary}\n${r.looked.map((l) => `- ${l.ok === true ? "ok" : l.ok === false ? "MISSING" : "note"}: ${l.say}`).join("\n")}${r.steps.length ? `\nTo do:\n${r.steps.map((s) => `- ${s}`).join("\n")}` : ""}`, !r.ok);
          }
          if (action === "remove") {
            const no = await confirmChange(ctx, card({ title: `Remove the host ${name}?`, detail: "Hydor forgets the host, the key pair it made for it and what it deployed there. The server itself is not touched, and apps launched to it keep running there.", level: "confirm", danger: true, label: "Remove" }, () => PLAIN_CARDS.forgetServer()));
            if (no) return text(no, true);
            await api(ctx, "DELETE", `/api/webapps/hosts/${encodeURIComponent(name)}`);
            return text(`Host ${name} is removed.`);
          }
          return text("action is list, add, connect, accept, check, prepare or remove.", true);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_launch",
      description:
        "Launches a web app, shows its launch history, goes back to the launch before, or takes it off a server. Actions: launch (the committed version, built and checked first, with data of its own; the version being changed stays until the next launch; a failed line of the check stops it and the person may let one through on a card, which is recorded; missing keys put up the keys card first: call again once the message says they are saved); history; back (the launch before; restore true also puts the data back from before the launch being undone, which asks saying what is lost); takedown (server: stops it and takes its containers away; data, keys and backups stay there). place hydor (default) or server (host from webapp_host, address https://…; not for an app with signIn hydor). It asks the person before anything changes, waits up to `wait` seconds and gives the steps.",
      inputSchema: {
        type: "object",
        properties: {
          app: APP,
          action: { type: "string", enum: ["launch", "history", "back", "takedown"] },
          place: { type: "string", enum: ["hydor", "server"] },
          host: { type: "string", description: "server: the host's name." },
          env: { type: "string", description: "server: the place's name (default production)." },
          address: { type: "string", description: "server: https://the-name that points at the machine." },
          restore: { type: "boolean", description: "back: also put the data back from before the launch being undone (what was written since is lost)." },
          wait: { type: "number", description: "Seconds to wait (default 600, at most 1800)." },
        },
        required: ["action"],
      },
      async run(a) {
        try {
          const app = await findApp(ctx, a.app);
          const base = `/api/webapps/${id(app)}`;
          const action = String(a.action);
          const place = String(a.place ?? "hydor");
          const env = String(a.env ?? "production");
          if (action === "takedown") {
            const no = await confirmChange(ctx, card({ title: `Take ${app.name} (${env}) off its server?`, detail: "The app stops there and its containers go: nobody is answered at its address any more. Its data, keys and backups stay on the server, and launching it again finds them.", level: "ask", danger: true, label: "Take it off" }, () => PLAIN_CARDS.takeOff(app.name)));
            if (no) return text(no, true);
            const r = await api<{ summary: string }>(ctx, "POST", `${base}/launch/takedown`, { env });
            return text(`${r.summary}\n${marker(app)}`);
          }
          if (action === "history") {
            const r = await api<{ history: LaunchRecord[] }>(ctx, "GET", `${base}/launch/history${place === "server" ? `?env=${encodeURIComponent(env)}` : ""}`);
            return text(`${r.history.length ? r.history.slice(0, 15).map(recordText).join("\n") : "Nothing has been launched there yet."}\n${marker(app)}`);
          }
          if (action === "back") {
            const server = place === "server";
            let restore = a.restore === true;
            if (!server) {
              const plan = await api<{ ok: boolean; refuse?: string }>(ctx, "GET", `${base}/launch/back`);
              if (!plan.ok) return text(plan.refuse ?? "It cannot go back.", true);
              if (restore) {
                const no = await confirmChange(ctx, card({ title: "Go back and put the data back too?", detail: "The data goes back to the backup taken just before the launch being undone. Whatever people wrote since then is lost. A backup of the data as it is now is made first.", level: "ask", danger: true, label: "Go back and put the data back" }, () => PLAIN_CARDS.goBackData()));
                if (no) return text(no, true);
              }
            }
            if (!restore || server) {
              const no = await confirmChange(ctx, card({ title: "Go back to the launch before?", detail: server ? "The version before is put back on the server. People reach nothing for a few seconds." : "The launch before is started again on the same data. Going back again goes forward.", level: "ask", label: "Go back" }, () => PLAIN_CARDS.goBack()));
              if (no) return text(no, true);
            }
            if (server && restore) {
              const no = await confirmChange(ctx, card({ title: "Also put the database back?", detail: "The database goes back as it was before the launch being undone. Whatever was written since is lost (a backup of it is made first).", level: "ask", danger: true, label: "Put it back" }, () => PLAIN_CARDS.alsoData()));
              if (no) return text(no, true);
            }
            const r = await api<{ job: LaunchJob }>(ctx, "POST", `${base}/launch/back`, { place, ...(server ? { env } : {}), restoreDatabase: restore });
            return text(`${await follow(app, r.job, seconds(a.wait, 600, 1800))}\n${marker(app)}`);
          }
          if (action !== "launch") return text("action is launch, history, back or takedown.", true);
          const v = await api<WebAppLaunchView>(ctx, "GET", `${base}/launch`);
          // Before the launch's own card: one keys card for everything the environment still lacks.
          const keysFirst = async (env: string) => {
            const k = await api<WebAppKeys>(ctx, "GET", `${base}/keys?env=${encodeURIComponent(env)}`).catch(() => null);
            if (!k?.keys.some(stillMissing)) return null;
            const asked = await askForKeys({ api, findApp, text, marker }, ctx, app, { env });
            return asked ? text(`Before the launch, ${app.name} lacks keys for ${env}. ${asked.say}\nCall webapp_launch again once the message says they are saved.\n${marker(app)}`) : null;
          };
          if (place === "hydor") {
            const card = await keysFirst("hydor");
            if (card) return card;
            const no = await confirmChange(ctx, {
              title: `${v.hydor.launched ? "Launch again" : "Launch"} ${app.name} inside this Hydor?`,
              detail: !technicalFor(ctx.deps, ctx.key) ? `It becomes the version you use, here on this computer, with its own saved information; only you can open it. The app’s own checks run first. What you keep changing stays apart until you put it online again.` : `What will be launched: the committed version${v.hydor.unsaved ? " (what is not saved yet is saved as a step first)" : ""}, built on its own, with a data folder of its own${v.hydor.launched ? " (the data of the launched version stays)" : " (it starts empty)"}. The check runs first; a failed line stops it. You open it at ${app.slug}.localhost; inside Hydor only you are signed in to it.\n\nThe version being changed (Preview) keeps its own data and does not change what people use.${v.hydor.launched ? " The version running now is kept to go back to." : ""}`,
              level: "ask",
              label: "Launch",
            });
            if (no) return text(no, true);
            const r = await api<{ job: LaunchJob }>(ctx, "POST", `${base}/launch/hydor`, {});
            return text(`${await follow(app, r.job, seconds(a.wait, 600, 1800))}\n${marker(app)}`);
          }
          const host = String(a.host ?? "");
          const blocked = v.places.find((p) => p.id === "server")?.unavailable ?? v.blocked ?? (v.serverBuild && !v.serverBuild.ok ? v.serverBuild.say : null);
          if (blocked) return text(blocked, true);
          if (!v.hosts.some((x) => x.name === host && x.state === "recorded")) return text(`Give a server that is recorded (host): ${v.hosts.filter((x) => x.state === "recorded").map((x) => x.name).join(", ") || "none yet (webapp_host add, connect, accept)"}.`, true);
          if (!a.address) return text("Give the address people will use, as https://the-name that points at the server.", true);
          const keys = async () => (await api<{ keys: LaunchKey[] }>(ctx, "GET", `${base}/launch/keys?env=${encodeURIComponent(env)}&host=${encodeURIComponent(host)}`)).keys;
          let list = await keys();
          if (list.some((k) => k.state === "missing")) {
            const asked = await askForKeys({ api, findApp, text, marker }, ctx, app, { env });
            if (asked) return text(`Before the launch, ${app.name} lacks keys for ${env} on a server. ${asked.say}\nCall webapp_launch again once the message says they are saved.\n${marker(app)}`);
            list = await keys();
          }
          const named = (state: LaunchKey["state"]) => list.filter((k) => k.state === state).map((k) => k.name).join(", ");
          const no = await confirmChange(ctx, {
            title: `Launch ${app.name} to ${a.address}?`,
            detail: !technicalFor(ctx.deps, ctx.key) ? `It goes on the internet at ${a.address}, on your server. The keys it needs go with it, and nowhere else. The app’s own checks run first, and if anything goes wrong the version before stays.` : [
              `This is outward-facing.\nAddress: ${a.address}\nServer: ${host}\nPlace: ${env}`,
              "",
              `What is sent: the committed version${v.hydor.unsaved ? " (what is not saved yet is saved as a step first)" : ""} over SSH, without dependencies, builds, data, .env files or databases. ${v.serverBuild?.say ?? ""}`,
              `Keys sent to the server, saved for ${env}: ${named("vault") || "none"}.${named("server") ? ` The server holds ${named("server")} already.` : ""}${named("made") ? ` It makes ${named("made")} itself.` : ""}`,
              "It is checked first, then built on the server beside the version running and switched to. People reach nothing for a few seconds; if it fails after the switch, the version before is put back by itself.",
            ].join("\n"),
            level: "ask",
            label: "Launch",
          });
          if (no) return text(no, true);
          const r = await api<{ job: LaunchJob }>(ctx, "POST", `${base}/launch/server`, { host, env, address: a.address });
          return text(`${await follow(app, r.job, seconds(a.wait, 1200, 3600))}\n${marker(app)}`);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_status",
      description:
        "Is a launched web app up, and what its log says. what status (default): up or down, version, since when, the last launch, the last backup and its age, disk left, errors and requests in its log lately, and what the weekly check found; what logs: the app's own lines, newest last (errors first with errors true), never a secret. place hydor (the launched version inside this Hydor) or the name of a place on a server. Read only.",
      inputSchema: {
        type: "object",
        properties: {
          app: APP,
          place: PLACE,
          what: { type: "string", enum: ["status", "logs"] },
          errors: { type: "boolean", description: "logs: errors and warnings first." },
          since: { type: "string", description: "logs on a server: 30m, 6h, 2d (default 1h)." },
          tail: { type: "number", description: "logs: at most this many lines (default 60)." },
        },
      },
      annotations: { readOnlyHint: true },
      async run(a) {
        try {
          const app = await findApp(ctx, a.app);
          const base = `/api/webapps/${id(app)}`;
          let place = a.place ? String(a.place) : "";
          if (!place) {
            const run = await api<{ places: RunStatus[]; weekly: WeeklyCheck | null }>(ctx, "GET", `${base}/run`);
            if (!run.places.length) return text(`${app.name} is not launched anywhere yet.\n${marker(app)}`);
            if (a.what !== "logs") return text(`${run.places.map(statusText).join("\n")}\n${weeklyText(run.weekly)}\n${marker(app)}`);
            place = run.places[0].place;
          }
          if (a.what === "logs") {
            const q = new URLSearchParams({ tail: String(Math.max(1, Math.min(400, Number(a.tail) || 60))), ...(a.errors ? { errors: "1" } : {}), ...(a.since ? { since: String(a.since) } : {}) });
            const r = await api<{ lines: string[] }>(ctx, "GET", `${base}/run/${encodeURIComponent(place)}/logs?${q}`);
            return text(`${r.lines.length ? r.lines.join("\n") : "The log is empty."}\n${marker(app)}`);
          }
          const r = await api<{ status: RunStatus }>(ctx, "GET", `${base}/run/${encodeURIComponent(place)}/status`);
          return text(`${statusText(r.status)}\n${marker(app)}`);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
    {
      name: "webapp_backup",
      description:
        "Backups of a launched web app. Actions: list (with the daily time and days kept); now (makes one and reads it back before it counts; asks first); restore (id: puts a backup back: the app STOPS for those seconds and what is there now is replaced by the backup, after a backup of it is made; always asks first, saying so); schedule (at as HH:MM in UTC, keepDays: the daily time and how long they are kept; asks first). A backup is SQLite's online backup of the database plus the rest of the data folder, with a manifest of the rows of each table.",
      inputSchema: {
        type: "object",
        properties: { app: APP, place: PLACE, action: { type: "string", enum: ["list", "now", "restore", "schedule"] }, id: { type: "string", description: "restore: the backup's id (20261124-193012-manual)." }, at: { type: "string" }, keepDays: { type: "number" } },
        required: ["action"],
      },
      async run(a) {
        try {
          const app = await findApp(ctx, a.app);
          const run = await api<{ places: RunStatus[] }>(ctx, "GET", `/api/webapps/${id(app)}/run`);
          const place = String(a.place ?? run.places[0]?.place ?? "");
          if (!place) return text(`${app.name} is not launched anywhere yet, so there is nothing to back up.`, true);
          const base = `/api/webapps/${id(app)}/run/${encodeURIComponent(place)}/backups`;
          const action = String(a.action);
          if (action === "list") {
            const r = await api<{ backups: RunBackup[]; schedule: { at: string; keepDays: number } | null }>(ctx, "GET", base);
            return text(`${r.backups.length ? r.backups.slice(0, 20).map((b) => `- ${b.id} (${when(b.at)}, ${Math.round(b.bytes / 1024)} kB, ${Object.entries(b.tables).filter(([k]) => !k.startsWith("__")).map(([k, n]) => `${k} ${n}`).slice(0, 6).join(", ")})`).join("\n") : "There are no backups yet."}\n${r.schedule ? `Daily at ${r.schedule.at} UTC, kept ${r.schedule.keepDays} days.` : ""}\n${marker(app)}`);
          }
          if (action === "now") {
            const no = await confirmChange(ctx, card({ title: `Back up ${app.name} now?`, detail: "Makes a backup of the launched app's data while it runs (SQLite's own online backup), restores it into a scratch folder and reads it back before it counts.", level: "confirm", label: "Back up" }, () => PLAIN_CARDS.copyNow(app.name)));
            if (no) return text(no, true);
            const r = await api<{ backup: RunBackup | null; summary: string }>(ctx, "POST", base, {});
            return text(`${r.backup ? `Backup ${r.backup.id} made and read back.` : r.summary}\n${marker(app)}`);
          }
          if (action === "restore") {
            const no = await confirmChange(ctx, card({ title: `Put the backup ${a.id} back?`, detail: `${app.name} STOPS for the seconds this takes. Everything it keeps now (its database and files) is replaced by what the backup holds; whatever people wrote since the backup is lost. A backup of the data as it is now is made first (label before-restore), so this can itself be undone.`, level: "ask", danger: true, label: "Stop it and put the backup back" }, () => PLAIN_CARDS.restoreCopy(app.name, String(a.id ?? ""))));
            if (no) return text(no, true);
            const r = await api<{ safety: string | null }>(ctx, "POST", `${base}/${encodeURIComponent(String(a.id ?? ""))}/restore`, {});
            return text(`The backup ${a.id} is back and the app is running again.${r.safety ? ` What was there is kept as ${r.safety}.` : ""}\n${marker(app)}`);
          }
          if (action === "schedule") {
            const no = await confirmChange(ctx, card({ title: "Change when backups are made?", detail: `Daily at ${a.at ?? "(unchanged)"} UTC, kept ${a.keepDays ?? "(unchanged)"} days. The newest three always stay.`, level: "confirm", label: "Change it" }, () => PLAIN_CARDS.copyTimes(a.at ? String(a.at) : undefined, Number(a.keepDays) || undefined)));
            if (no) return text(no, true);
            const r = await api<{ schedule: { at: string; keepDays: number } | null }>(ctx, "PUT", `${base}/schedule`, { at: a.at, keepDays: a.keepDays });
            return text(`Backups are daily at ${r.schedule?.at} UTC, kept ${r.schedule?.keepDays} days.\n${marker(app)}`);
          }
          return text("action is list, now, restore or schedule.", true);
        } catch (e) {
          return text((e as Error).message, true);
        }
      },
    },
  ];
}
