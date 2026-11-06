"""Speech to text with faster-whisper, as an MCP server: on this computer, nothing sent anywhere.

Audio is decoded with ffmpeg (from the Audio and video plugin this one needs) into 16 kHz mono samples,
so any format ffmpeg reads works. Models download once into the plugin's data folder (HF_HOME) on first
use. It runs on an NVIDIA graphics card when there is one (CUDA's libraries come with the plugin's setup
there: cuBLAS and cuDNN, found through LD_LIBRARY_PATH), else on the CPU, and on the CPU too when the card
fails (its libraries missing, out of memory), saying why. CTranslate2 has no Apple GPU support, so a Mac
transcribes on its CPU. A model stays loaded between calls.
"""

import os
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp_server import Server, ToolError  # noqa: E402

MODELS = ["tiny", "base", "small", "medium", "large-v3", "turbo"]
REAL = {"turbo": "large-v3-turbo"}
loaded = {}
# Why the graphics card failed, once it has: the CPU from then on.
gpu_failed = None

server = Server(
    "transcribe",
    "1.0.0",
    instructions="Speech to text on this computer, on an NVIDIA graphics card when there is one, else the CPU. Give full paths. The first use of a model downloads it (tiny 75 MB, base 145 MB, small 480 MB, turbo 1.6 GB). For recordings over 20 minutes, use the base model or transcribe in parts with start and end.",
)


def model_for(size, device):
    """A model on "cuda" (as it was made, float16) or the "cpu" (int8)."""
    from faster_whisper import WhisperModel

    key = (size, device)
    if key not in loaded:
        loaded[key] = WhisperModel(REAL.get(size, size), device=device, compute_type="int8" if device == "cpu" else "default")
    return loaded[key]


def has_cuda():
    """An NVIDIA graphics card CTranslate2 can see."""
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except Exception:  # noqa: BLE001
        return False


def run_model(size, device, audio, language):
    """The segments (start, end, text) and the info; the work happens as the segments are read."""
    m = model_for(size, device)
    segments, info = m.transcribe(audio, language=language or None, vad_filter=True, beam_size=5)
    return [(s.start, s.end, s.text.strip()) for s in segments], info


def load_audio(src, start=None, end=None):
    """The recording as 16 kHz mono float samples, decoded by ffmpeg (only the part from start to end)."""
    import numpy as np

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise ToolError("ffmpeg is not installed on this computer: the Audio and video plugin says how to get it.")
    cmd = [ffmpeg, "-nostdin", "-v", "error"]
    if start:
        cmd += ["-ss", str(float(start))]
    if end is not None:
        cmd += ["-t", str(max(float(end) - float(start or 0), 0.1))]
    cmd += ["-i", src, "-vn", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise ToolError(f"ffmpeg could not read it: {r.stderr.decode(errors='replace').strip()[-400:] or 'unknown error'}")
    return np.frombuffer(r.stdout, np.int16).astype(np.float32) / 32768.0


def stamp(t, sep=","):
    h, rest = divmod(max(t, 0), 3600)
    m, s = divmod(rest, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d}{sep}{int(round((s - int(s)) * 1000)):03d}"


@server.tool(
    "transcribe",
    "Turn speech in an audio or video file into text, on this computer. Writes the text (.txt) and subtitles (.srt, .vtt) beside the file or in out_dir, and returns the language, the files and the start of the text. Any format ffmpeg reads works (mp3, m4a, wav, mp4, mov, webm…).",
    {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Full path to the audio or video file."},
            "language": {"type": "string", "description": "Its language as a code (en, de, el, zh…); leave out to detect it."},
            "model": {"type": "string", "enum": MODELS, "description": "Bigger is better and slower: base for long or quick jobs, small (default) for most, turbo or large-v3 for the best."},
            "formats": {"type": "array", "items": {"type": "string", "enum": ["txt", "srt", "vtt"]}, "description": "Files to write (default txt and srt)."},
            "out_dir": {"type": "string", "description": "Folder for the files (default: beside the recording)."},
            "start": {"type": "number", "description": "Only from this second."},
            "end": {"type": "number", "description": "Only up to this second."},
            "device": {"type": "string", "enum": ["auto", "cpu"], "description": "auto (default): an NVIDIA graphics card when there is one, else the CPU; cpu: the CPU, leaving the card to other work."},
        },
        "required": ["path"],
    },
)
def transcribe(path, language=None, model="small", formats=None, out_dir=None, start=None, end=None, device="auto"):
    global gpu_failed
    src = os.path.expanduser(str(path or "").strip())
    if not os.path.isabs(src):
        raise ToolError(f"Give the full path (from /), not {path!r}.")
    if not os.path.isfile(src):
        raise ToolError(f"There is no file at {src}.")
    if model not in MODELS:
        raise ToolError(f"model is one of {', '.join(MODELS)}.")
    formats = [f for f in (formats or ["txt", "srt"]) if f in ("txt", "srt", "vtt")] or ["txt"]
    dest = os.path.expanduser(out_dir) if out_dir else os.path.dirname(src)
    if not os.path.isabs(dest):
        raise ToolError("out_dir must be a full path.")
    os.makedirs(dest, exist_ok=True)
    began = time.time()
    audio = load_audio(src, start, end)
    if not len(audio):
        raise ToolError("The file has no sound to transcribe (or that part of it is empty).")
    offset = float(start or 0)
    # The graphics card when there is one (and it has not failed); when it fails, the CPU, saying why.
    used = "cuda" if device != "cpu" and not gpu_failed and has_cuda() else "cpu"
    note = None
    try:
        found, info = run_model(model, used, audio, language)
    except Exception as e:  # noqa: BLE001
        if used != "cuda":
            raise
        gpu_failed = f"{type(e).__name__}: {e}"[:300]
        loaded.pop((model, "cuda"), None)
        used = "cpu"
        found, info = run_model(model, used, audio, language)
    if device != "cpu" and gpu_failed and used == "cpu":
        note = f"The graphics card did not work ({gpu_failed}), so it ran on the CPU."
    segs = [(a + offset, b + offset, t) for a, b, t in found]
    if not segs:
        return {"language": info.language, "duration_seconds": round(info.duration, 1), "device": "NVIDIA GPU (CUDA)" if used == "cuda" else "CPU", "text": "", "note": "No speech was found." + (f" {note}" if note else "")}
    stem = os.path.splitext(os.path.basename(src))[0]
    written = []
    text = "\n".join(t for _, _, t in segs)
    if "txt" in formats:
        p = os.path.join(dest, f"{stem}.txt")
        with open(p, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        written.append(p)
    if "srt" in formats:
        p = os.path.join(dest, f"{stem}.srt")
        with open(p, "w", encoding="utf-8") as f:
            for i, (a, b, t) in enumerate(segs, 1):
                f.write(f"{i}\n{stamp(a)} --> {stamp(b)}\n{t}\n\n")
        written.append(p)
    if "vtt" in formats:
        p = os.path.join(dest, f"{stem}.vtt")
        with open(p, "w", encoding="utf-8") as f:
            f.write("WEBVTT\n\n")
            for a, b, t in segs:
                f.write(f"{stamp(a, '.')} --> {stamp(b, '.')}\n{t}\n\n")
        written.append(p)
    words = len(text.split())
    return {
        "language": info.language,
        "language_probability": round(info.language_probability, 2),
        "duration_seconds": round(info.duration, 1),
        "model": model,
        "device": "NVIDIA GPU (CUDA)" if used == "cuda" else "CPU",
        **({"note": note} if note else {}),
        "took_seconds": round(time.time() - began, 1),
        "words": words,
        "files": written,
        "text_start": text[:4000] + ("…" if len(text) > 4000 else ""),
    }


if __name__ == "__main__":
    server.run()
