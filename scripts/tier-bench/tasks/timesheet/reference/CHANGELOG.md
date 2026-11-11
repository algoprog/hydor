# Changelog

## Unreleased

- Fixed #12: weeks are ISO weeks (week 1 has 4 January in it), so 2025-W01 starts on 30 December and 29-31 December 2025 are in 2026-W01.
- Fixed #15: CSV export quotes notes with commas, quotes and line breaks, and import reads quoted fields.
- Fixed #17: `1:05` is 1 hour 5 minutes, and `1:5` or `1:60` are errors.
- Fixed #21: an entry lasts the real time between its start and end over daylight-saving changes, `--for` counts real time, and a time that does not exist is refused.
- Fixed #24: a project's amount is rounded once, from its total minutes, in whole numbers.
- Fixed #27: time covered by several entries of one day counts once in the day's total.
- Fixed #30: `tt report` counts a running timer up to now instead of crashing.

## 0.3.0 - 2025-09-18

- Project names are checked: letters, digits, `.`, `_` and `-` only.
- `tt import` refuses a CSV with a wrong row and leaves the data file untouched.
- The data file is written to a temporary file first and renamed, so an interrupted run cannot truncate it.

## 0.2.0 - 2025-08-04

- `tt start` and `tt stop` for running timers, and `--at` to give the time.
- `tt export` and `tt import`.
- `tt stop` refuses an end that is not after the start.

## 0.1.0 - 2025-07-01

- First version: `tt add`, `tt report` by week or by range of dates, hourly rates and amounts.
