// What the suggestions show over a terminal: the grey rest of the command after the cursor, and the
// Ctrl+Space list (see suggest.ts).
import { Bot, File, Folder, GitBranch, History, Play, Server, Sparkles, Target, TerminalSquare, type LucideIcon } from 'lucide-react';
import type { SuggestKind, SuggestView } from './suggest';
import { cx, Throbber } from '../../components/ui';

const KIND: Record<SuggestKind, { icon: LucideIcon; label: string }> = {
  history: { icon: History, label: 'earlier' },
  agent: { icon: Bot, label: 'an agent ran' },
  branch: { icon: GitBranch, label: 'branch' },
  script: { icon: Play, label: 'script' },
  target: { icon: Target, label: 'make target' },
  host: { icon: Server, label: 'ssh host' },
  dir: { icon: Folder, label: 'folder' },
  file: { icon: File, label: 'file' },
  subcommand: { icon: TerminalSquare, label: 'git command' },
  ask: { icon: Sparkles, label: '' },
  ai: { icon: Sparkles, label: '' },
};

export function TermSuggest({ view, font, onPick }: { view: SuggestView; font: { family: string; size: number }; onPick: (i: number) => void }) {
  const { ghost, menu } = view;
  return (
    <>
      {ghost && (
        <div
          aria-hidden
          data-ghost
          className="pointer-events-none absolute z-10 overflow-hidden whitespace-pre"
          style={{
            left: ghost.left,
            top: ghost.top,
            width: ghost.width,
            height: ghost.height,
            lineHeight: `${ghost.height}px`,
            fontFamily: font.family,
            fontSize: font.size,
            letterSpacing: ghost.letterSpacing,
            color: 'color-mix(in srgb, var(--term-fg) 42%, transparent)',
          }}
        >
          {ghost.text}
        </div>
      )}
      {menu && (
        <div
          role="listbox"
          aria-label="Command suggestions"
          // Keep the keyboard in the terminal: a click picks without taking focus.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-lg"
          style={{ left: menu.left, width: menu.width, top: menu.top, bottom: menu.bottom }}
        >
          {menu.items.map((s, i) => {
            const k = KIND[s.kind];
            const Icon = k.icon;
            return (
              <button
                key={`${s.kind}:${s.text}`}
                role="option"
                aria-selected={i === menu.sel}
                onClick={() => onPick(i)}
                className={cx('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left', i === menu.sel ? 'bg-bg-3' : 'hover:bg-bg-2')}
              >
                <Icon size={13} className={cx('mt-[3px] shrink-0', s.kind === 'ask' || s.kind === 'ai' ? 'text-accent' : 'text-fg-3')} />
                {s.kind === 'ask' ? (
                  <span className="min-w-0 flex-1 text-[12.5px] text-fg">
                    Write a command for “<span className="text-fg-2">{s.label}</span>”
                  </span>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] text-fg">{s.label}</span>
                    {s.why && <span className="block truncate text-[11.5px] text-fg-3">{s.why}</span>}
                  </span>
                )}
                {k.label && <span className="mt-[2px] shrink-0 text-[11px] text-fg-3">{k.label}</span>}
              </button>
            );
          })}
          {(menu.busy || menu.asking) && (
            <div className="flex items-center gap-2 px-2.5 py-2 text-[12.5px] text-fg-3">
              <Throbber /> {menu.asking && 'Writing a command…'}
            </div>
          )}
          {menu.error && <div className="px-2.5 py-2 text-[12.5px] text-err">{menu.error}</div>}
          {!menu.busy && !menu.asking && !menu.error && !menu.items.length && (
            <div className="px-2.5 py-2 text-[12.5px] text-fg-3">Nothing to suggest yet. Type a few letters, or describe a command in words.</div>
          )}
          <div className="hidden px-2.5 pt-1.5 pb-1 text-[11px] text-fg-3 md:block">↑↓ choose · Enter puts it on the line (it does not run) · Esc closes</div>
        </div>
      )}
    </>
  );
}
