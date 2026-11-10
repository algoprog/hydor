export class ExprError extends Error {
  constructor(message, position) {
    super(message);
    this.name = 'ExprError';
    this.position = position;
  }
}

const ESCAPES = { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"' };
const isDigit = (c) => c >= '0' && c <= '9';
const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const OPS = ['**', '<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '(', ')', ','];

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
    } else if (isDigit(c)) {
      const start = i;
      while (isDigit(src[i])) i++;
      if (src[i] === '.' && isDigit(src[i + 1])) {
        i++;
        while (isDigit(src[i])) i++;
      }
      if (src[i] === 'e' || src[i] === 'E') {
        let j = i + 1;
        if (src[j] === '+' || src[j] === '-') j++;
        if (isDigit(src[j])) {
          while (isDigit(src[j])) j++;
          i = j;
        }
      }
      tokens.push({ type: 'num', value: Number(src.slice(start, i)), pos: start });
    } else if (c === "'" || c === '"') {
      const start = i++;
      let value = '';
      for (;;) {
        if (i >= src.length) throw new ExprError('unterminated string: expected a closing quote', start);
        const d = src[i];
        if (d === c) {
          i++;
          break;
        }
        if (d === '\\') {
          const e = ESCAPES[src[i + 1]];
          if (e === undefined) throw new ExprError('bad escape: expected one of \\n \\t \\\\ \\\' \\"', i);
          value += e;
          i += 2;
        } else {
          value += d;
          i++;
        }
      }
      tokens.push({ type: 'str', value, pos: start });
    } else if (isAlpha(c)) {
      const start = i;
      while (i < src.length && (isAlpha(src[i]) || isDigit(src[i]))) i++;
      const text = src.slice(start, i);
      if (text === 'true' || text === 'false' || text === 'null') tokens.push({ type: 'kw', value: text, pos: start });
      else tokens.push({ type: 'name', value: text, pos: start });
    } else {
      const op = OPS.find((o) => src.startsWith(o, i));
      if (!op) throw new ExprError(`unexpected character ${JSON.stringify(c)}`, i);
      tokens.push({ type: 'op', value: op, pos: i });
      i += op.length;
    }
  }
  tokens.push({ type: 'eof', value: '', pos: src.length });
  return tokens;
}

function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (...ops) => peek().type === 'op' && ops.includes(peek().value);
  const unexpected = (expected) => {
    const t = peek();
    throw new ExprError(t.type === 'eof' ? `unexpected end of expression: expected ${expected}` : `unexpected ${JSON.stringify(t.value)}: expected ${expected}`, t.pos);
  };
  const expect = (op) => {
    if (!isOp(op)) unexpected(`"${op}"`);
    return tokens[p++];
  };

  function ternary() {
    const test = or();
    if (!isOp('?')) return test;
    const pos = tokens[p++].pos;
    const yes = ternary_expression();
    expect(':');
    const no = ternary();
    return { type: 'cond', test, yes, no, pos };
  }
  const ternary_expression = () => ternary();
  function or() {
    let left = and();
    while (isOp('||')) {
      const pos = tokens[p++].pos;
      left = { type: 'logic', op: '||', left, right: and(), pos };
    }
    return left;
  }
  function and() {
    let left = comparison();
    while (isOp('&&')) {
      const pos = tokens[p++].pos;
      left = { type: 'logic', op: '&&', left, right: comparison(), pos };
    }
    return left;
  }
  function comparison() {
    const left = additive();
    if (isOp('<', '<=', '>', '>=', '==', '!=')) {
      const t = tokens[p++];
      return { type: 'bin', op: t.value, left, right: additive(), pos: t.pos };
    }
    return left;
  }
  function additive() {
    let left = multiplicative();
    while (isOp('+', '-')) {
      const t = tokens[p++];
      left = { type: 'bin', op: t.value, left, right: multiplicative(), pos: t.pos };
    }
    return left;
  }
  function multiplicative() {
    let left = unary();
    while (isOp('*', '/', '%')) {
      const t = tokens[p++];
      left = { type: 'bin', op: t.value, left, right: unary(), pos: t.pos };
    }
    return left;
  }
  function unary() {
    if (isOp('-', '!')) {
      const t = tokens[p++];
      return { type: 'un', op: t.value, arg: unary(), pos: t.pos };
    }
    return power();
  }
  function power() {
    const base = primary();
    if (isOp('**')) {
      const t = tokens[p++];
      return { type: 'bin', op: '**', left: base, right: unary(), pos: t.pos };
    }
    return base;
  }
  function primary() {
    const t = peek();
    if (t.type === 'num' || t.type === 'str') {
      p++;
      return { type: 'lit', value: t.value, pos: t.pos };
    }
    if (t.type === 'kw') {
      p++;
      return { type: 'lit', value: t.value === 'true' ? true : t.value === 'false' ? false : null, pos: t.pos };
    }
    if (t.type === 'name') {
      p++;
      if (isOp('(')) {
        p++;
        const args = [];
        if (!isOp(')')) {
          args.push(ternary());
          while (isOp(',')) {
            p++;
            args.push(ternary());
          }
        }
        expect(')');
        return { type: 'call', name: t.value, args, pos: t.pos };
      }
      return { type: 'var', name: t.value, pos: t.pos };
    }
    if (isOp('(')) {
      p++;
      const inner = ternary();
      expect(')');
      return { ...inner, start: t.pos };
    }
    return unexpected('a value');
  }

  const tree = ternary();
  if (peek().type !== 'eof') unexpected('an operator or the end of the expression');
  return tree;
}

// Where an expression's text begins (a parenthesised one starts at its "(").
function startOf(node) {
  if (node.start !== undefined) return node.start;
  switch (node.type) {
    case 'bin':
    case 'logic':
      return startOf(node.left);
    case 'cond':
      return startOf(node.test);
    default:
      return node.pos;
  }
}

const truthy = (v) => !(v === false || v === null || v === 0 || Number.isNaN(v) || v === '');
const isNum = (v) => typeof v === 'number';
const isStr = (v) => typeof v === 'string';

const FUNCTIONS = {
  min: { min: 1, max: Infinity, run: (a) => Math.min(...a), types: () => isNum },
  max: { min: 1, max: Infinity, run: (a) => Math.max(...a), types: () => isNum },
  abs: { min: 1, max: 1, run: (a) => Math.abs(a[0]), types: () => isNum },
  round: {
    min: 1,
    max: 2,
    types: (i) => (i === 0 ? isNum : (v) => isNum(v) && Number.isInteger(v) && v >= 0),
    run: ([x, digits = 0]) => (Math.sign(x) * Math.round(Math.abs(x) * 10 ** digits)) / 10 ** digits,
  },
  len: { min: 1, max: 1, run: (a) => a[0].length, types: () => isStr },
  upper: { min: 1, max: 1, run: (a) => a[0].toUpperCase(), types: () => isStr },
};

function run(node, vars) {
  const ev = (n) => run(n, vars);
  switch (node.type) {
    case 'lit':
      return node.value;
    case 'var':
      if (!Object.hasOwn(vars, node.name)) throw new ExprError(`undefined variable "${node.name}"`, node.pos);
      return vars[node.name];
    case 'un': {
      const v = ev(node.arg);
      if (node.op === '!') return !truthy(v);
      if (!isNum(v)) throw new ExprError('unary - needs a number', node.pos);
      return -v;
    }
    case 'logic': {
      const l = ev(node.left);
      if (node.op === '&&') return truthy(l) ? ev(node.right) : l;
      return truthy(l) ? l : ev(node.right);
    }
    case 'cond':
      return truthy(ev(node.test)) ? ev(node.yes) : ev(node.no);
    case 'call': {
      const fn = Object.hasOwn(FUNCTIONS, node.name) ? FUNCTIONS[node.name] : undefined;
      if (!fn) throw new ExprError(`unknown function "${node.name}"`, node.pos);
      if (node.args.length < fn.min || node.args.length > fn.max) throw new ExprError(`${node.name} takes ${fn.min === fn.max ? fn.min : `${fn.min} to ${fn.max === Infinity ? 'any number of' : fn.max}`} argument(s)`, node.pos);
      const values = node.args.map(ev);
      values.forEach((v, i) => {
        if (!fn.types(i)(v)) throw new ExprError(`bad argument ${i + 1} for ${node.name}`, startOf(node.args[i]));
      });
      return fn.run(values);
    }
    case 'bin': {
      const l = ev(node.left);
      const r = ev(node.right);
      const op = node.op;
      if (op === '==') return l === r;
      if (op === '!=') return l !== r;
      if (op === '+') {
        if ((isNum(l) && isNum(r)) || (isStr(l) && isStr(r))) return l + r;
        throw new ExprError('+ needs two numbers or two strings', node.pos);
      }
      if (op === '<' || op === '<=' || op === '>' || op === '>=') {
        if (!((isNum(l) && isNum(r)) || (isStr(l) && isStr(r)))) throw new ExprError(`${op} needs two numbers or two strings`, node.pos);
        return op === '<' ? l < r : op === '<=' ? l <= r : op === '>' ? l > r : l >= r;
      }
      if (!isNum(l) || !isNum(r)) throw new ExprError(`${op} needs two numbers`, node.pos);
      if ((op === '/' || op === '%') && r === 0) throw new ExprError('division by zero', node.pos);
      return op === '-' ? l - r : op === '*' ? l * r : op === '/' ? l / r : op === '%' ? l % r : l ** r;
    }
  }
}

export function evaluate(source, variables = {}) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  return run(parse(tokenize(source)), variables);
}
