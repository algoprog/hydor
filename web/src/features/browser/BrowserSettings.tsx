// The settings of your own browser, in a panel beside the page: its home page, the search engine of the address bar
// and whether it suggests as you type, the ad blocker, and clearing what the browser kept (history, cookies, cached
// files). Settings → Browser has a row that opens it.
import { useEffect, useRef, useState } from 'react';
import { SEARCH_ENGINES, type SearchEngine } from '@shared/browser';
import { toast } from '../../lib/store';
import { Button, inputCls, Switch, Throbber } from '../../components/ui';
import { Group, Row, Select, Stack } from '../settings/kit';
import { activeTab, clearBrowsingData, ENGINE_NAMES, isWebPage, KEY, loadPrefs, savePrefs, usePrefs } from './browsing';
import { Panel } from './Panel';
import { PagesGroup, TranslationGroup } from './TranslationSettings';
import { useBrowser } from './store';

type Range = 'hour' | 'day' | 'week' | 'all';
const RANGES: { value: Range; label: string; ms?: number }[] = [
  { value: 'hour', label: 'Last hour', ms: 3_600_000 },
  { value: 'day', label: 'Last 24 hours', ms: 86_400_000 },
  { value: 'week', label: 'Last 7 days', ms: 7 * 86_400_000 },
  { value: 'all', label: 'All time' },
];

function Check({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1 text-[13.5px]">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
      {children}
    </label>
  );
}

export function BrowserSettingsPanel({ onClose, focusClear, focusTranslation }: { onClose: () => void; focusClear?: boolean; focusTranslation?: number }) {
  const prefs = usePrefs((s) => s.prefs);
  const tab = activeTab(useBrowser((s) => s.views[KEY]));
  const [home, setHome] = useState('');
  const [template, setTemplate] = useState('');
  const [custom, setCustom] = useState(false);
  const [what, setWhat] = useState({ history: true, cookies: false, cache: false });
  const [range, setRange] = useState<Range>('hour');
  const [busy, setBusy] = useState(false);
  const clear = useRef<HTMLDivElement>(null);
  const translation = useRef<HTMLDivElement>(null);
  useEffect(() => void loadPrefs(), []);
  // The fields start from what is kept (once it arrives).
  const loaded = !!prefs;
  useEffect(() => {
    if (!prefs) return;
    setHome(prefs.home);
    setTemplate(prefs.customSearch ?? '');
    setCustom(prefs.engine === 'custom');
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Clear browsing data…" in the history opens this scrolled to its section.
  useEffect(() => {
    if (focusClear) clear.current?.scrollIntoView({ block: 'start' });
  }, [focusClear, loaded]);

  // "Translation settings" in the translate popover opens this scrolled to its group (each press, whether the panel was open or not).
  useEffect(() => {
    if (focusTranslation) translation.current?.scrollIntoView({ block: 'start' });
  }, [focusTranslation, loaded]);

  const saveHome = async (v: string) => {
    const t = v.trim();
    if (!prefs || !t || t === prefs.home) return setHome(prefs?.home ?? '');
    if (!(await savePrefs({ home: t }))) setHome(prefs.home);
  };
  const saveTemplate = async (v: string) => {
    const t = v.trim();
    if (!prefs || !t || (t === prefs.customSearch && prefs.engine === 'custom')) return;
    if (!(await savePrefs({ engine: 'custom', customSearch: t }))) setTemplate(prefs.customSearch ?? '');
  };
  const pick = (e: SearchEngine) => {
    if (e === 'custom') {
      setCustom(true);
      if (prefs?.customSearch) void savePrefs({ engine: 'custom' });
      return;
    }
    setCustom(false);
    void savePrefs({ engine: e });
  };
  const run = async () => {
    setBusy(true);
    const ms = RANGES.find((r) => r.value === range)?.ms;
    const ok = await clearBrowsingData({ ...what, ...(ms ? { since: Date.now() - ms } : {}) });
    setBusy(false);
    if (ok) toast('Browsing data cleared', 'info');
  };
  const engine: SearchEngine = custom ? 'custom' : (prefs?.engine ?? 'google');

  return (
    <Panel title="Browser settings" onClose={onClose}>
      {!prefs ? (
        <div className="flex justify-center py-10">
          <Throbber size={24} />
        </div>
      ) : (
        <div className="p-3">
          <Stack className="space-y-5">
            <Group>
              <Row label="Home page" hint="The Home button and new tabs open it">
                <div className="mt-2 flex gap-2">
                  <input
                    value={home}
                    onChange={(e) => setHome(e.target.value)}
                    onBlur={() => void saveHome(home)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    spellCheck={false}
                    aria-label="Home page"
                    translate="no"
                    className={inputCls}
                  />
                </div>
                <div className="mt-2">
                  <Button size="sm" variant="secondary" disabled={!tab || !isWebPage(tab.url) || tab.url === prefs.home} onClick={() => tab && void savePrefs({ home: tab.url }).then((ok) => ok && setHome(tab.url))}>
                    Use the current page
                  </Button>
                </div>
              </Row>
            </Group>
            <Group title="Search">
              <Row label="Search engine" hint="What the address bar searches with" control={<Select<SearchEngine> label="Search engine" value={engine} options={SEARCH_ENGINES.map((e) => ({ value: e, label: ENGINE_NAMES[e] ?? e }))} onChange={pick} width={200} />}>
                {custom && (
                  <input
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    onBlur={() => void saveTemplate(template)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    placeholder="https://example.com/search?q=%s"
                    spellCheck={false}
                    aria-label="Search address, with %s where your words go"
                    translate="no"
                    className={`${inputCls} mt-2`}
                  />
                )}
              </Row>
              <Row label="Search suggestions" hint="What you type in the address bar goes to your search engine, as in any browser" control={<Switch on={prefs.suggest} label="Search suggestions" onChange={(v) => void savePrefs({ suggest: v })} />} />
            </Group>
            <Group title="Ads">
              <Row label="Block ads and trackers" hint="Extensions that block ads may not run while this is on" control={<Switch on={prefs.adblock} label="Block ads and trackers" onChange={(v) => void savePrefs({ adblock: v })} />} />
              <Row
                label="Hide cookie banners"
                hint="Hides the cookie notices many sites show, using EasyList’s list of them. A site that waits for your answer may hold some of its content back: allow ads on it from its padlock to see its notice again."
                disabled={!prefs.adblock}
                control={<Switch on={prefs.cookieBanners} label="Hide cookie banners" disabled={!prefs.adblock} onChange={(v) => void savePrefs({ cookieBanners: v })} />}
              />
            </Group>
            <div ref={translation}>
              <TranslationGroup />
            </div>
            <PagesGroup />
            <div ref={clear}>
              <Group title="Clear browsing data">
                <div className="space-y-0.5 p-4">
                  <Check on={what.history} onChange={(v) => setWhat((w) => ({ ...w, history: v }))}>
                    Browsing history
                  </Check>
                  <Check on={what.cookies} onChange={(v) => setWhat((w) => ({ ...w, cookies: v }))}>
                    Cookies and site data (you are signed out of sites)
                  </Check>
                  <Check on={what.cache} onChange={(v) => setWhat((w) => ({ ...w, cache: v }))}>
                    Cached files
                  </Check>
                  <div className="flex items-center gap-2 pt-3">
                    <Select<Range> label="Time range" value={range} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} onChange={setRange} width={200} />
                    <Button size="sm" variant="primary" className="ml-auto" disabled={busy || !(what.history || what.cookies || what.cache)} onClick={() => void run()}>
                      {busy ? 'Clearing…' : 'Clear data'}
                    </Button>
                  </div>
                  {/* Electron clears cookies, site data and cached files as a whole: the time range is history's alone. */}
                  {(what.cookies || what.cache) && range !== 'all' && <div className="pt-2 text-[12px] text-fg-3">Cookies, site data and cached files are cleared for all time.</div>}
                </div>
              </Group>
            </div>
          </Stack>
        </div>
      )}
    </Panel>
  );
}
