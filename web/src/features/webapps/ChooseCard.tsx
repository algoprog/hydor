// The card an agent puts to the maker of a web app while it waits (the webapp_choose tool): two or three looks to compare side by
// side as pictures of the pages the agent made for them, or one of a few. It is an approval the maker answers (accept with the
// answer as JSON, or "Not now"). The same card, locked with what was picked marked, stays in the conversation (ChoiceView, from
// ChooseRow).
import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, ExternalLink, Palette, Pointer } from "lucide-react";
import type { ChooseDesign, ChooseOption, WebAppChoose } from "@shared/webapps";
import type { Agent, ApprovalRequest } from "@shared/types";
import { api, enc } from "../../lib/api";
import { activeBase } from "../../lib/theme";
import { toastError } from "../../lib/store";
import { tr } from "../../i18n/runtime";
import { openLightbox } from "../../components/Lightbox";
import { Button, cx, inputCls } from "../../components/ui";
import { Elapsed } from "../session/items";
import {
  askTake,
  designPictures,
  draftAnswer,
  draftValid,
  httpsLink,
  initialDraft,
  pictureUrl,
  type Draft,
} from "./chooseLogic";

/** Whether the page shows a light look now (kept current while it is open). */
export function useLight(): boolean {
  const [light, setLight] = useState(() => activeBase() === "light");
  useEffect(() => {
    const on = () => setLight(activeBase() === "light");
    window.addEventListener("wa:theme", on);
    return () => window.removeEventListener("wa:theme", on);
  }, []);
  return light;
}

const FOCUS =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent";

/** A round or square mark of a picked row (the input itself is hidden: the row is its label). */
function Mark({
  on,
  square,
  locked,
}: {
  on: boolean;
  square?: boolean;
  locked?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center border transition-colors",
        square ? "rounded-[5px]" : "rounded-full",
        on ? "border-accent bg-accent text-accent-fg" : "border-line-2 bg-bg-1",
        locked && !on && "opacity-60",
      )}
    >
      {on &&
        (square ? (
          <Check size={11} strokeWidth={3} />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-accent-fg" />
        ))}
    </span>
  );
}

/**
 * A look's picture, large enough to read its headline side by side with the others: the phone's page (its text is the
 * largest at this width), cut to its top; a computer's page where there is no other. A press opens both full size.
 */
function Pictures({
  app,
  d,
  light,
}: {
  app: string;
  d: ChooseDesign;
  light: boolean;
}) {
  const p = designPictures(d, light);
  const shown = p.phone ?? p.desktop;
  if (!shown) return null;
  const all = [p.phone, p.desktop].filter((x): x is string => !!x).map((x) => ({ src: pictureUrl(app, x), name: d.name, edit: false as const }));
  return (
    <button type="button" onClick={() => openLightbox(all)} aria-label={tr(`See ${d.name} full size`)} className="group block w-full cursor-zoom-in bg-bg-2 p-2.5" data-look-picture>
      <span className={cx("relative mx-auto block overflow-hidden rounded-md border border-line group-hover:border-line-2", p.phone ? "aspect-[9/15] w-full max-w-[300px]" : "aspect-[16/10] w-full")}>
        <img src={pictureUrl(app, shown)} alt="" loading="lazy" className="absolute inset-0 block h-full w-full object-cover object-top" />
      </span>
    </button>
  );
}

const COLS: Record<number, string> = {
  2: "@lg:grid-cols-2",
  3: "@2xl:grid-cols-3",
};

function DesignsBody({
  c,
  d,
  set,
  locked,
  uid,
}: {
  c: WebAppChoose;
  d: Draft;
  set: (d: Draft) => void;
  locked: boolean;
  uid: string;
}) {
  const light = useLight();
  const designs = c.designs ?? [];
  return (
    <div className="space-y-3">
      <div className={cx("grid gap-3", COLS[Math.min(3, designs.length)])}>
        {designs.map((x) => {
          const on = d.pick === x.id;
          return (
            <div
              key={x.id}
              className={cx(
                "flex min-w-0 flex-col overflow-hidden rounded-xl border transition-colors",
                on
                  ? "border-accent bg-accent-soft/50 ring-1 ring-accent"
                  : "border-line",
                locked && !on && "opacity-60",
              )}
            >
              <Pictures app={c.app} d={x} light={light} />
              <label
                className={cx(
                  "flex min-w-0 flex-1 flex-col",
                  FOCUS,
                  locked ? "cursor-default" : "cursor-pointer",
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-design`}
                  className="sr-only"
                  checked={on}
                  disabled={locked}
                  onChange={() => set({ ...d, pick: x.id })}
                />
                <span className="flex gap-2.5 p-3">
                  <Mark on={on} locked={locked} />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-[13.5px] leading-snug font-medium"
                      translate="no"
                    >
                      {x.name}
                    </span>
                    <span
                      className="mt-0.5 block text-[12.5px] leading-snug text-fg-2"
                      translate="no"
                    >
                      {x.line}
                    </span>
                  </span>
                </span>
              </label>
            </div>
          );
        })}
      </div>
      {askTake(designs, d.pick) &&
        (locked ? (
          d.take && (
            <p className="text-[12.5px] leading-snug text-fg-2">
              <span className="text-fg-3">Also: </span>
              <span translate="no">{d.take}</span>
            </p>
          )
        ) : (
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-fg-2">Take something from another? Say what</span>
            <input
              value={d.take}
              onChange={(e) => set({ ...d, take: e.target.value })}
              maxLength={300}
              placeholder={tr("For example: the buttons of the second")}
              translate="no"
              className={inputCls}
            />
          </label>
        ))}
    </div>
  );
}

function OptionRow({
  o,
  app,
  on,
  locked,
  name,
  onPick,
}: {
  o: ChooseOption;
  app: string;
  on: boolean;
  locked: boolean;
  name: string;
  onPick: () => void;
}) {
  const link = httpsLink(o.url);
  return (
    <div
      className={cx(
        "min-w-0 overflow-hidden rounded-xl border transition-colors",
        on
          ? "border-accent bg-accent-soft/50 ring-1 ring-accent"
          : "border-line",
        locked && !on && "opacity-60",
      )}
    >
      <label
        className={cx(
          "flex min-w-0 items-stretch",
          FOCUS,
          locked
            ? "cursor-default"
            : cx("cursor-pointer", !on && "hover:bg-bg-1"),
        )}
      >
        <input
          type="radio"
          name={name}
          className="sr-only"
          checked={on}
          disabled={locked}
          onChange={onPick}
        />
        {o.picture && (
          <img
            src={pictureUrl(app, o.picture)}
            alt=""
            loading="lazy"
            className="w-[34%] max-w-36 shrink-0 self-stretch border-r border-line object-cover object-top"
          />
        )}
        <span className="flex min-w-0 flex-1 gap-2.5 px-3 py-3">
          <Mark on={on} locked={locked} />
          <span className="min-w-0 flex-1">
            <span
              className="block text-[13.5px] leading-snug font-medium"
              translate="no"
            >
              {o.title}
            </span>
            {o.line && (
              <span
                className="mt-0.5 block text-[12.5px] leading-snug text-fg-2"
                translate="no"
              >
                {o.line}
              </span>
            )}
          </span>
        </span>
      </label>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-9 items-center gap-1.5 border-t border-line px-3 text-[12.5px] text-accent hover:underline"
        >
          <ExternalLink size={12} className="shrink-0" />
          Look at it
        </a>
      )}
    </div>
  );
}

function OneBody({
  c,
  d,
  set,
  locked,
  uid,
  submit,
}: {
  c: WebAppChoose;
  d: Draft;
  set: (d: Draft) => void;
  locked: boolean;
  uid: string;
  submit?: () => void;
}) {
  const name = `${uid}-one`;
  return (
    <div className="space-y-2">
      {(c.options ?? []).map((o) => (
        <OptionRow
          key={o.id}
          o={o}
          app={c.app}
          on={d.pick === o.id}
          locked={locked}
          name={name}
          onPick={() => set({ ...d, pick: o.id, other: "" })}
        />
      ))}
      {c.other &&
        (locked ? (
          d.other && (
            <div className="rounded-xl border border-accent bg-accent-soft/50 px-3 py-2.5 ring-1 ring-accent">
              <span className="text-[12px] text-fg-3">
                {tr("Something else")}
              </span>
              <span className="block text-[13.5px] leading-snug" translate="no">
                {d.other}
              </span>
            </div>
          )
        ) : (
          <input
            value={d.other}
            onChange={(e) => set({ ...d, other: e.target.value, pick: "" })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit?.();
              }
            }}
            maxLength={300}
            aria-label={tr("Something else")}
            placeholder={tr("Something else…")}
            translate="no"
            className={inputCls}
          />
        ))}
    </div>
  );
}

/** The two shapes, with what is picked (a draft), live or locked. */
export function ChooseBody({
  c,
  d,
  set,
  locked,
  submit,
}: {
  c: WebAppChoose;
  d: Draft;
  set: (d: Draft) => void;
  locked: boolean;
  submit?: () => void;
}) {
  const uid = useId();
  const body =
    c.shape === "designs" ? (
      <DesignsBody c={c} d={d} set={set} locked={locked} uid={uid} />
    ) : (
      <OneBody c={c} d={d} set={set} locked={locked} uid={uid} submit={submit} />
    );
  if (!d.youDecide) return body;
  return (
    <div className="space-y-2">
      {body}
      <p className="text-[12.5px] leading-snug text-fg-2">You let the agent decide.</p>
    </div>
  );
}

const ICON = { designs: Palette, one: Pointer } as const;

/** The frame both the live card and the finished one share: an icon, the title, what the agent said. */
export function ChooseFrame({
  c,
  live,
  id,
  right,
  children,
  footer,
}: {
  c: WebAppChoose;
  live: boolean;
  id?: string;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const Icon = ICON[c.shape] ?? Pointer;
  return (
    <div
      id={id}
      className={cx(
        "@container my-2 overflow-hidden rounded-xl border bg-panel",
        live
          ? "anim-pop border-warn/45 shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_10%,transparent)]"
          : "border-line",
      )}
      data-web-choose
    >
      <div
        className={cx(
          "flex items-center gap-2 border-b border-line px-3 py-2",
          live && "bg-warn/8",
        )}
      >
        <Icon
          size={15}
          className={cx("shrink-0", live ? "text-warn" : "text-fg-3")}
        />
        <div
          className="min-w-0 flex-1 text-[13px] leading-snug font-medium"
          translate="no"
        >
          {c.title}
        </div>
        {right}
      </div>
      <div className="space-y-3 px-3 py-3">
        {c.message && (
          <p className="text-[13px] leading-snug text-fg-2" translate="no">
            {c.message}
          </p>
        )}
        {children}
      </div>
      {footer}
    </div>
  );
}

/** The card as an approval: the maker answers it, or says Not now. */
export function ChooseCard({
  a,
  sessionKey,
  id,
  base,
  onDone,
}: {
  a: ApprovalRequest;
  sessionKey: string;
  agent?: Agent;
  id?: string;
  base?: string;
  onDone?: () => void;
}) {
  const c = a.choose!;
  const [d, setD] = useState<Draft>(() => initialDraft(c));
  const [busy, setBusy] = useState(false);
  const valid = draftValid(c, d);
  const respond = async (decision: "accept" | "decline", youDecide = false) => {
    if (busy || (decision === "accept" && !youDecide && !valid)) return;
    setBusy(true);
    try {
      await api(`/api/sessions/${enc(sessionKey)}/approvals/${enc(a.id)}`, {
        method: "POST",
        base,
        body:
          decision === "accept"
            ? { decision, form: { answer: JSON.stringify(youDecide ? { shape: c.shape, youDecide: true } : draftAnswer(c, d)) } }
            : { decision },
      });
      onDone?.();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <ChooseFrame
      c={c}
      live
      id={id}
      right={
        <span className="shrink-0 text-[11px] text-fg-3">
          waiting <Elapsed since={a.createdAt} />
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-3 py-2.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void respond("decline")}
          >
            Not now
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            data-you-decide
            onClick={() => void respond("accept", true)}
          >
            You decide
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !valid}
            onClick={() => void respond("accept")}
          >
            <span translate="no">{c.submit?.trim() || tr("Use this")}</span>
          </Button>
        </div>
      }
    >
      <ChooseBody
        c={c}
        d={d}
        set={setD}
        locked={false}
        submit={() => void respond("accept")}
      />
    </ChooseFrame>
  );
}
