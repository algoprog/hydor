---
license: mit
base_model: jhu-clsp/mmBERT-small
base_model_relation: finetune
library_name: sentence-transformers
pipeline_tag: text-ranking
language:
- en
- es
- fr
- de
- pt
- ja
- ko
- zh
tags:
- sentence-transformers
- cross-encoder
- reranker
- multilingual
- onnx
- text-embeddings-inference
- hindsight
---

![Hindsight](assets/banner.png)

# hs-rerank-1

hs-rerank-1 is a multilingual cross-encoder reranker built for [Hindsight](https://github.com/vectorize-io/hindsight).
It reads a query and a document together and returns a relevance score.

## Highlights

- **Multilingual:** English, Spanish, French, German, Portuguese, Japanese, Korean and Chinese
  (Simplified and Traditional).
- **Long inputs:** up to 8,192 tokens per query and document pair.
- **Small:** 114M parameters. 98M of them are the token embedding table, so each forward pass
  runs a 15M-parameter transformer.
- **CPU and GPU:** ships an int8 ONNX export for CPU, and safetensors for GPU in FP16.
- **Serves on TEI:** CPU and GPU images.

## Model overview

| | |
|---|---|
| Model type | Cross-encoder reranker |
| Base model | `jhu-clsp/mmBERT-small` |
| Parameters | 114M |
| Languages | en, es, fr, de, pt, ja, ko, zh |
| Context length | 8,192 tokens |
| Output | One relevance score per query and document pair |
| Formats | safetensors stored in FP16 (FP32 copy on the `fp32` branch), ONNX (`onnx/model.onnx`, int8 vocabulary table) |

## Evaluation

![hs-rerank-1 benchmarks](assets/benchmarks.png)

## Usage

### Sentence Transformers

```bash
pip install -U sentence-transformers
```

```python
from sentence_transformers import CrossEncoder

model = CrossEncoder("hindsight-ai/hs-rerank-1")

query = "¿Qué app de presupuesto estoy creando?"
documents = [
    "El usuario quiere tooltips en su app de presupuesto.",
    "El usuario corre los domingos por la mañana.",
]

print(model.rank(query, documents))
# [{'corpus_id': 0, 'score': 0.9647}, {'corpus_id': 1, 'score': 0.0003}]
```

`predict` and `rank` return scores between 0 and 1. Pass `activation_fn=torch.nn.Identity()`
for raw logits.

### Text Embeddings Inference

CPU (uses `onnx/model.onnx`):

```bash
docker run -p 8080:80 \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.3 \
  --model-id hindsight-ai/hs-rerank-1 --auto-truncate \
  --max-client-batch-size 128
```

GPU:

```bash
docker run --gpus all -p 8080:80 \
  ghcr.io/huggingface/text-embeddings-inference:89-1.9.3 \
  --model-id hindsight-ai/hs-rerank-1 --auto-truncate \