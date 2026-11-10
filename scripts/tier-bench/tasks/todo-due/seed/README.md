# todo

A tiny todo list for the command line. The items are kept in a JSON file; set `TODO_FILE` to choose where
(the default is `todos.json` in the current folder).

```
node src/cli.mjs add <title>     add an item; prints "added #<id>"
node src/cli.mjs list            show the open items, one per line: "#<id> <title>"
node src/cli.mjs done <id>       mark an item done
node src/cli.mjs remove <id>     delete an item
```

Run the tests with `node --test`.
