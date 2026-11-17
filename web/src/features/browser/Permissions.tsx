// The answers you gave to sites' requests (camera, microphone, location, notifications…), each with a way to forget it.
import { useEffect } from 'react';
import { Badge, Button, Throbber } from '../../components/ui';
import { forgetSitePermission, loadSitePermissions, permissionWords, useSitePermissions } from './browsing';
import { hostOf } from './store';
import { Note, Panel } from './Panel';

export function PermissionsPanel({ onClose }: { onClose: () => void }) {
  const list = useSitePermissions((s) => s.list);
  useEffect(() => void loadSitePermissions(), []);
  return (
    <Panel title="Site permissions" onClose={onClose}>
      {!list ? (
        <div className="flex justify-center py-10">
          <Throbber size={24} />
        </div>
      ) : !list.length ? (
        <Note>No site has asked yet. When one asks for your camera, location or the like, your answer is kept here.</Note>
      ) : (
        list.map((p) => (
          <div key={`${p.origin}|${p.permission}|${p.media?.join('+') ?? ''}`} className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1 text-[13.5px] leading-snug">
              <span translate="no" className="font-medium">
                {hostOf(p.origin) || p.origin}
              </span>{' '}
              wants {permissionWords({ id: '', tab: '', origin: p.origin, permission: p.permission, media: p.media })}
            </div>
            <Badge tone={p.allow ? 'ok' : 'err'}>{p.allow ? 'Allowed' : 'Blocked'}</Badge>
            <Button size="sm" variant="ghost" onClick={() => void forgetSitePermission(p)}>
              Forget
            </Button>
          </div>
        ))
      )}
    </Panel>
  );
}
