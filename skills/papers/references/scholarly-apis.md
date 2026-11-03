# Scholarly APIs: requests that work

All are free to call with `http_request` or curl. Go one request at a time, keep what you fetched,
and back off on 429 (wait, then double the wait).

## OpenAlex (api.openalex.org): every field

Lookups by ID are free; searches and lists use a daily allowance (about 100 searches a day without a
key; a free key, from an openalex.org account, gives ten times more). The answer's
`X-RateLimit-Remaining` header says what is left. A key goes in `api_key=` or as a Bearer token
(`http_request` with `auth: OPENALEX_API_KEY`).

```
# One work, by DOI (free): title, year, citations, open-access copy
GET https://api.openalex.org/works/doi:10.48550/arXiv.2106.09685?select=id,doi,display_name,publication_year,cited_by_count,open_access,best_oa_location
# Search a phrase, most relevant first (per_page up to 100)
GET https://api.openalex.org/works?search=%22low-rank%20adaptation%22&filter=publication_year:2023-2026,type:article&per_page=50&select=id,doi,display_name,publication_year,cited_by_count
# The most cited works whose title or abstract has the phrase
GET https://api.openalex.org/works?filter=title_and_abstract.search:%22low-rank%20adaptation%22,publication_year:2023-2026&sort=cited_by_count:desc&per_page=50
# Who cites a work (forward snowball), newest first
GET https://api.openalex.org/works?filter=cites:W3168867926&sort=publication_date:desc&per_page=50
# Its references (backward): the work's referenced_works field lists OpenAlex IDs
GET https://api.openalex.org/works/W3168867926?select=referenced_works
# Many IDs at once (up to 100, joined by |)
GET https://api.openalex.org/works?filter=openalex:W3168867926|W2194775991
```

Quote phrases: unquoted words match loosely, and a loose search sorted by citations brings famous
papers that have nothing to do with the topic.

Useful fields: `open_access.oa_url`, `best_oa_location.pdf_url`, `primary_location.source.display_name`
(the venue), `authorships`, `abstract_inverted_index` (the abstract, as word positions).

## Semantic Scholar (api.semanticscholar.org)

Without a key, requests share one pool with everyone and often get 429. A free key (apply at
semanticscholar.org/product/api) allows 1 request a second: save it with `request_secret` and send it
with `http_request` (`auth: S2_API_KEY`, `auth_header: "x-api-key"`).

```
# IDs: a Semantic Scholar ID, or DOI:..., ARXIV:..., PMID:..., CorpusId:..., URL:...
GET https://api.semanticscholar.org/graph/v1/paper/ARXIV:2106.09685?fields=title,year,venue,citationCount,influentialCitationCount,openAccessPdf,externalIds,tldr
GET https://api.semanticscholar.org/graph/v1/paper/search?query=low-rank+adaptation&year=2023-&fields=title,year,citationCount,externalIds&limit=100
GET https://api.semanticscholar.org/graph/v1/paper/DOI:10.1038/nature14539/citations?fields=title,year,citationCount&limit=100
GET https://api.semanticscholar.org/graph/v1/paper/DOI:10.1038/nature14539/references?fields=title,year&limit=100
GET https://api.semanticscholar.org/recommendations/v1/papers/forpaper/ARXIV:2106.09685?fields=title,year&limit=20
# Up to 500 papers in one call
POST https://api.semanticscholar.org/graph/v1/paper/batch?fields=title,year,citationCount
     body: { "ids": ["ARXIV:2106.09685", "DOI:10.1038/nature14539"] }
```

Lists come in pages: `offset` and `limit`, and the answer's `next`.

## arXiv (export.arxiv.org)

One request every 3 seconds, one connection. The answer is an Atom feed (XML).

```
GET https://export.arxiv.org/api/query?search_query=ti:%22low-rank+adaptation%22+AND+cat:cs.CL&sortBy=submittedDate&sortOrder=descending&start=0&max_results=50
GET https://export.arxiv.org/api/query?id_list=2106.09685,1706.03762
```

Fields: `ti` title, `au` author, `abs` abstract, `cat` category (cs.CL, stat.ML, q-bio.NC...), `all`;
combine with `AND`, `OR`, `ANDNOT`; phrases in `%22...%22`. New papers in a category each day:
`https://rss.arxiv.org/rss/cs.CL`. Pages: `https://arxiv.org/abs/<id>` (abstract),
`/pdf/<id>`, `/html/<id>` (HTML version, for most recent papers), `/bibtex/<id>` (BibTeX).

Reading the feed in Python:

```python
import urllib.request, xml.etree.ElementTree as ET
NS = {"a": "http://www.w3.org/2005/Atom"}
url = "https://export.arxiv.org/api/query?search_query=cat:cs.CL+AND+ti:retrieval&max_results=20&sortBy=submittedDate&sortOrder=descending"
feed = ET.parse(urllib.request.urlopen(url, timeout=60)).getroot()
for e in feed.findall("a:entry", NS):
    print(e.findtext("a:published", namespaces=NS)[:10], e.findtext("a:id", namespaces=NS), " ".join(e.findtext("a:title", namespaces=NS).split()))
```

## PubMed and Europe PMC (medicine and life sciences)

PubMed's E-utilities allow 3 requests a second (10 with a free NCBI key, `api_key=`).

```
# Search: IDs of matching papers (tags: [tiab] title/abstract, [pt] publication type, [dp] date)
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=intermittent+fasting[tiab]+AND+randomized+controlled+trial[pt]&retmode=json&retmax=100&sort=relevance
# Titles, journals, dates for those IDs
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=38904963,38932663&retmode=json
# Abstracts as text
GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=38904963&rettype=abstract&retmode=text
```

Europe PMC also covers preprints and gives free full texts:

```
GET https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=intermittent%20fasting%20AND%20OPEN_ACCESS:y&format=json&pageSize=25
GET https://www.ebi.ac.uk/europepmc/webservices/rest/PMC13567609/fullTextXML
```

ClinicalTrials.gov (registered trials, including unpublished results): `web_search` with
`categories: ["clinical-trials"]`, or its API at clinicaltrials.gov/data-api.

## Crossref and DOIs (any publisher)

```
# Find the DOI for a reference string
GET https://api.crossref.org/works?query.bibliographic=LeCun+Bengio+Hinton+Deep+learning+Nature+2015&rows=3&mailto=<contact>
# Metadata of a DOI
GET https://api.crossref.org/works/10.1038/nature14539
```

The DOI itself returns citations in any form (content negotiation):

```bash
curl -sSL -H "Accept: application/x-bibtex" https://doi.org/10.1038/nature14539
curl -sSL -H "Accept: text/x-bibliography; style=apa" https://doi.org/10.1038/nature14539
curl -sSL -H "Accept: application/vnd.citationstyles.csl+json" https://doi.org/10.1038/nature14539
```

Other styles that format cleanly: `style=ieee`, `style=chicago-author-date`, `style=elsevier-vancouver`,
`style=nature`. Read the result before using it: some styles leave stray text such as "Edited by ,".

## Unpaywall (legal free copies by DOI)

```
GET https://api.unpaywall.org/v2/10.1038/nature14539?email=<contact>
```

`is_oa`, and `best_oa_location.url_for_pdf` or `.url`. It asks for an email address: use one the
user agrees to.
