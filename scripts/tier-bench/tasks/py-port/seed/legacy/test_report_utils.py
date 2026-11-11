import unittest

from report_utils import (
    checksum,
    format_money,
    iso_week_dates,
    parse_quantity,
    round_to,
    split_amount,
    summarize,
    title_name,
    to_json,
    top_n,
    wrap_text,
)


class ReportUtilsTest(unittest.TestCase):
    def test_split_amount(self):
        self.assertEqual(split_amount(100, 4), [25, 25, 25, 25])
        self.assertEqual(split_amount(1000, 3), [334, 333, 333])
        self.assertEqual(split_amount(5, 2), [3, 2])

    def test_round_to(self):
        self.assertEqual(round_to(3.14159), 3.14)
        self.assertEqual(round_to(2.71828, 3), 2.718)
        self.assertEqual(round_to(7), 7.0)

    def test_format_money(self):
        self.assertEqual(format_money(123456), "$1,234.56")
        self.assertEqual(format_money(5, "EUR"), "€0.05")
        self.assertEqual(format_money(1500, "JPY"), "¥1,500")
        self.assertEqual(format_money(250000, "CHF"), "2,500.00 CHF")

    def test_title_name(self):
        self.assertEqual(title_name("ada lovelace"), "Ada Lovelace")
        self.assertEqual(title_name("  grace   hopper "), "Grace Hopper")

    def test_wrap_text(self):
        self.assertEqual(wrap_text("the quick brown fox jumps over the lazy dog", 20), ["the quick brown fox", "jumps over the lazy", "dog"])
        self.assertEqual(wrap_text("short"), ["short"])

    def test_parse_quantity(self):
        self.assertEqual(parse_quantity("12"), 12)
        self.assertEqual(parse_quantity(" 42 "), 42)
        self.assertEqual(parse_quantity("-3"), -3)
        with self.assertRaises(ValueError):
            parse_quantity("twelve")

    def test_checksum(self):
        self.assertEqual(checksum(""), "0000000000000000")
        self.assertEqual(checksum("abc"), "00005838bb130ef2")
        self.assertNotEqual(checksum("abc"), checksum("abd"))

    def test_top_n(self):
        rows = [{"name": "a", "sales": 5}, {"name": "b", "sales": 9}, {"name": "c", "sales": 7}]
        self.assertEqual([r["name"] for r in top_n(rows, "sales", 2)], ["b", "c"])
        self.assertEqual(top_n(rows, "sales", 10)[0]["name"], "b")

    def test_summarize(self):
        self.assertEqual(summarize([1, 2, 4]), "n=3 mean=2.3333333333333335 min=1.0 max=4.0")
        self.assertEqual(summarize([2.5, 3.5]), "n=2 mean=3.0 min=2.5 max=3.5")

    def test_to_json(self):
        self.assertEqual(to_json({"b": 1, "a": [1, 2]}), '{"a": [1, 2], "b": 1}')
        self.assertEqual(to_json("hello"), '"hello"')

    def test_iso_week_dates(self):
        dates = iso_week_dates("2025-W07")
        self.assertEqual(dates[0], "2025-02-10")
        self.assertEqual(dates[6], "2025-02-16")
        self.assertEqual(len(dates), 7)


if __name__ == "__main__":
    unittest.main()
