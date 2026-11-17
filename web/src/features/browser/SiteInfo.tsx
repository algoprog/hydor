// What the padlock of the address bar opens: whether the connection to the site is secure, what the site may use
// (the answers you gave it, each with a way to forget it), and its ads: how many were blocked on this page, and a
// switch for this site.
import { useEffect, type RefObject } from 'react';
import { Lock, LockOpen, ShieldCheck } from 'lucide-react';
import type { BrowserTab } from '@shared/browser';
import { Badge, Button, Popover } from '../../components/ui';
import { forgetSitePermission, loadSitePermissions, navigate, permissionWords, savePrefs, useSitePermissions, usePrefs, useTabState } from './browsing';
import { hostOf } from './store';

/** The state of a page's connection, for the padlock. */
export const connectionOf = (url: string): 'secure' | 'insecure' | 'other' => (/^https:/i.test(url) ? 'secure' : /^http:/i.test(url) ? 'insecure' : 'other');

export function SiteInfo({ anchor, open, onClose, tab }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; tab: BrowserTab }) {
  const list = useSitePermissions((s) => s.list);
  const prefs = usePrefs((s) => s.prefs);
  const blocked = useTabState((s) => s.byTab[tab.id]?.blocked);
  useEffect(() => {
    if (open) void loadSitePermissions();
  }, [open]);
  const host = hostOf(tab.url);
  const conn = connectionOf(tab.url);
  const mine = (list ?? []).filter((p) => hostOf(p.origin) === host);
  const allowed = !!prefs?.allowAds.includes(host);
  const setAds = async (allow: boolean) => {
    if (!prefs) return;
    const rest = prefs.allowAds.filter((h) => h !== host);
    if (await savePrefs({ allowAds: allow ? [...rest, host] : rest })) {
      onClose();
      // The page asks for its ads again, with the new answer.
      void navigate('reload');
    }
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
        {prefs?.adblock && /^https?:/i.test(tab.url) && (
          <div className="space-y-2 border-t border-line pt-2.5">
            <div className="flex items-center gap-2 text-[13px] text-fg-2">
              <ShieldCheck size={15} className="shrink-0 text-fg-3" />
              <span className="tnum">{allowed ? 'Ads are allowed on this site' : blocked ? `${blocked} ${blocked === 1 ? 'ad or tracker' : 'ads and trackers'} blocked on this page` : 'No ads or trackers blocked on this page'}</span>
            </div>
            <Button size="sm" variant="secondary" className="w-full" onClick={() => void setAds(!allowed)}>
              {allowed ? 'Block ads on this site' : 'Allow ads on this site'}
            </Button>
          </div>
        )}
      </div>
    </Popover>
  );
}
