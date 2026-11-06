# Hydor's picture worker, for the picture tools on this computer (server/images/local.ts starts it): it takes the
# background out of pictures (BiRefNet-lite), erases parts of them (LaMa) and makes them larger (Real-ESRGAN), with ONNX
# Runtime. It reads
# requests as JSON lines on stdin and answers each on stdout. Pictures come and go as files in a folder the server
# makes for each job, never through the pipe:
#   {"id": 1, "op": "cutout", "model": ".../cutout.onnx", "input": ".../in", "output": ".../out.png"}
#     -> {"id": 1, "status": "loading"} (when the model was not in memory), {"id": 1, "status": "working"},
#        then {"id": 1, "ok": true, "w": 800, "h": 600, "device": "cuda", "loaded": ["cutout"], "devices": {...}, ...}
#   {"id": 2, "op": "erase", "model": ".../erase.onnx", "input": ..., "mask": ".../mask.png" or "boxes": [[x, y, w, h]], "output": ...}
#   {"id": 3, "op": "measure", "input": ..., "mask" or "boxes", "small": ".../hole.bin"}  ->  how large the hole is, how
#     detailed things are around it, and the hole at most 256 pixels across (raw bytes, row after row) in "small"
#   {"id": 4, "op": "upscale", "model": ..., "input": ..., "output": ..., "scale": 2, "tiles": [[x, y, w, h, px, py, pw, ph], ...]}
#     -> {"id": 4, "status": "working", "done": 3, "of": 12} after each tile, then {"id": 4, "ok": true, "w": ..., "h": ...}
#   {"id": 5, "op": "unload", "what": "cutout"}  ->  {"id": 5, "ok": true, "loaded": []}
# "max_bytes" (optional) keeps the PNG under that size: it is made smaller when it would be over. A cutout given
# "small" also writes its mask there, at most 512 pixels across, for the server to judge how sure it was.
# Each model loads when it is first asked for and stays until the server says to unload it (after a few idle
# minutes); the worker ends when its input closes.
#
# Where the models run: on the graphics card the server names (HYDOR_PICTURES_DEVICE: "cuda", an NVIDIA GPU with ONNX
# Runtime's GPU build; "coreml", a Mac's GPU and Neural Engine through Core ML, given a "cache" folder per model for
# what Core ML compiles), else on the CPU; a job's "device": "cpu" keeps its model there. A model the graphics card
# fails (its provider missing, its session not made, an error while it works, numbers that are not finite) is made
# again on the CPU at once and stays there; its answer says so ("fell_back": why). Answers say where each model ran
# ("device", and "devices" for those in memory). On the CPU, ONNX Runtime uses at most 4 threads, with its memory arena
# off, so what a picture took while it was worked on goes back once it is done.
import gc
import json
import os
import sys
import time

# The answers go out on a copy of stdout, and stdout itself goes to stderr: whatever a library prints (ONNX Runtime
# saying it fell back from a GPU, NVIDIA's libraries loading) never mixes with them.
OUT = os.fdopen(os.dup(1), 'w', encoding='utf-8')
os.dup2(2, 1)
sys.stdout = sys.stderr

THREADS = max(1, min(4, int(os.environ.get('HYDOR_PICTURES_THREADS') or 0) or (os.cpu_count() or 2)))
DEVICE = os.environ.get('HYDOR_PICTURES_DEVICE') or 'cpu'
GPU_PROVIDERS = {'cuda': 'CUDAExecutionProvider', 'coreml': 'CoreMLExecutionProvider'}
DEVICE_OF = {'CUDAExecutionProvider': 'cuda', 'CoreMLExecutionProvider': 'coreml'}
# The largest picture taken, in pixels (8,000 × 6,000 or so): what is in memory while it is worked on grows with it.
MAX_PIXELS = 50_000_000
# BiRefNet's input: its side as the model says (the 512 × 512 export), scaled to 0..1, then ImageNet's mean and spread.
CUTOUT_SIZE = 512
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)
# LaMa's input: 512 × 512, the picture in 0..1 and the mask as 0 or 1; it answers in 0..255.
ERASE_SIZE = 512

sessions = {}
# Where each model in memory runs ("cuda", "coreml" or "cpu"), and why the graphics card failed one, until it is said.
where = {}
moved = {}
cuda_ready = False


class Fail(Exception):
    """Words for the person who asked."""


def say(obj):
    OUT.write(json.dumps(obj) + '\n')
    OUT.flush()


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


def options():
    import onnxruntime as ort

    so = ort.SessionOptions()
    so.intra_op_num_threads = THREADS
    so.inter_op_num_threads = 1
    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    so.enable_cpu_mem_arena = False
    so.enable_mem_pattern = False
    so.log_severity_level = 3
    # Measured on a CPU: both load fastest with the basic optimisations (BiRefNet at 512 in 1.4 s, not 7 s unoptimised),
    # at about the same peak (BiRefNet 1.9 GB for a picture, LaMa 0.9 GB).
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    # LaMa's export leaves its batch size free; fixed at 1 (all it is ever given), its shapes are known and far more of
    # it folds away: measured on a CPU, 2,841 operations rather than 7,917, loaded in 1.5 s rather than 8 at a lower
    # peak (0.7 GB, not 0.9), with exactly the same output; and a graphics card gets it in far fewer pieces.
    so.add_free_dimension_override_by_name('batch', 1)
    return so


def prepare_cuda():
    """NVIDIA's CUDA and cuDNN libraries, from the packages that came with ONNX Runtime's GPU build, loaded once."""
    global cuda_ready
    if cuda_ready:
        return
    cuda_ready = True
    import onnxruntime as ort

    try:
        if hasattr(ort, 'preload_dlls'):
            ort.preload_dlls()
    except Exception as e:  # noqa: BLE001 - the session then fails, and the model runs on the CPU
        sys.stderr.write(f'preloading CUDA: {type(e).__name__}: {e}\n')


def providers_for(device, cache):
    """The providers to ask for, the graphics card's first (with what it is asked to do), or why not."""
    import onnxruntime as ort

    want = GPU_PROVIDERS.get(device)
    if not want:
        return ['CPUExecutionProvider'], None
    if want not in ort.get_available_providers():
        return ['CPUExecutionProvider'], f'this ONNX Runtime ({ort.__version__}) has no {want}'
    if device == 'cuda':
        prepare_cuda()
        # Memory taken as asked rather than in doubling steps, and quick choices of how to convolve (this model loads
        # for a few minutes at a time, so a long search for the fastest way would be paid again and again).
        return [('CUDAExecutionProvider', {'device_id': 0, 'arena_extend_strategy': 'kSameAsRequested', 'cudnn_conv_algo_search': 'HEURISTIC'}), 'CPUExecutionProvider'], None
    # Core ML's newer model format, on everything it has (GPU, Neural Engine, CPU); what it compiles is kept in the
    # data folder (from ONNX Runtime 1.21), so a model compiles once rather than each time it loads.
    opts = {'ModelFormat': 'MLProgram', 'MLComputeUnits': 'ALL'}
    try:
        newer = tuple(int(x) for x in ort.__version__.split('.')[:2]) >= (1, 21)
    except ValueError:
        newer = False
    if cache and newer:
        os.makedirs(cache, exist_ok=True)
        opts['ModelCacheDirectory'] = cache
    return [('CoreMLExecutionProvider', opts), 'CPUExecutionProvider'], None


def session(what, req, rid):
    s = sessions.get(what)
    if s is not None:
        return s
    import onnxruntime as ort

    say({'id': rid, 'status': 'loading'})
    path = req['model']
    providers, why = providers_for('cpu' if req.get('device') == 'cpu' else DEVICE, req.get('cache'))
    s = None
    if providers[0] != 'CPUExecutionProvider':
        try:
            s = ort.InferenceSession(path, sess_options=options(), providers=providers)
            # ONNX Runtime goes on with the CPU by itself when a provider cannot start.
            if s.get_providers()[0] not in DEVICE_OF:
                why = f'{providers[0][0]} did not start'
        except Exception as e:  # noqa: BLE001
            s = None
            why = f'{type(e).__name__}: {str(e)[:200]}'
    if why:
        moved[what] = why
    if s is None:
        try:
            s = ort.InferenceSession(path, sess_options=options(), providers=['CPUExecutionProvider'])
        except Exception as e:  # noqa: BLE001
            raise Fail(f'The model would not load ({type(e).__name__}: {str(e)[:200]}). Removing the picture tools and setting them up again downloads it afresh.') from e
    sessions[what] = s
    where[what] = DEVICE_OF.get(s.get_providers()[0], 'cpu')
    return s


def infer(what, req, rid, feeds):
    """The model's outputs for these inputs; when the graphics card fails it, it is made again on the CPU and runs there."""
    import numpy as np

    s = session(what, req, rid)
    if where.get(what) == 'cpu':
        return s.run(None, feeds)
    try:
        out = s.run(None, feeds)
        if all(np.isfinite(o).all() for o in out):
            return out
        why = 'it gave numbers that are not finite'
    except Exception as e:  # noqa: BLE001
        why = f'{type(e).__name__}: {str(e)[:200]}'
    moved[what] = f'on {where[what]}: {why}'
    del s
    unload(what)
    return session(what, {**req, 'device': 'cpu'}, rid).run(None, feeds)


def unload(what):
    where.pop(what, None)
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


def write_small(arr, path, side):
    """A mask made small (its long side at most `side` pixels), written as raw bytes row after row; its size."""
    import numpy as np
    from PIL import Image

    h, w = arr.shape
    s = min(1.0, side / max(w, h))
    mw, mh = max(1, round(w * s)), max(1, round(h * s))
    small = np.asarray(Image.fromarray(arr, 'L').resize((mw, mh), Image.Resampling.BILINEAR), dtype=np.uint8)
    with open(path, 'wb') as f:
        f.write(small.tobytes())
    return [mw, mh]


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
    s = session('cutout', req, rid)
    say({'id': rid, 'status': 'working'})
    t = time.time()
    # A picture with see-through parts is shown to the model on white, as a person would see it.
    view = Image.alpha_composite(Image.new('RGBA', im.size, (255, 255, 255, 255)), im).convert('RGB') if im.mode == 'RGBA' else im
    shape = s.get_inputs()[0].shape
    side = shape[-1] if isinstance(shape[-1], int) else CUTOUT_SIZE
    name = s.get_inputs()[0].name
    del s
    x = np.asarray(view.resize((side, side), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0
    del view
    x = ((x - np.array(MEAN, dtype=np.float32)) / np.array(STD, dtype=np.float32)).transpose(2, 0, 1)[None]
    logits = infer('cutout', req, rid, {name: np.ascontiguousarray(x, dtype=np.float32)})[0][0, 0].astype(np.float32)
    del x
    # Logits (the export's): made 0 to 1; a model that answers 0 to 1 already is taken as it is.
    mask = logits if logits.min() >= 0 and logits.max() <= 1 else (1.0 / (1.0 + np.exp(-logits))).astype(np.float32)
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
    small = write_small(alpha, req['small'], 512) if req.get('small') else None
    del mask, alpha, logits
    run = time.time() - t
    (w, h), scaled = save_png(out, req['output'], icc, req.get('max_bytes'))
    return {'w': w, 'h': h, 'scaled': scaled, 'ms': round(run * 1000), **({'small': small} if small else {})}


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


def measure(req, rid):
    """How large the hole to fill is, and how detailed things are around it (the share of strong edges in a ring around
    it, the picture seen at most 512 pixels across): what the server needs to choose between LaMa and an image model."""
    import numpy as np
    from PIL import Image, ImageFilter

    im, _ = open_picture(req['input'])
    W, H = im.size
    hole = (read_mask(req, (W, H)) >= 16).astype(np.uint8) * 255
    if not hole.any():
        raise Fail(f'The boxes are outside the picture, which is {W}×{H} pixels.' if req.get('boxes') else 'The mask is empty: paint over what to take away.')
    small = write_small(hole, req['small'], 256)
    s = min(1.0, 512 / max(W, H))
    gw, gh = max(1, round(W * s)), max(1, round(H * s))
    a = np.asarray(im.convert('L').resize((gw, gh), Image.Resampling.BILINEAR).filter(ImageFilter.GaussianBlur(1)), dtype=np.int16)
    g = np.zeros_like(a)
    g[:, 1:] = np.abs(np.diff(a, axis=1))
    g[1:, :] = np.maximum(g[1:, :], np.abs(np.diff(a, axis=0)))
    inside = np.asarray(Image.fromarray(hole, 'L').resize((gw, gh), Image.Resampling.BILINEAR)) > 0
    r = max(3, round(0.04 * max(gw, gh)))
    near = np.asarray(Image.fromarray(inside.astype(np.uint8) * 255, 'L').filter(ImageFilter.BoxBlur(r))) > 0
    ring = near & ~inside
    # Measured: words around a hole come to about 0.15; walls, sky, grass, bricks, noise and a photo's edges under 0.02.
    detail = float((g[ring] > 24).mean()) if ring.sum() >= 16 else 0.0
    return {'small': small, 'area': round(float(hole.mean()) / 255, 5), 'detail': round(detail, 4), 'size': [W, H]}


def inpaint(run, crop, hole):
    """LaMa (`run`: its inputs to its outputs) on a square crop (any size): the crop at 512, the hole (True: to fill)
    at 512, the answer back at the crop's size."""
    import numpy as np
    from PIL import Image

    n = crop.shape[0]
    x = np.asarray(Image.fromarray(crop).resize((ERASE_SIZE, ERASE_SIZE), Image.Resampling.BICUBIC if n < ERASE_SIZE else Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
    m = np.asarray(Image.fromarray(hole.astype(np.uint8) * 255, 'L').resize((ERASE_SIZE, ERASE_SIZE), Image.Resampling.BILINEAR), dtype=np.float32) > 0
    m = m.astype(np.float32)
    x = x * (1.0 - m[..., None])
    out = run({'image': np.ascontiguousarray(x.transpose(2, 0, 1)[None]), 'mask': np.ascontiguousarray(m[None, None])})[0][0]
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
    session('erase', req, rid)
    say({'id': rid, 'status': 'working'})
    t = time.time()

    def run(feeds):
        return infer('erase', req, rid, feeds)

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
    fill = inpaint(run, sq, sq_hole)[py[0] : py[0] + ch, px[0] : px[0] + cw]
    a_fill = None
    if pix.shape[2] == 4 and (region[..., 3] < 255).any():
        # See-through parts: how see-through is filled in from around it too.
        a_sq = np.pad(region[..., 3], (py, px), mode='symmetric')
        a_fill = inpaint(run, np.repeat(a_sq[..., None], 3, axis=2), sq_hole)[py[0] : py[0] + ch, px[0] : px[0] + cw].mean(axis=2)
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


def bleed(im):
    """A picture with see-through parts as RGB, the colour under its see-through pixels taken from the kept ones nearby
    (their colour spread out, as much as they are there), so the upscaler draws no dark fringe round its edges."""
    import numpy as np
    from PIL import Image, ImageFilter

    a = np.asarray(im.getchannel('A'), dtype=np.float32) / 255.0
    rgb = np.asarray(im.convert('RGB'), dtype=np.float32)
    if a.min() >= 0.999:
        return im.convert('RGB')
    r = max(4, round(max(im.size) / 64))
    pre = Image.fromarray(np.clip(rgb * a[..., None] + 0.5, 0, 255).astype(np.uint8), 'RGB').filter(ImageFilter.GaussianBlur(r))
    cover = Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(r))
    pa = np.asarray(cover, dtype=np.float32)[..., None] / 255.0
    spread = np.asarray(pre, dtype=np.float32) / np.maximum(pa, 1e-3)
    mean = (rgb * a[..., None]).sum(axis=(0, 1)) / max(1e-3, float(a.sum()))
    spread = np.where(pa > 0.01, spread, mean)
    out = rgb * a[..., None] + spread * (1.0 - a[..., None])
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), 'RGB')


def upscale(req, rid):
    """The picture made `scale` (2 or 4) times larger, a tile at a time (each shown to the model with a margin that is
    then dropped, so no seam shows); see-through parts made larger smoothly. Real-ESRGAN's general model makes 4×; for
    2× each tile's answer is brought down by averaging its pixels in twos."""
    import numpy as np
    from PIL import Image

    im, icc = open_picture(req['input'])
    scale = int(req.get('scale') or 2)
    if scale not in (2, 4):
        raise Fail('The picture can be made 2× or 4× larger.')
    W, H = im.size
    alpha = im.getchannel('A') if im.mode == 'RGBA' else None
    src = np.asarray(bleed(im) if alpha is not None else im.convert('RGB'), dtype=np.uint8)
    del im
    # Opened as the other models are (on the graphics card when there is one); infer() takes a tile to the CPU if the card fails it.
    name = session('upscale', req, rid).get_inputs()[0].name
    tiles = req.get('tiles') or [[0, 0, W, H, 0, 0, W, H]]
    out = np.zeros((H * scale, W * scale, 3), dtype=np.uint8)
    t = time.time()
    say({'id': rid, 'status': 'working', 'done': 0, 'of': len(tiles)})
    for i, (x, y, w, h, px, py, pw, ph) in enumerate(tiles):
        part = src[py : py + ph, px : px + pw].astype(np.float32) / 255.0
        got = infer('upscale', req, rid, {name: np.ascontiguousarray(part.transpose(2, 0, 1)[None])})[0][0]
        got = np.clip(got, 0.0, 1.0).transpose(1, 2, 0)
        if scale == 2:
            got = got.reshape(got.shape[0] // 2, 2, got.shape[1] // 2, 2, 3).mean(axis=(1, 3))
        k = scale
        cx, cy = (x - px) * k, (y - py) * k
        out[y * k : (y + h) * k, x * k : (x + w) * k] = (got[cy : cy + h * k, cx : cx + w * k] * 255.0 + 0.5).astype(np.uint8)
        del part, got
        say({'id': rid, 'status': 'working', 'done': i + 1, 'of': len(tiles)})
    run = time.time() - t
    big = Image.fromarray(out, 'RGB')
    del out, src
    if alpha is not None:
        big.putalpha(alpha.resize(big.size, Image.Resampling.LANCZOS))
    (w, h), scaled = save_png(big, req['output'], icc, req.get('max_bytes'))
    return {'w': w, 'h': h, 'scaled': scaled, 'ms': round(run * 1000)}


def main():
    import numpy  # noqa: F401 - what every job needs, loaded once
    import onnxruntime
    import PIL

    onnxruntime.set_default_logger_severity(3)
    say({'ready': True, 'threads': THREADS, 'rss': rss_mb(), 'onnxruntime': onnxruntime.__version__, 'pillow': PIL.__version__, 'device': DEVICE, 'providers': onnxruntime.get_available_providers()})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        op = None
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
            elif op == 'measure':
                out = measure(req, rid)
            elif op == 'upscale':
                out = upscale(req, rid)
            elif op == 'ping':
                out = {}
            else:
                raise Fail(f'No such job: {op}')
            give_back()
            say({'id': rid, 'ok': True, **out, **ran_on(op), 'rss': rss_mb(), 'peak': peak_mb()})
        except Fail as e:
            give_back()
            say({'id': rid, 'error': str(e)[:400], **ran_on(op), 'rss': rss_mb()})
        except MemoryError:
            give_back()
            say({'id': rid, 'error': 'There was not enough memory for it on this computer.', 'memory': True, **ran_on(op), 'rss': rss_mb()})
        except Exception as e:  # noqa: BLE001 - every failure goes back to the server as an answer
            give_back()
            text = f'{type(e).__name__}: {e}'
            say({'id': rid, 'error': text[:400], 'memory': 'allocat' in text.lower() or 'bad_alloc' in text, **ran_on(op), 'rss': rss_mb()})


def ran_on(op):
    """What an answer says of where the models run: the models in memory and where each is, where this job's model
    ran, and why the graphics card failed it, when it did."""
    out = {'loaded': sorted(sessions), 'devices': {k: where.get(k, 'cpu') for k in sessions}}
    if op in ('cutout', 'erase', 'upscale'):
        if op in where:
            out['device'] = where[op]
        if op in moved:
            out['fell_back'] = moved.pop(op)
    return out


if __name__ == '__main__':
    try:
        main()
    except (BrokenPipeError, KeyboardInterrupt):
        pass
