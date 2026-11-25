import json
import os
import unittest

import helpers
import numpy as np

from hydor_suggest import vocab as V
from hydor_suggest.cache import CacheFit
from hydor_suggest.decode import Cancelled
from hydor_suggest.engine import Engine, theta_for, with_points


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

    def test_with_points_adds_thresholds_the_release_does_not_list(self):
        cal = {'mix': {'0.3': 0.2, '0.4': 0.3, '0.5': 0.5}, 'llm': {'0.3': 0.25, '0.4': 0.35}, 'source': 'flores'}
        before = json.loads(json.dumps(cal))
        extra = {'mix': {'0.2': 0.08, '0.25': 0.14}, 'llm': {'0.2': 0.1}, 'slm': {'0.2': 0.11}}
        out = with_points(cal, extra)
        self.assertEqual(out['mix'], {'0.3': 0.2, '0.4': 0.3, '0.5': 0.5, '0.2': 0.08, '0.25': 0.14})
        self.assertEqual(out['llm'], {'0.3': 0.25, '0.4': 0.35, '0.2': 0.1})
        self.assertNotIn('slm', out)                                     # the release has no table for it: it keeps using the mix's
        self.assertEqual(out['source'], 'flores')                        # entries that are not tables stay
        self.assertEqual(cal, before)                                    # the input is not changed
        self.assertIsNot(out['mix'], cal['mix'])
        # A precision the release lists is never replaced, however it is written.
        out = with_points({'mix': {'0.30': 0.2, '0.4': 0.3}}, {'mix': {'0.3': 0.99, '0.4': 0.99, '0.2': 0.05}})
        self.assertEqual(out['mix'], {'0.30': 0.2, '0.4': 0.3, '0.2': 0.05})
        out = with_points({'mix': {'0.3': 0.2}}, {'mix': {'0.30': 0.99}})
        self.assertEqual(out['mix'], {'0.3': 0.2})
        # Nothing to add, or nothing to add to.
        self.assertEqual(with_points(cal, None), cal)
        self.assertEqual(with_points(cal, {}), cal)
        self.assertEqual(with_points({}, extra), {})
        self.assertEqual(with_points(None, extra), {})
        self.assertEqual(with_points({'mix': 'odd'}, {'mix': {'0.2': 0.1}}), {'mix': 'odd'})
        # The merged table interpolates between the new point and the release's first, and 0.2 no longer clamps to the 0.3 threshold.
        merged = with_points(cal, extra)
        self.assertAlmostEqual(theta_for(cal, 'mix', 0.2), 0.2)           # as the release alone: clamped to the 0.3 threshold
        self.assertAlmostEqual(theta_for(merged, 'mix', 0.2), 0.08)
        self.assertAlmostEqual(theta_for(merged, 'mix', 0.25), 0.14)
        self.assertAlmostEqual(theta_for(merged, 'mix', 0.275), 0.17)     # between 0.25 (0.14) and 0.3 (0.2)
        self.assertAlmostEqual(theta_for(merged, 'mix', 0.3), 0.2)
        self.assertAlmostEqual(theta_for(merged, 'mix', 0.35), 0.25)      # the release's own points are as they were
        self.assertAlmostEqual(theta_for(merged, 'mix', 0.1), 0.08)
        self.assertAlmostEqual(theta_for(merged, 'llm', 0.2), 0.1)
        self.assertAlmostEqual(theta_for(merged, 'llm', 0.25), 0.175)     # between 0.2 (0.1) and 0.3 (0.25)
        self.assertAlmostEqual(theta_for(merged, 'slm', 0.2), 0.08)       # no table of its own: the mix's, with its new points


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
        self.assertEqual(set(out) - {'lang'}, {'word', 'next', 'conf', 'conf_next', 'theta', 'show', 'show_next', 'plan', 'ms', 'model'})
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
        fin = np.isfinite(e.runner.base_row)
        self.assertTrue(np.array_equal(fin, np.isfinite(ref.runner.base_row)))
        self.assertLess(float(np.abs(ref.runner.base_row[fin] - e.runner.base_row[fin]).max()), 1e-4)
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

    def lone_space_script(self, text, base_len):
        """A language model that likes a lone space token first (as Qwen does), then spells `text` as the tokenizer writes it."""
        spell = llm_script(self.tok, self.Vq, text, base_len)
        space = self.tok.token_to_id('\u0120')

        def script(prompt):
            top = spell(prompt)
            return [(space, float(np.log(0.6)))] + [(i, lp) for i, lp in top if i != space] if len(prompt) == base_len else top
        return script

    def test_a_lone_space_is_not_taken_for_the_word(self):
        fake = helpers.FakeLlama(self.Vq)
        self.addCleanup(fake.stop)
        e = self.engine(fake.url)
        base = len(self.tok.encode('\n\n', add_special_tokens=False).ids) + len(self.tok.encode('is it the', add_special_tokens=False).ids)
        # typed after a word: the word is the one after the separator, without a second space
        fake.script = self.lone_space_script(' project plan', base)
        out = e.suggest({'surface': 'doc', 'text': 'is it the ', 'next': True})
        self.assertEqual((out['word'], out['next']), ('project', ' plan'))
        self.assertGreater(out['conf'], 0.7)                         # not 0.6/0.9 of a path through the lone space
        # typed letters of a word: the lone space is the likeliest allowed token, but a word does not begin with it
        out = e.suggest({'surface': 'doc', 'text': 'is it the proj', 'next': False})
        self.assertEqual(out['word'], 'ect')
        self.assertGreater(out['conf'], 0.7)

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
        code = 'the quick brown fox = foo(bar[0]) + /usr/bin/the_lazy_dog_x.sh th'
        out = e.suggest({'surface': 'chat', 'text': code, 'reply': ''})
        self.assertEqual(out['plan'], 'mix')                                              # code is not a language
        self.assertNotIn('lang', out)
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
        e.session('s1', ['please send the project plan', 'the project is attached'])
        with_cache = e.suggest({'surface': 'chat', 'text': 'could you open the proj', 'session': 's1', 'cache': True, 'next': False})
        without = e.suggest({'surface': 'chat', 'text': 'could you open the proj', 'session': 's1', 'cache': False, 'next': False})
        self.assertEqual(with_cache['word'], 'ect')
        self.assertGreater(with_cache['conf'], 0.02)
        self.assertGreater(with_cache['conf'], without['conf'])
        other = e.suggest({'surface': 'chat', 'text': 'could you open the proj', 'session': 'unknown', 'cache': True, 'next': False})
        self.assertLess(other['conf'], with_cache['conf'])

    def test_the_agents_reply_and_the_previous_message_feed_the_cache(self):
        e = self.engine(options={'max_tokens': 16})
        e.release.cache_fits['slm'] = CacheFit(8.0, 0.0, 8.0)
        out = e.suggest({'surface': 'chat', 'text': 'could you open the proj', 'reply': 'The project is ready.',
                         'prev': 'send the project plan', 'next': False})
        self.assertEqual(out['word'], 'ect')

    def test_sessions_are_least_recently_used_out_and_ids_are_strings(self):
        e = self.engine(options={'sessions': 3})
        for sid in ('a', 'b', 'c'):
            e.session(sid, [f'text {sid}'])
        e.session('a', ['text a again'])                       # a was used: b is now the oldest
        e.session('d', ['text d'])
        self.assertEqual(list(e._session_texts), ['c', 'a', 'd'])
        e.suggest({'surface': 'chat', 'text': 'the qu', 'session': 'c', 'next': False})      # a suggest in c uses it too
        e.session('e', ['text e'])
        self.assertEqual(list(e._session_texts), ['d', 'c', 'e'])
        self.assertIn('c', e._session_texts)
        self.assertNotIn('a', e._session_texts)
        e.session(7, ['numbers are ids too'])                  # an id that is a number is the same session as its string
        e.session('7', ['again'])
        self.assertEqual([k for k in e._session_texts if k == '7'], ['7'])
        self.assertEqual(e._session_texts['7'], ['again'])
        e.suggest({'surface': 'chat', 'text': 'the qu', 'session': 7, 'next': False})          # a suggest with a number finds it

    def test_typed_words_zero_is_zero_not_the_default(self):
        e = self.engine()
        pr = e.prepare({'surface': 'chat', 'text': 'one two three wor', 'typed_words': 0})
        self.assertEqual(pr.target_text, '')
        pr = e.prepare({'surface': 'chat', 'text': 'one two three wor'})
        self.assertEqual(pr.target_text, 'one two three')

    def test_calibration_of_the_app_adds_thresholds_to_the_releases_own(self):
        own = json.loads(json.dumps(self.calibration_file()))
        extra = {'mix': {'0.2': 0.05}, 'llm': {'0.2': 0.07}, 'slm': {'0.2': 0.04}}
        e = self.engine()
        ask = {'surface': 'text', 'text': 'we are writing a message to the as', 'precision': 0.2}
        out = e.suggest(ask)
        self.assertEqual(out['plan'], 'slm')                                       # no language model: the small model's table
        self.assertAlmostEqual(out['theta'], 0.1)                                  # the release's own: 0.2 clamps to its 0.3 threshold
        e.load(self.release, None, None, 2, None, extra)
        self.assertEqual(e.release.own_calibration, own)
        self.assertEqual(e.release.calibration['slm'], {**own['slm'], '0.2': 0.04})
        out = e.suggest(ask)
        self.assertEqual(out['plan'], 'slm')
        self.assertAlmostEqual(out['theta'], 0.04)
        self.assertAlmostEqual(e.suggest({**ask, 'precision': 0.25})['theta'], 0.07)  # halfway between 0.04 and the release's 0.1
        self.assertAlmostEqual(e.suggest({**ask, 'precision': 0.4})['theta'], 0.15)   # the release's own points are as they were
        self.assertAlmostEqual(e.suggest({'surface': 'text', 'text': ask['text']})['theta'], 0.04)   # the default precision is 0.2
        # Loaded again without them, it is the release's own table again.
        e.load(self.release, None, None, 2)
        self.assertEqual(e.release.calibration, own)
        self.assertEqual(e.release.own_calibration, own)
        self.assertAlmostEqual(e.suggest(ask)['theta'], 0.1)
        # And again with them: the release's file was not changed by the first time.
        e.load(self.release, None, None, 2, None, extra)
        self.assertAlmostEqual(e.suggest(ask)['theta'], 0.04)
        self.assertEqual(e.release.own_calibration, own)

    def test_a_load_that_fails_does_not_keep_the_added_thresholds(self):
        e = self.engine()
        before = e.release.calibration
        with self.assertRaises(Exception):
            e.load(self.release, None, 'ftp://nowhere', 2, None, {'slm': {'0.2': 0.01}})
        self.assertIs(e.release.calibration, before)
        self.assertNotIn('0.2', e.release.calibration['slm'])
        self.assertAlmostEqual(e.suggest({'surface': 'text', 'text': 'the quick br', 'precision': 0.2})['theta'], 0.1)

    def calibration_file(self):
        with open(os.path.join(self.release, 'calibration.json'), encoding='utf-8') as f:
            return json.load(f)

    def test_a_load_that_fails_changes_nothing(self):
        e = self.engine()
        runner, model, release = e.runner, e.model, e.release
        with self.assertRaises(Exception):
            e.load(self.release, None, 'ftp://nowhere', 2)               # the client cannot be built
        self.assertIs(e.runner, runner)
        self.assertIs(e.model, model)
        self.assertIs(e.release, release)
        self.assertIn('word', e.suggest({'surface': 'text', 'text': 'the quick br'}))
        with self.assertRaises(Exception):
            e.load(os.path.join(self.dir.name, 'missing'))
        self.assertIs(e.release, release)

    def test_a_language_model_that_failed_is_left_alone_for_a_while(self):
        fake = helpers.FakeLlama(self.Vq)
        e = self.engine(fake.url)
        now = {'t': 1000.0}
        e._clock = lambda: now['t']
        e.suggest({'surface': 'text', 'text': 'we write a mess', 'switch': False})
        fake.stop()
        e.client.close()
        out = e.suggest({'surface': 'text', 'text': 'we write a mess', 'switch': False})
        self.assertEqual(out['plan'], 'slm')                                 # fell back, and noted it
        fake2 = helpers.FakeLlama(self.Vq)
        self.addCleanup(fake2.stop)
        e.client = type(e.client)(fake2.url)                                 # the server is back, but is not asked yet
        now['t'] += 10
        self.assertEqual(e.suggest({'surface': 'text', 'text': 'we write a mess', 'switch': False})['plan'], 'slm')
        self.assertEqual(fake2.requests, [])
        now['t'] += 25                                                       # 30 s after the failure
        self.assertEqual(e.suggest({'surface': 'text', 'text': 'we write a mess', 'switch': False})['plan'], 'mix')
        self.assertGreater(len(fake2.requests), 0)
        e.client.close()

    def test_no_answer_for_one_prompt_does_not_switch_the_language_model_off(self):
        fake = helpers.FakeLlama(self.Vq)
        self.addCleanup(fake.stop)
        e = self.engine(fake.url)
        fake.drop_probs = lambda body: True                                  # the server is there, but gives no probabilities
        out = e.suggest({'surface': 'text', 'text': 'we write a mess', 'switch': False})
        self.assertEqual(out['plan'], 'slm')                                 # this suggestion comes from the small model
        self.assertIsNotNone(e.llm_error)
        self.assertEqual(e.llm_down_until, 0.0)
        fake.drop_probs = None
        self.assertEqual(e.suggest({'surface': 'text', 'text': 'we write a mess', 'switch': False})['plan'], 'mix')

    def test_the_token_cache_is_bounded_by_characters(self):
        import hydor_suggest.engine as eng
        e = self.engine()
        old = eng.ENC_MAX_CHARS
        eng.ENC_MAX_CHARS = 5000
        self.addCleanup(lambda: setattr(eng, 'ENC_MAX_CHARS', old))
        for i in range(20):
            e.encode(('word%d ' % i) * 150)                                  # about 900 characters each
        self.assertLessEqual(e._enc_chars, 5000)
        self.assertEqual(e._enc_chars, sum(len(k) for k in e._enc))
        self.assertGreater(len(e._enc), 0)

    def test_sessions_are_kept_for_the_last_few(self):
        e = self.engine(options={'sessions': 2})
        for i in range(4):
            e.session(f's{i}', [f'text {i}'])
        self.assertEqual(list(e._session_texts), ['s2', 's3'])

    # ---- the personal model -------------------------------------------------------------------------------------------------
    def write_personal(self, folder, languages, break_it=False):
        from hydor_suggest.config import config_from_dict
        sd = helpers.random_weights(config_from_dict(self.config['slm']), seed=5)
        if break_it:
            del sd['emb_proj.weight']
        helpers.save_weights(os.path.join(folder, 'model.safetensors'), sd)
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

    EN = 'the quick brown fox jumps over the lazy dog and we are writing a message'
    EL = 'ευχαριστώ πολύ για τη βοήθεια σας καλημέρα σας τι κάνετε σήμερα'

    def test_both_small_models_are_loaded_and_share_the_graph(self):
        with helpers.tmpdir() as pd:
            self.write_personal(pd, {'eng_Latn': 3000})
            e = self.engine(personal_dir=pd)
            self.assertIsNotNone(e.base)
            self.assertIsNotNone(e.personal)
            self.assertIsNot(e.base.model, e.personal.model)
            self.assertEqual(e.base.model.graph, e.personal.model.graph)          # one graph, two weight sets
            self.assertFalse(np.array_equal(e.base.model.table, e.personal.model.table))
            self.assertIsNot(e.base.runner, e.personal.runner)                     # a state of its own each
            self.assertEqual((e.kind, e.languages), ('personal', {'eng_Latn': 3000}))
            alone = self.engine()
            self.assertIsNone(alone.personal)
            self.assertEqual((alone.kind, alone.languages), ('base', {}))

    def test_a_language_the_person_writes_in_uses_the_personal_model_and_others_the_published_one(self):
        fake = helpers.FakeLlama(self.Vq)
        self.addCleanup(fake.stop)
        with helpers.tmpdir() as pd:
            self.write_personal(pd, {'eng_Latn': 2500, 'ell_Grek': 100})          # Greek: too few of their tokens to count
            e = self.engine(fake.url, personal_dir=pd)
            out = e.suggest({'surface': 'chat', 'text': self.EN + ' th', 'reply': ''})
            self.assertEqual((out['lang'], out['plan'], out['model']), ('eng_Latn', 'mix', 'personal'))
            out = e.suggest({'surface': 'chat', 'text': self.EL + ' κα', 'reply': ''})
            self.assertEqual((out['lang'], out['plan'], out['model']), ('ell_Grek', 'mix', 'base'))     # the switch keeps its say
            out = e.suggest({'surface': 'chat', 'text': 'the qu', 'reply': ''})
            self.assertNotIn('lang', out)
            self.assertEqual((out['plan'], out['model']), ('mix', 'personal'))              # no confident guess: the personal one
            out = e.suggest({'surface': 'text', 'text': 'the quick br'})
            self.assertEqual(out['model'], 'personal')
            # a document keeps its plan (Qwen3.5 alone), which uses no small model
            out = e.suggest({'surface': 'doc', 'text': self.EN + ' th'})
            self.assertEqual(out['plan'], 'llm')
            self.assertNotIn('model', out)

    def test_a_language_not_written_in_follows_the_switch_with_the_published_model(self):
        fake = helpers.FakeLlama(self.Vq)
        self.addCleanup(fake.stop)
        with helpers.tmpdir() as pd:
            self.write_personal(pd, {'ell_Grek': 3000})
            e = self.engine(fake.url, personal_dir=pd)
            out = e.suggest({'surface': 'chat', 'text': self.EN + ' th', 'reply': ''})
            self.assertEqual((out['lang'], out['plan']), ('eng_Latn', 'llm'))                # the switch gives English to Qwen3.5 alone
            self.assertNotIn('model', out)
            out = e.suggest({'surface': 'chat', 'text': self.EN + ' th', 'reply': '', 'switch': False})
            self.assertEqual((out['plan'], out['model']), ('mix', 'base'))                   # mixed with the published model
            out = e.suggest({'surface': 'chat', 'text': self.EL + ' κα', 'reply': ''})
            self.assertEqual((out['plan'], out['model']), ('mix', 'personal'))
            # without the language model the small model answers alone: the published one outside the person's languages
            e.client.close()
            e.client = None
            out = e.suggest({'surface': 'chat', 'text': self.EN + ' th', 'reply': ''})
            self.assertEqual((out['plan'], out['model']), ('slm', 'base'))
            out = e.suggest({'surface': 'chat', 'text': self.EL + ' κα', 'reply': ''})
            self.assertEqual((out['plan'], out['model']), ('slm', 'personal'))

    def test_the_published_model_answers_as_it_does_alone_and_the_personal_one_differently(self):
        with helpers.tmpdir() as pd:
            self.write_personal(pd, {'ell_Grek': 3000})
            both = self.engine(personal_dir=pd)
            alone = self.engine()
            req = {'surface': 'chat', 'text': self.EN + ' th', 'reply': ''}
            a, b = both.suggest(dict(req)), alone.suggest(dict(req))
            self.assertEqual((a['model'], b['model']), ('base', 'base'))
            self.assertEqual((a['word'], a['conf'], a['conf_next']), (b['word'], b['conf'], b['conf_next']))
            c = both.suggest({'surface': 'chat', 'text': self.EL + ' κα', 'reply': ''})
            self.assertEqual(c['model'], 'personal')

    def test_each_small_model_keeps_its_own_state(self):
        with helpers.tmpdir() as pd:
            self.write_personal(pd, {'ell_Grek': 3000})
            e = self.engine(personal_dir=pd)
            e.suggest({'surface': 'chat', 'text': self.EN + ' th', 'reply': ''})                  # the published model
            base_ids = list(e.base.runner.ids)
            personal_ids = list(e.personal.runner.ids)
            self.assertEqual(personal_ids, [V.BOS, V.DOC])                                      # untouched by it
            e.suggest({'surface': 'chat', 'text': self.EL + ' κα', 'reply': ''})                  # the personal one
            self.assertEqual(list(e.base.runner.ids), base_ids)                                 # and it did not touch the published one's
            self.assertGreater(len(e.personal.runner.ids), 2)
            fed = e.base.runner.fed
            e.suggest({'surface': 'chat', 'text': self.EN + ' th', 'reply': ''})                  # the same context again: no new tokens fed
            self.assertLess(e.base.runner.fed - fed, len(base_ids))

    def test_a_reload_keeps_the_models_that_did_not_change_and_drops_a_removed_personal_one(self):
        with helpers.tmpdir() as pd:
            self.write_personal(pd, {'ell_Grek': 3000})
            e = self.engine(personal_dir=pd)
            base, personal = e.base.model, e.personal.model
            e.load(self.release, pd, None, 2)
            self.assertIs(e.base.model, base)
            self.assertIs(e.personal.model, personal)
            res = e.load(self.release, None, None, 2)
            self.assertEqual(res, {'model': 'base', 'languages': {}})
            self.assertIsNone(e.personal)
            self.assertIs(e.base.model, base)
            self.assertIsNone(personal.pool)                                                    # let go of
            self.assertEqual(e.suggest({'surface': 'text', 'text': 'the quick br'})['model'], 'base')

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
