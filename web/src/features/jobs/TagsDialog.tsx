// A job's tags, changed: typed with commas between them, or picked from those in use. A `job` job keeps its own; for
// other work they are its session's.
import { useState } from 'react';
import { MAX_TAGS, normalTags, type JobEntry, type JobTag, type JobTagsSet } from '@shared/jobs';
import { enc, put } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Button, Dialog, inputCls } from '../../components/ui';
import { Chip } from '../spaces/memory/ui';
import { loadJobs } from './store';
import { TagDot } from './TagPill';

/** How many of the tags in use are offered. */
const OFFERED = 16;

/** Everything typed, as tags, however many: the dialog says when they are too many. */
const typed = (text: string) => [...new Set(text.split(',').flatMap((piece) => normalTags(piece)))];

export function TagsDialog({ job, inUse, onClose }: { job: JobEntry; inUse: JobTag[]; onClose: () => void }) {
  const [text, setText] = useState(() => (job.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const picked = typed(text);
  const own = job.tagsFrom === 'own' || job.id.startsWith('job:');

  const toggle = (name: string) => setText((picked.includes(name) ? picked.filter((t) => t !== name) : [...picked, name]).join(', '));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body: JobTagsSet = { tags: normalTags(text) };
      await put(`/api/jobs/${enc(job.id)}/tags`, body);
      await loadJobs();
      onClose();
    } catch (e) {
      toastError(e);
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit tags"
      width={440}
      part="jobs"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div translate="no" className="mb-2 truncate text-[13px] font-medium text-fg">
        {job.name}
      </div>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) void save();
        }}
        aria-label="Tags, with commas between them"
        placeholder="Tags, with commas between them"
        autoCapitalize="none"
        spellCheck={false}
        className={inputCls}
      />
      <p className={picked.length > MAX_TAGS ? 'mt-1.5 text-[12px] text-warn' : 'mt-1.5 text-[12px] text-fg-3'}>Up to 3 tags. The first one says where it is listed.</p>
      {inUse.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11.5px] font-medium text-fg-3">Tags in use</div>
          <div className="flex flex-wrap gap-1.5">
            {inUse.slice(0, OFFERED).map((t) => (
              <Chip key={t.name} small on={picked.includes(t.name)} onClick={() => toggle(t.name)}>
                <TagDot tag={t.name} className="!h-1.5 !w-1.5" />
                <span translate="no">{t.name}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}
      <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">
        {own ? "These tags are this job's own." : "These tags are its session's: they apply to all of that session's work without tags of its own."}
      </p>
    </Dialog>
  );
}
