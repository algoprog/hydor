// The condition a key's wrong paste may carry (`when`), read for where the app runs: `place = hydor`, `place = hydor or
// place = local`, with `and`, `or`, `not` and brackets. A condition that cannot be read does not hold.

export interface WhenContext {
  /** Where it runs: hydor (inside Hydor) or server. */
  place: string;
}

type Node = (c: WhenContext) => boolean;

function parse(text: string): Node {
  const tokens = text.match(/\(|\)|!=|=|[A-Za-z0-9_.-]+|\S/g) ?? [];
  let at = 0;
  const fail = (): never => {
    throw new Error("not a condition");
  };
  const or = (): Node => {
    const parts = [and()];
    while (tokens[at] === "or") (at++, parts.push(and()));
    return (c) => parts.some((p) => p(c));
  };
  const and = (): Node => {
    const parts = [not()];
    while (tokens[at] === "and") (at++, parts.push(not()));
    return (c) => parts.every((p) => p(c));
  };
  const not = (): Node => {
    if (tokens[at] !== "not") return atom();
    at++;
    const inner = not();
    return (c) => !inner(c);
  };
  const atom = (): Node => {
    const t = tokens[at++] ?? fail();
    if (t === "(") {
      const inner = or();
      if (tokens[at++] !== ")") fail();
      return inner;
    }
    const op = tokens[at++];
    const value = tokens[at++];
    if (t !== "place" || (op !== "=" && op !== "!=") || !value) fail();
    return (c) => (c.place === value) === (op === "=");
  };
  const node = or();
  if (at !== tokens.length) fail();
  return node;
}

/** Whether a condition holds here; one that cannot be read does not. */
export function holds(when: string, context: WhenContext): boolean {
  try {
    return parse(when)(context);
  } catch {
    return false;
  }
}
