# Speech to text

Turns speech into text on this computer with [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
(OpenAI's Whisper models, made fast on ordinary processors). Recordings never leave the computer.

- One tool, `transcribe`: give it an audio or video file; it writes the text and subtitles (.txt, .srt,
  .vtt) beside it and answers with the language and the start of the text.
- About 100 languages, found by itself or named.
- Models download once, on first use, into the plugin's data folder.

It needs the Audio and video plugin (for ffmpeg, to cut long recordings and fix odd files), which is
added with it. Setting it up installs faster-whisper (about 100 MB).
