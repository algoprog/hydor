// Script test for where a reply that writes its tool calls as text ends (cutAtCalls, CallGate in parse.ts), and for the
// bare <invoke> block StreamFilter keeps out of what is shown. Each reply is cut as a whole and streamed through the gate
// in pieces of several sizes: what the gate lets through, what it says the reply is, and where the whole text is cut must
// agree, and it must say the reply is over exactly when the text is cut before its end. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agent/parse-test.ts && DATA_DIR=/tmp/hydor-test-parse node dist/dev/parse-test.js
import assert from 'node:assert/strict';
import { CallGate, cutAtCalls, MAX_TEXT_CALLS, parseCalls, StreamFilter } from './parse.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const known = new Set(['bash', 'read_file']);
const hermes = (command: string) => `<tool_call>\n${JSON.stringify({ name: 'bash', arguments: { command } })}\n</tool_call>`;
const bare = (command: string) => `<invoke name="bash">\n<parameter name="command">${command}</parameter>\n</invoke>`;

/**
 * Cuts `text` as a whole and streams it through a gate in pieces of 1, 3, 7 and 50 characters; checks they agree, and
 * gives the reply as kept (what the whole text is cut to, without trailing space).
 */
function check(text: string): { kept: string; cut: boolean } {
  const whole = cutAtCalls(text, true);
  const kept = text.slice(0, whole.stop ?? text.length).trimEnd();
  assert.ok(whole.safe <= (whole.stop ?? text.length), 'what is settled never passes where the reply ends');
  for (const size of [1, 3, 7, 50]) {
    let shown = '';
    let over = -1;
    const gate = new CallGate((t) => (shown += t));
    for (let i = 0; i < text.length; i += size) {
      const was = gate.stopped;
      const said = gate.push(text.slice(i, i + size));
      assert.equal(said, gate.stopped, `push says what stopped says (pieces of ${size})`);
      if (was) assert.ok(said, 'once over, it stays over');
      if (said && over < 0) over = i;
    }
    const ended = gate.end();
    assert.equal(ended, kept, `end() is the cut text (pieces of ${size})`);
    assert.equal(shown.trimEnd(), kept, `what the gate let through is the cut text (pieces of ${size})`);
    assert.equal(over >= 0, whole.stop !== null, `the gate says the reply is over exactly when the text is cut (pieces of ${size})`);
    assert.equal(gate.stopped, whole.stop !== null);
  }
  // Seen so far at any point, what is settled is never more than the reply will keep (but for space after it, which
  // the gate may let through before it knows the reply ends: it is trimmed from what is kept).
  for (let n = 0; n <= text.length; n += 5) {
    const part = cutAtCalls(text.slice(0, n), false);
    assert.equal(text.slice(0, part.safe).trimEnd().length <= kept.length, true, `a prefix of ${n} settles no more than the reply keeps`);
    if (part.stop !== null) assert.ok(part.stop <= (whole.stop ?? text.length), `a prefix of ${n} is cut no later than the whole`);
  }
  return { kept, cut: whole.stop !== null };
}

test('a call, then a result the model made up and more prose and calls: the reply ends at the call', () => {
  const call = hermes('ls');
  const text = `Let me look.\n${call}\n<tool_response>\nREADME.md\n</tool_response>\nThe folder holds a README.\n${hermes('cat README.md')}\n<tool_response>\nhi\n</tool_response>\nDone.`;
  const { kept, cut } = check(text);
  assert.equal(kept, `Let me look.\n${call}`);
  assert.ok(kept.endsWith('</tool_call>'));
  assert.ok(cut);
  assert.deepEqual(parseCalls(kept, known), [{ name: 'bash', args: { command: 'ls' } }]);
});

test('two calls in a row, then a result the model made up: both are kept', () => {
  const text = `Two things.\n${hermes('ls')}\n\n${hermes('pwd')}\n<tool_response>\nmade up\n</tool_response>\nAll done.`;
  const { kept } = check(text);
  assert.equal(kept, `Two things.\n${hermes('ls')}\n\n${hermes('pwd')}`);
  assert.deepEqual(
    parseCalls(kept, known).map((c) => c.args.command),
    ['ls', 'pwd'],
  );
});

test('eight bare <invoke> calls with blank lines between them: only the first six are kept', () => {
  assert.equal(MAX_TEXT_CALLS, 6);
  const calls = Array.from({ length: 8 }, (_, i) => bare(`echo ${i + 1}`));
  const { kept, cut } = check(calls.join('\n\n'));
  assert.equal(kept, calls.slice(0, 6).join('\n\n'));
  assert.ok(cut);
  assert.equal(parseCalls(kept, known).length, 6);
});

test('the same call written twice, with another between: the reply ends before the repeat', () => {
  const text = `${hermes('make test')}\n${hermes('git status')}\n${hermes('make   test')}\n${hermes('ls')}`;
  const { kept, cut } = check(text);
  assert.equal(kept, `${hermes('make test')}\n${hermes('git status')}`, 'a repeat differing only in whitespace is a repeat');
  assert.ok(cut);
});

test('a <function_calls> group of two calls ends the reply there, whatever follows', () => {
  const group = `<function_calls>\n${bare('ls')}\n${bare('pwd')}\n</function_calls>`;
  const text = `Running both.\n${group}\n<function_results>\nmade up\n</function_results>\n${bare('date')}`;
  const { kept, cut } = check(text);
  assert.equal(kept, `Running both.\n${group}`);
  assert.ok(cut);
  assert.deepEqual(
    parseCalls(kept, known).map((c) => c.args.command),
    ['ls', 'pwd'],
  );
});

test('a group that ends the reply counts as over even with nothing after it', () => {
  const group = `<function_calls>\n${bare('ls')}\n</function_calls>`;
  const { kept, cut } = check(`Look.\n${group}\n`);
  assert.equal(kept, `Look.\n${group}`);
  assert.ok(cut, 'the model is stopped at once: it has nothing more to say');
});

test('prose after a call ends the reply at the call', () => {
  const text = `Checking.\n${hermes('ls')}\nI will wait for the result, and then tell you what it shows.`;
  const { kept, cut } = check(text);
  assert.equal(kept, `Checking.\n${hermes('ls')}`);
  assert.ok(cut);
});

test('a final answer with no calls that shows a <tool_response> inside a fence is left whole', () => {
  for (const fence of ['```', '~~~']) {
    const text = `Tool results look like this:\n\n${fence}xml\n<tool_response>\nok\n</tool_response>\n${fence}\n\nThat is all.\n`;
    const { kept, cut } = check(text);
    assert.equal(kept, text.trimEnd());
    assert.ok(!cut);
  }
});

test('a made-up <tool_response> before any call ends the reply before its line', () => {
  const text = 'Let me look.\n  <tool_response>\nfiles\n</tool_response>\nDone.';
  const { kept, cut } = check(text);
  assert.equal(kept, 'Let me look.');
  assert.ok(cut);
  for (const tag of ['<tool_result>', '<tool_output>', '<function_results>', '<function_result>', '<user>', '<user/>', '</assistant>']) {
    assert.equal(check(`Hm.\n${tag}\nx`).kept, 'Hm.', tag);
  }
});

test('a call whose arguments hold a <tool_response> block is kept whole', () => {
  const call = bare('cat <<EOF\n<tool_response>\nmade up\n</tool_response>\nEOF');
  const { kept, cut } = check(`Writing a fixture.\n${call}`);
  assert.equal(kept, `Writing a fixture.\n${call}`);
  assert.ok(!cut);
  const { kept: after } = check(`Writing a fixture.\n${call}\n<tool_response>\nmade up\n</tool_response>`);
  assert.equal(after, `Writing a fixture.\n${call}`, 'the one after the call still ends the reply');
  assert.equal(parseCalls(kept, known).length, 1);
});

test('<assistant>, a call, </assistant> and then a <user> block: the reply ends after the call', () => {
  const text = `<assistant>\nChecking.\n${hermes('ls')}\n</assistant>\n<user>\nthanks\n</user>`;
  const { kept, cut } = check(text);
  assert.equal(kept, `<assistant>\nChecking.\n${hermes('ls')}`);
  assert.ok(cut);
});

test('a call still open at the end is kept as it is', () => {
  const text = 'Go.\n<tool_call>\n{"name": "bash", "arguments": {"command": "ls';
  const { kept, cut } = check(text);
  assert.equal(kept, text);
  assert.ok(!cut);
  const afterOne = `${hermes('ls')}\n<tool_call>\n{"name": "bash"`;
  assert.equal(check(afterOne).kept, afterOne, 'a second call begun and cut off is kept too');
});

test('words that only look like the app’s tags are left alone', () => {
  const text = 'Set the <username> field, then <tool_callx> and <users>.\n<username> at the start of a line, <tool_resulting> too, and <function_resultsx>.\nDone.';
  const { kept, cut } = check(text);
  assert.equal(kept, text.trimEnd());
  assert.ok(!cut);
  const answer = `${hermes('ls')}\n<tool_calls>`;
  assert.ok(check(answer).cut, 'but a call then something that is not a call is cut');
});

test('a reply with no calls at all comes through whole, as it was written, ending in what looks like a tag', () => {
  const text = 'Use a tag like <tool_';
  const { kept, cut } = check(text);
  assert.equal(kept, text);
  assert.ok(!cut);
});

test('a gate holds back what may be a tag until it is known, and shows nothing of the cut-off part', () => {
  const shown: string[] = [];
  const gate = new CallGate((t) => shown.push(t));
  assert.equal(gate.push('Checking.\n<tool_c'), false);
  assert.ok(!shown.join('').includes('<tool_c'), 'the start of a possible call is held');
  assert.equal(gate.push(`all>\n{"name":"bash","arguments":{"command":"ls"}}\n</tool_call>`), false, 'the call is whole, but another may follow');
  assert.equal(gate.push('\n<tool_response>\nmade up'), true);
  assert.equal(gate.push('\nmore'), true);
  assert.equal(gate.end(), `Checking.\n${hermes('ls')}`);
  assert.ok(!shown.join('').includes('made up'));
  assert.ok(!shown.join('').includes('<tool_response'));
});

test('the stream filter hides a bare <invoke> block from the text shown, and keeps the prose around it', () => {
  for (const size of [1, 3, 7, 50]) {
    const text = `Let me check.\n${bare('ls -la')}\nThen I will read it.`;
    let shown = '';
    let thought = '';
    const f = new StreamFilter({ text: (t) => (shown += t), thought: (t) => (thought += t) });
    for (let i = 0; i < text.length; i += size) f.push(text.slice(i, i + size));
    f.end();
    assert.ok(!shown.includes('invoke'), `no <invoke> in what is shown (pieces of ${size}): ${JSON.stringify(shown)}`);
    assert.ok(!shown.includes('ls -la'));
    assert.equal(shown.replace(/\s+/g, ' ').trim(), 'Let me check. Then I will read it.');
    assert.equal(thought, '');
  }
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}\n`, e);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
