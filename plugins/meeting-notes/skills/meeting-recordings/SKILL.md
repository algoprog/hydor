---
name: meeting-recordings
description: Use when the user gives a recording of a meeting, call, interview or lecture and wants notes, minutes, a summary, decisions or action items from it.
category: planning
triggers: [meeting recording, recording of the meeting, minutes from, notes from the call, interview recording]
---

# Meeting recordings

From a recording to notes that people trust: every point can be checked against the time it was said.
The transcript is made on this computer with the Speech to text plugin's `transcribe` tool.

## 1. Transcribe

- Ask for, or find, the language and the names of the people in it: they make the transcript and the
  owners right.
- Run `transcribe` with `formats: ["txt", "srt"]` (follow the transcribe-audio skill for long
  recordings). The .srt keeps the times you will cite.
- Recordings of other people are personal data: keep the files where the user put them, and do not
  copy them elsewhere.

## 2. Read it all before writing

Read the whole transcript once, then take notes with times (`[00:14:32]`). Separate what was decided
from what was only discussed, and who said they would do what.

## 3. Write the notes

Use the template in `references/notes-template.md`:

1. **Summary**: three to five sentences a person who missed the meeting needs.
2. **Decisions**: what was agreed, each with its time.
3. **Action items**: a table of what, who, by when, time said. Only owners someone named or
   accepted; otherwise write "no owner yet". Dates as said ("by Friday" becomes the actual date,
   noted as inferred).
4. **Open questions** and risks raised.
5. **Follow-up email**: short, to the attendees, with the decisions and action items.

## 4. Check before handing over

- Every decision and action item has a time; listen to or reread the moments that are unclear.
- Nothing in the notes that was not said. Mark your own inferences as such.
- Speakers: Whisper does not label them. Use names only where the context makes clear who spoke.
- Hand over as the user prefers: a document (save_doc), a page, or Markdown, plus the transcript files.

## Pitfalls

- Turning a suggestion into a decision, or a "maybe I can look" into a commitment.
- Owners guessed from who spoke most.
- Leaving out disagreement: if a decision was contested, say so.
