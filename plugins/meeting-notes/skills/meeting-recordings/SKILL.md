---
name: meeting-recordings
description: Use when the user gives a recording of a meeting, call, interview or lecture and wants notes, minutes, a summary, decisions or action items from it.
category: planning
triggers: [meeting recording, recording of the meeting, minutes from, notes from the call, interview recording]
---

# Meeting recordings

From a recording to notes that people trust: every point can be checked against the time it was said,
and nothing in them claims more agreement than there was. The transcript is made on this computer
with the Speech to text plugin's `transcribe` tool.

## 1. Transcribe

- Ask for, or find, the language and the names of the people in it: they make the transcript and the
  owners right.
- Run `transcribe` with `formats: ["txt", "srt"]` (follow the transcribe-audio skill for long
  recordings). The .srt keeps the times you will cite.
- Recordings of other people are personal data: keep the files where the user put them, and do not
  copy them elsewhere.

## 2. Read it all, and sort what was said

Read the whole transcript once, then take notes with times (`[00:14:32]`). Sort each point by what
was really said:

| What was said | In the notes |
| --- | --- |
| A clear yes ("Agreed, we go with B"), or a call by the person who has the say | a decision, with any objection or condition beside it |
| "We should…", "What if we…", "I'd suggest…", and no clear yes | proposed, not agreed |
| "I can look into it", "maybe by Friday" | an offer, a tentative date: marked as such |
| "Sam, can you…" and no answer from Sam | asked of Sam, not accepted: no owner yet |
| Nobody objecting, or nothing said | nothing: silence is not agreement |

## 3. Write the notes

Never invent a decision, an owner, a date or agreement: a gap stays a gap. Use the template in
`references/notes-template.md`:

1. **Summary**: three to five sentences a person who missed the meeting needs.
2. **Decisions**: only what was clearly agreed or decided, each with its time. A decision made over
   objections is still a decision; say so, and don't call it unanimous.
3. **Action items**: a table of what, who, by when, time said. An owner only when that person said yes
   or offered; otherwise "no owner yet". A date only when one was agreed: "by Friday" becomes the
   actual date, noted as inferred; "maybe Friday" stays tentative; none agreed is "no date".
4. **Proposed, not agreed**: suggestions nobody took up or decided on, with who made them.
5. **Open questions** and risks raised.
6. **Follow-up email**: short, to the attendees, with the decisions and action items, asking them to
   correct anything you got wrong.

Shared notes leave out what was said in confidence or off the record, health and personal matters,
remarks about people who were not there, jokes and asides. If you are unsure whether something
belongs, leave it out and ask the user.

## 4. Check before handing over

- Every decision and action item has a time; listen to or reread the moments that are unclear.
- Nothing in the notes that was not said, and nothing proposed written as agreed. Mark your own
  inferences as such.
- Speakers: Whisper does not label them. Use names only where the context makes clear who spoke.

## 5. Hand over; send nothing yourself

- Hand over as the user prefers: a document (save_doc), a page, or Markdown, plus the transcript files.
- The notes and the email are drafts for the user. Ask before sending them to anyone, inviting anyone
  to a follow-up, or creating tasks or calendar events, and say to whom: being asked for notes is not
  being asked to send them.

## Pitfalls

- Turning a suggestion into a decision, or a "maybe I can look" into a commitment.
- Silence, or "no objections", written down as agreement.
- Owners guessed from who spoke most, or from who was asked.
- Leaving out disagreement: if a decision was contested, say so.
- Private remarks copied into notes everyone will read.
