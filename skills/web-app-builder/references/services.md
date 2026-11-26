# Outside services

When an app needs one (a database, mail, a model, payments, search, files, sign-in with another account, texts,
visits and errors, a domain, bot checks, maps), call `webapp_services {need}` before you name or wire one. Where it
runs is `webapp_places`.

- **One service offered:** not a question. Say in a line which you use and why, and go on.
- **Two or three:** the tool puts the card up; wait for the message with their choice. Don't ask again in words.
- **None needed yet** (SQLite on its disk, its own log): use that. `ask: true` only when they want more.
- `service:` only when they named it themselves.
- Never recommend a service that is not in the catalog without saying it is not in it. Look up a provider's current
  page before you quote a price from memory.
- Write the `keys` lines the message gives into `hydor.json`, as they are.
