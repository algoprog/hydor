#!/usr/bin/env python3
"""data/flores/<lang>.jsonl: FLORES-200 dev (997 sentences) and devtest (1012) for every language, test data only.

Source: Meta's own release, https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz (the files the paper links to; 204 language
variants, each as <lang_Script>). The Hub copies (`openlanguagedata/flores_plus`, `facebook/flores`) are gated and this account is not
authorised, so the tarball is the faithful copy.  Sentences stay in the files' order, which is the order inside each article
(metadata_*.tsv gives the article's URL per line), so a sentence's context can be the earlier sentences of its article.

Fields: id ("<lang>-dev-<line>"), lang (code with script: ell_Grek), split ("dev" | "devtest"), article (the URL), idx (the sentence's
number inside its article, from 0), line (line number in the file), text, prev (the previous sentence of the article, "" for the first).
    CUDA_VISIBLE_DEVICES="" .venv/bin/python data/flores.py [tarball]
"""
import json
import os
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

URL = "https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz"
OUT = Path(__file__).resolve().parent / "flores"


def main():
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:        # downloaded files are untrusted: their own empty directory
        tar = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tmp, "f.tar")
        if len(sys.argv) <= 1:
            urllib.request.urlretrieve(URL, tar)
        root = os.path.join(tmp, "x")
        with tarfile.open(tar) as t:
            t.extractall(root, filter="data")
        base = os.path.join(root, "flores200_dataset")
        meta = {}
        for sp in ("dev", "devtest"):
            with open(os.path.join(base, f"metadata_{sp}.tsv"), encoding="utf-8") as f:
                rows = [l.rstrip("\n").split("\t") for l in f][1:]
            idx, last, k = [], None, -1
            for r in rows:
                k = 0 if r[0] != last else k + 1
                last = r[0]
                idx.append((r[0], k))
            meta[sp] = idx
        langs = sorted(fn[:-4] for fn in os.listdir(os.path.join(base, "dev")) if fn.endswith(".dev"))
        n_tot = 0
        for lang in langs:
            recs = []
            for sp in ("dev", "devtest"):
                with open(os.path.join(base, sp, f"{lang}.{sp}"), encoding="utf-8") as f:
                    lines = [l.rstrip("\n") for l in f]
                assert len(lines) == len(meta[sp]), (lang, sp, len(lines), len(meta[sp]))
                for i, (text, (url, k)) in enumerate(zip(lines, meta[sp])):
                    recs.append(dict(id=f"{lang}-{sp}-{i}", lang=lang, split=sp, article=url, idx=k, line=i, text=text,
                                     prev=recs[-1]["text"] if k > 0 else ""))
            with open(OUT / f"{lang}.jsonl", "w", encoding="utf-8") as f:
                for r in recs:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            n_tot += len(recs)
        print(len(langs), "languages,", n_tot, "sentences ->", OUT)


if __name__ == "__main__":
    main()
