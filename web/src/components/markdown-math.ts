/** The environments that stand as an equation of their own, which KaTeX draws only in a display block. */
const BARE_ENV = /(?<!\\\[\s*)(^|\n)[ \t]*(\\begin\{(equation|align|gather|alignat)(\*?)\}[\s\S]*?\\end\{\3\4\})/g;

/**
 * Whether the $ at `i` of a line opens maths rather than money: maths that closes on the same line, as Pandoc reads it
 * (the closing $ follows a non-space and is not followed by a digit), and reads as maths ("$1$", "$5x + 3 = 0$", "$2^{10}$").
 * "From $5 to $10" stays money: the second $ is followed by a digit.
 */
function opensMaths(line: string, i: number): boolean {
  for (let j = i + 2; j < line.length; j++) {
    if (line[j] !== '$' || line[j - 1] === '\\') continue;
    if (/\s/.test(line[j - 1]) || /\d/.test(line[j + 1] ?? '') || line[j + 1] === '$') return false;
    const body = line.slice(i + 1, j);
    return /^\d+(?:\.\d+)?$/.test(body) || /[\\^_=+*/<>{}()|]|\d[a-zA-Z]/.test(body);
  }
  return false;
}

/** A $ right before a digit is money ("$4.70 per question"), escaped, unless it opens maths. */
const escapeMoney = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/(^|[^\\$])\$(?=\d)/g, (m, pre: string, at: number) => (opensMaths(line, at + pre.length) ? m : `${pre}\\$`)))
    .join('\n');

/**
 * Claude writes \(…\) and \[…\]; remark-math wants $…$ and $$…$$. Environments written on their own
 * (\begin{align}…) go in a display block. A $ right before a digit is money, escaped, except in notebooks
 * (`money` false), where $ is always maths. Code (also a block still coming) and maths in $$ are left alone.
 */
export function normalizeMath(src: string, money = true): string {
  if (!src.includes('$') && !src.includes('\\(') && !src.includes('\\[') && !src.includes('\\begin{')) return src;
  const parts = src.split(/(```[\s\S]*?```|```[\s\S]*$|~~~[\s\S]*?~~~|`[^`\n]*`|\$\$[\s\S]*?\$\$)/g);
  return parts
    .map((p, i) =>
      i % 2 === 1
        ? p
        : (money ? escapeMoney(p) : p)
            .replace(BARE_ENV, (_m, pre: string, env: string) => `${pre}\n$$\n${env}\n$$\n`)
            .replace(/\\\[([\s\S]+?)\\\]/g, (_m, x) => `\n$$\n${x.trim()}\n$$\n`)
            .replace(/\\\((.+?)\\\)/g, (_m, x) => `$${x}$`),
    )
    .join('');
}

