# Finding another copy

## The Wayback Machine (web.archive.org)

Nearest capture of an address (add `timestamp=YYYYMMDD` for the one closest to a date):

```
GET https://archive.org/wayback/available?url=example.com/report&timestamp=20240101
```

The answer's `archived_snapshots.closest.url` is the capture to read (with `read_page`), and
`timestamp` its date. An empty `archived_snapshots` means no capture.

Every capture of an address, newest last (the CDX API):

```
GET https://web.archive.org/cdx/search/cdx?url=example.com/report&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&limit=20
```

The page as it was captured, without the archive's toolbar and rewritten links: put `id_` after
the timestamp, `https://web.archive.org/web/20240101000000id_/https://example.com/report`. The
archive redirects to the nearest real capture.

- One request at a time. The archive answers 429 when asked too often: wait a minute, then go on.
- Captures can be partial (pictures, scripts or later pages missing) and are only as current as
  their date. Say the date when you use one.
- No capture yet, and the user wants one kept: they can save it at `https://web.archive.org/save`.

## Papers and reports

- **Open-access copy by DOI**, OpenAlex (no key needed for lookups):
  `GET https://api.openalex.org/works/doi:10.1038/nature14539` gives `best_oa_location.pdf_url`
  and `open_access.oa_url` when a legal free copy exists.
- **Unpaywall**: `GET https://api.unpaywall.org/v2/<doi>?email=<contact>` gives
  `best_oa_location.url_for_pdf`; it asks for a contact email (use one the user agrees to).
- **Preprint servers**: arXiv, bioRxiv, medRxiv, SSRN, OSF Preprints, Research Square. Search the
  exact title; check that the preprint is the same work, and say if it is an earlier version.
- **PubMed Central** (biomedical, free full text), and the author's own or university page.
- The papers skill covers searching these properly.

## News, companies, governments

- **Press releases**: the organisation's newsroom, EurekAlert! for science news. The release often
  holds the numbers a paywalled article reports.
- **Wire stories** (AP, Reuters, AFP) appear on many outlets: search a distinctive sentence.
- **Filings and official documents**: company investor pages, SEC EDGAR (`categories:
  ["sec-filings"]` in `web_search`), parliaments, courts, statistics offices; these are the primary
  sources anyway.

## Social media and forums

Many need an account to read. Prefer the platform's official API or embed endpoint (for example an
oEmbed address the platform documents), a copy the author posted elsewhere, or a news report quoting
it. Otherwise ask the user to open it and paste what matters.

## Telling a real file from an error page

```bash
curl -sSL -o paper.pdf -w "%{http_code} %{content_type}\n" "<address>"
file paper.pdf          # "PDF document" is right; "HTML document" means a login or error page
```
