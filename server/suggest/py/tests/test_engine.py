import json
import os
import unittest

import helpers
import numpy as np
import torch

from hydor_suggest import vocab as V
from hydor_suggest.cache import CacheFit
from hydor_suggest.decode import Cancelled
from hydor_suggest.engine import Engine, theta_for


def llm_script(tok, Vq, text, base_len):
    """A fake language model that spells `text` (token by token) after the prompt's first `base_len` tokens."""
    ids = tok.encode(text, add_special_tokens=False).ids

    def script(prompt):
        i = len(prompt) - base_len
        if 0 <= i < len(ids):
            top = [(ids[i], float(np.log(0.9)))]
            others = [j for j in range(Vq) if j != ids[i]][:60]
            top += [(j, float(np.log(0.1 / 60))) for j in others]
            return top
        return [(j, float(np.log(1.0 / 60))) for j in range(60)]
    return script


class TextCutTests(unittest.TestCase):
    def test_split_typed(self):
        self.assertEqual(V.split_typed('hello wor'), ('hello', ' wor'))
        self.assertEqual(V.split_typed('hello '), ('hello', ' '))
        self.assertEqual(V.split_typed('hello'), ('', 'hello'))
        self.assertEqual(V.split_typed(''), ('', ''))
        self.assertEqual(V.split_typed('a\n\nb'), ('a', '\n\nb'))
        self.assertEqual(V.split_typed('Hello, wor'), ('Hello,', ' wor'))

    def test_last_words(self):
        self.assertEqual(V.last_words('one two  three four', 2), 'three four')
        self.assertEqual(V.last_words('one two', 5), 'one two')
        self.assertEqual(V.last_words('  one two  ', 1), 'two')
        self.assertEqual(V.last_words('one', 0), '')
        self.assertEqual(V.last_words('   ', 3), '')

    def test_segments_and_prefixes(self):
        text = ' '.join(f'w{i}' for i in range(250))
        segs = V.segments(text, 100)
        self.assertEqual(len(segs), 3)
        self.assertEqual(text[segs[0][0]:segs[0][1]].count(' '), 99)
        self.assertEqual(V.prefix_from_ids('chat'), [V.BOS, V.USER])
        self.assertEqual(V.prefix_from_ids('text'), [V.BOS, V.DOC])
        self.assertEqual(V.prefix_from_ids('chat', [10, 11], [12]), [V.BOS, V.AGENT, 10, 11, V.USER, 12, V.USER])
        self.assertEqual(V.prefix_from_ids('doc', doc=[10, 11]), [V.BOS, V.DOC, 10, 11, V.DOC])
        self.assertEqual(V.prefix_from_ids('chat', list(range(10, 20)), max_ctx=3), [V.BOS, V.AGENT, 17, 18, 19, V.USER])
        self.assertEqual(V.build_prefix(), '\n\n')
        self.assertEqual(V.build_prefix('a', '', 'd'), 'a\n\nd\n\n')

    def test_theta_interpolates_and_clamps(self):
        cal = {'mix': {'0.3': 0.2, '0.4': 0.3, '0.5': 0.5}, 'llm': {'0.4': 0.35}}
        self.assertAlmostEqual(theta_for(cal, 'mix', 0.35), 0.25)
        self.assertAlmostEqual(theta_for(cal, 'mix', 0.45), 0.4)
        self.assertAlmostEqual(theta_for(cal, 'mix', 0.3), 0.2)
        self.assertAlmostEqual(theta_for(cal, 'mix', 0.1), 0.2)
        self.assertAlmostEqual(theta_for(cal, 'mix', 0.6), 0.5)
        self.assertAlmostEqual(theta_for(cal, 'llm', 0.5), 0.35)
        self.assertAlmostEqual(theta_for(cal, 'slm', 0.4), 0.3)          # no table of its own: the mix's
        self.assertAlmostEqual(theta_for({}, 'slm', 0.4), 0.4)


class EngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = helpers.tmpdir()
        cls.release = os.path.join(cls.dir.name, 'release')
        cls.config = helpers.make_release(cls.release)
        cls.Vq = cls.config['llm_vocab']
        cls.tok = helpers.make_tokenizer()

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def engine(self, llm_url=None, **kw):
        e = Engine()
        e.load(self.release, kw.pop('personal_dir', None), llm_url, 2, kw.pop('options', None))
        self.addCleanup(lambda: e.client and e.client.close())
        return e

    # ---- the small model alone -------------------------------------------------------------------------------------------
    def test_small_model_alone_answers_in_the_documented_shape(self):
        e = self.engine()
        out = e.suggest({'surface': 'chat', 'text': 'we are writing a message to the as', 'reply': 'Hello, how can I help you today?',
                         'precision': 0.4})
        self.assertEqual(out['plan'], 'slm')
        self.assertEqual(set(out) - {'lang'}, {'word', 'next', 'conf', 'conf_next', 'theta', 'show', 'show_next', 'plan', 'ms'})
        self.assertAlmostEqual(out['theta'], 0.15)
        self.assertEqual(out['show'], out['conf'] >= 0.15)
        self.assertEqual(set(out['ms']), {'total', 'llm', 'slm'})
        self.assertEqual(out['ms']['llm'], 0.0)
        self.assertIsInstance(out['word'], str)
        self.assertTrue(0.0 <= out['conf'] <= 1.0)

    def test_typed_letters_are_not_repeated_in_the_word(self):
        e = self.engine()
        out = e.suggest({'surface': 'text', 'text': 'the quick brown fo'})
        self.assertFalse(out['word'].startswith('fo') and len(out['word']) > 8)
        self.assertEqual(out['word'], out['word'].rstrip())

    def test_typed_words_and_context_words_limit_what_is_read(self):
        e = self.engine()
        text = ' '.join(f'w{i}' for i in range(30)) + ' wor'
        reply = ' '.join(f'r{i}' for i in range(30))
        full = e.prepare({'surface': 'chat', 'text': text, 'reply': reply})
        few = e.prepare({'surface': 'chat', 'text': text, 'reply': reply, 'typed_words': 5, 'context_words': 3})
        none = e.prepare({'surface': 'chat', 'text': text, 'reply': reply, 'context_words': 0})
        self.assertEqual(few.target_text, 'w25 w26 w27 w28 w29')
        self.assertEqual(few.agent_ctx, 'r27 r28 r29')
        self.assertEqual(full.target_text.split()[0], 'w0')
        self.assertEqual(none.agent_ctx, '')
        self.assertEqual(none.slm_ids[:2], [V.BOS, V.USER])
        self.assertLess(len(few.llm_prompt), len(full.llm_prompt))
        doc = e.prepare({'surface': 'doc', 'text': 'a b c', 'doc': reply, 'context_words': 2})
        self.assertEqual(doc.doc_ctx, 'r28 r29')
        e.opts['typed_words'] = 7                                   # the load options are the default
        self.assertEqual(e.prepare({'surface': 'chat', 'text': text}).target_text.count(' '), 6)
        self.assertEqual(e.suggest({'surface': 'chat', 'text': text, 'reply': reply, 'typed_words': 5, 'context_words': 0})['plan'], 'slm')

    def test_empty_and_overlong_typed_words(self):
        e = self.engine()
        out = e.suggest({'surface': 'text', 'text': ''})
        self.assertIn('word', out)
        out = e.suggest({'surface': 'text', 'text': 'x' * 500})
        self.assertEqual((out['word'], out['show']), ('', False))
        with self.assertRaises(ValueError):
            e.suggest({'surface': 'nope', 'text': 'a'})

    def test_state_of_the_small_model_is_extended_not_run_again(self):
        e = self.engine()
        req = {'surface': 'chat', 'text': 'we are writing a message to the as', 'reply': 'Hello, how can I help you today?', 'next': False}
        e.suggest(req)
        full = e.runner.fed
        e.suggest({**req, 'text': 'we are writing a message to the ass'})         # the same context, one more letter typed
        steps_only = e.runner.fed - full
        self.assertLessEqual(steps_only, 8)
        before = e.runner.fed
        e.suggest({**req, 'text': 'we are writing a message to the assistant is'})        # the context grew by a few tokens
        grown = e.runner.fed - before
        self.assertLess(grown, full // 2)
        # and the extended state equals a state run from scratch
        ids = list(e.runner.ids)
        ref = Engine()
        ref.load(self.release, None, None, 2)
        ref.runner.prepare(ids)
        fin = torch.isfinite(e.runner.base_row)
        self.assertTrue(torch.equal(fin, torch.isfinite(ref.runner.base_row)))
        self.assertLess(float((ref.runner.base_row[fin] - e.runner.base_row[fin]).abs().max()), 1e-4)
        # a context that is not an extension starts again
        e.suggest({**req, 'text': 'hello world how are you today a'})
        self.assertGreater(e.runner.fed - before - grown, 5)

    def test_cancel_stops_decoding_between_steps(self):
        e = self.engine()
        n = {'c': 0}

        def cancelled():
            n['c'] += 1
            return n['c'] > 1
        with self.assertRaises(Cancelled):
            e.suggest({'surface': 'text', 'text': 'the quick br'}, cancelled)

    def test_statistics(self):
        e = self.engine()
        for i in range(5):
            e.suggest({'surface': 'text', 'text': 'the quick br' + 'o' * i})
        self.assertEqual(e.requests, 5)
        self.assertLessEqual(e.percentile(0.5), e.percentile(0.9))

    # ---- the language model through llama-server ----------------------------------------------------------------------------
    def test_doc_uses_the_language_model_and_reads_its_prompt(self):
        fake = helpers.FakeLlama(self.Vq)
        self.addCleanup(fake.stop)
        e = self.engine(fake.url)
        doc = 'The project is about writing a small parser. ' * 3
        ctx = V.last_words(doc, 100)
        base = len(self.tok.encode(ctx + '\n\n', add_special_tokens=False).ids) + len(self.tok.encode('the quick', add_special_tokens=False).ids)
        fake.script = llm_script(self.tok, self.Vq, ' brown fox today', base)
        out = e.suggest({'surface': 'doc', 'text': 'the quick bro', 'doc': doc, 'next': True, 'precision': 0.4})
        self.assertEqual(out['plan'], 'llm')
        self.assertEqual(out['word'], 'wn')
        self.assertEqual(out['next'], ' fox')
        self.assertGreater(out['conf'], 0.5)
        self.assertTrue(out['show'])
        self.assertAlmostEqual(out['theta'], 0.35)
        first = fake.requests[0]
        want = self.tok.encode(ctx + '\n\n', add_special_tokens=False).ids + self.tok.encode('the quick', add_special_tokens=False).ids
        self.assertEqual(first['prompt'], want)
        self.assertEqual((first['n_predict'], first['n_probs'], first['temperature'], first['cache_prompt']), (1, 1000, 0, True))
        self.assertGreater(out['ms']['llm'], 0)

    def test_without_next_the_next_word_is_not_decoded(self):
        fake = helpers.FakeLlama(self.Vq)
        self.addCleanup(fake.stop)
        e = self.engine(fake.url)
        base = len(self.tok.encode('\n\n', add_special_tokens=False).ids) + len(self.tok.encode('the quick', add_special_tokens=False).ids)
        fake.script = llm_script(self.tok, self.Vq, ' brown fox today', base)
        a = e.suggest({'surface': 'text', 'text': 'the quick bro', 'next': False, 'switch': False})
        self.assertEqual(a['next'], '')
        n_without = len(fake.requests)
        e.suggest({'surface': 'text', 'text': 'the quick bro', 'next': True, 'switch': False})
        self.assertGreater(len(fake.requests) - n_without, n_without)

    def test_a_low_confidence_word_skips_the_next_word(self):
        fake = helpers.FakeLlama(self.Vq, script=lambda prompt: [(j, float(np.log(1 / 60))) for j in range(60)])
        self.addCleanup(fake.stop)
        e = self.engine(fake.url)
        out = e.suggest({'surface': 'doc', 'text': 'the quick bro', 'next': True})
        self.assertFalse(out['show'])
        self.assertEqual((out['next'], out['conf_next'], out['show_next']), ('', 0.0, False))

    def test_plan_follows_the_language_guess(self):
        fake = helpers.FakeLlama(self.Vq)
        self.addCleanup(fake.stop)
        e = self.engine(fake.url)
        en = 'the quick brown fox jumps over the lazy dog and we are writing a message'
        el = 'ευχαριστώ πολύ για τη βοήθεια σας καλημέρα σας τι κάνετε σήμερα'
        out = e.suggest({'surface': 'chat', 'text': en + ' th', 'reply': ''})
        self.assertEqual((out['plan'], out.get('lang')), ('llm', 'eng_Latn'))            # the switch gives English to the language model
        out = e.suggest({'surface': 'chat', 'text': el + ' κα', 'reply': ''})
        self.assertEqual((out['plan'], out.get('lang')), ('mix', 'ell_Grek'))
        out = e.suggest({'surface': 'chat', 'text': en + ' th', 'reply': '', 'switch': False})
        self.assertEqual(out['plan'], 'mix')
        out = e.suggest({'surface': 'chat', 'text': 'the qu', 'reply': ''})
        self.assertEqual(out['plan'], 'mix')                                              # too few tokens to guess a language
        self.assertNotIn('lang', out)

    def test_a_language_the_person_wrote_a_lot_in_uses_the_mix(self):
        fake = helpers.FakeLlama(self.Vq)
        self.addCleanup(fake.stop)
        with helpers.tmpdir() as pd:
            self.write_personal(pd, {'eng_Latn': 2500, 'ell_Grek': 100})
            e = self.engine(fake.url, personal_dir=pd)
            en = 'the quick brown fox jumps over the lazy dog and we are writing a message'
            self.assertEqual(e.suggest({'surface': 'chat', 'text': en + ' th'})['plan'], 'mix')
            e2 = self.engine(fake.url)
            self.assertEqual(e2.suggest({'surface': 'chat', 'text': en + ' th'})['plan'], 'llm')
            self.assertEqual(e.suggest({'surface': 'doc', 'text': en + ' th'})['plan'], 'llm')

    def test_mix_asks_the_language_model_for_each_step_and_mixes(self):
        fake = helpers.FakeLlama(self.Vq)
        self.addCleanup(fake.stop)
        e = self.engine(fake.url)
        out = e.suggest({'surface': 'text', 'text': 'we write a mess', 'switch': False})
        self.assertEqual(out['plan'], 'mix')
        self.assertGreaterEqual(len(fake.requests), 1)
        self.assertGreater(out['ms']['llm'], 0)
        self.assertGreater(out['ms']['slm'], 0)
        # each step's prompt extends the one before by the decoded token
        prompts = [r['prompt'] for r in fake.requests]
        self.assertTrue(all(len(b) == len(a) + 1 and b[:len(a)] == a for a, b in zip(prompts, prompts[1:])))

    def test_a_language_model_that_stops_answering_falls_back_to_the_small_model(self):
        fake = helpers.FakeLlama(self.Vq)
        e = self.engine(fake.url)
        e.suggest({'surface': 'text', 'text': 'we write a mess', 'switch': False})
        fake.close_each = True
        fake.stop()
        e.client.close()
        out = e.suggest({'surface': 'text', 'text': 'we write a mess', 'switch': False})
        self.assertEqual(out['plan'], 'slm')
        self.assertIsNotNone(e.llm_error)

    # ---- the session cache -------------------------------------------------------------------------------------------------
    def test_session_cache_steers_the_word(self):
        e = self.engine(options={'max_tokens': 16})         # the tiny tokenizer cuts a word into many small tokens
        e.release.cache_fits['slm'] = CacheFit(8.0, 0.0, 8.0)            # a cache that decides
        e.session('s1', ['please send the quarterly spreadsheet', 'the quarterly spreadsheet is attached'])
        with_cache = e.suggest({'surface': 'chat', 'text': 'could you open the quar', 'session': 's1', 'cache': True, 'next': False})
        without = e.suggest({'surface': 'chat', 'text': 'could you open the quar', 'session': 's1', 'cache': False, 'next': False})
        self.assertEqual(with_cache['word'], 'terly')
        self.assertGreater(with_cache['conf'], 0.02)
        self.assertGreater(with_cache['conf'], without['conf'])
        other = e.suggest({'surface': 'chat', 'text': 'could you open the quar', 'session': 'unknown', 'cache': True, 'next': False})
        self.assertLess(other['conf'], with_cache['conf'])

    def test_the_agents_reply_and_the_previous_message_feed_the_cache(self):
        e = self.engine(options={'max_tokens': 16})
        e.release.cache_fits['slm'] = CacheFit(8.0, 0.0, 8.0)
        out = e.suggest({'surface': 'chat', 'text': 'could you open the quar', 'reply': 'The quarterly spreadsheet is ready.',
                         'prev': 'send the quarterly spreadsheet', 'next': False})
        self.assertEqual(out['word'], 'terly')

    def test_sessions_are_kept_for_the_last_few(self):
        e = self.engine(options={'sessions': 2})
        for i in range(4):
            e.session(f's{i}', [f'text {i}'])
        self.assertEqual(list(e._session_texts), ['s2', 's3'])

    # ---- the personal model -------------------------------------------------------------------------------------------------
    def write_personal(self, folder, languages, break_it=False):
        from safetensors.torch import save_file
        from hydor_suggest.model import SLM, config_from_dict, state_for_save
        torch.manual_seed(5)
        m = SLM(config_from_dict(self.config['slm']))
        sd = state_for_save(m)
        if break_it:
            del sd['emb_proj.weight']
        save_file(sd, os.path.join(folder, 'model.safetensors'))
        helpers.write_json(os.path.join(folder, 'config.json'), self.config)
        helpers.write_json(os.path.join(folder, 'meta.json'), {'trained_at': 1, 'tokens': 5000, 'languages': languages, 'dev_nll': 5.0})

    def test_personal_model_and_its_gate_are_used(self):
        with helpers.tmpdir() as pd:
            self.write_personal(pd, {'ell_Grek': 3000})
            gate = {'features': ['llm_entropy', 'llm_maxp', 'slm_entropy', 'slm_maxp', 'slm_unk', 'log1p_pos', 'word_start'],
                    'w': [0] * 7, 'b': 9.0, 'mu': [0] * 7, 'sd': [1] * 7}
            helpers.write_json(os.path.join(pd, 'gate.json'), gate)
            e = Engine()
            res = e.load(self.release, pd, None, 2)
            self.assertEqual(res, {'model': 'personal', 'languages': {'ell_Grek': 3000}})
            self.assertEqual(e.gate.b, 9.0)
            base = Engine()
            self.assertEqual(base.load(self.release, None, None, 2), {'model': 'base', 'languages': {}})
            self.assertNotEqual(base.gate.b, 9.0)
            a = e.suggest({'surface': 'text', 'text': 'the quick br'})
            b = base.suggest({'surface': 'text', 'text': 'the quick br'})
            self.assertNotEqual((a['word'], a['conf']), (b['word'], b['conf']))

    def test_a_broken_personal_model_leaves_the_base_one_running(self):
        with helpers.tmpdir() as pd:
            self.write_personal(pd, {'ell_Grek': 3000}, break_it=True)
            e = Engine()
            res = e.load(self.release, pd, None, 2)
            self.assertEqual((res['model'], res['languages']), ('base', {}))
            self.assertIn('personal_error', res)
            self.assertEqual(e.suggest({'surface': 'text', 'text': 'the quick br'})['plan'], 'slm')

    def test_a_release_in_another_format_is_refused(self):
        with helpers.tmpdir() as d:
            helpers.make_release(d)
            with open(os.path.join(d, 'config.json')) as f:
                cfg = json.load(f)
            cfg['format'] = 'hydor-suggest/9'
            helpers.write_json(os.path.join(d, 'config.json'), cfg)
            with self.assertRaises(ValueError):
                Engine().load(d)


if __name__ == '__main__':
    unittest.main()
