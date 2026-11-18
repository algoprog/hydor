// The browser's keyboard shortcuts, in the right column (the ⋯ menu's Keyboard shortcuts): what each key does, by group.
// Only the keys the browser really answers: the page's own keys, the address bar's, and the ones your lists take.
import { Panel } from './Panel';
import { Kbd } from '../../components/ui';
import { MOD } from '../../lib/format';

type Shortcut = { label: string; keys: string[] };
type Group = { title: string; rows: Shortcut[] };

const isMac = MOD === '⌘';

const GROUPS: Group[] = [
  {
    title: 'Tabs',
    rows: [
      { label: 'New tab', keys: [`${MOD}T`] },
      { label: 'New private tab', keys: [isMac ? '⇧⌘N' : 'Ctrl+Shift+N'] },
      { label: 'Close tab', keys: [`${MOD}W`] },
      { label: 'Reopen the tab you closed', keys: [isMac ? '⇧⌘T' : 'Ctrl+Shift+T'] },
      { label: 'Next tab', keys: ['Ctrl+Tab'] },
      { label: 'Previous tab', keys: ['Ctrl+Shift+Tab'] },
      { label: 'Go to tab 1 to 8', keys: [`${MOD}1–8`] },
      { label: 'Go to the last tab', keys: [`${MOD}9`] },
      { label: 'Show or hide the tab column', keys: [`${MOD}B`] },
    ],
  },
  {
    title: 'Page',
    rows: [
      { label: 'Find in page', keys: [`${MOD}F`] },
      { label: 'Close the find bar', keys: ['Esc'] },
      { label: 'Reload', keys: [`${MOD}R`, 'F5'] },
      { label: 'Print', keys: [`${MOD}P`] },
      { label: 'Back', keys: isMac ? ['⌥←', '⌘['] : ['Alt+←'] },
      { label: 'Forward', keys: isMac ? ['⌥→', '⌘]'] : ['Alt+→'] },
      { label: 'Zoom in', keys: [`${MOD}+`] },
      { label: 'Zoom out', keys: [`${MOD}−`] },
      { label: 'Reset zoom', keys: [`${MOD}0`] },
    ],
  },
  {
    title: 'Address bar',
    rows: [
      { label: 'Go to the address bar', keys: [`${MOD}L`] },
      { label: 'Open what you typed, or the suggestion picked', keys: ['Enter'] },
      { label: 'Open it in a new tab', keys: [isMac ? '⌥Enter' : 'Alt+Enter', `${MOD}Enter`] },
      { label: 'Move through the suggestions', keys: ['↑', '↓'] },
      { label: 'Take the completion', keys: ['Tab', '→'] },
      { label: 'Forget a history suggestion', keys: ['Shift+Delete'] },
      { label: 'Close the suggestions', keys: ['Esc'] },
    ],
  },
  {
    title: 'Your lists',
    rows: [
      { label: 'Bookmark this page', keys: [`${MOD}D`] },
      { label: 'History', keys: [`${MOD}H`] },
      { label: 'Downloads', keys: [`${MOD}J`] },
      { label: 'Clear browsing data', keys: [isMac ? '⇧⌘⌫' : 'Ctrl+Shift+Delete'] },
    ],
  },
  {
    title: 'Agents',
    rows: [{ label: 'Leave an agent’s browser', keys: ['Esc'] }],
  },
];

/** The right column's list of keyboard shortcuts, grouped; the keys sit at the right of each label. */
export function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="Keyboard shortcuts" onClose={onClose}>
      <div className="pb-4">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <div className="px-4 pt-3 pb-1 text-[11.5px] font-medium text-fg-3">{g.title}</div>
            {g.rows.map((r) => (
              <div key={r.label} className="flex min-h-8 items-center gap-3 px-4 py-1 text-[13px] text-fg">
                <span className="min-w-0 flex-1">{r.label}</span>
                <span className="flex shrink-0 gap-1">
                  {r.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Panel>
  );
}
