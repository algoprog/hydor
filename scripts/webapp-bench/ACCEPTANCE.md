# How your app will be checked: `judge.json`

When you are done, someone who has never seen your code will start your app and use it, over HTTP, the way people would. They do not know what you built it with, so you
tell them **where things are** in one file, `judge.json`, in the app's root folder. They believe that file only about where things are (an address, the name of an
environment variable, a key in some JSON). Everything else they find out by trying: that what is added comes back, that what is needed cannot be left out, that one person
cannot see another's rows, that the numbers on the home page are right, and so on. Writing `judge.json` is part of the work: do it as you go and keep it true.

## What the app has to do

- **Start in production with one command**, in the app's own folder, and listen on the port the environment gives it. Everything it keeps (a database, files) goes in the
  one folder the environment gives it, which is empty the first time. It has to be up within 60 seconds, to stop within 10 seconds when sent SIGTERM, and to still have
  what it kept when it is started again in the same folder. It is run in the Europe/London time zone, with `NODE_ENV=production`.
- **Say what a person reads in the page itself.** The checker does not run scripts: what a person reads (the name, the words the maker needs, the numbers on the home
  page) has to be in the HTML the server sends. An app may add scripts on top; it may not leave the words to them.
- **Keep secrets on the server.** Whatever the app reads from its environment as a secret must not be in any page, script, style or other file that is sent to a browser.
- **Answer in JSON** at the addresses you give below (a refusal is a 4xx with a sentence a person can read; a row added is a 200 or 201).
- **Tell people apart by the address they come from, if it limits anything.** The checker sends from several loopback addresses (127.0.x.y) and never sends a
  `X-Forwarded-For` header.

## The file

```json
{
  "version": 1,
  "build": "npm run build",
  "start": {
    "command": "node server.js",
    "port": "PORT",
    "data": "DATA_DIR",
    "env": { "SESSION_SECRET": "{secret}", "APP_URL": "{origin}" },
    "judgeEnv": { "ALLOW_SIGN_UP": "1" },
    "ready": "/",
    "secrets": ["SESSION_SECRET"],
    "browserFolders": ["public"]
  },
  "accounts": {
    "signUp": { "method": "POST", "path": "/api/sign-up", "send": "json", "body": { "name": "{name}", "email": "{email}", "password": "{password}" } },
    "signIn": { "method": "POST", "path": "/api/sign-in", "send": "json", "body": { "email": "{email}", "password": "{password}" } },
    "session": "cookie"
  },
  "home": "/home",
  "money": "units",
  "things": {
    "stock": {
      "list": { "path": "/api/stock", "rows": "rows" },
      "add": { "path": "/api/stock", "method": "POST", "send": "json" },
      "one": { "path": "/api/stock/{id}", "read": "GET", "change": "PATCH", "remove": "DELETE" },
      "idKey": "id",
      "fields": {
        "name": "name",
        "how many": "quantity",
        "best before": "bestBefore",
        "sort": { "key": "group", "choices": { "baby & household": "baby_household", "tinned": "tinned" } }
      }
    }
  },
  "actions": {
    "work out": {
      "path": "/api/work-out",
      "method": "POST",
      "send": "json",
      "input": { "loaves": "loaves", "loaf weight": "loafWeight" },
      "output": { "flour": "flour", "jobs": { "path": "jobs", "item": { "crop": "crop", "date": "when" } } }
    }
  }
}
```

That example has every part; **write only the parts your brief needs.** The checker asks of your app only what the maker's own words (`brief.md` and `answers.md`) ask for: a field the maker never asks for is yours to have or not, and nothing is lost by leaving it out (but if you have one, list it so that it can be sent, see `fields`). Names of things, of fields, of inputs and of answers are **the maker's own words** (every phrase the maker uses for something is accepted as its name, word for word: "what it is", "how many we have") from `brief.md`
and `answers.md` (any capitals, spaces or a plural are fine: "Best before", "best_before" and "bestBefore" are one). The checker finds each kind of thing, field,
input and answer the brief names by those words; one it cannot find is a failed line, so use the words the maker used.

### `start`: how to run it

- `build`: a command that makes the app ready to run (run once in the app's folder, before it is started, within 10 minutes). Leave it out when nothing has to be built.
- `start.command`: starts the app in production and stays running. It is run in the app's folder.
- `start.port` and `start.data`: the **names** of the environment variables the app reads for the port to listen on and for the folder to keep its data in. The checker
  gives them values (the folder is empty; the port is one it chooses). `HOST` is `0.0.0.0` and `NODE_ENV` is `production`.
- `start.env`: any other variables the app needs, with values. `{origin}` is the app's address (`http://127.0.0.1:<port>`), `{port}` and `{data}` are the port and the
  folder, and `{secret}` is a new random secret for each run: use it for anything the app wants secret (a session key). A value you write yourself is used as it is.
- `start.secrets`: the names (from `env`) that hold a secret. The checker looks that none of those values is in a file a browser gets. It also plants one secret of its
  own in the environment and looks for that too.
- `start.judgeEnv`: **only** for a brief that does not say who may make an account. If, in real use, your app lets in only the first person, or only people who were invited,
  say here which variables open it for the checker's second person (for example `"ALLOW_SIGN_UP": "1"`). The checker does not use `judgeEnv` where the brief says who may
  make an account (then it starts the app as the maker would run it).
- `start.ready`: an address that answers once the app is up (`/` if left out; any answer that is not a server error counts).
- `start.browserFolders`: folders (inside the app's folder) whose files are sent to browsers as they are, for example `public` or `.output/public` or `dist`. They are searched for secrets.

### `accounts`: making an account and signing in as a person

Leave it out when nobody signs in to your app.

- `signUp` and `signIn`: `{ method (POST if left out), path, send ("json" or "form"; json if left out), body }`. In `body`, `{email}`, `{password}` and `{name}` are the person's
  details, which the checker makes up for each person it needs (a password has letters and digits and is longer than ten characters). **Both are needed**: after a sign-up the
  person may be signed in already or not (the checker signs them in if they are not); it then signs the same person in again, and tries a wrong password.
- `session`: `"cookie"` (what the app sets is kept and sent back, which is what most apps do), or `{ "token": "token", "header": "authorization", "prefix": "Bearer " }` when the
  sign-in answers with a token (the path of it in the JSON answer) that goes in a header on every call after.

### `home`

The address a signed-in person goes to to see the numbers or the overview the brief asks for. The numbers have to be in the HTML (see above).

### `money`

`"units"` (the default): an amount of money is a number in the main unit (`72.5` for 72 euros 50). `"cents"`: it is a whole number of the smallest unit (`7250`).

### `things`: each kind of thing the brief names

For each kind of thing the maker names (a client, a job, a sign-up):

- `list`: `{ path, rows }`. A GET of `path` answers the signed-in person's rows as JSON: a list, or an object with the list under the key `rows` names (a dotted path); when `rows` is
  left out the checker takes the one list in the answer.
- `add`: `{ path, method, send }`. A POST (or the `method`) of the row's fields as JSON (or a form, with `"send": "form"`) adds one and answers 200 or 201 with the new row's id at
  `idKey` ("id" if left out), either at the top of the answer or in an object under `row`, `data` or `item`. Where the maker says visitors (people who are not signed in) add
  to it, such as a sign-up list, this address must take their rows.
- `one`: `{ path, read, change, remove }`. `path` is the address of one row, with `{id}` where its id goes. `read`, `change` and `remove` are each a method (`"GET"`, `"PATCH"`, `"DELETE"`), or `{ "method": "POST", "path": "/api/stock/{id}/update" }` when the way has an address of its own; change sends the row's fields as JSON, all of them.
  Give `change` where the maker's words say people change a row (the brief says); `read` and `remove` are tried if you give them and never asked for.
- `idKey`: the key of the id in a row ("id").
- `fields`: for each field the maker names, `"the maker's word": "key"`. How a value is written: a text as text; a whole or decimal number as a number; an amount of money as a number
  (see `money`); a day as `"YYYY-MM-DD"`; a yes or no as `true` or `false`; a choice as one of the maker's words (for a choice your app spells differently, write
  `{ "key": "...", "choices": { "the maker's word": "your word" } }`, or just the list of your words in `choices` for a field the maker did not give words for);
  a reference to another kind of thing as that row's id. A file (a photo, a PDF) is named here too (`"photo": "photo"`) but the checker does not send files.
  **List every field your app has for the kind**, the ones the maker did not name too: a name that is none of the maker's is sent in every row with an ordinary value (an address if the name has "mail" in it, else the word "Judge"), or with the
  `example` you give (`{ "key": "...", "example": "..." }`), so that a row is not refused for something the checker did not know of. A field of the maker's that your app does not have at all is simply left out of the list.

### `actions`: a rule the maker has

Where the brief is mostly a rule (a calculator, a schedule, a scoring game, a file to read), give the way into it: `{ path, method, send, input, output }`.

- `send`: `"json"` (the inputs as a JSON body), `"form"` (as a form), `"query"` (in the address, for a GET), `"multipart"` (the file as a part of the form, named by the key `input`
  gives it; the other inputs as parts too) or `"text"` (the file's text as the whole body). A list of values is a JSON list, or the key repeated in a form or a query.
  Nothing is `null` in a form: an answer left empty is an empty text.
- `input`: `"the maker's word": "key"` for each thing the maker gives. `output`: `"the maker's word": "path"` for each thing they get back: the dotted path in the JSON answer; for a
  list in the answer, `{ "path": "...", "item": { "the maker's word": "key in one item" } }`.
- The answer is JSON with a 200 or 201 when the input makes sense. When it does not, a 4xx with a sentence a person can read in `error` or `message`, and no answer.
- **The page and this address use the same rule.** The checker tests the address; a person uses the page. (An app that works the rule out twice, in two ways, is wrong in one of them.)

## For a description that needs more: roles, payments, teams, public pages, bookings

Only where the brief needs it. The words are again the maker's own.

- **A list that gives every row.** When the app pages its lists, put a page big enough for all of them in the address (`"/api/articles?pageSize=100"`); the checker adds about fifty rows to one list.
- **`accounts.grant`: the first person gives another a role.** `{ "path": "/api/grant", "body": { "email": "{email}", "role": "{role}" } }`, called by the first account (the owner), with the maker's word for the role
  (`treasurer`, `coach`). `accounts.roles` (`{ "treasurer": "finance" }`) says the app's word where it differs. The checker also has an ordinary person try to give themselves a role.
- **`payments`: the payment service tells the app that a person has paid.** The checker does not call a real provider. It makes the call a provider would, reduced to its meaning, "this person has paid for this month":
  `{ "path": "/api/payments/webhook", "method": "POST", "body": { "email": "{email}", "month": "{month}" }, "secretEnv": "PAYMENT_SECRET", "secretHeader": "x-webhook-secret" }`. `{email}` is the member's email
  address and `{month}` is the calendar month written like `2027-05`. The checker sets the **shared secret** in the environment variable `secretEnv` (it chooses the value, a new one for each run; the app reads it as
  any other secret and must not send it to a browser) and sends it in the header `secretHeader`, or in the body key `secretField`. The call must be believed with that secret and with nothing else. The checker then looks
  at what a member who has paid for this month, a member who has not, and a member who paid only for last month may do.
- **`teams`: crews, teams, groups.** `create` (`{ "path": "/api/crews", "body": { "name": "{name}" }, "id": "id" }`: makes one; `id` is where its id is in the answer), `invite` (`{ "path": "/api/invitations", "body": {
  "crew": "{team}", "email": "{email}", "role": "{role}" }, "link": "link" }`: `link` is where the link (an address of the app, or its token) is in the answer), `remove` (`{ "path": "/api/crews/remove", "body": {
  "crew": "{team}", "email": "{email}" } }`) and, when the link is not simply a page the person opens, `accept` (`{ "method": "POST", "path": "/api/invitations/{token}/accept" }`). `roles` gives the app's words for the maker's two
  (`{ "lead": "lead", "member": "member" }`). Each kind of thing whose rows belong to a team says `"teamKey": "crew"`, the key the team's id goes under when a row is added. The person following a link is signed in.
- **`site`: the public pages**, with `{slug}`, `{q}`, `{category}` (the title or name in lower case with hyphens) and `{categoryName}` (the name) and `{date}` where they go: `{ "article": "/help/{slug}", "search": "/search?q={q}",
  "category": "/help/category/{category}", "slots": "/book?date={date}" }`. What a person reads on them has to be in the HTML. A field the app makes itself (an article's address) is listed in `fields` as any other
  (`"address": "slug"`) and is read back, never sent.
- **`slots`: the free slots of a day as JSON** (`{ "path": "/api/slots?date={date}", "rows": "slots", "time": "time" }`). Each time is written `09:30` in the maker's time zone, or as an instant with its offset
  (`2031-07-14T09:30:00+01:00`) that is the right instant. A visitor's booking is an entry in `actions` (`date` as `2031-07-14`, `time` as `09:30`, `name`, `email`), and the owner's list of bookings and the address that cancels one
  (`one.remove`) are a kind of thing as above.

## Optional: `hydor.json`

An app may also carry a `hydor.json` at its root: the file by which Hydor, the program you may be working in, runs an app built in any stack. Nobody has to write one, and nothing
above depends on it. When the app has one, the checker also runs Hydor's own contract check on it, and says what that found **apart from the score**: its lines are not counted in
the lines above. Where to learn what a `hydor.json` says is up to what you were given to build with; this page does not say.

The two files overlap: how to start the app, the names of the variables for the port and the data folder, the build command and the address that says the app is ready (`start.command`,
`start.port`, `start.data`, `build` and `start.ready` here; `start`, `env.port`, `env.data`, `build` and `ready` there). `judge.json` is the file the checker believes about the app and its
score, and `hydor.json` the one Hydor's check runs the app by. Where both say something about the same thing and they say it differently, one more line, `agree`, fails, among Hydor's
lines and not among the score. A thing only one of them says disagrees with nothing. Keep the two true and the same.

## What is tried, in short

That it builds and starts and stops; that the name and the maker's words are on the pages a person reads; that an account can be made and signed in to, and a wrong password is refused;
that what is added comes back as it was given (every kind of value); that what is needed cannot be left out and nonsense is refused; that a row can be read, changed and removed;
that a visitor, and a second person, cannot list, read, change or remove a row that is not theirs by any address (the id guessed too); that numbers on the home page are what the rows
come to; that a rule gives the answers the maker's words give; that what was kept is still there after a restart; and that no secret is in a file a browser gets.
