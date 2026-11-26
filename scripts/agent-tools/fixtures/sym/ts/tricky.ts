export function regexy() {
  const a = /}/;
  const b = /\/}/g;
  const c = x ? /{/ : /}/;
  return [a, b, c];
}

export function stringy() {
  const a = '}';
  const b = "{";
  const c = `}`;
  const d = `a${'}'}b${`{${1}}`}`;
  // } comment
  /* { block */
  return a + b + c + d;
}

export const afterTricky = 1;
