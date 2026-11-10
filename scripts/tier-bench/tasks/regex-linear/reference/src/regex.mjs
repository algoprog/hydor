// A regular expression engine that never backtracks: the pattern is parsed into a tree, the tree is compiled into a
// Thompson NFA, and the NFA is simulated over the text with a set of states, for every start position at once.
// Each state in the set remembers the smallest start position that reached it, which is all leftmost-longest needs.

const MAX_SIZE = 1000;
const LITERAL_ESCAPES = '\\.[](){}|*+?^$-/';
const CONTROL_ESCAPES = { n: 10, t: 9, r: 13 };
const DIGIT = [[48, 57]];
const WORD = [[48, 57], [65, 90], [95, 95], [97, 122]];
const SPACE = [[9, 13], [32, 32]];
const SET_ESCAPES = { d: [DIGIT, false], D: [DIGIT, true], w: [WORD, false], W: [WORD, true], s: [SPACE, false], S: [SPACE, true] };

function fail(what, position) {
  const err = new SyntaxError(`${what} at position ${position}`);
  err.position = position;
  throw err;
}

const inRanges = (ranges, c) => {
  for (const [lo, hi] of ranges) if (c >= lo && c <= hi) return true;
  return false;
};

// ---------- parsing ----------

// Tree nodes: { t: 'char', test }, { t: 'bol' }, { t: 'eol' }, { t: 'seq', items }, { t: 'alt', branches },
// { t: 'group', body }, { t: 'rep', body, min, max } (max is Infinity for no upper bound).
function parse(src) {
  let i = 0;
  const isQuantifier = (c) => c === '*' || c === '+' || c === '?' || c === '{';

  function alternation() {
    const branches = [sequence()];
    while (i < src.length && src[i] === '|') {
      i++;
      branches.push(sequence());
    }
    return branches.length === 1 ? branches[0] : { t: 'alt', branches };
  }

  function sequence() {
    const items = [];
    while (i < src.length && src[i] !== '|' && src[i] !== ')') {
      const c = src[i];
      if (isQuantifier(c)) fail('nothing to repeat', i);
      if (c === '^' || c === '$') {
        i++;
        items.push({ t: c === '^' ? 'bol' : 'eol' });
        if (i < src.length && isQuantifier(src[i])) fail('nothing to repeat', i);
        continue;
      }
      let node = atom();
      if (i < src.length && isQuantifier(src[i])) {
        node = quantified(node);
        if (i < src.length && isQuantifier(src[i])) fail('nothing to repeat', i);
      }
      items.push(node);
    }
    return items.length === 1 ? items[0] : { t: 'seq', items };
  }

  function quantified(body) {
    const at = i;
    const c = src[i++];
    if (c === '*') return { t: 'rep', body, min: 0, max: Infinity };
    if (c === '+') return { t: 'rep', body, min: 1, max: Infinity };
    if (c === '?') return { t: 'rep', body, min: 0, max: 1 };
    const digits = () => {
      const from = i;
      while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
      return i > from ? Number(src.slice(from, i)) : null;
    };
    const min = digits();
    if (min === null) fail('bad repetition braces', at);
    let max = min;
    if (src[i] === ',') {
      i++;
      if (src[i] === '}') max = Infinity;
      else {
        max = digits();
        if (max === null) fail('bad repetition braces', at);
      }
    }
    if (src[i] !== '}') fail('bad repetition braces', at);
    i++;
    if (min > max) fail('repetition range out of order', at);
    return { t: 'rep', body, min, max, counted: true };
  }

  // An escape at i (src[i] is the backslash): { code } for one character, or { set: [ranges, negated] }.
  function escape() {
    const at = i;
    if (i + 1 >= src.length) fail('backslash at the end of the pattern', at);
    const c = src[i + 1];
    i += 2;
    if (Object.hasOwn(SET_ESCAPES, c)) return { set: SET_ESCAPES[c] };
    if (Object.hasOwn(CONTROL_ESCAPES, c)) return { code: CONTROL_ESCAPES[c] };
    if (LITERAL_ESCAPES.includes(c)) return { code: c.charCodeAt(0) };
    return fail('unknown escape', at);
  }

  const charNode = (e) => {
    if (e.set) {
      const [ranges, negated] = e.set;
      return { t: 'char', test: (c) => inRanges(ranges, c) !== negated };
    }
    const code = e.code;
    return { t: 'char', test: (c) => c === code };
  };

  function atom() {
    const c = src[i];
    if (c === '(') {
      const open = i++;
      const body = alternation();
      if (i >= src.length) fail('group is not closed', open);
      i++; // the ')'
      return { t: 'group', body };
    }
    if (c === '[') return cls();
    if (c === '.') {
      i++;
      return { t: 'char', test: (x) => x !== 10 };
    }
    if (c === '\\') return charNode(escape());
    i++;
    return charNode({ code: c.charCodeAt(0) });
  }

  function member() {
    const at = i;
    if (src[i] === '\\') return { at, ...escape() };
    return { at, code: src.charCodeAt(i++) };
  }

  function cls() {
    const open = i++;
    let negated = false;
    if (src[i] === '^') {
      negated = true;
      i++;
    }
    const ranges = [];
    const sets = [];
    for (;;) {
      if (i >= src.length) fail('class is not closed', open);
      if (src[i] === ']') {
        if (ranges.length === 0 && sets.length === 0) fail('empty class', open);
        i++;
        break;
      }
      const first = member();
      if (src[i] === '-' && i + 1 < src.length && src[i + 1] !== ']') {
        i++;
        const last = member();
        if (first.set || last.set || first.code > last.code) fail('bad range in class', first.at);
        ranges.push([first.code, last.code]);
      } else if (first.set) sets.push(first.set);
      else ranges.push([first.code, first.code]);
    }
    const test = (c) => {
      let hit = inRanges(ranges, c);
      for (let k = 0; !hit && k < sets.length; k++) hit = inRanges(sets[k][0], c) !== sets[k][1];
      return hit !== negated;
    };
    return { t: 'char', test };
  }

  const tree = alternation();
  if (i < src.length) fail('unmatched closing parenthesis', i); // only a ')' stops the top level early
  return tree;
}

function size(node) {
  switch (node.t) {
    case 'char':
    case 'bol':
    case 'eol':
      return 1;
    case 'group':
      return 1 + size(node.body);
    case 'seq':
      return node.items.reduce((sum, n) => sum + size(n), 0);
    case 'alt':
      return node.branches.reduce((sum, n) => sum + size(n), 0);
    case 'rep':
      // x*, x+ and x? count once; x{n} and x{n,m} count m times; x{n,} counts n + 1 times.
      if (!node.counted) return size(node.body);
      return (node.max === Infinity ? node.min + 1 : node.max) * size(node.body);
  }
  throw new Error(`unknown node ${node.t}`);
}

// ---------- the NFA ----------

const CHAR = 0;
const SPLIT = 1;
const BOL = 2;
const EOL = 3;
const MATCH = 4;

function build(tree) {
  const kind = [];
  const out1 = [];
  const out2 = [];
  const test = [];
  const add = (k, a = -1, b = -1, t = null) => {
    kind.push(k);
    out1.push(a);
    out2.push(b);
    test.push(t);
    return kind.length - 1;
  };
  // Compiles node so that it continues to state next; returns its first state.
  function emit(node, next) {
    switch (node.t) {
      case 'char':
        return add(CHAR, next, -1, node.test);
      case 'bol':
        return add(BOL, next);
      case 'eol':
        return add(EOL, next);
      case 'group':
        return emit(node.body, next);
      case 'seq': {
        let s = next;
        for (let k = node.items.length - 1; k >= 0; k--) s = emit(node.items[k], s);
        return s;
      }
      case 'alt': {
        let s = emit(node.branches[node.branches.length - 1], next);
        for (let k = node.branches.length - 2; k >= 0; k--) s = add(SPLIT, emit(node.branches[k], next), s);
        return s;
      }
      case 'rep': {
        const { body, min, max } = node;
        let s = next;
        let copies = min;
        if (max === Infinity) {
          const loop = add(SPLIT, -1, next);
          const entry = emit(body, loop);
          out1[loop] = entry;
          if (min === 0) s = loop;
          else {
            s = entry; // the loop's own copy is the last required one
            copies = min - 1;
          }
        } else {
          for (let k = 0; k < max - min; k++) s = add(SPLIT, emit(body, s), next);
        }
        for (let k = 0; k < copies; k++) s = emit(body, s);
        return s;
      }
    }
    throw new Error(`unknown node ${node.t}`);
  }
  const accept = add(MATCH);
  const start = emit(tree, accept);
  return { kind: Int8Array.from(kind), out1: Int32Array.from(out1), out2: Int32Array.from(out2), test, start };
}

// Runs the NFA over text. Returns [start, end] of the leftmost-longest match, or null; with firstOnly, stops at the
// first match found (enough for test()).
function run(prog, text, firstOnly) {
  const { kind, out1, out2, test, start } = prog;
  const n = text.length;
  const count = kind.length;
  const mark = new Int32Array(count).fill(-1);
  const stack = new Int32Array(count);
  let cur = new Int32Array(count);
  let curFrom = new Int32Array(count);
  let nxt = new Int32Array(count);
  let nxtFrom = new Int32Array(count);
  let gen = 0;
  let bestStart = -1;
  let bestEnd = -1;

  // Adds state s and everything reachable from it without reading a character, at position pos, to list.
  const close = (list, from, len, s, origin, pos) => {
    if (mark[s] === gen) return len;
    mark[s] = gen;
    let sp = 0;
    stack[sp++] = s;
    while (sp > 0) {
      const q = stack[--sp];
      const k = kind[q];
      if (k === CHAR || k === MATCH) {
        list[len] = q;
        from[len++] = origin;
        continue;
      }
      let a = -1;
      let b = -1;
      if (k === SPLIT) {
        a = out1[q];
        b = out2[q];
      } else if ((k === BOL && pos === 0) || (k === EOL && pos === n)) a = out1[q];
      if (b >= 0 && mark[b] !== gen) {
        mark[b] = gen;
        stack[sp++] = b;
      }
      if (a >= 0 && mark[a] !== gen) {
        mark[a] = gen;
        stack[sp++] = a;
      }
    }
    return len;
  };

  // The lists keep their threads in order of start position, so the first thread to reach a state has the smallest
  // start: a later one in the same state has the same future and a worse start, and is dropped.
  let len = close(cur, curFrom, 0, start, 0, 0);
  for (let pos = 0; ; pos++) {
    for (let k = 0; k < len; k++) {
      if (kind[cur[k]] !== MATCH) continue;
      const from = curFrom[k];
      if (bestStart < 0 || from < bestStart || (from === bestStart && pos > bestEnd)) {
        bestStart = from;
        bestEnd = pos;
      }
      if (firstOnly) return [bestStart, bestEnd];
    }
    if (pos === n || (len === 0 && bestStart >= 0)) break;
    const c = text.charCodeAt(pos);
    gen++;
    let nlen = 0;
    for (let k = 0; k < len; k++) {
      const q = cur[k];
      if (kind[q] !== CHAR || (bestStart >= 0 && curFrom[k] > bestStart) || !test[q](c)) continue;
      nlen = close(nxt, nxtFrom, nlen, out1[q], curFrom[k], pos + 1);
    }
    if (bestStart < 0) nlen = close(nxt, nxtFrom, nlen, start, pos + 1, pos + 1);
    [cur, nxt] = [nxt, cur];
    [curFrom, nxtFrom] = [nxtFrom, curFrom];
    len = nlen;
  }
  return bestStart < 0 ? null : [bestStart, bestEnd];
}

export function compile(pattern) {
  if (typeof pattern !== 'string') throw new TypeError('the pattern must be a string');
  const tree = parse(pattern);
  if (size(tree) > MAX_SIZE) fail(`pattern is larger than ${MAX_SIZE}`, 0);
  const prog = build(tree);
  const text = (t) => {
    if (typeof t !== 'string') throw new TypeError('the text must be a string');
    return t;
  };
  return {
    test(t) {
      return run(prog, text(t), true) !== null;
    },
    match(t) {
      const found = run(prog, text(t), false);
      return found === null ? null : { index: found[0], text: t.slice(found[0], found[1]) };
    },
  };
}
