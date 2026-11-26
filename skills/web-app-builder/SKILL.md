---
name: web-app-builder
description: "Use when someone wants a web app: a product people sign in to, come back to, keep things in or find on the web (customers and jobs, bookings, a members area, a shop, a team tool), or a web app already made here needs a change."
category: app
triggers: [web app, webapp, web site with accounts, people sign in, customer portal, client area, members area, booking site, online shop, store for, saas, dashboard for my team, an app for my business]
---

# Building web apps

You write the app, in any stack, in its own folder; Hydor runs it because it meets a small contract. **Read
`references/hydor-contract.md` before your first line.** The person usually does not program: they pick, you do, in
plain words. A one-off job answered in a card (research, a daily summary) is not a web app: use the app-builder skill.

A new app: its folder is yours already when the session started from the Apps page, else `webapp_new {name}`. An app
that exists: `webapp_get` first.

## The person

Speak as the "How to speak" line says (it comes with `webapp_get`): with Technical details off, a saved step is not a
commit, put it online is not deploy, a key is "a key from Stripe", and no file, command, variable or error text.

- **One thing at a time**, as a card with a few choices in plain words (`webapp_choose`; each has "You decide"
  already). Never ask what you can sensibly decide, nor anything technical (a stack, a database, a file).
- **Show something early:** the sketch, then the designs; once picked, build and `webapp_run {action: "open"}` as soon
  as the first screen runs, then carry on.
- **Say what you are making** as you start each part: `webapp_steps {action: "doing", doing: "Making the list of
  customers"}`. An app with no name of theirs: give one there (`name`).
- **Try it:** keep `docs/try.md`, a list of three to five things to try in their words, from the brief ("- Add a
  customer and find them again"). Update it when what the app does changes.
- With Technical details off, to put it online point them to **Put it online** on the app's page (it takes them
  step by step, a server included): don't set a server up in the conversation.
- A message "I tried … and something is wrong" is about that item: fix it, save a step, say it is fixed. "Please fix
  what the checks found": fix every line, check again, say in plain words when it is done.

## Stages

Say the stage as you save a step (`webapp_steps {action: "save", message, stage}`). Going back is fine. If they say
"just build it", make the calls yourself and say what you assumed.

1. **Brief.** Settle what it is for, who uses it, what it keeps and who may see what. Show the sketch (`app_sketch`,
   kind `web`) and wait. At most three questions, only those that change the app, each with a few choices. A choice
   that brings in an outside service with a key of its own (mail sent out, payments, texts) says so in its words, and
   the one you assume needs none where the app works without it. When they say build, write it to `docs/brief.md`.
   A site that keeps nothing and no one signs in to (a portfolio, a personal page, an event page) is not a web app:
   static pages in the folder, published with `publish_site` at a public link, with no server, no sign-in and no key.
2. **Design.** Write two or three directions as static pages of the app's own first screen (`design/<name>.html`: one
   file each, inline CSS, made-up content, `prefers-color-scheme` for dark and light, fine at 390 px). Not three apps.
   `webapp_choose {shape: "designs", stage: "design", designs: [{id, name, line, page}]}`; keep the pick in one
   stylesheet the app uses.
3. **Build.** `hydor.json` first, kept true. A step for each thing that works, said as the person would ("Added team
   invitations"), and `docs/try.md` before you finish. Sample data like their business, no real
   person's. Keep what people write safe (parameters in SQL, escaping, a library for passwords); with accounts, say who
   may see what for each list and test it.
4. **Check.** `webapp_contract_check` until nothing fails (it looks at the pages too; with accounts of its own, say in
   hydor.json how to make a test person, `accounts`, so signed-in pages are seen). Then do what the brief says people
   do, as a person and as a second one who must not see the first one's things, and look at every page with
   `webapp_look` on a phone and a computer. Say what you did not check.
5. **Launch**, when they say so: `webapp_launch`, inside this Hydor, or `place: "server"` once their server is added
   (`webapp_host`: a server they already have; for a new rented one, the app's **Put it online** page makes the server
   with one pasted text, which you are not given). An app with `"signIn": "hydor"` cannot go to a server.
6. **Run.** `webapp_status`, `webapp_backup`. A change is made to the version being changed, then launched again.

## Services and keys

An outside service (mail, payments, a database, a model of the app's own, sign-in with another account, maps…):
`webapp_services {need}` first (`references/services.md`). A need with a single service is not a question. Ask for all
of a step's keys together with `webapp_keys {ask: true}`; never ask for a key in the chat. For a key not in the catalog,
read the provider's current page for its steps.

## What keeps the cost down

Builds of the same apps both ways showed that a framework of its own cost more than it saved. So:

- A small app needs no framework and no build step.
- Keep everything it keeps in one folder (the data folder), SQLite if it needs a database.
- Use Hydor's sign-in (`"signIn": "hydor"`) when only its owner uses it, and it will only ever run inside Hydor; with
  accounts of its own, make the first account the owner's.
