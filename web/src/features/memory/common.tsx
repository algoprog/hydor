// What the pieces of Settings → Memory share: the words for how a note is known and what happened to it, dates,
// a note's history, what a topic sums up, its end date, and loading lists of notes.
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MemoryBasis,
  MemoryHistoryRow,
  MemoryListEntry,
} from "@shared/memory";
import { Button, cx, inputCls, Throbber } from "../../components/ui";
import { api, patch } from "../../lib/api";
import { ago } from "../../lib/format";
import { go, sessionPath } from "../../lib/nav";
import { toastError } from "../../lib/store";
import { LOCALE } from "../../i18n/locale";
import { SOURCE, useMemory } from "./state";

export type HistoryRow = MemoryHistoryRow & { sessionTitle?: string };

export const ACTION: Record<MemoryHistoryRow["action"], string> = {
  added: "Added",
  updated: "Changed",
  deleted: "Deleted",
  restored: "Restored",
  expiry: "End date",
  basis: "How it is known",
};
/** How a note is known, in a note's facts and its history. */
export const BASIS: Record<MemoryBasis, string> = {
  user: "you said so",
  checked: "checked",
  inferred: "not checked yet",
};
export const BASIS_HINT: Record<MemoryBasis, string> = {
  user: "You said this to an agent, or wrote it here",
  checked:
    "An agent saw it hold (a test, a command, a file), or the tidy-up found a conversation that shows it",
  inferred:
    "An agent’s conclusion no one has confirmed yet: agents are told so, and the tidy-up checks these first",
};
/** What the server calls a session no longer listed. */
export const GONE = "A session that is gone";

export const when = (t: number) => new Date(t).toLocaleString(LOCALE);
export const dayOf = (t: number) =>
  new Date(t).toLocaleDateString(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year:
      new Date(t).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });
/** "3 Dec", with the year when it is not this one. */
export const shortDay = (t: number) =>
  new Date(t).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year:
      new Date(t).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });
/** A date input's value, and back: the end of that day, here. */
export const inputDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const endOfDay = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
};
export const reloadState = () =>
  useMemory
    .getState()
    .load()
    .catch(() => {});

/** "1 note", "12 notes". */
export const notesCount = (n: number) => (n === 1 ? "1 note" : `${n} notes`);

export function SessionLink({ k, title }: { k: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={() => go(sessionPath(k))}
      title={title ?? k}
      translate={title ? "no" : undefined}
      className="inline max-w-[16rem] truncate align-bottom text-fg-2 underline-offset-2 hover:text-fg hover:underline"
    >
      {title ?? "a session that is gone"}
    </button>
  );
}

/** A note's life, step by step: what happened, when, who did it, and what changed. */
export function HistoryList({ id }: { id: number }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const version = useMemory((s) => s.version);
  useEffect(() => {
    api<{ history: HistoryRow[] }>(`/api/memory/entries/${id}/history`)
      .then((r) => setRows(r.history))
      .catch(toastError);
  }, [id, version]);
  if (!rows) return <Throbber className="mt-2 text-fg-3" />;
  return (
    <ol className="mt-1.5 space-y-2 border-l-2 border-line pl-3">
      {rows.map((h) => (
        <li key={h.id} className="text-[12px] leading-snug text-fg-3">
          <div>
            <span className="font-medium text-fg-2">{ACTION[h.action]}</span>{" "}
            <span title={when(h.at)}>{ago(h.at)}</span> by {SOURCE[h.source]}
            {h.session && (
              <>
                {" "}
                in <SessionLink k={h.session} title={h.sessionTitle} />
              </>
            )}
            {h.why && <> · {h.why}</>}
          </div>
          {h.action === "updated" && (
            <div translate="no" className="mt-0.5 break-words">
              <span className="line-through decoration-fg-3/60">
                {h.before}
              </span>{" "}
              → <span className="text-fg-2">{h.after}</span>
            </div>
          )}
          {h.action === "expiry" && (
            <div className="mt-0.5">
              {h.after ? `Until ${dayOf(Date.parse(h.after))}` : "Taken away"}
            </div>
          )}
          {h.action === "basis" && (
            <div className="mt-0.5">
              {h.after && h.after in BASIS
                ? BASIS[h.after as MemoryBasis]
                : "Not said"}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** What a topic or profile sums up. */
export function Children({ id }: { id: number }) {
  const [list, setList] = useState<MemoryListEntry[] | null>(null);
  const version = useMemory((s) => s.version);
  useEffect(() => {
    api<{ entries: MemoryListEntry[] }>(`/api/memory/entries/${id}/children`)
      .then((r) => setList(r.entries))
      .catch(toastError);
  }, [id, version]);
  if (!list) return <Throbber className="mt-2 text-fg-3" />;
  if (!list.length)
    return (
      <div className="mt-1.5 text-[12px] text-fg-3">
        It sums up no notes kept now.
      </div>
    );
  return (
    <ul className="mt-1.5 space-y-1 border-l-2 border-line pl-3 text-[12.5px] leading-snug">
      {list.map((e) => (
        <li
          key={e.id}
          translate="no"
          className={cx(
            "break-words",
            e.status === "deleted"
              ? "text-fg-3 line-through decoration-fg-3/60"
              : "text-fg-2",
          )}
        >
          {e.text}
        </li>
      ))}
    </ul>
  );
}

/** Sets or takes away an entry's end date. */
export function EndDate({
  e,
  onDone,
}: {
  e: MemoryListEntry;
  onDone: () => void;
}) {
  const [v, setV] = useState(
    e.expiresAt ? inputDay(e.expiresAt) : inputDay(Date.now() + 7 * 86400_000),
  );
  const save = (expiresAt: number | null) =>
    patch(`/api/memory/entries/${e.id}`, { expiresAt })
      .then(onDone)
      .catch(toastError);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-fg-3">True until</span>
      <input
        type="date"
        value={v}
        min={inputDay(Date.now() + 86400_000)}
        onChange={(x) => setV(x.target.value)}
        className={cx(inputCls, "h-8 w-auto text-[13px]")}
      />
      <Button
        size="sm"
        variant="primary"
        disabled={!v}
        onClick={() => void save(endOfDay(v))}
      >
        Save
      </Button>
      {e.expiresAt && (
        <Button size="sm" variant="ghost" onClick={() => void save(null)}>
          No end date
        </Button>
      )}
    </div>
  );
}

/**
 * Notes from `/api/memory/entries` for some parameters (a search, a place, the deleted ones): loaded again when
 * memory changes, a search after a short pause, and only the latest request's answer shows (an earlier one can arrive after it).
 */
export function useEntryList(
  params: Record<string, string>,
  {
    enabled = true,
    debounce = false,
  }: { enabled?: boolean; debounce?: boolean } = {},
) {
  const version = useMemory((s) => s.version);
  const [list, setList] = useState<MemoryListEntry[] | null>(null);
  const latest = useRef(0);
  const qs = new URLSearchParams(params).toString();
  const load = useCallback(() => {
    const n = ++latest.current;
    api<{ entries: MemoryListEntry[] }>(`/api/memory/entries?${qs}`)
      .then((r) => n === latest.current && setList(r.entries))
      .catch(toastError);
  }, [qs]);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(load, debounce ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, version, enabled, debounce]);
  return { list: enabled ? list : null, load };
}
