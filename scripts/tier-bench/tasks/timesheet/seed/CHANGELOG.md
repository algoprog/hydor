# Changelog

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
