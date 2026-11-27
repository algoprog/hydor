// The question before runs are deleted (a run, an evaluation, a score, an evolution): what goes with their records,
// the files they wrote into their own run folders among it, and, when those are large, Keep those files, which moves
// them aside first and then says where they went. It lives on the page itself (DeleteRunsDialog), so it stays while
// the view that asked goes away with what it showed.
import { create } from 'zustand';
import { KEEP_OFFER_BYTES, type RunFiles } from '@shared/experiments';
import { tr } from '../../i18n/runtime';
import { api } from '../../lib/api';
import { bytes } from '../../lib/format';
import { toastError } from '../../lib/store';
import { Button, Dialog } from '../../components/ui';

export interface DeleteAsk {
  title: string;
  /** What goes besides the runs, said first. */
  lead?: string;
  /** One run, or the runs behind an evaluation, a score or an evolution. */
  many?: boolean;
  /** What their own folders hold; absent when the server does not say (an older one on another machine). */
  files?: RunFiles;
  /** Said instead of all that about the runs: a run kept on another machine, whose files stay there. */
  instead?: string;
  /** What stays, said last. */
  stays?: string;
  /** Deletes; `keep`: their files are moved aside first. Gives where they went. */
  remove: (keep: boolean) => Promise<{ kept?: string } | void | undefined>;
  done?: () => void;
}

interface State {
  ask: DeleteAsk | null;
  /** Where the files kept went, once deleted. */
  kept: { path: string; many: boolean } | null;
  busy: boolean;
}

const useDelete = create<State>(() => ({ ask: null, kept: null, busy: false }));

export const askDelete = (ask: DeleteAsk) => useDelete.setState({ ask, kept: null, busy: false });

/** What the runs behind an evaluation, a score or an evolution wrote into their own folders. */
export const runFilesOf = (query: string) => api<{ folderFiles: RunFiles }>(`/api/experiments/run-files?${query}`).then((r) => r.folderFiles);

/** The sentence about the runs themselves: their record and log, and what they wrote into their own folders. */
export function goesWords(many: boolean, files: RunFiles | undefined): string {
  if (!files) return tr(many ? 'Their records, their logs and their own run folders go, with anything written there.' : 'Its record, its log and its own run folder go, with anything it wrote there.');
  if (!files.count) return tr(many ? 'Their records and their logs go.' : 'Its record and its log go.');
  const size = bytes(files.bytes);
  if (files.count === 1)
    return tr(many ? 'Their records and their logs go, and the file written into their own run folders ({0}):' : 'Its record and its log go, and the file it wrote into its own run folder ({0}):').replace('{0}', size);
  return tr(many ? 'Their records and their logs go, and the {0} files written into their own run folders ({1}):' : 'Its record and its log go, and the {0} files it wrote into its own run folder ({1}):')
    .replace('{0}', String(files.count))
    .replace('{1}', size);
}

export function DeleteRunsDialog() {
  const { ask, kept, busy } = useDelete();
  const close = () => useDelete.setState({ ask: null, kept: null, busy: false });
  const go = async (keep: boolean) => {
    if (!ask) return;
    useDelete.setState({ busy: true });
    try {
      const r = await ask.remove(keep);
      if (r?.kept) useDelete.setState({ ask: null, kept: { path: r.kept, many: !!ask.many }, busy: false });
      else close();
      ask.done?.();
    } catch (e) {
      toastError(e);
      useDelete.setState({ busy: false });
    }
  };
  const files = ask?.files;
  return (
    <Dialog
      open={!!ask || !!kept}
      onClose={close}
      title={kept ? 'The files are kept' : ask?.title}
      width={440}
      footer={
        kept ? (
          <Button variant="primary" onClick={close} autoFocus>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {!ask?.instead && !!files && files.bytes > KEEP_OFFER_BYTES && (
              <Button variant="secondary" disabled={busy} onClick={() => void go(true)}>
                Keep those files
              </Button>
            )}
            <Button variant="danger" disabled={busy} onClick={() => void go(false)} autoFocus>
              Delete
            </Button>
          </>
        )
      }
    >
      <div className="space-y-2 text-[14px] leading-relaxed text-fg-2">
        {kept ? (
          <>
            <p>{tr(kept.many ? 'The records are deleted. What the runs wrote into their own folders is now in:' : 'The record is deleted. What the run wrote into its own folder is now in:')}</p>
            <p translate="no" className="font-mono text-[12.5px] break-words text-fg select-all">
              {kept.path}
            </p>
          </>
        ) : ask ? (
          <>
            {ask.lead && <p>{ask.lead}</p>}
            {ask.instead ? (
              <p>{ask.instead}</p>
            ) : (
              <>
                <p>{goesWords(!!ask.many, files)}</p>
                {!!files?.count && (
                  <p translate="no" className="font-mono text-[12.5px] break-words text-fg">
                    {`${files.names.join(', ')}${files.count > files.names.length ? ', …' : ''}`}
                  </p>
                )}
              </>
            )}
            {ask.stays && <p>{ask.stays}</p>}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
