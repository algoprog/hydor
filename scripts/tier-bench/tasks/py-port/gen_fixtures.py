"""Makes fixtures.json: every case is run through the real Python module (legacy/report_utils.py in seed/), so every
expected value is whatever Python 3.13 gives. Run: python3 gen_fixtures.py (the output is committed).

Inputs must mean the same after a trip through JSON into JavaScript, which cannot tell 2.0 from 2: no float with an
integral value in any input (summarize and round_to call float() themselves, so they may get either), ints within
+-2**53, no NaN or infinities, no lone surrogates.
"""

import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE / "seed" / "legacy"))
import report_utils as ru  # noqa: E402

LIMIT = 2**53
CASES = []
rng = random.Random(20261111)


def js_view(value):
    """What JavaScript sees after JSON.parse: a float with an integral value is just a number."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [js_view(v) for v in value]
    if isinstance(value, dict):
        return {k: js_view(v) for k, v in value.items()}
    return value


def check_input(fn, value, path="args"):
    """Refuses an input JavaScript could not tell from another one."""
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, int):
        assert abs(value) <= LIMIT, (fn, path, value)
    elif isinstance(value, float):
        assert math.isfinite(value), (fn, path, value)
        assert fn in ("summarize", "round_to") or not value.is_integer(), (fn, path, value)
    elif isinstance(value, str):
        for ch in value:
            assert not 0xD800 <= ord(ch) <= 0xDFFF, (fn, path, "lone surrogate")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            check_input(fn, v, f"{path}[{i}]")
    elif isinstance(value, dict):
        for k, v in value.items():
            assert isinstance(k, str), (fn, path, k)
            check_input(fn, k, f"{path}.key")
            check_input(fn, v, f"{path}.{k}")
    else:
        raise AssertionError((fn, path, type(value)))


def check_output(fn, value):
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, int):
        assert abs(value) <= LIMIT, (fn, value)
    elif isinstance(value, float):
        assert math.isfinite(value), (fn, value)
    elif isinstance(value, str):
        for ch in value:
            assert not 0xD800 <= ord(ch) <= 0xDFFF, (fn, "lone surrogate in output")
    elif isinstance(value, list):
        for v in value:
            check_output(fn, v)
    elif isinstance(value, dict):
        for k, v in value.items():
            check_output(fn, v)
    else:
        raise AssertionError((fn, type(value)))


def add(fn, *args):
    check_input(fn, list(args))
    func = getattr(ru, fn)
    # What JavaScript will pass in: the args after a trip through JSON.
    seen = js_view(json.loads(json.dumps(list(args))))
    try:
        expect = func(*seen)
    except Exception as e:  # noqa: BLE001
        CASES.append({"fn": fn, "args": list(args), "raises": type(e).__name__})
        return
    check_output(fn, expect)
    CASES.append({"fn": fn, "args": list(args), "expect": expect})


def nonint(x):
    return x + 0.5 if float(x).is_integer() else x


# ---------------------------------------------------------------- split_amount
for total, parts in [
    (100, 4), (1000, 3), (5, 2), (7, 7), (10, 1), (1, 3), (12345, 6), (1_000_000, 7), (3, 12),
    (0, 3), (-1, 2), (-100, 3), (-7, 2), (-1000, 3), (-5, 12), (-10**12, 7), (10**12 + 1, 12), (-10**12 - 1, 12),
    (2**53 - 1, 3), (5, -1), (-5, -2), (100, -3), (0, -3), (10, 0), (0, 0), (-10, 0),
]:
    add("split_amount", total, parts)
for _ in range(6):
    add("split_amount", rng.randint(-10**12, 10**12), rng.randint(-3, 12))

# -------------------------------------------------------------------- round_to
for v in [3.14159, 1234.5678, 0.1, 99.999, 100.126, -3.14159, -0.456]:
    add("round_to", v)
for v, p in [(2.71828, 3), (3.14159, 4), (2.71828, 0), (-9.87654, 3), (0.000123456, 6), (1.23456789012, 10), (3.9, 0)]:
    add("round_to", v, p)
for v, p in [(0.125, 2), (0.375, 2), (2.5, 0), (-2.5, 0), (0.5, 0), (1.5, 0), (1234.5, 0), (-1.375, 2), (-1.375, 3), (0.625, 2), (10.5, 0), (1.0625, 3)]:
    add("round_to", v, p)
for v, p in [(2.675, 2), (1.005, 2), (0.285, 2), (1.455, 2), (8.345, 2), (1.115, 2), (4.35, 1), (1.0049999999999999, 2), (5.015, 2), (9.995, 2)]:
    add("round_to", v, p)
for v, p in [(1250, -2), (1350, -2), (15, -1), (25, -1), (35, -1), (1234.567, -2), (-1250, -2), (4999, -3)]:
    add("round_to", v, p)
for v, p in [(0.1, 10), (1 / 3, 10), (123456.789012, 9), (1e-05, 10), (1.5e-07, 6), (-0.001, 2), (-0.0004, 3)]:
    add("round_to", v, p)
for v, p in [(7, 2), (7, 0), (123456789, 2), (-42, 1), (2**53 - 1, 0), (125, -1), (0, 2)]:
    add("round_to", v, p)
for _ in range(6):
    add("round_to", nonint(round(rng.uniform(-5000, 5000), rng.randint(1, 6))), rng.randint(0, 5))

# ---------------------------------------------------------------- format_money
for args in [
    (123456,), (5,), (100,), (1,), (0,), (1000000,), (100000000000,), (2**53 - 1,),
    (-5,), (-123456,), (-100,), (-99999,),
    (123456, "USD"), (5, "EUR"), (150000, "GBP"), (-2599, "EUR"), (99, "GBP"), (123456789012, "EUR"),
    (1500, "JPY"), (0, "JPY"), (-1500, "JPY"), (1234567890, "JPY"), (7, "JPY"),
    (250000, "CHF"), (5, "CHF"), (-12345, "CHF"), (0, "CHF"), (100, "usd"),
]:
    add("format_money", *args)
for _ in range(4):
    add("format_money", rng.randint(-10**10, 10**10), rng.choice(["USD", "EUR", "GBP", "JPY", "CHF"]))

# ------------------------------------------------------------------ title_name
for name in [
    "ada lovelace", "GRACE HOPPER", "alan turing", "  grace   hopper ", "mary jane watson", "", "   ",
    " \tada\t\tlovelace\n", "first\tmiddle\nlast",
    "3rd avenue", "apt 4b", "42nd street", "b2b sales",
    "o'neil", "d'artagnan's", "o'brien-smith", "mary's lamb", "don't stop",
    "anne-marie", "jean-luc picard", "x-ray",
    "mcDONALD", "mIxEd CaSe", "DeVries", "élodie ÇELIK", "ünal öztürk", "straße", "ß", "ΣΟΦΟΣ ΑΘΗΝΑ",
    "\ufeffjohn smith", "john \ufeffsmith", "ad\u00a0a lovelace", "ada\u3000lovelace",
    "ada\u001flovelace",
    "john_smith", "j.r.r. tolkien", "日本語 テスト", "привет мир", "a😀b",
]:
    add("title_name", name)
for _ in range(3):
    words = ["".join(rng.choice("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'-0123456789") for _ in range(rng.randint(1, 9))) for _ in range(rng.randint(1, 4))]
    add("title_name", rng.choice([" ", "  ", "\t"]).join(words))

# ------------------------------------------------------------------- wrap_text
LOREM = "The quarterly report shows that revenue grew in every region, although the northern offices were slower than expected, and the finance team asks everyone to check the figures before Friday."
SENT = "The quick brown fox jumps over the lazy dog."
for text, *w in [
    (SENT,), ("short",), ("",), ("   ",),
    (SENT, 10), (SENT, 20), (SENT, 44), (SENT, 43), (SENT, 9),
    (LOREM,), (LOREM, 30), (LOREM, 25), (LOREM, 72),
    ("This is a well-known state-of-the-art e-mail system.", 20),
    ("This is a well-known state-of-the-art e-mail system.",),
    ("Please re-enter the x-ray results and the co-operation notes.", 11),
    ("a well-known-but-rather-long-hyphenated-compound-word here", 16),
    ("Wait -- what? That is -- well -- surprising---really.", 14),
    ("Stop\u2014start the engine\u2014now\u2014please.", 12),
    ("An extraordinarily long word: supercalifragilisticexpialidocious, and more.", 15),
    ("An extraordinarily long word: supercalifragilisticexpialidocious, and more.", 1),
    ("See https://example.com/a/very/long/path/to/some/report.html for details.", 25),
    ("The change was -5 percent or +3 points, not -- or ---7 at all.", 14),
    ("1-2-3 go 10-20 and 3-4-5-6 now", 6),
    ("Try the café-crème and the crème-brûlée at the déjà-vu café.", 14),
    ("Column\tone\ttwo\tthree\tfour", 12),
    ("tab at the end\t", 20),
    ("one  two   three    four     five      six", 12),
    ("line one\nline two\n\nline four after a blank", 12),
    ("line one\nline two\n\nline four after a blank", 40),
    ("   leading and trailing spaces   ", 10),
    ("\t\n  \t ", 5),
    ("a b c d e f g h i j k l m n o p", 1),
    ("Words\u00a0joined\u00a0by\u00a0no-break spaces stay together here", 12),
    ("Emoji 😀😀😀😀😀 here and 👍🏽 there", 6),
    ("日本語のテキストはスペースがありません", 5),
    ("word", 3), ("word word", 4), ("word word", 8),
    ("a-b-c-d-e-f-g", 3), ("abc-def-ghi", 4),
    ("snake_case_names and some_other_identifiers are one word each", 14),
    ("Dear Sir,\n\nThank you for your letter of 3rd June. We are delighted to confirm that your order, no. 4411-A, has shipped.\n\nRegards,\nThe Team", 30),
    ("hello", 0), ("hello", -1), ("", 0), ("a b c", -10),
]:
    add("wrap_text", text, *w)
for _ in range(6):
    vocab = ["report", "figures", "well-known", "the", "a", "quarterly", "x-ray", "re-check", "numbers", "-5", "+3", "co-op", "state-of-the-art", "e-mail", "--", "so", "of", "total", "revenue,", "(draft)", "done.", "pre-1999", "A-1", "q3-q4"]
    words = [rng.choice(vocab) for _ in range(rng.randint(3, 40))]
    seps = [rng.choice([" ", " ", " ", "  ", "\n", "\t"]) for _ in words]
    add("wrap_text", "".join(w + s for w, s in zip(words, seps)), rng.randint(1, 60))

# -------------------------------------------------------------- parse_quantity
for text in [
    "12", "-3", "+7", " 42 ", "007", "0", "-0", "9007199254740991", "-9007199254740991", "100", "- 3",
    "\t12", "12\n", "\n 12 \t", "\u00a012", "\u300012\u3000", "\x0b9\x0c", "\u008511\u0085", "\r\n4\r\n",
    "1_000", "1_0_0", "-1_000", "+9_9", "1__000", "_1", "1_", "1_ 2", "+_5", "1_000_",
    "٤٢", "１２", "४२", "-٤٢", "１_２", "𝟙𝟚", "1２",
    "", " ", "1.0", "1e3", "0x10", "1 000", "--1", "+-1", "+ 1", "12a", "1,000", "½", "Ⅻ", "²", "12\u200b", "\ufeff12",
]:
    add("parse_quantity", text)
for _ in range(5):
    n = rng.randint(-10**12, 10**12)
    s = f"{n:,}".replace(",", "_") if rng.random() < 0.5 else str(n)
    add("parse_quantity", " " * rng.randint(0, 2) + s + "\t" * rng.randint(0, 1))

# -------------------------------------------------------------------- checksum
for text in [
    "", "a", "abc", "hello", "Hello, World!", "report-2025-Q3", "x" * 6, "0123456789", "The quick brown fox", "row 17|North|12500", "\x00",
    "café", "日本語", "€100", "你好，世界", "\u00ff\u0100", "\uffff",
    "👍🏽", "😀", "𝔘𝔫𝔦𝔠𝔬𝔡𝔢", "a😀b", "\U0010ffff",
    "abcdefghij" * 120,
    "".join(chr(33 + i % 90) for i in range(1500)),
    ("日本語テキスト" * 200),
    ("😀a" * 600),
]:
    add("checksum", text)
for _ in range(7):
    pool = rng.choice(["abcdefghijklmnopqrstuvwxyz", "ABC123 -_|", "éèêëñüöß日本語한국어", "😀👍🏽🎉𝔘𝔫"])
    add("checksum", "".join(rng.choice(pool) for _ in range(rng.randint(1, 400))))

# ------------------------------------------------------------------------ top_n
R = lambda *vals, k="v": [{"id": i, k: v} for i, v in enumerate(vals)]  # noqa: E731
for rows, key, n in [
    (R(5, 9, 7), "v", 2), (R(3, 1, 2, 5, 4, 8, 7), "v", 3),
    ([{"name": "a", "sales": 5}, {"name": "b", "sales": 9}, {"name": "c", "sales": 7}], "sales", 2),
    ([{"name": "north", "total": 1200}, {"name": "south", "total": 800}, {"name": "east", "total": 2300}, {"name": "west", "total": 1500}], "total", 3),
    (R(-3, -1, -2, 0, 4), "v", 2), (R(10**12, 10**12 - 1, -10**12), "v", 2),
    (R(2.5, 9.75, 7.125, 0.5), "v", 2), (R(0.1, 0.2, 0.30000000000000004, 0.3), "v", 4), (R(1.5, 2, 1.25, 3, 2.75), "v", 3),
    (R(5, 5, 5, 5), "v", 2), (R(1, 3, 3, 2, 3, 1), "v", 4), (R(2, 2, 1, 1, 2), "v", 5), (R(1.5, 1.5, 0.5, 1.5), "v", 3), (R("b", "b", "a", "b"), "v", 3),
    (R(5, 9, 7), "v", 0), (R(5, 9, 7), "v", 10), (R(5, 9, 7), "v", -1), (R(1, 2, 3, 4, 5, 6), "v", -2), ([], "v", 3), (R(4), "v", 1),
    (R("apple", "Banana", "cherry", "Apple"), "v", 4), (R("café", "cafe", "cafz", "cafë"), "v", 4), (R("élan", "zebra", "Zebra", "eclair"), "v", 4),
    (R("\U0001F600", "\uFF21", "z", "A"), "v", 4), (R("\ue000", "\U00010000", "\uffff"), "v", 3), (R("日本", "日本語", "日"), "v", 3),
    (R("10", "9", "2", "100"), "v", 4),
    ([{"id": 1, "v": 5}, {"id": 2}], "v", 2), ([{"id": 1}], "v", 1), ([{"id": 1, "v": 5}], "missing", 1),
    (R(1, "a"), "v", 2), (R(1, 2, "a"), "v", 3), (R(1.5, "a"), "v", 0), (R(None, 1), "v", 1), (R("only"), "v", 1),
]:
    add("top_n", rows, key, n)
for _ in range(5):
    kind = rng.choice(["int", "float", "str"])
    vals = [rng.randint(0, 6) if kind == "int" else nonint(rng.randint(0, 6) / 4) if kind == "float" else rng.choice(["a", "B", "c", "é", "Z", "z", "😀", "ａ"]) for _ in range(rng.randint(2, 12))]
    add("top_n", R(*vals), "v", rng.randint(-3, 14))

# ------------------------------------------------------------------- summarize
for vals in [
    [1, 2, 4], [2.5, 3.5], [10, 20, 30, 40], [3], [7.25], [100, 200.5, 300.25], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [-1, -2, -4], [-2.5, 3.5, 0.5], [-10, 10],
    [0.1] * 10, [0.1, 0.2, 0.3], [1e16, 1.0, -1e16], [1e100, 1.0, -1e100], [0.7, 0.1, 0.2], [0.1] * 100, [1 / 3] * 7, [123456789.123, 0.000123, 98765.4321, 1e-7], [1e15, 0.3, -1e15],
    [1e-05], [1.5e-07, 2.5e-07], [1e-05, 2e-05, 3e-05], [1e16], [2.5e20, 2.5e20], [1e-05, 1e5], [0.0001, 0.001], [0.0001], [123456789012345.67, 1.5],
    [2.0, 4.0], [1.0], [9007199254740991, 1], [-0.0001, 0.0001],
    [],
]:
    add("summarize", vals)
for _ in range(4):
    add("summarize", [round(rng.uniform(-1000, 1000), rng.randint(0, 6)) if rng.random() < 0.7 else rng.randint(-100, 100) for _ in range(rng.randint(1, 40))])

# --------------------------------------------------------------------- to_json
for data in [
    {"b": 1, "a": [1, 2]}, "hello", {"name": "Ada", "age": 36, "admin": True, "boss": None}, [1, 2, 3], {"z": {"y": [1, {"x": "w"}]}, "a": []}, 42, -7, True, None, "", [], {}, {"a": [[], {}]},
    [1, "two", 3.5, True, None, [4], {"five": 5}],
    0.1, 123456.789, -0.5, 1e-05, 1.5e-07, 5e-324, 0.0001, 123456789012345.67, [1e-05, 1.5e-07, 0.1],
    {"café": 1, "naïve": 2}, "日本語", "emoji 😀 and 👍🏽", "𝔘𝔫𝔦𝔠𝔬𝔡𝔢", "é", "\u2028\u2029", "\u007f", "~ is ascii, \x7f is not shown",
    "line1\nline2", "tab\there", "quote\"s and back\\slash", "\x00\x01\x1f", "\b\f", "a/b",
    {"b": 1, "B": 2, "a": 3, "A": 4}, {"10": 1, "9": 2, "2": 3, "1": 4, "": 5, "a": 6}, {"é": 1, "e": 2, "z": 3, "Z": 4}, {"\U0001F600": 1, "\uFF21": 2, "a": 3}, {"\ue000": 1, "\U00010000": 2, "\uffff": 3},
    {"k\n": 1, "k\"": 2, "日本": 3},
    {"users": [{"name": "Zed", "tags": ["x", "y"], "score": 9.5}, {"name": "Amy", "tags": [], "score": 7.25}], "total": 2, "ok": True},
    {"rows": [{"id": 1, "amount": 12.5}, {"id": 2, "amount": 0.1}], "currency": "EUR", "note": None},
    [[1, 2], [3, [4, [5]]]], 9007199254740991, -9007199254740991,
]:
    add("to_json", data)
for _ in range(4):
    def rand_value(depth=0):
        r = rng.random()
        if depth > 2 or r < 0.4:
            return rng.choice([rng.randint(-1000, 1000), nonint(round(rng.uniform(-50, 50), 3)), "".join(rng.choice("abcé日😀 \"\\\n/") for _ in range(rng.randint(0, 6))), True, False, None])
        if r < 0.7:
            return [rand_value(depth + 1) for _ in range(rng.randint(0, 4))]
        return {"".join(rng.choice("abcZ09é日😀_") for _ in range(rng.randint(0, 3))): rand_value(depth + 1) for _ in range(rng.randint(0, 4))}
    add("to_json", rand_value())

# ------------------------------------------------------------- iso_week_dates
for week in [
    "2025-W07", "2025-W01", "2025-W52", "2024-W10", "2023-W30", "2000-W20", "1970-W01", "2100-W08",
    "2020-W53", "2015-W53", "2026-W53", "2021-W53", "2025-W53", "2024-W53", "2100-W53", "2000-W53", "2016-W53",
    "2026-W01", "2021-W01", "2021-W52", "2020-W01", "2010-W01",
    "2024-W09", "2000-W09", "2100-W09", "2024-W26",
    "2025-W7", "+2025-W07", "2025-W+7", "2025-W0_7", " 2025-W07", "２０２５-W０７", "2025-W007",
    "2025-W00", "2025-W54", "2025-w07", "2025-07", "2025-W07-1", "0000-W01", "10000-W01", "-2025-W07", "2025-W-1", "2025-W", "-W07", "", "abcd-W07", "2025-W7.0", "2025-W1_",
    "0001-W01", "0001-W02", "0001-W53", "9999-W01", "9999-W51", "9999-W52", "9999-W53",
]:
    add("iso_week_dates", week)
for _ in range(8):
    add("iso_week_dates", f"{rng.randint(1900, 2100)}-W{rng.randint(1, 53):02d}")

# ------------------------------------------------------------------------ write
out = HERE / "fixtures.json"
out.write_text(json.dumps(CASES, ensure_ascii=True, separators=(",", ":"), allow_nan=False) + "\n")
counts = {}
for c in CASES:
    counts.setdefault(c["fn"], [0, 0])[0 if "expect" in c else 1] += 1
for fn, (ok, bad) in counts.items():
    print(f"{fn:15} {ok + bad:3} cases, {bad} raise")
print("total", len(CASES), "bytes", out.stat().st_size)
