// The content security policy of Hydor's own pages (the web app's index.html and its assets), made in one place. What it lets a
// page frame or reach beyond itself: the preview port (Preview shows a dev server in a frame), the players of YouTube and Vimeo
// (videos in apps' answers and views), and web apps at the addresses of their own (an app's page shows it in a frame; frames.ts
// says which addresses, and nothing is allowed while web apps are off).
import { appFrameSources, type FrameOptions } from "./webapps/frames.ts";

export interface CspOptions {
  /** The preview port (0: previews are off). */
  previewPort: number;
  /** Where browsers reach the preview port when it is not this host on that port, or "". */
  previewOrigin: string;
  /** The apps' own server (web apps). */
  apps: FrameOptions;
}

export function buildCsp(o: CspOptions): string {
  const preview = o.previewPort ? ` http://*:${o.previewPort} https://*:${o.previewPort}` : "";
  const previewOrigin = o.previewOrigin ? ` ${o.previewOrigin}` : "";
  const apps = appFrameSources(o.apps)
    .map((s) => ` ${s}`)
    .join("");
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // The preview port (server/preview.ts): the Preview page checks the browser can reach it.
    `connect-src 'self' ws: wss:${preview}${previewOrigin}`,
    "media-src 'self' blob:",
    // The preview port too: the Preview page shows a dev server inside it.
    // …and the players of YouTube (its no-cookie address) and Vimeo, for videos in apps' answers and views, and web apps at their
    // own addresses (the Preview tab of an app's page).
    `frame-src 'self' blob: https://www.youtube-nocookie.com https://player.vimeo.com${apps}${preview}${previewOrigin}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}
