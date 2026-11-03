# Library docs

Connects every agent to [Context7](https://context7.com)'s documentation server, which serves current
documentation and code examples for thousands of libraries and frameworks (React, Django, Tailwind,
Pandas, FastAPI…), version by version.

- `resolve-library-id` finds a library's Context7 id from its name.
- `query-docs` answers a question from that library's documentation, with code examples.

It works without an account, within Context7's free limits. Nothing is installed on this computer: the
server runs at Context7. The questions agents ask it (library names and what they look up) go there.
