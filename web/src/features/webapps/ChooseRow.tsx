// webapp_choose in the conversation. While it runs, the card above it (the approval) is the live one; once answered, the card stays
// here as it was put, locked, with what was picked marked and when. Everything comes from the app's own record of the choice
// (GET /api/webapps/:app/choices/:id), so it shows again when the conversation is opened later.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WebAppChoice } from "@shared/webapps";
import type { ToolItem } from "@shared/types";
import { api, enc } from "../../lib/api";
import { useFeatureEvent } from "../../lib/featureEvents";
import { useLive } from "../../lib/store";
import { tr } from "../../i18n/runtime";
import { Throbber } from "../../components/ui";
import { ChooseBody, ChooseFrame } from "./ChooseCard";
import { draftFromAnswer, parseChooseOutput } from "./chooseLogic";
import { ago } from "./time";

interface Fetched {
  choice: WebAppChoice | null;
  waiting: boolean;
}

/** A quiet one line, as the sketch card's running state is. */
function Line({ children, busy }: { children: string; busy?: boolean }) {
  return (
    <div className="my-1.5 flex items-center gap-2 text-[13px] text-fg-2">
      <span className="flex w-4 justify-center text-fg-3">
        {busy && <Throbber className="h-3.5" />}
      </span>
      {children}
    </div>
  );
}

/** The finished card of one choice. */
export function ChoiceView({ choice }: { choice: WebAppChoice }) {
  const d = useMemo(
    () => draftFromAnswer(choice.offered, choice.answer),
    [choice],
  );
  return (
    <ChooseFrame
      c={choice.offered}
      live={false}
      right={
        <span className="shrink-0 text-[11px] text-fg-3">
          {tr(`Chosen ${ago(choice.at)}`)}
        </span>
      }
    >
      <ChooseBody c={choice.offered} d={d} set={() => {}} locked />
    </ChooseFrame>
  );
}

export function ChooseRow({ item, sessionKey }: { item: ToolItem; sessionKey?: string }) {
  const t = item.tool;
  // The card is up and waits for them: nothing is being put to them any more.
  const asked = useLive((x) => !!sessionKey && !!x.byKey[sessionKey]?.overlay.approvals?.some((a) => a.choose));
  const out = useMemo(() => parseChooseOutput(t.output), [t.output]);
  const running = t.status === "running" || t.status === "pending";
  const [got, setGot] = useState<Fetched | null>(null);
  const [failed, setFailed] = useState(false);
  const app = out?.app;
  const cid = out?.choice;
  const load = useCallback(() => {
    if (!app || !cid) return;
    api<Fetched>(`/api/webapps/${enc(app)}/choices/${enc(cid)}`).then(
      (x) => {
        setGot(x);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [app, cid]);
  useEffect(() => load(), [load]);
  useFeatureEvent("webapps", load);

  if (running) return asked ? <Line>Waiting for your pick</Line> : <Line busy>Putting options to you…</Line>;
  if (!out)
    return (
      <div
        className="my-2 rounded-xl bg-bg-2 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-fg-2"
        translate="no"
      >
        {(t.output ?? "").slice(0, 1200)}
      </div>
    );
  if (got?.choice) return <ChoiceView choice={got.choice} />;
  if (got?.waiting) return <Line>Waiting for your pick</Line>;
  if (out.status === "declined") return <Line>You left this for now.</Line>;
  if (!got && !failed) return <Line busy>Putting options to you…</Line>;
  return (
    <Line>
      {out.status === "answered"
        ? "You picked from these options."
        : "No pick was made."}
    </Line>
  );
}
