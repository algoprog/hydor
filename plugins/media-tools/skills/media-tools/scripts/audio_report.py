#!/usr/bin/env python3
"""Measure the sound of an audio or video file: loudness, peaks, clipping, background noise and pauses.

    python audio_report.py FILE [--stream 0] [--silence-db -35] [--silence-min 0.5] [--no-pauses]
                                [--target -16] [--peak -1.5] [--lra 11] [--level OUT]
                                [--pause-list LIST --leave 0.25]

It only reads FILE. With --level OUT it also writes a levelled copy to OUT in two loudnorm passes
(never over an existing file), at the original sample rate, and measures the copy. OUT's extension
picks the format: .wav .flac .mp3 .m4a .opus, or .mp4 .mov .m4v .mkv (the picture is copied as is).
With --pause-list LIST it writes the pauses as a cut list of what to take out, leaving --leave
seconds of each pause on both sides, for cut_list.py --remove. Check and edit the list first.
Needs ffmpeg and ffprobe. Python 3 standard library only.
"""

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys

AUDIO = {".wav": ["-c:a", "pcm_s16le"], ".flac": ["-c:a", "flac"], ".mp3": ["-c:a", "libmp3lame", "-q:a", "2"],
         ".m4a": ["-c:a", "aac", "-b:a", "192k"], ".opus": ["-c:a", "libopus", "-b:a", "96k"]}
VIDEO = (".mp4", ".mov", ".m4v", ".mkv")


def fail(msg):
    print(f"audio_report: {msg}", file=sys.stderr)
    sys.exit(1)


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, errors="replace", stdin=subprocess.DEVNULL)


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("nan")


def hms(t):
    if not math.isfinite(t):
        return "unknown"
    t = max(t, 0.0)
    return f"{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def probe(path, stream):
    r = run(["ffprobe", "-v", "error", "-show_entries",
             "stream=index,codec_type,codec_name,sample_rate,channels:stream_disposition=attached_pic:format=duration",
             "-of", "json", path])
    if r.returncode:
        fail(f"ffprobe cannot read {path}: {r.stderr.strip()[-300:]}")
    info = json.loads(r.stdout or "{}")
    audio = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
    if len(audio) <= stream:
        fail(f"{path} has {len(audio)} audio stream(s); there is no audio stream {stream}.")
    pictures = [s for s in info.get("streams", []) if s.get("codec_type") == "video"]
    return audio[stream], num(info.get("format", {}).get("duration")), pictures


def measure(path, stream, a, pauses=True):
    """One decoding pass: astats (peaks, noise), silencedetect (pauses), loudnorm (loudness, true peak)."""
    chain = ["astats=length=0.5"]
    if pauses:
        chain.append(f"silencedetect=noise={a.silence_db}dB:d={a.silence_min}")
    chain.append(f"loudnorm=I={a.target}:TP={a.peak}:LRA={a.lra}:print_format=json")
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-nostdin", "-i", path, "-map", f"0:a:{stream}",
             "-af", ",".join(chain), "-f", "null", "-"])
    if r.returncode:
        fail(f"ffmpeg could not measure {path}: {r.stderr.strip()[-400:]}")
    log = r.stderr
    stats, overall = {}, False
    for line in log.splitlines():
        if "Parsed_astats" not in line:
            continue
        if line.rstrip().endswith("] Overall"):
            overall = True
        elif overall and ": " in line:
            key, _, value = line.split("] ", 1)[-1].partition(": ")
            stats[key.strip()] = num(value)
    blocks = re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", log)
    loud = json.loads(blocks[-1]) if blocks else {}
    starts = [num(x) for x in re.findall(r"silence_start: *([-\d.e+]+)", log)]
    ends = [num(x) for x in re.findall(r"silence_end: *([-\d.e+]+)", log)]
    return stats, loud, starts, ends


def clipping(stats, codec):
    peak, flat, count = stats.get("Peak level dB", -math.inf), stats.get("Flat factor", 0.0), stats.get("Peak count", 0.0)
    if flat > 1 and count > 100:
        text = f"likely: {count:.0f} samples sit flat at the peak level ({peak:.1f} dBFS), the sign of clipped tops"
    elif peak >= -0.1:
        text = "it touches full scale, but no flat tops were found"
    else:
        text = "none found"
    if codec in ("mp3", "aac", "opus", "vorbis", "ac3", "eac3", "wmav2"):
        text += " (in a compressed format clipping does not always show here: listen to the loudest parts)"
    return text


def loud_lines(loud, stats):
    i, tp, lra = num(loud.get("input_i")), num(loud.get("input_tp")), num(loud.get("input_lra"))
    rms, floor = stats.get("RMS level dB", math.nan), stats.get("RMS trough dB", math.nan)
    yield f"Loudness    {i:.1f} LUFS integrated, loudness range {lra:.1f} LU"
    yield f"Peaks       true peak {tp:.1f} dBTP, highest sample {stats.get('Peak level dB', math.nan):.1f} dBFS, average (RMS) {rms:.1f} dB"
    if floor == -math.inf:
        yield "Background  some stretches are digital silence (exact zeros)"
    else:
        yield f"Background  quietest half second {floor:.1f} dB RMS (if it has pauses, this is the noise in them)"


def main():
    p = argparse.ArgumentParser(description="Measure loudness, peaks, clipping and pauses; optionally level the sound.")
    p.add_argument("file")
    p.add_argument("--stream", type=int, default=0, help="which audio stream (0 = the first)")
    p.add_argument("--silence-db", type=float, default=-35.0, help="quieter than this counts as a pause (dB)")
    p.add_argument("--silence-min", type=float, default=0.5, help="shortest pause to list (seconds)")
    p.add_argument("--no-pauses", action="store_true", help="skip the list of pauses")
    p.add_argument("--target", type=float, default=-16.0, help="loudness to aim at (LUFS)")
    p.add_argument("--peak", type=float, default=-1.5, help="highest true peak allowed (dBTP)")
    p.add_argument("--lra", type=float, default=11.0, help="loudness range allowed (LU)")
    p.add_argument("--level", metavar="OUT", help="write a levelled copy to OUT (two passes)")
    p.add_argument("--pause-list", metavar="LIST", help="write the pauses as a list of what to take out")
    p.add_argument("--leave", type=float, default=0.25, help="seconds of each pause to leave on both sides")
    a = p.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            fail(f"{tool} is not installed (the Audio and video plugin says how to get it).")
    if not os.path.isfile(a.file):
        fail(f"there is no file at {a.file}")
    out_ext = os.path.splitext(a.level or "")[1].lower()
    if a.pause_list and (a.no_pauses or os.path.exists(a.pause_list)):
        fail(f"--pause-list needs the pauses and a new file name ({a.pause_list} exists or --no-pauses is set).")
    if a.level and os.path.exists(a.level):
        fail(f"{a.level} already exists: choose a new name (the original is never overwritten).")
    if a.level and out_ext not in AUDIO and out_ext not in VIDEO:
        fail(f"--level writes {', '.join(list(AUDIO) + list(VIDEO))}; not {out_ext or 'a name without extension'}.")

    s, duration, pictures = probe(a.file, a.stream)
    rate = num(s.get("sample_rate"))
    rate = int(rate) if math.isfinite(rate) and rate > 0 else 48000
    print(f"{a.file}: audio stream {a.stream} ({s.get('codec_name')}, {rate} Hz, {s.get('channels')} channel(s)), {hms(duration)} long")
    stats, loud, starts, ends = measure(a.file, a.stream, a, pauses=not a.no_pauses)
    i, tp, lra = num(loud.get("input_i")), num(loud.get("input_tp")), num(loud.get("input_lra"))
    if not loud or not math.isfinite(i) or i <= -70:
        print("Loudness    too quiet or too short to measure: is there any sound?")
    else:
        print("\n".join(loud_lines(loud, stats)))
    print(f"Clipping    {clipping(stats, s.get('codec_name'))}")

    if not a.no_pauses:
        last = duration if math.isfinite(duration) else (starts[-1] if starts else 0.0)
        pauses = [(st, ends[k] if k < len(ends) else last) for k, st in enumerate(starts)]
        total = sum(e - b for b, e in pauses)
        print(f"Pauses      {len(pauses)} stretch(es) quieter than {a.silence_db:g} dB for {a.silence_min:g} s or more, {total:.1f} s in all")
        if pauses:
            print("            from          to            seconds")
            for b, e in pauses[:200]:
                print(f"            {hms(b)}   {hms(e)}   {e - b:6.2f}")
            if len(pauses) > 200:
                print(f"            ... and {len(pauses) - 200} more")
        if a.pause_list:
            cuts = [(b + a.leave, e - a.leave, e - b) for b, e in pauses if e - b - 2 * a.leave >= 0.1]
            with open(a.pause_list, "x", encoding="utf-8") as f:
                f.write(f"# Pauses in {os.path.basename(a.file)} to take out (cut_list.py --remove), leaving "
                        f"{a.leave:g} s on each side. Delete the lines for pauses that should stay.\n")
                for b, e, length in cuts:
                    f.write(f"{hms(b)}  {hms(e)}  pause of {length:.1f} s\n")
            print(f"Wrote       {a.pause_list}: {len(cuts)} pause(s) to shorten, {sum(e - b for b, e, _ in cuts):.1f} s in all")

    if not loud or not math.isfinite(i) or i <= -70:
        if a.level:
            fail("nothing to level.")
        return
    gain = a.target - i
    reasons = []
    if tp + gain > a.peak:
        reasons.append(f"the loudest peak would reach {tp + gain:+.1f} dBTP, over the {a.peak:g} limit")
    if lra > a.lra:
        reasons.append(f"its loudness range ({lra:.1f} LU) is wider than {a.lra:g} LU (raise --lra to keep it)")
    if lra <= 0:
        reasons.append("its loudness range measures 0 (a steady tone)")
    print(f"To reach    {a.target:g} LUFS: {gain:+.1f} dB. " + (
        "Linear: the sound stays the same, only louder or quieter." if not reasons else
        "Not linear: " + "; ".join(reasons) + ". loudnorm would also even out loud and quiet parts (dynamic)."))
    if not a.level:
        return

    second = (f"loudnorm=I={a.target}:TP={a.peak}:LRA={a.lra}:measured_I={loud['input_i']}:measured_TP={loud['input_tp']}"
              f":measured_LRA={loud['input_lra']}:measured_thresh={loud['input_thresh']}:offset={loud['target_offset']}"
              ":linear=true:print_format=json")
    out_rate = 48000 if out_ext == ".opus" else (min(rate, 48000) if out_ext not in (".wav", ".flac") else rate)
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-nostdin", "-n", "-i", a.file]
    films = [v for v in pictures if not v.get("disposition", {}).get("attached_pic")]
    covers = [v for v in pictures if v.get("disposition", {}).get("attached_pic")]
    if out_ext in VIDEO and films:  # the picture first, copied as it is
        cmd += ["-map", f"0:{films[0]['index']}", "-map", f"0:a:{a.stream}", "-c:v", "copy"]
    elif out_ext in (".mp3", ".m4a", ".flac") and covers:  # keep the cover picture
        cmd += ["-map", f"0:a:{a.stream}", "-map", f"0:{covers[0]['index']}", "-c:v", "copy", "-disposition:v:0", "attached_pic"]
    else:
        cmd += ["-map", f"0:a:{a.stream}"]
    cmd += ["-af", second, "-ar", str(out_rate)] + AUDIO.get(out_ext, ["-c:a", "aac", "-b:a", "192k"])
    if out_ext in (".mp4", ".mov", ".m4v"):
        cmd += ["-movflags", "+faststart"]
    r = run(cmd + [a.level])
    if r.returncode or not os.path.isfile(a.level):
        fail(f"levelling failed: {r.stderr.strip()[-500:]}")
    blocks = re.findall(r"\{[^{}]*\"normalization_type\"[^{}]*\}", r.stderr)
    mode = json.loads(blocks[-1]).get("normalization_type", "?") if blocks else "?"
    s2, _, _ = probe(a.level, 0)
    stats2, loud2, _, _ = measure(a.level, 0, a, pauses=False)
    print(f"\nWrote {a.level} ({mode} levelling" + (
        ": loudnorm also evened out loud and quiet parts; listen for pumping)" if mode == "dynamic" else ")"))
    print("\n".join(loud_lines(loud2, stats2)))
    print(f"Clipping    {clipping(stats2, s2.get('codec_name'))}")


if __name__ == "__main__":
    main()
