# Memory's embeddings: calibration and checks

Memory's search by meaning (`server/memory/embed.ts`, `vectors.ts`, `search.ts`) runs
[lightonai/mDenseOn](https://huggingface.co/lightonai/mDenseOn) (307M parameters, 768 dimensions, nine languages,
Apache 2.0) on the user's own computer and keeps each note's vector in **4 bits a dimension** (384 bytes), on 16
levels per dimension fitted once (`server/memory/codebook.ts`). These scripts made that codebook and checked it.
Results below are from 2026-10-31.

## Reproduce

```bash
uv venv --python 3.12 /tmp/memeval/venv
uv pip install --python /tmp/memeval/venv/bin/python --torch-backend=auto torch "transformers>=5.6" "sentence-transformers>=5.4" datasets numpy
P=/tmp/memeval/venv/bin/python; S=scripts/memory-embeddings; O=/tmp/memeval/out; D=/tmp/memeval/data
$P -I $S/embed.py $O $D fp16                           # calibration texts and ten benchmarks (GPU: minutes)
$P -I $S/quant.py $O                                   # quantizers fitted on the calibration set, scored on the benchmarks
$P -I $S/make_codebook.py $O server/memory/codebook.ts
$P -I $S/texts.py $O $D /tmp/memeval/work && $P -I $S/hybrid.py $O /tmp/memeval/work    # words and meaning fused
HYDOR_EMBED_MODEL_DIR=<the model's folder> $P -I $S/worker_check.py <python with onnxruntime> server/memory/embed_worker.py $O $D   # the app's worker
$P -I $S/onnx_export.py /tmp/memeval/model.onnx                                       # the worker's model: the export (needs onnx, onnxscript, onnxruntime)
$P -I $S/onnx_quantize.py /tmp/memeval/model.onnx /tmp/memeval/model_q8.onnx          # and its 8-bit build
```

Run the CPU-heavy steps inside a memory cap on a shared machine
(`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 nice -n 10 …`).

**Calibration set:** 36,000 texts, none from the benchmarks: 2,000 SQuAD paragraphs and 2,000 questions in each
of the model's nine languages (en, fr, de, it, es, pt, sv, no, ar), from LightOn's fine-tuning data. 90% fit the
levels; 10% measure reconstruction error.

## 4 bits a dimension is as good as full precision

nDCG@10 change from float32 vectors, in points (95% bootstrap interval over queries for int4); the query stays
in full precision, as in the app.

| Set | float32 | int8 | int4, fitted levels, renormalized | top-10 overlap | int4 without renormalizing | binary |
|---|---|---|---|---|---|---|
| SciFact | 74.36 | +0.15 | +0.28 [−0.41, +0.90] | 0.948 | +0.01 | −2.15 |
| NFCorpus | 37.48 | −0.08 | +0.12 [−0.22, +0.45] | 0.936 | +0.18 | −2.12 |
| ArguAna | 55.50 | +0.02 | +0.11 [−0.31, +0.52] | 0.968 | −0.15 | −3.20 |
| SciDocs | 21.48 | −0.01 | −0.27 [−0.46, −0.08] | 0.946 | −0.20 | −1.86 |
| FiQA | 51.58 | −0.06 | −0.11 [−0.45, +0.22] | 0.944 | −0.18 | −4.78 |
| MIRACL fr | 56.21 | +0.19 | −0.20 [−0.80, +0.39] | 0.950 | −0.91 | −5.81 |
| MIRACL de | 54.52 | −0.04 | −0.20 [−0.84, +0.46] | 0.951 | −0.58 | −5.30 |
| MIRACL es | 54.87 | −0.04 | −0.09 [−0.40, +0.23] | 0.950 | −0.29 | −4.25 |
| MIRACL ar | 73.85 | −0.06 | −0.13 [−0.42, +0.16] | 0.957 | −0.29 | −5.30 |
| Quora | 88.90 | −0.00 | −0.05 [−0.13, +0.02] | 0.960 | −0.02 | −1.64 |
| **Mean** | | **+0.01** | **−0.05** (worst −0.27) | | −0.24 | −3.64 |

- Levels fitted per dimension by Lloyd-Max (1-D k-means) beat evenly spaced ones (held-out error 0.0059 against
  0.0070 at the best clipping, 0.0157 from min to max); a random rotation first did not help (0.0059).
- Dividing each score by the stored vector's length (it is not quite 1 after quantizing) took the mean loss from
  −0.24 to −0.05. It costs nothing at search time: the length comes from a fixed table, once per vector.
- int4 is within noise on nine of ten sets; SciDocs loses a significant 0.27. int8 (768 bytes) is lossless
  everywhere, if that matters more than half the size.
- Levels fitted on each benchmark's own documents did no better than the calibration set's (mean −0.21 without
  renormalizing), so the fixed codebook generalizes.

## The worker: ONNX Runtime, in 8 bits

Since 0.49.0 the app's worker runs [algoprog/mDenseOn-ONNX](https://huggingface.co/algoprog/mDenseOn-ONNX): the model
exported to ONNX (`onnx_export.py`: exactly, cosine 1.000000 to PyTorch in float32 at 5 to 512 tokens, alone and in
batches), then its 88 weight matrices in 8 bits through ONNX Runtime's `MatMulNBits` (blocks of 32, symmetric) and its
256k-word table as int8 rows with a scale each (`onnx_quantize.py`), the arithmetic in float32. With Hugging Face's
tokenizer (the same ids as Transformers'), ONNX Runtime and NumPy, and no PyTorch:

| | PyTorch (until 0.48), CPU | ONNX Runtime, 8 bits, CPU |
|---|---|---|
| Installed | about 1 GB (5 GB with CUDA), and the model 1.2 GB | about 150 MB, and the model 340 MB |
| Start, model cached | 3.2–3.4 s (16 s on a busy machine) | about 1 s |
| Memory once loaded | 1.43 GB (2.4 GB at most while loading) | 0.55 GB, 1.04 GB at most with long texts |
| A query | 20–23 ms | 31–38 ms |
| A 512-token text | about 0.3 s | 0.2 s |

(4 threads; the 8-bit times from a fresh process with the files in the page cache.)

nDCG@10 on the whole of SciFact and NFCorpus, with the float32 export as the reference (95% bootstrap intervals):

| | SciFact | NFCorpus |
|---|---|---|
| float32 (= PyTorch float32) | 74.35 | 37.40 |
| PyTorch as the worker ran it (word table fp16) | +0.00 | +0.08 [−0.02, +0.20] |
| 8 bits | −0.10 [−0.40, +0.09] | +0.19 [+0.01, +0.40] |
| Notes embedded by the PyTorch worker, queries in 8 bits | +0.20 [−0.03, +0.51] | +0.20 [+0.03, +0.40] |

The 8-bit vectors are within cosine 0.998 of the PyTorch worker's (mean 0.9995), so notes and messages embedded before
stay as they are: the vectors keep their model name, and nothing is embedded again. The GPU paths went with PyTorch:
on a CPU the 8-bit model starts faster than PyTorch did on a GPU, and it never takes a graphics card from other work.

## Words and meaning together

`search.ts` fuses a full-text list (SQLite FTS5, the app's tokenizer and query) with the vector list by reciprocal
rank. nDCG@10 on nine sets (Quora left out for time), meaning from the int4 vectors:

| | Mean | Better than meaning alone on |
|---|---|---|
| Meaning alone | 53.26 | |
| Words alone | 30.20 | 0 of 9 |
| Fused, equal weights | 46.18 | 0 of 9 |
| Fused, words × 0.25 | 52.80 | 5 of 9 |
| **Fused, words × 0.1** | **53.87** | **8 of 9** (FiQA −1.4) |
| Fused, only the top 10 words × 0.5 | 48.38 | 0 of 9 |

So words weigh a tenth of meaning when both are there; without meaning, words are all there is.

## Thresholds

Cosine similarities from the worker for memory-like pairs set the app's thresholds:

| Pair | Measured | Used for |
|---|---|---|
| The same in other words (also across languages) | 0.89–0.98 | `remember` refuses a new note ≥ 0.95 to one kept |
| A fact and its update | 0.82–0.91 | the tidy-up shows notes ≥ 0.7 alike as possible near-copies |
| Related notes | 0.53–0.75 | topics group notes ≥ 0.6 alike |
| Unrelated notes | 0.44–0.55 | |
| A request and a note it bears on | 0.24–0.55 | search counts a note as about a request ≥ 0.3 |
| A request and a note it does not | 0.15–0.26 ("thanks": 0.40, and requests of one or two words are not searched) | |
