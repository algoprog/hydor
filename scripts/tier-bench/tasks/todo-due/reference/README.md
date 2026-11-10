# todo

A tiny todo list for the command line. The items are kept in a JSON file; set `TODO_FILE` to choose where
(the default is `todos.json` in the current folder).

```
node src/cli.mjs add <title> [--due YYYY-MM-DD]   add an item; prints "added #<id>"
node src/cli.mjs list                             show the open items, earliest due date first (items with no
                                                  date last, ties by id): "#<id> <title>", plus " (due YYYY-MM-DD)"
node src/cli.mjs list --overdue [--today DATE]    only the open items due before today
node src/cli.mjs list --json                      the items shown, as a JSON array of { id, title, done, due }
node src/cli.mjs stats [--today DATE]             "open: N, done: M, overdue: K"
node src/cli.mjs done <id>                        mark an item done
node src/cli.mjs remove <id>                      delete an item
```

A date that is not a real calendar date (for `--due` or `--today`) is an error: a message on stderr and exit code 2.
`--today` defaults to the current date and exists so that results can be reproduced.

Run the tests with `node --test`.
