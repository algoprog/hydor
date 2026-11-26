# The web app benchmark: what it costs an agent to build a small web app from a description, and whether the result is right

**What it measures.** Fourteen plain descriptions of a small web app ("briefs": the maker's own words, their answers to a builder's questions, a change request, and what a judge expects), each
built by a fresh agent in an empty folder, and **one judge** that starts the app it left and tests what it does over HTTP. For each run it records the lines of the judge that pass (10 to 20 a
brief), the cost, the time, the tokens and the size of the app, and for a change request the same again. Its purpose is to **measure what a build costs as Hydor's own guide for building apps
changes** (and, as easily, as the model, the tools or anything else the person driving the runs sets apart): each set of runs gets a **label** (a date, a model, a version of the guide), and
`report.ts` sets the runs of one label beside those of another, brief by brief, with medians and bootstrap intervals, in three groups of briefs. Nothing here starts an agent or calls a model: a
person (or a script of theirs) drives the builders and writes down what they cost.

**What it cannot measure** is in the section "What the judge cannot tell" below. In short: how an app looks, what it does in a browser with scripts, security beyond who may see which rows and where
secrets are, anything the description does not name, and whether fourteen chosen descriptions stand for all of them. A builder is not deterministic, and one run of a description under a label says
nothing of its own spread: the intervals in a report come from drawing the briefs again, not the runs. The first measurement made with it (`results/2026-11-26-kit-0.6.1.md`) is a record of
a comparison that is over; see "The record" at the end.

```
scripts/webapp-bench/
  README.md, ACCEPTANCE.md      this file; what builders are told about judge.json (and, in one optional section, hydor.json)
  instruction/                  build.md (the instruction for a build) and change.md (for the change request)
  briefs/NN-slug/               brief.md, answers.md (given to builders); change.md (given for the change); expect.json, expect-change.json (never given)
  prepare.ts                    makes one run's folders, the prompt and run.json
  collect.ts                    judges what a run left, measures it, runs Hydor's contract check if the app has a hydor.json; writes result.json
  report.ts, stats.ts           the tables and the summary between two labels; median and bootstrap
  cost.ts                       the cost of a run worked out from its tokens
  judge.ts                      the judge: node scripts/webapp-bench/judge.ts <app> <brief folder> [--port n] [--change] [--json]
  hydor.ts                      the hook for Hydor's contract checker (skills/web-app-builder/references/hydor-check.mjs)
  acceptance.ts, appproc.ts, http.ts, things.ts, larger.ts, expect.ts, expect-base.ts, lib.ts, measure.ts, rules.ts, rules-larger.ts, plans.ts
                                the judge's parts (see the heads of the files)
  selftest.ts                   the proof that the judge is fair: reference apps and deliberately broken copies
  logic.test.ts, plans.test.ts, lib.test.ts, unit.ts      unit tests, and what they use (node:test)
  fixtures/hand/                seven reference apps written by hand (plain Node and SQLite) and lite.js, the few calls of Express they use; fixtures/rules-app/, the rules of four briefs as a small app
  results/                      one file for each measurement worth keeping, and TEMPLATE.md
```

It uses Node's own modules and one package this repository already has, `better-sqlite3`, for the reference apps (nothing is installed: they link it). The judge, the scripts and the unit tests need
nothing else. Node 22.18 or later runs the `.ts` files as they are (type stripping); older ones need `--experimental-strip-types`.

## The fourteen briefs, in three groups (chosen, not drawn)

| Brief | Group | What it asks |
| --- | --- | --- |
| 01-kiln-share | small apps with accounts and lists | a waiting list nobody but the owner reads; name needed |
| 02-veg-box | small apps with accounts and lists | a sign-up list with its own questions, read by the team, open sign-up |
| 03-salt-road | small apps with accounts and lists | email only, a second public page |
| 07-food-bank | small apps with accounts and lists | shared stock and deliveries, three numbers on the home page |
| 08-choir-rota | small apps with accounts and lists | singers, rehearsals and jobs, with an average |
| 10-translator | small apps with accounts and lists | each person's own clients and jobs, with money and a file |
| 13-dough-sums | small tools that are mostly their own logic | a sourdough calculator with rules of its own; nobody signs in; nothing kept |
| 14-market-takings | small tools that are mostly their own logic | one page that reads a card-reader file the person drops in and sums it |
| 15-times-tables-race | small tools that are mostly their own logic | a ten-question game with stacking bonuses and a kept board of the five best |
| 16-seed-calendar | small tools that are mostly their own logic | a planting schedule from a date and some crops, every job on a Saturday |
| 17-rowing-club | larger apps | a membership club: accounts, a chair and two helpers with different rights, members' own records, a public page, a monthly fee the payment service tells the app about |
| 18-crews | larger apps | a team tool: several crews each seeing only their own rows in three kinds of thing, invitations by link with a role, a person in two crews, a person taken out losing access at once |
| 19-help-centre | larger apps | fifty articles by the owner, public reading at an address made from the title and kept, search whose results are in the HTML, drafts never shown, a page for each category |
| 20-booking-page | larger apps | weekly hours, visitors book a free half hour without an account, nobody booked twice (six requests at the same moment), the owner cancels, days off, UK time in summer and winter |

In a plan (`expect.json`) the groups are `accounts`, `logic` and `larger`; the report calls them by the plain names above. **They are chosen, not drawn.** The six small apps with accounts and lists differ
as much as six can; the four small tools have no accounts or lists of rows, the work is the rule or the interface; the four larger apps each need several things at once (accounts with roles, rows that
belong to a team, invitations, a payment provider's word, search, a concurrency rule). A median over one group says what happens for descriptions like it, not for descriptions in general, and four
pairs make a small group.

**What budget and time a description should be given.** The small ones: **15 US dollars and 60 minutes** (the defaults of `prepare.ts`). A larger one: **45 US dollars and 150 minutes**, about three
times, because it has about three times as much to do and to try (roles and a matrix of who may do what, a second kind of person, a second team, fifty rows, a rule that has to hold under concurrent
requests); a builder that stops at the limit leaves what it has, and the judge scores that. Whoever drives may choose other numbers, but the same for every run that is to be compared, and written in
the results file. (The first measurement gave 10 dollars and 60 minutes, 30 dollars and 120 minutes; no run came near either, the dearest cost 3.58 dollars.)

## One run, step by step

For one brief under one label (`<brief>` is a folder name in `briefs/`, `<label>` is what sets this run's set apart, `<runs>/<name>` is a new folder for this run, such as `<runs>/07-food-bank-<label>`):

1. `node scripts/webapp-bench/prepare.ts <brief> <label> <runs>/<name> --model <name>` (add `--budget-usd <n> --minutes <n>` to change the defaults above) makes `brief/` (INSTRUCTION.md with your numbers,
   brief.md, answers.md, ACCEPTANCE.md and nothing else), an empty `app/`, `PROMPT.md` and `run.json`. **Never** give the builder `expect.json`, `expect-change.json`, `change.md`, `judge.ts` or
   anything else from this repository.
2. Start a **fresh agent** (no memory of earlier runs) with `app/` as its working folder and `PROMPT.md` as its first message, in the setting the label stands for: the model, the tools, and, when what
   you measure is Hydor's guide, the version of the guide it can read. The same setting for every run of a label; no web search and no folder but its own and `brief/` besides what the setting gives it
   (enforce it if you can, and read the transcript for it afterwards). Stop it at the budget or the time.
3. Write down, from its first message to its report: the time (seconds), the tokens (input, output, read from the cache) and the cost, in `<runs>/<name>/run.json` (`seconds`, `costUsd`, `tokens`,
   `model`, `notes`). The cost includes writing `judge.json`. On a subscription nothing is billed per run: see the next section.
4. `node scripts/webapp-bench/collect.ts <runs>/<name> --port 4760` judges what it left (builds it with the command in `judge.json`, starts it in production in an empty data folder, uses it), measures it,
   runs Hydor's contract check when the app has a `hydor.json` (below), and writes `result.json`. About one to three minutes; exit code 0 when every line passed. Ports 4760 to 4769 are the ones this
   folder uses.
5. After all the runs of the labels you compare: `node scripts/webapp-bench/report.ts <runs> --out scripts/webapp-bench/results/<date>-<what>.md` (add `--labels <first>,<second>` when the folder has more than two
   labels; the first is the earlier or the baseline, and every difference is the second minus the first). Fill the header from `results/TEMPLATE.md`. No path of any computer in it.

**The change request (the second measure).** For each run whose app builds, after step 4: `node scripts/webapp-bench/prepare.ts <brief> <label> <runs>/<name> --change --budget-usd <n> --minutes <n>` copies the
built app to `app-change/`, and makes `brief-change/` (the change instruction, brief.md, answers.md, change.md, ACCEPTANCE.md) and `PROMPT-change.md`. Start a fresh agent in `app-change/` with the same
setting, record cost and time in `run-change.json`, then `node scripts/webapp-bench/collect.ts <runs>/<name> --change` judges it against `expect-change.json` (the same lines, with the change in them)
and counts the lines and files changed since the build. `report.ts` adds the change table. A change is made on the app as it was left, wrong or not: that is what it costs to change what people were given.

**One run of a brief for each label.** A label holds one run of each description; `report.ts` refuses two. To see a builder's own spread, repeat the set under a label of its own (`<label>-again`) and
compare the two.

**Without a builder, to see the plumbing work:** copy a reference app (`fixtures/hand/kiln`, plus `fixtures/hand/lite.js`, and a `node_modules/better-sqlite3` link to this repository's) into the `app/` of a
prepared run, fill in `run.json`, and run steps 4 and 5. `selftest.ts` does this for every reference app.

## How the cost of a run on a subscription is worked out

A builder that runs on a subscription is billed nothing per run, so its cost is worked out from its tokens, at the model's prices per million tokens: new input and input written to the cache at the
input price, output at the output price, input read from the cache at the (much lower) cache-read price. `node scripts/webapp-bench/cost.ts <input> <output> <cache read> [--rates in,out,cache]` does the
sum. The first measurement used 2 dollars per million input, 10 per million output and 0.20 per million read from the cache. Take the prices of the model you ran from its price list, use the same for every
label you compare, and write them in the results file: a report says "cost" for what is in `run.json`, and cannot tell a billed cost from a worked-out one. Time is the builder's working time from its first
message to its report; a second turn the driver allowed counts, and the notes in `run.json` say so.

## Labels and the report

A label is any text without a comma that tells two sets of runs apart: `2026-12-10`, `sonnet-5-5`, `guide-0.116`. The report has one table of every run; then, for the two labels compared, a row for each of
the three groups, the briefs of each group side by side, a summary (checks passed, cost, time, lines in the app, builds that start; medians of the differences with 95% bootstrap intervals), the lines each
label fails, and where the second label is worse than the first. What changed between the labels is the driver's to say, and to keep to one thing: the report cannot tell a change in the guide from a change
in anything else that moved with it.

## The acceptance interface

`ACCEPTANCE.md` is given to the builder as it is. It asks for one command that starts the app in production on a port and in a data folder the environment gives, and for `judge.json` at the app's root:
how to start (command, the names of the environment variables for the port and the data folder, the secrets), how to make an account and sign in, the home page, and, for each kind of thing the brief names,
the address that lists a person's rows, the one that adds, the one that reads, changes and removes, and the names of its fields; for a rule (a calculator, a file to read, a game), its address, its inputs and
its answers. **The judge believes `judge.json` only about where things are.** Everything it concludes it tests.

## `hydor.json`: the hook for Hydor's guide

The descriptions are written for a builder with an empty folder, and the judge knows nothing of Hydor. The acceptance page has one short **optional** section: an app may also carry a `hydor.json`, the contract by
which Hydor runs an app (`skills/web-app-builder/references/hydor-contract.md`). The page does not teach it: what a builder knows of it should come from the guide being measured.

When the app has one, `collect.ts` also runs Hydor's contract checker (`skills/web-app-builder/references/hydor-check.mjs`, from this repository, as a child process, on the five ports from the one given, up to 4769) and puts its lines
in `result.json` as a separate group, `hydor`: **they are not in the judge's score**, so scores stay comparable between runs that have one and runs that have not. The report adds a column to the table of every run and a
section beside the tables for these lines, and only when some run had a `hydor.json`.

**When judge.json and hydor.json disagree.** They overlap in how to start (`start.command` and `start`), the variables for the port and the data folder (`start.port`, `start.data` and `env.port`, `env.data`), the
build command and the address that says the app is ready (`start.ready` and `ready`). Each is read by one reader only: the judge reads **only judge.json** (so judge.json wins for the score, every line of it), and the
contract checker reads **only hydor.json** (so hydor.json wins for the group). Where both say something about the same thing and it differs, the group's first line, **`agree`**, fails and says what; a thing only one
of them says is no disagreement (judge.json's ready address and build are optional). Nothing from hydor.json changes what the judge requires, and a missing or wrong hydor.json costs the score nothing.

## The fairness rules: what the judge may require is only what the maker's words require

The maker's words are `brief.md` and `answers.md` (and `change.md` for the change request), and nothing else. A benchmark must not turn what a framework or a starting template happens to bring (an email for a waiting list, a
`remove` for every row) into something a builder is failed for leaving out. So, for every plan (`expect.json`, `expect-change.json`):

1. **A field is needed only if the maker's words need it**: it is in `brief.md`, or `answers.md` says it is "needed". A field that `answers.md` mentions only as an optional answer to a question a builder
   may never have asked, or that no words of the maker ask for, is `"mayHave": true`. When the builder's `judge.json` maps a key for it, the judge sends it in every row and tries it as described (an email is
   checked as an email, a number within the maker's limits; it is never tried as *needed*: the app may make it so, or not). When `judge.json` maps none, the judge leaves it out of every row and every check, and
   nothing fails for its absence. A field of the app that is none of the brief's (one it asks for anyway) is listed in `judge.json` too and is sent as it is.
2. **Nothing identifies a row by a field that may be absent.** Wherever the judge finds its rows again (after adding, after a restart, for the visitor and second-person checks, for change and remove) it uses
   the fields the app actually has: a text of the app's own (a name, a title), an email only when there is nothing else. The line says which fields it used and which it left out.
3. **A way of holding what the maker said that the words allow is accepted.** Where the words leave it open the plan says so: `needOne` (the maker needs *some* answer to "what would you use it for: how many boxes,
   small or large, how often", however the app holds it: one question or several, a number or words), `open` (any words), a phrase written `re:<pattern>` (one phrase for every way of saying it the words allow:
   "every second Thursday" / "every other Thursday" / "fortnightly on Thursdays"), the product name with "&" or "and", a date in an answer written as a person writes it, "nothing" for an unanswered question as
   null or as empty text, a list of rows as a list, an object or lines of words. Reading one row by its own address and removing one are tried when `judge.json` gives them and never required; only changing a
   row is required, and only where the maker's words say people change rows.
4. **The maker's own words are always accepted as names.** Every kind of thing, field, input and answer of a plan has a `said` entry that quotes the phrase the maker uses for it in `brief.md`, `answers.md` or `change.md`
   ("what it is", "how many we have", "the day it is due"), and that phrase is among the names accepted for it, word for word (capitals, spaces and a plural do not matter). `plans.test.ts` holds this for every
   field of every plan: the quote is really in the maker's words, and the judge's own matching accepts it. The same test holds that every word of a choice and every role is one the maker uses. Numbers on the home page
   have no name to match: they are found by what they come to. A name a builder gives that is longer than the maker's (a phrase of seven letters or more found inside it) is accepted when it fits one field best; a short
   or common word that two fields' lists shared ("number", "name", "which", "score") is not in either list, so that it is reported as unmatched instead of going to whichever field came first.
5. **Nothing is needed from `judge.json` that builders are not told to declare.** For every line of every description, what the judge needs from `judge.json` is either something `ACCEPTANCE.md` describes (an address, `accounts`,
   `payments`, `teams`, `site`, `slots`, `actions`) or a field the maker says a row holds (quoted in the plan). Anything else the judge learns by trying or is optional (`mayHave`). `plans.test.ts` goes through all fourteen
   plans and fails when a needed entry is neither. The case that made this a rule: in the club, "whether they have paid this month" is shown to the treasurer next to each member, worked out from payments; it is not something a
   member fills in, so it is no field to declare. `club-roles` and `club-payments` are judged by what the chair, the treasurer, the coach, a member who has paid, one who has not and one who paid only for last month can read, post, change
   and grant, with the payment service's secret right, wrong and absent. That the treasurer sees who has paid is looked at where it can be without an undeclared name: in the treasurer's list if `judge.json` names a field for it,
   else in the HTML of the pages the treasurer reaches from the home page (the member who paid is shown as paid in some form the words allow, the others are not), and if neither can be read that part alone is "not checked", and the
   line says why. Likewise changing a member's details is tried if `judge.json` gives a way, never required of the club (the maker only says who may *not* change them).
6. **What the judge still holds a builder to that the maker's words do not say** is what every builder is told in `ACCEPTANCE.md` and what a person who uses the app would need: it starts in production, stops, keeps
   what it keeps in one folder, says its words in the HTML (scripts are not run), keeps its secrets out of browser files, has a sign-in, answers the addresses `judge.json` gives. These are
   in the instruction and on `ACCEPTANCE.md` for every builder, so they cost every run the same; they are not the maker's words and the README says so here, once.

## How lines count: one disagreement costs one line

A line is `pass`, `fail`, `could-not-run` or `not-checked`.

- **`judge-json`** fails once for everything judge.json lacks that the maker's words need (a field, a key for an input or an answer, an address, `accounts`, `home`). When one of the builder's names matched nothing and exactly one
  field of the kind has no name, it says so plainly (your name "x" matches none of the maker's words and the field "y" has no name) and still fails: the judge does not guess which is which, and a reader sees at once whether the list of names is what is at fault.
- **A kind whose needed field has no name** cannot have rows sent or found, so it is **left out of every line about rows** (and so is any kind that points at it, and any number worked out from it), each of those lines saying "not checked for stock, because judge.json
  has no field for name; counted once, in judge-json"; the other kinds are checked as ever and the lines pass or fail for them. A line left with no kind at all is `not-checked`.
- Every other line **runs on what the app has**: with a field of the maker's unmapped, the rows are sent without it and the other fields are tried as ever. A line that needs what is missing and cannot be tried at all
  (no `accounts`, no `list` or `add` for any kind, no `home` for the numbers, no way to play for the score board, no key for any input of a rule, a second person who cannot be let in where the maker did not say who
  may make an account) is **`not-checked`**, says "not checked, because …", and is **left out of the count**: it is neither passed nor failed. A rule's case that needs a key judge.json lacks is not tried, said in the
  line, and the line is judged on the cases that were.
- **`could-not-run`** is for the app, not judge.json: the build failed, the app did not start, nobody could sign in. Those count as lines not passed (the same as a fail), because the app is what stopped them.
  A judge.json that is missing or cannot be read at all is this too: nothing could be found.
- The score is **passed of the lines that count** (`total` leaves out the `not-checked`; the result says how many were left out). Every line passed means `judge-json` and all the rest. So one field judge.json
  does not map costs one line of fourteen, not five, and the report shows "(+n not checked)" beside the score.

## The judge's lines

Each is one named line; the ids are stable. A brief has only the lines that apply to it, and every run of it has the same lines.

| Id | What it says |
| --- | --- |
| `judge-json` | judge.json is there and says where everything the maker's words need is: the kinds of thing with their addresses and the fields the maker needs (a field the maker does not ask for may be there or not), the home page for numbers, the ways in and out of each rule, and how to make an account. This is the one line that fails for a gap in judge.json; the lines that needed what is missing are said not checked and left out of the count. |
| `build` | The build command in judge.json (when there is one) works. |
| `starts` | The app starts in production on the port and in the empty data folder the judge gives, and answers within 60 seconds. |
| `name-shown` | The product's name, as the maker gave it, is on the first page, in the HTML the server sends. |
| `phrases-shown` | Each thing the maker's words need (each a list of ways to say it) is on a public page a person reads. |
| `second-page` | Each other public page the maker asked for answers and says what it was asked to say. |
| `no-secret-in-browser` | No secret from the app's environment is in a file a browser downloads (the pages, the files they load, the folders judge.json says are sent as they are). |
| `account` | A person can make an account and is let in, can sign in again with the same email and password, and a wrong password is refused (a 4xx). |
| `signup-policy` | Who may make an account is what the maker said: nobody but the first person, or anyone. |
| `add-and-read` | Everything added comes back: each row added (by a visitor where the maker said so) is in the list with each value as given. Rows are found again by a field the app has, said in the line. |
| `required-fields` | A field the maker said is needed cannot be left out or blank (refused, nothing kept); one the maker said may be left out can be. Fields the maker's words do not ask for are tried only if the app has them, and never as needed. |
| `bad-values` | Values that make no sense for a field (a fraction for a whole number, a day that does not exist, a word that is not a choice, a number beyond the maker's limit, a row that is not there) are refused and nothing is kept. |
| `change-remove` | A row is changed and the list shows the change (the maker's words say people change rows). Reading one row by its own address and removing one are tried when judge.json gives them, and never required. |
| `visitor-shut-out` | A visitor cannot list, read, change or remove anyone's row by any address (including the id guessed), cannot add where only people may, and finds no row on the home page. |
| `team-shares` | Everyone signed in sees the same rows, can add and change them, and sees what the others add (or, for a sign-up list, sees what visitors sent). |
| `others-cannot` | A second person cannot read, list, change or remove the first person's row by any address (including the id guessed), sees only their own, and their rows are not in the first person's. |
| `home-numbers` | Each number on the home page of a signed-in person, read from the HTML, is what their rows come to, and moves when rows are added. |
| `keeps-after-restart` | What was kept is still there after the app is stopped and started again in the same data folder. |
| `stops` | The app stops within 10 seconds when asked to (SIGTERM) and leaves nothing answering on the port. |
| `rule-cases` | The maker's own worked examples give the answers the maker's words give. |
| `rule-edges` | The cases where a rule is easy to get wrong (a boundary, a tie, a day that is not a Saturday, a quoted comma, a bonus that adds up) give the right answer. |
| `bad-input-refused` | Input that makes no sense is refused with a sentence and gives no answer. |
| `club-roles` | What each person may do is what the maker said: the chair (the first account) sees and changes everything and gives the two helpers their roles (nobody else can); the treasurer sees everybody's details and cannot change them; the coach posts notices and sees only their own details; a member sees only their own details and cannot post. |
| `club-payments` | The payment service's word is believed only with the shared secret; a member who has paid for this month reads the notices and one who has not (or paid for last month) cannot; the treasurer sees who has paid. |
| `teams-isolation` | Each team sees only its own rows in all three kinds: nobody reads, lists, changes or removes another team's row by any address (the id guessed too), and cannot put a row into a team they are not in. |
| `teams-invite` | A lead invites a person into the team by a link with a role; the person follows the link and has that role; a member cannot invite or remove anyone. |
| `teams-two` | A person in two teams sees the rows of both, and can add to either, and to no third. |
| `teams-removal` | A person the lead takes out of a team loses access to its rows at once (their own session, the very next request) and keeps the other team. |
| `kb-reading` | A published article is on a public page whose address is made from its title as the maker's rule says, with its title and words in the HTML; a draft's address shows nothing. |
| `kb-search` | A search shows the published articles with every word of the query, in the order the maker said, in the HTML, and never a draft. |
| `kb-category` | A category's page lists its published articles in the order the maker said, and never a draft. |
| `kb-address` | An article's address stays the same when its title is changed, and shows the new title. |
| `kb-drafts` | A draft is not found by search, on a category page, at its address or in a visitor's list; a visitor cannot write; publishing a draft makes it appear and making it a draft again hides it. |
| `booking-slots` | A visitor sees the free slots the maker's rule gives for each day (every slot of the hours, none outside them, none on a day with no hours), a booked slot is gone, and a booking for a time that is no slot is refused. |
| `booking-once` | A slot booked by several requests at the same moment is booked exactly once: one is accepted, the rest are refused, and the owner has one booking. |
| `booking-cancel` | The owner cancels a booking and its slot is free again; nobody else can cancel. |
| `booking-dayoff` | A day off has no free slots and cannot be booked, and the other days are as they were. |
| `booking-timezone` | The times a visitor reads on the page are those of the maker's zone, in summer time and in winter time. |
| `board-rules` | The score board shows each name once with its best play, the best places only, best first, ties as the maker said. |

A line is "could not run" when an earlier step it needs failed in the app (the app did not start, nobody could sign in): the sentence says which. Line counts: 10 to 20 per brief. Runs of one brief never differ in which lines
exist, so a count of "passed of" is comparable between labels (apart from the lines left out as not checked, which the table shows).


## Three faults real runs found in the judge

The first measurement was run with the judge as written, and its first runs showed three places where the judge required something the maker's words do not. Each was fixed before any result was counted,
and every app was judged again after each fix. They are why the fairness rules say what they say.

1. **An email field nobody asked for** (the waiting list, brief 01, against the app built from scratch). The judge required an email field that nobody had asked for. Fixed: a field is needed only
   if the maker's words need it (rule 1); a field the maker did not ask for is `"mayHave"`, sent and tried only when `judge.json` maps a key for it, never as needed; and rows are found again by the fields the app
   actually has, never by one that may be absent (rule 2).
2. **The maker's own phrase for a field was not accepted** (the food bank, brief 07, against the app built with the framework). A builder named a field with the very words of the maker's answers and the judge did
   not know them. Fixed: every kind of thing, field, input and answer has a `said` entry quoting the maker's phrase, and that phrase is always among the names accepted for it (rule 4); `plans.test.ts` holds this
   for every field of every plan.
3. **A field no builder was told to declare** (the rowing club, brief 17, against both). "Whether they have paid this month" is shown to the treasurer next to each member and worked out from payments; it is no
   field a member fills in, yet the judge needed `judge.json` to name it. Fixed: nothing is needed from `judge.json` that builders are not told to declare (rule 5); that line is looked at in the treasurer's list
   if `judge.json` names a field for it, else in the HTML of the pages the treasurer reaches, else only that part is "not checked", and the line says why; `plans.test.ts` goes through all fourteen plans and fails
   when a needed entry is neither described in `ACCEPTANCE.md` nor quoted from the maker.

## What the judge cannot tell

- **How it looks**, on a phone or not; contrast; whether the words read well (only that the phrases the maker's words need are in the HTML).
- **What happens in a browser with scripts.** The pages are the server's first answer, read as text; a number a page fills in after it loads is not seen, and `ACCEPTANCE.md` says so to every builder.
- **A real payment provider.** The judge makes the call a provider would, reduced to "this person paid for this month", with a shared secret; signatures, retries and refunds are not tried.
- **Mail.** An invitation is a link in an answer; whether a mail is sent with it is not tried. **Concurrency** is six requests at the same moment for one slot: a race that needs more or other timing can pass. **Time zones** are Europe/London in a summer and a winter week; nothing else, and not the night the clocks change.
- **That the maker's data survives the change request.** Every judging starts in an empty data folder; what a change does to rows made before it is not tried (the instruction asks for it).
- **That `judge.json` is honest about where things are**, beyond what the judge finds by trying. A builder who points a name at the wrong address fails the line that needs it; one that
  lists a secret it does not have loses nothing (the judge plants one of its own).
- **A name it was not told.** Kinds, fields, inputs and answers are found by the maker's own words and a list of spellings; a right app with a word nobody listed fails with a sentence saying what
  was looked for, and then the list, not the app, is wrong.
- **Security beyond who may see which rows and where secrets are**: no injection, no sessions that outlive a password change, no limits on many requests, no mail. A visitor reaching a row through an
  address `judge.json` does not give and the list's own address plus the id is not tried.
- **Anything the plan does not name**: more than two people, other roles, a flood of rows, big files, other time zones (the app runs in Europe/London, days are UTC), other environments than a plain Node process.
- **The stack**: every app is held to one process and one data folder. An app that needs a database server, or a cloud service, is not what is measured.
- **Effort**: the lines-written number counts lines, not thought.
- **That the briefs are representative.** They were chosen, not drawn at random: six small apps with accounts and lists, four small tools that are mostly their own logic, four larger apps. Fourteen descriptions with one run each under a label is a small sample.

## The self-test: is the judge fair?

`node scripts/webapp-bench/selftest.ts [--keep] [--only <ids>] [--port 4760]` (about twenty minutes, nothing from the network; `last-run.txt` is its last output; `--only hand-club,club-` runs only the apps and spoiled copies whose id starts so, for working on the judge).

With no app it reads every brief's plan, the instructions and, for the four larger ones, the rules they are checked against (`rules-larger.ts`: the articles, searches and category pages, the slots of each day).
Then it makes **correct apps** by hand (`fixtures/hand/`: plain Node and SQLite; the calls of Express they make are in `lite.js`, so nothing is installed) and requires every line of each to pass: the kiln
waiting list twice, **with an email for each name and without one**, because the maker never asks for an email; the translator; and for each of the four larger descriptions one (`club`, `crews`,
`help-centre`, `booking`). Then **spoiled copies**, each wrong in one way, and the judge must fail exactly the lines about that mistake: a row readable by another person, a needed field not needed, a wrong number
on the home page, a secret in a browser file, an email that takes "not an address", sign-up left open, a list lost on restart; the payment service believed with any secret, last month's payment counted, a
treasurer who changes, any member who gives roles; a member who invites, a link used twice, a person in two crews who sees one, rows in everybody's lists, a removal that is said and not done; a search that finds
drafts, a visitor's list with drafts, an address that follows the title; two at once booked into one slot, a day off that can be booked, a page in UTC, a cancel that does nothing, any time taken. It ends by
saying which of the judge's lines have no spoiled copy of their own. `logic.test.ts` does the same for the four briefs of their own logic (a small app written from `rules.ts`), for the first build and the change,
and shows that a gap in `judge.json` costs one line (`judge-json`) and leaves the lines that needed it out of the count.

**What the proof holds, and what it does not.** Every line of the judge is shown to pass on a correct app. Not every line has a spoiled copy that fails it: `build`, `starts`, `name-shown`, `phrases-shown`,
`second-page`, `account`, `add-and-read`, `change-remove`, `team-shares`, `stops`, `kb-reading` and `kb-category` are held by the correct apps passing them and by the lines of the spoiled copies that must
*not* fail them, but no copy is broken in exactly that way. The self-test prints that list at its end, so a new one is seen.

## Checks, and how to run them

```bash
npm run typecheck                                        # the repository's own; its tsconfig includes scripts/, so this folder is in it
node --test scripts/webapp-bench/*.test.ts               # the unit tests (node:test; the briefs, the report, the statistics, the Hydor group, the rules, the judge on four briefs); about 20 seconds, uses port 4768
node scripts/webapp-bench/selftest.ts                    # the proof that the judge is fair; about twenty minutes, uses port 4760
```

`npm test` does not run them: it looks for tests only in `server/`, `shared/` and `web/src/`, and the self-test takes too long for it. Keep `CUDA_VISIBLE_DEVICES` empty, as for every test here; the judge starts
every app with it empty.

## Adding a brief

A larger description also needs its own part in `expect.ts` (`club`, `teams`, `kb`, `booking`), a rule file entry in `rules-larger.ts`, a reference app and its spoiled copies in `selftest.ts`. Make
`briefs/NN-slug/` with `brief.md`, `answers.md`, `change.md`, `expect.json`, `expect-change.json` (with `group`: `accounts`, `logic` or `larger`); `plans.test.ts` reads it for mistakes (rows that point to
rows that exist, numbers that move, cases that have an answer, no program words in the maker's words, every field's phrase quoted from the maker's words).

## The record

`results/2026-11-26-kit-0.6.1.md` is the measurement this harness was first built for: the same descriptions built with a framework ("the kit", since dropped) and from scratch, six of the fourteen, one run of each
per description. From scratch passed as many lines every time and cost between 31% and 52% of the kit's cost, so the framework was dropped. The file is kept as it was, its "kit" rows and columns included, with one
paragraph added at its top; the apps those runs made are not in this repository, and this harness no longer has the kit's arm, its columns or its group name.
