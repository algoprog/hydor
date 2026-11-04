# Structured data (JSON-LD)

Open this when adding or fixing structured data. It is a small block of JSON in the page that states
facts the page already shows (the business, a product's price, an article's author and date), so
search engines can read them without guessing. It can earn rich results (prices, stock, review stars,
breadcrumbs, event dates, recipe cards); it does not raise rankings by itself, and Google needs none
for its AI features.

## Rules

- **Visible and true:** every name, price, rating, date and question in the markup appears on the page
  and is accurate. Markup describing things the page does not show breaks Google's structured data
  policies and can cost the site its rich results.
- **The smallest accurate set:** the types that describe what the page really is, not every type
  that might apply.
- **One source:** check what the platform, theme and SEO plugin already output (the page check lists
  the types found) before adding more; two conflicting blocks are worse than none.
- **Reviews:** only real reviews shown on the page. A business marking up reviews of itself on its own
  site (`LocalBusiness` or `Organization`) does not get review stars on Google.
- **Format:** absolute addresses (`https://…`), dates as `2026-03-02` or `2026-03-02T09:30:00+00:00`,
  prices as numbers with an ISO currency code (`"24.00"`, `"GBP"`).
- Put each block in a `<script type="application/ld+json">` element in the page: through the SEO
  plugin's schema settings, the theme, or the platform's code injection for that page.

## Examples

A local business (use the most specific type that fits: `Plumber`, `Dentist`, `Restaurant`,
`HairSalon`… or `LocalBusiness`):

```json
{
  "@context": "https://schema.org",
  "@type": "Plumber",
  "name": "Smith Plumbing",
  "url": "https://www.smith-plumbing.example/",
  "telephone": "+44 113 496 0000",
  "image": "https://www.smith-plumbing.example/img/van.jpg",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1 Example Road",
    "addressLocality": "Leeds",
    "postalCode": "LS1 1AA",
    "addressCountry": "GB"
  },
  "openingHoursSpecification": [{
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "opens": "08:00",
    "closes": "18:00"
  }]
}
```

A product with its price and stock:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Hand-thrown stoneware mug, 350 ml",
  "image": ["https://shop.example/img/mug-blue.jpg"],
  "description": "Hand-thrown in Leeds; dishwasher safe.",
  "sku": "MUG-350-BLUE",
  "brand": {"@type": "Brand", "name": "Example Ceramics"},
  "offers": {
    "@type": "Offer",
    "url": "https://shop.example/mugs/blue-350",
    "price": "24.00",
    "priceCurrency": "GBP",
    "availability": "https://schema.org/InStock"
  }
}
```

An article or blog post:

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "How to bleed a radiator in five minutes",
  "image": ["https://www.smith-plumbing.example/img/radiator-key.jpg"],
  "datePublished": "2026-03-02",
  "dateModified": "2026-10-14",
  "author": {"@type": "Person", "name": "Sam Smith", "url": "https://www.smith-plumbing.example/about"}
}
```

Breadcrumbs (the last item, the page itself, needs no address):

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Mugs", "item": "https://shop.example/mugs"},
    {"@type": "ListItem", "position": 2, "name": "Blue mug, 350 ml"}
  ]
}
```

The organisation, once, on the home page (`sameAs` lists its own profiles elsewhere):

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Example Ceramics",
  "url": "https://shop.example/",
  "logo": "https://shop.example/img/logo.png",
  "sameAs": ["https://www.instagram.com/exampleceramics", "https://www.facebook.com/exampleceramics"]
}
```

## Test it

1. Google's Rich Results Test (search.google.com/test/rich-results) with the live address or pasted
   code: which rich results the page can get, and errors and warnings.
2. The Schema Markup Validator (validator.schema.org) for any schema.org type, Google-supported or not.
3. After publishing, Search Console's reports for each type (products, breadcrumbs, events…) list
   errors across the whole site.
4. Errors stop a rich result; warnings name optional fields worth adding when the page has them.

Passing these proves the markup is well formed and eligible. Whether a rich result appears is Google's
choice, page by page.

## What changed

- FAQ rich results stopped appearing in Google in May 2026 (since 2023 they had been limited to
  government and health sites). FAQ markup does no harm and can stay, but it brings nothing in Google.
- HowTo rich results were dropped in 2023.
- Google's guidance for AI Overviews and AI Mode: no special markup is needed. Structured data is
  still worth it for rich results.
- For online shops, Google Merchant Center (free listings) shows products in the Shopping tab from a
  product feed; Shopify and WooCommerce have apps that send it.
