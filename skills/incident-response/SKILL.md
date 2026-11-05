---
name: incident-response
description: Use when an alert or outage comes in (Sentry, Grafana, Datadog, Better Stack, a site down) and the job is to tell the user fast, gather errors, deploys and changes into a timeline, find the likely cause, propose the safest step such as a rollback (asked first, never run unasked), and write the postmortem after.
category: coding
triggers: [production incident, incident response, production outage, service outage, alert fired, site is down, server is down, error spike, on call, on-call, roll back the deploy, postmortem, post-mortem]
---

# Incident response

In an incident the user needs three things, in this order: to know now, to know why, and a safe way out. You
read freely and change nothing in production without their yes on a card. A wrong rollback, a restart at the
wrong moment, or an alert silenced while nobody watches makes an incident worse.

## 1. Tell the user at once

Within the first minutes, before the digging: `notify_user` with what is wrong, where, since when and how bad,
in two lines ("Checkout answers 5xx for 12% of requests since 14:02 (Datadog). Looking into it."). Do not
acknowledge, silence or resolve the alert in the alerting tool: that stops it from paging the person on call.
Only when the user says so.

## 2. Is it real, and is it still happening?

- The alert itself: what fired, the threshold, the service and environment, the links it carries.
- The source, through its connected app when there is one (`list_connections`): Sentry (the issue, its events,
  first seen, the release it appeared in, the stack trace), Grafana (the panel's query over the last hours),
  Datadog (the monitor, logs and traces), Better Stack (the incident, the monitor's checks).
- From here: the health endpoint (`curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' https://…`), and the
  status pages of what the service depends on (its cloud, its payment provider).

A resolved or recovered notice, or a blip already gone: a line in your task notes, and report silent.

## 3. One timeline

Put everything on one clock (UTC, and the user's time beside it), newest last:

- When the errors began, from the alert and the error tracker (not when the alert fired).
- Deploys and releases: the deploy workflow's runs (`gh run list --workflow deploy.yml`), tags and releases
  (`gh release list`, `git tag --sort=-creatordate | head`), the platform's history (`kubectl rollout history
  deployment/<name>`, the hosting's connected app).
- Commits on the deployed branch: `git log --since='6 hours ago' --format='%h %ci %an %s' origin/<branch>`.
- Configuration, feature flags, migrations, infrastructure changes, traffic peaks.
- The log lines around the start.

## 4. The likely cause, with its evidence

- The last good release: the one deployed before the errors began. What changed since:
  `git log --oneline <good>..<bad>` and `git diff --stat <good>..<bad>`.
- Read the commits that touch the failing path (the stack trace's files and functions) first.
- Name the likely cause, the evidence for it (the error began within minutes of that deploy; the stack trace is
  in the changed function), how sure you are, and the other causes you ruled out and why.
- An outside cause (the cloud, a provider, an expired certificate) is common: check it before blaming a commit.

## 5. The safest step, asked first

The safest step is usually the one that undoes the last change: a rollback to the last good release, or turning
off the flag. Sometimes it is to wait (an outside outage) and to say so.

- Ask with `ask_form`: a title ("Roll back checkout?"), a message with the cause in a line and the exact command
  with what it does, and a yes/no field. Use the rollback command the task gives; without one, ask how in the
  same form.
- Only on a yes: run it, then check that it worked (the error rate, the health endpoint) and `notify_user` again.
- No answer in time (the form is withdrawn): report blocked, "the rollback waits for your go-ahead: reply here",
  with the command.

Never, without a yes: roll back, redeploy, restart, scale, run a migration, change production configuration,
delete data, or push a hot fix.

## 6. Report

- `report_outcome` with one line: what broke, the likely cause, the step proposed or taken.
- Your reply: the timeline, the cause and its evidence, what was done, what to watch.
- Your task notes: the incident in a line (when, what, cause), so a repeat is recognised.
- Offer the postmortem for when it is over.

## 7. The postmortem, when asked

Blameless: systems and decisions, not people. Save it as a document (`save_doc`), or in the repository where
the team keeps them (`docs/postmortems/`). It holds:

1. Summary: what happened, in three lines.
2. Impact: who was affected, how, for how long; numbers when you have them.
3. Timeline: from the cause going in to the all-clear.
4. Root cause: the chain of whys, down to what made it possible.
5. What went well, what went badly, where we got lucky.
6. Actions: each one concrete, with an owner to fill in and a date: a test, an alert, a safer deploy.
