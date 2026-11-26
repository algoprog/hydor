// What the weekly check found, in plain words: the notice and the app's page with Technical details off.
import type { WeeklyCheck } from "./webapps.ts";

/** Why one thing needs the person, as the end of a sentence ("no backup for 3 days"). */
export function weeklyReason(n: Pick<WeeklyCheck["needs"][number], "id" | "days">): string {
  if (n.id.startsWith("down-")) return "it is not answering";
  if (n.id.startsWith("errors-")) return "things go wrong in it more often lately";
  if (n.id.startsWith("backup-")) return n.days === undefined ? "it has no backup yet" : `no backup for ${n.days === 1 ? "1 day" : `${n.days} days`}`;
  return "Hydor could not look at it";
}

/** The whole notice, one sentence. */
export function weeklyNotice(name: string, needs: WeeklyCheck["needs"]): string {
  const more = needs.length - 1;
  return `Your app ${name} needs you: ${weeklyReason(needs[0]!)}${more ? `, and ${more} more ${more === 1 ? "thing" : "things"}` : ""}.`;
}
