#!/usr/bin/env python3
"""Render a cut list: keep the listed parts of one audio or video file, in order, cut exactly, in one go.

    python cut_list.py SOURCE CUTS.txt OUTPUT [--remove] [--crf 20] [--fade 0.01] [--dry-run]

CUTS.txt has one part per line: its start, its end, then an optional note. Times are hh:mm:ss.s,
mm:ss.s or seconds; 00:01:02,500 (as in .srt files) and "start --> end" work too. Blank lines and
lines starting with # are skipped. The parts must come in the order they appear in the source.
With --remove the lines are the parts to take out, and everything else is kept.

It prints the plan (each part, its length and where it starts in the result), renders it with one
ffmpeg command into OUTPUT (never over an existing file), and compares the result's length with the
plan. .mp4 .mov .m4v .mkv get H.264 video (--crf) and AAC sound; .wav .flac .mp3 .m4a .opus keep the
sound only. Each part's sound fades in and out over --fade seconds, so joins do not click.
Needs ffmpeg and ffprobe. Python 3 standard library only.
"""

import argparse
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import sys

TIME = r"\d+(?::\d{1,2}){0,2}(?:[.,]\d+)?"
LINE = re.compile(rf"^\s*({TIME})\s*(?:-->|-|–|—|to)?\s*({TIME})(?:\s+(.*))?$")
AUDIO = {".wav": ["-c:a", "pcm_s16le"], ".flac": ["-c:a", "flac"], ".mp3": ["-c:a", "libmp3lame", "-q:a", "2"],
         ".m4a": ["-c:a", "aac", "-b:a", "192k"], ".opus": ["-c:a", "libopus", "-b:a", "96k", "-ar", "48000"]}
VIDEO = (".mp4", ".mov", ".m4v", ".mkv")
MAX_PARTS = 150


def fail(msg):
    print(f"cut_list: {msg}", file=sys.stderr)
    sys.exit(1)


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, errors="replace", stdin=subprocess.DEVNULL)


def seconds(text):
    total = 0.0
    for piece in text.replace(",", ".").split(":"):
        total = total * 60 + float(piece)
    return total


def rate(text):
    top, _, bottom = str(text).partition("/")
    try:
        return float(top) / float(bottom or 1)
    except (ValueError, ZeroDivisionError):
        return 0.0


def hms(t):
    t = max(t, 0.0)
    return f"{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def probe(path):
    r = run(["ffprobe", "-v", "error", "-show_entries",
             "stream=index,codec_type,avg_frame_rate,r_frame_rate:stream_disposition=attached_pic:format=duration",
             "-of", "json", path])
    if r.returncode:
        fail(f"ffprobe cannot read {path}: {r.stderr.strip()[-300:]}")
    info = json.loads(r.stdout or "{}")
    streams = info.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    try:
        duration = float(info.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        fail(f"ffprobe does not know how long {path} is.")
    return video, audio, duration


def read_parts(path):
    parts = []
    with open(path, encoding="utf-8-sig") as f:
        for n, line in enumerate(f, 1):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            m = LINE.match(line.rstrip("\n"))
            if not m:
                fail(f"{path} line {n} is not 'start end [note]': {line.strip()!r}")
            start, end = seconds(m.group(1)), seconds(m.group(2))
            if end <= start:
                fail(f"{path} line {n}: the end ({m.group(2)}) is not after the start ({m.group(1)}).")
            parts.append((start, end, (m.group(3) or "").strip(), n))
    if not parts:
        fail(f"{path} lists no parts.")
    return parts


def keep_list(parts, duration, remove):
    if remove:  # the lines are what to take out: keep the gaps between them
        keep, pos = [], 0.0
        for start, end, _, _ in sorted(parts):
            if start > pos:
                keep.append((pos, min(start, duration), ""))
            pos = max(pos, end)
        if pos < duration:
            keep.append((pos, duration, ""))
        return [(b, e, note) for b, e, note in keep if e - b >= 0.1]
    keep, last_end = [], 0.0
    for start, end, note, n in parts:
        if start >= duration:
            fail(f"line {n} starts at {hms(start)}, after the end of the source ({hms(duration)}).")
        if start < last_end - 0.001:
            fail(f"line {n} starts before the previous part ends: list the parts in the source's order, without "
                 "overlaps. To change the order, render each stretch that is in order separately and join the results.")
        if end > duration + 0.05:
            print(f"Note: line {n} ends after the source does; it now ends at {hms(duration)}.")
        end = min(end, duration)
        if end - start < 0.1:
            fail(f"line {n} is shorter than a tenth of a second.")
        keep.append((start, end, note))
        last_end = end
    return keep


def build_graph(keep, offset, video, audio, fade):
    n, g, labels = len(keep), [], []
    if video and n > 1:
        g.append(f"[0:{video['index']}]split={n}" + "".join(f"[s{k}]" for k in range(n)))
    if audio and n > 1:
        g.append(f"[0:{audio['index']}]asplit={n}" + "".join(f"[t{k}]" for k in range(n)))
    for k, (b, e, _) in enumerate(keep):
        b0, e0 = b - offset, e - offset
        if video:
            src = f"[s{k}]" if n > 1 else f"[0:{video['index']}]"
            g.append(f"{src}trim=start={b0:.6f}:end={e0:.6f},setpts=PTS-STARTPTS[v{k}]")
            labels.append(f"[v{k}]")
        if audio:
            src = f"[t{k}]" if n > 1 else f"[0:{audio['index']}]"
            fades = ""
            if fade > 0 and e - b > 4 * fade:
                fades = f",afade=t=in:st=0:d={fade:g},afade=t=out:st={e - b - fade:.6f}:d={fade:g}"
            g.append(f"{src}atrim=start={b0:.6f}:end={e0:.6f},asetpts=PTS-STARTPTS{fades}[a{k}]")
            labels.append(f"[a{k}]")
    outs = ("[v]" if video else "") + ("[a]" if audio else "")
    g.append("".join(labels) + f"concat=n={n}:v={1 if video else 0}:a={1 if audio else 0}{outs}")
    return ";".join(g)


def main():
    p = argparse.ArgumentParser(description="Keep the listed parts of an audio or video file, cut exactly, joined in order.")
    p.add_argument("source")
    p.add_argument("cuts", help="text file: one 'start end [note]' per line")
    p.add_argument("output")
    p.add_argument("--remove", action="store_true", help="the lines are the parts to take out")
    p.add_argument("--crf", type=int, default=20, help="video quality: lower is better and bigger (18 to 28)")
    p.add_argument("--fade", type=float, default=0.01, help="sound fade at each join, in seconds (0 for none)")
    p.add_argument("--dry-run", action="store_true", help="print the plan and the command, render nothing")
    a = p.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            fail(f"{tool} is not installed (the Audio and video plugin says how to get it).")
    for path in (a.source, a.cuts):
        if not os.path.isfile(path):
            fail(f"there is no file at {path}")
    ext = os.path.splitext(a.output)[1].lower()
    if os.path.abspath(a.output) == os.path.abspath(a.source):
        fail("the output must be a new file, not the source.")
    if os.path.exists(a.output) and not a.dry_run:
        fail(f"{a.output} already exists: choose a new name.")
    if ext not in VIDEO and ext not in AUDIO:
        fail(f"the output must end in {', '.join(VIDEO + tuple(AUDIO))}.")

    video, audio, duration = probe(a.source)
    if ext in AUDIO:
        video = None
    if not video and not audio:
        fail(f"{a.source} has nothing to cut for a {ext} file (no {'sound' if ext in AUDIO else 'picture or sound'}).")
    keep = keep_list(read_parts(a.cuts), duration, a.remove)
    if not keep:
        fail("nothing is left to keep.")
    if len(keep) > MAX_PARTS:
        fail(f"{len(keep)} parts: split the list into lists of at most {MAX_PARTS}, render each, then join the results.")

    fps = 0.0
    if video:
        avg, base = rate(video.get("avg_frame_rate")), rate(video.get("r_frame_rate"))
        if avg > 0 and base > 0 and abs(avg - base) <= 0.01 * base:
            fps = base
        else:
            print("Note: the source has a variable frame rate. If sound and picture drift apart in the result, "
                  "convert it to a constant one first (-fps_mode cfr -r 30) and cut that.")
    if fps > 0:  # cut on frame boundaries, so each part's sound and picture start and end together
        snap = lambda t: min(math.ceil(t * fps - 1e-6) / fps, duration)
        keep = [(snap(b), snap(e), note) for b, e, note in keep if snap(e) > snap(b)]
    total = sum(e - b for b, e, _ in keep)
    print(f"Source  {a.source} ({hms(duration)})")
    print(f"Keeping {len(keep)} part(s), {hms(total)} in all ({hms(duration - total)} left out)")
    print("  #  from          to            seconds   starts in the result at   note")
    at = 0.0
    for k, (b, e, note) in enumerate(keep, 1):
        print(f"{k:3d}  {hms(b)}   {hms(e)}   {e - b:8.2f}   {hms(at):24}  {note}")
        at += e - b

    offset = keep[0][0] if video else 0.0  # sound alone decodes fast: read it from the start, no seeking
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-n"]
    if offset > 0:
        cmd += ["-ss", f"{offset:.6f}"]  # jump to the first part; the times in the graph count from there
    cmd += ["-t", f"{keep[-1][1] - offset:.6f}", "-i", a.source,
            "-filter_complex", build_graph(keep, offset, video, audio, a.fade)]
    if video:
        cmd += ["-map", "[v]", "-c:v", "libx264", "-crf", str(a.crf), "-preset", "medium", "-pix_fmt", "yuv420p"]
    if audio:
        cmd += ["-map", "[a]"] + AUDIO.get(ext, ["-c:a", "aac", "-b:a", "192k"])
    if ext in (".mp4", ".mov", ".m4v"):
        cmd += ["-movflags", "+faststart"]
    cmd.append(a.output)
    if a.dry_run:
        print("\n" + shlex.join(cmd))
        return

    print("Rendering..." + (" (video takes a while: roughly the kept length or longer)" if video else ""), flush=True)
    r = run(cmd)
    if r.returncode or not os.path.isfile(a.output) or os.path.getsize(a.output) == 0:
        fail(f"ffmpeg failed: {r.stderr.strip()[-800:]}")
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.output]).stdout.strip()
    try:
        got = float(out)
    except ValueError:
        fail(f"wrote {a.output}, but ffprobe cannot read its length: check the file.")
    slack = 0.1 + len(keep) / (fps or 30.0)
    verdict = "as planned" if abs(got - total) <= slack else "NOT as planned: look at the joins"
    print(f"Wrote   {a.output}: {hms(got)} long, planned {hms(total)} ({verdict}).")
    if r.stderr.strip():
        print("ffmpeg said:\n" + r.stderr.strip()[-800:])


if __name__ == "__main__":
    main()
