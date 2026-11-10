// Hidden checker for regex-linear. Run: node check.mjs <workdir>
// Every case runs in a child process of its own (node check.mjs <workdir> --case <n>) with a time limit, so a case
// that hangs fails alone: correctness cases get 5 seconds and run four at a time, the timed cases get 2 seconds each
// (the whole process, loading the module included) and run one at a time.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const self = fileURLToPath(import.meta.url);
const cases = [];
const test = (name, fn, kind = 'case') => cases.push({ name, fn, kind });

// In a child: notices any use of JavaScript's regular expressions while the module's own code runs.
let inUser = 0;
let regexUsed = false;
const user = (fn) => {
  inUser++;
  try {
    return fn();
  } finally {
    inUser--;
  }
};
const load = async () => {
  inUser++;
  try {
    return await import(pathToFileURL(path.join(dir, 'src/regex.mjs')).href);
  } finally {
    inUser--;
  }
};

const show = (s) => JSON.stringify(s.length > 60 ? `${s.slice(0, 40)}…(${s.length} chars)` : s);

// Table of [pattern, text, expected]: expected is null (no match) or [index, matched text]. Checks match and test.
function matches(name, rows) {
  test(name, async () => {
    const { compile } = await load();
    for (const [pattern, text, expected] of rows) {
      const re = user(() => compile(pattern));
      const got = user(() => re.match(text));
      const where = `${show(pattern)} on ${show(text)}`;
      if (expected === null) assert.ok(got === null, `${where}: match gave ${JSON.stringify(got)}, expected null`);
      else {
        assert.ok(got !== null && typeof got === 'object', `${where}: match gave ${got}, expected { index: ${expected[0]}, text: ${show(expected[1])} }`);
        assert.ok(got.index === expected[0] && got.text === expected[1], `${where}: match gave { index: ${got.index}, text: ${show(String(got.text))} }, expected { index: ${expected[0]}, text: ${show(expected[1])} }`);
      }
      const t = user(() => re.test(text));
      assert.equal(t, expected !== null, `${where}: test gave ${t}`);
    }
  });
}

// Table of [pattern, position]: compile must throw a SyntaxError with that position, also named in its message.
function errors(name, rows) {
  test(name, async () => {
    const { compile } = await load();
    for (const [pattern, position] of rows) {
      let err;
      try {
        user(() => compile(pattern));
      } catch (e) {
        err = e;
      }
      assert.ok(err, `${show(pattern)} compiled without an error`);
      assert.ok(err instanceof SyntaxError, `${show(pattern)} threw ${err?.name}, not a SyntaxError`);
      assert.equal(err.position, position, `${show(pattern)}: position ${err.position}, expected ${position}`);
      const named = String(err.message).match(/position (\d+)/);
      assert.ok(named && Number(named[1]) === position, `${show(pattern)}: the message ${JSON.stringify(err.message)} does not name position ${position}`);
    }
  });
}

// ---------- literals, characters, the dot ----------
matches('literal text is found anywhere', [
  ['abc', 'xxabcxx', [2, 'abc']], ['abc', 'ab', null], ['abc', 'abcabc', [0, 'abc']], ['a', '', null], ['hello world', 'say hello world!', [4, 'hello world']],
]);
matches('case-sensitive, by UTF-16 code units', [
  ['a', 'A', null], ['A', 'aA', [1, 'A']], ['a.b', 'a😀b', null], ['a..b', 'a😀b', [0, 'a😀b']], ['é+', 'caféé', [3, 'éé']], ['😀', 'x😀', [1, '😀']],
]);
matches('the empty pattern and empty groups match the empty text at 0', [
  ['', '', [0, '']], ['', 'abc', [0, '']], ['()', 'abc', [0, '']], ['|', 'x', [0, '']], ['(|)', 'x', [0, '']],
]);
matches('the dot matches anything but a line feed', [
  ['a.c', 'a\nc abc', [4, 'abc']], ['.', '\n', null], ['.', '\r', [0, '\r']], ['.+', '\nab\ncd', [1, 'ab']], ['.*', '\nab', [0, '']], ['a.*', 'xa\nb', [1, 'a']],
]);
matches('punctuation that is literal outside a class', [
  [']', 'a]', [1, ']']], ['a}', 'a}', [0, 'a}']], ['a-b,c/d', 'xa-b,c/d', [1, 'a-b,c/d']], ['a b', 'a  a b', [3, 'a b']], ['x}{2}', 'x}}}', [0, 'x}}']], ['\n', 'a\nb', [1, '\n']],
]);
matches('escaped special characters', [
  ['\\.', 'a.b', [1, '.']], ['a\\*', 'aa*', [1, 'a*']], ['\\(\\)', 'f()', [1, '()']], ['\\[\\]', '[]', [0, '[]']], ['\\{\\}', '{}', [0, '{}']], ['\\|', 'a|b', [1, '|']],
  ['\\?\\+', '?+', [0, '?+']], ['\\^\\$', '^$', [0, '^$']], ['\\\\', 'a\\b', [1, '\\']], ['\\-\\/', '-/', [0, '-/']],
]);
matches('control escapes', [['\\n', 'a\nb', [1, '\n']], ['\\t+', 'a\t\tb', [1, '\t\t']], ['\\r\\n', 'x\r\n', [1, '\r\n']], ['a\\nb', 'a\\nb', null]]);
matches('digit, word and space escapes', [
  ['\\d+', 'ab123c', [2, '123']], ['\\w+', '!!foo_Bar9 x', [2, 'foo_Bar9']], ['\\s+', 'a \t\n\x0b\x0c\rb', [1, ' \t\n\x0b\x0c\r']], ['\\s', '\u00a0', null], ['\\w', 'é', null], ['\\d', '٣', null],
]);
matches('negated set escapes', [['\\D+', '12ab\n3', [2, 'ab\n']], ['\\W+', 'ab!? c', [2, '!? ']], ['\\S+', '  \u00a0x ', [2, '\u00a0x']], ['\\D', '123', null]]);

// ---------- classes ----------
matches('classes and ranges', [
  ['[abc]+', 'xxcabd', [2, 'cab']], ['[a-z]+', 'ABcdeF', [2, 'cde']], ['[a-zA-Z0-9_]+', '--Ab_9--', [2, 'Ab_9']], ['[0-9][0-9]', 'a1b23', [3, '23']], ['[à-ÿ]+', 'caféé!', [3, 'éé']],
]);
matches('negated classes, line feeds included', [['[^a]', 'aaa\n', [3, '\n']], ['[^a-z]+', 'abc12\nD', [3, '12\nD']], ['[^\\n]+', '\n\nab\n', [2, 'ab']], ['[^abc]', 'abc', null]]);
matches('special characters inside a class stand for themselves', [
  ['[.]', 'a.b', [1, '.']], ['[*+?]+', 'a*+?b', [1, '*+?']], ['[(|)]+', 'x(|)y', [1, '(|)']], ['[$^]', 'a^', [1, '^']], ['[a^]+', '^a^', [0, '^a^']], ['[[]', 'a[', [1, '[']], ['[{}]+', '{}', [0, '{}']],
]);
matches('escapes inside a class', [
  ['[\\]]', 'a]', [1, ']']], ['[\\\\]', 'a\\', [1, '\\']], ['[\\-x]+', 'a-x-', [1, '-x-']], ['[\\^]', 'a^', [1, '^']], ['[\\d.]+', 'v1.25!', [1, '1.25']], ['[\\s,]+', 'a, b', [1, ', ']],
  ['[\\n\\t]+', 'a\n\tb', [1, '\n\t']],
]);
matches('set escapes inside a class, negated or not', [['[\\D]+', '12ab3', [2, 'ab']], ['[\\S\\s]+', 'a\nb', [0, 'a\nb']], ['[^\\d\\s]+', '1 2ab 3', [3, 'ab']], ['[\\W\\d]+', 'ab1!2c', [2, '1!2']], ['[^\\W]+', '!!ab_1!', [2, 'ab_1']]]);
matches('where a dash is literal in a class', [
  ['[-a]+', 'x-a-', [1, '-a-']], ['[a-]+', 'x-a-', [1, '-a-']], ['[^-a]+', '-ab-', [2, 'b']], ['[a-c-e]+', 'x-cab-e', [1, '-cab-e']], ['[a-c-e]', 'd', null], ['[--/]+', 'a-./b', [1, '-./']],
  ['[a-c-a]+', 'x-ba', [1, '-ba']],
]);
matches('ranges with escaped ends', [['[\\--\\/]+', 'a-./b', [1, '-./']], ['[\\t-\\r]+', 'a\t\n\rb', [1, '\t\n\r']], ['[!-\\-]+', 'a!#-.', [1, '!#-']], ['[\\]-a]+', 'x^_`a]b', [1, '^_`a]']]]);
matches('a dot and a negated class differ on line feeds', [['a.b', 'a\nb', null], ['a[^x]b', 'a\nb', [0, 'a\nb']], ['a\\Wb', 'a\nb', [0, 'a\nb']], ['a\\Sb', 'a\nb', null]]);

// ---------- alternation and leftmost-longest ----------
matches('alternation', [
  ['cat|dog', 'hotdog', [3, 'dog']], ['cat|dog', 'category', [0, 'cat']], ['a|b|c', 'xxc', [2, 'c']], ['(a|b)c', 'xbcac', [1, 'bc']], ['ab|cd|ef', 'xxef', [2, 'ef']], ['red|green|blue', 'none', null],
]);
matches('leftmost-longest: the longest branch wins, whatever its order', [
  ['a|ab', 'ab', [0, 'ab']], ['ab|a', 'ab', [0, 'ab']], ['a|ab|abc', 'abcd', [0, 'abc']], ['x*|y*', 'yy', [0, 'yy']], ['(ab|a)(c|bcd)', 'abcd', [0, 'abcd']], ['ab?|abcd', 'abcd', [0, 'abcd']],
  ['(a|ab)c?', 'abc', [0, 'abc']], ['(b|bc|bcd)d?', 'bcd', [0, 'bcd']],
]);
matches('leftmost first, then longest', [['bcd|ab', 'abcd', [0, 'ab']], ['b+|ab', 'abbb', [0, 'ab']], ['(c|abc)', 'abc', [0, 'abc']], ['aaa|b', 'baaa', [0, 'b']], ['xy*|y+', 'yyxyy', [0, 'yy']], ['a|ab|b', 'ab', [0, 'ab']]]);
matches('longest through repetition, not first-found', [
  ['(a|ab)*', 'abab', [0, 'abab']], ['(a|ab)*c', 'ababc', [0, 'ababc']], ['(|a)+', 'aa', [0, 'aa']], ['(foo|foobar)(bar)?', 'foobarbar', [0, 'foobarbar']], ['a*ab', 'aaab', [0, 'aaab']],
]);
matches('leftmost-longest with classes and escapes', [
  ['[ab]*b|a+', 'aaab', [0, 'aaab']], ['a+|[a-c]+', 'aabcx', [0, 'aabc']], ['\\d+|\\d+\\.\\d+', 'v3.14', [1, '3.14']], ['(\\w+|\\w+\\s\\w+)', 'hi there!', [0, 'hi there']], ['if|ifdef|ifndef', '#ifndef X', [1, 'ifndef']],
]);
matches('a shorter match that ends first does not win over a leftmost one', [['bc|abcd', 'abcd', [0, 'abcd']], ['b|abcd', 'xabcd', [1, 'abcd']], ['x+y|x', 'xxxz', [0, 'x']], ['ab|b+c', 'abbbc', [0, 'ab']]]);
matches('a match can start inside an earlier partial match', [['aab', 'aaab', [1, 'aab']], ['abac', 'ababac', [2, 'abac']], ['(ab)*c', 'ababxababc', [5, 'ababc']], ['a{3}b', 'aaaab', [1, 'aaab']]]);
matches('anchored and unanchored branches with quantifiers', [['^a+|b+$', 'aabb', [0, 'aa']], ['^b+|a+$', 'aabb', null], ['(^ab|b)+', 'abb', [0, 'abb']], ['(a|^b)+', 'bab', [0, 'ba']]]);
matches('repeated classes', [['[a-f0-9]{4,}', 'zz12ab9!', [2, '12ab9']], ['[^,]+', 'a,bc,d', [0, 'a']], ['[^,]*,', 'a,bc,d', [0, 'a,']], ['[^a-z]*', 'abc', [0, '']]]);
matches('the longest match can run to the end of the text', [['a.*', 'xa' + 'b'.repeat(1000), [1, 'a' + 'b'.repeat(1000)]], ['(ab)+', 'xxabababab', [2, 'abababab']], ['b*$', 'abbb', [1, 'bbb']]]);
matches('alternation inside repetition', [['(a|bc)+', 'xabcabc', [1, 'abcabc']], ['(a|b|ab)*c', 'ababc', [0, 'ababc']], ['(x|xy)(z|yz)', 'xyz', [0, 'xyz']], ['(ab|c){2}', 'xcab', [1, 'cab']], ['(a|ab)+', 'abab', [0, 'abab']]]);
matches('escaped characters in alternation and groups', [['\\(a\\|b\\)', '(a|b)', [0, '(a|b)']], ['(\\)|\\()+', 'x)(()', [1, ')(()']], ['a\\{2\\}', 'a{2}', [0, 'a{2}']]]);
matches('groups and alternation with empty branches', [
  ['a(|b)c', 'ac abc', [0, 'ac']], ['a(b|)c', 'xabc', [1, 'abc']], ['a()b', 'ab', [0, 'ab']], ['()*a', 'a', [0, 'a']], ['(()|a)+', 'aa', [0, 'aa']], ['|a', 'a', [0, 'a']],
]);

// ---------- quantifiers ----------
matches('empty matches', [['a*', 'bbb', [0, '']], ['a*', 'baaa', [0, '']], ['a*$', 'baa', [1, 'aa']], ['b*', '', [0, '']], ['a?', '', [0, '']], ['(a|b)*', '', [0, '']], ['a|', 'ba', [0, '']], ['|b', 'b', [0, 'b']]]);
matches('plus and question mark', [['a+', 'baaab', [1, 'aaa']], ['colou?r', 'color colour', [0, 'color']], ['colou?r', 'the colour', [4, 'colour']], ['ab+c', 'ac abbc', [3, 'abbc']], ['x?y', 'zy', [1, 'y']], ['a+', 'bbb', null]]);
matches('star', [['ab*', 'abbbc', [0, 'abbb']], ['ab*c', 'ac', [0, 'ac']], ['(ab)*', 'ababa', [0, 'abab']], ['a*b*c*', 'xaabbcc', [0, '']], ['ba*', 'xbaa', [1, 'baa']]]);
matches('nested quantifiers', [
  ['(a*)*', 'aaa', [0, 'aaa']], ['(a*)+b', 'aaab', [0, 'aaab']], ['(a+)?b', 'b', [0, 'b']], ['((ab)*c)+', 'ababcabcc!', [0, 'ababcabcc']], ['(a?)*a', 'aa', [0, 'aa']], ['(a*b*)*c', 'abbac', [0, 'abbac']],
  ['((a|b)+c?)*d', 'abcbad', [0, 'abcbad']], ['(a|ab)*b', 'abab', [0, 'abab']],
]);
matches('loops that can match the empty text end', [['(a*)*b', 'aab', [0, 'aab']], ['(a?)+', '', [0, '']], ['(()*)*', 'x', [0, '']], ['(a*|b)*c', 'abaac', [0, 'abaac']], ['((a?)*)*$', 'aaa', [0, 'aaa']]]);
matches('counted repetition: exactly n, n or more', [
  ['a{3}', 'aaaa', [0, 'aaa']], ['a{3}', 'aa', null], ['a{2,}', 'aaaaa', [0, 'aaaaa']], ['a{2,}', 'a', null], ['(ab){2}', 'abababab', [0, 'abab']], ['a{02}', 'aaa', [0, 'aa']], ['x{0,}', 'xx', [0, 'xx']],
  ['x{1,}y', 'xxy', [0, 'xxy']],
]);
matches('counted repetition: from n to m', [
  ['a{2,3}', 'aaaaa', [0, 'aaa']], ['(a|b){2,3}c', 'abbbc', [1, 'bbbc']], ['(a|b){2,3}c', 'abababc', [3, 'babc']], ['a{1,2}b', 'aaab', [1, 'aab']], ['[0-9]{2,4}', 'x12345', [1, '1234']], ['a{0,1}b', 'ab', [0, 'ab']],
  ['(ab){1,2}', 'abababab', [0, 'abab']], ['(a|ab){2}', 'abab', [0, 'abab']],
]);
matches('zero repetitions', [['a{0}', 'aaa', [0, '']], ['ba{0}', 'ba', [0, 'b']], ['ba{0,0}c', 'bc bac', [0, 'bc']], ['(abc){0}x', 'abcx', [3, 'x']], ['(a{1000}){0}b', 'ab', [1, 'b']]]);
matches('counted repetition of groups', [
  ['(a|bc){1,3}d', 'bcbcad', [0, 'bcbcad']], ['([0-9]{1,3}\\.){3}[0-9]{1,3}', 'ip 192.168.1.10!', [3, '192.168.1.10']], ['(a{2}){2,}', 'aaaaa', [0, 'aaaa']], ['(x?){3}y', 'xxxxy', [1, 'xxxy']],
]);
matches('large counted repetition up to the size limit', [
  ['a{1000}', 'a'.repeat(1001), [0, 'a'.repeat(1000)]], ['a{1000}', 'a'.repeat(999), null], ['(ab){333}', 'ab'.repeat(333), [0, 'ab'.repeat(333)]], ['x{999,}', 'x'.repeat(1200), [0, 'x'.repeat(1200)]],
  ['(a{10}){90}', 'a'.repeat(905), [0, 'a'.repeat(900)]], ['[ab]{0,999}c', 'ab'.repeat(400) + 'c', [0, 'ab'.repeat(400) + 'c']], ['(a|b|c){250}', 'abc'.repeat(83), null], ['(a|b|c){250}', 'abc'.repeat(90), [0, 'abc'.repeat(83) + 'a']],
]);
matches('class escapes with quantifiers', [['\\d{3}-\\d{4}', 'call 555-1234 now', [5, '555-1234']], ['\\s*,\\s*', 'a ,  b', [1, ' ,  ']], ['\\w+@\\w+\\.\\w{2,3}', 'mail: bob@site.com.', [6, 'bob@site.com']], ['\\d+|\\d+\\.\\d+', '3.14', [0, '3.14']]]);
matches('quantified dots and line feeds', [['(.)*$', 'ab\ncd', [3, 'cd']], ['.{3}', 'ab\ncdef', [3, 'cde']], ['(.\\n)+', 'a\nb\nc', [0, 'a\nb\n']]]);

// ---------- anchors ----------
matches('anchors: start and end of the whole text', [
  ['^abc', 'xabc', null], ['^abc', 'abcabc', [0, 'abc']], ['abc$', 'abcabc', [3, 'abc']], ['^$', '', [0, '']], ['^$', 'a', null], ['^', 'abc', [0, '']], ['$', 'abc', [3, '']], ['^a*$', 'aaa', [0, 'aaa']],
]);
matches('no multi-line mode', [['^b', 'a\nb', null], ['a$', 'a\nb', null], ['^a$', 'a\n', null], ['b$', 'a\nb', [2, 'b']]]);
matches('anchors inside alternation', [
  ['^a|b$', 'xab', [2, 'b']], ['^a|b$', 'ab', [0, 'a']], ['(a|$)', 'bb', [2, '']], ['(^|x)a', 'ba xa', [3, 'xa']], ['(^|x)a', 'a', [0, 'a']], ['x(y|$)', 'x', [0, 'x']], ['(a$|ab)', 'ab', [0, 'ab']],
  ['(a$|b)', 'ab', [1, 'b']], ['a|ab$', 'ab', [0, 'ab']],
]);
matches('anchors in the middle of a text never match', [['a^b', 'a^b', null], ['a$b', 'ab', null], ['$a', 'a', null], ['a\\^b', 'a^b', [0, 'a^b']], ['(^a)*b', 'ab', [0, 'ab']], ['(^a)*b', 'aab', [2, 'b']]]);
matches('anchors inside quantified groups', [['(^a)+', 'aa', [0, 'a']], ['(^a)+', 'ba', null], ['(a$)?', 'ba', [0, '']], ['b(a$)?', 'ba', [0, 'ba']], ['b(a$)?', 'bab', [0, 'b']], ['(^)*a', 'ba', [1, 'a']], ['($|a)+', 'aa', [0, 'aa']]]);
matches('long texts give the right index', [
  ['needle', 'x'.repeat(5000) + 'needle', [5000, 'needle']], ['b+', 'a'.repeat(3000) + 'b'.repeat(3000) + 'a', [3000, 'b'.repeat(3000)]], ['a.*z', 'a' + 'y'.repeat(10000) + 'zq', [0, 'a' + 'y'.repeat(10000) + 'z']],
]);

// ---------- errors ----------
errors('errors: backslash at the end, unknown escapes', [
  ['a\\', 1], ['\\', 0], ['[a\\', 2], ['\\b', 0], ['a\\1', 1], ['[\\q]', 1], ['\\x41', 0], ['\\u0041', 0], ['ab\\,', 2], ['\\ ', 0], ['a\\0', 1],
]);
errors('errors: classes not closed or empty', [['[abc', 0], ['a[\\]', 1], ['[^', 0], ['[', 0], ['[]', 0], ['x[^]', 1], ['[]a]', 0], ['ab[a-', 2]]);
errors('errors: bad ranges', [['[z-a]', 1], ['[ab\\d-z]', 3], ['[a-\\w]', 1], ['x[b-a', 2], ['[\\s-z]', 1], ['[9-0]', 1], ['[a-\\]]', 1]]);
errors('errors: nothing to repeat', [
  ['*a', 0], ['a**', 2], ['(+a)', 1], ['a|?', 2], ['^*', 1], ['a$+', 2], ['a{2}{3}', 4], ['a*?', 2], ['(?:a)', 1], ['{2}', 0], ['a??', 2], ['+', 0], ['(a|*)', 3], ['a+*', 2], ['$?', 1],
]);
errors('errors: braces that are not a quantifier', [['a{', 1], ['a{x}', 1], ['a{,2}', 1], ['a{1, 2}', 1], ['a{1,2', 1], ['a{-1}', 1], ['a{ 1}', 1], ['a{1', 1], ['ab{2,3,4}', 2], ['a{1}x{', 5]]);
errors('errors: braces out of order', [['a{3,1}', 1], ['(ab){5,2}', 4], ['a{10,9}', 1]]);
errors('errors: unbalanced parentheses', [['(ab', 0], ['(a(b', 2], ['((a)', 0], ['a)', 1], ['())', 2], [')', 0], ['(a|b))', 5], ['(()', 0]]);
errors('errors: patterns above the size limit', [['a{1001}', 0], ['(ab){334}', 0], ['x{1000,}', 0], ['(a{10}){91}', 0], ['a{500}b{501}', 0], ['(a|b|c){334}', 0], ['a{99999}', 0]]);
errors('errors: the first problem met is the one reported', [['[z-a', 1], ['(a{3,1}', 2], ['[a\\', 2], ['a)(', 1], ['(a{2000}', 0], ['a{2000}(', 7], ['*)', 0], ['a{2}{x', 4], ['(a\\q', 2], ['[a-\\d', 1]]);
test('patterns at the size limit compile', async () => {
  const { compile } = await load();
  for (const p of ['a{1000}', 'x{999,}', '(ab){333}', '(a{10}){90}', '(a{1000}){0}', 'a{500}b{500}', '(a|b|c){250}']) {
    let err = null;
    try {
      user(() => compile(p));
    } catch (e) {
      err = e;
    }
    assert.equal(err, null, `${p} threw ${err?.message}`);
  }
});

// ---------- the API ----------
test('compile, test and match check their arguments', async () => {
  const { compile } = await load();
  for (const bad of [42, null, undefined, {}, ['a']]) assert.throws(() => user(() => compile(bad)), TypeError, `compile(${String(bad)})`);
  const re = user(() => compile('a'));
  for (const bad of [5, null, undefined, ['a']]) {
    assert.throws(() => user(() => re.test(bad)), TypeError, `test(${String(bad)})`);
    assert.throws(() => user(() => re.match(bad)), TypeError, `match(${String(bad)})`);
  }
});
test('a compiled pattern can be used again and again', async () => {
  const { compile } = await load();
  const p = user(() => compile('a+b'));
  const q = user(() => compile('^x'));
  const m = (re, s) => user(() => re.match(s));
  assert.deepEqual({ ...m(p, 'aab') }, { index: 0, text: 'aab' });
  assert.equal(user(() => q.test('xy')), true);
  assert.deepEqual({ ...m(p, 'xab') }, { index: 1, text: 'ab' });
  assert.equal(user(() => p.test('b')), false);
  assert.equal(user(() => q.test('yx')), false);
  assert.deepEqual({ ...m(p, 'aab') }, { index: 0, text: 'aab' });
  assert.equal(m(p, 'zzz'), null);
  assert.equal(user(() => p.test('cab')), true);
});

// ---------- the timed cases ----------
const WORDS = ['quartz', 'quiver', 'quill', 'quota', 'quench', 'quaint', 'quirky', 'quokka', 'quasar', 'quibble', 'quorum', 'quiche', 'queasy', 'quay', 'quilted', 'quotient', 'query', 'quest',
  'queue', 'quark', 'quaver', 'quadrant', 'quagmire', 'quickly'];
const words30k = () => {
  const w = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit'];
  let s = '';
  for (let k = 0; s.length < 30000; k++) s += w[k % w.length] + ' ';
  return s.slice(0, 30000) + '!';
};
const whole = (text) => ({ index: 0, text });
const PERF = [
  ['(a*)*b', () => 'a'.repeat(30000), 'test', () => false],
  ['(a|aa)+$', () => 'a'.repeat(30000) + 'b', 'test', () => false],
  ['(a?){25}a{25}', () => ('a'.repeat(24) + 'b').repeat(1250), 'match', () => null],
  ['(x+x+)+y', () => 'x'.repeat(50000), 'test', () => false],
  ['^(a+)+$', () => 'a'.repeat(30000) + '!', 'match', () => null],
  ['^(\\w+\\s?)*$', words30k, 'match', () => null],
  ['(a{1,8}){1,8}$', () => 'a'.repeat(20000) + 'b', 'test', () => false],
  ['(.*a){11}', () => ('a' + 'b'.repeat(2999)).repeat(10), 'test', () => false],
  ['a*b', () => 'a'.repeat(50000), 'test', () => false],
  ['.*.*=.*', () => 'x'.repeat(30000), 'test', () => false],
  ['(ab|cd)*e', () => 'ab'.repeat(50000) + 'e', 'match', (text) => whole(text)],
  [WORDS.join('|'), () => 'abcdefghijklmnoprstuvwxyz'.repeat(8000).slice(0, 200000 - 7) + 'quickly', 'match', () => ({ index: 199993, text: 'quickly' })],
];
for (const [pattern, makeText, call, expected] of PERF) {
  const label = pattern.length > 30 ? `an alternation of ${WORDS.length} words` : pattern;
  test(`in time: ${label} (${call})`, async () => {
    const { compile } = await load();
    const text = makeText();
    const got = user(() => compile(pattern)[call](text));
    const want = expected(text);
    if (want === null || typeof want === 'boolean') assert.ok(got === want, `${call} gave ${JSON.stringify(got)?.slice(0, 80)}, expected ${want}`);
    else assert.ok(got && got.index === want.index && got.text === want.text, `match gave ${JSON.stringify(got)?.slice(0, 80)}, expected index ${want.index}, ${want.text.length} characters`);
  }, 'timed');
}

// ---------- the rules on the source ----------
const sourceFiles = () => {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|js|cjs)$/.test(e.name)) out.push(p);
    }
  };
  walk(path.join(dir, 'src'));
  return out;
};
test('no RegExp, eval( or new Function in the source', () => {
  assert.ok(fs.existsSync(path.join(dir, 'src/regex.mjs')), 'src/regex.mjs is missing');
  for (const file of sourceFiles()) {
    const code = fs.readFileSync(file, 'utf8');
    for (const word of ['RegExp', 'eval(', 'new Function']) assert.ok(!code.includes(word), `${path.relative(dir, file)} contains ${word}`);
  }
}, 'parent');
test('no regular expressions used while the module runs', null, 'regex');

// ---------- running ----------
const which = process.argv.indexOf('--case');
if (which > 0) {
  // A child: one case, then one line of JSON.
  const realExec = RegExp.prototype.exec;
  RegExp.prototype.exec = function (s) {
    if (inUser > 0) regexUsed = true;
    return realExec.call(this, s);
  };
  const c = cases[Number(process.argv[which + 1])];
  let loaded = false;
  let result;
  try {
    await load();
    loaded = true;
    await c.fn();
    result = { ok: true };
  } catch (e) {
    result = { ok: false, why: String(e?.message ?? e).split('\n')[0].slice(0, 300) };
  }
  console.log(JSON.stringify({ ...result, loaded, regexUsed }));
  process.exit(0);
}

const runChild = (index, ms) =>
  new Promise((resolve) => {
    execFile(process.execPath, [self, dir, '--case', String(index)], { timeout: ms, killSignal: 'SIGKILL', maxBuffer: 1 << 20 }, (error, stdout) => {
      const last = String(stdout).trim().split('\n').pop();
      try {
        const r = JSON.parse(last);
        if (typeof r.ok === 'boolean') return resolve(r);
      } catch {}
      resolve({ ok: false, loaded: false, regexUsed: false, why: error?.killed ? `took more than ${ms / 1000} s` : `the case crashed: ${String(error?.message ?? '').split('\n')[0].slice(0, 200)}` });
    });
  });

const results = new Map();
const pool = async (indexes, width, ms) => {
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < indexes.length) {
      const i = indexes[next++];
      results.set(i, await runChild(i, ms));
    }
  }));
};
const byKind = (kind) => cases.map((c, i) => (c.kind === kind ? i : -1)).filter((i) => i >= 0);
await pool(byKind('case'), 4, 5000);
await pool(byKind('timed'), 1, 2000);
for (const i of byKind('parent')) {
  try {
    await cases[i].fn();
    results.set(i, { ok: true });
  } catch (e) {
    results.set(i, { ok: false, why: String(e?.message ?? e).split('\n')[0] });
  }
}
for (const i of byKind('regex')) {
  const ran = [...results.values()].filter((r) => r.loaded);
  const used = ran.some((r) => r.regexUsed);
  results.set(i, ran.length === 0 ? { ok: false, why: 'the module never loaded' } : used ? { ok: false, why: 'a regular expression was used' } : { ok: true });
}

const failed = [];
cases.forEach((c, i) => {
  const r = results.get(i);
  if (!r.ok) {
    failed.push(c.name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${c.name}: ${r.why}`);
  }
});
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
