// What the padlock of the address bar opens: whether the connection to the site is secure, and what the site may use
// (the answers you gave it, each with a way to forget it), with the switches for dark pages and the site's cookies. Its
// ads are the shield's (AdBlock.tsx), beside the padlock.
import { useEffect, type RefObject } from 'react';
import { Cookie, Lock, LockOpen, Moon } from 'lucide-react';
import type { BrowserTab } from '@shared/browser';
import { Badge, Button, Popover, Switch, useConfirm } from '../../components/ui';
import { deleteSiteData, desktopBrowser, forgetSitePermission, loadSitePermissions, permissionWords, savePrefs, useSitePermissions, usePrefs } from './browsing';
import { hostOf } from './store';

/** The state of a page's connection, for the padlock. */
export const connectionOf = (url: string): 'secure' | 'insecure' | 'other' => (/^https:/i.test(url) ? 'secure' : /^http:/i.test(url) ? 'insecure' : 'other');

/** The second-level names that sit under a country's two letters (co.uk, com.au, ac.jp…), as the desktop app has them. */
const COUNTRY_SECOND = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'ne', 'or', 'go', 'gob', 'mil', 'nom', 'sch', 'ltd', 'plc', 'ind', 'biz', 'info']);

/**
 * The site whose cookies and data Delete takes, told as the desktop app tells it (desktop/browser.cjs siteOfHost): the last
 * two names of the host, or three under a country's two letters (example.co.uk); an address of numbers is its own site.
 */
function siteOfHost(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h || h.includes(':') || /^\d+(\.\d+){3}$/.test(h)) return h;
  const labels = h.split('.');
  if (labels.length <= 2) return h;
  const last = labels[labels.length - 1];
  const before = labels[labels.length - 2];
  return labels.slice(last.length === 2 && (COUNTRY_SECOND.has(before) || before.length <= 2) ? -3 : -2).join('.');
}

export function SiteInfo({ anchor, open, onClose, tab }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; tab: BrowserTab }) {
  const list = useSitePermissions((s) => s.list);
  const prefs = usePrefs((s) => s.prefs);
  useEffect(() => {
    if (open) void loadSitePermissions();
  }, [open]);
  const host = hostOf(tab.url);
  const conn = connectionOf(tab.url);
  const mine = (list ?? []).filter((p) => hostOf(p.origin) === host);
  const [confirm, confirmNode] = useConfirm();
  const web = /^https?:/i.test(tab.url);
  // Dark pages is on in the browser: this site can be shown as it is.
  const darkHere = !(prefs?.darkExcept ?? []).includes(host);
  const setDark = (on: boolean) => {
    if (!prefs) return;
    const rest = (prefs.darkExcept ?? []).filter((h) => h !== host);
    void savePrefs({ darkExcept: on ? rest : [...rest, host] });
  };
  const deleteData = async () => {
    const site = siteOfHost(host);
    const ok = await confirm({ title: 'Delete cookies and site data', body: `Delete the cookies and site data of ${site}, its subdomains too? You’ll be signed out of it.`, confirm: 'Delete', danger: true });
    if (ok) await deleteSiteData(tab.id);
  };
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} width={310} title={host}>
      <div className="space-y-3 p-2.5">
        <div className="flex items-start gap-2.5">
          {conn === 'secure' ? <Lock size={16} className="mt-0.5 shrink-0 text-ok" /> : <LockOpen size={16} className="mt-0.5 shrink-0 text-warn" />}
          <div className="min-w-0">
            <div translate="no" className="truncate text-[14px] font-medium">
              {host}
            </div>
            <div className="text-[12.5px] leading-snug text-fg-3">{conn === 'secure' ? 'The connection is secure' : conn === 'insecure' ? 'The connection is not secure: what you send here can be read on the way' : 'This page is not on the web'}</div>
          </div>
        </div>
        {mine.length > 0 && (
          <div className="space-y-1.5">
            {mine.map((p) => (
              <div key={`${p.origin}|${p.permission}|${p.media?.join('+') ?? ''}`} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 leading-snug">wants {permissionWords({ id: '', tab: '', origin: p.origin, permission: p.permission, media: p.media })}</span>
                <Badge tone={p.allow ? 'ok' : 'err'}>{p.allow ? 'Allowed' : 'Blocked'}</Badge>
                <Button size="sm" variant="ghost" onClick={() => void forgetSitePermission(p)}>
                  Forget
                </Button>
              </div>
            ))}
          </div>
        )}
        {prefs?.darkPages && web && (
          <div className="flex items-center gap-2.5 border-t border-line pt-2.5 text-[13px] text-fg-2">
            <Moon size={15} className="shrink-0 text-fg-3" />
            <span className="min-w-0 flex-1">Dark pages on this site</span>
            <Switch on={darkHere} label="Dark pages on this site" onChange={setDark} />
          </div>
        )}
        {web && !!desktopBrowser()?.clearSite && (
          <div className="flex items-center gap-2.5 border-t border-line pt-2.5 text-[13px] text-fg-2">
            <Cookie size={15} className="shrink-0 text-fg-3" />
            <span className="min-w-0 flex-1">Cookies and site data</span>
            <Button size="sm" variant="secondary" onClick={() => void deleteData()}>
              Delete
            </Button>
          </div>
        )}
      </div>
      {confirmNode}
    </Popover>
  );
}
