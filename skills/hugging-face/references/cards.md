# Card templates

Replace everything in angle brackets; delete what does not apply rather than leaving it empty.
Honest blanks ("Not evaluated on languages other than English") are better than guesses.

## Model card (README.md of a model repository)

````markdown
---
license: apache-2.0                 # or mit, cc-by-4.0, other (+ license_name, license_link)
language: [en]
library_name: transformers          # or peft, sentence-transformers, gguf, diffusers
pipeline_tag: text-classification   # the task, as the Hub names it
base_model: <org/base-model>
base_model_relation: finetune       # adapter, merge, quantized or finetune
datasets: [<org/dataset>]
tags: [invoices, classification]
---

# <Model name>

<One or two sentences: what it does, for whom, built on what.>

## Intended uses

- <What it is for, with the kind of input it expects.>
- **Not for:** <uses it was not designed or tested for; decisions it must not make alone.>

## How to use

```python
from transformers import pipeline
clf = pipeline("text-classification", model="<org/model>")
print(clf("Invoice 2026-014 from Lisbon Bakes, total 180.00 EUR"))
```

## Training data

<What data, how much, from where, time span, languages; how it was cleaned and labelled; what was
excluded. Link the dataset card.>

## Training procedure

<Method (full fine-tuning, LoRA r=16 on all linear layers...), epochs, learning rate, batch size,
sequence length, hardware and time, framework versions.>

## Evaluation

<Test data (held out, how it differs from training data), metrics, and results with the number of
examples and an interval, next to the base model's results with the same prompts and settings.>

| Model | Accuracy (n=1,200) | Macro F1 |
| --- | --- | --- |
| <base model> | <...> | <...> |
| <this model> | <...> | <...> |

## Limitations and risks

<Where it fails (examples), groups or languages it serves worse, known biases, what was not tested.>

## License

<The license, and the base model's license terms that still apply.>

## Citation

```bibtex
@misc{<key>,
  title  = {<Model name>},
  author = {<Authors>},
  year   = {<Year>},
  url    = {https://huggingface.co/<org/model>}
}
```

## Contact

<Who maintains it and how to report problems.>
````

## Dataset card (README.md of a dataset repository)

````markdown
---
license: cc-by-4.0
language: [en]
task_categories: [text-classification]
size_categories: [10K<n<100K]
pretty_name: <Readable name>
configs:
  - config_name: default
    data_files:
      - split: train
        path: data/train-*.parquet
      - split: test
        path: data/test-*.parquet
---

# <Dataset name>

<What it contains, in one or two sentences, and why it was made.>

## Contents

- **Fields:** `text` (string): <...>; `label` (one of <...>): <...>
- **Splits:** train <n rows>, test <n rows>; <how the split was made, for example by customer, so no
  customer appears in both>
- **Languages, period, sources:** <...>

## How it was made

<Collection (from where, when, by whom), selection, cleaning, labelling (by whom, instructions,
agreement between labellers), and anything removed.>

## Personal and sensitive information

<What personal data could be in it, what was removed or anonymised and how, consent or legal basis.>

## Intended uses and limits

<What it is suitable for; what it is not; known gaps and biases.>

## License and citation

<License, any terms from the original sources, and a BibTeX entry.>
````
