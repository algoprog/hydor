#!/usr/bin/env python3
"""Which colours of a palette can sit on which: the WCAG 2 contrast of every pair, and the nearest
shade that would pass as text where a colour is too faint.

Usage:
  python3 palette_contrast.py ink=#1F2A37 paper=#F7F3EA rust=#E4572E sage=#8AA37B white=#FFFFFF
  python3 palette_contrast.py "#1F2A37" "#F7F3EA" "#E4572E"        names are optional; # too

Give every colour text or backgrounds will use, white and near-black included. For a shade that passes
on another background, run it with just that background and the colour.
For each pair it says what the pair is good for:
  text        4.5:1 or more: text of any size
  large       3:1 up to 4.5:1: large text only (24 px, or 19 px bold) and icons, chart marks, borders
  decoration  under 3:1: never text; a background or decoration only
Then, for each colour too faint as small text on the palette's lightest or darkest colour, the
nearest shade that passes: darker on the light one, lighter on the dark one.
Exit code: 0, or 2 on bad input. Standard library only.
"""

import re
import sys


def parse(arg: str) -> tuple[str, tuple[int, int, int]]:
    name, _, value = arg.rpartition("=")
    s = value.strip().lower().lstrip("#")
    if re.fullmatch(r"[0-9a-f]{3}", s):
        s = "".join(c * 2 for c in s)
    if not re.fullmatch(r"[0-9a-f]{6}", s):
        raise ValueError(f"not a hex colour: {arg} (use #rrggbb or #rgb, optionally name=#rrggbb)")
    rgb = (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    return (name.strip() or hexof(rgb)), rgb


def hexof(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def luminance(rgb: tuple[int, int, int]) -> float:
    def channel(v: int) -> float:
        c = v / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def verdict(r: float) -> str:
    return "text" if r >= 4.5 else "large" if r >= 3 else "decoration"


def shade(rgb: tuple[int, int, int], bg: tuple[int, int, int], darker: bool):
    """The least change toward black (darker) or white (lighter) that makes rgb pass 4.5:1 on bg."""
    for step in range(1, 101):
        t = step / 100
        new = tuple(round(c * (1 - t)) if darker else round(c + (255 - c) * t) for c in rgb)
        if ratio(new, bg) >= 4.5:
            return new
    return None


def main(argv: list[str]) -> int:
    if len(argv) < 2 or any(a in ("-h", "--help") for a in argv):
        print(__doc__.strip())
        return 0 if argv else 2
    try:
        colours = [parse(a) for a in argv]
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    width = max(len(n) for n, _ in colours)
    pairs = []
    for i, (na, a) in enumerate(colours):
        for nb, b in colours[i + 1:]:
            pairs.append((ratio(a, b), na, nb))
    print("Each pair, highest contrast first (WCAG 2; text = any size, large = 24 px or 19 px bold and icons):")
    for r, na, nb in sorted(pairs, reverse=True):
        print(f"  {na:<{width}} and {nb:<{width}}  {r:5.2f}:1  {verdict(r)}")

    light = max(colours, key=lambda c: luminance(c[1]))
    dark = min(colours, key=lambda c: luminance(c[1]))
    fixes = []
    for name, rgb in colours:
        for (bname, bg), darker in ((light, True), (dark, False)):
            if name == bname or (not darker and name == light[0]):
                continue  # the lightest on the darkest is fixed by darkening the darkest
            if not 1.5 <= ratio(rgb, bg) < 4.5:
                continue  # passes already, or both are backgrounds (cream on white)
            new = shade(rgb, bg, darker)
            if new:
                fixes.append(f"  {name} as text on {bname}: {hexof(new)} ({'darker' if darker else 'lighter'}, {ratio(new, bg):.2f}:1)")
            else:
                fixes.append(f"  {name} as text on {bname}: no shade of it passes; use another colour")
    if fixes:
        print(f"\nShades that pass as small text (4.5:1) on the lightest ({light[0]}) and darkest ({dark[0]}) colours:")
        print("\n".join(fixes))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
