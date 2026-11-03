---
name: hugging-face
description: Use when publishing, downloading or managing models, datasets or Spaces on the Hugging Face Hub, such as uploading weights, writing a model or dataset card, gating a repo, or checking an upload. Running models locally is local-models.
category: ai
triggers: [hugging face, huggingface, hf hub, model card, dataset card, push to hub, upload to hugging face, hf upload, safetensors, gated model, hugging face space*]
---

# Hugging Face Hub

Publishing and using models, datasets and Spaces on the Hugging Face Hub: sign in with a token,
create the repository, upload with the `hf` command or the `huggingface_hub` library, write a card
people can trust, and check the upload by downloading and loading it back. Card templates are in
`references/cards.md`.

## 1. Set up

- Install in a virtual environment: `pip install -U huggingface_hub`. It brings the `hf` command
  (which replaced `huggingface-cli`).
- A token from huggingface.co/settings/tokens: fine-grained, with write access only to the
  repositories or organisation needed. Save it with `request_secret` (name `HF_TOKEN`, domains
  `huggingface.co`, `commands: true`); never paste it in the chat or a notebook.
- The command and the library read `HF_TOKEN` from the environment, so `run_with_secrets` is enough:
  `hf auth whoami` shows who you act as. Avoid `hf auth login`, which stores the token on disk,
  unless the user wants that.
- In this app, the Hugging Face token in **Settings → Agents → Models** lets the app download gated
  and private models for Custom; uploads need a token with write access in the vault.

## 2. Create the repository

```bash
hf repos create acme/invoice-classifier --type model --private
hf repos create acme/support-tickets --type dataset --private
hf repos create acme/ticket-demo --type space --sdk gradio
```

Clear names (`acme/invoice-classifier-v1`), lower case. Start private; make it public when the
card is written and the files are checked (`hf repos settings acme/invoice-classifier --public`).

## 3. Prepare the files

- **Models:** weights as safetensors (not pickle `.bin` or `.pt` files: safer and faster to load).
  `model.save_pretrained(out)` and `tokenizer.save_pretrained(out)` write the config, sharded
  weights, tokenizer files and chat template. A LoRA adapter is `adapter_model.safetensors` plus
  `adapter_config.json` (naming its base model). GGUF files for llama.cpp and Ollama: one per
  quantization, named after it (`model-Q4_K_M.gguf`).
- **Datasets:** Parquet, CSV or JSON Lines, split into train, validation and test files that the
  Hub recognises (`data/train-00000-of-00001.parquet`, or a `configs` section in the card).
- Leave out what does not belong: secrets and `.env` files, optimizer states and intermediate
  checkpoints, personal data without consent, data you have no right to share.
- Limits: no single file over 500 GB (weights in shards under about 200 GB), at most 10,000 files
  in one folder.

## 4. Upload

```bash
hf upload acme/invoice-classifier ./out . --commit-message "v1: trained on 12k labelled invoices"
hf upload acme/support-tickets ./data data --repo-type dataset
```

- Large folders are split into several commits automatically; if an upload is cut off, run the same
  command again and it resumes.
- `--include` and `--exclude` take patterns; `--revision` uploads to a branch; `--create-pr`
  proposes the change to a repository you do not own.
- In Python: `HfApi().upload_folder(repo_id="acme/invoice-classifier", folder_path="out")`.
- Versions: every upload is a commit. Tag what you release (`hf repos tag create
  acme/invoice-classifier v1.0`), experiment on a branch (`hf repos branch create ... experiment`),
  and load an exact version with `revision="v1.0"`.

## 5. Write the card

The repository's `README.md` is its card: YAML metadata at the top, then the text.

- **Metadata:** `license`, `language`, `library_name`, `pipeline_tag`, `base_model` (and
  `base_model_relation`: adapter, merge, quantized or finetune), `datasets`, `tags`, and evaluation
  results.
- **Model card sections:** what it is; intended uses and uses it is not for; how to use it (a short
  working code example); training data; training procedure and main settings; evaluation (data,
  metric, results next to the base model's); limitations, biases and risks; license; citation;
  contact.
- **Dataset card sections:** why it exists; what is in it (fields, splits, sizes, languages); how
  it was collected and cleaned, and by whom; personal or sensitive information and what was done
  about it; intended uses; limitations; license; citation.
- Say only what you measured, and how. "Not evaluated on X" is useful information.

## 6. Gated repositories and licences

- Gate a repository when its licence or risk calls for accepted terms:
  `hf repos settings acme/invoice-classifier --gated auto` (or `manual` to approve each request).
  The card's `extra_gated_prompt` and `extra_gated_fields` set what people must accept or fill in.
- Using a gated model: the user accepts the terms on its page while signed in; then a token of
  their account downloads it.
- Read the licence before using or redistributing a model or dataset, fine-tuned versions
  included: some forbid commercial use, some require attribution or the same licence.

## 7. Spaces

- A Space is a small app hosted on the Hub. `sdk` is `gradio` (a Python interface), `docker`
  (anything in a container) or `static` (HTML and JavaScript). Static Spaces are free for everyone;
  the others on free hardware need a paid plan (PRO for people, Team or Enterprise for
  organisations).
- Its README metadata sets `title`, `emoji`, `colorFrom`, `colorTo`, `sdk`, `sdk_version`,
  `app_file` and `short_description`.
- Upload the app (`hf upload acme/ticket-demo . . --repo-type space`); secrets go in the Space's
  settings, never in code: `hf spaces secrets add acme/ticket-demo --secrets OPENAI_API_KEY` reads
  the value from the environment (`run_with_secrets`).
- When it fails to start: `hf spaces logs acme/ticket-demo --build`, then the run logs without
  `--build`.

## 8. Check the upload

- The files and sizes match what you meant to upload: `hf models ls acme/invoice-classifier -R`
  (`hf datasets ls` for datasets).
- Download into an empty folder and load it as a user would: `hf download acme/invoice-classifier
  --local-dir /tmp/check`, then `from_pretrained`, one test input, and the expected answer. For a
  dataset, `load_dataset("acme/support-tickets")` and the split sizes. For an adapter, load the base
  model plus the adapter.
- Open the repository page: the card renders, the licence and tags show, the gate is on if it
  should be, and it is private or public as intended.

## Pitfalls

- A public repository holding private data, or a token in a committed file.
- Pickle files from strangers: loading them can run code. Prefer safetensors, and read the code
  before passing `trust_remote_code=True`.
- A model uploaded without its tokenizer or chat template: it then answers differently.
- Cards that claim results nobody measured, or carry no licence.
- Uploading a training folder whole: checkpoints and optimizer states multiply the size.
