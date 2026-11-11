# Issues

## Open

### #12 Week 1 of 2025 is wrong
`tt report --week 2025-W01` starts on Wednesday 1 January and stops on Sunday 5 January, so it has five days instead
of seven. My calendar has week 1 of 2025 start on Monday 30 December. The hours I worked on 30 and 31 December are in
no week at all, and I see the same around the end of the year: on 30 December 2025 a plain `tt report` says
`Week 2025-W53`, but my calendar says that is already week 1 of 2026.

### #15 CSV export breaks on notes with commas
A note like `fixed login, then tests` shifts the columns when I open the export in Excel, and importing that export
into a new file mangles the note.

### #17 1:05 is read as 1:03
`tt add acme 2025-05-02T09:00 --for 1:05` adds 1:03. `1:5` is accepted too, and I would have expected an error.

### #21 Overnight shift on the night the clocks went back
My 22:00 to 06:00 entry on 25 to 26 October shows 8:00 in the report, but I worked nine hours and I am paid by the
hour. A colleague says the one on the night in March showed 8:00 when they worked seven. Also, `tt add` takes a
time like 03:30 on the night the clocks went forward without complaint, and that time never happened.

### #24 Project totals a cent off
The amount for globex in my report doesn't match total minutes × rate in my spreadsheet. I have three entries of
20 minutes each at a rate of 75.50 an hour: the report says €75.51, but one hour at €75.50 is €75.50. I think it's
`toFixed`, which is known to round 1.005 wrongly.

### #27 Overlapping entries count twice
I forgot to stop a timer, and added the same morning by hand. The timer ran 09:00 to 13:00 and my entry says 08:00 to
14:00, and the day shows 10:00 instead of 6:00.

### #30 report crashes while a timer is running
`tt start acme` and then `tt report` prints

```
tt: unexpected error: TypeError: Cannot read properties of undefined (reading 'split')
```

and exits with code 1. `tt export` works with the same timer.

## Closed

### #9 `tt stop` accepted a time before the start
Fixed in 0.2.0.

### #11 Project names with spaces broke the CSV
Fixed in 0.3.0: project names can no longer contain spaces.
