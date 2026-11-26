// A new web app's sketch, as the web app builder shows it before anything is made (app_sketch with kind "web"): the card in the
// conversation says who uses it and what they do there, what it keeps and who may see each, where it will run, what it assumed and
// its few questions as choices to tap. Build it sends "Build it." with the picks as the maker's message; Change it puts the cursor
// in the message box; the other kind asks for a small tool an agent runs instead. Everything comes from the tool call, so it shows
// again when the conversation is opened later; once answered, the buttons go.
import { useState, type ReactNode } from "react";
import { KeyRound, Layers, PencilLine } from "lucide-react";
import { tr } from "../../i18n/runtime";
import { composeInsert } from "../../lib/featureEvents";
import { Button, cx } from "../../components/ui";
import { AppIcon } from "../apps/AppIcon";
import { buildMessage, type WebSketched } from "./chooseLogic";

function Part({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("min-w-0 px-4 py-3.5 sm:px-5", className)}>
      <h4 className="mb-2.5 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul
      className="list-disc space-y-1 pl-4 text-[13px] leading-snug text-fg-2 marker:text-fg-3"
      translate="no"
    >
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

/** What the app keeps: each kind of thing, what is kept of it and who may see it. */
export function KeepsList({ keeps }: { keeps: WebSketched["sketch"]["keeps"] }) {
  return (
    <ul className="space-y-2">
      {keeps.map((k) => (
        <li key={k.title} className="min-w-0 rounded-lg border border-line px-3 py-2" data-keeps={k.title}>
          <span className="block text-[13.5px] leading-snug font-medium" translate="no">
            {k.title}
          </span>
          {k.line && (
            <p className="mt-0.5 text-[12.5px] leading-snug text-fg-2" translate="no">
              {k.line}
            </p>
          )}
          <p className="mt-1 text-[12px] leading-snug text-fg-3">
            {tr("Who sees it")}: <span translate="no">{k.who}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

export function WebSketchCard({
  out,
  sessionKey,
  answered,
}: {
  out: WebSketched;
  sessionKey: string;
  answered: boolean;
}) {
  const s = out.sketch;
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(false);
  const questions = out.questions ?? [];
  const done = answered || sent;
  const send = (text: string) => {
    if (composeInsert(text, sessionKey, undefined, { send: true }) === "sent")
      setSent(true);
  };
  const build = () => send(buildMessage(tr("Build it."), questions, picked));
  return (
    <div
      className="@container my-3 overflow-hidden rounded-2xl border border-line bg-panel"
      data-web-sketch
    >
      <header className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <AppIcon icon="app-window" color="indigo" size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-semibold" translate="no">
              {s.name}
            </span>
            <span className="rounded-md bg-bg-2 px-1.5 py-px text-[11px] font-medium text-fg-3">
              A sketch: nothing is made yet
            </span>
          </div>
          {s.description && (
            <p
              className="mt-0.5 text-[13px] leading-snug text-fg-2"
              translate="no"
            >
              {s.description}
            </p>
          )}
          {s.type?.title && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-fg-3">
              <Layers size={13} aria-hidden className="mt-0.5 shrink-0" />
              <span className="min-w-0">{tr(s.type.title)}</span>
            </p>
          )}
        </div>
      </header>
      <div className="grid divide-y divide-line @2xl:grid-cols-2 @2xl:divide-x @2xl:divide-y-0">
        <Part title={tr("Who uses it")}>
          {s.who && (
            <p className="mb-2 text-[13px] leading-snug" translate="no">
              {s.who}
            </p>
          )}
          {s.does.length > 0 && <Bullets items={s.does} />}
        </Part>
        <div className="divide-y divide-line">
          {s.keeps.length > 0 && (
            <Part title={tr("What it keeps")}>
              <KeepsList keeps={s.keeps} />
            </Part>
          )}
          {s.runs && (
            <Part title={tr("Where it will run")}>
              <p className="text-[13px] leading-snug text-fg-2" translate="no">
                {s.runs}
              </p>
            </Part>
          )}
        </div>
      </div>
      {out.needs?.length || out.assumed?.length || questions.length ? (
        <div className="divide-y divide-line border-t border-line">
          {out.needs?.length ? (
            <Part title={tr("You will need")}>
              <ul className="space-y-1.5 text-[13px]">
                {out.needs.map((k) => (
                  <li key={k.name} className="flex items-start gap-2">
                    <KeyRound size={13} className="mt-0.5 shrink-0 text-fg-3" />
                    <span className="min-w-0" translate="no">
                      {k.name}
                      {k.what && <span className="text-fg-2"> · {k.what}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Part>
          ) : null}
          {out.assumed?.length ? (
            <Part title={tr("What it assumed")}>
              <Bullets items={out.assumed} />
            </Part>
          ) : null}
          {questions.length > 0 && (
            <Part
              title={
                questions.length > 1 ? tr("Its questions") : tr("Its question")
              }
            >
              <div className="space-y-3">
                {questions.map((q, i) => (
                  <div key={i}>
                    <div
                      className="mb-1.5 text-[13px] font-medium"
                      translate="no"
                    >
                      {q.ask}
                    </div>
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="radiogroup"
                      aria-label={q.ask}
                    >
                      {[...q.choices, tr("You decide")].map((c) => {
                        const on = picked[i] === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={done}
                            onClick={() =>
                              setPicked((p) => ({ ...p, [i]: on ? "" : c }))
                            }
                            className={cx(
                              "min-h-8 rounded-full px-3 text-[13px] ring-1 transition-colors ring-inset disabled:cursor-default disabled:opacity-60",
                              on
                                ? "bg-accent-soft text-accent ring-accent/40"
                                : "bg-bg-1 text-fg-2 ring-line-2 hover:text-fg enabled:hover:ring-accent/40",
                            )}
                            translate="no"
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Part>
          )}
        </div>
      ) : null}
      {!done && (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
          <span className="mr-auto text-[12px] text-fg-3">
            {questions.length
              ? "Pick what fits; what you leave is as it assumed."
              : "Nothing is made until you say so."}
          </span>
          <Button
            variant="ghost"
            onClick={() =>
              send(
                tr(
                  "Make it a small tool an agent runs instead, not a web app.",
                ),
              )
            }
          >
            Make it a small tool instead
          </Button>
          <Button
            variant="ghost"
            icon={<PencilLine size={14} />}
            onClick={() =>
              composeInsert("", sessionKey, undefined, { focus: true })
            }
          >
            Change it…
          </Button>
          <Button variant="primary" onClick={build}>
            {tr("Build it")}
          </Button>
        </footer>
      )}
    </div>
  );
}
