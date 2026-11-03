# Scraping examples (tested)

All four ran against quotes.toscrape.com and Wikipedia. Replace the User-Agent's contact with a
real one the user agrees to: some sites refuse placeholders. Install what they need in a virtual
environment (`python3 -m venv .venv && .venv/bin/pip install requests beautifulsoup4`).

## 1. Static pages with requests and BeautifulSoup, following "next"

```python
import csv, time
from urllib.parse import urljoin
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

UA = "QuotesSurvey/1.0 (+mailto:<contact>)"        # name the project and a contact
session = requests.Session()
session.headers["User-Agent"] = UA
retry = Retry(total=5, backoff_factor=2, status_forcelist=[429, 500, 502, 503, 504],
              allowed_methods=["GET", "HEAD"], respect_retry_after_header=True)
session.mount("https://", HTTPAdapter(max_retries=retry))

rows, url, pages = [], "https://quotes.toscrape.com/", 0
while url and pages < 50:                      # a cap, in case "next" never ends
    r = session.get(url, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    for q in soup.select("div.quote"):
        rows.append({
            "text": q.select_one("span.text").get_text(strip=True),
            "author": q.select_one("small.author").get_text(strip=True),
            "tags": ";".join(t.get_text(strip=True) for t in q.select("a.tag")),
            "source": url,
        })
    nxt = soup.select_one("li.next > a")
    url = urljoin(url, nxt["href"]) if nxt else None
    pages += 1
    time.sleep(2)                               # one request every 2 seconds

with open("quotes.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["text", "author", "tags", "source"])
    w.writeheader()
    w.writerows(rows)
print(len(rows), "rows from", pages, "pages")   # 100 rows from 10 pages
```

With the polite fetcher instead: fetch first (`polite_fetch.py ... > fetched.jsonl`), then parse
the saved files, as often as you like, without touching the site:

```python
import json
from bs4 import BeautifulSoup
for line in open("fetched.jsonl"):
    r = json.loads(line)
    if r["status"] == 200 and r["file"]:
        soup = BeautifulSoup(open(r["file"], "rb").read(), "html.parser")
        ...  # same selectors as above; keep r["url"] as the source
```

## 2. A JSON endpoint with paging

Pages that load more as you scroll call an API; calling it directly is lighter for everyone.

```python
import json, time
import requests

s = requests.Session()
s.headers["User-Agent"] = "QuotesSurvey/1.0 (+mailto:<contact>)"
items, page = [], 1
while page <= 100:
    r = s.get("https://quotes.toscrape.com/api/quotes", params={"page": page}, timeout=30)
    r.raise_for_status()
    data = r.json()
    items += [{"text": q["text"], "author": q["author"]["name"], "tags": q["tags"]} for q in data["quotes"]]
    if not data.get("has_next"):
        break
    page += 1
    time.sleep(1)
with open("quotes.jsonl", "w", encoding="utf-8") as f:
    for it in items:
        f.write(json.dumps(it, ensure_ascii=False) + "\n")
```

## 3. Pages built with JavaScript: Playwright

Install in the virtual environment: `pip install playwright`, then `playwright install chromium`
(downloads a browser into the user's cache; say so first).

```python
from playwright.sync_api import sync_playwright

UA = "QuotesSurvey/1.0 (+mailto:<contact>)"
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(user_agent=UA)

    # Wait for the content to appear, then read it.
    page.goto("https://quotes.toscrape.com/js/", wait_until="domcontentloaded")
    page.wait_for_selector("div.quote")
    quotes = page.locator("div.quote").evaluate_all(
        "els => els.map(e => ({text: e.querySelector('.text').innerText,"
        " author: e.querySelector('.author').innerText}))")

    # Or catch the JSON the page loads, and use that.
    with page.expect_response(lambda r: "/api/quotes" in r.url and r.ok) as resp:
        page.goto("https://quotes.toscrape.com/scroll")
    data = resp.value.json()
    browser.close()
```

Pause between pages here too (`page.wait_for_timeout(2000)`), and close the browser when done.

## 4. Structured data in the page (JSON-LD)

Product, recipe, event and article pages often carry their facts as JSON-LD, which survives
redesigns better than any selector.

```python
import json, requests
from bs4 import BeautifulSoup

html = requests.get("https://en.wikipedia.org/wiki/OpenStreetMap",
                    headers={"User-Agent": "QuotesSurvey/1.0 (+mailto:<contact>)"}, timeout=30).text
soup = BeautifulSoup(html, "html.parser")
for tag in soup.select('script[type="application/ld+json"]'):
    data = json.loads(tag.string or "{}")
    for item in data if isinstance(data, list) else data.get("@graph", [data]):
        print(item.get("@type"), item.get("name") or item.get("headline"), item.get("datePublished"))
```

## Checking robots.txt yourself

```python
from urllib import robotparser
rp = robotparser.RobotFileParser("https://example.com/robots.txt")
rp.read()
rp.can_fetch("PriceSurvey", "https://example.com/products/1")   # True or False
rp.crawl_delay("PriceSurvey")                                   # seconds, or None
rp.site_maps()                                                  # sitemap addresses, or None
```

`read()` fetches with Python's default User-Agent, which some sites refuse (it then treats the whole
site as off limits); `polite_fetch.py` fetches robots.txt with your own.
