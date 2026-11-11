// Script tests for the video editor's timeline changes (model.ts) that work on several things or from the keyboard:
// which track a thing is on, picking more than one (toggle, marquee), the clipboard (copy, paste at a time or an index,
// duplicate, paste attributes), deleting, cutting and moving several at once (locked tracks left alone), moving clips
// together, trimming to the playhead (Q and W), the cuts the playhead jumps between, and a moved thing snapping by its
// end as well as its start. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/mediaedit/video/model-test.ts && node dist/dev/model-test.js
import { clipSpans, type VideoFactsOf, type VideoRecipe } from '@shared/mediaedit-video';
import { splitClip, copyPicks, cutTimes, deletePicks, duplicatePicks, moveClips, neighbourCut, pasteAttributes, pasteBoard, pickedIn, samePick, shiftPicks, snapSpan, splitPicks, togglePick, trackOf, trimItemTo, trimToPlayhead, type Pick1 } from './model';

let passed = 0;
let failed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const is = (a: unknown, b: unknown, what: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} should be ${JSON.stringify(b)}`);
const close = (a: number | undefined, b: number, d = 0.002) => a !== undefined && Math.abs(a - b) <= d;

// A video of 10 seconds, a sound of 30, a picture.
const facts: VideoFactsOf = (src) => (src === 'pic' ? { duration: 0, width: 800, height: 600, picture: true } : src === 'snd' ? { duration: 30, width: 0, height: 0, audio: true } : { duration: 10, width: 1920, height: 1080, audio: true });
const base = (): VideoRecipe => ({
  clips: [
    { id: 'c1', name: 'one', trim: [0, 4] },
    { id: 'c2', name: 'two', trim: [2, 8], speed: 2, volume: 0.5, grade: { exposure: 0.3 } as never, transition: { kind: 'dissolve', length: 0.5 } },
    { id: 'c3', name: 'three', trim: [0, 5] },
  ],
  overlays: [
    { id: 'o1', src: 'pic', picture: true, length: 3, track: 2, start: 1, x: 0.8, y: 0.2, w: 0.3, opacity: 0.6, fadeIn: 0.5 },
    { id: 'o2', src: 'pic', picture: true, length: 2, track: 3, start: 5, x: 0.5, y: 0.5, w: 0.5 },
  ],
  texts: [
    { id: 't1', text: 'Hi', from: 2, to: 4, x: 0.5, y: 0.8, size: 0.07, color: '#ffffff', background: '#000000a6', bold: true },
    { id: 't2', text: 'Bye', from: 6, to: 8, x: 0.5, y: 0.2, size: 0.1, color: '#ff0000' },
  ],
  audio: [
    { id: 'a1', src: 'snd', track: 'music', start: 0, trim: [0, 10], volume: 0.4, fadeIn: 1 },
    { id: 'a2', src: 'snd', track: 'voice', start: 3, trim: [5, 9], clip: 'c1' },
  ],
});
const lens = (r: VideoRecipe) => clipSpans(r.clips ?? [], facts);
const P = (kind: Pick1['kind'], id: string): Pick1 => ({ kind, id });

// ---- tracks and picks --------------------------------------------------------------------------------------------------
{
  const r = base();
  is([trackOf(r, P('clip', 'c1')), trackOf(r, P('transition', 'c2')), trackOf(r, P('clipsound', 'c1')), trackOf(r, P('text', 't1')), trackOf(r, P('overlay', 'o1')), trackOf(r, P('overlay', 'o2')), trackOf(r, P('audio', 'a1')), trackOf(r, P('audio', 'a2'))], ['v1', 'v1', 'a1', 't1', 'v2', 'v3', 'a2', 'a3'], 'the track of each kind of thing');
  const one = togglePick([], P('clip', 'c1'));
  is(togglePick(one, P('text', 't1')).map((p) => p.id), ['c1', 't1'], 'a second thing is added');
  is(togglePick(togglePick(one, P('text', 't1')), P('clip', 'c1')).map((p) => p.id), ['t1'], 'a thing picked again is taken out');
  ok(samePick(P('clip', 'c1'), P('clip', 'c1')) && !samePick(P('clip', 'c1'), P('clipsound', 'c1')) && !samePick(null, P('clip', 'c1')), 'what is the same pick');
  // A marquee from 1.5 s to 3.6 s over every track (the second clip starts at 4).
  const all = new Set(['t1', 'v3', 'v2', 'v1', 'a1', 'a2', 'a3'] as const);
  const hit = pickedIn(r, facts, 1.5, 4.2, all);
  is(hit.map((p) => `${p.kind}:${p.id}`).sort(), ['audio:a1', 'audio:a2', 'clip:c1', 'clip:c2', 'overlay:o1', 'text:t1'].sort(), 'a marquee picks what it touches (a clip once, not also its sound)');
  is(pickedIn(r, facts, 5.5, 6, new Set(['v3'] as const)).map((p) => p.id), ['o2'], 'a marquee on one track');
  is(pickedIn(r, facts, 1.5, 4.2, new Set(['a1'] as const)).map((p) => `${p.kind}:${p.id}`), ['clipsound:c1', 'clipsound:c2'], 'a marquee only on the clips’ sound picks their sounds');
}

// ---- copy, paste, duplicate --------------------------------------------------------------------------------------------
{
  const r = base();
  is(copyPicks(r, []), null, 'nothing picked: nothing copied');
  const b = copyPicks(r, [P('clip', 'c3'), P('clip', 'c1'), P('text', 't2'), P('audio', 'a2'), P('overlay', 'o2')])!;
  is(b.clips.map((c) => c.id), ['c1', 'c3'], 'clips copied in timeline order');
  ok(b.at === 3, `the board measures from the earliest of the rest: ${b.at}`);
  // Paste at 7 s on the end of the clips: the clips go at the index; the rest move by 7 - 3 = 4 seconds.
  const p = pasteBoard(r, facts, b, { index: 3, at: 7 })!;
  is(p.recipe.clips!.map((c) => c.name), ['one', 'two', 'three', 'one', 'three'], 'the clips come after the others');
  ok(p.recipe.clips!.every((c, i, all) => all.findIndex((d) => d.id === c.id) === i) && !p.recipe.clips!.slice(3).some((c) => ['c1', 'c3'].includes(c.id!)), 'every pasted clip has an id of its own');
  ok(p.recipe.clips![4].transition === undefined, 'the last pasted clip has no transition');
  const t2 = p.recipe.texts!.find((t) => t.id !== 't1' && t.id !== 't2')!;
  ok(close(t2.from, 10) && close(t2.to, 12), `words keep their length and move with the group: ${t2.from}-${t2.to}`);
  const a2 = p.recipe.audio!.find((a) => !['a1', 'a2'].includes(a.id!))!;
  ok(a2.clip === undefined && a2.track === 'voice' && close(a2.start, 7), 'a copied sound is no longer linked to its clip');
  ok(p.picks.length === 5, 'everything made is returned picked');
  // The clips of a picked A1 sound are copied as clips.
  is(copyPicks(r, [P('clipsound', 'c2')])!.clips.map((c) => c.id), ['c2'], 'a clip’s sound picked copies the clip');
  // On another track.
  const on = pasteBoard(r, facts, copyPicks(r, [P('overlay', 'o1')])!, { at: 1, overlayTrack: 3 })!;
  ok(on.recipe.overlays!.find((o) => !['o1', 'o2'].includes(o.id!))!.track === 3, 'an overlay pasted on V3');
  const onA = pasteBoard(r, facts, copyPicks(r, [P('audio', 'a1')])!, { at: 2, audioTrack: 'voice' })!;
  ok(onA.recipe.audio!.find((a) => !['a1', 'a2'].includes(a.id!))!.track === 'voice', 'a sound pasted on the voice track');
  // At the playhead past the end: not so late that it starts after the video.
  const late = pasteBoard(r, facts, copyPicks(r, [P('text', 't1')])!, { at: 100 })!;
  const { length } = lens(r).length ? { length: lens(r).length } : { length: 0 };
  ok(late.recipe.texts!.find((t) => !['t1', 't2'].includes(t.id!))!.from <= length - 0.49, `kept inside the video: ${late.recipe.texts!.find((t) => !['t1', 't2'].includes(t.id!))!.from}`);
  // Not before 0.
  ok(close(pasteBoard(r, facts, copyPicks(r, [P('text', 't1')])!, { at: -5 })!.recipe.texts!.at(-1)!.from, 0), 'not before the start');
  // The original is untouched.
  is(r, base(), 'pasting changes a copy, not what it was made from');
  // A limit.
  const many = { ...r, overlays: Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, src: 'pic', picture: true, start: 0, x: 0.5, y: 0.5, w: 0.2 })) };
  is(pasteBoard(many, facts, copyPicks(r, [P('overlay', 'o1')])!, { at: 0 }), null, 'a paste past the most overlays is refused');
}
{
  const r = base();
  // Duplicate two clips: after the last of them.
  const d = duplicatePicks(r, facts, [P('clip', 'c1'), P('clip', 'c2')])!;
  is(d.recipe.clips!.map((c) => c.name), ['one', 'two', 'one', 'two', 'three'], 'clips duplicated go right after the last picked');
  // Duplicate an overlay: it starts where it ended.
  const o = duplicatePicks(r, facts, [P('overlay', 'o1')])!;
  ok(close(o.recipe.overlays!.at(-1)!.start, 4) && o.picks[0].kind === 'overlay' && o.picks[0].id === o.recipe.overlays!.at(-1)!.id, 'an overlay duplicated starts where it ends, and is picked');
  // Words: right after.
  ok(close(duplicatePicks(r, facts, [P('text', 't1')])!.recipe.texts!.at(-1)!.from, 4), 'words duplicated start where they end');
  is(duplicatePicks(r, facts, []), null, 'nothing to duplicate');
}

// ---- paste attributes --------------------------------------------------------------------------------------------------
{
  const r = base();
  const board = copyPicks(r, [P('clip', 'c2')])!;
  const x = pasteAttributes(r, board, [P('clip', 'c1'), P('clip', 'c3')]);
  ok(x.changed === 2, 'two clips took the attributes');
  const c1 = x.recipe.clips![0];
  ok(c1.speed === 2 && c1.volume === 0.5 && !!c1.grade, 'speed, volume and colour carried');
  is(c1.trim, [0, 4], 'its own part is kept');
  ok(c1.name === 'one' && c1.transition === undefined, 'its name and its transition are its own');
  // A clip without a volume takes the volume off the target.
  const back = pasteAttributes(x.recipe, copyPicks(r, [P('clip', 'c3')])!, [P('clip', 'c1')]);
  ok(back.recipe.clips![0].speed === undefined && back.recipe.clips![0].volume === undefined, 'what the source does not have is taken off');
  // Overlay place and fades; words' look; sound's level.
  const ov = pasteAttributes(r, copyPicks(r, [P('overlay', 'o1')])!, [P('overlay', 'o2')]);
  ok(ov.recipe.overlays![1].opacity === 0.6 && ov.recipe.overlays![1].x === 0.8 && ov.recipe.overlays![1].fadeIn === 0.5 && ov.recipe.overlays![1].start === 5, 'an overlay takes its place and fades, keeps its time');
  const tx = pasteAttributes(r, copyPicks(r, [P('text', 't1')])!, [P('text', 't2')]);
  ok(tx.recipe.texts![1].bold === true && tx.recipe.texts![1].size === 0.07 && tx.recipe.texts![1].text === 'Bye' && tx.recipe.texts![1].from === 6, 'words take the look and keep their words and times');
  const au = pasteAttributes(r, copyPicks(r, [P('audio', 'a1')])!, [P('audio', 'a2')]);
  ok(au.recipe.audio![1].volume === 0.4 && au.recipe.audio![1].fadeIn === 1 && au.recipe.audio![1].clip === 'c1', 'a sound takes the level and fades and stays linked');
  // A clip's sound onto a sound.
  const mix = pasteAttributes(r, copyPicks(r, [P('clip', 'c2')])!, [P('audio', 'a1')]);
  ok(mix.recipe.audio![0].volume === 0.5, 'a clip’s volume onto a sound');
  // Different kinds: nothing changes.
  const none = pasteAttributes(r, copyPicks(r, [P('overlay', 'o1')])!, [P('text', 't1')]);
  ok(none.changed === 0 && none.recipe === r, 'an overlay’s attributes onto words: nothing');
  // A picture takes no speed.
  const pr: VideoRecipe = { clips: [{ id: 'p', src: 'pic', picture: true, length: 3 }, { id: 'v', speed: 2 }] };
  ok(pasteAttributes(pr, copyPicks(pr, [P('clip', 'v')])!, [P('clip', 'p')]).recipe.clips![0].speed === undefined, 'a picture keeps its own (no) speed');
}

// ---- a clip cut in two: each half has an id of its own ---------------------------------------------------------------
{
  const r = base();
  for (const withSound of [false, true]) {
    const src: VideoRecipe = withSound ? { ...r, clips: [{ ...r.clips![0], levels: [[0, 0], [2, -6]] as [number, number][], silence: [[0.2, 0.5]] as [number, number][] }, ...r.clips!.slice(1)] } : r;
    const cut = splitClip(src, facts, 'c1', 2);
    ok(cut.clips!.length === 4 && new Set(cut.clips!.map((c) => c.id)).size === 4, `the halves have different ids${withSound ? ' (with a volume line)' : ''}: ${cut.clips!.map((c) => c.id)}`);
  }
}

// ---- delete and split several -----------------------------------------------------------------------------------------
{
  const r = base();
  const d = deletePicks(r, facts, [P('clip', 'c1'), P('text', 't1'), P('overlay', 'o2')]);
  ok(d.done === 3 && d.recipe.clips!.length === 2 && d.recipe.texts!.length === 1 && d.recipe.overlays!.length === 1, 'three things deleted in one go');
  const locked = deletePicks(r, facts, [P('clip', 'c1'), P('text', 't1')], { locked: (t) => t === 't1' });
  ok(locked.done === 1 && locked.recipe.texts!.length === 2, 'a thing on a locked track is not deleted');
  // The last clip stays.
  const lone: VideoRecipe = { clips: [{ id: 'z' }] };
  is(deletePicks(lone, facts, [P('clip', 'z')]).done, 0, 'the only clip cannot go');
  // Ripple: text after the deleted clip moves up.
  const rp = deletePicks(r, facts, [P('clip', 'c1')], { ripple: true });
  ok(close(rp.recipe.texts![1].from, 2) && close(rp.recipe.texts![0].from, 2), 'a ripple moves up what starts after the clip, not what is under it');
  // A clip's sound picked: silenced, the clip kept.
  const cs = deletePicks(r, facts, [P('clipsound', 'c1')]);
  ok(cs.recipe.clips![0].mute === true && cs.recipe.clips!.length === 3, 'a clip’s sound deleted silences it');
}
{
  const r = base();
  // At 3 s: c1 (0-4), text t1 (2-4), overlay o1 (1-4), audio a1 (0-10) are crossed.
  const s = splitPicks(r, facts, [P('clip', 'c1'), P('text', 't1'), P('overlay', 'o1'), P('clip', 'c3')], 3);
  ok(s.done === 3 && s.recipe.clips!.length === 4 && s.recipe.texts!.length === 3 && s.recipe.overlays!.length === 3, `each crossed thing is cut, the others not: ${s.done}`);
  ok(splitPicks(r, facts, [P('text', 't1')], 3, { locked: (t) => t === 't1' }).done === 0, 'a locked track’s thing is not cut');
}

// ---- moving several -----------------------------------------------------------------------------------------------------
{
  const r = base();
  is(moveClips(r, ['c1'], 3).clips!.map((c) => c.id), ['c2', 'c3', 'c1'], 'one clip moved to the end');
  is(moveClips(r, ['c1', 'c2'], 3).clips!.map((c) => c.id), ['c3', 'c1', 'c2'], 'two clips together to the end, in their order');
  is(moveClips(r, ['c2', 'c3'], 0).clips!.map((c) => c.id), ['c2', 'c3', 'c1'], 'two clips together to the start');
  is(moveClips(r, ['c1', 'c3'], 2).clips!.map((c) => c.id), ['c2', 'c1', 'c3'], 'clips apart come together where dropped');
  ok(moveClips(r, ['c1', 'c2'], 3).clips!.at(-1)!.transition === undefined, 'the last clip has no transition');
  const s = shiftPicks(r, [P('text', 't1'), P('overlay', 'o1'), P('audio', 'a2'), P('clip', 'c1')], 1.5);
  ok(close(s.texts![0].from, 3.5) && close(s.texts![0].to, 5.5) && close(s.overlays![0].start, 2.5) && close(s.audio![1].start, 4.5) && s.texts![1].from === 6, 'picked things move together by the same time; the rest stay');
  const back = shiftPicks(r, [P('overlay', 'o1'), P('audio', 'a2')], -5);
  ok(close(back.overlays![0].start, 0) && close(back.audio![1].start, 2), 'a group stops at the start of the timeline together');
}

// ---- trim to the playhead; cuts ------------------------------------------------------------------------------------------
{
  const r = base();
  // c1 is 0-4: W at 3 s cuts its end to 3 s; Q at 1 s cuts its start to 1 s (and the clips after close up).
  const w = trimToPlayhead(r, facts, P('clip', 'c1'), 'end', 3);
  is(w.clips![0].trim, [0, 3], 'W brings the clip’s end to the playhead');
  ok(close(lens(w).spans[1].start, 3), 'the clips after it close up');
  const q = trimToPlayhead(r, facts, P('clip', 'c1'), 'start', 1);
  is(q.clips![0].trim, [1, 4], 'Q brings the clip’s start to the playhead');
  is(trimToPlayhead(r, facts, P('clip', 'c1'), 'end', 5), r, 'the playhead outside the clip: nothing');
  is(trimToPlayhead(r, facts, P('clip', 'c1'), 'end', 0), r, 'the playhead at its start: nothing');
  // A speed of 2: the clip c2 is 3 s long on the timeline, starting at 4 - 0.5 (transition)...
  const sp = lens(r).spans[1];
  const mid = (sp.start + sp.end) / 2;
  const w2 = trimToPlayhead(r, facts, P('clip', 'c2'), 'end', mid);
  ok(w2.clips![1].trim![1] < 8 && w2.clips![1].trim![1] > 2, `a clip at double speed trimmed by the source's time: ${w2.clips![1].trim}`);
  // Overlay (a picture, 1-4): Q at 2 sets its start to 2 and its length to 2; W at 3 sets its length to 2.
  const o = trimToPlayhead(r, facts, P('overlay', 'o1'), 'start', 2);
  ok(close(o.overlays![0].start, 2) && close(o.overlays![0].length, 2), 'an overlay’s start to the playhead');
  const o2 = trimToPlayhead(r, facts, P('overlay', 'o1'), 'end', 3);
  ok(close(o2.overlays![0].length, 2) && o2.overlays![0].start === 1, 'an overlay’s end to the playhead');
  // Words: from and to.
  ok(trimToPlayhead(r, facts, P('text', 't1'), 'start', 3).texts![0].from === 3 && trimToPlayhead(r, facts, P('text', 't1'), 'end', 3).texts![0].to === 3, 'words’ times');
  // A sound at 3 with trim [5,9] (4 s): W at 5 keeps its first 2 s.
  const a = trimToPlayhead(r, facts, P('audio', 'a2'), 'end', 5);
  is(a.audio![1].trim, [5, 7], 'a sound’s part kept shorter');
  const a0 = trimToPlayhead(r, facts, P('audio', 'a2'), 'start', 5);
  ok(close(a0.audio![1].start, 5) && close(a0.audio![1].trim![0], 7), 'a sound’s start to the playhead takes its part with it');
  // The same function a drag uses.
  const drag = trimItemTo(r, facts, 'text', r.texts![0], 'end', 3.2);
  ok(drag.texts![0].to === 3.2, 'trimItemTo, as a drag asks it');
  is(trimToPlayhead(r, facts, P('transition', 'c2'), 'end', 3), r, 'a transition is not trimmed');
}
{
  const { spans, length } = lens(base());
  const cuts = cutTimes(spans, length);
  ok(cuts[0] === 0 && close(cuts.at(-1), length) && cuts.length >= 4, `the cuts are the start, each cut and the end: ${cuts}`);
  ok(neighbourCut(cuts, 0, -1) === null && neighbourCut(cuts, length, 1) === null, 'none before the start or after the end');
  ok(neighbourCut(cuts, 0.5, 1) === cuts[1] && neighbourCut(cuts, 0.5, -1) === 0, 'next and previous from the first clip');
  ok(neighbourCut(cuts, cuts[1], 1) === cuts[2] && neighbourCut(cuts, cuts[1], -1) === 0, 'standing on a cut goes on to the next and back to the last');
}

// ---- snapping by the end -------------------------------------------------------------------------------------------------
{
  // A thing 2 s long starting at 3.98: its start is 0.02 s (1 px at 50) from 4? Its end at 5.98 is nearer 6.
  const times = [0, 4, 6, 10];
  const a = snapSpan(3.99, 2, times, 50);
  ok(close(a.start, 4) && a.to === 4, `its start lines up: ${a.start}`);
  const b = snapSpan(4.02 + 0.5, 1.48, times, 50);
  ok(close(b.start + 1.48, 6) && b.to === 6, `its end lines up: ${b.start}`);
  const n = snapSpan(7, 1, times, 50);
  ok(n.start === 7 && n.to === null, 'nothing near: as it is');
  // Both near: the nearer wins.
  const both = snapSpan(3.99, 2.02, times, 50);
  ok(both.to === 4, 'the nearer of start and end wins');
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
