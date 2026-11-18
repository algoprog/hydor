// Translating pages: the address bar's button and the popover it opens (translate, show the original, the language to
// translate into, always or never for a language or a site), the words the right-click menu translates in a dialog, and
// what the ⋯ menu and the right-click menu do with a page. The server translates (with the helper model) and reports
// its progress in the tab's `translation`.
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Check, Copy, Languages } from 'lucide-react';
import { isTranslateLang, TRANSLATE_LANGS, type BrowserTab, type BrowsingPrefs } from '@shared/browser';
import { toast } from '../../lib/store';
import { Button, cx, Dialog, Popover, Switch, Throbber } from '../../components/ui';
import { Select } from '../settings/kit';
import { savePrefs, showOriginal, translateTab, translateText, usePrefs } from './browsing';
import { langChoice, langLabel } from './languages';
import { hostOf } from './store';

export { langChoice, langLabel };

/** Where the translate popover is open: under the address bar's button, or (when that is not shown) under the ⋯ button; and the words being translated in the dialog. */
export const useTranslateUI = create<{ at: 'bar' | 'menu' | null; text: { n: number; text: string; url: string } | null; settings: number }>(() => ({ at: null, text: null, settings: 0 }));

let counter = 0;
/** Opens the dialog that translates words picked on a page. */
export const openTranslateText = (text: string, url: string) => useTranslateUI.setState({ text: { n: ++counter, text, url } });
/** Asks the Browser page to open its settings at Translation. */
export const openTranslationSettings = () => useTranslateUI.setState((s) => ({ at: null, settings: s.settings + 1 }));

/** The languages to pick from: "<its own name> — <its name here>". */
export const LANG_OPTIONS = TRANSLATE_LANGS.map((l) => ({ value: l.code, label: <span translate="no">{langChoice(l)}</span> }));

/** Whether a tab's page is translated, or on its way to be. */
export const isTranslated = (tab: BrowserTab | undefined) => !!tab?.translation && tab.translation.state !== 'failed';

/** Whether the address bar shows the translate button: the page is translated (or being), or its language is not the one you read and you want the offer. */
export function translateOffered(tab: BrowserTab | undefined, prefs: BrowsingPrefs | null): boolean {
  if (!tab || !/^https?:/i.test(tab.url)) return false;
  if (tab.translation) return true;
  if (!prefs || !tab.lang || !prefs.translateOffer) return false;
  return tab.lang !== prefs.translateTo && !(prefs.translateNever ?? []).includes(tab.lang) && !(prefs.translateNeverSites ?? []).includes(hostOf(tab.url));
}

/** The right-click menu's Translate page: shows the original when the page is translated or on its way, else translates it into the language you chose. */
export function togglePageTranslation(tab: BrowserTab) {
  if (isTranslated(tab)) void showOriginal(tab.id);
  else void translateTab(tab.id, usePrefs.getState().prefs?.translateTo);
}

/** The ⋯ menu's Translate page…: opens the popover where it can be seen. */
export function openTranslatePopover(tab: BrowserTab | undefined, prefs: BrowsingPrefs | null) {
  useTranslateUI.setState({ at: translateOffered(tab, prefs) ? 'bar' : 'menu' });
}

/** The address bar's button: lit while the page is translated, pulsing while it is being. Nothing when translating is not offered. */
export function TranslateButton({ tab }: { tab: BrowserTab }) {
  const ref = useRef<HTMLButtonElement>(null);
  const prefs = usePrefs((s) => s.prefs);
  const at = useTranslateUI((s) => s.at);
  const close = () => useTranslateUI.setState({ at: null });
  if (!translateOffered(tab, prefs)) return null;
  const st = tab.translation?.state;
  const label = st === 'translating' ? 'Translating this page' : st === 'translated' ? 'This page is translated' : st === 'failed' ? 'The page could not be translated' : 'Translate this page';
  return (
    <>
      <button
        ref={ref}
        aria-label={label}
        title={label}
        aria-expanded={at === 'bar'}
        onClick={() => useTranslateUI.setState({ at: at === 'bar' ? null : 'bar' })}
        className={cx('ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-bg-3', st === 'translated' || st === 'translating' ? 'bg-accent-soft text-accent' : st === 'failed' ? 'text-err' : 'text-fg-3 hover:text-fg')}
      >
        <Languages size={15} className={cx(st === 'translating' && 'animate-pulse')} />
      </button>
      <TranslatePopover anchor={ref} open={at === 'bar'} onClose={close} tab={tab} />
    </>
  );
}

/** What translating this page offers: its language, what to translate into, and the choices to do it always or never. */
export function TranslatePopover({ anchor, open, onClose, tab, align = 'end' }: { anchor: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void; tab: BrowserTab; align?: 'start' | 'end' }) {
  const prefs = usePrefs((s) => s.prefs);
  const t = tab.translation;
  const busy = t?.state === 'translating';
  const done = t?.state === 'translated';
  const lang = tab.lang ?? t?.from;
  const host = hostOf(tab.url);
  const to = t?.to ?? prefs?.translateTo ?? 'en';
  const always = (prefs?.translateAlways ?? []).includes(lang ?? '');
  const never = (prefs?.translateNever ?? []).includes(lang ?? '');
  const neverSite = (prefs?.translateNeverSites ?? []).includes(host);

  const change = async (code: string) => {
    if (!(await savePrefs({ translateTo: code }))) return;
    if (t && t.state !== 'failed') void translateTab(tab.id, code);
  };
  const main = () => (busy || done ? void showOriginal(tab.id) : void translateTab(tab.id, to));
  const setAlways = async (on: boolean) => {
    if (!prefs || !lang) return;
    const rest = (prefs.translateNever ?? []).filter((c) => c !== lang);
    const list = (prefs.translateAlways ?? []).filter((c) => c !== lang);
    if (!(await savePrefs({ translateAlways: on ? [...list, lang] : list, translateNever: rest }))) return;
    // The page in front is translated right away.
    if (on && !t) void translateTab(tab.id, to);
  };
  const setNever = async (on: boolean) => {
    if (!prefs || !lang) return;
    const list = (prefs.translateNever ?? []).filter((c) => c !== lang);
    if (!(await savePrefs({ translateNever: on ? [...list, lang] : list, translateAlways: (prefs.translateAlways ?? []).filter((c) => c !== lang) }))) return;
    if (!on) return;
    onClose();
    if (t) void showOriginal(tab.id);
  };
  const setNeverSite = async (on: boolean) => {
    if (!prefs || !host) return;
    const list = (prefs.translateNeverSites ?? []).filter((h) => h !== host);
    if (!(await savePrefs({ translateNeverSites: on ? [...list, host] : list }))) return;
    if (!on) return;
    onClose();
    if (t) void showOriginal(tab.id);
  };

  let status: string | null = null;
  if (t?.state === 'translating') status = `Translating… ${t.done} of ${t.total} parts`;
  else if (t?.state === 'translated') status = t.from && t.model ? `Translated from ${langLabel(t.from)} with ${t.model}` : t.from ? `Translated from ${langLabel(t.from)}` : t.model ? `Translated with ${t.model}` : 'Translated';
  else if (t?.state === 'failed') status = t.error || 'The page could not be translated';

  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align={align} width={330} title="Translate this page">
      <div className="space-y-3 p-2.5">
        <div className="flex items-start gap-2.5">
          <Languages size={16} className="mt-0.5 shrink-0 text-fg-3" />
          <div className="min-w-0">
            <div className="text-[14px] font-medium">Translate this page</div>
            <div className="text-[12.5px] leading-snug text-fg-3">{lang ? `Detected: ${langLabel(lang)}` : 'Language not detected'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[13px] text-fg-2">Translate into</span>
          <Select<string> label="Translate into" value={to} options={LANG_OPTIONS} onChange={(c) => void change(c)} width={240} />
        </div>
        <Button size="sm" variant={busy || done ? 'secondary' : 'primary'} className="w-full" onClick={main}>
          {busy || done ? 'Show original' : t?.state === 'failed' ? 'Try again' : 'Translate'}
        </Button>
        {status && (
          <div className={cx('flex items-start gap-2 text-[12.5px] leading-snug', t?.state === 'failed' ? 'text-err' : 'text-fg-3')}>
            {busy && <Throbber size={14} className="mt-px shrink-0" />}
            <span className="tnum min-w-0 break-words">{status}</span>
          </div>
        )}
        <div className="space-y-2 border-t border-line pt-2.5">
          {lang && (
            <>
              <label className="flex items-center gap-2.5 text-[13px]">
                <span className="min-w-0 flex-1">Always translate {langLabel(lang)}</span>
                <Switch on={always} label={`Always translate ${langLabel(lang)}`} onChange={(v) => void setAlways(v)} />
              </label>
              <label className="flex items-center gap-2.5 text-[13px]">
                <span className="min-w-0 flex-1">Never translate {langLabel(lang)}</span>
                <Switch on={never} label={`Never translate ${langLabel(lang)}`} onChange={(v) => void setNever(v)} />
              </label>
            </>
          )}
          {host && (
            <label className="flex items-center gap-2.5 text-[13px]">
              <span className="min-w-0 flex-1">
                Never translate <span translate="no">{host}</span>
              </span>
              <Switch on={neverSite} label="Never translate this site" onChange={(v) => void setNeverSite(v)} />
            </label>
          )}
        </div>
        <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => (onClose(), openTranslationSettings())}>
          Translation settings
        </button>
      </div>
    </Popover>
  );
}

/** The dialog that translates words picked on a page (the right-click menu's Translate “…”): their translation, the language to translate into, and a way to copy it. Errors show here. */
export function TranslateTextDialog() {
  const req = useTranslateUI((s) => s.text);
  return req ? <TranslateTextBody key={req.n} text={req.text} onClose={() => useTranslateUI.setState({ text: null })} /> : null;
}

function TranslateTextBody({ text, onClose }: { text: string; onClose: () => void }) {
  const prefs = usePrefs((s) => s.prefs);
  const [to, setTo] = useState(() => usePrefs.getState().prefs?.translateTo ?? 'en');
  const [res, setRes] = useState<{ state: 'busy' } | { state: 'done'; text: string; from?: string; model: string } | { state: 'error'; error: string }>({ state: 'busy' });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    setRes({ state: 'busy' });
    setCopied(false);
    translateText(text, to).then(
      (r) => live && setRes({ state: 'done', text: r.text, from: r.from, model: r.model }),
      (e) => live && setRes({ state: 'error', error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [text, to]);
  const code = isTranslateLang(to) ? to : (prefs?.translateTo ?? 'en');
  return (
    <Dialog
      open
      onClose={onClose}
      title="Translation"
      width={480}
      footer={
        <>
          <Button
            variant="secondary"
            icon={copied ? <Check size={14} /> : <Copy size={14} />}
            disabled={res.state !== 'done'}
            onClick={() => {
              if (res.state !== 'done') return;
              void navigator.clipboard?.writeText(res.text).then(
                () => (setCopied(true), toast('Copied the translation', 'ok')),
                () => {},
              );
            }}
          >
            Copy
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div translate="no" className="max-h-24 overflow-y-auto rounded-lg bg-bg-2 px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap text-fg-3">
          {text}
        </div>
        <div className="min-h-12">
          {res.state === 'busy' ? (
            <div className="flex items-center gap-2 py-2 text-[13px] text-fg-3">
              <Throbber size={16} />
              Translating…
            </div>
          ) : res.state === 'error' ? (
            <div className="text-[13.5px] leading-snug text-err">{res.error}</div>
          ) : (
            <div translate="no" className="max-h-60 overflow-y-auto text-[15px] leading-relaxed whitespace-pre-wrap select-text">
              {res.text}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[13px] text-fg-2">Translate into</span>
          <Select<string> label="Translate into" value={code} options={LANG_OPTIONS} onChange={setTo} width={240} />
        </div>
        {res.state === 'done' && (
          <div translate="no" className="text-[11.5px] text-fg-3">
            {res.model}
          </div>
        )}
      </div>
    </Dialog>
  );
}
