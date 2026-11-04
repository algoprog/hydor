#!/usr/bin/env python3
"""Check one web page for the search basics: can search engines and AI crawlers reach and index it,
and are its title, description, headings, images, structured data and link preview in order.

Usage:
  python3 page_check.py https://example.com/page          the live page, the site's robots.txt, http -> https
  python3 page_check.py saved-page.html                   a saved or draft page (no robots.txt check)
  python3 page_check.py URL --robots draft-robots.txt     test a robots.txt before publishing it
  python3 page_check.py URL --agent Amazonbot             check more crawlers, by their robots.txt name
  python3 page_check.py URL --json                        the same report as JSON

It reads the HTML as the server sends it, without running JavaScript, and cannot tell whether a page is
indexed or how it ranks (Search Console's URL Inspection can). Python 3 standard library only.
"""
import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

UA = "Mozilla/5.0 (compatible; page-check/1.0)"
# Crawlers checked by default: their name in robots.txt, and what blocking them affects.
CRAWLERS = [
    ("Googlebot", "Google Search, AI Overviews and AI Mode", "search"),
    ("Bingbot", "Bing and Copilot", "search"),
    ("OAI-SearchBot", "ChatGPT search", "ai-search"),
    ("Claude-SearchBot", "Claude's search", "ai-search"),
    ("PerplexityBot", "Perplexity search", "ai-search"),
    ("GPTBot", "OpenAI model training", "training"),
    ("ClaudeBot", "Anthropic model training", "training"),
    ("Google-Extended", "Gemini training and grounding (not Search)", "training"),
    ("Applebot-Extended", "Apple model training", "training"),
    ("CCBot", "Common Crawl (used to train many models)", "training"),
]
SKIP = {"script", "style", "noscript", "template", "svg"}  # their text is not page text
HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


class Redirects(HTTPRedirectHandler):
    """Follows redirects (308 too, which Python before 3.11 does not) and records each hop."""

    def __init__(self):
        self.hops = []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.hops.append([code, newurl])
        return super().redirect_request(req, fp, 307 if code == 308 else code, msg, headers, newurl)

    http_error_308 = HTTPRedirectHandler.http_error_302


def fetch(url, limit=5_000_000):
    """GET a URL, following redirects. Returns (status, final address, headers, text, redirects);
    status 0 and the reason as text when there was no answer."""
    handler = Redirects()
    try:
        req = Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"})
        with build_opener(handler).open(req, timeout=20) as r:
            status, final, headers, body = r.status, r.geturl(), r.headers, r.read(limit)
    except HTTPError as e:
        status, final, headers, body = e.code, e.geturl() or url, e.headers, e.read(limit) if e.fp else b""
    except (URLError, OSError, ValueError) as e:
        return 0, url, {}, str(getattr(e, "reason", e)), handler.hops
    charset = headers.get_content_charset() if hasattr(headers, "get_content_charset") else None
    try:
        text = body.decode(charset or "utf-8", "replace")
    except LookupError:
        text = body.decode("utf-8", "replace")
    return status, final, headers, text, handler.hops


class Page(HTMLParser):
    """What a search engine reads first: title, meta tags, canonical, headings, images, links,
    structured data and the amount of text."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lang, self.title, self.meta, self.canonicals = None, None, {}, []
        self.headings, self.images, self.links, self.jsonld, self.itemtypes = [], [], [], [], []
        self.words, self._skip, self._capture, self._jsonld = 0, 0, None, None

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html":
            self.lang = a.get("lang") or None
        elif tag == "meta":
            key = (a.get("name") or a.get("property") or "").lower()
            if key:
                self.meta.setdefault(key, []).append(a.get("content", ""))
        elif tag == "link" and "canonical" in a.get("rel", "").lower().split():
            self.canonicals.append(a.get("href", ""))
        elif tag == "img" and not self._skip:
            self.images.append([a.get("src") or a.get("data-src") or "", "alt" in a])
        elif tag == "a" and a.get("href") and not self._skip:
            self.links.append(a["href"])
        if a.get("itemtype"):
            self.itemtypes += [t.rstrip("/").rsplit("/", 1)[-1] for t in a["itemtype"].split()]
        if tag == "script" and a.get("type", "").split(";")[0].strip().lower() == "application/ld+json":
            self._jsonld = []
        if tag in SKIP:
            self._skip += 1
        elif (tag in HEADINGS or tag == "title") and not self._skip:
            if self._capture and self._capture[0] in HEADINGS:  # an unclosed heading ends here
                self._finish()
            if not self._capture:
                self._capture = [tag, []]

    def handle_endtag(self, tag):
        if tag in SKIP and self._skip:
            self._skip -= 1
            if tag == "script" and self._jsonld is not None:
                self.jsonld.append("".join(self._jsonld))
                self._jsonld = None
        elif self._capture and tag == self._capture[0]:
            self._finish()

    def handle_data(self, data):
        if self._jsonld is not None:
            self._jsonld.append(data)
        elif not self._skip:
            if self._capture:
                self._capture[1].append(data)
            if not (self._capture and self._capture[0] == "title"):
                self.words += len(data.split())

    def _finish(self):
        tag, parts = self._capture
        text = " ".join("".join(parts).split())
        if tag == "title":
            self.title = text if self.title is None else self.title
        else:
            self.headings.append([int(tag[1]), text])
        self._capture = None


def jsonld_types(blocks):
    """The @type of each top-level item (and @graph item) in JSON-LD blocks, and the parse errors."""
    types, errors = [], []
    for raw in blocks:
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            errors.append(f"{e.msg} at line {e.lineno}, column {e.colno}")
            continue
        for item in data if isinstance(data, list) else [data]:
            if not isinstance(item, dict):
                continue
            graph = item.get("@graph")
            for node in graph if isinstance(graph, list) else [item]:
                t = node.get("@type") if isinstance(node, dict) else None
                types += [str(x) for x in t] if isinstance(t, list) else [str(t)] if t else []
    return types, errors


VALUED = ("max-snippet", "max-image-preview", "max-video-preview", "unavailable_after")


def directives(values):
    """Robots directives from meta tags and X-Robots-Tag headers, without a crawler-name prefix
    ("googlebot: noindex" gives "noindex"; "max-image-preview:none" stays whole)."""
    out = []
    for value in values:
        for part in value.lower().split(","):
            part = part.strip()
            name = part.split(":", 1)[0].strip()
            if ":" in part and name not in VALUED:
                part = part.split(":", 1)[1].strip()
            if part:
                out.append(re.sub(r"\s+", "", part))
    return out


# ---- robots.txt, read as Google documents it (RFC 9309) ------------------------------------------

def parse_robots(text):
    """Groups of user agents with their allow/disallow rules, and the Sitemap lines."""
    groups, sitemaps, current, in_rules = [], [], None, False
    for line in text.lstrip("\ufeff").splitlines():
        line = line.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        key, value = (s.strip() for s in line.split(":", 1))
        key = key.lower()
        if key == "user-agent":
            if current is None or in_rules:  # user-agent lines after rules start a new group
                current, in_rules = {"agents": [], "rules": []}, False
                groups.append(current)
            current["agents"].append(value)
        elif key in ("allow", "disallow"):
            in_rules = True
            if current is not None and value:  # a rule without a path is ignored
                current["rules"].append([key, value])
        elif key == "sitemap":
            sitemaps.append(value)  # other lines (crawl-delay, ...) do not end a group
    return groups, sitemaps


def agent_token(value):
    """'Googlebot/2.1' and 'googlebot*' both mean googlebot; a value starting with * is everyone."""
    if value.startswith("*"):
        return "*"
    m = re.match(r"[A-Za-z_-]+", value)
    return m.group(0).lower() if m else ""


def encode(path):
    """Percent-encode what is not ASCII and upper-case escapes, so rules and paths compare alike."""
    path = quote(path, safe="/?=&;:@!$'()*+,%-._~")
    return re.sub(r"%[0-9a-fA-F]{2}", lambda m: m.group(0).upper(), path)


def rule_matches(pattern, path):
    end = pattern.endswith("$")
    body = pattern[:-1] if end else pattern
    regex = "".join(".*" if c == "*" else re.escape(c) for c in body) + ("$" if end else "")
    return re.match(regex, path) is not None


def robots_verdict(groups, agent, path):
    """(allowed, the rule that decided, whose group). The crawler's own groups replace the * group;
    the longest matching rule wins, and allow wins a tie."""
    name = agent.lower()
    chosen = [g for g in groups if any(agent_token(a) == name for a in g["agents"])]
    whose = agent
    if not chosen:
        chosen = [g for g in groups if any(agent_token(a) == "*" for a in g["agents"])]
        whose = "*"
    if path == "/robots.txt" or not chosen:
        return True, None, whose if chosen else None
    best = None
    for kind, pattern in (r for g in chosen for r in g["rules"]):
        pattern = encode(pattern)
        if rule_matches(pattern, path):
            rank = (len(pattern), kind == "allow")
            if best is None or rank > best[0]:
                best = (rank, kind, pattern)
    if best is None:
        return True, None, whose
    return best[1] == "allow", f"{best[1].capitalize()}: {best[2]}", whose


# ---- the check ------------------------------------------------------------------------------------

def same_page(a, b):
    a, b = urlsplit(a), urlsplit(b)
    return (a.scheme, a.netloc.lower(), a.path or "/", a.query) == (b.scheme, b.netloc.lower(), b.path or "/", b.query)


def check(source, robots_file=None, extra_agents=()):
    is_url = source.startswith(("http://", "https://"))
    report = {"source": source, "problems": [], "checks": []}
    problem, note = report["problems"].append, report["checks"].append
    x_robots = []
    if is_url:
        status, final, headers, html, hops = fetch(source)
        report.update(status=status, address=final, redirects=hops)
        if status == 0:
            report["error"] = f"no answer: {html}"
            return report
        if len(hops) > 1:
            note(f"{len(hops)} redirects before the page: link straight to {final}")
        if urlsplit(final).scheme != "https":
            problem("The page is served over http, not https")
        else:
            s, f, _, _, _ = fetch("http://" + source.split("://", 1)[1], limit=1000)
            report["http_redirects_to_https"] = (urlsplit(f).scheme == "https") if s else None
            if s and urlsplit(f).scheme != "https":
                problem(f"The http:// address does not redirect to https:// (it answers HTTP {s})")
        robots(report, final, robots_file, extra_agents)
        if status != 200:
            problem(f"The page answers HTTP {status}: search engines will not index it like this"
                    + (" (the site may refuse automated checks: look in a browser, and with URL Inspection"
                       " in Search Console)" if status in (401, 403, 429, 503) else ""))
            return report
        x_robots = headers.get_all("X-Robots-Tag") or []
    else:
        try:
            html = Path(source).read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            report["error"] = str(e)
            return report
        final = report["address"] = Path(source).resolve().as_uri()

    page = Page()
    page.feed(html)
    page.close()
    meta = page.meta
    title, desc = page.title, (meta.get("description") or [None])[0]
    robots_meta = [c for k in ("robots", "googlebot", "bingbot") for c in meta.get(k, [])]
    ds = directives(robots_meta + x_robots)
    canonicals = sorted({urljoin(final, c) if is_url else c for c in page.canonicals if c})
    types, errors = jsonld_types(page.jsonld)
    h1 = [h for h in page.headings if h[0] == 1]
    no_alt = [src for src, has_alt in page.images if not has_alt]
    host = urlsplit(final).netloc.lower()
    internal = [u for u in page.links if urlsplit(urljoin(final, u)).netloc.lower() == host]
    social = {k: bool((meta.get(k) or [""])[0].strip()) for k in ("og:title", "og:description", "og:image")}
    report.update(
        title=title, description=desc, robots_meta=robots_meta, x_robots_tag=x_robots, canonical=canonicals,
        lang=page.lang, viewport=bool(meta.get("viewport")), headings=page.headings, images=len(page.images),
        images_without_alt=no_alt, links=len(page.links), links_on_this_site=len(internal),
        jsonld_types=types, jsonld_errors=errors, microdata_types=sorted(set(page.itemtypes)),
        social_preview=social, words=page.words,
    )

    if "noindex" in ds or "none" in ds:
        problem("noindex: search engines will not list this page, so it cannot appear in AI Overviews either")
    if "nosnippet" in ds or "max-snippet:0" in ds:
        note("nosnippet or max-snippet:0: Google shows no text from this page in results or AI answers")
    if "nofollow" in ds:
        note("nofollow on the whole page: its links pass nothing on; usually not intended")
    if len(canonicals) > 1:
        problem(f"{len(canonicals)} different canonical addresses: Google may ignore them all")
    elif canonicals and is_url and not same_page(canonicals[0], final):
        note(f"The canonical address is another page ({canonicals[0]}): Google will probably index that one instead")
    if not title:
        problem("No title")
    elif len(title) > 60:
        note(f"The title is {len(title)} characters: about 50 to 60 show in full in results")
    if not desc:
        note("No meta description: search engines pick text from the page; one or two sentences "
             "(about 150 to 160 characters) saying what the page offers work better")
    elif len(desc) > 160:
        note(f"The description is {len(desc)} characters: results cut it at about 150 to 160")
    if not h1:
        note("No H1 heading: one that says what the page is helps readers and search engines")
    elif len(h1) > 1:
        note(f"{len(h1)} H1 headings: one that says what the page is reads most clearly")
    if no_alt:
        note(f"{len(no_alt)} of {len(page.images)} images have no alt text (alt=\"\" is right for decoration): "
             + ", ".join(s[:60] for s in no_alt[:3]) + (" …" if len(no_alt) > 3 else ""))
    if not report["viewport"]:
        problem("No viewport meta tag: phones show the desktop layout shrunk")
    if not page.lang:
        note("No lang attribute on <html>")
    if errors:
        problem(f"{len(errors)} structured data block(s) are not valid JSON: {errors[0]}")
    missing = [k for k, ok in social.items() if not ok]
    if missing:
        note("No " + ", ".join(missing) + ": links shared in chats and social media show a poorer preview")
    if page.words < 100:
        note(f"Only {page.words} words of text in the HTML: if a browser shows more, JavaScript builds the "
             "page; check what Google sees with URL Inspection, as many AI crawlers do not run JavaScript")
    return report


def robots(report, page_url, robots_file, extra_agents):
    """Which crawlers the site's robots.txt (or a draft given with --robots) lets reach this page."""
    problem, note = report["problems"].append, report["checks"].append
    if robots_file and not robots_file.startswith(("http://", "https://")):
        where, status = robots_file, None
        try:
            text = Path(robots_file).read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            problem(f"Cannot read {robots_file}: {e}")
            return
    else:
        parts = urlsplit(page_url)
        where = robots_file or f"{parts.scheme}://{parts.netloc}/robots.txt"
        status, _, _, text, _ = fetch(where)
    info = report["robots_txt"] = {"address": where, "status": status, "sitemaps": [], "crawlers": []}
    if status is not None and (status == 0 or status == 429 or status >= 500):
        problem(f"robots.txt cannot be read (HTTP {status or 'no answer'}): Google pauses crawling the site "
                "while this lasts")
        return
    if status not in (None, 200):
        note(f"No robots.txt (HTTP {status}): every crawler may fetch everything, which is fine; "
             "it is also where a Sitemap line usually goes")
        text = ""
    elif "<html" in text[:2000].lower():
        note("robots.txt answers with a web page instead of rules")
    groups, info["sitemaps"] = parse_robots(text)
    parts = urlsplit(page_url)
    path = encode((parts.path or "/") + ("?" + parts.query if parts.query else ""))
    known = {name.lower() for name, _, _ in CRAWLERS}
    agents = CRAWLERS + [(a, "added with --agent", "other") for a in extra_agents if a.lower() not in known]
    for name, purpose, kind in agents:
        ok, rule, whose = robots_verdict(groups, name, path)
        info["crawlers"].append({"name": name, "purpose": purpose, "allowed": ok, "rule": rule, "group": whose})
        if not ok and kind == "search":
            problem(f"robots.txt blocks {name} from this page ({rule}): it cannot be crawled for {purpose}")
        elif not ok and kind == "ai-search":
            note(f"robots.txt blocks {name} ({rule}): the page cannot appear in {purpose}; fine only if intended")


def show(r):
    if r.get("error"):
        print(f"Could not read {r['source']}: {r['error']}")
        return
    out = [f"Page       {r['address']}" + (f"  (HTTP {r['status']})" if "status" in r else "")]
    for code, to in r.get("redirects", []):
        out.append(f"           redirect {code} -> {to}")
    if "http_redirects_to_https" in r:
        h = r["http_redirects_to_https"]
        out.append("           http:// redirects to https://: " + ("no answer on http://" if h is None else "yes" if h else "no"))
    if "title" in r:
        out.append(f"Indexing   robots meta: {'; '.join(r['robots_meta']) or 'none'}"
                   + (f"; X-Robots-Tag: {'; '.join(r['x_robots_tag'])}" if r["x_robots_tag"] else ""))
        out.append(f"           canonical: {', '.join(r['canonical']) or 'none'}")
        for label, key in (("Title     ", "title"), ("Descr.    ", "description")):
            v = r[key]
            out.append(f'{label} "{v}" ({len(v)} characters)' if v else f"{label} none")
        counts = {}
        for level, _ in r["headings"]:
            counts[level] = counts.get(level, 0) + 1
        out.append("Headings   " + (", ".join(f"H{k} x{v}" for k, v in sorted(counts.items())) or "none"))
        for level, text in r["headings"][:20]:
            out.append(f"           {'  ' * (level - 1)}H{level} {text[:90]}")
        if len(r["headings"]) > 20:
            out.append(f"           … and {len(r['headings']) - 20} more")
        out.append(f"Images     {r['images']}, {len(r['images_without_alt'])} without alt text")
        out.append(f"Links      {r['links']} ({r['links_on_this_site']} on this site)")
        out.append(f"Phone      viewport tag: {'yes' if r['viewport'] else 'no'}; language: {r['lang'] or 'not set'}")
        out.append(f"Structured JSON-LD: {', '.join(r['jsonld_types']) or 'none'}"
                   + (f" ({len(r['jsonld_errors'])} invalid)" if r["jsonld_errors"] else "")
                   + (f"; microdata: {', '.join(r['microdata_types'])}" if r["microdata_types"] else ""))
        out.append("Preview    " + ", ".join(f"{k} {'yes' if v else 'no'}" for k, v in r["social_preview"].items()))
        out.append(f"Text       {r['words']} words in the HTML")
    rb = r.get("robots_txt")
    if rb:
        state = "a local file" if rb["status"] is None else f"HTTP {rb['status'] or 'no answer'}"
        maps = rb["sitemaps"]
        out.append(f"robots.txt {rb['address']} ({state}); sitemaps: " + (", ".join(maps[:3]) or "none listed")
                   + (f" and {len(maps) - 3} more" if len(maps) > 3 else ""))
        for c in rb["crawlers"]:
            why = f"  [{c['rule']}; group {c['group']}]" if c["rule"] else ""
            out.append(f"  {'allowed' if c['allowed'] else 'BLOCKED':8} {c['name']:18} {c['purpose']}{why}")
    out.append("Findings" if r["problems"] or r["checks"] else "Findings   none")
    out += [f"  PROBLEM  {p}" for p in r["problems"]] + [f"  CHECK    {c}" for c in r["checks"]]
    out.append("Limits: the HTML as sent, without JavaScript; whether the page is indexed, and how it ranks, "
               "only Search Console shows.")
    print("\n".join(out))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("source", help="a page address (http or https) or a saved HTML file")
    ap.add_argument("--robots", help="a robots.txt file or address to test instead of the site's own")
    ap.add_argument("--agent", action="append", default=[], help="another crawler to check (repeatable)")
    ap.add_argument("--json", action="store_true", help="print the report as JSON")
    args = ap.parse_args()
    if args.robots and not args.source.startswith(("http://", "https://")):
        ap.error("--robots needs the page's address (http or https) to know which path to test")
    report = check(args.source, args.robots, args.agent)
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        show(report)
    return 2 if report.get("error") else 0


if __name__ == "__main__":
    sys.exit(main())
