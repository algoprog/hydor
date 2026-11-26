# Eastgate Food Bank

Stock and deliveries, shared by the whole team, on phones and computers.

## Starting it

You need [Node.js](https://nodejs.org) version 22.13 or newer. There is nothing else to install.
In this folder, run:

    npm start

It prints the address to open, for this computer and for phones on the same Wi-Fi.
The computer has to stay on with the app running. To use it from anywhere, ask someone to put it
on a web host **with https** and a disk that is kept.

## First time

1. Open the app and choose **Set up the first account**. Do this yourself, straight away:
   the first account is the coordinator.
2. Open **Team** to see the **team code**.
3. Give volunteers the address and the code. Each makes their own account.

On a phone, use the browser menu's "Add to Home screen".

## Looking after it

- Everything is kept in the `data` folder. **Copy that folder somewhere safe regularly**, with the app stopped.
- A volunteer forgot their password: Team → Manage → Give a new password.
- A volunteer leaves: Team → Manage → Remove. The team code changes too.
- If *you* forget the coordinator password there is no reset, so write it down somewhere safe.

## Settings (for whoever hosts it)

| Name | What it does | If not set |
| --- | --- | --- |
| `PORT` | Port to listen on | 3000 |
| `HOST` | Address to listen on | 0.0.0.0 |
| `DATA_DIR` | Folder for the data | `data` |
| `ALLOW_SIGN_UP` | `1` lets anyone make an account with no team code. Leave unset. | unset |

A web host should start it with `node server.js` (not `npm start`), so that it stops cleanly.

`npm test` checks that the app works.
