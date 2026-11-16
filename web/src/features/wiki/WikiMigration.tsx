// Explicit choices for changing a wiki hub that already contains files.
import { useState } from 'react';
import { Button, Dialog } from '../../components/ui';

export interface WikiMigrationPreview {
  source: string;
  target: string;
  sourceFiles: number;
  targetFiles: number;
  conflicts: number;
  conflictPaths: string[];
  planToken: string;
  targetExists: boolean;
}

export type WikiMigrationAction = 'keep' | 'merge' | 'replace';
export type WikiMigrationConflict = 'source' | 'target' | 'oldest';

/** Present a reviewable file migration; no destructive choice is selected by default. */
export function WikiMigration({ preview, onCancel, onApply }: {
  preview: WikiMigrationPreview;
  onCancel: () => void;
  onApply: (action: WikiMigrationAction, conflict?: WikiMigrationConflict) => Promise<void>;
}) {
  const [action, setAction] = useState<WikiMigrationAction | ''>('');
  const [conflict, setConflict] = useState<WikiMigrationConflict | ''>('');
  const [busy, setBusy] = useState(false);
  const needsConflict = action === 'merge' && preview.conflicts > 0;
  const apply = async () => {
    if (!action || (needsConflict && !conflict) || busy) return;
    setBusy(true);
    try { await onApply(action, conflict || undefined); } finally { setBusy(false); }
  };
  const option = (value: WikiMigrationAction, label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3">
      <input type="radio" name="wiki-migration-action" checked={action === value} onChange={() => setAction(value)} disabled={busy} className="mt-1" />
      <span><span className="block font-medium text-fg">{label}</span><span className="mt-1 block text-fg-3">{hint}</span></span>
    </label>
  );
  return (
    <Dialog open onClose={() => { if (!busy) onCancel(); }} title="Move the wiki memory?" width={620}>
      <div className="space-y-4 text-[13.5px]">
        <p className="text-fg-3">The shared wiki already has files. Choose what happens to them when its folder changes.</p>
        <p className="text-fg-3">Pause other programs that write to either folder until the move is done.</p>
        <dl className="space-y-2 rounded-xl bg-bg-2 p-3">
          <div><dt className="font-medium">Current folder</dt><dd className="break-all text-fg-3" translate="no">{preview.source}</dd></div>
          <div><dt className="font-medium">New folder</dt><dd className="break-all text-fg-3" translate="no">{preview.target}</dd></div>
          <div><dt className="inline font-medium">Files in the current folder</dt>: <dd className="inline" translate="no">{preview.sourceFiles}</dd></div>
          <div><dt className="inline font-medium">Files in the new folder</dt>: <dd className="inline" translate="no">{preview.targetFiles}</dd></div>
          <div><dt className="inline font-medium">Conflicting paths</dt>: <dd className="inline" translate="no">{preview.conflicts}</dd></div>
        </dl>
        {preview.conflictPaths.length > 0 && <div>
          <p className="mb-2 font-medium">Files that need a conflict choice</p>
          <ul className="max-h-36 space-y-1 overflow-auto rounded-lg border border-line p-3 text-[12px] text-fg-3" translate="no">{preview.conflictPaths.map((file) => <li className="break-all" key={file}>{file}</li>)}</ul>
        </div>}
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="mb-2 font-medium">What should happen to the files?</legend>
          {option('keep', 'Use the new folder without moving files', 'The files in the current folder stay where they are.')}
          {option('merge', preview.targetFiles ? 'Combine and move the files' : 'Move the wiki files', preview.targetFiles ? 'Combine both folders into the new one. The old folder is not deleted: it is kept as a hidden backup beside it.' : 'Move the files to the new folder. The old folder is not deleted: it is kept as a hidden backup beside it.')}
          {preview.targetFiles > 0 && option('replace', 'Replace the files in the new folder', 'Use the current wiki in the new folder. Both old folders are kept as hidden backups beside them.')}
        </fieldset>
        {needsConflict && <fieldset className="space-y-2" disabled={busy}>
          <legend className="mb-2 font-medium">When a file exists in both folders</legend>
          {([
            ['source', 'Keep the version from the current folder'],
            ['target', 'Keep the version from the new folder'],
            ['oldest', 'Keep the older version'],
          ] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="radio" name="wiki-migration-conflict" value={value} checked={conflict === value} onChange={() => setConflict(value)} />{label}</label>)}
          {conflict === 'oldest' && <p className="text-fg-3">Age is determined by the file modification time.</p>}
        </fieldset>}
        {action && action !== 'keep' && <p className="text-fg-3">Nothing is lost: the old folder stays as a hidden backup beside the new one, and its path is shown after the move.</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button><Button variant="primary" disabled={!action || (needsConflict && !conflict) || busy} onClick={() => void apply()}>{busy ? 'Working…' : 'Continue'}</Button></div>
      </div>
    </Dialog>
  );
}
