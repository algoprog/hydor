// Script tests for caption files in the video editor: .srt and .vtt read (a byte-order mark, Windows line ends, numbered
// or named cues, times with a comma or a point and with or without hours, cue settings, tags and entities, notes and
// styles skipped, cues without words or times left out) and written (an .srt as before, a WebVTT file that reads back
// the same). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs shared/mediaedit-video-captions-test.ts && node dist/dev/mediaedit-video-captions-test.js
import { captionsSrt, captionsVtt, parseCaptions } from './mediaedit-video.ts';

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

const srt = '﻿1\r\n00:00:01,200 --> 00:00:03,900\r\nHello <i>there</i>,\r\nfriend\r\n\r\n2\r\n00:01:02,5 --> 00:01:04,000\r\n{\\an8}Top line &amp; more\r\n\r\n';
is(parseCaptions(srt), [{ from: 1.2, to: 3.9, text: 'Hello there,\nfriend' }, { from: 62.5, to: 64, text: 'Top line & more' }], 'an .srt with a mark, Windows line ends, tags, an override and an entity');

const vtt = `WEBVTT - the talk

NOTE this note has an arrow --> in it
and a second line

STYLE
::cue { color: red }

intro
00:01.000 --> 00:02.500 align:start position:0%
<c.yellow>First</c> <00:01.500>cue

00:02:00.000 --> 00:02:03.250
Second

00:03.000 --> 00:03.000
Zero length

00:04.000 --> 00:05.000
   

1:10.000 --> 1:12.000
Short hours
`;
is(
  parseCaptions(vtt),
  [
    { from: 1, to: 2.5, text: 'First cue' },
    { from: 70, to: 72, text: 'Short hours' },
    { from: 120, to: 123.25, text: 'Second' },
  ],
  'a .vtt: header, note and style skipped, a named cue, settings and tags, an empty cue and a zero-length one left out, in time order',
);
is(parseCaptions('hello\n\nnothing here'), [], 'a file with no times has no captions');
is(parseCaptions(''), [], 'an empty file has none');

const caps = [
  { from: 3, to: 4.5, text: 'Second' },
  { from: 0.25, to: 2, text: 'First line\nsecond line' },
];
ok(captionsSrt(caps).startsWith('1\n00:00:00,250 --> 00:00:02,000\nFirst line\nsecond line\n\n2\n00:00:03,000 --> 00:00:04,500\nSecond'), 'the .srt is as it was');
const v = captionsVtt(caps);
ok(v.startsWith('WEBVTT\n\n00:00:00.250 --> 00:00:02.000\nFirst line\nsecond line\n\n00:00:03.000 --> 00:00:04.500\nSecond'), `the .vtt has its header and points: ${JSON.stringify(v)}`);
is(parseCaptions(v), [caps[1], caps[0]], 'a .vtt written reads back the same');
is(parseCaptions(captionsSrt(caps)), [caps[1], caps[0]], 'an .srt written reads back the same');
is(parseCaptions(captionsVtt([{ from: 1, to: 2, text: 'a\n\nb --> c' }])), [{ from: 1, to: 2, text: 'a\nb -> c' }], 'a blank line or an arrow in the words cannot break a cue');

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
