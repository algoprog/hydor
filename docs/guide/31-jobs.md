# Jobs

Jobs shows the long work that your sessions run in the background, all in one place and sorted by tags that say what each piece is part of: builds, training runs, indexing, downloads and subagents. For each one you see how long it has run, how far it has got and roughly how long it has left, what is waiting to start and what it waits for, and how the finished ones ended. You can read a job's output and stop it from there, and you can ask an agent to run one thing after another.

![The Jobs page: four tiles that sum it up, a chip for each tag, and the jobs at work grouped by tag with their progress and time left](images/jobs.webp)

## What Jobs shows

Click **Jobs** on the rail, or go to [Jobs](/jobs). On a phone it is among the tools at the bottom of the drawer. A number on its icon says how many jobs are running.

A job is any of these:

- a background task of one of your sessions: a command, a monitor (a watch on a log or a program) or a subagent of the agent's own program, such as Claude Code's. Sessions you run outside Hydor, in VS Code or a terminal, show theirs too;
- work an agent started as a job (see [How agents put work here](#how-agents-put-work-here));
- a run of [Experiments](/guide/experiments) that is running or waiting in its queue;
- a Hydor subagent, a session that another session started for part of its job, while it works (see [Subagents](/guide/sessions#subagents)).

Four tiles at the top sum it up:

- **Running** and **Queued**: how many jobs run and how many wait;
- **All done**: when all of that work should be finished, such as "in about 2 h 10 min". It shows a dash unless every job has an estimate still to come, leaving out subagents, which never have one;
- **Finished today**: how many ended today. Beside it, "1 failed" or however many there are takes you to them.

Under the tiles are a chip for each [tag](#tags) and the field **Filter jobs**. Type in the field to see only the jobs whose name, command, session, project or tags have those words; **Show all jobs** brings everything back when nothing matches. Below are **At work**, **Servers** and **Finished**, each there when it has something to show. The tiles count only what the tag and the filter leave. Servers that run are not counted in the tiles or in the number on the rail. The page updates by itself.

When nothing runs or waits, you read "Nothing runs in the background now."

## At work

**At work** holds the jobs that run and the ones that wait, in a card for each tag; the jobs with no tag are in the last one, **No tag**. The top of a card shows the tag, how many of its jobs run and wait (such as "3 running · 1 queued") and, when each of them has an estimate, when they should be done ("done in about 34 min"). When all of a card's work comes from one session, that session and its project are named there too, and its rows leave them out. Click the top of a card to fold it away or open it again; the app remembers this in this browser. While you filter or have a tag picked, nothing is folded. While no job has a tag, the jobs are simply listed, with no cards by tag.

Each job is one row. Its icon says what kind it is (point at it to read **Command**, **Monitor**, **Claude Code subagent**, **Hydor subagent**, **Experiment run** or **Job**), and the dot on the icon its state. Beside the name are any further tags; point at the name to see its command. Under it are how it stands, the session that started it and its project, each a link, and the last thing it printed.

Click a row to open [the job's panel](#a-jobs-panel-and-stop). Its **⋯** menu has **Details and output**, **Open session** (**Open run** for a run of Experiments), **Edit tags…** and **Stop**.

## Running

A running job says how long it has run ("running for 12 min 05 s"). When the job says how far it is, there is a progress bar with a percentage; point at the bar to see the job's own count, such as "step 120/500". When there is no time left to show, that count stands under the bar.

### Time left

When there is something to go by, the row says "about 1 h 12 min left". The app takes the first of these that it has:

1. the time left that the job itself printed, as many progress bars do;
2. how fast its progress has moved so far;
3. the estimate the agent gave when it started the job;
4. how long the same command took in the same folder before, when it finished well in the last week.

Point at the time to see which one it is; the job's panel says it too. **(a guess)** beside it means it is a rough one: a single progress reading, the agent's estimate or an earlier run. When a job has run longer than expected, it says **over its estimate** instead. With nothing to go by, no time is shown.

## Queued

A queued job has not started yet. Its row says why:

- **Waits for** and the names of other jobs: it starts once they have all finished well. Click a name to find its row. The jobs that others wait for say **Then:** and who comes next;
- **Next in queue** and the queue's name, or its place, such as "3rd in queue gpu": a queue runs one job at a time, in the order they came, across all your sessions. The first in line may still be waiting for another job, and the ones behind it wait too;
- **Waiting for a free GPU** or **Waiting for a free slot**: an Experiments run waits for room (see [How the queue chooses](/guide/experiments#how-the-queue-chooses)).

When the jobs ahead of it have estimates, it also says when it should start, such as "starts in about 40 min".

**Stop** on a queued job means it never starts, and neither do the jobs that wait for it. If a job that another waits for fails or is stopped, the waiting one never starts either.

## Servers

Some commands never finish by themselves: a development server, a web or API server, a notebook or a model server that a session left running in the background. Jobs tells them apart by their command and lists them under **Servers**, with how long each has run and no time left. They run until you stop them, with **Stop** as on any other command. They are not counted among the jobs that run, and the **Timeline** view leaves them out. Once one ends it goes to **Finished**.

## Finished

**Finished** keeps what ended in the last 7 days, newest first, under a heading for each day: **Today**, **Yesterday**, then the date. You see the ten latest, and **Show all** brings the rest. Each says how it ended, when, and how long it took:

- **Done**: it finished well;
- **Failed**, with its exit code when there is one (the number a program ends with; anything but 0 means something went wrong);
- **Stopped**: you or an agent stopped it;
- **Never started**, and the reason, such as a job it waited for having failed;
- **Ended**: work that was already running when it was added to Jobs has ended, and nobody saw whether it went well.

When something failed, switch from **All** to **Failed** to see only those. **Remove from this list**, in a row's **⋯** menu, takes one out, and **Clear** takes them all out after asking, including those a tag or the filter hides. This only tidies the list: your sessions and runs of Experiments stay.

## Tags

A tag says what a piece of work is part of, such as `intent-data` or `search-index`, so you can see what each thing running is for and look at one piece of work at a time. A job has up to 3, in small letters with hyphens between words: "Intent data" is kept as `intent-data`. The first one says where it is listed.

You don't have to tag anything yourself:

- agents tag each job they start, and use a tag that is already there whenever the work belongs to it, so one piece of work stays under one name. Name the tag you want and the agent uses it;
- work with no tags of its own (a session's background commands, its subagents and runs of Experiments, a job started without a tag) takes its session's tag. That is the one you set for the session here; else the tag its jobs of the last week have most often; else one that the [helper model](/settings?s=models&find=Helper%20model) picks for the session, reusing a tag already in use where one fits.

The helper model picks in the background, so such a tag can appear a moment after the work does. To pick, it reads the session's title, its project and the names of some of its work. It is never asked about a [confidential session](/guide/sessions#keep-a-session-confidential).

### Change tags

Choose **Edit tags…** in a job's **⋯** menu, or click the pencil beside the tags in its panel. Type the tags with commas between them, or click ones under **Tags in use**, then **Save**.

For work an agent started as a job, these are that job's own tags. For other work they are its session's, so all of that session's work without tags of its own takes them. Save an empty box to remove what you set: the tag is then chosen for you again, as above. Work that belongs to no session can't be tagged, except a job.

### See one tag

Click a tag's chip to see only the work listed under it: the tiles, **At work**, **Servers**, **Finished** and the timeline all follow. The number on a chip is how many of its jobs run or wait. Click **All** to see everything again; the chip **No tag** shows [the work with no tag](/jobs?untagged=1).

The tag you pick is part of the page's address (it ends in `?tag=` and the tag's name), so you can bookmark it or send it to your phone. A chip goes by each job's first tag; to find a job by another of its tags, type that tag in **Filter jobs**.

## The Timeline view

Switch between **List** and **Timeline** at the top right; the app remembers your choice in this browser. The timeline draws one bar for each job that runs or waits, along the clock, with a dot of its tag's colour before its name. The tag chips and **Filter jobs** narrow it as they do the list:

- **Run so far** is solid, and **Estimated** is the striped part beyond it;
- **Queued** jobs are dashed, where they should start;
- a bar with **No estimate** fades out;
- the line marked **Now** is the present, and thin lines join a job to the ones that wait for it.

A job over its estimate turns amber. Point at a bar to read its state and times, and click it to open the job's panel. On a narrow screen the chart scrolls sideways and the names stay put. The finished jobs are listed under it.

## A job's panel and Stop

The panel opens over the right side of the page (the whole screen on a phone). At the top are the job's name, its state, its tags, **Open session** (or **Open run**) and **Stop**. Below is what is known of it, such as its session, project and folder, when it started, how long it has left and why that estimate, what it waits for and how it ended. Then comes its command, with a button that copies it.

**Output** shows the end of what the job has printed, refreshed every few seconds while it runs; the newest lines stay in view unless you scroll up. For a subagent it lists its steps. Some jobs, such as Hydor subagents and Codex's background tasks, have no output here: use **Open session**.

**Stop** asks first, then ends the job: a job or a command stops, an Experiments run is stopped as on its own page, and a Hydor subagent's session is stopped. What the job has done so far stays. Work that runs in a session outside Hydor, and Codex's background tasks, can't be stopped from here, so they have no **Stop**.

## How agents put work here

You do not need to set anything up. A background task that a session starts shows here by itself. Every session the app starts also has a command called `job`, and agents are told to use it for long work (anything over about ten minutes), so that it shows here with a name, a tag, its progress and its time left (see [Four commands every agent has](/guide/agents#four-commands-every-agent-has)).

Say what you want in plain words, and the agent does the rest:

- **One after another**: "run the evaluation after the index build finishes". The second job waits for the first, and never starts if the first fails;
- **One at a time**: "put these sweeps in a queue". Jobs with the same queue name take turns;
- **How long it should take**: an agent can give its own estimate, which is used until the job's progress says more;
- **What it is part of**: "tag the index build as search-index". Agents can also list the tags in use and change a job's tags afterwards;
- **Work already running**: "show the training you started earlier in Jobs". The agent adds it without restarting it (`job adopt`); this is not available on Windows. When it ends, it says **Ended**, as nobody can tell how it went.

While a job that a session started still waits or runs (one it ran with `job`, or a run of Experiments it started), that session is not finished: its dot keeps breathing blue and its status reads "Working · 1 in background", also after its agent has stopped, and its **Finished** notice comes only once the job ends. The Stop button by its message box leaves these jobs running: stop them here.

If the app can't be reached when an agent starts a job, the command runs anyway; it just does not show here.

## Ask an agent

- "Run the evaluation as a job after the index build finishes."
- "Tag the index build as search-index."
- "What is still running for intent-data?"
- "Show the training you started earlier in Jobs."
- "Run these three sweeps one at a time in a queue."
- "What is still running, and when will it be done?"
- "Stop the download and run the tests as a job instead."
- "Why did the last build fail? Check its job's output."
