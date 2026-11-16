// Settings for the native wiki; paths refer to the computer running Hydor.
import { useEffect, useRef, useState } from 'react';
import { Popover, Switch } from '../../components/ui';
import { api, post, put } from '../../lib/api';
import { machineId } from '../../lib/machine';
import { toastError } from '../../lib/store';
import { Group, Row } from '../settings/kit';
import { WikiMigration, type WikiMigrationAction, type WikiMigrationConflict, type WikiMigrationPreview } from './WikiMigration';
import { WikiFolderFinder } from './WikiFolderFinder';

interface WikiSettingsState {
  enabled: boolean;
  hubPath: string;
  projectPath: string;
  gitIgnore: boolean;
}
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
    <Group title="LLM Wiki" hint="Keep linked knowledge from your sources in your own wiki folders." actions={<a href="/guide/llm-wiki" className="text-[12px] text-accent hover:underline">Learn more</a>}>
      <Row label="LLM Wiki" control={<Switch label="LLM Wiki" on={settings.enabled} onChange={(enabled) => { setSettings((current) => current && { ...current, enabled }); save('enabled', enabled); }} />} />
      <Row label="Wiki hub folder" hint="An absolute path on the computer running Hydor.">
        <div className="flex gap-2">
          <input aria-label="Wiki hub folder" value={settings.hubPath} disabled={checking || !!migration} onChange={(e) => { const hubPath = e.target.value; setSettings((current) => current && { ...current, hubPath }); }} onBlur={(e) => { if (e.relatedTarget !== findRef.current) changeHub(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="min-w-0 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg" />
          <button ref={findRef} type="button" disabled={checking || !!migration} onClick={() => void browseHub()} className="shrink-0 rounded-lg border border-line bg-bg-2 px-3 py-2 text-sm text-fg hover:bg-bg-3 disabled:opacity-50">Browse</button>
        </div>
        <Popover anchor={findRef} open={finding} onClose={closeFinder} width={340}>
          <WikiFolderFinder anchor={findRef} onPick={pickHub} />
        </Popover>
        {backups && <div role="status" className="mt-2 space-y-1 text-[12px] text-fg-3"><div><span>Backup of the previous folder</span>: <span translate="no" className="break-all">{backups.sourceBackup}</span></div>{backups.targetBackup && <div><span>Backup of the new folder</span>: <span translate="no" className="break-all">{backups.targetBackup}</span></div>}</div>}
      </Row>
      <Row label="Project wiki folder" hint="Relative to each project folder; existing bindings take precedence.">
        <input aria-label="Project wiki folder" value={settings.projectPath} onChange={(e) => { const projectPath = e.target.value; setSettings((current) => current && { ...current, projectPath }); }} onBlur={(e) => save('projectPath', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg" />
      </Row>
      <Row label="Ignore project wikis in Git" hint="Already tracked files remain tracked." control={<Switch label="Ignore project wikis in Git" on={settings.gitIgnore} onChange={(gitIgnore) => { setSettings((current) => current && { ...current, gitIgnore }); save('gitIgnore', gitIgnore); }} />} />
      {migration && <WikiMigration preview={migration.preview} onCancel={cancelMigration} onApply={applyMigration} />}
    </Group>
  );
}
