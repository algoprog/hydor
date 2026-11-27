---
title: Word suggestions that never leave your computer
description: How Hydor suggests the rest of the word you are typing, and the next one, in about 200 languages, with a 49-million-parameter model on your own processor that learns how you write without anything you type leaving your computer.
date: 2026-11-23
tags: Word suggestions, Research
cover: /img/blog/on-device-word-suggestions/cover.webp
coverAlt: A glass keyboard key marked Tab, half full of glowing turquoise water, sends ripples across a black surface, with a trail of small lights leading away from it like letters about to be typed.
og: /img/blog/on-device-word-suggestions/og.jpg
order: 3
---

Type "Please let me know if you have any ques" in Hydor and **tions.** appears in grey after the cursor. Press <kbd>Tab</kbd> and it is yours. That is all a word suggestion is: the rest of the word you are writing, and the next word, dimmer. What is worth a post is how little it asks for: a model with 48.8 million parameters, on your own processor, in about 200 languages, that learns how you write while nothing you type goes anywhere.

Each part below starts in plain words, then goes into how it works, with the numbers from the model's [published card](https://huggingface.co/algoprog/hydor-suggest-49m). The numbers are for **version 2** of the model, published on 24 November 2026 and in Hydor 0.111.0 and later.

## What you see

While you type in a message box, in a document or in a note, Hydor shows the rest of the word in grey after the cursor, and the next word dimmer still. Four keys cover it:

- <kbd>Tab</kbd> takes the grey word. Press it again to take the next one.
- <kbd>→</kbd>, with the cursor at the end of the text, takes both words at once.
- <kbd>Esc</kbd> hides them until the next word.
- Keep typing and they go away by themselves. Type the letters they show and they stay, shorter.

<!-- figure: typing -->

It works in the message boxes, in **Docs** paragraphs, and in the smaller boxes too: follow-ups, the Ask panels, memory notes and your profile. It is on from the start, with one switch to turn it off: **Settings → Capabilities → Word suggestions**. Nothing is downloaded until you first type in a message box or a document; then it sets itself up and downloads about 1.2 GB, once. When nothing grey is showing, every key does what it always did. The [guide](/docs/documents-voice#word-suggestions-as-you-type) has the rest.

![The message box with the start of a word in white, its rest in grey and the next word dimmer.](/img/app-suggest.webp "The message box in the app: the rest of the word is grey, the next word dimmer.")

## Why it runs on your computer

Three reasons.

**Nothing you type leaves it.** Suggestions need to read what you are writing, which is exactly what you may not want to send to a server. Here the guesses are made by models that run on your computer, and the model that learns from you is kept in the app's data folder and shared with no one. After the first download nothing is downloaded again, and it needs no graphics card.

**It keeps up with you.** A suggestion that arrives after your next key is worse than none. The small model takes about 15 ms for a suggestion on an ordinary processor. The card's measurement: with 4 threads the median was 14 ms and 90% of suggestions took under 20 ms; with one thread, 18 ms. That was on an AMD Ryzen Threadripper PRO 9955WX with ONNX Runtime, while the computer was busy with other work.

**It works in the language you write.** The model was trained on text in about 200 languages, not on English with a few others added.

<div class="stats">
<div class="stat"><b data-count-to="48.8" data-suffix="M">48.8M</b><span>parameters in the small model</span></div>
<div class="stat"><b data-count-to="202">202</b><span>languages in its training text</span></div>
<div class="stat"><b data-count-to="14" data-suffix=" ms">14 ms</b><span>median time for a suggestion, on a CPU</span></div>
<div class="stat"><b>0</b><span>words you type are sent anywhere</span></div>
</div>

**Under the hood.** The weights are 195 MB (float32). Since Hydor 0.107.0 the model runs on [ONNX Runtime](https://onnxruntime.ai) instead of PyTorch, about three times faster on the processor and in much less memory, with the same suggestions. PyTorch is needed only to train.

## Two models, one guess

A parameter is one learned number, and 49 million of them is tiny next to a chat model. On its own the small model saves less typing than a larger one, so when the computer has the memory (at least 8 GB, with 2.5 GB free at that moment), Hydor runs a second model beside it, [Qwen3.5-0.8B-Base](https://huggingface.co/Qwen/Qwen3.5-0.8B-Base), and mixes the two guesses. Without that memory the small model works alone, a little less well. **Language model** in the settings has **Automatic**, **On** and **Off**, and **Language model size** picks 8 bits (about 830 MB, guesses a little better) or 4 bits (about 560 MB).

<!-- figure: pipeline -->

**Under the hood.** The small model is a hybrid of short convolutions and attention. Qwen3.5-0.8B-Base is a base model: it only continues text. Hydor starts it as a local [llama.cpp](https://github.com/ggml-org/llama.cpp) `llama-server` on the 8-bit file (`Q8_0`) or the 4-bit one (`Q4_0`), with one slot and a context of 2,048 tokens, and asks it for its top guesses. The small model uses Qwen3.5's tokenizer unchanged, and that is what makes mixing possible: both models score the same word pieces. The mixing is done word piece by word piece:

```text
p = (1 − λ) · p(Qwen3.5) + λ · p(small model)
```

λ is how much to trust the small model at that step. It comes from a tiny learned gate (`gate.json`), not from a constant. Three more pieces decide what gets shown.

- **The language guess.** The engine guesses the language from the tokens, using for each language its 20,000 most used tokens and how likely each is. On the first 16 tokens it is right 88.7% of the time; it trusts a guess when its posterior is 0.9 or more, which happens for 87.5% of those texts, and 95.3% of those are right. The mistakes are mostly between close varieties (Arabic dialects, Bosnian and Croatian, Malay and Indonesian, Xhosa and Zulu), and they rarely matter: the guessed language has the same mixing choice as the true one for 99.3% of whole sentences.
- **The per-language switch.** For each of the 204 FLORES-200 language variants, `switch.json` says whether to mix with Qwen3.5 (104 of them) or to use Qwen3.5 alone, whichever was more accurate on the dev half of FLORES-200. English, Spanish, German and French are among those where Qwen3.5 alone wins, until the model has learned your own writing ([below](#learning-how-you-write)).
- **Keeping to the letters you typed.** When you are in the middle of a word, only continuations that fit the letters already typed are kept, and the word is finished from them.

## Knowing when to stay quiet

A wrong suggestion is worse than none: it gets in your way. So every guess comes with a confidence, and Hydor shows it only when the confidence is high enough. **How sure before showing** sets the bar, and the three choices are targets for how often a shown suggestion is right: **More** (the default) aims at 20%, **Balanced** at 40% and **Surer** at 50%.

**Under the hood.** A confidence of 0.8 means little until you know how the model's confidence relates to being right. The card's `calibration.json` holds, for each mode (the mix, Qwen3.5 alone, the small model alone), the confidence needed to get 30%, 40% or 50% of the shown suggestions right, measured on FLORES-200, and Hydor adds the one for 20%, measured the same way. The cost of that choice: on other kinds of text the same bar gives a different share of right suggestions. On one person's chat, the bar for 30% was right 41% of the time, which is why **More** aims at 20%: there it is right 29% of the time, and a suggestion shows at 71% of the moments where one could, instead of 46%.

How good a setup is gets measured in **typing saved**: out of all the keys you would press without help, the share that suggestions press for you. Taking a suggestion costs one <kbd>Tab</kbd>, so a suggestion that adds 6 letters saves 5 keys.

<!-- figure: keystrokes -->

This is why systems are compared at the same bar. A model that shows a guess at every key always saves more typing, but most of its guesses are wrong, and wrong guesses get in your way. So each model is set to show only the guesses it is sure enough about, until the same share of them is right, and then typing saved is a fair comparison. On sentences in 193 languages that use spaces (FLORES-200 devtest, 20 sentences per language, the first 16 words of each; the model never saw them), every system lands where it was aimed:

<!-- figure: threshold -->

At **Balanced** the mixed setup saves 10.3% of the keys against 9.0% for Qwen3.5 alone, 1.3 points more (95% interval +1.2 to +1.5). Averaged per language instead of per sentence, it is 10.4% against 9.1%, and for the median language 8.9% against 6.7%. The small model alone saves 5.7%: its job is to add to the larger one, not to replace it.

## About 200 languages

Most autocomplete is good in English and a few other languages. A large model is the same: the languages it has read little of are the ones where it guesses worst. The small model was trained to be useful exactly there.

**Under the hood.** It learned from public text only: a corpus of 49.4 billion tokens in 202 languages, mostly [FineWeb-2](https://huggingface.co/datasets/HuggingFaceFW/fineweb-2) and [FineWeb-Edu](https://huggingface.co/datasets/HuggingFaceFW/fineweb-edu), with a little Wikipedia and MADLAD-400 for languages that have little web text, and some conversations. Any document holding a FLORES-200 sentence was removed first, so the test sentences are new to it. Training had three stages, each starting from the one before: about 2 billion tokens, then 7.5 billion, then 10 billion.

The last stage is where the choice matters: it gives 70% of its text to the 141 languages where Qwen3.5-0.8B is weakest (some are read up to 10 times), 27% to the other languages and 3% to chats. Reading the whole corpus once gave a model that was better on average but worse exactly where Qwen3.5 needs help, because the small languages got a tenth of their share. Version 2 added a fourth stage of 1 billion tokens, about a third of it text that people typed (messages to an assistant, and email), which is why it saves more typing than version 1 on email (23.4% against 17.0% alone) and on chat; a control run on web text alone gained nothing there.

<!-- figure: languages -->

Those four are among the biggest gains the card lists, and with only 20 sentences per language they are noisy. The top-guess measure is steadier. *acc@1* is how often the model's top guess for the next token is the real one, measured over 204 languages with 40 sentences each. Over all 204 languages the mix reaches 23.0% against 21.3% for Qwen3.5 alone; over the 57 languages where Qwen3.5 is weakest (under 10%), 8.6% against 6.6%. There the small model alone, at 8.0%, already beats Qwen3.5. It beats it in 75 languages in all, and mixing is better in 84 and worse in 10 (by more than half a point).

The flip side is in English. On messages typed to an assistant and on email, mixing in the small model adds nothing: at **Balanced**, 38.0% against 38.3% for Qwen3.5 alone on messages, and 33.0% against 33.1% on email. That is what the switch is for.

## Learning how you write

By default the small model also learns your own words: the names, terms and way of writing you use. It reads the sources you leave on: your messages to agents, agents' replies, the memory notes you wrote and your documents. It does this when the computer is quiet (you have not typed for ten minutes and there is memory to spare), in the background and at the lowest priority, every night, every week or only when you press **Retrain now**. What you wrote never leaves your computer, and the model it makes is kept in the app's data folder and shared with no one.

<!-- figure: learning -->

On a computer without a graphics card a run can take hours. When an NVIDIA card with at least 4 GB free is there, or a Mac with Apple silicon, learning uses it and runs many times faster. A card no other program uses comes first; when every card has a model server (vLLM, Ollama), a run shares one whose server is idle and leaves 2 GB more free, and while the servers are at work it learns on the processor. While a run is going you can **Pause** it, which keeps what it has learned so far even across a restart, and then **Resume**, or **Stop** it, which drops that run and keeps the model you have. **Forget what it learned** deletes the model made from your writing and goes back to the one that came with the app.

**Under the hood.** The risk in learning from one person's text is forgetting. Hydor's answer has two parts. First, **every run starts again from the model that came with the app**, and learns from all you have written (its newest part, roughly the last three million words). Before 0.110.0 each night's short run built on the last, and over weeks the model got worse, at other languages and in the end at your own writing. Second, while it trains, **public text is replayed beside yours**: 20 million tokens of public text ship with the model, and each run replays different passages of it, so the other languages stay in the model. What you typed counts more than the rest (**Weight of my own words**, 4 at first, from 1 to 16).

The personalised copy is then used only for the languages you write in (the card says once it has learned at least 2,000 tokens of a language); the one that came with the app serves every other language, so learning never costs a language you do not use. That takes about 250 MB more memory while suggestions run.

What does it add? The card measured it on one person's chat messages to AI agents, mostly coding agents. The model learned from the messages written before 28 October 2026, then was tested on 673 messages from the person's last two weeks, which it had never seen:

<!-- figure: personal -->

Before it has learned, mixing in the small model would cost 2.1 points on this chat (28.4% against 30.5%), which is why Hydor uses Qwen3.5 alone for English then. After personalising, the mix saves 0.8 points more than Qwen3.5 alone (31.3% against 30.5%; 95% interval +0.1 to +1.4). On a computer without the memory for Qwen3.5, the small model alone gains 5.7 points, about a third more. This is one person's messages, mostly to coding agents: take it as a guide, not a promise. Yours may differ.

## Open, and easy to try

The model, `hydor-suggest-49m`, is on [Hugging Face](https://huggingface.co/algoprog/hydor-suggest-49m) under the AGPL-3.0-only, like Hydor itself (its tokenizer is Qwen3.5's, under the Apache-2.0). The code that runs it is in [`server/suggest/py/hydor_suggest`](https://github.com/algoprog/hydor/tree/main/server/suggest/py/hydor_suggest), and the public recipe that trained it, with its test scripts, is in [`scripts/word-suggest`](https://github.com/algoprog/hydor/tree/main/scripts/word-suggest).

It is not a `transformers` model, so `AutoModel` will not load it. The repository's small Python package does, and needs only `onnxruntime`, `tokenizers`, `numpy` and `safetensors`:

```bash
git clone --depth 1 https://github.com/algoprog/hydor
python -m venv venv && . venv/bin/activate
pip install onnxruntime tokenizers numpy safetensors huggingface_hub
export PYTHONPATH="$PWD/hydor/server/suggest/py"
```

```python
import os
os.environ["CUDA_VISIBLE_DEVICES"] = ""      # the model runs on the CPU

from huggingface_hub import snapshot_download
from hydor_suggest.engine import Engine

engine = Engine()
engine.load(snapshot_download("algoprog/hydor-suggest-49m"), threads=4)  # ~314 MB, once

texts = ["Buenos días, quería preguntarte si podrías enviarme el docu",
         "Thank you for your "]
for text in texts:
    r = engine.suggest({"surface": "text", "text": text, "precision": 0.3})
    print(repr(text))
    print(f"   word={r['word']!r}  confidence={r['conf']:.2f}  needed={r['theta']:.2f}  show={r['show']}")
```

On the card, the first prints `word='mento'` with confidence 0.77 against a needed 0.24 (`show=True`); the second prints `word='help.'` with 0.06 (`show=False`): the model is only 6% sure, so it stays quiet. `precision` is the share of shown suggestions meant to be right: **More** is `0.2`, **Balanced** `0.4` and **Surer** `0.5`. The card's table starts at `0.3` (a lower one gets its bar), and Hydor adds the bar for `0.2`, measured the same way.

## What it cannot do

Small is small. A model this size makes plain mistakes: wrong agreement, rare words, names. Alone it saves 5.7% of keystrokes where Qwen3.5 saves 9.0% (at 40% right, on FLORES), and its value is in the mix and in what it learns from you.

It was tested on FLORES-200 sentences (translated news, travel and wiki text), on two public collections of messages and email, and on one person's chat, not on a wide range of chat or documents; the bar comes from FLORES, so elsewhere it gives a different share of right suggestions. The model saw most of the OpenAssistant conversations in pretraining, so its numbers on those messages flatter it.

For about a third of the languages there is little public text, and accuracy is low even with this model (8.6% in the weakest 57). Some languages cannot be guessed reliably, and for a few there is no profile at all.

And web text carries the web's biases. Version 2 also learned from real people's messages and email, and nothing is filtered beyond what the sources do, so offensive or private text may appear in a suggestion. A suggestion is one word, shown to the person typing, who decides whether to take it. Turn it off any time in **Settings → Capabilities → Word suggestions**.
