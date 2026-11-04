# Sound: loudness, clipping, noise and pauses

Open this for podcasts, voice recordings and any job where the sound matters. The scripts named here
are run as SKILL.md shows, with the plugin's Python (or `python3`). Work on a WAV copy, measure before
and after every step, and make the MP3 or AAC once, at the end.

## Measure first

`scripts/audio_report.py FILE` decodes the sound once and prints:

| Line | What it means |
| --- | --- |
| Loudness | Integrated loudness in LUFS: how loud the whole thing sounds to people. Loudness range (LU): how much that changes; speech is often 3 to 10. |
| Peaks | True peak (dBTP): the highest point of the wave, also between samples; it matters after MP3 or AAC. Highest sample (dBFS) and the average level (RMS). |
| Background | The quietest half second: in a recording with pauses, the noise in them. Below -60 dB is clean; above -45 dB is a noisy room, a fan or hum. |
| Clipping | Flat tops where the recording went over the limit. |
| Pauses | Every stretch quieter than `--silence-db` (default -35) for `--silence-min` seconds (default 0.5). |
| To reach | The gain to `--target`, and whether levelling can be linear. |

Options: `--stream 1` for the second audio track, `--no-pauses`, `--target`, `--peak`, `--lra`.
Without the script: `ffmpeg -i FILE -af ebur128=peak=true -f null -` prints a loudness summary at
the end, and `ffmpeg -i FILE -af astats -f null -` the peaks and levels.

## Targets

| Where it goes | Integrated loudness | True peak at most |
| --- | --- | --- |
| Podcast | -16 LUFS ±1 (Apple's recommendation, common elsewhere); a mono file usually -19 | -1 dBTP |
| YouTube, Spotify and most streaming | about -14 LUFS: louder files are turned down, quieter ones mostly not turned up | -1 dBTP |
| TV in Europe (EBU R128) | -23 LUFS | -1 dBTP |
| TV in the USA (ATSC A/85) | -24 LUFS | -2 dBTP |
| Audiobooks for Audible (ACX) | measured as RMS: between -23 and -18 dB, with background below -60 dB | highest sample -3 dBFS |

Platforms change these from time to time: check their current guidance when it matters. A mono
file sounds about 3 dB louder on two speakers than it measures, hence -19 for mono (by hand, the
same as `I=-16` with loudnorm's `dual_mono=true`).

## Levelling

`audio_report.py FILE --level OUT` levels in two passes: the first measures, the second applies the
measured values with `linear=true`, at the file's own sample rate, and then measures OUT.

- **Linear** means the sound is unchanged, only louder or quieter. It is possible when the gain
  leaves the true peak under `--peak` and the loudness range fits `--lra`.
- **Dynamic** means loudnorm also rides the level like a compressor. Usually fine for speech. For
  music, or when you hear the level breathing (pumping), tame the few loudest peaks first and level
  again: `volume=11.6dB,alimiter=limit=0.79:level=disabled` (0.79 is about -2 dBFS; use the gain the
  report gives). Spikes carry loudness, so the result may come out a little under the target: measure
  it and level once more (now linear).
- Encoding to MP3 or AAC can push the peaks up a little: that is why the default ceiling is -1.5, not -1.

By hand, pass 1 prints JSON at the end; copy its numbers into pass 2:

```bash
ffmpeg -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -
ffmpeg -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-28.82:measured_TP=-18.39:measured_LRA=4.80:measured_thresh=-39.88:offset=0.02:linear=true:print_format=summary -ar 48000 out.wav
```

Always give `-ar` (loudnorm works at 192 kHz and writes that otherwise), and always set I, TP and
LRA (the defaults are -24, -2 and 7, a broadcast setting).

## Clipping

The recording went over the limit and the tops of the wave were cut off: loud words sound harsh or
crackly. The report says "likely: N samples sit flat at the peak level"; a waveform picture shows
blocks that touch the top and bottom edges. Turning it down keeps the damage (the flat tops are
still there, only lower). ffmpeg's `adeclip` filter is very slow and only helps light clipping. If
it matters, record again with the input level lower; otherwise keep it and tell the person. In MP3
and AAC files the flat tops get smoothed by the encoding, so listen to the loudest parts.

## Noise, hum and rumble

Clean in this order: rumble and hum, then steady noise, then evening out, then cuts, then levelling.
Run the report after each step (the Background line should drop, the loudness hardly) and listen:
too much noise reduction makes voices watery or robotic.

| Problem | Filter | In a test |
| --- | --- | --- |
| Rumble, traffic, handling noise | `highpass=f=80` | background -36.6 to -42.1 dB |
| Mains hum (50 Hz in Europe, 60 Hz in the Americas) and its multiples | `equalizer=f=50:t=q:w=8:g=-30,equalizer=f=100:t=q:w=8:g=-30,equalizer=f=150:t=q:w=8:g=-30` (60, 120, 180 for 60 Hz) | -36.6 to -47.9 dB |
| Steady hiss, fan, air conditioning | `highpass=f=80,afftdn=nf=-30` (-25 removes more, -40 less) | -36.6 to -43.8 dB |

To see hum: `ffmpeg -i in.wav -lavfi "showspectrumpic=s=800x300:legend=1:stop=1000" low.png` shows
the frequencies up to 1000 Hz; hum is a band at the bottom that carries on through the pauses.

## Uneven speakers and one-sided recordings

- One loud and one quiet voice: `dynaudnorm=f=200:g=11` brought two speakers 14 dB apart to 6 dB
  apart in a test, but lifted the noise in the pauses from -59 to -33 dB. Clean the noise first and
  check the Background line afterwards. Gentler: `acompressor=threshold=-30dB:ratio=4:attack=10:release=250:makeup=6`
  (14 to 9 dB apart, noise to -44 dB).
- A voice in the left channel only: `pan=mono|c0=FL` (right: `c0=FR`).
- Two microphones on two channels, one voice each: `pan=mono|c0=c0+c1` adds them at full level;
  `-ac 1` averages them, which leaves each voice 6 dB quieter.

## Pauses and silence

- `audio_report.py` lists them; by hand, `ffmpeg -i in.wav -af silencedetect=noise=-35dB:d=0.5 -f null -`
  prints `silence_start` and `silence_end` lines.
- Set the threshold about 10 dB above the Background number (in a test with background at -36.6 dB,
  -31.6 found no pauses and -28 found them all). If nothing is found, raise it; if quiet words show
  up as pauses, lower it.
- To shorten them, follow "Shortening pauses" in `editing.md`: a list of pauses to take out, checked
  by you and the person, then `cut_list.py --remove`. Silence is not automatically safe to cut.
- `silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-35dB` shortened every pause to
  about half a second in ffmpeg 6.1, but other versions read these options differently: measure the
  pauses in the result. Sound files only: on a video it shortens the sound and not the picture.

## Music, intros and fades

```bash
# Music under the whole voice track, at a fifth of its level, fading out from 20 s to 25 s
ffmpeg -i voice.wav -i music.wav -filter_complex "[1:a]volume=0.2,afade=t=out:st=20:d=5[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]" -map "[a]" mixed.wav
# Music that dips whenever the voice speaks (ducking)
ffmpeg -i voice.wav -i music.wav -filter_complex "[0:a]asplit=2[voice][key];[1:a]volume=0.5[m];[m][key]sidechaincompress=threshold=0.02:ratio=10:attack=20:release=400[ducked];[voice][ducked]amix=inputs=2:duration=first:normalize=0[a]" -map "[a]" mixed.wav
# Eight seconds of intro music fading out, then the voice
ffmpeg -i music.wav -i voice.wav -filter_complex "[0:a]atrim=0:8,afade=t=out:st=6:d=2[i];[i][1:a]concat=n=2:v=0:a=1[a]" -map "[a]" episode.wav
```

When the two have different sample rates, ffmpeg converts one by itself but may keep the music's
(44.1 kHz in a test with 48 kHz speech): add `-ar 48000` before the output name to choose. Use
music the person has the right to use.

## A podcast, start to finish

1. Keep the original; make a WAV to work on (`ffmpeg -i raw.m4a -c:a pcm_s16le work.wav`).
2. Run the report: loudness, clipping, background noise, pauses.
3. Clean only what needs it (the table above), measuring after each step.
4. Edit with a cut list (mistakes, long pauses), add intro and outro music.
5. Level the finished WAV: `--level` with `--target -16` (stereo) or `--target -19` (mono).
6. Export once: MP3 at 128 kbit/s for stereo or 64 to 96 kbit/s for mono speech, with tags and a
   cover picture (`recipes.md`).
7. Run the report on the MP3 (true peak at most -1 dBTP), and give the person what to listen to: the
   start, the end, every join and the loudest passage.

## What only a listen can tell

Clicks at joins, pumping (the background breathing up and down after dynamic levelling or
compression), watery or robotic voices after noise reduction, a word cut short, music too loud under
speech. Measurements and pictures narrow down where to listen; they do not replace listening.
