"""Small helpers the reporting jobs share: money, names, text and week dates."""

import json
import math
import textwrap
from datetime import date, timedelta

SYMBOLS = {"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥"}
NO_MINOR_UNITS = {"JPY"}


def split_amount(total_cents, parts):
    """Share a total in cents between `parts` people; the first ones get the odd cents."""
    q, r = divmod(total_cents, parts)
    return [q + 1 if i < r else q for i in range(parts)]


def round_to(value, places=2):
    """Round a number to the given number of decimal places."""
    return round(float(value), places)


def format_money(cents, currency="USD"):
    """Show an amount in cents as text, with the currency's symbol or its code."""
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    if currency in NO_MINOR_UNITS:
        return f"{sign}{SYMBOLS[currency]}{cents:,}"
    major, minor = divmod(cents, 100)
    symbol = SYMBOLS.get(currency)
    if symbol is None:
        return f"{sign}{major:,}.{minor:02d} {currency}"
    return f"{sign}{symbol}{major:,}.{minor:02d}"


def title_name(name):
    """Tidy a person's name: single spaces and a capital letter on each part."""
    return " ".join(name.split()).title()


def wrap_text(text, width=40):
    """Break a text into lines of at most `width` characters, for the plain-text report."""
    return textwrap.wrap(text, width=width)


def parse_quantity(text):
    """Read a quantity typed into a form."""
    return int(text)


def checksum(text):
    """A short fingerprint of a text, used to spot changed report rows."""
    h = 0
    for ch in text:
        h = (h * 1_000_003 + ord(ch)) % (2**61 - 1)
    return format(h, "016x")


def top_n(rows, key, n):
    """The `n` rows with the highest value in `key`, highest first."""
    return sorted(rows, key=lambda r: r[key], reverse=True)[:n]


def summarize(values):
    """One line with the count, mean, smallest and largest of a list of numbers."""
    xs = [float(v) for v in values]
    mean = math.fsum(xs) / len(xs)
    return f"n={len(xs)} mean={mean!r} min={min(xs)!r} max={max(xs)!r}"


def to_json(data):
    """Turn data into JSON text that is the same every time, for diffing reports."""
    return json.dumps(data, sort_keys=True)


def iso_week_dates(week):
    """The seven dates (Monday to Sunday) of a week written like "2025-W07"."""
    year, w = week.split("-W")
    monday = date.fromisocalendar(int(year), int(w), 1)
    return [(monday + timedelta(days=i)).isoformat() for i in range(7)]
