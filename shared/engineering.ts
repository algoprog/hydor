// Engineering on autopilot: the ready-made scheduled tasks for code (CI doctor, Issue triage, Dependency gardener,
// Incident first responder, and Review new pull requests), each built from its short form into a task, and what a
// webhook task's card says about where its address goes; and the request Git's "Find what broke it" starts a
// session with. The pages show the forms (web/src/features/automations/taskTemplates.ts, features/git); the
// method each agent follows is a bundled skill (skills/ci-doctor, issue-triage, dependency-upgrades,
// incident-response, git-bisect).
import type { PayloadFilter, TaskDraft, TaskSchedule } from './automations.ts';

/** What an example makes: a task to save, or to finish in the full form. Its origin names the example (and the service picked in its form). */
export type ExampleTask = Pick<TaskDraft, 'name' | 'prompt' | 'schedule'> & Partial<Pick<TaskDraft, 'cwd' | 'origin'>>;

/** "template:<example>", or "template:<example>:<service>" for one whose form picks a service. */
const originOf = (id: string, variant?: string) => `template:${id}${variant ? `:${variant}` : ''}`;

/** A yes/no answer from an example's form ("yes", or empty). */
const yes = (v: string | undefined) => v === 'yes';

/** "a, b and c". */
const joined = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join('; ')}; and ${xs[xs.length - 1]}`);

/** What a run may and may not do, from the form's yes/no answers. */
function allowed(rules: [boolean, string][], never: string): string {
  const may = rules.filter(([ok]) => ok).map(([, what]) => what);
  const not = rules.filter(([ok]) => !ok).map(([, what]) => what);
  // Under a prompt key, as all words for the agent here: the pages' translations leave those out (scripts/i18n-extract.mjs).
  const said = {
    prompt: [may.length ? `You may: ${joined(may)}.` : '', not.length ? `You may not: ${joined(not)}. Say in your report what you would have done instead.` : '', `Never ${never}.`],
  };
  return said.prompt.filter(Boolean).join('\n');
}

// ---- CI doctor --------------------------------------------------------------------------------------------

export type CiService = 'github' | 'gitlab' | 'buildkite' | 'circleci';

interface Ci {
  label: string;
  /** Only failed runs start one. */
  filter: PayloadFilter;
  /** Where the task's address goes. */
  where: string;
  /** For the run's prompt: the run's essentials as the service sends them, and how the agent reads the failed jobs' logs. */
  prompt: { facts: [string, string][]; logs: string };
}

export const CI: Record<CiService, Ci> = {
  github: {
    label: 'GitHub Actions',
    filter: { path: 'body.workflow_run.conclusion', value: 'failure' },
    where: 'In the repository on GitHub: Settings → Webhooks → Add webhook. Paste the task’s address as the Payload URL, pick application/json, and under “Let me select individual events” tick only Workflow runs.',
    prompt: {
      facts: [
        ['Workflow', 'body.workflow_run.name'],
        ['Run', 'body.workflow_run.html_url'],
        ['Run id', 'body.workflow_run.id'],
        ['Attempt', 'body.workflow_run.run_attempt'],
        ['Branch', 'body.workflow_run.head_branch'],
        ['Commit', 'body.workflow_run.head_sha'],
        ['Commit message', 'body.workflow_run.head_commit.message'],
        ['Started by', 'body.workflow_run.event'],
        ['Pull requests', 'body.workflow_run.pull_requests'],
        ['Repository', 'body.repository.full_name'],
      ],
      logs: 'gh run view <run id> --log-failed',
    },
  },
  gitlab: {
    label: 'GitLab CI',
    filter: { path: 'body.object_attributes.status', value: 'failed' },
    where: 'In the project on GitLab: Settings → Webhooks → Add new webhook. Paste the task’s address as the URL and tick only Pipeline events.',
    prompt: {
      facts: [
        ['Pipeline', 'body.object_attributes.url'],
        ['Pipeline id', 'body.object_attributes.id'],
        ['Branch or tag', 'body.object_attributes.ref'],
        ['Commit', 'body.object_attributes.sha'],
        ['Commit message', 'body.commit.message'],
        ['Started by', 'body.object_attributes.source'],
        ['Merge request', 'body.merge_request.url'],
        ['Project', 'body.project.path_with_namespace'],
        ['Jobs', 'body.builds'],
      ],
      logs: 'glab ci trace <job id>, or the API’s jobs/<job id>/trace',
    },
  },
  buildkite: {
    label: 'Buildkite',
    filter: { path: 'body.build.state', value: 'failed' },
    where: 'In Buildkite: Settings → Notification Services → Add on Webhook. Paste the task’s address as the Webhook URL, tick the event build.finished, and pick the pipelines.',
    prompt: {
      facts: [
        ['Pipeline', 'body.pipeline.slug'],
        ['Build', 'body.build.web_url'],
        ['Build in the API', 'body.build.url'],
        ['Build number', 'body.build.number'],
        ['Branch', 'body.build.branch'],
        ['Commit', 'body.build.commit'],
        ['Commit message', 'body.build.message'],
        ['Pull request', 'body.build.pull_request'],
      ],
      logs: 'the Buildkite connected app’s tools, or its REST API’s job logs with a key from the vault',
    },
  },
  circleci: {
    label: 'CircleCI',
    filter: { path: 'body.workflow.status', value: 'failed' },
    where: 'In CircleCI: the project’s Project Settings → Webhooks → Add Webhook. Paste the task’s address as the Receiver URL and tick Workflow Completed.',
    prompt: {
      facts: [
        ['Workflow', 'body.workflow.name'],
        ['Workflow page', 'body.workflow.url'],
        ['Workflow id', 'body.workflow.id'],
        ['Pipeline number', 'body.pipeline.number'],
        ['Branch', 'body.pipeline.vcs.branch'],
        ['Commit', 'body.pipeline.vcs.revision'],
        ['Commit message', 'body.pipeline.vcs.commit.subject'],
        ['Project', 'body.project.slug'],
      ],
      logs: 'the CircleCI connected app’s tools, or its API (v2) with a key from the vault',
    },
  },
};

export const CI_SERVICES = Object.keys(CI) as CiService[];

const isCi = (v: string | undefined): v is CiService => !!v && v in CI;

/** The facts a webhook sent, one line each, filled in when the run starts (as outside data). */
const factLines = (facts: [string, string][]) => facts.map(([label, at]) => `- ${label}: {{${at}}}`).join('\n');

/** CI doctor: a failed CI run wakes an agent, which tells flaky from real and re-runs it, fixes it or reports. */
export function ciDoctorTask(v: { folder?: string; ci?: string; rerun?: string; pr?: string; comment?: string }): ExampleTask {
  const which = isCi(v.ci) ? v.ci : 'github';
  const ci = CI[which];
  return {
    name: `CI doctor · ${ci.label}`,
    origin: originOf('ci-doctor', which),
    cwd: v.folder,
    schedule: { kind: 'webhook', filter: { ...ci.filter } },
    prompt: [
      `A ${ci.label} run failed for the repository in this folder. Find out why and deal with it as the ci-doctor skill says: load it first.`,
      '',
      `The run, as ${ci.label} sent it:`,
      factLines(ci.prompt.facts),
      '',
      `Read the failed jobs’ logs (${ci.prompt.logs}) and find the first real error; look at the same job’s recent runs to tell a flaky failure from a real one; reproduce it in a new worktree (git worktree add), never in this folder’s own checkout.`,
      allowed(
        [
          [yes(v.rerun), 're-run the failed jobs, once, when the failure looks flaky'],
          [yes(v.pr), 'fix a real failure on a branch of your own and open a draft pull request with the fix'],
          [yes(v.comment), 'comment on the commit or pull request with what you found'],
        ],
        'push to the default branch, force-push or merge anything',
      ),
      'End with report_outcome: one line saying flaky or real, the cause, and what you did or suggest.',
    ].join('\n'),
  };
}

// ---- Issue triage -----------------------------------------------------------------------------------------

export const ISSUE_TRIAGE_WHERE =
  'In the repository on GitHub: Settings → Webhooks → Add webhook. Paste the task’s address as the Payload URL, pick application/json, and under “Let me select individual events” tick only Issues. On Gitea: the repository’s Settings → Webhooks, with Issues events.';

/** Issue triage: each new issue labelled, its duplicates found by meaning, a missing repro asked for, easy ones tried. */
export function issueTriageTask(v: { folder?: string; comment?: string; label?: string; fix?: string }): ExampleTask {
  return {
    name: 'Issue triage',
    origin: originOf('issue-triage'),
    cwd: v.folder,
    schedule: { kind: 'webhook', filter: { path: 'body.action', value: 'opened' } },
    prompt: [
      'A new issue was opened for the repository in this folder. Triage it as the issue-triage skill says: load it first.',
      '',
      'The issue, as it was sent:',
      factLines([
        ['Repository', 'body.repository.full_name'],
        ['Issue', 'body.issue.html_url'],
        ['Number', 'body.issue.number'],
        ['Title', 'body.issue.title'],
        ['Opened by', 'body.issue.user.login'],
        ['What it says', 'body.issue.body'],
      ]),
      '',
      'If this call is not about a newly opened issue (there is no issue above, or it is a pull request), report silent.',
      'Look for the same problem among open and recently closed issues, in several wordings, and say how sure you are.',
      allowed(
        [
          [yes(v.label), 'label it, with labels the repository already has'],
          [yes(v.comment), 'comment on it: a kind welcome, any likely duplicate, and what the report lacks (version, steps, logs)'],
          [yes(v.fix), 'when the fix is small and clear, try it in a new worktree and open a draft pull request that refers to the issue'],
        ],
        'close, lock, transfer or delete issues, assign people, push to the default branch, force-push or merge anything',
      ),
      'End with report_outcome: one line with the labels, any likely duplicate (and how sure), what you asked for, and any draft pull request.',
    ].join('\n'),
  };
}

// ---- Dependency gardener ----------------------------------------------------------------------------------

/** Dependency gardener: once a week, upgrades in worktrees with the tests run, security fixes first, one pull request per level of risk. */
export function dependencyTask(v: { folder?: string; day?: string; time?: string; pr?: string }): ExampleTask {
  const day = Number(v.day ?? 1);
  return {
    name: 'Dependency gardener',
    origin: originOf('dependencies'),
    cwd: v.folder,
    schedule: { kind: 'daily', time: v.time || '09:00', days: [Number.isInteger(day) && day >= 0 && day <= 6 ? day : 1] },
    prompt: [
      'This week’s dependency upkeep for the repository in this folder, as the dependency-upgrades skill says: load it first.',
      '1. Find what is outdated and which dependencies have security advisories, for every package manager the repository uses.',
      '2. Group the upgrades: security fixes first, then patch, minor and major upgrades, each group apart; never mix majors with the rest.',
      '3. Make each group in a new worktree of its own: read the release notes of what changed for breaking changes, and run the tests.',
      yes(v.pr)
        ? '4. Open one draft pull request per group whose tests pass, with the highlights, the advisories it fixes, what you checked and what to watch. Merge nothing.'
        : '4. Push nothing and open no pull requests: for each group, report the upgrades, what you checked and the commands that apply them.',
      'Read your task notes first: do not propose again what is still open or was held back for a reason, and keep them up to date (pull requests open, upgrades held back and why).',
      'Never push to the default branch or force-push.',
      'End with report_outcome: one line with the groups, the advisories fixed and the pull requests opened; silent when everything is up to date and no advisory is open.',
    ].join('\n'),
  };
}

// ---- Incident first responder ----------------------------------------------------------------------------

export type AlertSource = 'sentry' | 'grafana' | 'datadog' | 'betterstack' | 'other';

interface Alerts {
  label: string;
  /** Resolved notices start nothing (where the service says so in a known place). */
  filter?: PayloadFilter;
  where: string;
}

export const ALERTS: Record<AlertSource, Alerts> = {
  sentry: {
    label: 'Sentry',
    filter: { path: 'body.action', value: 'resolved', skip: true },
    where: 'In Sentry: Settings → Developer Settings → Create New Integration → Internal Integration. Paste the task’s address as the Webhook URL, turn on Alert Rule Action, then add the integration to your alert rules’ actions.',
  },
  grafana: {
    label: 'Grafana',
    filter: { path: 'body.status', value: 'resolved', skip: true },
    where: 'In Grafana: Alerting → Contact points → Add contact point, with the Webhook integration and the task’s address as the URL; then send your alerts to it from a notification policy.',
  },
  datadog: {
    label: 'Datadog',
    filter: { path: 'body.transition', value: 'Recovered', skip: true },
    where: 'In Datadog: Integrations → Webhooks → New. Paste the task’s address as the URL and add "transition": "$ALERT_TRANSITION" to its payload; then mention @webhook-<its name> in your monitors’ messages.',
  },
  betterstack: {
    label: 'Better Stack',
    where: 'In Better Stack: Incidents → Integrations → Exporting data → Outgoing webhooks → Configure, then Add on Incident. Paste the task’s address as the Webhook URL and pick only the events for an incident created or reopened.',
  },
  other: { label: 'Another service', where: 'Point your alerting service’s webhook at the task’s address: a POST with the alert as JSON.' },
};

export const ALERT_SOURCES = Object.keys(ALERTS) as AlertSource[];

const isSource = (v: string | undefined): v is AlertSource => !!v && v in ALERTS;

/** Incident first responder: an alert wakes an agent that gathers a timeline and a likely cause, asks before a rollback, and writes the postmortem after. */
export function incidentTask(v: { folder?: string; source?: string; rollback?: string }): ExampleTask {
  const which = isSource(v.source) ? v.source : 'other';
  const src = ALERTS[which];
  const rollback = (v.rollback ?? '').trim();
  return {
    name: `Incident first responder · ${src.label}`,
    origin: originOf('incident', which),
    cwd: v.folder,
    schedule: { kind: 'webhook', ...(src.filter ? { filter: { ...src.filter } } : {}) },
    prompt: [
      `An alert came in from ${src.label} for the service whose code is in this folder. Respond as the incident-response skill says: load it first.`,
      '',
      'The alert, as it was sent:',
      '{{body}}',
      '',
      'If it says the problem is resolved or recovered, add a line about it to your task notes and report silent.',
      'Within the first minutes, tell the user with notify_user what is wrong, since when, and the likely cause so far. Then gather the errors, logs, recent deploys and the changes since the last good release into one timeline, and find the likely cause with its evidence.',
      rollback
        ? `How to roll back: ${rollback}. Run it only after the user said yes to it on a card (ask_form) in this run.`
        : 'There is no rollback command: when a rollback looks like the safest step, ask the user how and whether to do it, with ask_form.',
      'Never roll back, restart, deploy or change anything in production without the user’s yes on a card. Reading logs, errors and the code is fine.',
      'End with report_outcome: one line with what broke, the likely cause and the step you propose or took. Offer to write the postmortem once it is over.',
    ].join('\n'),
  };
}

// ---- Review new pull requests (made before these, kept here for its card's help) ----------------------------

export const PR_REVIEW_WHERE =
  'In the repository on GitHub: Settings → Webhooks → Add webhook. Paste the task’s address as the Payload URL, pick application/json, and under “Let me select individual events” tick only Pull requests. On Gitea: the repository’s Settings → Webhooks, with Pull request events.';

// ---- where a webhook task's address goes -----------------------------------------------------------------------

/**
 * For a task made from one of these examples (its origin, "template:<example>" with the service its form picked),
 * where its webhook address goes: the line its card shows under the address. Without the service, it is told by
 * the filter the form set.
 */
export function hookHelp(origin: string | undefined, s: TaskSchedule): string | null {
  if (s.kind !== 'webhook' || !origin?.startsWith('template:')) return null;
  const [id, variant] = origin.slice('template:'.length).split(':');
  if (id === 'pr-review') return PR_REVIEW_WHERE;
  if (id === 'issue-triage') return ISSUE_TRIAGE_WHERE;
  if (id === 'ci-doctor') {
    const ci = isCi(variant) ? variant : CI_SERVICES.find((c) => CI[c].filter.path === s.filter?.path);
    return ci ? CI[ci].where : null;
  }
  if (id === 'incident') {
    const src = isSource(variant) ? variant : ALERT_SOURCES.find((a) => !!s.filter && ALERTS[a].filter?.path === s.filter.path);
    return src ? ALERTS[src].where : null;
  }
  return null;
}

// ---- Find what broke it (git bisect) -----------------------------------------------------------------------

export interface BisectAsk {
  /** Where it last worked: a tag, branch or commit. */
  good: string;
  /** Where it is broken (HEAD to start). */
  bad: string;
  /** The commits they stand for, when known ("a1b2c3d"). */
  goodAt?: string;
  badAt?: string;
  /** What is broken, in the user's words. */
  broken: string;
  /** A command that tells, if the user has one. */
  check?: string;
}

const named = (ref: string, at?: string) => (at && !ref.toLowerCase().startsWith(at.slice(0, 7).toLowerCase()) ? `${ref} (${at.slice(0, 7)})` : ref);

/** The request a "Find what broke it" session starts with. */
export function bisectRequest(a: BisectAsk): string {
  const broken = a.broken.trim().replace(/\s+$/, '');
  const check = a.check?.trim();
  // Under a prompt key: words for the agent, which the pages' translations leave out (scripts/i18n-extract.mjs).
  const ask = {
    prompt: [
      `Find the commit that broke this: ${broken}`,
      '',
      `It worked at ${named(a.good.trim(), a.goodAt)} and is broken at ${named(a.bad.trim() || 'HEAD', a.badAt)}. Find the first bad commit with git bisect, as the git-bisect skill says: load it first.`,
      check ? `- How to check: \`${check}\` (it fails while it is broken). Build the check script around it.` : '- Write a small check script for it: exit 0 when it works, 1 when it is broken, 125 when a commit cannot be tested.',
      '- Try the check on both ends first: it must pass where it worked and fail where it is broken, or say why it does not.',
      '- Run git bisect run with it here, in this worktree of your own; keep the script outside the repository.',
      '- Then name the first bad commit, show what in its change broke it and why, and suggest a fix. Change nothing on the user’s branches.',
      '- Finish with git bisect reset. This worktree is the session’s: leave it in place (the user removes it with the session), and remove any other worktree you made unless asked to keep it.',
    ],
  };
  return ask.prompt.join('\n');
}
