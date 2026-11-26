// The addresses Hydor's own pages may show web apps in a frame (the Preview tab of an app's page): the content security
// policy's frame-src (server/index.ts makes the policy and adds these). Only what an app can be at, and nothing wider:
//   - `<slug>.localhost` on the apps' port, for Hydor opened on this computer (a hostname of its own for each app);
//   - `<slug>.<APPS_DOMAIN>` when that is set, with the scheme and port APPS_ORIGIN gives (else the apps' port, either scheme).
// The path way (one hostname, a tunnel) is not framed: its page runs in a sandbox, and the page says so and offers the app in a
// tab of its own. Web apps turned off (port 0) allow nothing.

/** The part of the apps' options the policy needs. */
export interface FrameOptions {
  port: number;
  origin: string;
  domain: string;
}

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** The frame-src sources for these options. */
export function appFrameSources(o: FrameOptions): string[] {
  if (!(o.port > 0)) return [];
  const out = [`http://*.localhost:${o.port}`, `https://*.localhost:${o.port}`];
  if (o.domain && DOMAIN.test(o.domain)) {
    let from: URL | null = null;
    try {
      if (o.origin) from = new URL(o.origin);
    } catch {}
    if (from && (from.protocol === "http:" || from.protocol === "https:"))
      out.push(`${from.protocol}//*.${o.domain}${from.port ? `:${from.port}` : ""}`);
    else out.push(`http://*.${o.domain}:${o.port}`, `https://*.${o.domain}:${o.port}`);
  }
  return out;
}
