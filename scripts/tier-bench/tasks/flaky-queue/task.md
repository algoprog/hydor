Our job queue (src/queue.mjs) is flaky. About once in thirty runs of test/stress.test.mjs, a job has not settled by the time `await queue.drain()` returns, so it looks as if drain() comes back early or a job got lost. test/queue.test.mjs always passes. The options and behaviour of the queue are described in the comment at the top of src/queue.mjs.

We tried two things and neither helped: awaiting drain() twice, and wrapping the function that starts the next job in a lock. Nobody on the team understands why it happens.

Please find the real cause and fix it in src/queue.mjs without changing the public API (constructor options, add(), drain() and what they do, as described in the top comment). Then write down what the cause was, in a few sentences, in a new file CAUSE.md next to package.json.
