# ffmpeg recipes

Replace the names; keep the output different from the input. Add `-n` to refuse overwriting.

## Convert and compress

```bash
# Any video to an MP4 that plays everywhere, good quality (lower CRF = better, bigger; 18–28 is usual)
ffmpeg -i in.mov -c:v libx264 -crf 22 -preset medium -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart out.mp4
# Smaller: 720p and H.265 (plays on newer devices)
ffmpeg -i in.mp4 -vf scale=-2:720 -c:v libx265 -crf 28 -tag:v hvc1 -c:a aac -b:a 128k out.720p.mp4
# Aim at a size (here about 25 MB for a 120-second video): bitrate = size*8/seconds, minus audio
ffmpeg -i in.mp4 -c:v libx264 -b:v 1500k -pass 1 -an -f mp4 /dev/null && ffmpeg -i in.mp4 -c:v libx264 -b:v 1500k -pass 2 -c:a aac -b:a 128k out.25mb.mp4
```

## Cut and join

```bash
# Keyframe cut, instant and lossless
ffmpeg -ss 00:01:30 -to 00:02:45 -i in.mp4 -c copy clip.mp4
# Exact cut
ffmpeg -i in.mp4 -ss 00:01:30 -to 00:02:45 -c:v libx264 -crf 20 -c:a aac clip.exact.mp4
# Join files with the same codecs: list them in list.txt as  file 'a.mp4'  lines
ffmpeg -f concat -safe 0 -i list.txt -c copy joined.mp4
```

## Audio

```bash
ffmpeg -i in.mp4 -vn -c:a copy sound.m4a              # the original audio track, untouched
ffmpeg -i in.mp4 -vn -c:a libmp3lame -q:a 2 sound.mp3   # MP3, good quality
ffmpeg -i in.wav -ar 16000 -ac 1 speech.16k.wav         # mono 16 kHz, for speech recognition
ffmpeg -i in.mp3 -af loudnorm=I=-16:TP=-1.5:LRA=11 level.mp3   # even loudness (podcasts)
ffmpeg -i in.mp4 -af volumedetect -f null -             # how loud it is
```

## Pictures from video

```bash
ffmpeg -ss 00:00:10 -i in.mp4 -frames:v 1 -q:v 2 thumb.jpg                       # one frame
ffmpeg -i in.mp4 -vf "fps=1/10,scale=320:-1,tile=4x4" -frames:v 1 sheet.jpg      # a contact sheet, a frame every 10 s
# A GIF with a good palette (keep it short and small)
ffmpeg -ss 5 -t 4 -i in.mp4 -vf "fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" out.gif
```

## Subtitles

```bash
ffmpeg -i in.mp4 -i subs.srt -c copy -c:s mov_text with-subs.mp4     # a track people can switch on
ffmpeg -i in.mp4 -vf subtitles=subs.srt -c:a copy burned.mp4          # burned into the picture
```

## Other

```bash
ffmpeg -i in.mp4 -vf "transpose=1" -c:a copy rotated.mp4              # rotate 90° clockwise
ffmpeg -i in.mp4 -filter:v "setpts=0.5*PTS" -filter:a "atempo=2.0" fast.mp4   # twice as fast
ffmpeg -i in.mp4 -an silent.mp4                                       # remove the sound
```
