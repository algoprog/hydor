# Evaluating agents, and answers drawn from documents

Open this when the system under test takes actions with tools (an agent, an app that books, files
or sends things) or answers from a set of documents (retrieval, "chat with my files").

## Agents

- **Write each case as a small contract:** the request; the tools and permissions it may use; the
  outcome expected; what must not happen (deleting, paying, emailing someone, touching another
  account); and how you will check each of these.
- **A sandbox per run:** a copy of the folder, a test account, a fake mail server or calendar, put
  back to the same starting state before every run, so runs cannot affect each other.
- **Grade the outcome from the world, not from the reply.** After the run, look: the file exists
  with the right content, the record changed, the message sits in the outbox, nothing else moved.
  The agent saying it did it is not evidence.
- **Grade the path too,** from the log of its tool calls: the right tools with valid arguments,
  nothing forbidden, no needless or repeated risky steps, and it stopped or asked when it should
  have. A right result reached by a forbidden action is a failure.
- **Cases where the right outcome is not to finish:** information missing (it should ask), a
  request beyond its permissions (it should refuse or hand over), a tool that fails or returns
  nonsense (it should recover or report it). Score exactly that outcome.
- **Repeat each task 3 to 5 times:** agents vary from run to run. Report the share of runs that
  succeed and how many tasks succeed every time; for anything that runs unattended, the second
  number matters more.
- **For each failure, find the first step that went wrong** (the plan, the choice of tool, its
  arguments, a bad tool result, a misread result), not only the last error shown.
- **Never averaged away:** forbidden actions, private data leaked, harm done outside the sandbox.
  Count them on their own line; one can be enough to say no, whatever the success rate.
- Cost (tokens, money) and time per task beside the success rate.

## Answers from documents (retrieval)

- **Score claims, not whole answers.** Split each answer into its factual claims and mark each
  one supported by the passages it was given, contradicted by them, or not in them.
- **Find which part failed.** For a wrong or unsupported claim: was a passage that answers it
  among those retrieved? No: a retrieval failure (the search, how documents were cut up, the
  index). Yes: a generation failure (the prompt, the model). Both can fail at once; record both.
- **Measure the two apart:** retrieval (how often the passage that answers the question comes
  back in the first few results) and faithfulness (the share of the answer's claims that the
  retrieved passages support). Wording close to the source is not proof of support.
- **Cases to include:** an answer that is in one document; one that needs two; a question the
  documents do not answer (it should say so, not guess); an outdated or conflicting source; a
  document this user may not see (it must not be used).
- **Correct citations can still mislead.** Check that the answer keeps its sources' conditions
  and exceptions, and that the evidence is strong enough for what it recommends: a small trial
  supports "worth a trial", not "roll it out everywhere".
