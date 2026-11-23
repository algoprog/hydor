# Word suggestions: the Python engine

The part of word suggestions that runs in Python beside the server (the spec is `docs/plans/word-suggestions.md`; the shared types are
`shared/suggest.ts`). Two scripts, both started as `python -I <this folder>/<script>.py` (they add their own folder to `sys.path`, so the
current directory does not matter):

| Script | What |
|---|---|
| `worker.py` | the suggestion worker: JSON lines on stdin and stdout (the protocol is at the top of `hydor_suggest/worker.py`) |
| `train.py` | personalising the small model on the person's own text, with the public text replayed (the recipe is at the top of `hydor_suggest/train.py`) |

`hydor_suggest/`: `model.py` (the small model, its incremental state, the loss), `vocab.py` (the specials, prefixes, the cut of a typed text),
`tokbytes.py` (token bytes, word ends, allowed sets), `mix.py` (gate features, the gate, the language switch), `lid.py` (the language guess),
`cache.py` (the session cache), `llm.py` (the llama-server client), `decode.py` (constrained greedy decoding and its confidence), `engine.py`
(loads a release folder and the personal model; `suggest`), `worker.py`, `train.py`.

It needs Python 3.10+ with `torch` (the CPU build is enough), `tokenizers`, `numpy` and `safetensors` (tested with torch 2.x, tokenizers 0.2x,
numpy 2.x); nothing else, and no `transformers`. Everything runs on the CPU.

## Environment

- `HYDOR_SUGGEST_DEBUG=1`: the worker prints the traceback of a failed request on stderr.
- `HYDOR_SUGGEST_RESUME_SECONDS` (train.py): seconds between saves of the resume state (600).
- The worker forces `CUDA_VISIBLE_DEVICES=""` unless set, and `TOKENIZERS_PARALLELISM=false`. Threads for the small model come from the
  `load` request (`threads`); `train.py` takes `--threads`.

## Tests

```bash
cd server/suggest/py && python -m unittest discover -s tests
```

They need only numpy, torch, tokenizers and safetensors: every test makes its own tiny model (random weights, a small vocabulary), its own
tokenizer, language guess and replay, and a fake llama-server (`tests/helpers.py`); none needs the network, a GPU, a model download or the
research folder. About half a minute.
