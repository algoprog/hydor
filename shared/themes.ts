// Colour themes: Hydor's dark and light palettes, two more, and any the user makes. A theme has a base,
// dark or light, which picks the syntax colours, the terminal's ANSI colours and the shadows; its own
// colours cover everything else, and any it leaves out come from the base's Hydor palette.

export type ThemeBase = 'dark' | 'light';

/** Every colour a theme sets, in the order the editor shows them. */
export const THEME_TOKENS = [
  { key: 'bg', group: 'Backgrounds', label: 'Page', hint: 'Behind everything' },
  { key: 'sidebar', group: 'Backgrounds', label: 'Sidebar' },
  { key: 'panel', group: 'Backgrounds', label: 'Cards', hint: 'The composer, settings cards, panels' },
  { key: 'elevated', group: 'Backgrounds', label: 'Menus and dialogs' },
  { key: 'bg-1', group: 'Backgrounds', label: 'Fields', hint: 'Inputs and quiet fills' },
  { key: 'bg-2', group: 'Backgrounds', label: 'Hover', hint: 'Rows under the pointer, chips' },
  { key: 'bg-3', group: 'Backgrounds', label: 'Selected', hint: 'The open row, secondary buttons' },
  { key: 'fg', group: 'Text', label: 'Text' },
  { key: 'fg-2', group: 'Text', label: 'Secondary text' },
  { key: 'fg-3', group: 'Text', label: 'Muted text', hint: 'Hints, times, labels' },
  { key: 'line', group: 'Borders', label: 'Borders' },
  { key: 'line-2', group: 'Borders', label: 'Strong borders', hint: 'Inputs and outlined buttons' },
  { key: 'accent', group: 'Accent', label: 'Accent', hint: 'Main buttons, links, focus, selection' },
  { key: 'accent-fg', group: 'Accent', label: 'Text on accent' },
  { key: 'busy', group: 'Status', label: 'Working' },
  { key: 'warn', group: 'Status', label: 'Needs you, warnings' },
  { key: 'ok', group: 'Status', label: 'Done, added lines' },
  { key: 'err', group: 'Status', label: 'Failed, removed lines' },
  { key: 'info', group: 'Status', label: 'Information' },
  { key: 'claude', group: 'Agents', label: 'Claude' },
  { key: 'codex', group: 'Agents', label: 'Codex' },
  { key: 'code-bg', group: 'Code and terminal', label: 'Code blocks' },
  { key: 'term-bg', group: 'Code and terminal', label: 'Terminal background' },
  { key: 'term-fg', group: 'Code and terminal', label: 'Terminal text' },
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number]['key'];
export type ThemeColors = Record<ThemeToken, string>;

export interface AppTheme {
  id: string;
  name: string;
  base: ThemeBase;
  colors: Partial<ThemeColors>;
}

/** The stylesheet's palettes (styles.css); the built-in Hydor themes apply no colours of their own. */
export const HYDOR_DARK: ThemeColors = {
  bg: '#000000',
  sidebar: '#11131a',
  panel: '#151820',
  elevated: '#171b23',
  'bg-1': '#13161c',
  'bg-2': '#1b1f27',
  'bg-3': '#242a34',
  fg: '#e9edf5',
  'fg-2': '#bcc4d3',
  'fg-3': '#8f99ab',
  line: '#262b36',
  'line-2': '#3a4150',
  accent: '#8aa8ff',
  'accent-fg': '#0b1226',
  busy: '#5cc8e8',
  warn: '#f2b468',
  ok: '#6fd39a',
  err: '#f28b8b',
  info: '#5cc8e8',
  claude: '#f0a07f',
  codex: '#b9a9ff',
  'code-bg': '#11141a',
  'term-bg': '#0b0d11',
  'term-fg': '#d5dbe6',
};

export const HYDOR_LIGHT: ThemeColors = {
  bg: '#f6f5f1',
  sidebar: '#f0eee8',
  panel: '#ffffff',
  elevated: '#ffffff',
  'bg-1': '#f0eee8',
  'bg-2': '#eae7df',
  'bg-3': '#e3dfd6',
  fg: '#1b1915',
  'fg-2': '#4a4439',
  'fg-3': '#615a4d',
  line: '#e0dbd0',
  'line-2': '#c9c2b3',
  accent: '#805a00',
  'accent-fg': '#ffffff',
  busy: '#1d4ed8',
  warn: '#9c4704',
  ok: '#156b35',
  err: '#bd2525',
  info: '#1d4ed8',
  claude: '#c25a37',
  codex: '#5f4fd0',
  'code-bg': '#f2f0eb',
  'term-bg': '#faf9f6',
  'term-fg': '#2b2721',
};

export const DEFAULT_THEME: Record<ThemeBase, string> = { dark: 'naget-dark', light: 'naget-light' };

export const BUILT_IN_THEMES: AppTheme[] = [
  { id: 'naget-dark', name: 'Hydor Dark', base: 'dark', colors: HYDOR_DARK },
  { id: 'naget-light', name: 'Hydor Light', base: 'light', colors: HYDOR_LIGHT },
  {
    // Pure black behind the sessions, warm near-black panels in small steps, a gold accent.
    id: 'midnight',
    name: 'Midnight',
    base: 'dark',
    colors: {
      bg: '#000000',
      sidebar: '#151412',
      panel: '#1b1a17',
      elevated: '#1c1a17',
      'bg-1': '#171614',
      'bg-2': '#22201c',
      'bg-3': '#2c2924',
      fg: '#f2eee7',
      'fg-2': '#c9c2b5',
      'fg-3': '#9b9386',
      line: '#302c26',
      'line-2': '#48433a',
      accent: '#d4b158',
      'accent-fg': '#1a1306',
      busy: '#82a8ff',
      warn: '#e0a25a',
      ok: '#6dbb84',
      err: '#e57373',
      info: '#82a8ff',
      claude: '#e8916f',
      codex: '#ada1ff',
      'code-bg': '#161513',
      'term-bg': '#0e0d0c',
      'term-fg': '#ddd7cc',
    },
  },
  {
    // A cool green-grey paper with a deep teal accent.
    id: 'sage',
    name: 'Sage',
    base: 'light',
    colors: {
      bg: '#f4f6f3',
      sidebar: '#edf0ec',
      panel: '#ffffff',
      elevated: '#ffffff',
      'bg-1': '#edf0ec',
      'bg-2': '#e5e9e3',
      'bg-3': '#dce1da',
      fg: '#151a16',
      'fg-2': '#3d4840',
      'fg-3': '#55615a',
      line: '#d9dfd6',
      'line-2': '#bfc8bb',
      accent: '#0f6b6b',
      'accent-fg': '#ffffff',
      busy: '#2851c8',
      warn: '#8f4b00',
      ok: '#18702f',
      err: '#b52626',
      info: '#2851c8',
      claude: '#a34724',
      codex: '#5b4bc9',
      'code-bg': '#eff2ee',
      'term-bg': '#f8faf7',
      'term-fg': '#1f2620',
    },
  },
];

export const isBuiltIn = (id: string) => BUILT_IN_THEMES.some((t) => t.id === id);

/** A theme's colours, with the ones it leaves out taken from its base. */
export function themeColors(t: AppTheme): ThemeColors {
  return { ...(t.base === 'dark' ? HYDOR_DARK : HYDOR_LIGHT), ...t.colors };
}

/** The CSS variables a theme sets: its colours and the tints made from them. */
export function themeVars(t: AppTheme): Record<string, string> {
  const c = themeColors(t);
  const dark = t.base === 'dark';
  return {
    ...c,
    'accent-soft': alpha(c.accent, dark ? 0.14 : 0.12),
    add: c.ok,
    del: c.err,
    'add-bg': alpha(c.ok, dark ? 0.12 : 0.1),
    'del-bg': alpha(c.err, dark ? 0.12 : 0.09),
    'add-strong': alpha(c.ok, dark ? 0.28 : 0.24),
    'del-strong': alpha(c.err, dark ? 0.28 : 0.22),
    scroll: mix(c.line, c['line-2'], 0.5),
    'viz-grid': mix(c.bg, c.line, 0.6),
    'viz-axis': mix(c.line, c['line-2'], 0.5),
  };
}

// ---- colour helpers ----------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/;

/** "#abc", "abc", "#AABBCC" → "#aabbcc"; anything else → null. */
export function normalizeHex(s: string): string | null {
  let h = s.trim().toLowerCase();
  if (!h.startsWith('#')) h = `#${h}`;
  if (/^#[0-9a-f]{3}$/.test(h)) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return HEX.test(h) ? h : null;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export function alpha(hex: string, a: number): string {
  return `rgba(${rgb(hex).join(', ')}, ${a})`;
}

/** `a` moved toward `b` by `t` (0 to 1). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = rgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- checking themes from outside (the API, a pasted theme) -----------------------------------

const TOKEN_KEYS = new Set<string>(THEME_TOKENS.map((t) => t.key));

/** A theme as given, with only what a theme may hold; null when it is not one. */
export function cleanTheme(x: unknown): AppTheme | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  if (!name || (o.base !== 'dark' && o.base !== 'light')) return null;
  const id = typeof o.id === 'string' && /^[a-z0-9-]{1,48}$/.test(o.id) ? o.id : '';
  const colors: Partial<ThemeColors> = {};
  if (o.colors && typeof o.colors === 'object') {
    for (const [k, v] of Object.entries(o.colors as Record<string, unknown>)) {
      const hex = typeof v === 'string' ? normalizeHex(v) : null;
      if (TOKEN_KEYS.has(k) && hex) colors[k as ThemeToken] = hex;
    }
  }
  return { id, name, base: o.base, colors };
}

export const MAX_THEMES = 40;
