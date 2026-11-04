---
name: media-tools
description: Use when converting, cutting, joining, compressing or inspecting audio and video, levelling a podcast's sound, removing pauses, making a vertical clip, a GIF or thumbnails, adding subtitles, or downloading media the user may download.
category: creative
triggers: [ffmpeg, convert this video, compress this video, trim the video, merge video*, extract the audio, loudness, remove silence*, vertical video, make a gif, burn subtitles, yt-dlp]
---

# Audio and video

You have **ffmpeg** and **ffprobe** on this computer, **yt-dlp** at `${PLUGIN_DATA}/venv/bin/yt-dlp`,
and two scripts for the plugin's Python (standard library only, so `python3` runs them too). Media
work comes out right when you look at the file before choosing a command, write every result to a new
file, and check it with numbers and pictures, not only with ffmpeg's exit code.

Open the reference you need:

- `references/recipes.md`: commands to convert, compress, pick streams, add subtitles, make vertical
  versions, frames, contact sheets and GIFs.
- `references/editing.md`: keyframes and exact cuts, joining files, cut lists, editing from a transcript.
- `references/audio.md`: loudness targets, levelling, clipping, noise and hum, uneven speakers, pauses,
  music under a voice, a podcast checklist.
- `references/troubleshooting.md`: ffmpeg's messages and what they mean, what this build can do, sync
  drift, phone videos, damaged files, download errors.

## 1. Look at the file first

```bash
ffprobe -v error -show_entries format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,channels,sample_rate:stream_tags=language -of compact=p=0 input.mp4
```

- One line per stream: note the length, picture size and frame rate, every audio track and its
  language, any subtitles. An `mjpeg` video stream in an audio file is its cover picture.
- `avg_frame_rate` different from `r_frame_rate` means a variable frame rate (phones, screen
  recordings): read the troubleshooting reference before cutting or joining.
- Before relying on a filter or encoder, ask this build: `ffmpeg -hide_banner -h filter=subtitles`
  or `ffmpeg -hide_banner -h encoder=libx264` answers "Unknown filter" or "is not recognized" when it lacks it.

## 2. Pick the lightest operation that does the job

| The job | How | Details |
| --- | --- | --- |
| New container only (MKV to MP4) | `-map 0 -c copy`, plus `-c:s mov_text` for subtitles in MP4 | recipes |
| Quick cut, no re-encoding | `-ss START -to END -i in.mp4 -c copy`: starts at the keyframe before START | editing |
| Exact cut | the same with `-c:v libx264 -crf 20 -c:a aac` instead of `-c copy` | editing |
| Several parts of one recording | a cut list and `scripts/cut_list.py` | step 4 |
| Join files made the same way | the concat demuxer with `-c copy` | editing |
| Join files that differ (size, frame rate, sound) | the concat filter, after making them alike | editing |
| Smaller file | H.264 or H.265 with CRF, scaled down | recipes |
| Sound only | `-map 0:a:0 -vn`, then `-c:a copy` or encode | recipes |
| Even loudness, peaks, pauses | `scripts/audio_report.py` | step 5 |

## 3. Say which streams you want

Without `-map`, ffmpeg keeps one video and one audio track and silently drops the rest: a second
language, a commentary track, the subtitles. Name the streams whenever there is more than one of a kind:

- `-map 0:v:0 -map 0:a:1`: the first video and the second audio track of the first input (counting from 0).
- `-map 0 -c copy`: everything; `-map 0 -map -0:s`: all but subtitles; `-map "0:a?"`: audio if there is
  any (keep the quotes: zsh, the Mac's shell, treats `?` as a wildcard).
- With `-filter_complex`, map its labelled outputs: `-map "[v]" -map "[a]"`.

## 4. Cuts, joins and longer edits

- A `-c copy` cut can only start on a keyframe. In MP4 an edit list hides the extra second or two
  before your start, and most players honour it; editors, other containers and some websites do not.
  Re-encode when the start must be exact or the clip will be edited further.
- Put `-ss` and `-to` both before `-i`. After `-i`, `-to` counts from the cut and the clip comes out too long.
- For more than two or three parts, write a cut list: one part per line, start, end, then a note.

  ```text
  # interview.mp4: keep these parts, in this order
  00:00:05.0  00:02:10.5  introduction
  00:03:00    00:07:45.2  first answer
  ```

  Show it to the person when it removes their words, then render it in one go:

  ```bash
  "${PLUGIN_DATA}/venv/bin/python" "${PLUGIN_ROOT}/skills/media-tools/scripts/cut_list.py" interview.mp4 cuts.txt interview.edit.mp4
  ```

  It cuts on frame boundaries so picture and sound stay together, fades the sound for 10 ms at each
  join, prints where every part starts in the result, and checks the result's length against the
  plan. Parts must follow the source's order. `--remove` takes the listed parts out instead;
  `--dry-run` shows the plan and the command only.
- Editing by what was said: transcribe with the Speech to text plugin (its .srt has the times), pick
  the lines, pad each cut and move it into the nearest pause. The method is in `references/editing.md`.

## 5. Sound: loudness, clipping and pauses

```bash
"${PLUGIN_DATA}/venv/bin/python" "${PLUGIN_ROOT}/skills/media-tools/scripts/audio_report.py" episode.wav
```

It reports loudness (LUFS), true peak, clipping, the noise in the pauses and the pauses themselves,
and what levelling to `--target` (default -16 LUFS) would do. `--level episode.level.wav` writes a
levelled copy in two loudnorm passes and measures it.

| Where it goes | Loudness | True peak at most |
| --- | --- | --- |
| Podcast (Apple's recommendation, common elsewhere) | -16 LUFS; mono files often -19 | -1 dBTP |
| YouTube, Spotify and most streaming | played at about -14 LUFS; louder files are turned down | -1 dBTP |
| TV: Europe (EBU R128) / USA (ATSC A/85) | -23 / -24 LUFS | -1 / -2 dBTP |

- Level last, after cutting and cleaning. Keep WAV or FLAC until then and make the MP3 or AAC once.
- Silence is not automatically safe to cut: a pause may be thinking, timing or a quiet word. Shorten
  long pauses to about half a second rather than removing them:
  `--silence-min 1 --pause-list pauses.txt` lists them as cuts that leave 0.25 s on each side; check
  the list, then run `cut_list.py` with `--remove` (details in `references/editing.md`).
- Noise, hum, one quiet and one loud speaker, a voice on one side only: `references/audio.md`.

## 6. Subtitles and vertical versions

- Soft subtitles are a track people switch on: MP4 needs `-c:s mov_text`, MKV takes SRT as it is,
  web players want VTT (`ffmpeg -i subs.srt subs.vtt`). Burned-in subtitles show everywhere, muted
  phones included, but need this build's `subtitles` filter and re-encode the picture.
- The Speech to text plugin writes .srt and .vtt beside the recording. Transcribe the final edit, not
  the original, or the times will be off.
- 9:16 for Reels, Shorts and TikTok: crop the middle (or where the person is), or fit the whole
  picture over a blurred copy of itself. Keep text out of the bottom fifth and the right edge, where
  the apps put their buttons. Commands for both, and for subtitles, are in `references/recipes.md`.

## 7. Write outputs beside the input, never over it

- A new name that says what changed (`talk.trimmed.mp4`, `talk.720p.mp4`); never the input as output.
- `-n` makes ffmpeg refuse to overwrite, but some versions still exit with success after "already
  exists. Exiting.": read what it printed.
- A failed run can leave an empty or broken output behind: delete it before trying again.
- Long jobs: add `-progress pipe:1 -nostats` and tell the person roughly how long it will take.

## 8. Check the result

- Probe it (length, streams, size), then decode all of it:
  `ffmpeg -v error -i out.mp4 -map "0:v?" -map "0:a?" -f null -` prints nothing when the file is
  healthy. It can exit 0 after errors, so read what it prints.
- Look at frames: the start, the end and both sides of each join
  (`ffmpeg -ss 00:00:05 -i out.mp4 -frames:v 1 check.jpg`), or a contact sheet for the whole.
- For sound, run `audio_report.py` on the result, draw a waveform picture (the recipe is in
  `references/recipes.md`; pauses, spikes and clipping show), and transcribe a few seconds around a
  join (with an `out_dir` of its own) to catch a clipped word.
- Hand the files over with `present_files`. Say what you checked, and give the times of the joins
  for the person to listen to: only a listen confirms clicks, pumping or an odd-sounding cut.

## 9. Downloading

Use yt-dlp only for media the user has the right to download (their own, openly licensed, or where
the site allows it). `"${PLUGIN_DATA}/venv/bin/yt-dlp" -F URL` lists formats; `-x --audio-format mp3`
keeps the sound; `--write-subs --sub-langs en` takes subtitles. Never bypass paywalls, logins or DRM.
Errors such as HTTP 403 usually mean yt-dlp is out of date: `references/troubleshooting.md` says how
to update it.

## Pitfalls

- Re-encoding when `-c copy` would do, or `-c copy` where an exact cut was needed.
- Joining files that differ with the concat demuxer: it does not refuse, it makes a broken file.
- Cutting and burning subtitles in one command puts them at the wrong times (fix in the recipes).
- Odd sizes: H.264 needs even widths and heights; scale with `scale=-2:720`.
- MP4s for phones and browsers: `-pix_fmt yuv420p -movflags +faststart`.
- loudnorm without `-ar 48000` writes 192 kHz audio.
- A hardware encoder in `ffmpeg -encoders` only means the build knows it, not that this computer can run it.
- Variable frame rate recordings drifting out of sync: `-fps_mode cfr -r 30` (older ffmpeg: `-vsync cfr -r 30`).
