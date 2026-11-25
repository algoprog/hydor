// Script tests for showing an agent's text-file edit while its tool call still arrives (shared/file-edits.ts): an Edit
// or a MultiEdit cut anywhere in its JSON is applied to the file's text as far as its new words have come; while its old
// words are still coming, the place it will change is marked (once MIN_PLACE of them are there) and nothing is changed;
// a deletion, replace_all, the html option, JSON escapes, and the garbage that a call can be cut to all come out right.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs shared/file-edits-test.ts
//   DATA_DIR=/tmp/hydor-test-file-edits node dist/dev/file-edits-test.js
import { liveFileEdit, restOf, MIN_PLACE } from './file-edits.ts';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
/** The call text cut right after the first `marker` in it. */
const cutAfter = (call: string, marker: string) => call.slice(0, call.indexOf(marker) + marker.length);

// ---- a whole Edit --------------------------------------------------------------------------------------------------
{
  const base = '# Title\n\nSome text here.\n\nSome text here.\n';
  const call = JSON.stringify({ file_path: '/a.md', old_string: 'Some text here.', new_string: 'New words.' });
  const r = liveFileEdit(base, call);
  const want = '# Title\n\nNew words.\n\nSome text here.\n';
  ok(r && r.text === want, 'a whole Edit: the first occurrence replaced');
  ok(r && r.from === want.indexOf('New words.') && r.to === r.from + 'New words.'.length, 'a whole Edit: from..to covers the new words');
  ok(r && r.placing === false, 'a whole Edit: not placing');
}

// ---- new_string cut part way ---------------------------------------------------------------------------------------
{
  const base = '# Title\n\nSome text here.\n\nSome text here.\n';
  const call = cutAfter(JSON.stringify({ file_path: '/a.md', old_string: 'Some text here.', new_string: 'New words.' }), 'New wo');
  const r = liveFileEdit(base, call);
  const before = '# Title\n\n';
  const after = '\n\nSome text here.\n';
  ok(r && r.text.startsWith(before + 'New wo') && r.text.endsWith(after), 'new_string cut: before + new so far + rest + after');
  ok(r && r.from === before.length && r.to === r.from + 'New wo'.length, 'new_string cut: to = from + the new words so far');
  ok(r && r.placing === false, 'new_string cut: not placing');
}

// ---- rewording mid-sentence: the old words' rest is kept -------------------------------------------------------------
{
  const base = 'Intro.\nThe quick brown fox jumps over the lazy dog.\nEnd.';
  const call = cutAfter(
    JSON.stringify({
      file_path: '/a.md',
      old_string: 'The quick brown fox jumps over the lazy dog.',
      new_string: 'The quick red fox jumps over the lazy dog.',
    }),
    'red fox ju',
  );
  const r = liveFileEdit(base, call);
  ok(r && r.text === 'Intro.\nThe quick red fox jumps over the lazy dog.\nEnd.', 'rewording: the rest of the old sentence follows the new words so far');
}

// ---- old_string cut part way -----------------------------------------------------------------------------------------
{
  const base = 'Intro.\nThe quick brown fox jumps over the lazy dog.\nEnd.';
  const old = 'The quick brown fox jumps over the lazy dog.';
  const call = cutAfter(JSON.stringify({ file_path: '/a.md', old_string: old, new_string: 'X' }), 'The quick brown fox ju');
  const cut = 'The quick brown fox ju';
  const r = liveFileEdit(base, call);
  ok(cut.length >= MIN_PLACE && r && r.text === base, 'old_string cut at 12 or more: the file is unchanged');
  ok(r && r.placing === true && r.from === base.indexOf(old) && r.to === r.from + cut.length, 'old_string cut at 12 or more: marks the place it will change');
}

// ---- old_string cut before MIN_PLACE characters -----------------------------------------------------------------------
{
  const base = 'Intro.\nThe quick brown fox jumps over the lazy dog.\nEnd.';
  const call = cutAfter(JSON.stringify({ file_path: '/a.md', old_string: 'The quick brown fox jumps over the lazy dog.', new_string: 'X' }), 'The quick');
  ok(liveFileEdit(base, call) === null, 'old_string cut before MIN_PLACE characters: nothing shown');
}

// ---- old_string not in the file ----------------------------------------------------------------------------------------
{
  const base = 'Intro.\nThe quick brown fox.\nEnd.';
  const call = JSON.stringify({ file_path: '/a.md', old_string: 'Nothing like this is here', new_string: 'Y' });
  ok(liveFileEdit(base, call) === null, 'an old_string not in the file: nothing shown');
}

// ---- replace_all -------------------------------------------------------------------------------------------------------
{
  const base = 'a foo b foo c foo';
  const call = JSON.stringify({ file_path: '/a.txt', old_string: 'foo', new_string: 'bar', replace_all: true });
  const r = liveFileEdit(base, call);
  ok(r && r.text === 'a bar b bar c bar', 'replace_all: every occurrence replaced');
  ok(r && r.from === 2 && r.to === 5, 'replace_all: from is the first occurrence');
}

// ---- MultiEdit: second edit cut inside its new_string ------------------------------------------------------------------
{
  const base = 'alpha one\nbeta two\ngamma three\n';
  const call = cutAfter(
    JSON.stringify({
      file_path: '/a.md',
      edits: [
        { old_string: 'alpha one', new_string: 'ALPHA ONE' },
        { old_string: 'gamma three', new_string: 'GAMMA THREE PLUS' },
      ],
    }),
    'GAMMA THREE PL',
  );
  const r = liveFileEdit(base, call);
  const want = 'ALPHA ONE\nbeta two\nGAMMA THREE PL\n';
  ok(r && r.text === want, 'MultiEdit: the first edit is made, the second on its result');
  ok(r && r.from === want.indexOf('GAMMA') && r.to === r.from + 'GAMMA THREE PL'.length, 'MultiEdit: from..to refer to the second edit');
}

// ---- MultiEdit: a finished edit whose old words are missing is skipped ----------------------------------------------
{
  const base = 'alpha one\nbeta two\ngamma three\n';
  const call = JSON.stringify({
    file_path: '/a.md',
    edits: [
      { old_string: 'not in the file at all', new_string: 'x' },
      { old_string: 'beta two', new_string: 'BETA TWO' },
    ],
  });
  const r = liveFileEdit(base, call);
  const want = 'alpha one\nBETA TWO\ngamma three\n';
  ok(r && r.text === want && r.from === want.indexOf('BETA TWO') && r.placing === false, 'MultiEdit: a missing finished edit is skipped, the next is made');
}

// ---- html option: a tag cut short is left out ----------------------------------------------------------------------------
{
  const base = '<div>\nOld text here\n</div>';
  const call = cutAfter(
    JSON.stringify({ file_path: '/a.html', old_string: 'Old text here', new_string: '<p class="new">Hi</p><p class="x' }),
    '<p class=\\"x', // JSON escapes the quotes
  );
  const r = liveFileEdit(base, call, { html: true });
  ok(r && r.text === '<div>\n<p class="new">Hi</p>\n</div>', 'html: a tag cut short at the end is left out of the shown text');
  ok(r && r.text.indexOf('<p class="x') < 0, 'html: no part of the cut tag shown');
}

// ---- JSON escapes are decoded --------------------------------------------------------------------------------------------
{
  const base = 'one\ntwo\n';
  const call = JSON.stringify({ file_path: '/a.txt', old_string: 'two', new_string: 'line A\nsay "hi"' });
  const r = liveFileEdit(base, call);
  ok(r && r.text === 'one\nline A\nsay "hi"\n', 'JSON escapes: a newline and a quote are decoded');
  ok(r && r.text.includes('\n') && r.text.includes('"'), 'JSON escapes: the text has a real newline and quote');
}

// ---- deleting ----------------------------------------------------------------------------------------------------------------
{
  const base = 'keep this. remove me. keep too.';
  const call = JSON.stringify({ file_path: '/a.txt', old_string: ' remove me.', new_string: '' });
  const r = liveFileEdit(base, call);
  const at = base.indexOf(' remove me.');
  ok(r && r.text === 'keep this. keep too.' && r.from === at && r.to === at, 'deleting: the old words removed, from === to');
}

// ---- garbage or empty calls ---------------------------------------------------------------------------------------------------
{
  const base = 'some file text';
  ok(liveFileEdit(base, '') === null, 'an empty call: nothing shown');
  ok(liveFileEdit(base, '{"file_path": "/a.md"') === null, 'a call with no edit yet: nothing shown');
}

// ---- restOf directly ---------------------------------------------------------------------------------------------------------
{
  ok(restOf('Some text here.', 'Some text') === ' here.', 'restOf: the new words are a prefix of the old, the old rest is returned');
  ok(restOf('alpha\nbeta gamma\ndelta', 'zz') === '\nbeta gamma\ndelta', 'restOf: no match keeps the old words from the next line break');
  ok(restOf('no newline here', 'zz') === '', 'restOf: no match and no line break leaves nothing');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
