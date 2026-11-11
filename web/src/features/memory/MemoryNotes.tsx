// Settings → Memory → Notes: an index of the places notes are kept in (about you, each project, the sessions',
// the notes no agent needed lately, the deleted ones) or, while you search, the notes found; a place opens as a
// page of its own inside the section (it is in the address, so Back closes it) with its notes, and a note opens whole.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArchiveRestore,
  Check,
  ChevronDown,
  FolderGit2,
  Hourglass,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { MemoryKind, MemoryListEntry, MemoryScope } from "@shared/memory";
import { isUserProfile } from "@shared/memory";
import {
  Badge,
  Button,
  cx,
  Dialog,
  IconButton,
  OptionRow,
  Popover,
  Throbber,
} from "../../components/ui";
import { api, del, post } from "../../lib/api";
import { ago, tildify } from "../../lib/format";
import { go } from "../../lib/nav";
import { toast, toastError, useApp } from "../../lib/store";
import { EmptyRow, Group, Row, SubHeader } from "../settings/kit";
import {
  dayOf,
  GONE,
  notesCount,
  reloadState,
  shortDay,
  useEntryList,
} from "./common";
import { NoteDialog } from "./NoteDialog";
import { EntryEditor } from "./parts";
import { folderName, useMemory, useMemoryState } from "./state";

/** A place a page of notes shows: about you, a project (by its folder), the sessions', or the two lists to review. */
export type Place =
  | { kind: "global" | "session" | "stale" | "deleted" }
  | { kind: "repo"; key: string };

const PAGE = 20;
const FIRST_PROJECTS = 5;
/** A place's profile first, then its topics, then its notes. */
const KIND_ORDER: Record<MemoryKind, number> = {
  profile: 0,
  topic: 1,
  note: 2,
};

/** The address of the section showing a place, or the index. */
export const placeUrl = (p?: Place) =>
  `/settings?s=memory${p ? `&notes=${p.kind === "repo" ? `repo:${encodeURIComponent(p.key)}` : p.kind}` : ""}`;

/** The place an address names (its `notes` parameter, already decoded), or none. */
export function parsePlace(v: string | null): Place | null {
  if (!v) return null;
  if (v === "global" || v === "session" || v === "stale" || v === "deleted")
    return { kind: v };
  if (v.startsWith("repo:") && v.length > 5)
    return { kind: "repo", key: v.slice(5) };
  return null;
}

/** Whether the place was opened from the index (so Back goes back a step) rather than by an address. */
let fromIndex = false;
export function openPlace(p: Place) {
  fromIndex = true;
  go(placeUrl(p));
}
export function closePlace() {
  if (fromIndex) history.back();
  else go(placeUrl(), true);
  fromIndex = false;
}

/** A search box across the top of a group's box: no border of its own. */
function SearchRow({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4">
      <Search size={15} className="shrink-0 text-fg-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
      />
      {value && (
        <IconButton size="sm" label="Clear" onClick={() => onChange("")}>
          <X size={14} />
        </IconButton>
      )}
    </div>
  );
}

function ShowMore({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-[13px] text-fg-3 transition-colors last:rounded-b-[11px] hover:bg-bg-1 hover:text-fg"
    >
      {children}
      <ChevronDown size={14} />
    </button>
  );
}

/** A note: its text (two lines), what kind it is, and one quiet line of facts; a click opens it whole. */
function NoteRow({
  e,
  showPlace,
  stale,
  onOpen,
  reload,
}: {
  e: MemoryListEntry;
  showPlace: boolean;
  stale: boolean;
  onOpen: () => void;
  reload: () => void;
}) {
  const deleted = e.status === "deleted";
  const facts: ReactNode[] = [];
  if (showPlace)
    facts.push(
      e.scope === "global" ? (
        <span>About you</span>
      ) : (
        <span translate="no">
          {e.scope === "repo"
            ? folderName(e.scopeKey)
            : e.scopeLabel === GONE
              ? "A session that is gone"
              : e.scopeLabel}
        </span>
      ),
    );
  facts.push(
    <span title={dayOf(e.updatedAt)}>
      {deleted
        ? `Deleted ${ago(e.updatedAt)}`
        : e.updatedAt !== e.createdAt
          ? `Changed ${ago(e.updatedAt)}`
          : `Added ${ago(e.createdAt)}`}
    </span>,
  );
  if (e.basis === "inferred" && !deleted)
    facts.push(<span className="text-fg-2">not checked yet</span>);
  if (e.uses > 0)
    facts.push(
      <span>{e.uses === 1 ? "needed once" : `needed ${e.uses} times`}</span>,
    );
  if (e.expiresAt && !deleted)
    facts.push(
      <span className="text-fg-2">{`until ${shortDay(e.expiresAt)}`}</span>,
    );
  const act = (p: Promise<unknown>) => p.then(reload).catch(toastError);
  return (
    <div className="flex flex-wrap items-center transition-colors hover:bg-bg-1 first:rounded-t-[11px] last:rounded-b-[11px]">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-[min(100%,14rem)] flex-1 px-4 py-3 text-left outline-none first:rounded-t-[11px] focus-visible:bg-bg-1"
      >
        <div
          className={cx(
            "line-clamp-2 text-[13.5px] leading-snug break-words",
            deleted ? "text-fg-3" : "text-fg",
          )}
        >
          {e.kind !== "note" && (
            <Badge tone="info" className="mr-1.5 align-[1px]">
              {e.kind === "topic" ? "Topic" : "Profile"}
            </Badge>
          )}
          <span translate="no">{e.text}</span>
        </div>
        <div className="mt-1 text-[12px] leading-snug text-fg-3">
          {facts.map((f, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {f}
            </span>
          ))}
        </div>
      </button>
      {(stale || deleted) && (
        <div className="flex shrink-0 items-center gap-1.5 px-4 pb-3 sm:pr-3 sm:pb-0 sm:pl-0">
          {deleted ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<ArchiveRestore size={14} />}
              onClick={() =>
                act(
                  post(`/api/memory/entries/${e.id}/restore`).then(() =>
                    toast("Restored"),
                  ),
                )
              }
            >
              Restore
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                icon={<Check size={14} />}
                onClick={() =>
                  act(
                    post(`/api/memory/entries/${e.id}/keep`).then(() =>
                      toast("Kept"),
                    ),
                  )
                }
              >
                Keep
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} />}
                onClick={() =>
                  act(
                    del(`/api/memory/entries/${e.id}`).then(() =>
                      toast(
                        "Deleted. It stays under Deleted notes for 30 days.",
                      ),
                    ),
                  )
                }
              >
                Delete
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Notes as rows, a page of them at a time, each opening the note dialog. */
function NoteRows({
  entries,
  showPlace,
  stale,
  reload,
}: {
  entries: MemoryListEntry[];
  showPlace: boolean;
  stale: boolean;
  reload: () => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<MemoryListEntry | null>(null);
  return (
    <>
      {entries.slice(0, shown).map((e) => (
        <NoteRow
          key={e.id}
          e={e}
          showPlace={showPlace}
          stale={stale}
          reload={reload}
          onOpen={() => setOpen(e)}
        />
      ))}
      {entries.length > shown && (
        <ShowMore onClick={() => setShown((n) => n + PAGE)}>Show more</ShowMore>
      )}
      <NoteDialog
        entry={open}
        stale={stale}
        onClose={() => setOpen(null)}
        onChanged={reload}
      />
    </>
  );
}

/** Your profile has a part of its own: the lists leave it out while it is there (a cleared one shows among the deleted, to restore). */
const withoutProfile = (list: MemoryListEntry[]) =>
  list.filter((e) => !(isUserProfile(e) && e.status === "active"));

/** A note of your own, about you or about one of the projects memory has notes for. */
export function AddNoteDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: Place;
  onClose: () => void;
  onSaved: () => void;
}) {
  const home = useApp((s) => s.boot?.home);
  const [projects, setProjects] = useState<string[]>([]);
  const [place, setPlace] = useState<{ scope: "global" | "repo"; key: string }>(
    { scope: "global", key: "" },
  );
  const [pick, setPick] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    setPlace(
      initial?.kind === "repo"
        ? { scope: "repo", key: initial.key }
        : { scope: "global", key: "" },
    );
    setPick(false);
    api<{ entries: MemoryListEntry[] }>("/api/memory/entries?scope=repo")
      .then((r) => setProjects([...new Set(r.entries.map((e) => e.scopeKey))]))
      .catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (p: { scope: "global" | "repo"; key: string }) => {
    setPlace(p);
    setPick(false);
  };
  const where =
    projects.length || place.scope === "repo" ? (
      <>
        <button
          ref={ref}
          type="button"
          onClick={() => setPick((o) => !o)}
          title="Where it belongs"
          className={cx(
            "inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg",
            pick && "bg-bg-2 text-fg",
          )}
        >
          {place.scope === "global" ? (
            <UserRound size={14} className="shrink-0" />
          ) : (
            <FolderGit2 size={14} className="shrink-0" />
          )}
          {place.scope === "global" ? (
            <span className="truncate">About you</span>
          ) : (
            <span translate="no" className="truncate">
              {folderName(place.key)}
            </span>
          )}
          <ChevronDown size={12} className="shrink-0 opacity-60" />
        </button>
        <Popover
          anchor={ref}
          open={pick}
          onClose={() => setPick(false)}
          width={290}
          title="Where it belongs"
        >
          <OptionRow
            icon={<UserRound size={14} />}
            label="About you"
            hint="Every session gets it"
            selected={place.scope === "global"}
            onClick={() => choose({ scope: "global", key: "" })}
          />
          {[
            ...new Set([
              ...(place.scope === "repo" ? [place.key] : []),
              ...projects,
            ]),
          ].map((k) => (
            <OptionRow
              key={k}
              icon={<FolderGit2 size={14} />}
              label={<span translate="no">{folderName(k)}</span>}
              hint={tildify(k, home)}
              selected={place.key === k}
              onClick={() => choose({ scope: "repo", key: k })}
            />
          ))}
        </Popover>
      </>
    ) : (
      <span className="inline-flex items-center gap-1.5 px-1 text-[12.5px] text-fg-3">
        <UserRound size={14} /> About you
      </span>
    );
  return (
    <Dialog open={open} onClose={onClose} title="Add a note" width={520}>
      <EntryEditor
        text=""
        placeholder="What should agents remember? Say, “I prefer short answers”."
        extra={where}
        onCancel={onClose}
        onSave={(text) =>
          post("/api/memory/entries", {
            text,
            scope: place.scope,
            ...(place.key ? { key: place.key } : {}),
          })
            .then(() => (toast("Note saved"), onSaved(), onClose()))
            .catch(toastError)
        }
      />
    </Dialog>
  );
}

/** The projects that have notes, newest change first, with how many notes each has. */
function useProjects() {
  const version = useMemory((s) => s.version);
  const [list, setList] = useState<
    { key: string; name: string; count: number; at: number }[] | null
  >(null);
  useEffect(() => {
    api<{ entries: MemoryListEntry[] }>("/api/memory/entries?scope=repo")
      .then((r) => {
        const m = new Map<
          string,
          { key: string; name: string; count: number; at: number }
        >();
        for (const e of r.entries) {
          const p = m.get(e.scopeKey) ?? {
            key: e.scopeKey,
            name: e.scopeLabel || folderName(e.scopeKey),
            count: 0,
            at: 0,
          };
          p.count++;
          p.at = Math.max(p.at, e.updatedAt);
          m.set(e.scopeKey, p);
        }
        setList([...m.values()].sort((a, b) => b.at - a.at));
      })
      .catch(() => setList([]));
  }, [version]);
  return list;
}

/** The Notes group: the index of places, or the notes a search found. */
export function NotesGroup({ onBringIn }: { onBringIn: () => void }) {
  const st = useMemoryState();
  const home = useApp((s) => s.boot?.home);
  const projects = useProjects();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);
  const query = q.trim();
  const found = useEntryList(
    { q: query },
    { enabled: !!query, debounce: true },
  );
  const c = st?.counts;
  const total = c ? c.global + c.repo + c.session : 0;
  const reload = () => {
    found.load();
    reloadState();
  };
  const results = useMemo(
    () => (found.list ? withoutProfile(found.list) : null),
    [found.list],
  );
  const shownProjects = projects
    ? all
      ? projects
      : projects.slice(0, FIRST_PROJECTS)
    : [];

  return (
    <Group
      title={
        <>
          <span>Notes</span>
          {c && <span className="ml-1.5 font-normal text-fg-3">{total}</span>}
        </>
      }
      actions={
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={14} />}
          onClick={() => setAdding(true)}
        >
          Add a note
        </Button>
      }
    >
      {c && total === 0 ? (
        <>
          <EmptyRow
            action={
              <Button size="sm" variant="secondary" onClick={onBringIn}>
                Bring in from other assistants
              </Button>
            }
          >
            Nothing kept yet. Notes show up when you ask an agent to remember
            something, or it learns something lasting.
          </EmptyRow>
          <Row
            icon={<Trash2 size={16} />}
            label="Deleted notes"
            hint="Kept for 30 days, to restore"
            onClick={() => openPlace({ kind: "deleted" })}
          />
        </>
      ) : (
        <>
          <SearchRow
            value={q}
            onChange={setQ}
            placeholder={
              c
                ? `Search ${notesCount(total)}${st?.meaning.status === "ready" ? " by words or meaning" : ""}`
                : "Search the notes"
            }
          />
          {query ? (
            results === null ? (
              <div className="flex justify-center py-5">
                <Throbber className="text-fg-3" />
              </div>
            ) : results.length === 0 ? (
              <EmptyRow>No notes match</EmptyRow>
            ) : (
              <NoteRows
                key={query}
                entries={results}
                showPlace
                stale={false}
                reload={reload}
              />
            )
          ) : (
            <>
              <Row
                icon={<UserRound size={16} />}
                label="About you"
                hint={c ? notesCount(c.global) : undefined}
                onClick={() => openPlace({ kind: "global" })}
              />
              {projects === null && !!c?.repo && (
                <div className="flex justify-center py-4">
                  <Throbber className="text-fg-3" />
                </div>
              )}
              {shownProjects.map((p) => (
                <Row
                  key={p.key}
                  icon={<FolderGit2 size={16} />}
                  label={<span translate="no">{p.name}</span>}
                  hint={
                    <>
                      <span translate="no">{tildify(p.key, home)}</span> ·{" "}
                      <span>{notesCount(p.count)}</span>
                    </>
                  }
                  onClick={() => openPlace({ kind: "repo", key: p.key })}
                />
              ))}
              {projects && !all && projects.length > FIRST_PROJECTS && (
                <ShowMore
                  onClick={() => setAll(true)}
                >{`Show ${projects.length - FIRST_PROJECTS} more projects`}</ShowMore>
              )}
              <Row
                icon={<MessageSquare size={16} />}
                label="Sessions"
                hint="Notes kept for a single session"
                control={
                  c ? <span className="tnum">{c.session}</span> : undefined
                }
                onClick={() => openPlace({ kind: "session" })}
              />
              {!!st?.stale && (
                <Row
                  icon={<Hourglass size={16} />}
                  label="Not needed lately"
                  hint={`${notesCount(st.stale)} no agent needed in four months`}
                  onClick={() => openPlace({ kind: "stale" })}
                />
              )}
              <Row
                icon={<Trash2 size={16} />}
                label="Deleted notes"
                hint="Kept for 30 days, to restore"
                onClick={() => openPlace({ kind: "deleted" })}
              />
            </>
          )}
        </>
      )}
      <AddNoteDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setQ("");
          reloadState();
        }}
      />
    </Group>
  );
}

/** One place's page: its notes (a search of its own), opened from the index. */
export function PlacePage({ place }: { place: Place }) {
  const home = useApp((s) => s.boot?.home);
  const st = useMemoryState();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const stale = place.kind === "stale";
  const query = stale ? "" : q.trim();
  const params: Record<string, string> = {};
  if (place.kind === "deleted") params.status = "deleted";
  else if (stale) params.stale = "1";
  else {
    params.scope = place.kind;
    if (place.kind === "repo") params.key = place.key;
  }
  if (query) params.q = query;
  const { list, load } = useEntryList(params, { debounce: !!query });
  const reload = () => {
    load();
    reloadState();
  };
  const entries = useMemo(() => {
    if (!list) return null;
    const l = withoutProfile(list);
    // A search keeps its order (the best first); a place lists a profile, then topics, then the newest first.
    if (query || stale) return l;
    return [...l].sort(
      (a, b) =>
        (place.kind === "deleted"
          ? 0
          : KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) ||
        b.updatedAt - a.updatedAt,
    );
  }, [list, query, stale, place.kind]);

  const c = st?.counts;
  const count =
    place.kind === "global"
      ? c?.global
      : place.kind === "session"
        ? c?.session
        : place.kind === "stale"
          ? st?.stale
          : undefined;
  const title =
    place.kind === "repo" ? (
      <span translate="no">{folderName(place.key)}</span>
    ) : place.kind === "global" ? (
      "About you"
    ) : place.kind === "session" ? (
      "Sessions"
    ) : place.kind === "stale" ? (
      "Not needed lately"
    ) : (
      "Deleted notes"
    );
  const hint =
    place.kind === "repo" ? (
      <>
        <span translate="no">{tildify(place.key, home)}</span>
        {entries && !query ? (
          <>
            {" "}
            · <span>{notesCount(entries.length)}</span>
          </>
        ) : null}
      </>
    ) : place.kind === "deleted" ? (
      "Deleted notes stay 30 days, then go for good"
    ) : place.kind === "stale" ? (
      "No agent has needed these for four months. Keep what still matters, delete the rest."
    ) : place.kind === "global" ? (
      count != null ? (
        notesCount(count)
      ) : undefined
    ) : (
      "Notes kept for a single session"
    );
  const canAdd = place.kind === "global" || place.kind === "repo";
  const mixed =
    place.kind === "session" ||
    place.kind === "stale" ||
    place.kind === "deleted";

  return (
    <div className="space-y-5">
      <SubHeader
        back="Memory"
        onBack={closePlace}
        title={title}
        hint={hint}
        actions={
          canAdd && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              onClick={() => setAdding(true)}
            >
              Add a note
            </Button>
          )
        }
      />
      <Group>
        {!stale && (
          <SearchRow
            value={q}
            onChange={setQ}
            placeholder="Search these notes"
          />
        )}
        {entries === null ? (
          <div className="flex justify-center py-5">
            <Throbber className="text-fg-3" />
          </div>
        ) : entries.length === 0 ? (
          <EmptyRow>
            {query
              ? "No notes match"
              : place.kind === "deleted"
                ? "Nothing deleted"
                : stale
                  ? "Every note was needed lately"
                  : "No notes here yet"}
          </EmptyRow>
        ) : (
          <NoteRows
            key={query}
            entries={entries}
            showPlace={mixed}
            stale={stale}
            reload={reload}
          />
        )}
      </Group>
      <AddNoteDialog
        open={adding}
        initial={place}
        onClose={() => setAdding(false)}
        onSaved={reload}
      />
    </div>
  );
}
