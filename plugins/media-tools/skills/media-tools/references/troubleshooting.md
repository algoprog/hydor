# Troubleshooting

Open this when ffmpeg stops with an error, a result looks or sounds wrong, or a file plays in one
place and not another. Keep the original untouched while you investigate, change one thing at a
time, and probe the result again after each change.

## What this ffmpeg can do

Builds differ: a filter or encoder in an online example may simply not be in this one.

```bash
ffmpeg -hide_banner -version | head -3              # version and the libraries it was built with
ffmpeg -hide_banner -h filter=subtitles             # "Unknown filter 'subtitles'." when it is missing
ffmpeg -hide_banner -h encoder=libx264              # "Codec 'libx264' is not recognized by FFmpeg." when missing
ffmpeg -hide_banner -filters | grep -wE "subtitles|drawtext|loudnorm"   # Windows: findstr
ffmpeg -hide_banner -encoders | grep -E "libx264|libx265|aac|libmp3lame|libopus"
ffmpeg -hide_banner -hwaccels                       # hardware decoding methods the build knows
```

- Often missing: `drawtext` (text on video, needs libfreetype), `subtitles` and `ass` (burning in,
  need libass), `libfdk_aac` (use the built-in `aac`), `libx265` or `libsvtav1` in small builds.
- A hardware encoder or method in these lists only means the build knows it. It still needs the
  right graphics hardware and drivers, and its quality per size differs: try ten seconds first.
- When something is missing, use an equivalent that is there, leave that step out and say so, or
  ask the person before installing a fuller ffmpeg (Mac: `brew install ffmpeg`; Ubuntu or Debian:
  `sudo apt install ffmpeg`; Windows: `winget install ffmpeg`).

## Messages and what they mean

| ffmpeg says | It means | Do this |
| --- | --- | --- |
| `Stream map '0:a' matches no streams` | The file has no such stream (here no audio). | Probe it; `-map "0:a?"` makes the stream optional. |
| `Could not find tag for codec subrip ... not currently supported in container` | MP4 cannot hold SRT subtitles (or that stream type). | `-c:s mov_text`, or write MKV. Delete the empty file it left. |
| `Subtitle encoding currently only possible from text to text or bitmap to bitmap` | DVD or Blu-ray subtitles are pictures and cannot become text. | Keep them in MKV, or leave them out. |
| `No such filter: 'drawtext'`, `Filter not found` | This build lacks the filter. | See above. |
| `Unknown encoder 'libfdk_aac'`, `Encoder not found` | This build lacks the encoder. | Use `aac`, `libx264` or another listed one. |
| `width not divisible by 2 (321x241)` | H.264 and H.265 need even sizes. | `scale=-2:720`, or `crop=trunc(iw/2)*2:trunc(ih/2)*2`. Delete the empty output. |
| `Non-monotonic DTS ... may result in incorrect timestamps` | Timestamps jump backwards: files that differ joined with the concat demuxer, or a damaged source. | Join with the concat filter after making them alike (`editing.md`); re-encode a damaged source. |
| `Unsafe file name` | The concat list has a full path, or a name with spaces or apostrophes. | Add `-safe 0`. |
| `moov atom not found` | The MP4 or MOV is incomplete: the recording stopped suddenly, or the copy or download did not finish. | Get a complete copy; ffmpeg cannot rebuild the missing index. |
| `partial file`, `Invalid NAL unit size`, `Error while decoding` | The file is damaged or cut short; the probe may still show the full length. | `ffmpeg -i in.mp4 -map 0 -c copy rescued.mp4` keeps the readable part. |
| `Invalid data found when processing input` | Not a media file, an incomplete one, or encrypted (DRM). | Check what the file is. Do not try to get round DRM. |
| `Output file is empty, nothing was encoded` | `-ss` beyond the end, or the chosen stream has nothing. | Check the length and the `-map`. |
| `Output file does not contain any stream` | Nothing was selected, such as `-vn` on a file with only video. | Check the `-map` and the stream list. |
| `File 'out.mp4' already exists. Exiting.` | `-n` refused to overwrite; the exit code may still be 0. | Choose a new name, or delete the old file if it is yours. |
| `-vsync is deprecated. Use -fps_mode` | A newer ffmpeg. | `-fps_mode cfr` instead of `-vsync cfr`. |
| `Too many packets buffered for output stream` | Older versions, with a sparse stream such as subtitles. | Add `-max_muxing_queue_size 1024`. |
| `Past duration ... too large` | Usually a variable frame rate; mostly harmless. | If sound and picture drift, see below. |

A run that fails can still leave an empty or half-written output behind; with `-n`, the next run
then refuses to start. Delete it first.

## Sound and picture out of step

Find out which kind it is: look at a clap, a slammed door or a speaker's lips near the start and
near the end.

- **The same offset all the way through**: shift the sound. Sound late by 0.3 s:
  `ffmpeg -i in.mp4 -itsoffset -0.3 -i in.mp4 -map 0:v -map 1:a -c copy synced.mp4` (use 0.3 when
  the sound comes early). Check again near the start and the end.
- **Drifting further apart over time**: usually a variable frame rate (phones, screen recordings,
  some webcams): ffprobe shows `avg_frame_rate` different from `r_frame_rate`. Re-encode at a
  constant rate (`-fps_mode cfr -r 30`, or `-vf fps=30`) before editing or joining. Other causes:
  files with different sample rates joined without `aformat` or `aresample`, or edits made with the
  `select` filter. Sound with gaps can be stretched back onto the picture's clock with
  `-af aresample=async=1`.
- **Only at the start of a cut**: a `-c copy` cut shown in a player or editor that ignores MP4 edit
  lists. Re-encode the cut.

## Phone videos

- **Sideways**: phones store many videos landscape with a rotation note. `ffprobe -v error
  -show_streams -select_streams v:0 in.mp4` shows `rotation=90` (or -90). ffmpeg turns the picture
  upright when it re-encodes; with `-c copy` the note stays, and most players follow it.
- **Washed-out or grey colours after converting**: the original is HDR (often from iPhones): ffprobe
  shows `pix_fmt=yuv420p10le` and `color_transfer=arib-std-b67` or `smpte2084`. Converting it to
  ordinary video needs tone mapping, which this skill's recipes do not do. Keep the original as it
  is, or export a standard (SDR) version from the phone or its editing app first.
- **Variable frame rate**: see above.

## Plays here, not there

- For phones, browsers, messaging apps and editors: H.264 video, AAC sound, `-pix_fmt yuv420p`, even
  sizes, `-movflags +faststart` (the first recipe in `recipes.md`).
- H.265 needs `-tag:v hvc1` for Apple devices, and many browsers cannot play it: use H.264.
- `pix_fmt=yuv420p10le` (10-bit) or `yuv444p` H.264 will not play on most phones: re-encode with
  `-pix_fmt yuv420p`.
- Too big to send: compress (`recipes.md`), or aim at a size with the two-pass recipe.
- Check what you made, not only what you meant: probe the output's codec, `pix_fmt`, size and
  streams.

## Downloads with yt-dlp

- `Requested format is not available`: list the formats with `-F` and pick one with `-f`.
- `HTTP Error 403`, extraction errors, or a site that worked last month: yt-dlp is probably out of
  date. Update it in the plugin's own environment, whose Python sits beside its yt-dlp:
  `uv pip install --python <that python> -U yt-dlp`, or `<that python> -m pip install -U yt-dlp`.
  Tell the person you did.
- `Sign in to confirm`, `Private video`, `members-only`: the video needs an account. Only if the
  person asks to use their own login, yt-dlp can borrow it from their browser
  (`--cookies-from-browser firefox`). Never to get round a paywall.
- `DRM protected`: stop. It cannot and should not be downloaded.
