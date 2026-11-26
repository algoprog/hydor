// Money in a card's data: agents are told to write a dollar sign that means money as \$ (in Markdown, a lone $ before
// a number could open maths), and they carry the habit into a ```ui block's JSON, where most fields are plain text and
// the backslash showed ("Raise the cap to \$142"). So a \$ before an amount is read as $ in every field but those that
// hold code, commands or LaTeX, where \$ means what it says. A field drawn as Markdown (kit.tsx Md) escapes money again
// itself (markdown-math.ts), so it still shows as money there, not maths.

/** Fields whose text is code, a command or LaTeX: left as written, with all they hold. */
const CODE_KEY = /^(code|codes|source|snippet|script|program|command|commands|cmd|shell|terminal|tex|latex|formula|formula_tex|equation|expr|expression|regex|pattern|sql|query|diff|patch|before|after|lines|tokens)$/i;

/** \$ right before an amount ("\$142", "\$.50", "\$ 5"). */
const ESCAPED_MONEY = /\\\$(?=\s?\d|\.\d)/g;

/** `v` with \$ before an amount read as $, outside code fields; the same object when nothing changes. */
export function unescapeMoney<T>(v: T, key = ''): T {
  if (!v || CODE_KEY.test(key)) return v;
  if (typeof v === 'string') return (v.includes('\\$') ? v.replace(ESCAPED_MONEY, '$') : v) as T;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    let out: unknown[] | null = null;
    v.forEach((x, i) => {
      const y = unescapeMoney(x, key);
      if (y !== x) (out ??= v.slice())[i] = y;
    });
    return (out ?? v) as T;
  }
  let out: Record<string, unknown> | null = null;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const y = unescapeMoney(x, k);
    if (y !== x) (out ??= { ...(v as Record<string, unknown>) })[k] = y;
  }
  return (out ?? v) as T;
}
