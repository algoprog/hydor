# Kestrel Crews

Each crew sees only its own customers, jobs and notes.

## Running it

Needs Node.js 22.13 or newer.

    npm install --omit=dev
    NODE_ENV=production APP_URL=https://crews.example.co.uk DATA_DIR=/path/to/keep/data PORT=4950 npm start

| Setting | What it is | If left out |
|---|---|---|
| `APP_URL` | The address people type to reach the app. Invitation links start with it. | The address the lead is using |
| `DATA_DIR` | The folder everything is kept in. **Back this folder up.** | `data` beside the app |
| `PORT` | The port it listens on | 4950 |
| `HOST` | The network address it listens on | `0.0.0.0` |

Put it behind HTTPS before using it over the internet.

## Using it

1. **Make an account**, then create your crew. You are its lead.
2. On the crew's page, **invite** someone: give their email and choose lead or member. Send them the link yourself.
   They open it, make an account with that email (or sign in) and press **Join this crew**. A link works once.
3. **Take out** someone on the same page. They lose access at once, and any unused links they made stop working.

| | Member | Lead |
|---|---|---|
| See, add and change customers, jobs and notes | yes | yes |
| Delete a customer, job or note | no | yes |
| Invite and take out people, rename the crew | no | yes |

A crew always keeps at least one lead. People in two crews see both, with each row marked with its crew.

## Forgotten password

The app sends no email. Whoever looks after the computer runs this, with the same `DATA_DIR` as the app:

    node reset-password.js their@email.com "a new password"

## Checking it still works

    npm test
