# Memory retrieval evaluation

An offline test of how Hydor picks memory notes for a request (`server/memory/search.ts` `findNotes`, `server/memory/inject.ts`
`memoryParts`), built from one real installation's data: its notes, their history, and the sessions and agent transcripts
that came after them. It replays the picking over many past messages and several settings and measures what would have been
given. Everything here is code and aggregate numbers; the texts, ids and sessions it works on stay in a scratch folder
(`/tmp/memory-eval` by default), never in the repository.

## Method

**Collection** (`collect.ts`). A query is a message a user wrote, in a session in a git repository: the user's own words
(`ownWords`, `server/memory/learn.ts`), the first message of a session and later ones, at least two words. Left out: child
sessions, scheduled runs, sessions whose first message is a brief from a lead agent ("You are ..."), and messages that agents or
the app sent into a session (messages from other sessions, subagent replies, swarm posts, usage-limit notices; found by their
tags and from the transcript's own record of cross-session messages). That leaves a few such messages in, estimated at a few
percent. Its **pool** is the notes and topics of the session's repository and of "global" that existed when the message was
written (created before it, not deleted before it), with each note's text as it was then (from `memory_history`). Places that
are given whole (no topics, little kept: `SMALL_PLACE`) are left out of what picking decides.

**Positives**, by source (a note is in the pool and ...):

- **a**: the agent found it with `recall` later in the same session (parsed from the transcript's tool results). `recall`
  lists 25 notes whatever they are, so only the first five of each result count, and only for sessions that made at most six
  `recall` calls after the message (a session of 60 calls "finds" most of the pool).
- **b**: an existing note the agent (`remember`, `forget`) or the learning pass changed or deleted later in that session
  (`memory_history` rows with its session).
- **c**: the note's backticked spans or file paths appear in the session's later commands or files; a span found in more than
  15% of all sessions (`npm run build`, `package.json`) is ignored.
- **any** is a, b or c together; **a or b** is the stricter pair.

These are noisy (below). So **42 queries were judged by hand** (20 first messages, 22 later ones, drawn by a fixed shuffle):
each was read with its candidates (the best by meaning and by words, the automatic positives, what the app's settings give,
what the identifier rule finds; up to about 16 per query) and every note that would plausibly have helped the agent with that
request was marked. That is the **judged** column in the tables; the other columns are **auto** (the any set). A second hand
check judged 22 notes the identifier rule adds, one per query it fires for.

**Replay** (`lib.ts`, `replay.ts`). The real modules are built into the scripts (`scripts/build-server.mjs`) and run: the
note store and its FTS5 index (`wordHits`, `anyWords`), the int4 vectors and the scan with the bulk statistics (`nearest`,
`bulkStats`), `boost`, and the app's embedding worker for every vector (the local mDenseOn model on the CPU; notes' stored
vectors are used where the text is unchanged). Each query gets an in-memory memory database holding exactly its pool. Only the
fusion and the choice of what is given are written again, because the constants are not parameters in `search.ts`
(`W_WORDS`, `Z_MIN`, `Z_NOTES`) and `memoryParts` is not split into a function of them: `rank` and `givenFor` follow
`findNotes` and `memoryParts` line by line (the room, k = 10, topics given beside their notes, notes given before). At the
app's settings the replay returns the same ranked list and the same relevant set as the real `findNotes` on every query of a
sample (112 of 112; `replay.ts` fails otherwise).

**Variants.** `Z_MIN` 2.0, 2.3, 2.6 (the app), 3.0; `W_WORDS` 0.1 (the app), 0.3, 1.0; the identifier rule (`ident.ts`: tokens
of the request that look like paths and file names, camelCase or PascalCase, snake_case or kebab-case of two or more parts,
letters mixed with digits, `--flags`; when a token is in at most max(2, share of the pool) notes, those notes count as
relevant, at most 3 a query) with the share at 1%, 3%, 5%, 10%, 20% or the rule off; and, for later messages, `Z_TURN` 2.6,
3.0, 3.5 in place of `Z_MIN`. For a later message the notes already given earlier in the session (under the same settings)
are not given again and not counted as missed. The app gives notes only with the first message today; later messages are a
what-if.

**Metrics.** Recall and precision of what is given (means over queries; precision over queries where something was given);
recall@10 and precision@10 of the ranking alone, with no bar; how often nothing is given; how often a topic is given with
one of its own notes; for later messages, how often anything is given. "Chance" is the precision of picking at random from the
pool. Standard errors (±) are over queries.

## Rerun

```bash
mkdir -p /tmp/memory-eval && sqlite3 ~/.web-agent/web-agent.db ".backup /tmp/memory-eval/copy.db"   # or let run.sh do it
scripts/memory-eval/run.sh      # build, collect, embed, replay, report; heavy parts at nice 19, CUDA_VISIBLE_DEVICES empty
```

`run.sh` needs `HYDOR_EMBED_PYTHON` (a Python with ONNX Runtime, tokenizers and NumPy; the app's own environment in its data
folder works) and the embedding model downloaded once by the app. Steps, each a script built to `dist/dev`:

| script | does |
|---|---|
| `collect.ts` | the collection: queries, pools, positives (`collection.json`) |
| `embed-all.ts` | vectors for every note text and query, with the app's embedding code (`vectors.json`); checks them against the stored ones |
| `judge.ts` | writes the queries to judge by hand (`judge/batch-N.md`) and the identifier pairs (`judge/ident.md`); keeps queries already judged |
| `replay.ts` | validates against `findNotes`, runs every setting, writes `results.json`, `noise.json`, `ident-stats.json` |
| `report.ts` | the tables below (`tables.md`) |

Judging is by hand: read `judge/batch-N.md`, write `judged.json` (`{"<query number>": [note ids that would have helped]}`) and
`ident-judged.json` (`{"<query>:<note>": 1, 0, or -1 for a message that should not be there}`), and run `replay` and `report`
again. Query numbers are a hash of the session and time, so judgements survive a new collection. `MEMORY_EVAL_OUT`,
`MEMORY_EVAL_DB`, `JUDGE_FIRST`, `JUDGE_LATER` change where it works and how many to judge.

## Results

Data: 234 notes and topics in all; 782 queries from 242 sessions (240 first messages, 542 later ones), pools of 60 and 52 notes on average. Queries where every place is given whole are left out of the tables: 220 first and 472 later messages are scored.

### Collection

|  | first messages | later messages |
|---|---|---|
| queries | 240 | 542 |
| pool size, mean (notes and topics) | 59.61 | 51.51 |
| with positives of source a | 102 (43%) | 154 (28%) |
| with positives of source b | 27 (11%) | 99 (18%) |
| with positives of source c | 120 (50%) | 308 (57%) |

### How the automatic positives compare with the hand-judged queries

| source | judged queries having it | positives shown | judged helpful | queries with at least one judged helpful | share of judged helpful notes it covers |
|---|---|---|---|---|---|
| a | 18 | 132 | 8% | 39% | 13% |
| b | 8 | 10 | 40% | 50% | 5% |
| c | 27 | 62 | 11% | 26% | 8% |
| ab | 21 | 140 | 11% | 52% | 18% |
| any | 32 | 194 | 11% | 47% | 25% |

### First messages: Z_MIN (W_WORDS 0.1, no identifier rule; 220 queries, 18 with judged positives, 149 with automatic ones)

|  | notes given | nothing given | topic and its note both | judged recall | judged precision | auto recall | auto precision |
|---|---|---|---|---|---|---|---|
| Z_MIN 2.0 | 2.95 | 9% | 14% | 0.53 ±0.10 | 0.24 ±0.05 | 0.14 | 0.27 |
| Z_MIN 2.3 | 1.70 | 22% | 7% | 0.43 ±0.10 | 0.42 ±0.10 | 0.12 | 0.34 |
| Z_MIN 2.6 (the app) | 1.02 | 39% | 6% | 0.24 ±0.08 | 0.36 ±0.11 | 0.08 | 0.37 |
| Z_MIN 3.0 | 0.53 | 63% | 4% | 0.19 ±0.08 | 0.60 ±0.16 | 0.06 | 0.43 |

Notes added by each step down in Z_MIN: how many of them were positives (marginal precision).

| step | judged | any automatic | a or b |
|---|---|---|---|
| 3 to 2.6 | 23% of 13 | 24% of 75 | 18% of 62 |
| 2.6 to 2.3 | 33% of 18 | 27% of 115 | 22% of 95 |
| 2.3 to 2 | 11% of 35 | 17% of 200 | 16% of 172 |

Chance level: precision of picking notes at random from the pool.

|  | judged | any automatic | a or b |
|---|---|---|---|
| first messages | 0.03 | 0.13 | 0.13 |
| later messages | 0.04 | 0.10 | 0.09 |

### Ranking alone, top 10 whatever the bar (recall@10, precision@10): W_WORDS

| W_WORDS | judged R@10 | judged P@10 | a or b R@10 | a or b P@10 | any R@10 | any P@10 | notes given at Z_MIN 2.6 |
|---|---|---|---|---|---|---|---|
| 0.1 | 0.89 | 0.17 | 0.30 | 0.19 | 0.37 | 0.19 | 1.02 |
| 0.3 | 0.82 | 0.16 | 0.31 | 0.19 | 0.37 | 0.19 | 1.02 |
| 1 | 0.81 | 0.16 | 0.33 | 0.19 | 0.37 | 0.19 | 0.97 |

### Identifier rule at Z_MIN 2.6 and 2.3 (first messages): cut-off = max(2, share of the pool)

|  | notes given | nothing given | judged recall | judged precision | auto recall | auto precision |
|---|---|---|---|---|---|---|
| Z_MIN 2.6, rule off | 1.02 | 39% | 0.24 ±0.08 | 0.36 ±0.11 | 0.08 | 0.37 |
| Z_MIN 2.6, cut-off 1% | 1.13 | 35% | 0.27 ±0.08 | 0.37 ±0.11 | 0.08 | 0.37 |
| Z_MIN 2.6, cut-off 5% | 1.14 | 35% | 0.27 ±0.08 | 0.37 ±0.11 | 0.09 | 0.37 |
| Z_MIN 2.6, cut-off 10% | 1.16 | 35% | 0.27 ±0.08 | 0.37 ±0.11 | 0.09 | 0.37 |
| Z_MIN 2.6, cut-off 20% | 1.16 | 35% | 0.27 ±0.08 | 0.37 ±0.11 | 0.09 | 0.37 |
| Z_MIN 2.3, rule off | 1.70 | 22% | 0.43 ±0.10 | 0.42 ±0.10 | 0.12 | 0.34 |
| Z_MIN 2.3, cut-off 1% | 1.80 | 20% | 0.45 ±0.10 | 0.42 ±0.09 | 0.12 | 0.33 |
| Z_MIN 2.3, cut-off 5% | 1.81 | 20% | 0.45 ±0.10 | 0.42 ±0.09 | 0.12 | 0.33 |
| Z_MIN 2.3, cut-off 10% | 1.83 | 20% | 0.45 ±0.10 | 0.42 ±0.09 | 0.12 | 0.33 |
| Z_MIN 2.3, cut-off 20% | 1.83 | 20% | 0.45 ±0.10 | 0.42 ±0.09 | 0.12 | 0.33 |

What the rule finds, over all queries:

| cut-off | queries with an identifier token | queries it finds notes for | notes a query | its notes that are positives: judged | any automatic | a or b | hand-judged additions that helped |
|---|---|---|---|---|---|---|---|
| 1% | 19% | 3% | 0.06 | 50% | 32% | 9% | 10 of 21 |
| 5% | 19% | 4% | 0.07 | 50% | 34% | 12% | 11 of 22 |
| 10% | 19% | 4% | 0.08 | 50% | 34% | 12% | 11 of 22 |
| 20% | 19% | 4% | 0.08 | 50% | 32% | 11% | 11 of 22 |

### Later messages: Z_TURN (472 messages, 10 with judged positives not given before, 298 with automatic ones)

|  | anything given | notes given | topic and its note both | judged recall | judged precision | auto recall | auto precision |
|---|---|---|---|---|---|---|---|
| Z_MIN 2.3, Z_TURN 2.6 | 45% | 0.72 | 5% | 0.21 ±0.13 | 0.42 ±0.20 | 0.03 | 0.17 |
| Z_MIN 2.3, Z_TURN 3.0 | 29% | 0.36 | 1% | 0.04 ±0.04 | 1.00 ±0.00 | 0.02 | 0.26 |
| Z_MIN 2.3, Z_TURN 3.5 | 15% | 0.17 | 0% | 0.03 ±0.03 | 1.00 ±0.00 | 0.01 | 0.28 |
| Z_MIN 2.6, Z_TURN 2.6 | 46% | 0.74 | 5% | 0.19 ±0.12 | 0.42 ±0.20 | 0.03 | 0.17 |
| Z_MIN 2.6, Z_TURN 3.0 | 30% | 0.38 | 1% | 0.03 ±0.03 | 1.00 ±0.00 | 0.02 | 0.25 |
| Z_MIN 2.6, Z_TURN 3.5 | 16% | 0.18 | 0% | 0.03 ±0.03 | 1.00 ±0.00 | 0.01 | 0.26 |

Later messages with the identifier rule (cut-off 5%) at Z_MIN 2.6:

|  | anything given | notes given | topic and its note both | judged recall | judged precision | auto recall | auto precision |
|---|---|---|---|---|---|---|---|
| Z_TURN 2.6, identifier rule | 47% | 0.77 | 5% | 0.19 ±0.12 | 0.42 ±0.20 | 0.03 | 0.17 |
| Z_TURN 3.0, identifier rule | 31% | 0.41 | 1% | 0.03 ±0.03 | 1.00 ±0.00 | 0.02 | 0.25 |
| Z_TURN 3.5, identifier rule | 17% | 0.22 | 0% | 0.03 ±0.03 | 1.00 ±0.00 | 0.01 | 0.26 |

## Recommendation

| setting | now | recommended | why |
|---|---|---|---|
| `Z_MIN` | 2.6 | **2.3** | See below. |
| `W_WORDS` | 0.1 | **keep 0.1** | Changes ranking, not what is given. |
| identifier rule, cut-off | none | **add it, cut-off max(2, 1% of the pool)** | Rare, cheap, as precise as the bar. |
| `Z_TURN` (later messages) | none given | **3.0** if later messages get notes | Halves what is added at little cost. |

**Z_MIN 2.3.** On first messages the app's 2.6 gives 1.0 note and nothing at all for 39% of them. At 2.3 it gives 1.7 notes
and nothing for 22%; hand-judged recall goes from 0.24 to 0.43 (±0.10) with precision no lower (0.36 to 0.42); on the automatic
positives recall goes from 0.08 to 0.12 and precision from 0.37 to 0.34. The 0.7 notes added were positives 33% of the time by
judgement (18 notes) and 27% by the automatic positives (115), against a chance level of 3% and 13%. One step further, 2.0
adds 1.25 notes more with 11% and 17% of them positives, which is the chance level: stop at 2.3. Ranking itself is good (the
top 10 hold 0.89 of what was judged helpful) and the bar is what loses it (0.24 of it is given), which is the case for a lower
bar; the bar also cannot see the notes that matter most (below), so it will not reach the ranking's recall.

**W_WORDS 0.1.** The fused order of the best notes changes, the set above the bar hardly does (1.02 notes given at 0.1 against
0.97 at 1.0; k = 10 is never reached on average, 3 notes at the lowest bar). Judged recall@10 favours 0.1 (0.89 against 0.82 and 0.81); the automatic a-or-b set favours 1.0 by two points
(0.30 to 0.33); any is equal. No reason to move.

**Identifier rule, max(2, 1%).** In users' own words identifier-like tokens are in 19% of messages, and the rule finds a note
for 3% of them (0.06 notes a message): small, by design. Of the 22 notes it added that were judged by hand (one per message it
fires for, most of them), 11 helped (10 of 21 at the 1% cut-off), which is as precise as what the bar gives (judged
precision 0.36 to 0.42). At Z_MIN 2.6 it takes "nothing given" from 39% to 35% and judged recall from 0.24 to 0.27. A larger
cut-off (5%, 10%, 20%) finds the same notes, so a tight one costs nothing: with fewer than 200 notes max(2, 1%) is 2. Without
the filter for agents' messages the rule fired for 16% of the messages, because briefs and relayed messages are full of
paths; it is a rule for what a person types. Its false positives are ordinary hyphenated words: 5 of the 11 additions that did
not help matched only on "built-in" (a note on start-up notes). A stop-list of such words, or letting a two-part kebab-case word
count only with a digit, an underscore or a path beside it, would remove them (not tested).

**Z_TURN 3.0.** At the first message's bar, 46% of later messages would get a new note (0.74 a message), with auto precision
0.17 against chance 0.10. At 3.0 it is 30% (0.38) with precision 0.25; at 3.5, 16% (0.18) and 0.26: the second step halves
what is given again and buys nothing. A topic given with one of its own notes falls from 5% to 1%. Hand-judged evidence is
thin here (10 later messages have a judged note not given before), and does not separate the three.

**Other findings.**

- Ten notes (of the 47 judged helpful at least once; 234 in all) account for 46% of the helpful judgements: standing preferences and working rules (how to commit and
  ship in this repository, UI tastes) that bear on a kind of task, not on the words of a message. A bar on similarity to the
  message misses them whatever Z_MIN is; they are what an always-given short list would carry.
- A topic and one of its own notes are both given in 6% of first messages at the app's bar (14% at 2.0). `memoryInstructions`
  leaves a topic's notes out once the topic is given; `memoryParts`, which the sessions use, does not.
- The kebab-case rule aside, nothing here depends on the model: the vectors and the bar are the app's own.

## Caveats

- **One installation.** One user, 242 sessions over 17 days, two main repositories, pools of about 60 notes. The bar is
  measured against the bulk of the pool, so its behaviour at hundreds or thousands of notes is not shown here.
- **Queries.** 782 queries (240 first messages, 542 later ones); 42 judged. Later messages are often short follow-ups ("ok, ship it") whose meaning is in the conversation, not
  the message.
- **Automatic positives are noisy.** Against the hand-judged queries (table above): source a, notes among the first five of a
  `recall` result, were judged helpful 8% of the time and cover 13% of the judged helpful notes (the agent searches in its own
  words, and `recall` runs the same search that is being tested, so a is also circular); b is accurate (40%) but rare (5% of
  helpful notes); c (names in later commands) 11% and 8%. Any of them together: 11% and 25%. So the **auto** columns say how
  the settings order against a crude proxy, and recall there is low by construction; the **judged** columns are the better
  evidence but rest on 18 first messages (a standard error of 0.1 on recall) and 10 later ones.
- **Judging.** One rater (the agent that built this), strict ("plausibly helped the agent with this request"), reading
  candidates that this same search and the automatic positives proposed: a helpful note none of them proposed was never seen,
  so recall of any method is overstated a little and the metric favours what the search already finds. Judgements that a note
  helped were often generous to standing rules (committing, shipping) for any request to change code.
- **Replay.** Fusion and selection are written again (identical to `findNotes` on a sample, above); vectors of notes whose text
  changed were made again by the same model (of the stored vectors, 125 of 225 are reproduced exactly and 90.5% of their bytes:
  batching in the ONNX run moves a few of the 4-bit levels); `boost` has no use counts from the time; the messages' filter
  for agent-written ones is a heuristic.
- **What a given note is worth** is not measured: nothing here says whether the agent did better with it.
