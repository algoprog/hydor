// OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/pages/beside-rule-test.ts && node dist/dev/beside-rule-test.js
// Tests which of a turn's documents opens beside the conversation by itself (the first, while it is the only one), that a
// second one puts the panel back, and that a document is counted once under all the names it goes by. Each case checks
// what noteDoc returns, and that quiet and opened change the state as the module says they do.
import assert from 'node:assert/strict';
import { htmlTitle, noteDoc, opened, quiet, titleName, whichDoc, type TurnDocs } from './beside-rule';

// A name the call's page is also known by, once the call has saved it.
const more = (n: string): string[] => (n === 'call1' ? ['page1'] : []);

// The turn's first document opens by itself.
{
  const r = noteDoc(undefined, 't1', ['call1']);
  assert.equal(r.step, 'open');
  assert.equal(r.at, 0);
  assert.equal(r.now.turn, 't1');
  assert.deepEqual(r.now.docs, [['call1']]);
}

// The same document again, before anything marked it open: it still opens.
{
  const first = noteDoc(undefined, 't1', ['call1']);
  const again = noteDoc(first.now, 't1', ['call1']);
  assert.equal(again.step, 'open');
  assert.equal(again.at, 0);
  assert.equal(again.now.docs.length, 1);
}

// Once it is open, the same document again does nothing, and stays open.
{
  const first = noteDoc(undefined, 't1', ['call1']);
  const shown = opened(first.now, 0);
  const again = noteDoc(shown, 't1', ['call1']);
  assert.equal(again.step, 'none');
  assert.equal(again.now.opened, 0);
}

// A second document while the first is open puts the panel back; once closed by hand, nothing opens again.
{
  const first = noteDoc(undefined, 't1', ['call1']);
  const shown = opened(first.now, 0);
  const second = noteDoc(shown, 't1', ['call2']);
  assert.equal(second.step, 'put-back');
  assert.equal(second.at, 1);
  assert.equal(second.now.docs.length, 2);
  const closed = quiet(second.now);
  assert.equal(noteDoc(closed, 't1', ['call3']).step, 'none');
  assert.equal(noteDoc(closed, 't1', ['call1']).step, 'none');
}

// A second document when the first never opened: nothing is shown by itself, and the first one again is not either.
{
  const first = noteDoc(undefined, 't1', ['call1']);
  const second = noteDoc(first.now, 't1', ['call2']);
  assert.equal(second.step, 'none');
  assert.equal(second.now.docs.length, 2);
  const back = noteDoc(second.now, 't1', ['call1']);
  assert.equal(back.step, 'none');
  assert.equal(back.at, 0);
}

// A new turn starts afresh: the quiet state of the last turn does not carry over.
{
  const first = noteDoc(undefined, 't1', ['call1']);
  const shown = opened(first.now, 0);
  const second = noteDoc(shown, 't1', ['call2']);
  const state: TurnDocs = quiet(second.now);
  const r = noteDoc(state, 't2', ['x']);
  assert.equal(r.step, 'open');
  assert.equal(r.at, 0);
  assert.deepEqual(r.now.docs, [['x']]);
  assert.equal(r.now.quiet, undefined);
  assert.equal(r.now.opened, undefined);
}

// One document under several names: the call's page counts as the same document, so nothing changes.
{
  const first = noteDoc(undefined, 't1', ['call1']);
  const shown = opened(first.now, 0);
  const r = noteDoc(shown, 't1', ['call2', 'page1'], more);
  assert.equal(r.at, 0);
  assert.equal(r.step, 'none');
  assert.equal(r.now.docs.length, 1);
  assert.ok(r.now.docs[0].includes('call1'));
  assert.ok(r.now.docs[0].includes('page1'));
  assert.ok(r.now.docs[0].includes('call2'));
}

// Two documents that turn out to be one: they merge into one, and the open one stays open.
{
  const state: TurnDocs = { turn: 't1', docs: [['call1'], ['page1']], opened: 1 };
  const r = noteDoc(state, 't1', ['page1'], more);
  assert.equal(r.now.docs.length, 1);
  assert.equal(r.at, 0);
  assert.equal(r.now.opened, 0);
  assert.equal(r.step, 'none');
}

// A file in two forms, as one name each time: it is one document.
{
  const first = noteDoc(undefined, 't1', ['file:/home/a/report']);
  const second = noteDoc(first.now, 't1', ['file:/home/a/report']);
  assert.equal(second.now.docs.length, 1);
  assert.equal(second.at, 0);
}

// Empty and repeated names are dropped.
{
  const r = noteDoc(undefined, 't', ['a', '', 'a']);
  assert.deepEqual(r.now.docs, [['a']]);
}

// Closed by hand: a second document does not put the panel back, and the first one does not open again.
{
  const first = noteDoc(undefined, 't1', ['call1']);
  const shown = opened(first.now, 0);
  const closed = quiet(shown);
  const second = noteDoc(closed, 't1', ['call2']);
  assert.equal(second.step, 'none');
  assert.equal(noteDoc(second.now, 't1', ['call1']).step, 'none');
}

// A page's title as a name: on one line, whatever its case, its HTML's character references read; none when empty.
{
  assert.equal(titleName('  Context filter\n results:  three directions '), 'title:context filter results: three directions');
  assert.equal(titleName('   '), undefined);
  assert.equal(titleName(undefined), undefined);
  assert.equal(htmlTitle('<!doctype html><html><head><meta charset="utf-8"><title>Context Filter results: three directions</title>'), 'title:context filter results: three directions');
  assert.equal(htmlTitle('<TITLE lang="en">R&amp;D &#8212; Q3&nbsp;plan</TITLE>'), 'title:r&d — q3 plan');
  // Still being written: no title yet. None at all: none.
  assert.equal(htmlTitle('<html><head><title>Context filter res'), undefined);
  assert.equal(htmlTitle('<div class="n-page">No title</div>'), undefined);
  assert.equal(htmlTitle(undefined), undefined);
  // A name that is no character reference stays as it is.
  assert.equal(htmlTitle('<title>&constructor; &bogus; &#xZZ;</title>'), 'title:&constructor; &bogus; &#xzz;');
}

// A mock-up written to an HTML file (it opened by itself), then shown as a page of the same title: one document, so
// the page takes the file's place rather than putting the panel back.
{
  const file = noteDoc(undefined, 't1', ['write1', 'file:/tmp/mockups']);
  assert.equal(file.step, 'open');
  const shown = opened(file.now, 0);
  // The page's call is known, by now, by its title and by the HTML file of that title.
  const known = (n: string): string[] => (n === 'show1' ? ['title:three directions', 'file:/tmp/mockups'] : []);
  assert.equal(whichDoc(shown, ['show1'], known), 0);
  const page = noteDoc(shown, 't1', ['show1'], known);
  assert.equal(page.step, 'none');
  assert.equal(page.at, 0);
  assert.equal(page.now.opened, 0);
  assert.equal(page.now.docs.length, 1);
  // A page of another title is a second document: the panel goes back.
  assert.equal(whichDoc(page.now, ['show2'], known), -1);
  assert.equal(noteDoc(page.now, 't1', ['show2'], known).step, 'put-back');
}

// Two pages of the same title are one, whichever came first; a file the second one is known by joins them.
{
  const known = (n: string): string[] => (n === 'show1' || n === 'show2' ? ['title:options'] : []);
  const first = noteDoc(undefined, 't1', ['show1'], known);
  const second = noteDoc(opened(first.now, 0), 't1', ['show2'], known);
  assert.equal(second.step, 'none');
  assert.equal(second.at, 0);
  assert.equal(second.now.docs.length, 1);
  // Before it is known by its title, a page is none of the turn's documents.
  assert.equal(whichDoc(first.now, ['show2']), -1);
}

// noteDoc does not change the state it is given.
{
  const first = noteDoc(undefined, 't1', ['call1']);
  const state: TurnDocs = opened(first.now, 0);
  const before = JSON.parse(JSON.stringify(state));
  noteDoc(state, 't1', ['call2'], more);
  noteDoc(state, 't1', ['call1'], more);
  assert.deepEqual(state, before);
}

console.log('beside-rule: ok');
