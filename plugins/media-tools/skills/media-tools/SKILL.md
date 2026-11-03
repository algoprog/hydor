---
name: media-tools
description: Use when converting, trimming, joining, compressing or inspecting audio and video files, pulling the sound out of a video, making a GIF or thumbnails, adding subtitles, or downloading a video or podcast the user may download.
category: creative
triggers: [ffmpeg, convert this video, compress this video, trim the video, extract the audio, make a gif, burn subtitles, yt-dlp]
---

# Audio and video

You have **ffmpeg** and **ffprobe** on this computer, and **yt-dlp** at
`${PLUGIN_DATA}/venv/bin/yt-dlp`. Recipes for common jobs are in `references/recipes.md`.

## 1. Look at the file first

```bash
ffprobe -v error -show_entries format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate -of json input.mp4
```

Know its length, streams (video, audio, subtitles), codecs, size and frame rate before choosing
settings. Many "broken" files are only an unusual codec.

## 2. Pick the lightest operation that does the job

| The job | How | Why |
| --- | --- | --- |
| Cut without changing quality | `-ss START -to END -c copy` | No re-encoding: instant, lossless, but cuts land on keyframes |
| Cut exactly | Re-encode the cut (`-c:v libx264 -crf 20`) | Frame-accurate |
| Change the container only (MKV to MP4) | `-c copy` | Same streams, new wrapper |
| Smaller file | H.264 or H.265 with CRF, scale down | Quality per byte |
| Sound only | `-vn`, then `-c:a copy` or encode | Keeps the original audio when it can |

## 3. Write outputs beside the input, never over it

- New name with what changed: `talk.trimmed.mp4`, `talk.720p.mp4`. Never use the input as output.
- Add `-n` so ffmpeg refuses to overwrite; remove it only when replacing on purpose.
- Long jobs: add `-progress pipe:1 -nostats` and keep an eye on it; tell the user roughly how long.

## 4. Check the result

ffprobe the output: duration as expected, streams present, size reasonable. For a visual change, take
a frame (`-ss 00:00:05 -frames:v 1 check.jpg`) and look at it. Play a few seconds of audio changes
when you can; otherwise check loudness with `-af ebur128` or `volumedetect`.

## 5. Downloading

Use yt-dlp only for media the user has the right to download (their own, openly licensed, or where the
site allows it). `"${PLUGIN_DATA}/venv/bin/yt-dlp" -F URL` lists formats; `-x --audio-format mp3` keeps
the sound; `--write-subs --sub-langs en` takes subtitles. Never bypass paywalls or DRM.

## Pitfalls

- Re-encoding when `-c copy` would do, or `-c copy` where an exact cut was needed.
- `-ss` before `-i` (fast, keyframe-accurate) versus after (slow, exact): choose on purpose.
- Odd widths: H.264 needs even sizes; scale with `scale=-2:720`.
- Phones and browsers: use `-pix_fmt yuv420p -movflags +faststart` for MP4s people will play anywhere.
- Variable frame rate screen recordings drifting out of sync: convert with `-vsync cfr -r 30`.
