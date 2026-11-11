// Settings → Memory: memory on or off for all sessions (beside the title); your profile, which every agent gets;
// every note kept, as an index of places (about you, each project, the sessions', the notes no agent needed lately,
// the deleted ones) that open as pages of their own, searchable by words and meaning, and each note whole in a
// dialog; learning from conversations and the daily tidy-up; what agents get (search by meaning, how many notes,
// how long the profile may be); and your data (bring in from other assistants, export, clear). On a phone the menus are sheets.
import { useLayoutEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Switch, SheetsOnPhone, Throbber } from "../../components/ui";
import { Notice, SectionActions, Stack } from "../settings/kit";
import { BringIn } from "./BringIn";
import { reloadState } from "./common";
import { put } from "../../lib/api";
import { toastError } from "../../lib/store";
import { LearningGroup } from "./MemoryLearning";
import { NotesGroup, PlacePage, parsePlace } from "./MemoryNotes";
import { AgentsGetGroup, YourDataGroup } from "./MemoryOptions";
import { ProfileGroup } from "./MemoryProfile";
import { useMemoryState } from "./state";

export function MemorySettings() {
  const st = useMemoryState();
  const notes = new URLSearchParams(useSearch()).get("notes");
  const place = parsePlace(notes);
  const [bringing, setBringing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // A place opens (or closes) at the top of the page.
  useLayoutEffect(() => {
    root.current?.closest<HTMLElement>(".overflow-y-auto")?.scrollTo(0, 0);
  }, [notes]);
  return (
    // Menus open as sheets from the bottom on a phone.
    <SheetsOnPhone.Provider value>
      <div ref={root}>
        <SectionActions>
          {st ? (
            <Switch
              on={st.enabled}
              label="Memory"
              onChange={(enabled) =>
                put("/api/memory", { enabled })
                  .then(reloadState)
                  .catch(toastError)
              }
            />
          ) : (
            <Throbber className="text-fg-3" />
          )}
        </SectionActions>
        {place ? (
          <PlacePage key={notes} place={place} />
        ) : (
          <Stack>
            {st && !st.enabled && (
              <Notice tone="warn">
                Memory is off: agents get no notes and save nothing new. Your
                notes stay.
              </Notice>
            )}
            <ProfileGroup />
            <NotesGroup onBringIn={() => setBringing(true)} />
            <LearningGroup />
            <AgentsGetGroup />
            <YourDataGroup onBringIn={() => setBringing(true)} />
          </Stack>
        )}
        <BringIn open={bringing} onClose={() => setBringing(false)} />
      </div>
    </SheetsOnPhone.Provider>
  );
}
