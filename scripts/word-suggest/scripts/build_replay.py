#!/usr/bin/env python3
"""The release's replay: ~20M tokens of public text, tokenised in the small model's id space, for personalising with replay.

    CUDA_VISIBLE_DEVICES="" nice -n 19 .venv/bin/python scripts/build_replay.py --out release/hydor-suggest-49m/replay --tokens 20000000

The research's replay (ws/pretrain_data.py `Replay`, scripts/train_slm.py --replay-pretrain data/pretrain200b) draws sequences
uniformly over every item of the corpus' train shards: web documents cut into chunks of 254 tokens (`<bos> <doc> chunk [<eos> on the
document's last chunk]`) and conversations (`<bos> (<user>|<agent>) turn ... <eos>`, cut to 256 tokens: chat_max_len=256), so the
languages come in the corpus' own mix.  This does the same with `Shards` (same items, same lengths), but only from sources that
may be published, and each sequence is written out (ids in the small model's space: specials 0..5, Qwen ids + 6):

  * web text: only the FineWeb-2 / FineWeb-Edu documents.  data/pretrain200b's `web_<config>` shards are FineWeb-2 only; a
    `web_<config>_b` shard holds the continued FineWeb-2 documents first, then Wikipedia, then MADLAD-400 top-ups (data/pretrain200b.py
    build_language: documents are added in that order, and manifest.web_<config>_b.json gives the tokens by source), so it is split at
    the token offset new_by_source.fineweb, which must be a document boundary (off.npy) -- else the shard is left out.
  * chats: oasst2 and aya_dataset (chat.train.src.json says which; both Apache-2.0): all.

replay.u32: little-endian uint32 ids back to back.  index.json: {"format": "hydor-suggest-replay/1", "sequences": [[offset, length,
kind, lang], ...]} (offset and length in tokens; kind "doc" or "chat"; lang a FLORES-200 code where the corpus' language maps to one,
else the corpus' own code).
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

from build_lid import MAP, PRE  # noqa: E402
from ws.pretrain_data import Shards, shard_language  # noqa: E402
from ws.vocab import Vocab  # noqa: E402

VOCAB = os.path.join(ROOT, 'runs', 'slm', 'pre50b_30m_cmix', 'vocab.json')
SWITCH = os.path.join(ROOT, 'runs', 'gate', 'flores_pre50b_30m_cmix_switch.json')
# chat language codes (oasst2: ISO 639-1 / locale; aya: ISO 639-3) that name a macrolanguage or a variant of a FLORES one
CHAT_SPECIAL = {'pt-BR': 'por', 'uk-UA': 'ukr', 'zh': 'zho', 'zh-Hans': 'zho', 'ara': 'arb', 'msa': 'zsm', 'fas': 'pes', 'nep': 'npi', 'est': 'ekk',
                'lav': 'lvs', 'swa': 'swh', 'sqi': 'als', 'mon': 'khk', 'aze': 'azj', 'uzb': 'uzn', 'ori': 'ory', 'fil': 'tgl', 'yid': 'ydd',
                'grn': 'grn', 'que': 'quy', 'kmr': 'kmr', 'ckb': 'ckb', 'zho': 'zho', 'msa-MY': 'zsm', 'ms': 'zsm', 'no': 'nob', 'nor': 'nob',
                'nb': 'nob', 'nn': 'nno'}


def flores_codes() -> list:
    return sorted(json.load(open(SWITCH))['switch'])


def chat_code_to_flores(code: str, flores: list, tokens: dict) -> str | None:
    """A chat conversation's language code -> a FLORES code (the one with the most corpus tokens when the language has several scripts)."""
    i3 = json.load(open(os.path.join(PRE, 'iso3to1.json')))          # 3-letter -> 2-letter
    inv = {v: k for k, v in i3.items()}
    c = CHAT_SPECIAL.get(code, code)
    if len(c) == 2:
        c = inv.get(c, c)
    if len(c) == 3:
        cand = [f for f in flores if f.startswith(c + '_')]
        if cand:
            return max(cand, key=lambda f: tokens.get(f, 0))
    return None


def fineweb_boundaries(pre: str) -> tuple[dict, dict]:
    """-> ({shard name: token offset up to which the shard is FineWeb text (None: all of it)}, {left-out shard: reason})."""
    man = json.load(open(os.path.join(pre, 'manifest.json')))['languages']
    bound, out = {}, {}
    for cfg, v in man.items():
        for suffix in ('', '_b'):
            name = f'web_{cfg}{suffix}'
            tokp = os.path.join(pre, f'{name}.train.tok.npy')
            if not os.path.exists(tokp):
                continue
            n = int(np.load(tokp, mmap_mode='r').shape[0])
            if suffix == '':                                  # data/pretrain200: FineWeb-2 / FineWeb-Edu only
                bound[name] = n
                continue
            m = json.load(open(os.path.join(pre, f'manifest.{name}.json')))
            fw = int(m['new_by_source']['fineweb'])
            other = int(m['new_by_source']['wikipedia']) + int(m['new_by_source']['madlad'])
            if other == 0 or fw >= n:                         # nothing but FineWeb in this shard
                bound[name] = n
                continue
            off = np.load(os.path.join(pre, f'{name}.train.off.npy'))
            j = np.searchsorted(off, fw)
            if j < len(off) and off[j] == fw:
                bound[name] = fw
            else:
                out[name] = f'mixed shard (FineWeb {fw} of {n} tokens) and the boundary is not a document boundary'
    return bound, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--tokens', type=int, default=20_000_000)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--report', default=None)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    vocab = Vocab.load(VOCAB)
    assert vocab.is_full
    bound, left_out_shards = fineweb_boundaries(PRE)
    sh = Shards(PRE, 'train', vocab, None, chunk_tokens=254, chat_max_len=256)           # exactly the research replay's items
    names = sh.names
    cfg2flo = {c: MAP.get(c, c) for c in json.load(open(os.path.join(PRE, 'manifest.json')))['languages']}
    # eligibility per item
    src = sh.item_src.astype(np.int64)
    eligible = np.zeros(len(sh), dtype=bool)
    lang_of_shard = []
    for si, n in enumerate(names):
        if n == 'chat':
            eligible |= (src == si)                            # oasst2 + aya: narrowed per conversation below
            lang_of_shard.append('chat')
            continue
        cfg = shard_language(n)
        lang_of_shard.append(cfg2flo.get(cfg, cfg))
        if n not in bound:
            continue
        m = (src == si) & (sh.b <= bound[n])                   # chunks never straddle documents, so b <= boundary is FineWeb
        eligible |= m
    # the chats: only oasst2 / aya
    ci = names.index('chat')
    csrc = json.load(open(os.path.join(PRE, 'chat.train.src.json')))
    clang = json.load(open(os.path.join(PRE, 'chat.train.lang.json')))
    assert set(csrc) <= {'oasst2', 'aya'}, set(csrc)
    chat_items = np.flatnonzero(src == ci)                    # item k <-> conversation k (t0 = conv[:-1])
    assert len(chat_items) == len(csrc) == len(clang)
    ok_chat = np.array([s in ('oasst2', 'aya') for s in csrc])
    eligible[chat_items[~ok_chat]] = False
    # token accounting for the report
    tokens_by_flo: dict = collections.Counter()
    for si, n in enumerate(names):
        if n != 'chat' and n in bound:
            tokens_by_flo[lang_of_shard[si]] += min(bound[n], int(np.load(os.path.join(PRE, f'{n}.train.tok.npy'), mmap_mode='r').shape[0]))
    flores = flores_codes()
    ntok = (sh.lengths - 1).astype(np.int64)                  # input tokens of an item (the research counts len(ids) - 1)
    pool = np.flatnonzero(eligible)
    print('items:', len(sh), 'eligible:', len(pool), 'eligible input tokens:', int(ntok[pool].sum()))
    rng = np.random.RandomState(a.seed)
    perm = pool[rng.permutation(len(pool))]
    # the research counts len(ids) - 1 per sequence towards n_tokens; stop at the target, counting stored ids
    cum = np.cumsum(sh.lengths[perm])
    n = int(np.searchsorted(cum, a.tokens, side='left')) + 1
    chosen = perm[:n]
    path = os.path.join(a.out, 'replay.u32')
    index, off = [], 0
    kinds, by_lang, by_src = collections.Counter(), collections.Counter(), collections.Counter()
    chat_unmapped = collections.Counter()
    with open(path, 'wb') as f:
        for i in chosen:
            i = int(i)
            q = sh[i]
            ids = np.asarray(q.ids)
            assert ids.min() >= 0 and ids.max() < vocab.v_sub and ids[0] == 1
            f.write(ids.astype('<u4').tobytes())
            si = int(src[i])
            if names[si] == 'chat':
                k = i - int(chat_items[0])
                lang = chat_code_to_flores(clang[k], flores, tokens_by_flo) or clang[k]
                if chat_code_to_flores(clang[k], flores, tokens_by_flo) is None:
                    chat_unmapped[clang[k]] += len(ids)
                kind, source = 'chat', csrc[k]
            else:
                lang, kind, source = lang_of_shard[si], 'doc', 'web'
            index.append([off, int(len(ids)), kind, lang])
            off += len(ids)
            kinds[kind] += len(ids)
            by_lang[lang] += len(ids)
            by_src[source] += len(ids)
    json.dump({'format': 'hydor-suggest-replay/1', 'sequences': index}, open(os.path.join(a.out, 'index.json'), 'w'), separators=(',', ':'))
    report = dict(tokens=off, sequences=len(index), by_kind_tokens=dict(kinds), by_source_tokens=dict(by_src), languages=len(by_lang),
                  top_languages=by_lang.most_common(25), smallest_languages=by_lang.most_common()[-15:],
                  left_out_shards=left_out_shards,
                  left_out_languages_no_fineweb=sorted(set(cfg2flo.values()) - set(by_lang) - {'chat'}),
                  chat_languages_unmapped=dict(chat_unmapped.most_common()),
                  pool_items=len(pool), pool_tokens=int(ntok[pool].sum()),
                  web_fineweb_tokens_in_pool=int(sum(tokens_by_flo.values())), seed=a.seed)
    if a.report:
        json.dump(report, open(a.report, 'w'), indent=1)
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
