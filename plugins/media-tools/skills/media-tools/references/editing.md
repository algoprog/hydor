# Editing: cuts, joins, cut lists and transcripts

Open this for anything beyond a single trim. The scripts named here are run as SKILL.md shows, with
the plugin's Python (or `python3`).

## Keyframes and exact cuts

Video is stored as full pictures (keyframes) every few seconds, with only the changes in between.
A cut that copies the streams (`-c copy`) can only start on a keyframe; an exact cut decodes and
re-encodes.

| Command | What you get |
| --- | --- |
| `-ss A -to B -i in.mp4 -c copy out.mp4` | Instant and lossless, but starts at the keyframe before A. In MP4 an edit list hides those extra frames and most players honour it; MKV, editors and some websites show them, and the sound can seem out of step. |
| `-i in.mp4 -ss A -to B -c copy out.mp4` | The sound starts at A, the picture only at the next keyframe. Avoid. |
| `-ss A -to B -i in.mp4 -c:v libx264 -crf 18 -c:a aac out.mp4` | Exact and still fast: ffmpeg jumps near A and decodes from there. CRF 18 looks like the original. |
| `-ss A -i in.mp4 -to B ...` | `-to` now counts from A, so the clip is B seconds long, not B−A. Use `-t` with the length instead, or put both before `-i`. |

Keyframes between 20 and 35 seconds (prints their times; cut there for exact copy cuts):

```bash
ffprobe -v error -select_streams v:0 -skip_frame nokey -show_entries frame=pts_time -of csv=p=0 -read_intervals 20%+15 in.mp4
```

Check a cut by taking its first frame (`ffmpeg -i out.mp4 -frames:v 1 first.png`) and comparing it
with the source at A (`ffmpeg -ss A -i in.mp4 -frames:v 1 source.png`).

## Joining files

First see whether they were made the same way: codec, size, frame rate and pixel format for the
picture; codec, sample rate and channels for the sound.

```bash
ffprobe -v error -show_entries stream=codec_name,width,height,avg_frame_rate,pix_fmt,sample_rate,channels -of compact=p=0 a.mp4
```

**All the same** (parts of one recording, clips made with the same settings): the concat demuxer
joins them without re-encoding. Write a list, one file per line:

```text
file 'part1.mp4'
file 'part2.mp4'
file 'it'\''s here.mp4'
```

```bash
ffmpeg -f concat -safe 0 -i list.txt -c copy joined.mp4
```

Names in the list are read from the list's own folder. `-safe 0` is needed for full paths and for
names with spaces or apostrophes (write an apostrophe as `'\''`). Check that the result is as long
as the parts together.

**Different** (phone and camera, two sizes, 25 and 30 frames a second, 44.1 and 48 kHz sound): make
them alike, then join with the concat filter. This re-encodes:

```bash
ffmpeg -i a.mp4 -i b.mp4 -filter_complex "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v0];[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v1];[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a0];[1:a]aformat=sample_rates=48000:channel_layouts=stereo[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -crf 20 -c:a aac -b:a 160k joined.mp4
```

Sound files alone: the same with only the `aformat` parts and `concat=n=2:v=0:a=1[a]`.

Never join files that differ with the concat demuxer: it does not refuse, it writes a file with the
wrong size, speed or sync and says "Non-monotonic DTS". The `concat:` protocol (`concat:a.ts|b.ts`)
is only for MPEG-TS pieces.

A crossfade between two clips of the same size and frame rate (the offset is the first clip's length
minus the fade, here 5 − 1):

```bash
ffmpeg -i a.mp4 -i b.mp4 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=1:offset=4[v];[0:a][1:a]acrossfade=d=1[a]" -map "[v]" -map "[a]" -c:v libx264 -crf 20 -c:a aac out.mp4
```

## Cut lists for longer edits

A cut list is a plain text file the person can read and approve: one part per line, start, end and
a note. Times can be `00:01:02.5`, `1:02.5` or `62.5`; lines copied from an .srt
(`00:01:02,500 --> 00:01:09,000`) work too.

```text
# talk.mp4: the five-minute version
00:00:12.0  00:01:40.5  opening and the question
00:04:02.2  00:06:15.0  the answer
00:21:30    00:22:48.4  the example with the map
```

Render it with `scripts/cut_list.py SOURCE LIST OUTPUT` (exact command in SKILL.md):

- The parts must follow the source's order and must not overlap. To change the order, render each
  stretch that is in order separately, then join the results with the concat demuxer (same
  settings, so `-c copy` works).
- `--remove`: the lines are what to take out (pauses, coughs, a false start); everything else stays.
- It prints each part, its length and where it starts in the result: use those times for the checks.
- Output `.mp4`, `.mov`, `.m4v` or `.mkv` for video (H.264, `--crf 20`, AAC); `.wav`, `.flac`,
  `.mp3`, `.m4a` or `.opus` for the sound alone, even from a video. Keep WAV when more work follows.
- It cuts on frame boundaries (picture and sound stay together across any number of joins) and
  fades the sound for `--fade 0.01` seconds at each join so cuts do not click.

Without the script, two parts by hand look like this. Use `split`/`asplit` when the same input
feeds several parts: referring to `[0:v]` many times instead took five times the memory in a test.

```bash
ffmpeg -i in.mp4 -filter_complex "[0:v]split=2[v1][v2];[0:a]asplit=2[a1][a2];[v1]trim=start=5:end=12,setpts=PTS-STARTPTS[p1];[a1]atrim=start=5:end=12,asetpts=PTS-STARTPTS[q1];[v2]trim=start=30:end=41.5,setpts=PTS-STARTPTS[p2];[a2]atrim=start=30:end=41.5,asetpts=PTS-STARTPTS[q2];[p1][q1][p2][q2]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -crf 20 -c:a aac -b:a 192k out.mp4
```

## Shortening pauses

`scripts/audio_report.py FILE --silence-min 1 --pause-list pauses.txt` writes every pause of a
second or more as a line to take out, leaving 0.25 s of it on each side. Read the list, delete the
lines for pauses that matter, then run `cut_list.py FILE pauses.txt OUTPUT --remove`.

- Silence is not automatically safe to cut. A pause can be someone thinking before an answer, the
  timing of a joke, a breath that keeps speech natural, or a word too quiet for the threshold. Cut
  every pause and speech sounds breathless and rushed; leave about half a second.
- The threshold decides what counts as silence. The report's "Background" line is the noise in the
  pauses: put `--silence-db` about 10 dB above it (-35 suits most speech; a noisy room needs -30 or
  more). Set too close to the noise, it finds no pauses at all.
- On a video each removed pause is a jump in the picture. Remove fewer, or only the long ones.
- ffmpeg's `silenceremove` filter does this in one command for sound files, but its options behave
  differently between ffmpeg versions: measure the pauses in the result if you use it.

## Editing from a transcript

1. Transcribe with the Speech to text plugin's `transcribe` tool, `formats: ["txt", "srt"]` (follow
   its skill for long recordings). Each .srt line is a phrase with a start and an end. The times can
   be a few tenths of a second off, an end often falls in the last word, and quiet speech can be missing.
2. Choose with the person: show the lines with their times and agree what stays (a highlight) or
   goes (false starts, repeats, off-topic stretches). Cutting someone's words can change what they
   meant: when in doubt, keep it and ask.
3. Turn the chosen lines into a cut list: start each part 0.2 s before its first line and end it
   0.3 s after its last, and merge parts less than a second apart. Then run `audio_report.py` for
   the pauses and move each cut point into the nearest pause within half a second: a cut in a pause
   is not heard.
4. Render with `cut_list.py`, then check: transcribe the result (a missing or half word shows a cut
   that is too tight), look at frames on both sides of each join, and give the person the join times
   to listen to.
5. Subtitles for the edit: transcribe the edited file, so the times match. The original's .srt no
   longer fits.

Recordings of other people are personal data: keep the files where the person put them.

## Checking joins

- Frames: for each join time T that `cut_list.py` printed, take a frame just before and at T
  (`ffmpeg -ss T -i out.mp4 -frames:v 1 join1.png`) and look at them.
- Words: `transcribe` with `start` and `end` a few seconds around T reads just that stretch. Give
  it an `out_dir` of its own: it names its files after the recording and would replace the full
  transcript.
- Sound: a waveform picture of the result (in `recipes.md`) shows sudden spikes, level jumps and
  pauses that are gone or too long.
