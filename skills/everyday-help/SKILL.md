---
name: everyday-help
description: Use when someone asks what you or the app can do for them, how it could help in their days (routines, chores, things they forget, decisions they repeat), or what to automate. Not for building an app already chosen (app-builder).
category: app
triggers: [what can you do for me, what can hydor do, help me day to day, where could ai help, how could ai help, how can ai help, what should i automate, what to automate, make my life easier, daily routine*, everyday tasks]
---

# Everyday help

Most people do not know what to ask an assistant for. A short, friendly conversation finds the places
in their days where help would matter: routines, chores, things they forget, decisions they make again
and again, information they keep looking up. Then match each need to something Hydor really does,
checked in the app's guide rather than guessed. Keep it small: one question at a time, at most two
ideas at once, and one thing set up, only after they say yes.

## 1. Start lightly

- **A quick answer, or a conversation?** "What can you do?" may want five lines, not an interview. Give
  a short overview (apps that answer everyday questions, reminders and briefs that run by themselves,
  trackers and pages kept in the Library, their own accounts connected, voice and the phone), point to
  **Help** (`/guide`), and offer to find what would help them in particular with a few questions.
- **For the conversation,** say what it is in a sentence ("a few questions about your days, then one or
  two ideas; nothing gets set up unless you say so"), and ask whether now suits them.
- **Look before you ask:** `recall` (what memory holds about them), `list_tasks` (their scheduled
  tasks), `list_connections` (their connected accounts). Do not ask what you already know or
  suggest what they already have; mention it only when it helps ("you already get a Morning brief at
  7:30"). Without these tools, ask what they already use.
- If they came with one clear need ("remind me to water the plants on Sundays"), skip the conversation
  and do that, with the skill that fits.

## 2. Ask about their days, one question at a time

- **One question per message,** about one thing, built on their last answer. Never a list of questions.
- **Real days, not self-portraits:** "Walk me through yesterday, from when you got up" beats "How
  organised are you?". Follow up: "What happened just before that?", "How often does that come up?",
  "What have you tried?"
- **Play back what you heard** in a sentence, guesses marked as guesses: "So Monday mornings are the
  squeeze, mostly because of the school run. Have I got that right?"
- **Listen for a need:** something they repeat, forget, look up, put off or check again and again; a
  decision they remake every week; a part of the day that keeps going wrong.
- **Touch only the areas that fit their life:** the shape of the day; chores and admin (bills,
  renewals, forms, appointments); things they forget; decisions they repeat (meals, what to watch,
  routes, purchases); things they look up (weather, travel, prices, scores, news); people and plans;
  work that repeats; learning and interests; what an assistant should never do or know. Prompts for
  each are in `references/questions.md`.
- **Understand before advising:** do not answer each reply with a suggestion.
- **Keep it short:** about 8 to 15 questions, fewer when the picture is clear. Halfway, ask whether to
  go on, switch topic or stop there.

## 3. Match needs to what Hydor really does

For each need, find the feature that fits and check it before naming it: `app_guide` with a `query`
("a reminder at a set time", "a tracker on my phone") gives the current way and the link to the place;
`find_apps` shows which apps they have. Never name a feature, setting or service you have not checked.
The usual matches (more, with exact labels and links, in `references/what-hydor-offers.md`):

| They need | In Hydor | How it is set up |
| --- | --- | --- |
| A nudge at a time, once or on chosen days | a reminder: a scheduled task | `schedule_task`, its prompt telling them the reminder |
| A summary each morning or week (weather, news, their calendar and mail) | a scheduled task; the examples **Morning brief**, **News on a topic**, **Inbox digest** | `schedule_task` |
| To hear when something changes (a price, back in stock, a page, a release) | a watcher, which checks without a model and wakes an agent only on a change | the watch-and-alert skill |
| The same kind of question with new details (the weather for a trip, what to cook, a week of meals, a gift, what to watch, what's on) | a ready-made app | `find_apps`, then `use_app` to try it now |
| A job of their own that repeats (a weekly report, a letter in their style) | an app of their own, or a scheduled task | the app-builder skill |
| Something to fill in or tick off, also on the phone (a habit tracker, a checklist, a log) | a page kept in the Library, with its own address for the phone's home screen | `save_page` |
| A letter or plan to keep and print; a budget with numbers | a document; a spreadsheet | `save_doc`; `save_sheet` |
| Help with their mail, calendar, notes, tasks or files | Connected apps (Apps → Connected apps) | they connect it themselves; `list_connections` shows what is there |
| A long piece of life (a move, a renovation, a job hunt, a course) | a project, with its own documents, guidelines and memory | `app_api`, after the guide's projects topic |
| How agents should talk to them, every time | Agent Guidelines | `app_api`, in their words |
| Hands busy, or on the move | dictation, replies read aloud, hands-free mode; the app on the phone, with notifications on | they turn notifications on, on each device |
| A week that keeps slipping | a weekly review | the weekly-review skill |

Sort each match before offering it: **ready now** (it exists and you checked it); **needs a step from
them** (connect an account, turn on notifications, add a plugin); **can be made** (a task, a page, an
app); **not a fit** (say so plainly: something the app cannot reach, or a choice that should stay theirs).

## 4. Offer at most two ideas

- For each: the need in their words, what you would set up, how they would meet it (a notification at
  7:30, a page on their phone), what it costs when that matters (each scheduled run uses a model's
  time), and what is still uncertain.
- Prefer small and easy to undo: a reminder they can pause, a week's trial.
- Ask which, if either, they want. "Neither" is a fine answer: go back to listening, or close.

## 5. Set up one small thing, after their yes

- One thing per conversation; keep the other idea for another day.
- Changes to the app show them a card to confirm (`schedule_task`, `app_api`): nothing is saved until
  they answer, and the answer comes back to you, so do not also ask in text. A page made with
  `save_page` appears in the conversation; say where it is kept.
- Try it once where that makes sense: a brief run now (**Run now** in the task's menu; through
  `app_api` it asks them on a card), the app run with `use_app`, the page opened and used. A one-off
  reminder needs no trial: check its card showed the right day and time. Fix what does not work before
  saying it works (evidence-before-done).
- Tell them where it lives and how to pause, change or remove it: tasks in Settings → Agents →
  Scheduled tasks, pages in the Library, apps on the Apps page.

## 6. Memory: only with a yes, and short

- Write no memory notes unless they ask or agree: they want memory kept lean.
- At the end, offer at most one or two notes that would change what agents do later ("You cycle to
  work, so a morning brief should mention rain and wind. Shall I remember that?"). One short sentence
  each with `remember`, and an end date (`until`) for anything temporary.
- Never save guesses as facts, and nothing sensitive (health, money, relationships, where they live)
  unless they ask for it.
- How they like agents to talk to them fits Agent Guidelines better than a note: offer that instead.

## 7. Close, and offer to go on another day

- A short summary: what you heard (three to five lines, in their words), what was set up and where,
  the idea left for later, anything still open. The form is in `references/questions.md`.
- Offer to continue another day. A reminder to pick it up is a second thing to set up: only if they ask.
- Say only what really happened: a task exists once its card was confirmed, a note once `remember`
  succeeded.

## Limits

- This is practical help, not therapy, nor medical, legal or financial advice. If they mention a
  crisis, danger or self-harm, stop the questions, answer with care, and point them to emergency
  services or a helpline.
- Nothing that watches another person without their knowledge.
- Keep private details out of task prompts and pages beyond what the job needs: anyone with a page's
  address can open it.

## Pitfalls

- A questionnaire: several questions in one message.
- Advice after every answer, before the need is clear.
- A feature, setting or service named without checking it.
- Ten ideas at once, or a whole system where a reminder would do.
- Setting something up before they said yes, or several things at once.
- Memory notes nobody asked for, or long ones.
- Going on past 15 questions when they have had enough.
