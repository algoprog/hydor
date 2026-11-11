# tt

A small command-line time tracker. You record what you worked on, tt adds it up by day, week and project, works out
what it is worth at each project's hourly rate, and reads and writes CSV for spreadsheets. Plain Node.js 22, no
packages; run it as `node src/cli.mjs` or, once installed, as `tt`.

```
tt add <project> <start> (<end> | --for <duration>) [--note <text>]
tt start <project> [--note <text>] [--at <local time>]
tt stop [--at <local time>]
tt report [--week YYYY-Www | --from YYYY-MM-DD --to YYYY-MM-DD]
tt export
tt import <file.csv>
```

Every command also takes `--data <file>` (the data file, `./timesheet.json` by default) and `--now <local time>`
(what "now" is, for the commands that need it; the current time by default). The tests run with `npm test`.

## The data file

One JSON file holds everything. tt never creates it: write the first one by hand.

```json
{
  "timeZone": "Europe/Athens",
  "currency": "EUR",
  "rates": { "acme": 9000, "globex": 7550 },
  "entries": [
    { "id": 1, "project": "acme", "start": "2025-10-25T22:00", "end": "2025-10-26T06:00", "note": "night deploy" }
  ]
}
```

- `timeZone` is an IANA time zone name. Every time in the file, and every time you give tt, is a **local time** in that
  zone, written `YYYY-MM-DDTHH:MM`: to the minute, with no offset. The machine's own time zone is never used.
- `rates` are cents per hour, whole numbers, by project. A project with no rate is tracked but has no amount.
- An entry has an `id`, a `project`, a `start`, an optional `end` and an optional `note`. An entry with no `end` is a
  running timer. There is at most one at a time.
- A project name is made of letters, digits, `.`, `_` and `-`. A new entry gets the id one higher than the highest in
  use (1 in an empty file).

## Commands

**add** appends an entry and prints `added #<id> <h:mm>`: the id and how long it lasted. Give the end as a local time,
or give `--for` and a duration (below) and the end is that long after the start. The end must be later than the start.

**start** begins a timer at `--at`, or now, and prints `started #<id> <start>`. It is an error while another timer runs.
**stop** ends the running timer at `--at`, or now, and prints `stopped #<id> <h:mm>`. It is an error when no timer runs
or when the end would not be later than the start.

**report** prints the report described below, for a week (`--week 2025-W43`), for a range of dates (`--from` and
`--to`, both included, in `YYYY-MM-DD`), or, with neither, for the week that contains today (that is, the date of `--now`).

**export** prints the entries as CSV, **import** adds the rows of a CSV file (see "CSV").

**Errors.** When something is wrong (an unknown command or option, a value that does not make sense, a missing or
broken data file) tt prints a message on stderr, exits with code 2 and prints nothing on stdout. A command that fails
changes nothing in the data file.

## How time is counted

**Weeks** are ISO weeks: they run Monday to Sunday, and week 1 is the week with 4 January in it. So 2024-12-30 is in
2025-W01, 2021-01-01 is in 2020-W53, and 2020 has a week 53 (2021 does not). A week report lists all seven days,
days without any time too.

**Durations** are real time. An entry lasts the time that passed between its start and its end, in whole minutes,
whatever the clocks did in between: on the night the clocks go back, 22:00 to 06:00 lasts 9:00; on the night they
go forward it lasts 7:00. A local time that happens twice (when the clocks go back) means the first of the two. A
local time that does not exist (skipped when the clocks go forward) is an error when you add, start or stop an
entry: `no such time in Europe/Athens: 2025-03-30T03:30`. With `--for`, the end is the local time that is that much
real time after the start. Durations are shown as `h:mm`: the hours are not padded and may pass 24 (`26:30`).

**Which day.** An entry counts on the local date it starts on; it is not split at midnight. In one day's total, time
covered by more than one of that day's entries counts once. The total of a week (or of a range of dates) is the sum
of its days. A project's total counts each of its entries in full, so when entries overlap the projects can add up
to more than the total.

**A running entry** counts up to now (`--now`, or the current time) in the reports and in the export.

### Durations for `--for`

`90m`, `2h`, `1h30m` (minutes below 60), `1:30` (hours, then minutes always as two digits below 60: `1:5` and
`1:60` are errors) and `1.5h` (decimal hours, rounded to the nearest minute, halves up). Anything else is an error.

## The report

```
Week 2025-W43 (2025-10-20 to 2025-10-26)
Mon 2025-10-20    7:30
Tue 2025-10-21    0:30
Wed 2025-10-22    8:45
Thu 2025-10-23    0:30
Fri 2025-10-24    6:00
Sat 2025-10-25    9:00
Sun 2025-10-26    0:00
Total            32:15

acme             22:30   €2,025.00
globex            9:15     €698.38
internal          0:30
```

(Saturday is a night deploy from 22:00 to 06:00 in Europe/Athens, where the clocks went back that night; it counts
on Saturday, the day it started. `internal` has no rate.)

- The first line is `Week <id> (<first date> to <last date>)`, or `Report <from> to <to>` for a range.
- Then one line per day: the day's name and date, and its total. Then `Total`.
- Then a blank line and one line per project that has entries in the report, in alphabetical order, with the
  project's total and, if the project has a rate, its amount. When there are no entries the report ends at `Total`.
- A name or label takes 14 columns, a duration is right-aligned in the 8 after it, an amount is right-aligned in the
  12 after that. Every line ends with a line feed.

### Amounts

A project's amount is its total minutes in the report × its hourly rate in cents ÷ 60, rounded to the nearest
cent, halves up. It is rounded once, for the project's total, not once per entry. It is shown with the currency's
symbol (`EUR` €, `USD` $, `GBP` £; any other currency is shown as its code and a space, `CHF 1,234.56`), thousands
separators and two decimals: `€1,234.56`.

## CSV

`tt export` writes the header `id,project,start,end,minutes,note` and one row per entry, in the order of the data
file. A running entry has an empty `end` and the minutes so far. Every row ends with a line feed.

The format is RFC 4180 for what goes inside a row: a field that contains a comma, a double quote, a CR or an LF is
enclosed in double quotes, with its double quotes doubled. Other fields are written as they are, with their spaces.

`tt import <file>` reads such a file, with or without quotes, with line feeds or CR LF between rows, and quoted fields
may contain line breaks. The first row must be the header. It adds one entry per row with new ids, in the order of
the file, and prints `imported <n>`. The `id` column is not used, and the `minutes` column is not trusted: minutes
are always worked out from the start and the end. A row with an empty `end` becomes a running entry. Each row is
checked as `tt add` (or `tt start`) checks its arguments; if any row is wrong, nothing is imported.

Exporting and importing the result into an empty data file gives the same rows again.
