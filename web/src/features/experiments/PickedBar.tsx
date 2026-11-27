// The bar under the Experiments page while runs are picked: compare them or make a table, and star, archive, stop or
// delete them together. On a phone these are a bottom sheet behind one button.
import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, ChevronUp, SlidersHorizontal, Square, Star, StarOff, Table2, Trash2, X } from 'lucide-react';
import type { RunFiles, RunRecord } from '@shared/experiments';
import { api, enc } from '../../lib/api';
import { tr } from '../../i18n/runtime';
import { toast, toastError } from '../../lib/store';
import { Button, IconButton, MenuItem, MenuSep, Popover, useConfirm, useMediaQuery } from '../../components/ui';
import { baseOf } from './api';
import { askDelete } from './DeleteRuns';
import { byMachine, markMany } from './marksApi';
import { useExperimentMarks } from './marksStore';
import { archivedSaid, bringBack, pickedActions } from './runList';

const on = (machine: string) => (machine ? { base: baseOf(machine)! } : {});

/** What these runs wrote into their own folders, all together; undefined when a machine does not say. */
async function filesOf(runs: RunRecord[]): Promise<RunFiles | undefined> {
  try {
    const all = await Promise.all(byMachine(runs).map(([machine, ids]) => api<{ folderFiles: RunFiles }>(`/api/experiments/run-files?runs=${ids.map(enc).join(',')}`, on(machine))));
    return {
      count: all.reduce((n, x) => n + x.folderFiles.count, 0),
      bytes: all.reduce((n, x) => n + x.folderFiles.bytes, 0),
      names: all.flatMap((x) => x.folderFiles.names).slice(0, 3),
    };
  } catch {
    return undefined;
  }
}

/** Deletes the records of these ended runs, through the window that asks first; `going`: how many picked ones are left. */
async function remove(runs: RunRecord[], going: number, done: () => void) {
  // A copy of a run another machine keeps: only the copy goes, as on its own page.
  const files = await filesOf(runs.filter((r) => !r.remote));
  askDelete({
    title: runs.length === 1 ? 'Delete this run’s record?' : `Delete ${runs.length} runs’ records?`,
    ...(going ? { lead: going === 1 ? '1 run still going or waiting is left: stop it first.' : `${going} runs still going or waiting are left: stop them first.` } : {}),
    many: runs.length > 1,
    files,
    ...(runs.every((r) => r.remote)
      ? { instead: tr('Their records here go. The runs, their logs and their files stay on the machines that ran them.') }
      : { stays: tr('What they wrote in the project’s folder stays.') }),
    remove: async (keep) => {
      let kept: string[] = [];
      try {
        for (const r of runs) {
          const x = await api<{ kept?: string }>(`/api/experiments/runs/${enc(r.id)}${keep ? '?files=keep' : ''}`, { method: 'DELETE', ...on(r.machine?.id ?? '') });
          if (x.kept) kept = [...kept, x.kept];
        }
      } finally {
        useExperimentMarks.getState().changed();
      }
      // Each run's files are in a folder of its own there: several are said by the folder they share.
      return kept.length ? { kept: kept.length > 1 ? kept[0].replace(/[\\/][^\\/]+$/, '') : kept[0] } : {};
    },
    done,
  });
}

export function PickedBar({ all, picked, count, remote, onCompare, onTable, onClear }: {
  /** Every run the page knows: what an action takes along is worked out from them. */
  all: RunRecord[];
  picked: RunRecord[];
  /** How many are ticked. */
  count: number;
  /** Some are another machine's: no table is made of those. */
  remote: boolean;
  onCompare: () => void;
  onTable: () => void;
  onClear: () => void;
}) {
  const phone = useMediaQuery('(max-width: 639px)');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();
  const a = pickedActions(all, picked);

  const star = () => void markMany(picked, { starred: !a.starred }).catch(toastError);
  const archive = async () => {
    try {
      if (a.archived) {
        await markMany(bringBack(all, picked), { archived: false });
        toast('Brought back');
      } else {
        const said = archivedSaid(all, picked);
        await markMany(a.ended, { archived: true });
        toast(said);
      }
      onClear();
    } catch (e) {
      toastError(e);
    }
  };
  const stop = async () => {
    const n = a.going.length;
    if (!(await confirm({ title: n === 1 ? 'Stop 1 run?' : `Stop ${n} runs?`, body: tr('Those running get Ctrl-C, then are stopped harder; those waiting leave the line. Their records and logs stay.'), confirm: 'Stop', danger: true }))) return;
    try {
      const { failed } = await markMany(a.going, { stop: true });
      if (failed.length) toast(failed[0]);
    } catch (e) {
      toastError(e);
    }
  };

  const actions = [
    { id: 'compare', label: 'Compare', icon: <SlidersHorizontal size={14} />, disabled: picked.length < 2, run: onCompare },
    { id: 'star', label: a.starred ? 'Unstar' : 'Star', icon: a.starred ? <StarOff size={14} /> : <Star size={14} />, disabled: !picked.length, run: star },
    { id: 'archive', label: a.archived ? 'Bring back' : 'Archive', icon: a.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />, disabled: !a.archived && !a.ended.length, run: () => void archive() },
    ...(a.going.length ? [{ id: 'stop', label: 'Stop', icon: <Square size={13} />, disabled: false, run: () => void stop() }] : []),
    { id: 'delete', label: 'Delete', icon: <Trash2 size={14} />, disabled: !a.ended.length, run: () => void remove(a.ended, a.going.length, onClear), danger: true },
  ];
  const noTable = !picked.length || remote;
  const tableWhy = remote ? 'Tables are made of this computer’s runs: open the other machine’s Experiments for its own' : undefined;

  return (
    <div className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-bg px-4 py-2.5 pb-[max(10px,var(--safe-bottom))]">
      <span className="text-[13px] text-fg-2">{count} picked</span>
      <span className="flex-1" />
      {phone ? (
        <>
          <Button ref={menuRef} size="sm" variant="secondary" icon={<ChevronUp size={14} />} onClick={() => setMenu((o) => !o)}>
            Actions
          </Button>
          <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={240} title="With the picked runs" sheet prefer="above">
            <MenuItem icon={<Table2 size={14} />} disabled={noTable} onClick={() => { setMenu(false); onTable(); }}>
              Make a table
            </MenuItem>
            {actions.map((x) => (
              <div key={x.id}>
                {x.id === 'delete' && <MenuSep />}
                <MenuItem
                  icon={x.icon}
                  danger={'danger' in x}
                  disabled={x.disabled}
                  onClick={() => {
                    setMenu(false);
                    x.run();
                  }}
                >
                  {x.label}
                </MenuItem>
              </div>
            ))}
          </Popover>
        </>
      ) : (
        <>
          {actions.map((x) => (
            <Button key={x.id} size="sm" variant={x.id === 'compare' ? 'secondary' : 'ghost'} icon={x.id === 'compare' ? undefined : x.icon} disabled={x.disabled} onClick={x.run}>
              {x.label}
            </Button>
          ))}
          <Button size="sm" variant="primary" disabled={noTable} title={tableWhy} onClick={onTable}>
            Make a table
          </Button>
        </>
      )}
      <IconButton label="Pick none" size="sm" onClick={onClear}>
        <X size={15} />
      </IconButton>
      {confirmNode}
    </div>
  );
}
