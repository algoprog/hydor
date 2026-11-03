---
name: transcribe-audio
description: Use when speech in a recording, voice note, video or podcast should become text or subtitles, or when a task needs what was said in an audio or video file.
category: creative
triggers: [transcribe, transcription, speech to text, subtitles for, what was said in, voice note]
---

# Speech to text

The Speech to text plugin gives you the `transcribe` tool. It runs on this computer: recordings are
not sent anywhere, which matters for meetings, interviews and private voice notes.

## 1. Check the file

- Full path, and that it exists. Any format ffmpeg reads works; a video's sound is used directly.
- Its length (`ffprobe -v error -show_entries format=duration -of csv=p=0 FILE`): it decides the model
  and whether to work in parts.

## 2. Choose the model

| Model | Use it for | Speed on a laptop processor |
| --- | --- | --- |
| `base` | long recordings, a quick look, clear speech | fast |
| `small` (default) | most recordings | about real time or better |
| `turbo` / `large-v3` | hard audio: accents, noise, names, several languages | slow; the first use downloads 1.6 to 3 GB |

Name the `language` when you know it: it avoids a wrong guess on a quiet start.

## 3. Long recordings in parts

Over about 20 minutes, transcribe in parts with `start` and `end` (seconds), 15 to 20 minutes each,
overlapping by a few seconds, and join the texts. Tell the user how long it will take. Each part
writes its own files: give each part an `out_dir` of its own, or rename after each one.

## 4. Check and tidy

- Read the start of the text it returns: right language, real sentences, no repeated loops.
- Fix obvious mishearings of names and terms the user gave you, and say you did.
- Whisper does not tell speakers apart: label speakers only when the context makes them clear, and
  say when it does not.
- Subtitles: the .srt is ready to load in a player or to burn in with the media-tools recipes.

## Pitfalls

- Relative paths: give the full path.
- Treating the transcript as exact quotes: check anything you will quote against the recording.
- Very noisy or music-heavy audio: say the quality is uncertain rather than inventing words.
