---
name: meetings
description: Use when preparing, running or following up a meeting (whether to meet at all, an agenda, who to invite, chairing it, a one-on-one), or getting ready for one someone else runs. Not for notes from a recording (meeting-recordings).
category: planning
triggers: [meeting agenda, an agenda for, plan a meeting, prepare for a meeting, my meeting with, run a meeting, chair a meeting, one-on-ones, one-on-one with, "my 1:1", team meeting*, too many meetings]
---

# Meetings

A meeting earns its time when everyone knows what it is for, the people who decide or know are
there, and it ends with decisions and actions people agreed to, written down as they were said. Most
of that happens outside the meeting: settle the purpose (or find that a message will do), write the
agenda as questions, and afterwards send a short, true record.

## 1. Should it be a meeting?

- Write the outcome in one line: "Choose the packaging supplier for 2027", not "Suppliers". If you
  cannot, the meeting is not ready. Ask only what you cannot infer (several details at once with
  `ask_form`).
- Pick the form from the purpose:

| Purpose | Usually best |
| --- | --- |
| News or a status update | a message or a short note; questions in writing |
| Comments on a draft | written comments by a date; meet only on what stays disputed |
| A decision with trade-offs, people disagreeing | a meeting, after a one-page brief (decision-brief) |
| Working out a problem or a plan together | a meeting |
| Something sensitive (feedback, bad news, a conflict) | a conversation: few people, in person or on video |

- A regular meeting earns its next slot: what did the last three decide or unblock? If little, offer
  a shorter one, fewer people, less often or a written update, with a date to review the change.
- Going to a meeting someone else runs (your manager, the bank, a school, a landlord)? See step 7.

## 2. Who needs to be there

- Who decides, and whether anyone else must approve; who knows the facts; who will do the work; who
  is affected and should be heard before the decision, not after.
- Everyone else gets the notes, or joins for their item only. Fewer people decide faster.
- Don't guess who decides from job titles: ask. If the person with the say cannot come, make it a
  meeting to prepare the decision, not to take it.

## 3. The agenda

- Each item a question to answer, with who leads it, its minutes, and what it should produce: a
  decision, ideas, a plan, or information.
- The hardest item first, while people are fresh. Information that needs no discussion goes in the
  pre-read.
- Say how each decision will be made (the owner decides after hearing everyone, a vote, or everyone
  must agree) and what happens if it cannot be settled today.
- A short pre-read (a page or two), sent early enough to read, saying what to look at for which item.
- The practical part: date, time and time zone, place or link, length (as short as the agenda
  allows), and what helps everyone take part: papers in advance, captions, breaks, a way to send
  views in writing. Offer a private way to ask for anything else, no reason needed.
- Record it, or let a note-taking bot in, only if everyone agrees beforehand.

```text
Packaging supplier: Thursday 14 Nov, 10:00–10:45 CET, room 2 or the video link
Goal: choose the supplier for 2027. Ana decides, after hearing everyone.
Read first: the one-page comparison, especially the costs.
1. 10:00 What must the supplier do without fail? (Ben, 10 min) → a list we agree on
2. 10:10 Which offer meets it best? (Ana, 25 min) → Ana's choice
3. 10:35 Who tells the suppliers, and by when? (Ana, 5 min) → owners and dates
4. 10:40 Read back decisions and actions (5 min)
```

Hand it over as text to paste into the invitation, or as a document to share or print (`save_doc`).

## 4. Run it

- Open with the goal, the agenda, the time, how decisions will be made, and who takes notes.
- Keep to the question: "Does this change today's decision, or shall we park it?" Parked items go at
  the end of the notes, with no owner unless someone takes one.
- One voice filling the room: "Let's hear from those who haven't spoken yet", or a minute for
  everyone to write their view down first.
- Going in circles: "What fact would change your mind?" Separate disagreements about facts (look
  them up), about what matters more (the person deciding weighs them) and about who decides.
- Time running out: "We have five minutes: what can we settle?" Decide what is ready and give the
  rest a next step; never rush a decision that needs someone who is not there.
- Close with a read-back: each decision, each action with its owner and date, what stays open. Ask
  "Have I got that right?" and wait: a person saying yes to an action is what makes it theirs.
- Helping someone during a meeting: short wording they can use. They chair, not you.

## 5. Afterwards: the record and the follow-up

- Notes within a day: decisions (with any objection or condition), actions (what, who, by when),
  proposals not agreed, open questions. From notes pasted or typed, the ready-made "Meeting notes to
  actions" app does this (`find_apps`, then `use_app`); from a recording, the meeting-recordings
  skill (the Meeting recordings plugin).
- Keep the notes true:
  - Never invent a decision, an owner, a date or agreement; a gap stays a gap ("no owner yet").
  - Silence is not agreement. "We should…" is a proposal, "I can look into it" an offer, "maybe
    Friday" a tentative date. Mark what was proposed and what was agreed.
  - Leave out of shared notes what was said in confidence, health and personal matters, and remarks
    about people.
- The follow-up email (the email skill): short, with the decisions and actions, inviting corrections.
- Ask before sending notes or invitations to anyone, or creating calendar events or tasks, and say
  who would get what: writing a draft is not permission to send it.
- Check on actions at their date; a missed one gets "what's in the way?", not blame (a chaser: the
  email skill). An action that grows into a project: the project-plan skill.

## 6. One-on-ones

- Mostly their time: they bring their topics first, you add one or two. Routine status goes in
  writing.
- Questions that work: "What has changed since we last spoke?", "Where are you stuck, and what do you
  need from me?", "Is there something in how we work together I should change?"
- Feedback: a concrete observation and its effect, then "How did you see it?" Talk about their
  growth every few weeks, so it is not always crowded out.
- Notes: what you both agreed, kept between the two of you unless you agree otherwise.
- A performance, disciplinary or pay matter follows the employer's formal process: never raise it by
  surprise in a routine one-on-one. Between peers, neither hands the other work: agree, don't assign.

## 7. A meeting someone else runs

- What you want from it, in one line, and what you could accept instead.
- The two or three points you must make, the questions to ask, the papers or numbers to bring.
- What you will not agree to on the spot: "I'd like to think about that and come back to you by
  Friday."
- A formal meeting (a disciplinary or grievance hearing, a dispute, a problem with a tenancy or a
  debt): you can often bring someone with you; ask the organiser, and for legal or money questions ask
  an adviser (a union, a free advice service, a lawyer).
- Afterwards, draft a short note of what was agreed for them to send the same day: "To confirm what
  we agreed today: …"

## Pitfalls

- A meeting for news that a message could carry.
- An agenda of topics instead of questions.
- The person who decides missing, found out at the end.
- Silence taken as agreement; actions without an owner who said yes.
- Notes that tidy away a disagreement, or carry private remarks.
- Notes or invitations sent before the person said so.
