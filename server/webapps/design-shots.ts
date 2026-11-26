// The pictures of a design choice: an agent writes two or three directions as small static pages in the app's folder
// (`design/calm.html`), and Hydor takes a picture of each, on a computer and a phone, dark and light, for the choose card. The
// pages are served for the time of the pictures only, on this computer, under a path nobody can guess, and nothing outside the
// app's folder is served (no link leading out of it, no dot file).
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export type Shot = (url: string, o: { device: "phone" | "desktop"; scheme: "dark" | "light" }) => Promise<{ png: Buffer }>;

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
const MAX_FILE = 8 * 1024 * 1024;

/** The file of `folder` a page's path names, or null: inside the folder (links resolved), no dot file, a kind a page uses. */
export function pageFile(folder: string, rel: string): string | null {
  const parts = rel.split("/").filter(Boolean);
  if (!parts.length || rel.includes("\0") || rel.includes("\\") || parts.some((p) => p.startsWith(".")) || !TYPES[path.extname(rel).toLowerCase()]) return null;
  try {
    const root = fs.realpathSync(folder);
    const real = fs.realpathSync(path.join(root, ...parts));
    const st = fs.statSync(real);
    return real.startsWith(`${root}${path.sep}`) && st.isFile() && st.size <= MAX_FILE ? real : null;
  } catch {
    return null;
  }
}

export interface PagePictures {
  /** PNGs: dark and light, on a computer and on a phone. */
  dark: { desktop: Buffer; phone: Buffer };
  light: { desktop: Buffer; phone: Buffer };
}

/** A picture of each page (paths inside the folder, to HTML files). */
export async function shootPages(folder: string, pages: string[], shot: Shot): Promise<PagePictures[]> {
  const secret = crypto.randomBytes(12).toString("hex");
  const server = http.createServer((req, res) => {
    const url = (req.url ?? "").split("?")[0];
    let rel = "";
    try {
      rel = url.startsWith(`/${secret}/`) ? decodeURIComponent(url.slice(secret.length + 2)) : "";
    } catch {}
    const file = rel ? pageFile(folder, rel) : null;
    if (!file) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()], "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  try {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/${secret}/`;
    const out: PagePictures[] = [];
    for (const page of pages) {
      const url = base + page.split("/").filter(Boolean).map(encodeURIComponent).join("/");
      const one = async (scheme: "dark" | "light") => ({ desktop: (await shot(url, { device: "desktop", scheme })).png, phone: (await shot(url, { device: "phone", scheme })).png });
      out.push({ dark: await one("dark"), light: await one("light") });
    }
    return out;
  } finally {
    server.closeAllConnections();
    server.close();
  }
}
