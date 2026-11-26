// Pointing at a part of a running web app (its Preview, on the app's page and beside a conversation). The app's pages, inside the frame
// and only while pointing is on, tell Hydor's page what the person tapped (server/webapps/proxy.ts: the helper the proxy puts in); this is
// what the page makes of such a message, and the short reference it puts in the message box so "make this bigger" has something to point at.
// A message counts only when it came from the app's own frame (the caller checks the window) with the origin of the frame's address.

/** What was tapped. */
export interface Pointed {
  /** The page it is on: its path and query. */
  path: string;
  /** The words it shows (a button's label, a heading, a field's label), at most 120 characters. */
  text: string;
  /** What kind of thing it is, in a word a person uses. */
  kind: string;
  tag: string;
}

export type FrameMessage = { type: 'point'; pointed: Pointed } | { type: 'path'; path: string };

export const POINT_MESSAGE = 'hydor-webapp-point';
export const PATH_MESSAGE = 'hydor-webapp-path';
const KINDS = new Set(['button', 'link', 'field', 'heading', 'image', 'table', 'list item', 'list', 'form', 'menu', 'header', 'footer', 'label', 'section', 'text']);

const cleanPath = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && v.length <= 2000 && !/[\u0000-\u001f]/.test(v) ? v : null);
// eslint-disable-next-line no-control-regex
const words = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : '');

/** What a message from the frame says, when it is one of the two pointing sends and comes from the origin of the frame's own address. */
export function readFrameMessage(data: unknown, origin: string, frameUrl: string, sandboxed = false): FrameMessage | null {
  if (!frameUrl || !data || typeof data !== 'object') return null;
  let own: string;
  try {
    own = new URL(frameUrl).origin;
  } catch {
    return null;
  }
  // A frame on the path way (at Hydor's own address, sandboxed) has an origin of no one: its messages say "null", and the caller has
  // made sure they come from that frame's own window.
  if (sandboxed ? origin !== 'null' : origin !== own || own === 'null') return null;
  const m = data as Record<string, unknown>;
  const path = cleanPath(m.path);
  if (!path) return null;
  if (m.hydor === PATH_MESSAGE) return { type: 'path', path };
  if (m.hydor !== POINT_MESSAGE) return null;
  const kind = typeof m.kind === 'string' && KINDS.has(m.kind) ? m.kind : 'text';
  const tag = typeof m.tag === 'string' && /^[a-z][a-z0-9-]{0,15}$/.test(m.tag) ? m.tag : '';
  return { type: 'point', pointed: { path, text: words(m.text), kind, tag } };
}

/** A short reference to the part, as it goes in a message: "About the button “Add customer” on /customers:". */
export function pointNote(p: Pointed): string {
  const words = p.text ? ` “${p.text}”` : '';
  return `About the ${p.kind}${words} on ${p.path}:`;
}
