// What the cards for a server and for backups say with Technical details off (launch-tools.ts puts them up; the technical
// ones stay there). Each says what happens, what is lost if anything is, and has a button that says what it does. A
// server is "your server": the name Hydor files it under is of no use to the person.
import { CHECK_PROBLEMS } from "../../shared/check-words.ts";

export interface CardWords {
  title: string;
  detail: string;
  label: string;
}

/** "24 November at 19:30 (UTC)", from a backup's id (20261124-193012-manual); "" when it is not one. */
export function copyTime(id: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(id);
  if (!m) return "";
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} at ${m[4]}:${m[5]} (UTC)` : "";
}

export const PLAIN_CARDS = {
  addServer: (): CardWords => ({ title: "Add your server?", detail: "Hydor makes a key for it, which stays on this computer. Nothing is sent to the server yet. You then give your server that key, and check that Hydor reaches the right one.", label: "Add it" }),
  acceptServer: (code: string): CardWords => ({ title: "Is this your server’s code?", detail: `Compare the code below, letter by letter, with the one your provider shows for your server. If they differ, say no: Hydor may not be reaching your server.\n\n${code}`, label: "They are the same" }),
  setUpServer: (): CardWords => ({ title: "Set up your server?", detail: "Hydor puts the program that runs your app on it, and turns on a guard that lets in only your visitors and Hydor. It takes a few minutes and changes nothing on this computer.", label: "Set it up" }),
  forgetServer: (): CardWords => ({ title: "Forget your server?", detail: "Hydor forgets it and the key it made for it. The server itself is not touched: apps put online there keep running, and it is billed until you delete it.", label: "Forget it" }),
  takeOff: (app: string): CardWords => ({ title: `Take ${app} off the internet?`, detail: "Nobody is answered at its address any more. What it keeps stays on your server, which is billed until you delete it.", label: "Take it off" }),
  copyNow: (app: string): CardWords => ({ title: `Make a copy of what ${app} keeps?`, detail: "A copy is made while it runs, and read back to check it before it counts.", label: "Make a copy" }),
  restoreCopy: (app: string, id: string): CardWords => ({
    title: "Put an earlier copy back?",
    detail: `${app} stops for a few seconds. Everything it keeps now is replaced by the copy${copyTime(id) ? ` made on ${copyTime(id)}` : ""}: what people saved since then is lost. A copy of how it is now is made first, so this can be undone.`,
    label: "Stop it and put the copy back",
  }),
  copyTimes: (at: string | undefined, days: number | undefined): CardWords => ({ title: "Change when copies are made?", detail: `${at ? `A copy is made every day at ${at} (UTC).` : "A copy is made every day at the same time as now."} ${days ? `Each is kept for ${days} days.` : "Each is kept as long as now."} The newest three always stay.`, label: "Change it" }),
  goBack: (): CardWords => ({ title: "Go back to the version before?", detail: "The version before is put back for people. What they saved stays. Going back again comes forward.", label: "Go back" }),
  goBackData: (): CardWords => ({ title: "Go back, and put what it keeps back too?", detail: "What it keeps goes back to the copy made just before the last change went online: what people saved since then is lost. A copy of how it is now is made first.", label: "Put both back" }),
  alsoData: (): CardWords => ({ title: "Also put back what it keeps?", detail: "What it keeps goes back to how it was before the last change went online: what was saved since then is lost. A copy of how it is now is made first.", label: "Put it back" }),
  failedChecks: (app: string, ids: string[]): CardWords => {
    const problems = [...new Set(ids.map((id) => CHECK_PROBLEMS[id] ?? "Something else needs fixing."))];
    return { title: "Put it online with problems not fixed?", detail: `The checks of ${app} found:\n${problems.map((p) => `• ${p}`).join("\n")}\n\nFixing first is better. If you go on, it goes online as it is, and that is written down.`, label: "Put it online anyway" };
  },
};
