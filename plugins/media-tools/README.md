# Audio and video

Teaches agents to work with audio and video files using **ffmpeg** (which must be installed on this
computer) and gives them **yt-dlp** in an environment of its own, for downloading media you have the
right to download.

The skill `media-tools` covers converting, cutting, joining, compressing, choosing tracks, extracting
audio, GIFs, thumbnails and contact sheets, subtitles, vertical versions for social media, and
checking every result. For longer edits it renders a cut list (the parts to keep, or to take out) in
one go, also from a transcript. For podcasts and voice recordings it measures loudness, peaks,
clipping, background noise and pauses, levels the sound to a target such as -16 LUFS, and shortens
long pauses. Two small scripts do the error-prone parts; they need nothing beyond ffmpeg and Python.

Other plugins build on this one (Speech to text).
