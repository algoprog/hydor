# Hydor's picture worker, for the picture tools on this computer (server/images/local.ts starts it): it takes the
# background out of pictures (BiRefNet-lite) and erases parts of them (LaMa), with ONNX Runtime on the CPU. It reads
# requests as JSON lines on stdin and answers each on stdout. Pictures come and go as files in a folder the server
# makes for each job, never through the pipe:
#   {"id": 1, "op": "cutout", "model": ".../cutout.onnx", "input": ".../in", "output": ".../out.png"}
#     -> {"id": 1, "status": "loading"} (when the model was not in memory), {"id": 1, "status": "working"},
#        then {"id": 1, "ok": true, "w": 800, "h": 600, "loaded": ["cutout"], ...}
#   {"id": 2, "op": "erase", "model": ".../erase.onnx", "input": ..., "mask": ".../mask.png" or "boxes": [[x, y, w, h]], "output": ...}
#   {"id": 3, "op": "unload", "what": "cutout"}  ->  {"id": 3, "ok": true, "loaded": []}
# "max_bytes" (optional) keeps the PNG under that size: it is made smaller when it would be over.
# Each model loads when it is first asked for and stays until the server says to unload it (after a few idle
# minutes); the worker ends when its input closes. ONNX Runtime runs on the CPU only, on at most 4 threads, with its
# memory arena off, so what a picture took while it was worked on goes back once it is done.
import gc
import json
import os
import sys
import time

THREADS = max(1, min(4, int(os.environ.get('HYDOR_PICTURES_THREADS') or 0) or (os.cpu_count() or 2)))
# The largest picture taken, in pixels (8,000 × 6,000 or so): what is in memory while it is worked on grows with it.
MAX_PIXELS = 50_000_000
# BiRefNet's input: 1024 × 1024, scaled to 0..1, then ImageNet's mean and spread (its preprocessor_config.json).
CUTOUT_SIZE = 1024
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)
# LaMa's input: 512 × 512, the picture in 0..1 and the mask as 0 or 1; it answers in 0..255.
ERASE_SIZE = 512

sessions = {}


class Fail(Exception):
    """Words for the person who asked."""


def say(obj):
    sys.stdout.write(json.dumps(obj) + '\n')
    sys.stdout.flush()


def rss_mb():
    try:
        with open('/proc/self/statm') as f:
            return round(int(f.read().split()[1]) * os.sysconf('SC_PAGE_SIZE') / 2**20)
    except Exception:  # noqa: BLE001 - not Linux
        return None


def peak_mb():
    try:
        import resource

        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return round(peak / 2**20 if sys.platform == 'darwin' else peak / 1024)
    except Exception:  # noqa: BLE001 - Windows
        return None


def give_back():
    """What was freed goes back to the system, not only to Python (glibc keeps it otherwise)."""
    gc.collect()
    if sys.platform.startswith('linux'):
        try:
            import ctypes

            ctypes.CDLL('libc.so.6').malloc_trim(0)
        except Exception:  # noqa: BLE001
            pass


def session(what, path, rid):
    s = sessions.get(what)
    if s is not None:
        return s
    import onnxruntime as ort

    say({'id': rid, 'status': 'loading'})
    so = ort.SessionOptions()
    so.intra_op_num_threads = THREADS
    so.inter_op_num_threads = 1
    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    so.enable_cpu_mem_arena = False
    so.enable_mem_pattern = False
    so.log_severity_level = 3
    # Measured on a CPU: BiRefNet left unoptimised peaks near 6 GB rather than 6.8 GB for a picture, at the cost of
    # 3 more seconds to load; LaMa loads fastest with the basic optimisations, at the same peak.
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL if what == 'cutout' else ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    try:
        s = ort.InferenceSession(path, sess_options=so, providers=['CPUExecutionProvider'])
    except Exception as e:  # noqa: BLE001
        raise Fail(f'The model would not load ({type(e).__name__}: {str(e)[:200]}). Removing the picture tools and setting them up again downloads it afresh.') from e
    sessions[what] = s
    return s


def unload(what):
    if sessions.pop(what, None) is not None:
        give_back()


def open_picture(path):
    """The picture as it is shown (turned as its camera noted), in RGB or RGBA, and its colour profile."""
    from PIL import Image, ImageOps

    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        im = Image.open(path)
        w, h = im.size
    except Image.DecompressionBombError as e:
        raise Fail('The picture is over 50 megapixels: too large to work on here. Make it smaller first.') from e
    except Exception as e:  # noqa: BLE001
        raise Fail('That is not a picture this can open (PNG, JPEG, WebP or GIF).') from e
    if w * h > MAX_PIXELS:
        raise Fail(f'The picture is {w}×{h}: over 50 megapixels, too large to work on here. Make it smaller first.')
    icc = im.info.get('icc_profile')
    try:
        im = ImageOps.exif_transpose(im)
    except Exception:  # noqa: BLE001 - a broken EXIF block: as it is stored
        pass
    see_through = im.mode in ('RGBA', 'LA', 'PA', 'La', 'RGBa') or (im.mode == 'P' and 'transparency' in im.info)
    return im.convert('RGBA' if see_through else 'RGB'), icc


def save_png(im, path, icc, max_bytes):
    """Saves the PNG; over max_bytes, it is squeezed harder, then made smaller until it fits. Its size, and whether it was made smaller."""
    from PIL import Image

    kw = {'icc_profile': icc} if icc else {}
    im.save(path, 'PNG', compress_level=6, **kw)
    size = os.path.getsize(path)
    if not max_bytes or size <= max_bytes:
        return im.size, False
    im.save(path, 'PNG', optimize=True, **kw)
    size = os.path.getsize(path)
    out = im
    while size > max_bytes and min(out.size) > 16:
        f = max(0.5, min(0.95, (max_bytes / size) ** 0.5 * 0.95))
        out = out.resize((max(1, round(out.width * f)), max(1, round(out.height * f))), Image.Resampling.LANCZOS)
        out.save(path, 'PNG', optimize=True, **kw)
        size = os.path.getsize(path)
    return out.size, out is not im


def cutout(req, rid):
    import numpy as np
    from PIL import Image

    im, icc = open_picture(req['input'])
    s = session('cutout', req['model'], rid)
    say({'id': rid, 'status': 'working'})
    t = time.time()
    # A picture with see-through parts is shown to the model on white, as a person would see it.
    view = Image.alpha_composite(Image.new('RGBA', im.size, (255, 255, 255, 255)), im).convert('RGB') if im.mode == 'RGBA' else im
    x = np.asarray(view.resize((CUTOUT_SIZE, CUTOUT_SIZE), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0
    del view
    x = ((x - np.array(MEAN, dtype=np.float32)) / np.array(STD, dtype=np.float32)).transpose(2, 0, 1)[None]
    logits = s.run(None, {s.get_inputs()[0].name: np.ascontiguousarray(x, dtype=np.float32)})[0][0, 0]
    del x
    mask = (1.0 / (1.0 + np.exp(-logits.astype(np.float32)))).astype(np.float32)
    # The mask back to the picture's size; the faintest and the nearly whole made exact, so the background is clear.
    alpha = np.asarray(Image.fromarray(mask, 'F').resize(im.size, Image.Resampling.BILINEAR), dtype=np.float32) * 255.0
    alpha = np.clip(alpha + 0.5, 0, 255).astype(np.uint8)
    alpha[alpha <= 2] = 0
    alpha[alpha >= 253] = 255
    out = im.convert('RGBA')
    if im.mode == 'RGBA':
        alpha = (alpha.astype(np.uint16) * np.asarray(im.getchannel('A'), dtype=np.uint16) // 255).astype(np.uint8)
    # The picture's own pixels as they were; only how see-through each is changes.
    out.putalpha(Image.fromarray(alpha, 'L'))
    del mask, alpha, logits
    run = time.time() - t
    (w, h), scaled = save_png(out, req['output'], icc, req.get('max_bytes'))
    return {'w': w, 'h': h, 'scaled': scaled, 'ms': round(run * 1000)}


def read_mask(req, size):
    """The mask at the picture's size, 0 to 255: white (and not see-through) where to erase."""
    import numpy as np
    from PIL import Image, ImageDraw

    w, h = size
    if req.get('boxes'):
        mk = Image.new('L', (w, h), 0)
        d = ImageDraw.Draw(mk)
        for b in req['boxes']:
            x, y, bw, bh = (int(round(float(v))) for v in b[:4])
            if bw > 0 and bh > 0:
                d.rectangle((x, y, x + bw - 1, y + bh - 1), fill=255)
        return np.asarray(mk, dtype=np.uint8)
    try:
        src = Image.open(req['mask'])
        src.load()
    except Exception as e:  # noqa: BLE001
        raise Fail('The mask is not a picture this can open (a PNG, white where to erase).') from e
    if src.mode in ('RGBA', 'LA', 'PA') or (src.mode == 'P' and 'transparency' in src.info):
        src = src.convert('RGBA')
        mk = np.asarray(src.convert('L'), dtype=np.uint16) * np.asarray(src.getchannel('A'), dtype=np.uint16) // 255
        src = Image.fromarray(mk.astype(np.uint8), 'L')
    else:
        src = src.convert('L')
    if src.size != (w, h):
        # Drawn on the picture as it is shown, perhaps smaller: the same shape, give or take a pixel's rounding.
        if abs(src.size[0] / src.size[1] - w / h) > 0.03 * (w / h) + 2 / src.size[1]:
            raise Fail(f'The mask is not the picture’s shape ({src.size[0]}×{src.size[1]} for a picture of {w}×{h}): draw it over the picture as it is shown.')
        src = src.resize((w, h), Image.Resampling.BILINEAR)
    return np.asarray(src, dtype=np.uint8)


def inpaint(s, crop, hole):
    """LaMa on a square crop (any size): the crop at 512, the hole (True: to fill) at 512, the answer back at the crop's size."""
    import numpy as np
    from PIL import Image

    n = crop.shape[0]
    x = np.asarray(Image.fromarray(crop).resize((ERASE_SIZE, ERASE_SIZE), Image.Resampling.BICUBIC if n < ERASE_SIZE else Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
    m = np.asarray(Image.fromarray(hole.astype(np.uint8) * 255, 'L').resize((ERASE_SIZE, ERASE_SIZE), Image.Resampling.BILINEAR), dtype=np.float32) > 0
    m = m.astype(np.float32)
    x = x * (1.0 - m[..., None])
    out = s.run(None, {'image': np.ascontiguousarray(x.transpose(2, 0, 1)[None]), 'mask': np.ascontiguousarray(m[None, None])})[0][0]
    fill = np.clip(out.transpose(1, 2, 0) + 0.5, 0, 255).astype(np.uint8)
    return np.asarray(Image.fromarray(fill, 'RGB').resize((n, n), Image.Resampling.LANCZOS if n > ERASE_SIZE else Image.Resampling.BICUBIC), dtype=np.uint8)


def erase(req, rid):
    import numpy as np
    from PIL import Image, ImageFilter

    im, icc = open_picture(req['input'])
    W, H = im.size
    soft = read_mask(req, (W, H))
    hole = soft >= 16
    rows, cols = hole.any(axis=1), hole.any(axis=0)
    if not rows.any():
        raise Fail(f'The boxes are outside the picture, which is {W}×{H} pixels.' if req.get('boxes') else 'The mask is empty: paint over what to take away.')
    y0, y1 = int(np.argmax(rows)), int(H - 1 - np.argmax(rows[::-1]))
    x0, x1 = int(np.argmax(cols)), int(W - 1 - np.argmax(cols[::-1]))
    s = session('erase', req['model'], rid)
    say({'id': rid, 'status': 'working'})
    t = time.time()
    # A square around the hole with room for what surrounds it (LaMa fills from what it sees), within the picture.
    side = max(x1 - x0 + 1, y1 - y0 + 1)
    want = side + 2 * max(32, round(side * 0.4))
    cw, ch = min(want, W), min(want, H)
    left = min(max(0, round((x0 + x1 + 1) / 2 - cw / 2)), W - cw)
    top = min(max(0, round((y0 + y1 + 1) / 2 - ch / 2)), H - ch)
    pix = np.array(im, dtype=np.uint8)
    region = pix[top : top + ch, left : left + cw]
    n = max(cw, ch)
    # A crop narrower one way is mirrored out to a square, so the picture is not stretched.
    py, px = ((n - ch) // 2, n - ch - (n - ch) // 2), ((n - cw) // 2, n - cw - (n - cw) // 2)
    sq = np.pad(region[..., :3], (py, px, (0, 0)), mode='symmetric')
    sq_hole = np.pad(hole[top : top + ch, left : left + cw], (py, px), mode='constant')
    fill = inpaint(s, sq, sq_hole)[py[0] : py[0] + ch, px[0] : px[0] + cw]
    a_fill = None
    if pix.shape[2] == 4 and (region[..., 3] < 255).any():
        # See-through parts: how see-through is filled in from around it too.
        a_sq = np.pad(region[..., 3], (py, px), mode='symmetric')
        a_fill = inpaint(s, np.repeat(a_sq[..., None], 3, axis=2), sq_hole)[py[0] : py[0] + ch, px[0] : px[0] + cw].mean(axis=2)
    # Only where the mask is: its edge softened inward, so nothing outside it changes.
    r = max(1, min(4, round(min(W, H) / 400)))
    m = soft[top : top + ch, left : left + cw]
    blurred = np.asarray(Image.fromarray(m, 'L').filter(ImageFilter.GaussianBlur(r)), dtype=np.float32)
    a = np.minimum(m.astype(np.float32), blurred)[..., None] / 255.0
    mixed = np.clip(region[..., :3] * (1.0 - a) + fill * a + 0.5, 0, 255).astype(np.uint8)
    region[..., :3] = np.where(a > 0, mixed, region[..., :3])
    if a_fill is not None:
        mixed_a = np.clip(region[..., 3] * (1.0 - a[..., 0]) + a_fill * a[..., 0] + 0.5, 0, 255).astype(np.uint8)
        region[..., 3] = np.where(a[..., 0] > 0, mixed_a, region[..., 3])
    run = time.time() - t
    out = Image.fromarray(pix, im.mode)
    (w, h), scaled = save_png(out, req['output'], icc, req.get('max_bytes'))
    return {'w': w, 'h': h, 'scaled': scaled, 'ms': round(run * 1000), 'box': [x0, y0, x1 - x0 + 1, y1 - y0 + 1]}


def main():
    import numpy  # noqa: F401 - what every job needs, loaded once
    import onnxruntime
    import PIL

    onnxruntime.set_default_logger_severity(3)
    say({'ready': True, 'threads': THREADS, 'rss': rss_mb(), 'onnxruntime': onnxruntime.__version__, 'pillow': PIL.__version__})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get('id')
            op = req.get('op')
            if op == 'unload':
                unload(req.get('what'))
                out = {}
            elif op == 'cutout':
                out = cutout(req, rid)
            elif op == 'erase':
                out = erase(req, rid)
            elif op == 'ping':
                out = {}
            else:
                raise Fail(f'No such job: {op}')
            give_back()
            say({'id': rid, 'ok': True, **out, 'loaded': sorted(sessions), 'rss': rss_mb(), 'peak': peak_mb()})
        except Fail as e:
            give_back()
            say({'id': rid, 'error': str(e)[:400], 'loaded': sorted(sessions), 'rss': rss_mb()})
        except MemoryError:
            give_back()
            say({'id': rid, 'error': 'There was not enough memory for it on this computer.', 'memory': True, 'loaded': sorted(sessions), 'rss': rss_mb()})
        except Exception as e:  # noqa: BLE001 - every failure goes back to the server as an answer
            give_back()
            text = f'{type(e).__name__}: {e}'
            say({'id': rid, 'error': text[:400], 'memory': 'allocat' in text.lower() or 'bad_alloc' in text, 'loaded': sorted(sessions), 'rss': rss_mb()})


if __name__ == '__main__':
    try:
        main()
    except (BrokenPipeError, KeyboardInterrupt):
        pass
