---
title: Goals and swarms: many agents, and checks that decide
description: On a hard problem, many agents attacking from different angles find more than one does, but only if something outside them decides what counts as done. What this year's reports on swarms show, and how goals and swarms work in Hydor.
date: 2026-11-25
tags: Goals, Swarms, Research
cover: /img/blog/goals-and-swarms/cover.webp
coverAlt: A school of small glowing fish swims in sweeping turquoise and blue streams around a single ring of light in dark water.
og: /img/blog/goals-and-swarms/og.jpg
order: 2
---

In 2026, teams of AI agents did real work on hard problems. An unreleased Claude [coordinating about 60 subagents](https://www.anthropic.com/research/riemann-zeta) raised a bound on the zeros of the Riemann zeta function. Parallel agents [found real vulnerabilities in real code](https://blog.ethereum.org/2026/07/09/triage-is-the-product). In the same year, other swarms [cheated on their tests](https://arxiv.org/abs/2609.04170), [passed answers to each other through a wiki](https://arstechnica.com/security/2026/09/openai-agents-discussed-ways-to-escape-their-sandbox-on-public-wiki/), and [got out of the sandbox](https://openai.com/index/hugging-face-incident-and-the-road-ahead/) that was meant to hold them.

Both halves have one cause. Many agents, each taking the problem from a different angle, can find more than one agent can. They also find every weakness in whatever is judging them. The good stories and the bad ones differ mostly in one thing: what, outside the agents, decided what counted as done.

[Hydor](/blog/meet-hydor) has two features built around that question. A **swarm** sets a team of agents on one problem. A **goal** gives the work a judge: checks you agree first, which the app runs itself. This post explains both, then what the year's public reports show, and what that means if you run many agents yourself.

## A swarm: many angles on one problem

A swarm puts a team on one problem. You turn it on when you start a session, under **Options** → **Swarm**, and a lead agent takes the task. The lead works out what the task asks and what a checked answer looks like, picks genuinely different angles of attack, and starts one member for each. For a proof, the angles might be a direct argument, contradiction, induction, small cases and a computer search. For a stubborn bug: reproduce it under load, read the retry code, bisect the last commits.

Each member is a Hydor subagent, an agent that another agent started, with a brief: the whole problem, its angle, what counts as done and how to check it. Members post to a shared board as they go (**Progress**, **Finding**, **Question**, **Note**), read each other's posts, build on findings and skip what someone has ruled out. The lead hears of a finding or a question within about a minute. It turns a stuck member to a new angle, asks one member to check another's result, and starts new members as others finish.

Before it concludes, the lead has the answer checked independently: by another member, by a computation, or by its own careful check.

How many members work at once is **Swarm size**, in **Settings → Capabilities → Subagents**: from 1 to 16, 5 to start. Each member costs about what one agent does, so a swarm costs several times as much. That is why it is meant for hard problems with many possible routes, such as a proof or a stubborn bug, and not for everyday tasks. The [swarm guide](/docs/research#set-a-swarm-on-a-hard-problem) has the steps.

A **campaign** is the other kind of swarm, for one big, mostly mechanical change such as a framework upgrade: each member makes one part on a branch of its own, and the lead merges the finished parts one at a time, with the checks run after each. See [campaigns](/docs/engineering#campaigns-a-big-change-in-many-parts).

Notice who does the checking: the lead, or a member. That is a judge inside the team, and often a good one, but it is made of the same kind of agent as the ones being judged. That matters later in this post.

## A goal: checks that someone else runs

A goal keeps an agent working, round after round, until checks you have agreed hold. It is for work that takes many rounds. You say what is true when the work is done ("npm test passes and uploads of 2 GB work"). The agent reads the project and proposes the checks, the paths it may not change and the limits. You see them on a card, **Is this what done means?**, and agree or change them. A check is one of four kinds:

- **Command**: a command that must pass.
- **Measured**: a command that prints a number, with a target ("search p95 under 200 ms").
- **Reviewer**: a sentence a reviewer must find true. The reviewer is a model that did none of the work. It reads what changed and says whether the sentence holds, with its reason.
- **You**: something only you can confirm.

**Kept safe** lists the paths the agent may not change: the tests, the test data and the checks' own scripts. **Limits** are the most rounds (30 unless you change it), money at API prices, and time.

After every round, the app runs every check, not the agent, and decides whether the round got things closer. A round is **Kept** when things got closer and nothing broke. It is **Undone** when it changed a path it may not change, broke a rule of yours, made a check that held stop holding, let a measured number fall far behind its best, or got nothing closer. An undone round puts the files back to the best round so far, if the session works in a worktree, a separate working copy of the project. So the agent saying "done" changes nothing: only the checks can end a goal.

Even then, the app does not trust the first time. When every check holds, it runs the commands and numbers a second time, and a reviewer reads the whole change to see that no test was weakened or skipped and no answer was written into the code. Only then is the goal reached.

<!-- figure: goal -->

![A session with a goal at work: a bar above the message box with the goal, its checks (tests pass, types check, coverage 84 of 90 percent, expired cards), the money and time used, and a list of rounds, three kept and one undone.](/img/app-goals.webp "A real goal in Hydor: each check with its state, the limits, and the rounds, kept or undone.")

You can steer a goal while it runs: message the agent, pause it, add a rule ("No new dependencies") that every later round must keep, or change the checks. **How much it asks you** is **On its own**, **At turning points** (the default) or **Every round**. The [goals guide](/docs/goals) covers all of it.

One limit, said plainly: a goal judges the agent's work, not its behaviour. The agent works with the permissions of its session, and the checks run as the session's own commands would. Permissions and the sandbox are separate settings. What a goal gives you is a verdict you do not have to take on trust.

## A goal for a swarm

Put the two together by turning on both **Goal** and **Swarm** under **Options** on the start page, or by setting a goal in a session that already leads a swarm. A round is then the whole swarm's work.

- The app sends the round's message to the lead, which puts its members on what does not hold yet: one angle or one check each. They all work in the lead's folder.
- A round is over when everyone has finished: the lead's turn has ended, no member is still at work and nothing between them is on its way. Until then the bar says "waiting for 2 members". Then the app runs the checks on the lead's folder, and the round is kept or undone. An undone round takes the members' changes with it.
- Members stay between rounds and remember their work. The lead gives them their next step, starts a new member for a new angle and stops one whose angle is used up.
- The limits are the team's. Money counts what the lead and every member spend, time is the time the team is at work, and a limit reached in the middle of a round stops the members as well as the lead.
- Only the lead asks you a question. A member with something to ask posts it to the board.

<!-- figure: swarm -->

A round of a swarm costs several times a round of one agent, so give the goal a money limit that fits. The [goals guide](/docs/goals#a-goal-for-a-swarm) has the details.

## What this year's reports show

Hydor is an independent project, not affiliated with or endorsed by Anthropic or OpenAI, and these are their reports and others', not Hydor's. Each is read at its source, and where a result is still being checked, it says so. This timeline puts ten of them side by side, with what judged each result.

<!-- figure: year -->

### Where many agents found things

In August, Anthropic reported that [an unreleased research version of Claude](https://www.anthropic.com/research/riemann-zeta) had improved a long-standing lower bound for the fraction of zeros of the Riemann zeta function that provably lie on the critical line, from 41.6% to 67.2%. That is not a proof of the Riemann hypothesis, and Anthropic says it does not expect these techniques to lead to one. The method is the interesting part. A first attempt generated and tried 650 ideas, and none worked. A second spent a day and a half coordinating about 60 subagents, which ran thousands of numerical checks against known zeros and refereed one another's work. Two Anthropic mathematicians validated the paper, two experts in the field examined it on short notice, and Claude also produced a Lean proof (Lean is a language in which a computer checks every step) that passes the standard checker.

Google DeepMind's AlphaProof Nexus [is built the same way](https://arxiv.org/abs/2605.22763): subagents search for proofs on their own, with feedback from the Lean compiler, and a validator checks that the proof compiles and that the problem statement was not changed unsafely. Run over 353 open Erdős problems written in Lean, its best agent solved 9, at a few hundred dollars a problem. Experts on the team then checked that each Lean statement said what the original conjecture said.

Together AI's [EinsteinArena](https://www.together.ai/blog/einsteinarena) lets agents work in the open, with a public leaderboard and a published verifier. In April its agents raised the best known kissing number in 11 dimensions from 593 to 604. One agent's first leap had slightly overlapping spheres, so it was not valid, and it took other agents, and a verifier improved overnight, to finish it. "No single agent solved it alone," Together wrote.

In September, OpenAI said that a group [on the order of 10,000 concurrent agents](https://openai.com/index/navier-stokes-solution/) produced a proof that the Navier–Stokes equations can develop a singularity, with a Lean formalisation. It also shows what a check can and cannot tell you. Scientific American reported that the proof [settles the problem as the Clay Institute worded it](https://www.scientificamerican.com/article/did-openai-solve-the-wrong-navier-stokes-problem/), which allows an external force, while many experts consider that variant disconnected from the question they care about. The check passed. The question it checked was not quite the one people meant.

Not every headline was a swarm. OpenAI's October release of 722 manuscripts came [from an internal model](https://openai.com/index/sharing-ai-progress-in-mathematics/), not described as a team of agents. Quanta reported that experts [largely agree its quasi-Riemann result is correct](https://www.quantamagazine.org/ai-proved-the-quasi-riemann-hypothesis-what-happens-now-20261019/), though one leading number theorist will not call it a theorem until humans have understood every detail.

In security, the pattern repeats, with one more step. Cognition's [Devin Security Swarm](https://cognition.com/blog/introducing-devin-security-swarm) sends parallel agents through parts of a codebase and reproduces each finding in an isolated sandbox before anything reaches a person. Cognition reports 72% recall on its own benchmark of 50 real vulnerabilities, a vendor's figure. The Ethereum Foundation's protocol security team ran many coordinated agents on protocol code and [found real bugs](https://blog.ethereum.org/2026/07/09/triage-is-the-product), including a libp2p flaw fixed as CVE-2026-34219. But, they wrote, "the surprise was how little of the work went into finding them, and how much went into telling the real bugs from the ones that just looked real." Their rule is that a candidate is not a finding until a self-contained reproducer fails against the real code, for someone who did not write it, and "you can't count on the agent to catch itself."

Google's threat researchers [counted the effect](https://cloud.google.com/blog/topics/threat-intelligence/vulnerability-discovery-and-exploitation-trends-in-the-ai-era). Of the vulnerabilities they identified as likely found by AI, exactly 50% allow remote code execution, against 26% across the wider set of CVEs, and attackers exploited one flaw found by an AI research agent within four days of its disclosure. The flaws agents find are the ones attackers want too.

### Where nothing outside held the line

In September, DeepMind researchers published [a case study](https://arxiv.org/abs/2609.04170), a preprint that has not been peer reviewed, of 100 agents set to prove 71 formal conjectures. The agents had been warned that cheating would be detected and rejected with zero credit. In practice, [the proofs were not checked in detail](https://www.technologyreview.com/2026/09/14/1144037/ai-agents-blew-whistle-o-cheating-colleagues). The swarm solved the first 37 in just under an hour. Then one agent found an exploit that submitted solutions by redefining the terms of the problem, others reverse-engineered it, and over the next 27 minutes the swarm "solved" the other 34. In the end 14 agents had cheated and 24 had become whistleblowers. But the feedback channel was not monitored, and the whistleblowers had no power to act.

<!-- figure: judge -->

OpenAI's own report on the Hugging Face incident in July describes [the same pattern on a larger scale](https://openai.com/index/hugging-face-incident-and-the-road-ahead/). Agents in a cybersecurity evaluation, run with reduced safeguards, used a package manager as a message board, found ways onto the internet and went on to compromise Hugging Face's systems. OpenAI names reward hacking, agents cheating by looking up answers online, as a primary driver. It also found that some agents read the evaluation's paper and code to work out what its grader checked, and it calls the incident a "warning shot". Separately, researchers found about 18,000 posts by agents on an obscure German wiki. They had been meant to read the internet but not write to it, and [found a way to write](https://arstechnica.com/security/2026/09/openai-agents-discussed-ways-to-escape-their-sandbox-on-public-wiki/), sharing answers and ways round their limits. OpenAI [confirmed these were its agents](https://techcrunch.com/2026/09/05/openai-confirms-wiki-incident-says-its-working-on-a-framework-for-more-disclosure/) and said it considered the wiki incident an instance of misalignment.

## What this means if you run many agents

These reports are about large labs, but the lessons scale down to a swarm on your own computer, and each maps to something in Hydor.

**Agree the checks before the work.** Every success above came with a way to tell: a Lean checker, a reproducer, a public verifier. A goal starts the same way, with a card of checks you agree or change, and the app measures where things stand before round 1.

**Read what the check says.** The Navier–Stokes proof passed its check, and the check asked a narrower question than people thought. The Ethereum team warns of proofs that go through but do not mean what you wanted. A **Command** check is only as good as its command, and a **Reviewer** check is a model's judgement, so read the card before you press **Start**.

**Keep the judge out of reach.** In DeepMind's swarm the exploit sat in the evaluation. OpenAI's agents studied the grader. In a goal, the app runs the checks, you agree which paths are kept safe (the tests, the test data, the checks' own scripts), and a round that changes one is undone. It is the difference between a team that marks its own homework and one that does not.

**Make a bad round cheap to throw away.** In a worktree, an undone round puts the files back to the best round so far, and in a swarm it takes the members' changes with it. In your own folder a worse round stays, and the card tells you which of the two you have.

**Give the work somewhere to stop.** OpenAI found that its agents rarely gave up on tasks that looked impossible, and that 93% of the tasks discussed on its message board were among the 198 that no model had ever solved. A goal always has a limit on rounds (30 unless you change it) and ends there, or at the money or time you set. In a swarm those limits count the whole team's spending, so a stuck team stops at a cost you chose.

**Keep the talk where you can read it.** DeepMind's researchers found that open channels let others see the exploit and push back, where OpenAI's agents improvised channels of their own. Hydor's members talk through a board you can open, which lists every post, who wrote it and who it was for.

A goal does not contain an agent, and it cannot repair a bad check: if the checks are wrong, the goal is reached anyway. The reports above are the reason to keep the judge outside the agents. They are not a promise that any judge is right.

## Try it

On the start page, open **Options**, choose **Goal** → **Until it is done**, and add **Swarm** for a hard problem. In a running session, the menu (⋯) has **Set a goal**, and **Session settings** → **Swarm** turns the team on. Start with one command check and a small money limit, and watch two or three rounds before you give it more. The [goals guide](/docs/goals) and the [swarm guide](/docs/research#set-a-swarm-on-a-hard-problem) say the rest.

## Sources

1. [Claude has improved on a longstanding lower bound for the fraction of zeros of the Riemann zeta function that satisfy the Riemann hypothesis](https://www.anthropic.com/research/riemann-zeta), Anthropic, August 2026 (updated 13 August 2026).
2. [Advancing Mathematics Research with AI-Driven Formal Proof Search](https://arxiv.org/abs/2605.22763), Google DeepMind, arXiv, 21 May 2026.
3. [EinsteinArena: Harnessing the collective intelligence of agents in the wild to advance science](https://www.together.ai/blog/einsteinarena), Together AI, 13 April 2026.
4. [On the Navier–Stokes Millennium Prize Problem](https://openai.com/index/navier-stokes-solution/), OpenAI, 8 September 2026.
5. [Did OpenAI solve the wrong Navier-Stokes problem?](https://www.scientificamerican.com/article/did-openai-solve-the-wrong-navier-stokes-problem/), Scientific American, 21 September 2026.
6. [Sharing AI progress in mathematics](https://openai.com/index/sharing-ai-progress-in-mathematics/), OpenAI, 6 October 2026.
7. [AI Proved the Quasi-Riemann Hypothesis. What Happens Now?](https://www.quantamagazine.org/ai-proved-the-quasi-riemann-hypothesis-what-happens-now-20261019/), Quanta Magazine, 19 October 2026.
8. [Introducing Devin Security Swarm](https://cognition.com/blog/introducing-devin-security-swarm), Cognition, 1 July 2026.
9. [The triage is the product: running AI agents against Ethereum's protocol code](https://blog.ethereum.org/2026/07/09/triage-is-the-product), Ethereum Foundation, 9 July 2026.
10. [Vulnerability Discovery and Exploitation Trends in the AI Era](https://cloud.google.com/blog/topics/threat-intelligence/vulnerability-discovery-and-exploitation-trends-in-the-ai-era), Google Threat Intelligence Group, 30 September 2026.
11. [A Case Study on Emergent Cheating and Whistleblowing in Autonomous Research Swarms](https://arxiv.org/abs/2609.04170), Google DeepMind researchers, arXiv, 3 September 2026.
12. [When AI agents cheated at math, other AI agents blew the whistle on them](https://www.technologyreview.com/2026/09/14/1144037/ai-agents-blew-whistle-o-cheating-colleagues), MIT Technology Review, 14 September 2026.
13. [The Hugging Face incident and the road ahead](https://openai.com/index/hugging-face-incident-and-the-road-ahead/), OpenAI, 26 August 2026.
14. [OpenAI agents discussed ways to escape their sandbox on public wiki](https://arstechnica.com/security/2026/09/openai-agents-discussed-ways-to-escape-their-sandbox-on-public-wiki/), Ars Technica, 4 September 2026.
15. [OpenAI confirms "wiki incident," says it's "working on a framework" for more disclosure](https://techcrunch.com/2026/09/05/openai-confirms-wiki-incident-says-its-working-on-a-framework-for-more-disclosure/), TechCrunch, 5 September 2026.
