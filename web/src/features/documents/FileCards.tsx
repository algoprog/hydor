// The files an agent handed over (present_files), as cards with its reply: an icon by type (a
// thumbnail for pictures), the name, what it is and its size, the agent's caption, then Open (the
// app's file viewer, which previews documents), Download and ⋯ (a session with it, a space, the Library for a notebook,
// a document, a spreadsheet or a LaTeX file, Files).
import { useEffect, useState } from 'react';
import { Download, FileQuestion } from 'lucide-react';
import { kindLabel, docKind } from '@shared/documents';
import type { ToolItem } from '@shared/types';
import { api } from '../../lib/api';
import { basename, bytes } from '../../lib/format';
import { mu } from '../../lib/machine';
import { openFile } from '../../lib/nav';
import { useApp, useSessions } from '../../lib/store';
import { Button, cx, IconButton } from '../../components/ui';
import { FileIcon, resolveIn } from './fileTypes';
import { FileMore } from '../files/SpaceMenu';

interface Card {
  path: string;
  caption?: string;
}

/** Files to show, from the call's arguments. */
function cardsOf(item: ToolItem, cwd?: string, home?: string): Card[] {
  const input = (item.tool.input ?? {}) as { files?: unknown };
  const list = Array.isArray(input.files) ? input.files : [];
  return list
    .map((f): Card | null => {
      const p = typeof f === 'string' ? f : (f as { path?: unknown })?.path;
      const caption = typeof f === 'object' && f ? (f as { caption?: unknown }).caption : undefined;
      return typeof p === 'string' && p.trim() ? { path: resolveIn(p, cwd, home), caption: typeof caption === 'string' && caption.trim() ? caption.trim() : undefined } : null;
    })
    .filter((c): c is Card => !!c)
    .slice(0, 12);
}

export const download = (path: string) => {
  const a = document.createElement('a');
  a.href = mu(`/api/fs/raw?path=${encodeURIComponent(path)}&download=1`);
  a.download = basename(path);
  document.body.appendChild(a);
  a.click();
  a.remove();
};

type Stat = { exists: boolean; size?: number } | undefined;

function FileCard({ card, stat, sessionKey }: { card: Card; stat: Stat; sessionKey: string }) {
  const name = basename(card.path);
  const gone = stat && !stat.exists;
  const image = docKind(card.path) === 'image' && !gone;
  const [thumbOk, setThumbOk] = useState(true);
  return (
    <div className={cx('flex min-w-0 items-center gap-3 rounded-xl border border-line bg-panel py-2.5 pr-2 pl-2.5 transition-colors', gone ? 'opacity-60' : 'hover:border-line-2')}>
      <button type="button" disabled={gone} onClick={() => openFile(card.path)} className="flex min-w-0 flex-1 items-center gap-3 text-left" title={card.path}>
        {image && thumbOk ? (
          <img src={mu(`/api/fs/raw?path=${encodeURIComponent(card.path)}`)} alt="" loading="lazy" onError={() => setThumbOk(false)} className="h-10 w-10 shrink-0 rounded-[10px] border border-line object-cover" />
        ) : gone ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-3">
            <FileQuestion size={19} strokeWidth={1.8} />
          </span>
        ) : (
          <FileIcon path={card.path} />
        )}
        <span className="min-w-0 flex-1">
          <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
            {name}
          </span>
          <span className="block truncate text-[12px] leading-4 text-fg-3">
            {gone ? 'No longer there' : `${kindLabel(card.path)}${stat?.size != null ? ` · ${bytes(stat.size)}` : ''}`}
          </span>
          {card.caption && (
            <span translate="no" className="mt-1 line-clamp-2 block text-[12.5px] leading-snug text-fg-2">
              {card.caption}
            </span>
          )}
        </span>
      </button>
      {!gone && (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button size="sm" variant="subtle" onClick={() => openFile(card.path)} className="h-8 px-2.5">
            Open
          </Button>
          <IconButton label={`Download ${name}`} onClick={() => download(card.path)}>
            <Download size={16} />
          </IconButton>
          <FileMore path={card.path} size={stat?.size} sessionKey={sessionKey} />
        </div>
      )}
    </div>
  );
}

export function FileCards({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const cwd = useSessions((s) => s.byKey[sessionKey]?.cwd);
  const home = useApp((s) => s.boot?.home);
  const cards = cardsOf(item, cwd, home);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const key = cards.map((c) => c.path).join('\n');
  const done = item.tool.status === 'ok';
  useEffect(() => {
    if (!done || !key) return;
    let alive = true;
    Promise.all(
      key.split('\n').map((p) =>
        api<{ exists: boolean; size?: number }>(`/api/fs/stat?path=${encodeURIComponent(p)}`)
          .then((s) => [p, s] as const)
          .catch(() => [p, undefined] as const),
      ),
    ).then((list) => alive && setStats(Object.fromEntries(list)));
    return () => {
      alive = false;
    };
  }, [key, done]);
  if (item.tool.status === 'error') {
    return <div className="tl-item my-1 px-1 text-[12.5px] text-fg-3">Could not show the files: {(item.tool.output ?? item.tool.error ?? '').replace(/^Nothing was shown\.\s*/, '').slice(0, 300)}</div>;
  }
  if (!cards.length) return null;
  return (
    <div data-tip="files-made" className={cx('tl-item my-1.5 grid gap-2', cards.length > 1 ? 'sm:grid-cols-2' : 'sm:max-w-[30rem]')}>
      {cards.map((c) => (
        <FileCard key={c.path} card={c} stat={done ? stats[c.path] : undefined} sessionKey={sessionKey} />
      ))}
    </div>
  );
}
