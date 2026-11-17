// Settings → Memory → Wiki memory: on for every project unless its own settings say otherwise, learning from new
// documents, where the shared wiki and the project wikis are kept (paths refer to the computer running Hydor).
import { useEffect, useRef, useState } from 'react';
import type { WikiMemorySettings } from '@shared/wiki';
import { Popover, Segmented, Switch } from '../../components/ui';
import { api, post, put } from '../../lib/api';
import { machineId } from '../../lib/machine';
import { toastError } from '../../lib/store';
import { Group, Row } from '../settings/kit';
import { DocumentLimit } from './DocumentLimit';
import { WikiMigration, type WikiMigrationAction, type WikiMigrationConflict, type WikiMigrationPreview } from './WikiMigration';
import { WikiFolderFinder } from './WikiFolderFinder';

type WikiSettingsState = WikiMemorySettings;
type WikiMigrationResult = WikiSettingsState & { migration?: { sourceBackup: string; targetBackup: string | null } };

/** Configure wiki defaults and review changes that may move existing files. */
export function WikiSettings() {
  const [settings, setSettings] = useState<WikiSettingsState | null>(null);
  const saved = useRef<WikiSettingsState | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [migration, setMigration] = useState<{ preview: WikiMigrationPreview; requested: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [backups, setBackups] = useState<WikiMigrationResult['migration']>();
  const [finding, setFinding] = useState(false);
  const findRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    api<WikiSettingsState>('/api/wiki/settings').then((value) => { saved.current = value; setSettings(value); }).catch(toastError);
  }, []);
  /** Serialize individual changes so rapid edits cannot overwrite each other. */
  const save = <K extends keyof WikiSettingsState>(key: K, value: WikiSettingsState[K]) => {
    queue.current = queue.current.then(async () => {
      if (saved.current?.[key] === value) return;
      try {
        const result = await put<WikiSettingsState>('/api/wiki/settings', { [key]: value });
        if (saved.current) saved.current = { ...saved.current, [key]: result[key] };
        setSettings((current) => current && current[key] === value ? { ...current, [key]: result[key] } : current);
      } catch (error) {
        toastError(error);
        setSettings((current) => current && current[key] === value && saved.current ? { ...current, [key]: saved.current[key] } : current);
      }
    });
  };
  /** A hub change is previewed first; existing wiki files require an explicit choice. */
  const changeHub = (hubPath: string) => {
    setChecking(true);
    queue.current = queue.current.then(async () => {
      try {
        if (saved.current?.hubPath === hubPath) return;
        setBackups(undefined);
        const preview = await post<WikiMigrationPreview>('/api/wiki/migration/preview', { hubPath });
        if (preview.sourceFiles > 0) {
          setMigration({ preview, requested: hubPath });
          return;
        }
        const result = await post<WikiSettingsState>('/api/wiki/migration/apply', { hubPath, planToken: preview.planToken, action: 'keep' });
        if (saved.current) saved.current = { ...saved.current, hubPath: result.hubPath };
        setSettings((current) => current && current.hubPath === hubPath ? { ...current, hubPath: result.hubPath } : current);
      } catch (error) {
        toastError(error);
        setSettings((current) => current && current.hubPath === hubPath && saved.current ? { ...current, hubPath: saved.current.hubPath } : current);
      } finally { setChecking(false); }
    });
  };
  /** A picked path follows the same review and migration flow as a typed path. */
  const pickHub = (hubPath: string) => {
    setFinding(false);
    setSettings((current) => current && { ...current, hubPath });
    changeHub(hubPath);
  };
  /** Closing the chooser leaves the last saved location in the field. */
  const closeFinder = () => {
    setFinding(false);
    if (saved.current) setSettings((current) => current && { ...current, hubPath: saved.current!.hubPath });
  };
  /** A native dialog is available only for the local desktop's own machine. */
  const browseHub = async () => {
    const desktop = (window as unknown as { hydorDesktop?: { chooseFolder?: (current: string) => Promise<string | null> } }).hydorDesktop;
    if (!machineId && desktop?.chooseFolder) {
      try {
        const selected = await desktop.chooseFolder(saved.current?.hubPath ?? '');
        if (selected) pickHub(selected);
        else closeFinder();
      } catch (error) { closeFinder(); toastError(error); }
    } else setFinding(true);
  };
  const cancelMigration = () => {
    if (saved.current) setSettings((current) => current && { ...current, hubPath: saved.current!.hubPath });
    setMigration(null);
  };
  const applyMigration = async (action: WikiMigrationAction, conflict?: WikiMigrationConflict) => {
    if (!migration) return;
    try {
      const result = await post<WikiMigrationResult>('/api/wiki/migration/apply', { hubPath: migration.requested, planToken: migration.preview.planToken, action, ...(conflict ? { conflict } : {}) });
      if (saved.current) saved.current = { ...saved.current, hubPath: result.hubPath };
      setSettings((current) => current && { ...current, hubPath: result.hubPath });
      setBackups(result.migration);
      setMigration(null);
    } catch (error) {
      toastError(error);
      cancelMigration();
    }
  };
  if (!settings) return null;
  return (
    <Group title="Wiki memory" hint="Articles agents keep for each project, from its documents and its work." actions={<a href="/guide/wiki-memory" className="text-[12px] text-accent hover:underline">Learn more</a>}>
      <Row label="Wiki memory" hint="On for every project unless its own settings say otherwise." control={<Switch label="Wiki memory" on={settings.enabled} onChange={(enabled) => { setSettings((current) => current && { ...current, enabled }); save('enabled', enabled); }} />} />
      <Row label="Learn from new documents" hint="New and changed documents add memory notes and update the wiki, with the helper model." control={<Switch label="Learn from new documents" on={settings.fromDocuments} onChange={(fromDocuments) => { setSettings((current) => current && { ...current, fromDocuments }); save('fromDocuments', fromDocuments); }} />} />
      <Row label="Most documents to read into the wiki" hint="A project with more documents than this keeps them out of its wiki: agents search them instead." control={<DocumentLimit label="Most documents to read into the wiki" value={settings.documentLimit} onCommit={(documentLimit) => { setSettings((current) => current && { ...current, documentLimit }); save('documentLimit', documentLimit); }} />} />
      <Row label="Wiki folder" hint="Where the shared wiki is kept, and project wikis unless set below. An absolute path on the computer running Hydor.">
        <div className="flex gap-2">
          <input aria-label="Wiki folder" translate="no" value={settings.hubPath} disabled={checking || !!migration} onChange={(e) => { const hubPath = e.target.value; setSettings((current) => current && { ...current, hubPath }); }} onBlur={(e) => { if (e.relatedTarget !== findRef.current) changeHub(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="min-w-0 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg" />
          <button ref={findRef} type="button" disabled={checking || !!migration} onClick={() => void browseHub()} className="shrink-0 rounded-lg border border-line bg-bg-2 px-3 py-2 text-sm text-fg hover:bg-bg-3 disabled:opacity-50">Browse</button>
        </div>
        <Popover anchor={findRef} open={finding} onClose={closeFinder} width={340}>
          <WikiFolderFinder anchor={findRef} onPick={pickHub} />
        </Popover>
        {backups && <div role="status" className="mt-2 space-y-1 text-[12px] text-fg-3"><div>The old folder is kept as a hidden backup beside the new one.</div><div><span>Backup of the previous folder</span>: <span translate="no" className="break-all">{backups.sourceBackup}</span></div>{backups.targetBackup && <div><span>Backup of the replaced folder</span>: <span translate="no" className="break-all">{backups.targetBackup}</span></div>}</div>}
      </Row>
      <Row label="Project wikis" hint="Where each project's wiki is kept. In the wiki folder, nothing is written into your project folders.">
        <Segmented size="sm" value={settings.projectWikis} onChange={(projectWikis) => { setSettings((current) => current && { ...current, projectWikis }); save('projectWikis', projectWikis); }} options={[{ value: 'hub', label: 'In the wiki folder' }, { value: 'folder', label: 'In each project’s folder' }]} />
      </Row>
      {settings.projectWikis === 'folder' && <>
        <Row label="Folder inside each project" hint="Relative to the project's folder. A project whose AGENTS.md names a wiki folder uses that one.">
          <input aria-label="Folder inside each project" translate="no" value={settings.projectPath} onChange={(e) => { const projectPath = e.target.value; setSettings((current) => current && { ...current, projectPath }); }} onBlur={(e) => save('projectPath', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg" />
        </Row>
        <Row label="Leave it out of Git" hint="Adds it to the project's .gitignore, in Git repositories only." control={<Switch label="Leave it out of Git" on={settings.gitIgnore} onChange={(gitIgnore) => { setSettings((current) => current && { ...current, gitIgnore }); save('gitIgnore', gitIgnore); }} />} />
      </>}
      {migration && <WikiMigration preview={migration.preview} onCancel={cancelMigration} onApply={applyMigration} />}
    </Group>
  );
}
