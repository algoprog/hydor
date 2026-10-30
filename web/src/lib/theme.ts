// Which theme shows: the mode (dark, light, or the device's), the theme picked for each, and the
// user's own themes (kept on the server, cached here so they paint before the app has loaded).
import { create } from 'zustand';
import { BUILT_IN_THEMES, DEFAULT_THEME, themeColors, themeVars, type AppTheme, type ThemeBase } from '@shared/themes';
import { useUI } from './store';

const CUSTOM_KEY = 'wa.themes.v1';
/** What public/theme-boot.js paints before the app loads. */
const BOOT_KEY = 'wa.theme.boot';

function cached(): AppTheme[] {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const useThemes = create<{ custom: AppTheme[] }>(() => ({ custom: cached() }));

export function setCustomThemes(list: AppTheme[]) {
  useThemes.setState({ custom: list });
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {}
}

// The server's copy changed (another tab or device saved one).
window.addEventListener('wa:themes', (e) => {
  setCustomThemes((e as CustomEvent<AppTheme[]>).detail);
  applyTheme();
});

export const allThemes = () => [...BUILT_IN_THEMES, ...useThemes.getState().custom];
export const findTheme = (id: string) => allThemes().find((t) => t.id === id);

export const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/** The base showing now: the mode's, or the device's when the mode is System. */
export function activeBase(): ThemeBase {
  const m = useUI.getState().theme;
  return m === 'dark' || (m === 'system' && systemDark()) ? 'dark' : 'light';
}

/** The theme picked for a base; its Naget theme when the pick is gone. */
export function themeFor(base: ThemeBase): AppTheme {
  const ui = useUI.getState();
  const t = findTheme(base === 'dark' ? ui.darkTheme : ui.lightTheme);
  return t && t.base === base ? t : findTheme(DEFAULT_THEME[base])!;
}

// Naget's own themes are the stylesheet's; the others set their colours on the page.
const isNaget = (t: AppTheme) => t.id === DEFAULT_THEME.dark || t.id === DEFAULT_THEME.light;
const ALL_VARS = Object.keys(themeVars(BUILT_IN_THEMES[0]));
const varsOf = (t: AppTheme) => (isNaget(t) ? {} : themeVars(t));

/** Paints a theme on the page (the editor previews drafts this way). */
export function paintTheme(t: AppTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', t.base === 'dark');
  for (const k of ALL_VARS) root.style.removeProperty(`--${k}`);
  for (const [k, v] of Object.entries(varsOf(t))) root.style.setProperty(`--${k}`, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors(t).bg);
  window.dispatchEvent(new Event('wa:theme'));
}

/** Shows the theme picked for the mode in effect, and keeps both picks for the next page load. */
export function applyTheme() {
  paintTheme(themeFor(activeBase()));
  const boot = (b: ThemeBase) => {
    const t = themeFor(b);
    return { vars: varsOf(t), color: themeColors(t).bg };
  };
  try {
    localStorage.setItem(BOOT_KEY, JSON.stringify({ mode: useUI.getState().theme, dark: boot('dark'), light: boot('light') }));
  } catch {}
}

/** Uses a theme: it becomes its base's pick, and the mode switches to that base unless it follows the device. */
export function pickTheme(t: AppTheme) {
  const ui = useUI.getState();
  ui.set({ ...(t.base === 'dark' ? { darkTheme: t.id } : { lightTheme: t.id }), ...(ui.theme === 'system' ? {} : { theme: t.base }) });
  applyTheme();
}
