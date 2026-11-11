# Security

Thank you for looking. This page says how to report a vulnerability in Hydor privately, what is in scope, and what
to expect.

## Report a vulnerability

Use GitHub's private vulnerability reporting:

1. Open [Report a vulnerability](https://github.com/algoprog/hydor/security/advisories/new) (on the repository,
   **Security → Report a vulnerability**).
2. Say what you found, the version of Hydor (**Settings → General → Release notes** shows it), and how to make it
   happen, with the smallest steps that do. A screenshot or a short recording helps.
3. Keep it to yourself until there is a fix and we have agreed on a date to say it in public.

Please do not open a public issue, a pull request or a post about a vulnerability before then. If you cannot use
GitHub's form, open a public issue that says only that you have a security report and how you would like to be
reached (put no details in it), or write through [algoprog.com](https://algoprog.com).

Hydor is looked after by one person, [Chris Samarinas](https://algoprog.com), so a reply can take a few days. A
report that holds up gets a fix in the next release, with its own entry in the release notes and, for anything
serious, a GitHub security advisory that credits you if you want to be named.

## What is in scope

Hydor's own code, in the latest release and on `main`:

- the server and the web app: sign-in and passwords, tokens, the vault, sessions, files, the API and its WebSocket,
  the Content Security Policy and the sandboxed origin for the files you open
- the desktop apps for Mac, Windows and Linux, and their updater
- the `hydor` terminal command
- the Docker image, `install.sh`, and the shipped configuration (what listens where, what is open by default)
- access to other machines, share links, the Telegram bot and other chat apps
- agents reaching what they were not given: another session's files, a confidential session's data going to a
  non-local model, a key read out of the vault

## What is not

- Bugs in what Hydor runs: Claude Code, Codex, Gemini CLI, OpenCode and the other agents, or the
  models behind them. Report them to their makers.
- What an agent does with the permissions you gave it: in **Full access** it runs commands without asking, with your
  computer account's permissions. A prompt injection that makes an agent do
  something you allowed it to do is the agent's and the model's problem first; a way round a check Hydor says it
  makes (an approval, the command sandbox, a confidential session) is in scope.
- A Hydor you opened to the internet without HTTPS or a password, against [the advice](docs/remote-access.md).
- Attacks that need your computer or your account already: a person at your keyboard, malware on the machine.
- Reports from automated scanners with no way to use the finding, missing headers with no effect, and denial of
  service by sending a lot of requests.
- Weaknesses in a dependency with no way to reach them through Hydor (report those to the dependency).

If you are not sure, report it: we would rather read it.

## Bounty

There is no bounty and no reward programme: Hydor is a free, open-source project. You get a fix, our thanks and, if
you like, your name in the advisory.

## Versions

Only the latest release gets security fixes; the apps update themselves, and [Installation](docs/install.md) says how
to update the others.
