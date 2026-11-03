#!/usr/bin/env python3
"""Fetch web pages politely: robots.txt, a pause per site, retries, and a cache on disk.

Standard library only. Each address is checked against the site's robots.txt for your
User-Agent, requests to the same site are spaced out (the site's Crawl-delay when longer),
429 and 5xx answers are retried with growing pauses (Retry-After is honoured), and every
body is kept in the cache folder, so running it again costs the site nothing. Stale cache
entries are refreshed with a conditional request (ETag / Last-Modified).

It prints one JSON line per address: url, status, file (the saved body), bytes,
content_type, from_cache, note. Parse the saved files with your own code afterwards.

Examples:
  python3 polite_fetch.py --ua "PriceSurvey/1.0 (+mailto:ana@example.org)" https://example.org/a
  python3 polite_fetch.py --ua "..." --urls pages.txt --delay 3 --cache .scrape-cache
"""
import argparse
import email.utils
import gzip
import hashlib
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import zlib

RETRY_STATUS = {429, 500, 502, 503, 504}
MAX_BYTES = 50 * 1024 * 1024
MAX_WAIT = 120.0


def parse_args():
    p = argparse.ArgumentParser(description="Fetch pages politely, with robots.txt, pauses, retries and a cache.")
    p.add_argument("urls", nargs="*", help="addresses to fetch")
    p.add_argument("--urls", dest="url_file", help="a file with one address per line (# for comments)")
    p.add_argument("--ua", required=True, help='a User-Agent naming you, e.g. "PriceSurvey/1.0 (+mailto:ana@example.org)"')
    p.add_argument("--delay", type=float, default=2.0, help="seconds between requests to the same site (default 2)")
    p.add_argument("--cache", default=".scrape-cache", help="cache folder (default .scrape-cache)")
    p.add_argument("--max-age", type=float, default=24.0, help="hours a cached copy counts as fresh (default 24)")
    p.add_argument("--refresh", action="store_true", help="ask the site again even when the cache is fresh")
    p.add_argument("--retries", type=int, default=4, help="retries after 429, 5xx or a network error (default 4)")
    p.add_argument("--timeout", type=float, default=30.0, help="seconds to wait for one answer (default 30)")
    return p.parse_args()


class Fetcher:
    def __init__(self, args):
        self.a = args
        self.last = {}  # host -> time of the last request
        self.robots = {}  # host -> (parser or None, note)
        os.makedirs(args.cache, exist_ok=True)

    # ---- low level -------------------------------------------------------------------------
    def _pause(self, host, delay):
        wait = self.last.get(host, 0) + delay - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self.last[host] = time.monotonic()

    def _request(self, url, headers):
        """One request. Returns (status, headers, body); never raises for HTTP errors."""
        req = urllib.request.Request(url, headers={"User-Agent": self.a.ua, "Accept-Encoding": "gzip, deflate", **headers})
        try:
            with urllib.request.urlopen(req, timeout=self.a.timeout) as r:
                return r.status, r.headers, self._read(r)
        except urllib.error.HTTPError as e:
            return e.code, e.headers, self._read(e)

    @staticmethod
    def _read(r):
        data = r.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError(f"answer larger than {MAX_BYTES // (1024 * 1024)} MB")
        enc = (r.headers.get("Content-Encoding") or "").lower()
        if enc == "gzip":
            data = gzip.decompress(data)
        elif enc == "deflate":
            try:
                data = zlib.decompress(data)
            except zlib.error:
                data = zlib.decompress(data, -zlib.MAX_WBITS)
        return data

    @staticmethod
    def _retry_after(headers):
        v = headers.get("Retry-After") if headers else None
        if not v:
            return None
        v = v.strip()
        if v.isdigit():
            return float(v)
        try:
            return max(0.0, email.utils.parsedate_to_datetime(v).timestamp() - time.time())
        except (TypeError, ValueError):
            return None

    def _with_retries(self, url, host, delay, headers):
        attempt = 0
        while True:
            self._pause(host, delay)
            try:
                status, h, body = self._request(url, headers)
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                if attempt >= self.a.retries:
                    return None, None, None, f"network error: {getattr(e, 'reason', e)}"
                status, h, body = None, None, None
            if status is not None and status not in RETRY_STATUS:
                return status, h, body, ""
            if attempt >= self.a.retries:
                return status, h, body, f"gave up after {attempt + 1} tries"
            wait = self._retry_after(h)
            if wait is None:
                wait = min(MAX_WAIT, delay * (2 ** attempt)) + random.uniform(0, 1)
            if wait > MAX_WAIT:
                return status, h, body, f"site asks to wait {int(wait)} s (Retry-After); try later"
            time.sleep(wait)
            attempt += 1

    # ---- robots.txt --------------------------------------------------------------------------
    def _robots(self, scheme, host):
        if host in self.robots:
            return self.robots[host]
        url = f"{scheme}://{host}/robots.txt"
        status, _h, body, note = self._with_retries(url, host, self.a.delay, {})
        rp = urllib.robotparser.RobotFileParser(url)
        if status == 200 and body is not None:
            rp.parse(body.decode("utf-8", "replace").splitlines())
            entry = (rp, "")
        elif status is not None and 400 <= status < 500:
            rp.allow_all = True  # no robots.txt (RFC 9309: 4xx means no rules)
            entry = (rp, f"robots.txt answered {status}: no rules")
        else:
            rp.disallow_all = True  # unreachable: RFC 9309 says assume everything is off limits
            entry = (rp, f"robots.txt unreachable ({status or note}): treated as no access")
        self.robots[host] = entry
        return entry

    # ---- cache -------------------------------------------------------------------------------
    def _paths(self, url):
        k = hashlib.sha256(url.encode()).hexdigest()[:32]
        return os.path.join(self.a.cache, k + ".body"), os.path.join(self.a.cache, k + ".json")

    # ---- one address -------------------------------------------------------------------------
    def fetch(self, url):
        out = {"url": url, "status": None, "file": None, "bytes": 0, "content_type": None, "from_cache": False, "note": ""}
        u = urllib.parse.urlsplit(url)
        if u.scheme not in ("http", "https") or not u.netloc:
            out["note"] = "not an http(s) address"
            return out
        host = u.netloc.lower()
        body_path, meta_path = self._paths(url)
        meta = None
        if os.path.exists(meta_path) and os.path.exists(body_path):
            with open(meta_path) as f:
                meta = json.load(f)
            fresh = time.time() - meta.get("fetched", 0) < self.a.max_age * 3600
            if fresh and not self.a.refresh:
                out.update(status=meta["status"], file=body_path, bytes=os.path.getsize(body_path), content_type=meta.get("content_type"), from_cache=True)
                return out

        rp, rnote = self._robots(u.scheme, host)
        if not rp.can_fetch(self.a.ua, url):
            out["note"] = "disallowed by robots.txt" + (f" ({rnote})" if rnote else "")
            return out
        crawl = rp.crawl_delay(self.a.ua)
        delay = max(self.a.delay, float(crawl) if crawl else 0.0)

        headers = {}
        if meta:
            if meta.get("etag"):
                headers["If-None-Match"] = meta["etag"]
            if meta.get("last_modified"):
                headers["If-Modified-Since"] = meta["last_modified"]
        status, h, body, note = self._with_retries(url, host, delay, headers)
        out["status"], out["note"] = status, "; ".join(x for x in (note, rnote) if x)
        if status == 304 and meta:
            meta["fetched"] = time.time()
            with open(meta_path, "w") as f:
                json.dump(meta, f)
            out.update(status=meta["status"], file=body_path, bytes=os.path.getsize(body_path), content_type=meta.get("content_type"), from_cache=True)
            out["note"] = "not modified since the cached copy"
            return out
        if body is None:
            return out
        out["content_type"] = h.get("Content-Type") if h else None
        if status == 200:
            with open(body_path, "wb") as f:
                f.write(body)
            with open(meta_path, "w") as f:
                json.dump({"url": url, "status": status, "fetched": time.time(), "content_type": out["content_type"],
                           "etag": h.get("ETag"), "last_modified": h.get("Last-Modified")}, f)
            out.update(file=body_path, bytes=len(body))
        return out


def main():
    a = parse_args()
    urls = list(a.urls)
    if a.url_file:
        with open(a.url_file) as f:
            urls += [ln.strip() for ln in f if ln.strip() and not ln.lstrip().startswith("#")]
    if not urls:
        sys.exit("Give addresses, or --urls FILE.")
    if len(a.ua) < 10 or a.ua.lower().startswith(("python", "curl", "mozilla")):
        sys.exit("Give a User-Agent that names your project and a contact, not a library's or a browser's.")
    fetcher = Fetcher(a)
    unique = list(dict.fromkeys(urls))  # each address once, in order
    failed = 0
    for url in unique:
        try:
            r = fetcher.fetch(url)
        except Exception as e:  # keep going with the rest
            r = {"url": url, "status": None, "file": None, "bytes": 0, "content_type": None, "from_cache": False, "note": f"error: {e}"}
        failed += r["status"] != 200
        print(json.dumps(r, ensure_ascii=False), flush=True)
    sys.exit(1 if failed == len(unique) else 0)


if __name__ == "__main__":
    main()
