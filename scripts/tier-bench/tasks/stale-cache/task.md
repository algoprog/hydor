Users of our site report four problems with profiles. Please find the causes and fix them.

1. People who change their display name sometimes keep seeing the old one on other pages for up to five minutes.
   It seems to happen more when the site is busy.
2. For a few users the new name never shows until the five minutes are over, however often they reload, although
   the database has the new name at once.
3. When the database has a hiccup, the profile page keeps showing the error until we restart the server.
4. A few users say their own profile page shows their name as "Ann Lee (you) (you) (you)".

We tried lowering the cache's TTL to 30 seconds. It helped a little with the first two, but the database load went
up so much that we went back to five minutes. The code is in src/ (src/profiles.mjs is the cache in front of the
database). Please fix the causes without making the database do more work: a profile that nobody changes must still
be read from the database at most once per TTL, however many requests ask for it at the same time. Keep the
exported functions of src/profiles.mjs and src/pages.mjs as they are. Then write down what the causes were, a few
sentences each, in CAUSE.md next to package.json.
