#!/usr/bin/env python3
"""WCAG 2 contrast ratio between two colours, with the AA and AAA results.

Usage:
  python3 contrast.py "#6b7280" "#ffffff"        foreground, then background
  python3 contrast.py 6b7280 fff                  the # is optional; 3- or 6-digit hex
  python3 contrast.py "rgb(107,114,128)" white    rgb() and a few colour names work too
  python3 contrast.py --pairs pairs.txt           one "foreground background [label]" per line;
                                                  lines starting with "# " or "//" are comments

Exit code: 0 when every pair passes AA for normal text (4.5:1), 1 otherwise, 2 on bad input.
Colours with transparency are not supported: give the colour as it looks on its background.
"""

import re
import sys

NAMES = {
    "white": "ffffff", "black": "000000", "red": "ff0000", "green": "008000", "blue": "0000ff",
    "gray": "808080", "grey": "808080", "silver": "c0c0c0", "navy": "000080", "orange": "ffa500",
}


def parse(colour: str) -> tuple[int, int, int]:
    s = colour.strip().lower()
    s = NAMES.get(s, s)
    m = re.fullmatch(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*1(?:\.0*)?\s*)?\)", s)
    if m:
        r, g, b = (int(x) for x in m.groups())
        if max(r, g, b) > 255:
            raise ValueError(f"rgb values must be 0-255: {colour}")
        return r, g, b
    s = s.lstrip("#")
    if re.fullmatch(r"[0-9a-f]{3}", s):
        s = "".join(c * 2 for c in s)
    if not re.fullmatch(r"[0-9a-f]{6}", s):
        raise ValueError(f"not a colour I can read: {colour} (use #rrggbb, #rgb or rgb(r, g, b))")
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def luminance(rgb: tuple[int, int, int]) -> float:
    def channel(v: int) -> float:
        c = v / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg: str, bg: str) -> float:
    a, b = luminance(parse(fg)), luminance(parse(bg))
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def report(fg: str, bg: str, label: str = "") -> bool:
    r = ratio(fg, bg)

    def ok(need: float) -> str:
        return "pass" if r >= need else "FAIL"

    print(f"{label + ': ' if label else ''}{fg} on {bg}: {r:.2f}:1")
    print(f"  AA  normal text 4.5:1 {ok(4.5)} | large text 3:1 {ok(3)} | UI parts and icons 3:1 {ok(3)}")
    print(f"  AAA normal text 7:1   {ok(7)} | large text 4.5:1 {ok(4.5)}")
    return r >= 4.5


def pairs(path: str) -> int:
    results = []
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            parts = line.split()
            if not parts or parts[0] == "#" or parts[0].startswith("//"):
                continue
            if len(parts) < 2:
                raise ValueError(f"line {n}: give a foreground and a background colour")
            results.append(report(parts[0], parts[1], " ".join(parts[2:])))
    if not results:
        raise ValueError(f"no colour pairs in {path}")
    failed = results.count(False)
    print(f"{len(results) - failed} of {len(results)} pairs pass AA for normal text")
    return 0 if failed == 0 else 1


def main(argv: list[str]) -> int:
    try:
        if len(argv) == 2 and argv[0] == "--pairs":
            return pairs(argv[1])
        if len(argv) != 2 or argv[0].startswith("-"):
            print(__doc__.strip())
            return 2
        return 0 if report(argv[0], argv[1]) else 1
    except (ValueError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
