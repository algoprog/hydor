#!/usr/bin/env python
"""Tests for the typed-text shards (data/typed.py, ws/pretrain_data.py): their names, and that a conversation's assistant context has no loss.
CUDA_VISIBLE_DEVICES= .venv/bin/python -m unittest tests.test_typed"""
import os
import sys
import tempfile
import unittest

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))

import numpy as np  # noqa: E402

from ws.pretrain_data import Shards, is_conversation, shard_language  # noqa: E402
from ws.vocab import AGENT, BOS, EOS, USER, Vocab  # noqa: E402


class Names(unittest.TestCase):
    def test_names(self):
        self.assertEqual(shard_language('typed_conv'), 'typed_conv')
        self.assertEqual(shard_language('typed_email_enron'), 'typed_email_enron')
        self.assertEqual(shard_language('chat'), 'chat')
        self.assertEqual(shard_language('web_deu_Latn_b'), 'deu_Latn')
        self.assertTrue(is_conversation('typed_conv') and is_conversation('chat') and not is_conversation('typed_email_enron'))


class Context(unittest.TestCase):
    def test_role_2_has_no_loss(self):
        class V:                      # the identity map from LLM ids to SLM ids
            llm2slm = np.arange(1000, dtype=np.int32)
        d = tempfile.mkdtemp()
        turns = [np.array([10, 11, 12]), np.array([20, 21]), np.array([30, 31, 32, 33])]
        np.save(os.path.join(d, 'typed_conv.train.tok.npy'), np.concatenate(turns).astype(np.int32))
        np.save(os.path.join(d, 'typed_conv.train.off.npy'), np.array([0, 3, 5, 9], dtype=np.int64))
        np.save(os.path.join(d, 'typed_conv.train.role.npy'), np.array([1, 2, 1], dtype=np.uint8))
        np.save(os.path.join(d, 'typed_conv.train.conv.npy'), np.array([0, 3], dtype=np.int64))
        sh = Shards(d, 'train', V(), None, 254, 768)
        q = sh[0]
        self.assertEqual(list(q.ids), [BOS, USER, 10, 11, 12, AGENT, 20, 21, USER, 30, 31, 32, 33, EOS])
        self.assertEqual(list(q.w), [0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1])


if __name__ == '__main__':
    unittest.main()
