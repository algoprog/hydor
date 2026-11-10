# Cause

`drain()` resolved as soon as the queue looked idle: nothing running and nothing waiting to start. A job whose
attempt has just failed and that still has retries left is neither of those while it waits for its backoff timer:
the attempt has ended (so `running` went down) and the job is only put back into `waiting` when the timer fires.
If that job was the last one in flight, the queue was "idle" for the length of the backoff, `#pump()` woke every
`drain()` call, and the caller carried on while a retry was still to come (and its result still to be delivered).

It is rare because it needs the last attempt of the whole batch to fail with retries left; while any other job is
running or waiting, the check is false and everything looks fine. That is why the visible tests pass, and why
awaiting `drain()` twice or serialising the code that starts the next job changes nothing: the state they look at
is already wrong at the moment drain is asked.

Fix: count the jobs that are waiting for a backoff timer (`#backingOff`) and treat the queue as idle only when that
count is zero as well as `running` and `waiting`.
