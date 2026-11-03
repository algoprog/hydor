// Messages waiting to go out when the running turn ends. Drag one by its handle to change the
// order; edit one to change its text or its attachments (take some off, add more).
import { useEffect, useRef, useState } from 'react';
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CornerDownLeft, FileText, GripVertical, Paperclip, Pencil, Play, Trash2, X } from 'lucide-react';
import { childReplyOf } from '@shared/children';
import type { QueuedAttachment, QueuedMessage, SessionSummary } from '@shared/types';
import { enc, post } from '../../lib/api';
import { attachmentPayload, dropSentPictures, queuedPicturesOf, readAttachments, releaseAttachments, useSentPictures, type Attachment, type SentPictures } from '../../lib/attachments';
import { toast, toastError } from '../../lib/store';
import { AttachmentList } from '../../components/Attachments';
import { openLightbox } from '../../components/Lightbox';
import { Button, cx } from '../../components/ui';
import { ChildReplyLabel } from '../children/ChildReply';
import { mu } from '../../lib/machine';
import { AreaTouchSensor, touchDragArea } from '../../lib/dragTouch';

/** Rows move up and down only. */
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });
// Made once: new settings on each render would hand every row new drag handlers.
const MOUSE = { activationConstraint: { distance: 4 } };
const TOUCH = { activationConstraint: { delay: 180, tolerance: 6 } };
const KEYS = { coordinateGetter: sortableKeyboardCoordinates };

/** A picture sent from this page shows from here (`sent`, lib/attachments.ts); the rest come from the server. */
const attUrl = (key: string, m: QueuedMessage, a: QueuedAttachment, sent?: SentPictures) =>
  (a.image && sent?.urls[Number(a.ref.slice(4))]) || mu(`/api/sessions/${enc(key)}/queue/${enc(m.id)}/attachment?ref=${encodeURIComponent(a.ref)}`);

function showImages(key: string, m: QueuedMessage, a: QueuedAttachment, sent?: SentPictures) {
  const imgs = (m.att ?? []).filter((x) => x.image);
  openLightbox(
    imgs.map((x) => ({ src: attUrl(key, m, x, sent), name: x.name })),
    imgs.indexOf(a),
  );
}

/** An attachment of a waiting message: a thumbnail (opens large) or the file's name. */
function Chip({ sessionKey, m, a, sent, big, onRemove }: { sessionKey: string; m: QueuedMessage; a: QueuedAttachment; sent?: SentPictures; big?: boolean; onRemove?: () => void }) {
  const remove = onRemove && (
    <button type="button" className="absolute -top-1.5 -right-1.5 rounded-full bg-fg p-0.5 text-bg" onClick={onRemove} aria-label={`Remove ${a.name}`}>
      <X size={10} />
    </button>
  );
  if (a.image)
    return (
      <span className="relative">
        <button type="button" onClick={() => showImages(sessionKey, m, a, sent)} className="block cursor-zoom-in" aria-label={`Show ${a.name} large`}>
          <img src={attUrl(sessionKey, m, a, sent)} alt={a.name} className={cx('rounded-lg border border-line object-cover', big ? 'h-14 w-14' : 'h-9 w-9')} />
        </button>
        {remove}
      </span>
    );
  return (
    <span className={cx('relative flex max-w-[220px] items-center gap-1.5 rounded-lg border border-line bg-bg-1 px-2 text-[12px] text-fg-2', big ? 'h-14 pr-3' : 'h-7')} title={a.name}>
      <FileText size={big ? 16 : 13} className="shrink-0 text-fg-3" />
      <span className="truncate">{a.name}</span>
      {remove}
    </span>
  );
}

function QueueRow({ s, m, n, sent, onEdit }: { s: SessionSummary; m: QueuedMessage; n: number; sent?: SentPictures; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const call = (path: string, then?: () => void) => post(`/api/sessions/${enc(s.key)}/queue/${enc(m.id)}${path}`).then(then, toastError);
  const reply = childReplyOf(m.text);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx(
        'group/q flex items-start gap-1.5 rounded-xl border py-2 pr-2 pl-1',
        isDragging ? 'relative z-10 border-line-2 bg-elevated shadow-lg' : 'border-dashed border-line-2 bg-panel/60',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="mt-px shrink-0 cursor-grab touch-none rounded p-0.5 text-fg-3 transition-colors hover:text-fg active:cursor-grabbing"
        aria-label="Drag to change the order"
        title="Drag to change the order"
      >
        <GripVertical size={14} />
      </button>
      <span className="tnum mt-0.5 w-3 shrink-0 text-[11px] text-fg-3">{n}</span>
      <div className="min-w-0 flex-1">
        {m.text && <div className="line-clamp-2 text-[13.5px] leading-snug whitespace-pre-wrap text-fg-2">{reply ? <ChildReplyLabel reply={reply} /> : m.text}</div>}
        {m.att && (
          <div className={cx('flex flex-wrap gap-1.5', m.text && 'mt-1.5')}>
            {m.att.map((a) => (
              <Chip key={a.ref} sessionKey={s.key} m={m} a={a} sent={sent} />
            ))}
          </div>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover/q:opacity-100">
        <button title="Send now, into the running turn" onClick={() => call('/send')} className="rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg">
          <CornerDownLeft size={13} />
        </button>
        <button title="Edit the text and attachments" onClick={onEdit} className="rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg">
          <Pencil size={13} />
        </button>
        <button title="Remove" onClick={() => call('/delete', () => sent && dropSentPictures(s.key, sent.id))} className="rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-err">
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  );
}

/** A waiting message opened for changes: its text, what stays attached, and new files. */
function QueueEditor({ s, m, sent, onDone }: { s: SessionSummary; m: QueuedMessage; sent?: SentPictures; onDone: () => void }) {
  const { setNodeRef, transform, transition } = useSortable({ id: m.id, disabled: true });
  const [text, setText] = useState(m.text);
  const [keep, setKeep] = useState<string[]>(() => (m.att ?? []).map((a) => a.ref));
  const [added, setAdded] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addedRef = useRef(added);
  addedRef.current = added;
  useEffect(() => () => releaseAttachments(addedRef.current), []);
  const add = async (files: FileList | File[]) => {
    const more = await readAttachments(files, added);
    setAdded((l) => [...l, ...more]);
  };
  const kept = (m.att ?? []).filter((a) => keep.includes(a.ref));
  const save = async () => {
    if (!text.trim() && !kept.length && !added.length) return toast('A message needs some text or an attachment', 'error');
    setBusy(true);
    try {
      await post(`/api/sessions/${enc(s.key)}/queue/${enc(m.id)}/edit`, { text, keep, ...attachmentPayload(added) });
      // What it carries now comes from the server.
      if (sent) dropSentPictures(s.key, sent.id);
      onDone();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="rounded-xl border border-accent/45 bg-panel p-2.5 shadow-[0_0_0_3px_var(--accent-soft)]"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        add(e.dataTransfer.files);
      }}
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone();
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
          }
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (!files.length) return;
          e.preventDefault();
          add(files);
        }}
        placeholder="Message"
        className="min-h-[52px] w-full resize-y bg-transparent px-1 text-[13.5px] leading-snug outline-none placeholder:text-fg-3"
      />
      {(kept.length > 0 || added.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-2 px-1">
          {kept.map((a) => (
            <Chip key={a.ref} sessionKey={s.key} m={m} a={a} sent={sent} big onRemove={() => setKeep((k) => k.filter((x) => x !== a.ref))} />
          ))}
          <AttachmentList
            items={added}
            onRemove={(a) => {
              releaseAttachments([a]);
              setAdded((l) => l.filter((x) => x !== a));
            }}
          />
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <Button size="sm" variant="ghost" icon={<Paperclip size={14} />} onClick={() => fileRef.current?.click()}>
          Attach
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={async (e) => {
            if (e.target.files) await add(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="hidden text-[11.5px] text-fg-3 sm:inline">or paste or drop files here</span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function QueueList({ s }: { s: SessionSummary }) {
  const server = s.queue ?? [];
  const ids = server.map((m) => m.id).join(',');
  // A dragged order shows at once; the server's copy replaces it when it arrives.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => setOrder(null), [ids]);
  const [editing, setEditing] = useState<string | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, MOUSE), useSensor(AreaTouchSensor, TOUCH), useSensor(KeyboardSensor, KEYS));
  const sentList = useSentPictures((x) => x.byKey[s.key]);
  const list = order ? order.map((id) => server.find((m) => m.id === id)).filter((m): m is QueuedMessage => !!m) : server;
  if (!list.length) return null;
  const sent = queuedPicturesOf(sentList, server);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const cur = list.map((m) => m.id);
    const next = arrayMove(cur, cur.indexOf(String(active.id)), cur.indexOf(String(over.id)));
    setOrder(next);
    post(`/api/sessions/${enc(s.key)}/queue/order`, { ids: next }).catch((e) => {
      setOrder(null);
      toastError(e);
    });
  };
  return (
    <div ref={touchDragArea} data-tip="queue" className="mb-2 space-y-1.5">
      {s.queueHeld && (
        <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-1.5 text-[12.5px]">
          <span className="min-w-0 flex-1">The queue is paused (the agent was stopped, or the server restarted).</span>
          <button onClick={() => post(`/api/sessions/${enc(s.key)}/queue/resume`).catch(toastError)} className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:underline">
            <Play size={12} /> Resume
          </button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[vertical]} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          {list.map((m, i) =>
            editing === m.id ? (
              <QueueEditor key={m.id} s={s} m={m} sent={sent.get(m.id)} onDone={() => setEditing(null)} />
            ) : (
              <QueueRow key={m.id} s={s} m={m} n={i + 1} sent={sent.get(m.id)} onEdit={() => setEditing(m.id)} />
            ),
          )}
        </SortableContext>
      </DndContext>
    </div>
  );
}
