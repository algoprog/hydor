#!/usr/bin/env python3
"""Measure a manuscript: its length, chapters, sentences, dialogue, and the words and phrases it repeats.
The numbers are questions for the writer, not verdicts.

    python3 manuscript_stats.py draft.md          (also .txt or .docx)
    python3 manuscript_stats.py draft.docx --words just,really,suddenly,felt
    python3 manuscript_stats.py draft.txt --chapter-pattern "^Κεφάλαιο \\d+"

Chapters are found from Markdown headings (# ...), Word heading styles, and lines such as
"Chapter 3", "CHAPTER THREE", "Part Two", "Prologue", or a number alone on a line.
Standard library only.
"""

import argparse
import re
import statistics
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$")
CHAPTER = re.compile(r"^\s*(?:(?:chapter|part|book|prologue|epilogue|interlude|act)\b[^.!?]{0,60}"
                     r"|[IVXLC]{1,7}\.?|\d{1,3}\.?)\s*$", re.I)
BREAK = re.compile(r"^\s*(?:[*#~•·-]\s*){3,}$")
WORD = re.compile(r"[^\W_]+(?:['’][^\W_]+)*")
DIALOGUE = re.compile(r"“[^”\n]{1,2000}”|\"[^\"\n]{1,2000}\"|«[^»\n]{1,2000}»|„[^“\n]{1,2000}“")
SINGLE_DIALOGUE = re.compile(r"(?:(?<=\s)|^)‘[^’\n]{1,2000}?’(?=[\s.,;:!?—–-]|$)", re.M)
SENTENCE_END = re.compile(r"(?<=[.!?…])[\"”’»)\]]*\s+(?=[\"“‘«(\[—–-]?\w)|\n\s*\n")
ABBREVIATIONS = re.compile(r"\b(Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|Prof|vs|etc|e\.g|i\.e)\.", re.I)
STOP = set("""a about above after again against all am an and any are as at be because been before being below
between both but by can could did do does doing down during each few for from further had has have having he her
here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off
on once only or other our ours ourselves out over own same she should so some such than that the their theirs
them themselves then there these they this those through to too under until up very was we were what when where
which while who whom why will with would you your yours yourself yourselves said says say one two back like now
get got go went come came even still also well let s t don didn won isn wasn wouldn couldn ll re ve d m o
mr mrs ms dr st""".split())
CRUTCH = ["just", "really", "very", "quite", "rather", "suddenly", "actually", "somehow", "almost", "simply",
          "started to", "began to", "seemed to", "felt", "saw", "heard", "noticed", "realised", "realized",
          "wondered", "knew", "looked", "turned", "nodded", "shrugged", "sighed", "smiled"]
NOT_ADVERBS = set("""only family early likely reply supply apply belly bully holy ugly lovely friendly silly jelly fly
july italy daily lonely lively costly deadly elderly fly holly lily molly sally billy emily kelly ally rely
underbelly melancholy curly surly burly woolly hilly chilly smelly rally anomaly assembly monopoly comply
imply multiply butterfly dragonfly firefly bubbly cuddly wobbly wrinkly prickly""".split())


def read_docx(path):
    """A Word file's paragraphs as lines; headings get Markdown #'s from their style."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    lines = []
    for p in root.iter(W + "p"):
        parts = []
        for el in p.iter():
            if el.tag == W + "t":
                parts.append(el.text or "")
            elif el.tag in (W + "tab", W + "br", W + "cr"):
                parts.append(" ")
        text = "".join(parts).strip()
        style = p.find(f"{W}pPr/{W}pStyle")
        sid = style.get(W + "val", "") if style is not None else ""
        m = re.search(r"(?i)(?:heading|title)\s*(\d?)$", sid)
        if text and m:
            text = "#" * int(m.group(1) or 1) + " " + text
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def read_text(path):
    if path.suffix.lower() == ".docx":
        return read_docx(path)
    data = path.read_bytes()
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")


def split_chapters(text, pattern):
    """[(level, title, body)] in order; text before the first heading is a front section."""
    custom = re.compile(pattern, re.I) if pattern else None
    sections, title, level, body, breaks = [], "(before the first heading)", 0, [], 0
    for line in text.splitlines():
        m = HEADING.match(line)
        hit = (1 if custom and custom.match(line) else 0) or (len(m.group(1)) if m else 0) \
            or (1 if not custom and CHAPTER.match(line) and line.strip() else 0)
        if hit:
            sections.append((level, title, "\n".join(body)))
            title, level, body = (m.group(2) if m else line.strip()), hit, []
        else:
            if BREAK.match(line):
                breaks += 1
                line = ""
            body.append(line)
    sections.append((level, title, "\n".join(body)))
    return [s for s in sections if WORD.search(s[2]) or s[0]], breaks


def words_of(text):
    return WORD.findall(text)


def sentences_of(text):
    text = ABBREVIATIONS.sub(lambda m: m.group(0).replace(".", "․"), text)
    return [s.strip() for s in SENTENCE_END.split(text) if WORD.search(s)]


def syllables(word):
    w = word.lower().strip("'’")
    if len(w) <= 3:
        return 1
    w = re.sub(r"(?:[^laeiouy]es|ed|[^laeiouy]e)$", "", w)
    w = re.sub(r"^y", "", w)
    return max(1, len(re.findall(r"[aeiouy]{1,2}", w)))


def repeated_phrases(sentences, total_words):
    """Phrases of 3 to 6 words used again and again; overlapping ones are shown once, at their longest."""
    least = max(3, total_words // 25000)
    found = []
    for n in (6, 5, 4, 3):
        c = Counter()
        for s in sentences:
            ws = [w.lower().replace("’", "'") for w in words_of(s)]
            for i in range(len(ws) - n + 1):
                gram = tuple(ws[i:i + n])
                if any(w not in STOP and len(w) > 3 for w in gram):
                    c[gram] += 1
        found += [(g, k) for g, k in c.items() if k >= least]
    found.sort(key=lambda x: (-x[1], -len(x[0])))
    chosen = []
    for gram, k in found:
        tri = {gram[i:i + 3] for i in range(len(gram) - 2)}
        edges = {gram[:2], gram[-2:]}
        if any(tri & t or (k >= kb * 0.85 and edges & b) for t, b, kb in chosen):
            continue  # part of a phrase already listed
        chosen.append((tri, {gram[i:i + 2] for i in range(len(gram) - 1)}, k))
        yield " ".join(gram), k


def main():
    ap = argparse.ArgumentParser(description="Measure a manuscript (.md, .txt or .docx).")
    ap.add_argument("file", type=Path)
    ap.add_argument("--words", help="your own comma-separated list of words to count (default: common English crutch words)")
    ap.add_argument("--chapter-pattern", help="a regular expression for chapter lines, e.g. '^Kapitel \\d+'")
    ap.add_argument("--top", type=int, default=12, help="how many words and phrases to list (default 12)")
    a = ap.parse_args()
    if not a.file.is_file():
        sys.exit(f"No such file: {a.file}")
    if a.file.suffix.lower() not in (".md", ".markdown", ".txt", ".text", ".docx"):
        sys.exit("Give a .md, .txt or .docx file: save other formats (.doc, .odt, .rtf, Google Docs) as one of these.")
    try:
        text = read_text(a.file)
    except (zipfile.BadZipFile, KeyError, ET.ParseError):
        sys.exit(f"{a.file.name} could not be read as a Word file: save it as .docx, or as plain text.")
    sections, breaks = split_chapters(text, a.chapter_pattern)
    prose = "\n\n".join(s[2] for s in sections)
    words = words_of(prose)
    total = len(words)
    if total == 0:
        sys.exit("No words found.")
    lower = [w.lower().replace("’", "'") for w in words]
    english = sum(1 for w in lower if w in ("the", "and", "of", "to", "a")) / total > 0.04
    sentences = sentences_of(prose)
    lengths = [len(words_of(s)) for s in sentences]
    paragraphs = [p for p in re.split(r"\n\s*\n", prose) if WORD.search(p)]

    print(f"{a.file.name}: {total:,} words, {len(paragraphs):,} paragraphs, {len(sentences):,} sentences, "
          f"{breaks} scene break(s); about {max(1, round(total / 250)):,} manuscript pages at 250 words a page.")

    chapters = [s for s in sections if s[0]]
    if chapters:
        counts = [len(words_of(s[2])) for s in sections]
        main_level = Counter(s[0] for s in chapters).most_common(1)[0][0]
        median = statistics.median([c for s, c in zip(sections, counts) if s[0] == main_level]) or 1
        print(f"\nSections ({len(chapters)} headings; chapters taken to be the level-{main_level} ones, median "
              f"{median:,.0f} words):")
        for i, (s, c) in enumerate(zip(sections, counts), 1):
            note = ""
            if s[0] == main_level and (c > 1.6 * median or c < 0.5 * median):
                note = f"   <- {c / median:.1f} x the median"
            print(f"  {i:3}. {'  ' * max(s[0] - 1, 0)}{s[1][:60]:<{60 - 2 * max(s[0] - 1, 0)}} {c:>8,}{note}")
    else:
        print("\nNo chapter headings found (use # headings, Word's Heading styles, or --chapter-pattern).")

    if lengths:
        long_share = sum(1 for n in lengths if n > 30) / len(lengths)
        longest = max(range(len(sentences)), key=lambda i: lengths[i])
        print(f"\nSentences: {statistics.mean(lengths):.1f} words on average (median {statistics.median(lengths):.0f}); "
              f"{long_share:.0%} are over 30 words. The longest ({lengths[longest]} words) begins: "
              f"\"{' '.join(sentences[longest].split()[:14])} ...\"")
    quoted = DIALOGUE.findall(prose) or (SINGLE_DIALOGUE.findall(prose) if '"' not in prose and "“" not in prose else [])
    if quoted:
        share = sum(len(words_of(q)) for q in quoted) / total
        print(f"Dialogue: about {share:.0%} of the words are inside quotation marks ({len(quoted):,} quoted passages).")

    per_k = lambda n: n * 1000 / total
    joined = " " + " ".join(lower) + " "
    targets = [w.strip().lower() for w in a.words.split(",") if w.strip()] if a.words else (CRUTCH if english else [])
    hits = sorted(((w, joined.count(f" {w} ")) for w in targets), key=lambda x: -x[1])
    hits = [(w, n) for w, n in hits if n]
    if hits:
        print("Words to look at (per 1,000 words): " + ", ".join(f"{w} {per_k(n):.1f} ({n})" for w, n in hits[:a.top]))
    if english:
        ly = Counter(w for w in lower if w.endswith("ly") and len(w) > 4 and w not in NOT_ADVERBS)
        if ly:
            print(f"-ly words (mostly adverbs): {per_k(sum(ly.values())):.1f} per 1,000 words; most used: "
                  + ", ".join(f"{w} {n}" for w, n in ly.most_common(8)))

    phrases = list(repeated_phrases(sentences, total))
    if phrases:
        print("Repeated phrases: " + "; ".join(f"\"{p}\" {n}" for p, n in phrases[:a.top]))
    caps = Counter(w for w in words if w[0].isupper() and "'" not in w and "’" not in w)
    names = [(w, n) for w, n in caps.most_common(60)
             if w.lower() not in STOP and n >= 3 and lower.count(w.lower()) <= n * 1.1][:8]
    common = Counter(w for w in lower if w not in STOP and len(w) > 2 and "'" not in w
                     and w not in {n.lower() for n, _ in names})
    if names:
        print("Most named: " + ", ".join(f"{w} {n}" for w, n in names))
    print("Most used words: " + ", ".join(f"{w} {n}" for w, n in common.most_common(a.top)))
    if english and lengths:
        syl = sum(syllables(w) for w in words) / total
        grade = 0.39 * statistics.mean(lengths) + 11.8 * syl - 15.59
        print(f"Reading level: Flesch-Kincaid grade {grade:.1f} (rough; school years in the US system).")
    print("\nThese numbers are questions, not rules: one matters only if the writer did not mean it.")


if __name__ == "__main__":
    main()
