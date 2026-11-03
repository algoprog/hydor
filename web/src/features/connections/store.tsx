// What the Connections pages share: the catalog, the connected apps and the keys (refreshed when the
// server says they changed), and an app's tile.
import { create } from 'zustand';
import { AppWindow, Brain, Calendar, Clock, Cloud, Database, Folder, GitBranch, Globe, KeyRound, ListChecks, Mail, MessageSquare, Search, Terminal, type LucideIcon } from 'lucide-react';
import type { CatalogApp, ConnectionView, SecretView } from '@shared/connections';
import { api } from '../../lib/api';
import { toastError } from '../../lib/store';
import { cx } from '../../components/ui';

interface ConnState {
  apps: CatalogApp[] | null;
  categories: Record<string, string>;
  connections: ConnectionView[] | null;
  secrets: SecretView[] | null;
  loadCatalog: () => Promise<void>;
  load: () => Promise<void>;
}

export const useConn = create<ConnState>((set, get) => ({
  apps: null,
  categories: {},
  connections: null,
  secrets: null,
  async loadCatalog() {
    if (get().apps) return;
    try {
      const r = await api<{ apps: CatalogApp[]; categories: Record<string, string> }>('/api/connections/catalog');
      set({ apps: r.apps, categories: r.categories });
    } catch (e) {
      toastError(e);
    }
  },
  async load() {
    try {
      const r = await api<{ connections: ConnectionView[]; secrets: SecretView[] }>('/api/connections');
      set({ connections: r.connections, secrets: r.secrets });
    } catch (e) {
      toastError(e);
    }
  },
}));

const GLYPHS: Record<string, LucideIcon> = {
  folder: Folder,
  git: GitBranch,
  globe: Globe,
  brain: Brain,
  clock: Clock,
  database: Database,
  browser: AppWindow,
  search: Search,
  terminal: Terminal,
  mail: Mail,
  calendar: Calendar,
  chat: MessageSquare,
  key: KeyRound,
  cloud: Cloud,
  list: ListChecks,
};

/** Whether dark text reads better than white on `hex`. */
function light(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}

/** An app's tile: its own SVG (shown as an image, so nothing in it can run), a glyph, or its initial. */
export function AppIcon({ app, size = 36, className }: { app: CatalogApp; size?: number; className?: string }) {
  const box = { width: size, height: size };
  const round = size >= 40 ? 'rounded-[12px]' : 'rounded-[10px]';
  if (typeof app.icon === 'object')
    return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(app.icon.svg)}`} alt="" style={box} className={cx('shrink-0 bg-white object-contain p-1 ring-1 ring-line', round, className)} />;
  const bg = /^#[0-9a-f]{6}$/i.test(app.color ?? '') ? app.color! : '#64748b';
  const Glyph = GLYPHS[app.icon];
  const letter = (app.name.replace(/[^\p{L}\p{N}]/gu, '')[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden
      style={{ ...box, background: bg, color: light(bg) ? '#16130e' : '#ffffff', fontSize: Math.round(size * 0.46) }}
      className={cx('inline-flex shrink-0 items-center justify-center font-semibold tracking-tight shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]', round, className)}
    >
      {Glyph ? <Glyph size={Math.round(size * 0.5)} strokeWidth={2} /> : letter}
    </span>
  );
}

/** How an app is connected, in a few words. */
export function authLabel(a: CatalogApp): string {
  if (a.server.transport === 'stdio') return a.auth.type === 'api_key' ? 'Runs here, with a key' : 'Runs on this computer';
  return a.auth.type === 'oauth' ? 'Browser sign-in' : a.auth.type === 'api_key' ? 'API key' : 'No sign-in';
}

/** The server, in a line: its host, or its command. */
export function serverLine(a: CatalogApp): string {
  const s = a.server;
  if (s.transport === 'stdio') return [s.command, ...(s.args ?? [])].join(' ');
  try {
    return new URL(s.url.replace(/\{\{[A-Z0-9_]+\}\}/g, 'x')).host.replace(/^x\./, '');
  } catch {
    return s.url;
  }
}

export const REPO_CATALOG = 'https://github.com/algoprog/hydor/tree/main/catalog';
