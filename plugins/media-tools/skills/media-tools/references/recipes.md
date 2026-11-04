# ffmpeg recipes

Replace the names; keep the output different from the input. Add `-n` to refuse overwriting. Every
command here was run on generated test media. On Windows, use `NUL` where a command says `/dev/null`,
and keep filter graphs in double quotes.

## Convert and compress

```bash
# Any video to an MP4 that plays everywhere, good quality (lower CRF = better, bigger; 18–28 is usual)
ffmpeg -i in.mov -c:v libx264 -crf 22 -preset medium -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart out.mp4
# Smaller: 720p and H.265 (plays on newer devices; hvc1 lets Apple devices play it)
ffmpeg -i in.mp4 -vf scale=-2:720 -c:v libx265 -crf 28 -tag:v hvc1 -c:a aac -b:a 128k out.720p.mp4
# Aim at a size (here about 25 MB for a 120-second video): bitrate = size*8/seconds, minus audio
ffmpeg -i in.mp4 -c:v libx264 -b:v 1500k -pass 1 -an -f mp4 /dev/null && ffmpeg -i in.mp4 -c:v libx264 -b:v 1500k -pass 2 -c:a aac -b:a 128k out.25mb.mp4
# (two passes leave ffmpeg2pass-0.log files in the folder: delete them afterwards)
```

Hardware encoders (`h264_nvenc`, `hevc_nvenc`, `h264_qsv`, `h264_vaapi`, `h264_videotoolbox`,
`h264_amf`) are faster, but whether they work depends on the build, the graphics hardware and its
drivers, and they give a bigger file for the same quality. Try one on ten seconds (`-t 10`) first,
and fall back to libx264 if it fails.

## Choose the streams

```bash
ffmpeg -i in.mkv -map 0:v:0 -map 0:a:1 -c copy commentary.mp4          # first video, second audio track
ffmpeg -i in.mkv -map 0 -c copy -c:s mov_text all.mp4                   # every stream; MP4 subtitles must be mov_text
ffmpeg -i in.mkv -map 0:v -map 0:m:language:fra -c copy french.mkv      # the tracks tagged French
ffmpeg -i in.mkv -map 0 -map -0:s -c copy nosubs.mkv                    # everything except subtitles
ffmpeg -i in.mp4 -map 0:v -map "0:a?" -c copy out.mp4                   # audio only if there is some
ffmpeg -i in.mkv -map 0:a:1 -c:a copy commentary.m4a                    # pull out one audio track
# Replace the sound of a video with another recording (the picture is copied untouched)
ffmpeg -i video.mp4 -i voice.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest out.mp4
# Add a second sound track, keeping the first
ffmpeg -i video.mp4 -i commentary.wav -map 0 -map 1:a -c:v copy -c:a:0 copy -c:a:1 aac -b:a:1 128k -metadata:s:a:1 language=eng out.mp4
```

## Cut and join

The details (keyframes, files that differ, cut lists) are in `editing.md`.

```bash
ffmpeg -ss 00:01:30 -to 00:02:45 -i in.mp4 -c copy clip.mp4                                  # quick: starts at the keyframe before
ffmpeg -ss 00:01:30 -to 00:02:45 -i in.mp4 -c:v libx264 -crf 20 -c:a aac clip.exact.mp4      # exact
ffmpeg -f concat -safe 0 -i list.txt -c copy joined.mp4     # list.txt: one  file 'a.mp4'  line per file, same settings
```

## Sound

```bash
ffmpeg -i in.mp4 -vn -c:a copy sound.m4a              # the original audio track, untouched
ffmpeg -i in.mp4 -vn -c:a libmp3lame -q:a 2 sound.mp3   # MP3, good quality
ffmpeg -i in.wav -ar 16000 -ac 1 speech.16k.wav         # mono 16 kHz, for speech recognition
ffmpeg -i in.mp4 -af volumedetect -f null -             # how loud it is (mean and max volume)
# MP3 with tags and a cover picture
ffmpeg -i episode.wav -i cover.jpg -map 0:a -map 1:v -c:a libmp3lame -b:a 128k -c:v mjpeg -disposition:v:0 attached_pic -id3v2_version 3 -metadata title="Episode 12" -metadata artist="The Show" episode.mp3
# A still picture with a recording, for video sites (one frame a second keeps it small)
ffmpeg -loop 1 -framerate 1 -i cover.png -i episode.wav -map 0:v -map 1:a -vf scale=1280:-2 -c:v libx264 -tune stillimage -pix_fmt yuv420p -r 1 -c:a aac -b:a 160k -shortest -movflags +faststart episode.mp4
```

Levelling loudness, noise, pauses and music under a voice are in `audio.md`.

## Pictures from video

```bash
ffmpeg -ss 00:00:10 -i in.mp4 -frames:v 1 -q:v 2 thumb.jpg                       # one frame
ffmpeg -i in.mp4 -vf "thumbnail=300,scale=640:-2" -frames:v 1 best.jpg           # a typical frame from the first 300
ffmpeg -i in.mp4 -vf "fps=1/10,scale=320:-1,tile=4x4" -frames:v 1 sheet.jpg      # a contact sheet, a frame every 10 s
# A GIF with a good palette (keep it short and small)
ffmpeg -ss 5 -t 4 -i in.mp4 -vf "fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" out.gif
# A picture of the sound: pauses, spikes, level jumps and clipping (flat blocks touching the edges) show
ffmpeg -i in.wav -filter_complex "color=c=white:s=1600x240[bg];[0:a]showwavespic=s=1600x240:scale=sqrt:colors=0x1f4fd0[w];[bg][w]overlay=format=auto" -frames:v 1 wave.png
```

`-ss` past the end of the file gives "Output file is empty, nothing was encoded".

## Subtitles

```bash
# A track people can switch on: MP4 needs mov_text; mark its language and make it the default
ffmpeg -i in.mp4 -i subs.srt -map 0:v -map 0:a -map 1:0 -c:v copy -c:a copy -c:s mov_text -metadata:s:s:0 language=eng -disposition:s:0 default with-subs.mp4
# MKV keeps SRT as it is, several languages at once
ffmpeg -i in.mp4 -i subs.en.srt -i subs.el.srt -map 0:v -map 0:a -map 1:0 -map 2:0 -c copy -c:s srt -metadata:s:s:0 language=eng -metadata:s:s:1 language=ell with-subs.mkv
# Burned into the picture (needs the subtitles filter: ffmpeg -hide_banner -h filter=subtitles)
ffmpeg -i in.mp4 -vf subtitles=subs.srt -c:a copy burned.mp4
# Bigger, bolder and higher up, for phones (sizes count on a 288-line-high canvas, whatever the video's size)
ffmpeg -i in.mp4 -vf "subtitles=subs.srt:force_style='FontSize=12,Bold=1,Outline=2,MarginV=70'" -c:a copy burned.mp4
# Cut and burn in one go: tell the filter where the clip starts (here 4 s), or the lines come at the wrong times
ffmpeg -ss 4 -to 12 -i in.mp4 -vf "setpts=PTS+4/TB,subtitles=subs.srt,setpts=PTS-STARTPTS" -c:v libx264 -crf 20 -c:a aac clip.mp4
ffmpeg -i subs.srt subs.vtt                                  # SRT to WebVTT for web players (and back the other way)
ffmpeg -itsoffset 2.5 -i subs.srt -c copy later.srt          # every line 2.5 s later
ffmpeg -i subs.srt -ss 4 -output_ts_offset -4 earlier.srt     # 4 s earlier; a line running across 0:04 is dropped
ffmpeg -i in.mkv -map 0:s:0 subs.srt                         # take a subtitle track out
```

SRT numbers its lines and writes `00:00:01,000`; VTT starts with `WEBVTT` and writes `00:00:01.000`.
Subtitles from DVDs and Blu-rays are pictures, not text: they cannot become SRT or mov_text with
ffmpeg ("only possible from text to text or bitmap to bitmap"); keep them in MKV, or leave them out.

## Vertical 9:16 versions

Phones store many videos as 1920x1080 with a rotation of 90: ffmpeg turns them upright before any
filter, so do the sums on the picture as it is seen. Take a frame first to see where the person is.

```bash
# Crop the middle (talking heads, centred subjects)
ffmpeg -i in.mp4 -vf "crop=trunc(ih*9/16/2)*2:ih,scale=1080:1920,setsar=1" -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart vertical.mp4
# Crop where the person is: X is the left edge, from 0 to (width - ih*9/16); here 200 on a 1920x1080 picture
ffmpeg -i in.mp4 -vf "crop=606:1080:200:0,scale=1080:1920,setsar=1" -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart vertical.mp4
# Keep the whole picture over a blurred, enlarged copy of itself
ffmpeg -i in.mp4 -filter_complex "[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30[bg];[fg]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]" -map "[v]" -map "0:a?" -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart vertical.mp4
# Keep the whole picture with black bars above and below
ffmpeg -i in.mp4 -vf "scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1" -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart vertical.mp4
```

Burn subtitles in after the crop, with the phone settings above, so they sit above the apps' buttons.
Check a frame of the result: is the person inside the crop the whole time?

## Other

```bash
ffmpeg -i in.mp4 -vf "transpose=1" -c:a copy rotated.mp4                       # rotate 90° clockwise
ffmpeg -i in.mp4 -filter:v "setpts=0.5*PTS" -filter:a "atempo=2.0" fast.mp4    # twice as fast
ffmpeg -i in.mp4 -an -c:v copy silent.mp4                                      # remove the sound
ffmpeg -i in.mp4 -vf "fade=t=in:st=0:d=1,fade=t=out:st=9:d=1" -af "afade=t=in:st=0:d=1,afade=t=out:st=9:d=1" faded.mp4   # fade in and out (a 10 s video)
ffmpeg -i in.mp4 -fps_mode cfr -r 30 -c:a copy steady.mp4                      # variable to constant frame rate (older ffmpeg: -vsync cfr)
ffmpeg -i in.mp4 -itsoffset -0.3 -i in.mp4 -map 0:v -map 1:a -c copy synced.mp4    # sound 0.3 s late: move it earlier (0.3 for early sound)
```
