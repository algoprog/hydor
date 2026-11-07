// Answer UIs for code: code in tabs, commands, API endpoints, errors, test results, JSON, regular expressions, shortcuts, repositories.
import type { AnswerUiSpec } from './types.ts';

export const CODE: AnswerUiSpec[] = [
  {
    id: 'code',
    title: 'Code in tabs',
    group: 'code',
    use: 'The same snippet in several languages, or several files that go together, in tabs: highlighted, each with a copy button.',
    keywords: 'code snippet example tabs languages files python javascript typescript go rust syntax highlighting source sample',
    shape: `{
  title?: string
  tabs: { label: string, lang: string, code: string }[]   // label: "Python", "app.ts"; lang: "python", "ts", "bash"…
  note?: md
}`,
    example: {
      title: 'Fetch JSON with a 10-second timeout',
      tabs: [
        {
          label: 'Python',
          lang: 'python',
          code: 'import requests\n\nresp = requests.get("https://api.github.com/repos/python/cpython", timeout=10)\nresp.raise_for_status()\nrepo = resp.json()\nprint(repo["stargazers_count"])\n',
        },
        {
          label: 'JavaScript',
          lang: 'js',
          code: 'const res = await fetch("https://api.github.com/repos/python/cpython", {\n  signal: AbortSignal.timeout(10_000),\n});\nif (!res.ok) throw new Error(`HTTP ${res.status}`);\nconst repo = await res.json();\nconsole.log(repo.stargazers_count);\n',
        },
        {
          label: 'Go',
          lang: 'go',
          code: 'client := &http.Client{Timeout: 10 * time.Second}\nresp, err := client.Get("https://api.github.com/repos/python/cpython")\nif err != nil {\n\tlog.Fatal(err)\n}\ndefer resp.Body.Close()\nif resp.StatusCode != http.StatusOK {\n\tlog.Fatalf("HTTP %d", resp.StatusCode)\n}\n\nvar repo struct {\n\tStars int `json:"stargazers_count"`\n}\nif err := json.NewDecoder(resp.Body).Decode(&repo); err != nil {\n\tlog.Fatal(err)\n}\nfmt.Println(repo.Stars)\n',
        },
        {
          label: 'curl',
          lang: 'bash',
          code: 'curl --fail --silent --max-time 10 \\\n  https://api.github.com/repos/python/cpython | jq .stargazers_count\n',
        },
      ],
      note: 'Each one stops at an HTTP error instead of reading an error page as JSON.',
    },
  },
  {
    id: 'commands',
    title: 'Commands to run',
    group: 'code',
    use: 'Shell commands to run in order, each with a copy button, what it does and what it prints, in tabs per operating system; copied steps are ticked off.',
    keywords: 'commands terminal shell steps install setup run cli bash powershell macos windows linux instructions copy paste',
    shape: `{
  title?: string
  os?: { label: string, steps: Step[] }[]    // a tab each: "macOS", "Windows", "Linux"
  steps?: Step[]                            // when they are the same everywhere
  note?: md
}
Step = { cmd: string, note?: md, output?: string }   // cmd: one command (several lines for one step are fine); output: what it prints`,
    example: {
      title: 'Set up a virtual environment for the project',
      os: [
        {
          label: 'macOS and Linux',
          steps: [
            {
              cmd: 'python3 -m venv .venv',
              note: 'Makes the environment in a `.venv` folder inside the project.',
            },
            {
              cmd: 'source .venv/bin/activate',
              note: 'Your prompt now starts with `(.venv)`.',
            },
            {
              cmd: 'python -m pip install -r requirements.txt',
              output: 'Successfully installed certifi-2025.10.5 charset-normalizer-3.4.4 idna-3.11 requests-2.32.5 urllib3-2.5.0',
            },
            {
              cmd: 'deactivate',
              note: 'When you are done: back to the system’s Python.',
            },
          ],
        },
        {
          label: 'Windows',
          steps: [
            {
              cmd: 'py -m venv .venv',
              note: 'Makes the environment in a `.venv` folder inside the project.',
            },
            {
              cmd: '.venv\\Scripts\\Activate.ps1',
              note: 'If PowerShell refuses to run it, allow scripts for your account once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.',
            },
            {
              cmd: 'python -m pip install -r requirements.txt',
              output: 'Successfully installed certifi-2025.10.5 charset-normalizer-3.4.4 idna-3.11 requests-2.32.5 urllib3-2.5.0',
            },
            {
              cmd: 'deactivate',
              note: 'When you are done: back to the system’s Python.',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'api',
    title: 'API endpoint',
    group: 'code',
    use: 'An HTTP endpoint’s reference: method and path, authentication, parameters by where they go, an example request, and each response with its body.',
    keywords: 'api endpoint rest http request response parameters method get post route reference documentation status codes json',
    shape: `{
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string                 // "/repos/{owner}/{repo}/issues": {names} or :names are its path parameters
  summary?: md
  auth?: string                // "Bearer token with Issues: write"
  params?: { name: string, in: "path" | "query" | "body" | "header", type: string, required?: boolean, description?: md }[]
  request?: { lang?: string, code: string }   // an example: curl, fetch…
  responses?: { status: number, description?: md, body?: string }[]   // body: JSON or text
}`,
    example: {
      method: 'POST',
      path: '/repos/{owner}/{repo}/issues',
      summary: 'Opens an issue in a repository. Anyone who can read the repository can open one, unless issues are turned off there.',
      auth: 'Bearer token; a fine-grained one needs Issues: write',
      params: [
        {
          name: 'owner',
          in: 'path',
          type: 'string',
          required: true,
          description: 'The account that owns the repository.',
        },
        {
          name: 'repo',
          in: 'path',
          type: 'string',
          required: true,
          description: 'The repository’s name, without `.git`.',
        },
        {
          name: 'X-GitHub-Api-Version',
          in: 'header',
          type: 'string',
          description: 'The API version to use: `2022-11-28`.',
        },
        {
          name: 'title',
          in: 'body',
          type: 'string',
          required: true,
          description: 'The issue’s title.',
        },
        {
          name: 'body',
          in: 'body',
          type: 'string',
          description: 'What the issue says, in Markdown.',
        },
        {
          name: 'labels',
          in: 'body',
          type: 'string[]',
          description: 'Labels to add. Only people with push access can set them; for others they are quietly dropped.',
        },
        {
          name: 'assignees',
          in: 'body',
          type: 'string[]',
          description: 'Logins of the people to assign.',
        },
      ],
      request: {
        lang: 'bash',
        code: 'curl -L -X POST \\\n  -H "Accept: application/vnd.github+json" \\\n  -H "Authorization: Bearer $GITHUB_TOKEN" \\\n  -H "X-GitHub-Api-Version: 2022-11-28" \\\n  https://api.github.com/repos/octocat/Hello-World/issues \\\n  -d \'{"title":"Login page fails on Safari","body":"Signing in shows a blank page.","labels":["bug"]}\'',
      },
      responses: [
        {
          status: 201,
          description: 'Created: the new issue, with its number and address.',
          body: '{"id":2981764531,"number":1347,"title":"Login page fails on Safari","state":"open","html_url":"https://github.com/octocat/Hello-World/issues/1347","labels":[{"name":"bug"}],"user":{"login":"octocat"},"created_at":"2026-11-07T14:02:11Z"}',
        },
        {
          status: 404,
          description: 'Not found: the repository doesn’t exist, or the token can’t see it.',
        },
        {
          status: 410,
          description: 'Gone: issues are turned off in this repository.',
        },
        {
          status: 422,
          description: 'Validation failed: a field is missing or wrong.',
          body: '{"message":"Validation Failed","errors":[{"resource":"Issue","code":"missing_field","field":"title"}],"documentation_url":"https://docs.github.com/rest/issues/issues#create-an-issue","status":"422"}',
        },
      ],
    },
  },
  {
    id: 'error',
    title: 'Error explained',
    group: 'code',
    use: 'An error message explained: its likely causes from most to least likely, the fix for each with code, how to avoid it next time, and links.',
    keywords: 'error exception traceback stack trace bug crash fix debug troubleshoot why failing message cause solution',
    shape: `{
  error: string                // the message as it appeared (a traceback's lines too)
  where?: string               // what printed it: "python app.py (Python 3.12, macOS)"
  causes: {
    cause: md
    likelihood?: "high" | "medium" | "low"
    fix: md
    code?: string              // a command or code for the fix
    lang?: string
  }[]                          // the most likely first
  prevent?: md[]
  docs?: { label: string, url: url }[]
}`,
    example: {
      error: 'Traceback (most recent call last):\n  File "/Users/sam/weather/app.py", line 1, in <module>\n    import requests\nModuleNotFoundError: No module named \'requests\'',
      where: 'python app.py (Python 3.12, macOS)',
      causes: [
        {
          cause: '**requests** isn’t installed in the Python that runs the script.',
          likelihood: 'high',
          fix: 'Install it with that same Python, so the installer and the script agree:',
          code: 'python -m pip install requests',
          lang: 'bash',
        },
        {
          cause: 'It is installed in a virtual environment that isn’t active.',
          likelihood: 'medium',
          fix: 'Activate the environment, then run the script again:',
          code: 'source .venv/bin/activate\npython app.py',
          lang: 'bash',
        },
        {
          cause: 'Your editor runs a different Python from your terminal.',
          likelihood: 'medium',
          fix: 'In VS Code, run **Python: Select Interpreter** (Ctrl+Shift+P) and pick the one in `.venv`.',
        },
        {
          cause: 'The install from `requirements.txt` stopped partway.',
          likelihood: 'low',
          fix: 'Run it again and read the first error it prints:',
          code: 'python -m pip install -r requirements.txt',
          lang: 'bash',
        },
      ],
      prevent: [
        'Install with `python -m pip`, never a bare `pip`: that one may belong to another Python.',
        'Keep one virtual environment per project, with its packages listed in `requirements.txt`.',
        'When something imports on one computer but not another, compare `which python` (`where python` on Windows).',
      ],
      docs: [
        {
          label: 'Installing packages',
          url: 'https://packaging.python.org/en/latest/tutorials/installing-packages/',
        },
        {
          label: 'venv: virtual environments',
          url: 'https://docs.python.org/3/library/venv.html',
        },
      ],
    },
  },
  {
    id: 'tests',
    title: 'Test results',
    group: 'code',
    use: 'A test run at a glance: passed, failed and skipped counts, each failure to open with its message and trace, and results by suite.',
    keywords: 'test results test run passed failed skipped failures pytest jest vitest ci unit tests suite coverage report',
    shape: `{
  title?: string               // the run: "vitest, web app"
  passed: number
  failed: number
  skipped?: number
  duration?: string            // "38.2 s"
  failures?: { name: string, file?: string, message: string, trace?: string }[]   // file: "src/cart/total.test.ts:48"
  suites?: { name: string, passed: number, failed: number, skipped?: number }[]
}`,
    example: {
      title: 'vitest run, web app',
      passed: 214,
      failed: 3,
      skipped: 4,
      duration: '38.2 s',
      failures: [
        {
          name: 'cart total › applies a percentage coupon after tax',
          file: 'src/cart/total.test.ts:48',
          message: 'AssertionError: expected 107.99 to be 108 // Object.is equality',
          trace: '- Expected\n+ Received\n\n- 108\n+ 107.99\n\n ❯ src/cart/total.test.ts:52:31\n ❯ src/cart/total.ts:31:10',
        },
        {
          name: 'useDebounce › fires once after the delay',
          file: 'src/hooks/useDebounce.test.ts:21',
          message: 'Error: Test timed out in 5000ms.',
          trace: 'If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".\n ❯ src/hooks/useDebounce.test.ts:21:3',
        },
        {
          name: 'LoginForm › shows an error for a wrong password',
          file: 'src/auth/LoginForm.test.tsx:63',
          message: 'TestingLibraryElementError: Unable to find an element with the text: /wrong email or password/i',
          trace: 'Ignored nodes: comments, script, style\n<body>\n  <div>\n    <form aria-label="Sign in">…</form>\n  </div>\n</body>\n ❯ src/auth/LoginForm.test.tsx:71:25',
        },
      ],
      suites: [
        { name: 'src/api', passed: 62, failed: 0, skipped: 2 },
        { name: 'src/cart', passed: 48, failed: 1 },
        { name: 'src/components', passed: 46, failed: 0 },
        { name: 'src/hooks', passed: 31, failed: 1, skipped: 2 },
        { name: 'src/auth', passed: 27, failed: 1 },
      ],
    },
  },
  {
    id: 'json',
    title: 'JSON viewer',
    group: 'code',
    use: 'JSON as a tree to open and close level by level, with sizes of what is folded; copy any value or its path.',
    keywords: 'json viewer tree explorer api response data structure object array inspect nested keys values path payload',
    shape: `{
  title?: string               // what it is: "GET /v1/orders/ord_9Lk2mQ"
  data: any                    // the JSON value itself
  open?: number                // how many levels start open (2 unless set)
}`,
    example: {
      title: 'GET /v1/orders/ord_9Lk2mQ',
      data: {
        id: 'ord_9Lk2mQ',
        status: 'shipped',
        created: '2026-11-05T09:41:27Z',
        customer: {
          name: 'Dana Whitfield',
          email: 'dana@example.com',
          vip: true,
        },
        items: [
          {
            sku: 'MUG-CER-12',
            name: 'Ceramic mug, 12 oz',
            qty: 2,
            price: 14.5,
          },
          {
            sku: 'BEAN-ETH-250',
            name: 'Ethiopia Guji, whole bean, 250 g',
            qty: 1,
            price: 16,
          },
          {
            sku: 'FILT-V60-100',
            name: 'Paper filters, size 02 (100)',
            qty: 1,
            price: 6.25,
          },
        ],
        shipping: {
          carrier: 'UPS',
          tracking: '1Z999AA10123456784',
          eta: '2026-11-09',
          address: {
            line1: '41 Orchard St',
            city: 'Amherst',
            region: 'MA',
            postal: '01002',
            country: 'US',
          },
        },
        totals: {
          subtotal: 51.25,
          shipping: 0,
          tax: 3.2,
          total: 54.45,
          currency: 'USD',
        },
        gift_note: null,
        tags: ['first-order', 'free-shipping'],
      },
    },
  },
  {
    id: 'regex',
    title: 'Regular expression',
    group: 'code',
    use: 'A regular expression taken apart piece by piece, with a tester: edit the sample text and every match, and what it captured, lights up.',
    keywords: 'regex regular expression pattern match explain tester validate capture groups find replace syntax',
    shape: `{
  pattern: string              // as JavaScript reads it, without slashes (backslashes doubled in JSON)
  flags?: string               // "i", "m", "s", "u"
  explain: { part: string, meaning: md }[]   // the pattern's pieces in order, each exactly as it appears in it
  tests?: string[]             // sample lines for the tester, matching and not
}`,
    example: {
      pattern: '\\b(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])\\b',
      explain: [
        {
          part: '\\b',
          meaning: 'A word boundary: the date can’t be glued to other letters or digits.',
        },
        {
          part: '(?<year>\\d{4})',
          meaning: 'The **year**: any four digits, captured as *year*.',
        },
        { part: '-', meaning: 'A hyphen.' },
        {
          part: '(?<month>0[1-9]|1[0-2])',
          meaning: 'The **month**: 01 to 09, or 10 to 12.',
        },
        { part: '-', meaning: 'Another hyphen.' },
        {
          part: '(?<day>0[1-9]|[12]\\d|3[01])',
          meaning: 'The **day**: 01 to 31. It doesn’t know how long each month is, so 30 February passes.',
        },
        {
          part: '\\b',
          meaning: 'Another boundary, so 2026-11-071 doesn’t match.',
        },
      ],
      tests: [
        'Invoice 2026-11-07, paid on 2026-11-09',
        'Due 2026-13-01: there is no 13th month',
        '2026-02-30 slips through: it doesn’t check month lengths',
        '07/11/2026 isn’t written the ISO way, so no match',
        'Build 20261107-1 isn’t a date either',
      ],
    },
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    group: 'code',
    use: 'Keyboard shortcuts by group, drawn as keys, with a switch between Mac and Windows keys and a filter when there are many.',
    keywords: 'keyboard shortcuts hotkeys keybindings key combinations cheat sheet mac windows vs code editor app keys',
    shape: `{
  title?: string
  app?: string
  groups: {
    name: string
    keys: {
      keys: string             // "Ctrl+Shift+P"; a sequence with a space: "Ctrl+K Ctrl+S"
      mac?: string             // the Mac's, when it differs: "Cmd+Shift+P"
      action: string
    }[]
  }[]
}`,
    example: {
      title: 'The VS Code shortcuts worth learning first',
      app: 'Visual Studio Code',
      groups: [
        {
          name: 'Everyday',
          keys: [
            {
              keys: 'Ctrl+Shift+P',
              mac: 'Cmd+Shift+P',
              action: 'Run any command',
            },
            { keys: 'Ctrl+P', mac: 'Cmd+P', action: 'Open a file by name' },
            {
              keys: 'Ctrl+`',
              mac: 'Ctrl+`',
              action: 'Show or hide the terminal',
            },
            {
              keys: 'Ctrl+B',
              mac: 'Cmd+B',
              action: 'Show or hide the sidebar',
            },
            {
              keys: 'Ctrl+K Ctrl+S',
              mac: 'Cmd+K Cmd+S',
              action: 'Change shortcuts',
            },
          ],
        },
        {
          name: 'Editing',
          keys: [
            {
              keys: 'Ctrl+D',
              mac: 'Cmd+D',
              action: 'Select the next match too',
            },
            {
              keys: 'Ctrl+Alt+Down',
              mac: 'Cmd+Option+Down',
              action: 'Add a cursor below',
            },
            { keys: 'Alt+Up', mac: 'Option+Up', action: 'Move the line up' },
            {
              keys: 'Shift+Alt+Down',
              mac: 'Shift+Option+Down',
              action: 'Copy the line down',
            },
            { keys: 'Ctrl+/', mac: 'Cmd+/', action: 'Comment the line out' },
            {
              keys: 'Shift+Alt+F',
              mac: 'Shift+Option+F',
              action: 'Format the file',
            },
          ],
        },
        {
          name: 'Finding your way',
          keys: [
            { keys: 'F12', action: 'Go to the definition' },
            { keys: 'F2', action: 'Rename a symbol everywhere' },
            {
              keys: 'Ctrl+Shift+O',
              mac: 'Cmd+Shift+O',
              action: 'Go to a function in the file',
            },
            { keys: 'Ctrl+G', mac: 'Ctrl+G', action: 'Go to a line' },
            { keys: 'Alt+Left', mac: 'Ctrl+-', action: 'Go back' },
            {
              keys: 'Ctrl+Shift+F',
              mac: 'Cmd+Shift+F',
              action: 'Search all files',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'repo',
    title: 'Repositories',
    group: 'code',
    use: 'Code repositories as cards: what each is, stars, forks, language, licence, when it last changed, topics, and its install command to copy.',
    keywords: 'github repository repo open source project library package stars forks license install alternatives tools',
    shape: `{
  title?: string
  repos: {
    name: string               // "owner/repo"
    url: url
    description?: md
    stars?: number
    forks?: number
    language?: string
    license?: string           // "MIT"
    updated?: date             // the last change
    topics?: string[]
    install?: string           // the command that installs it
  }[]
}`,
    example: {
      title: 'Static site generators worth a look',
      repos: [
        {
          name: 'gohugoio/hugo',
          url: 'https://github.com/gohugoio/hugo',
          description: 'The world’s fastest framework for building websites.',
          stars: 86400,
          forks: 7900,
          language: 'Go',
          license: 'Apache-2.0',
          updated: '2026-11-06',
          topics: ['static-site-generator', 'go', 'cms', 'blog-engine'],
          install: 'brew install hugo',
        },
        {
          name: 'withastro/astro',
          url: 'https://github.com/withastro/astro',
          description: 'The web framework for content-driven websites.',
          stars: 55800,
          forks: 3000,
          language: 'TypeScript',
          license: 'MIT',
          updated: '2026-11-07',
          topics: ['static-site-generator', 'islands', 'content', 'ssr'],
          install: 'npm create astro@latest',
        },
        {
          name: '11ty/eleventy',
          url: 'https://github.com/11ty/eleventy',
          description: 'A simpler site generator. Transforms a directory of templates (of varying types) into HTML.',
          stars: 18900,
          forks: 520,
          language: 'JavaScript',
          license: 'MIT',
          updated: '2026-11-03',
          topics: ['static-site-generator', 'javascript', 'templates'],
          install: 'npm install @11ty/eleventy',
        },
        {
          name: 'getzola/zola',
          url: 'https://github.com/getzola/zola',
          description: 'A fast static site generator in a single binary with everything built in.',
          stars: 16200,
          forks: 1000,
          language: 'Rust',
          license: 'MIT',
          updated: '2026-10-29',
          topics: ['static-site-generator', 'rust', 'sass', 'single-binary'],
          install: 'brew install zola',
        },
      ],
    },
  },
  {
    id: 'logs',
    title: 'Log viewer',
    group: 'code',
    use: 'Log lines to read: filter by level, search, wrap long lines or not; errors and warnings stand out, chosen words are marked, and they copy.',
    keywords: 'logs log lines viewer server console tail journal syslog levels warnings filter grep kubernetes nginx',
    shape: `{
  title?: string
  source?: string              // where they come from: "checkout-api (Kubernetes, prod)", "/var/log/nginx/error.log"
  lines: string | Line[]       // a string: the lines as printed (each one's time and level are read from it)
  highlight?: string[]         // words to mark wherever they appear: an id, a host
  note?: md
}
Line = { time?: string, level?: "debug" | "info" | "warn" | "error" | "fatal", message: string, source?: string }`,
    example: {
      title: 'checkout-api, the seconds before the outage',
      source: 'checkout-api-7f9c6d · Kubernetes, prod',
      lines: `2026-11-07T14:02:11.204Z INFO  [http] GET /api/cart/ord_9Lk2mQ 200 38ms
2026-11-07T14:02:11.871Z INFO  [http] POST /api/checkout 201 412ms
2026-11-07T14:02:12.015Z DEBUG [db] pool: total=20 idle=2 waiting=0
2026-11-07T14:02:14.330Z WARN  [db] slow query (2,184 ms): SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC
2026-11-07T14:02:15.002Z DEBUG [db] pool: total=20 idle=0 waiting=7
2026-11-07T14:02:16.448Z WARN  [db] pool exhausted: 12 requests waiting for a connection to pg-primary
2026-11-07T14:02:19.517Z ERROR [http] POST /api/checkout 503 5003ms: timeout acquiring a connection from the pool
    at Pool.acquire (node_modules/pg-pool/index.js:208:19)
    at async OrderRepo.create (src/orders/repo.ts:41:18)
    at async checkout (src/routes/checkout.ts:77:21)
2026-11-07T14:02:19.900Z INFO  [http] GET /api/health 200 3ms
2026-11-07T14:02:21.233Z ERROR [payments] charge failed for ord_9Lk2mQ: Stripe answered 502 (try 1 of 3)
2026-11-07T14:02:23.640Z INFO  [payments] charge succeeded for ord_9Lk2mQ on try 2
2026-11-07T14:02:24.118Z ERROR [http] POST /api/checkout 503 5001ms: timeout acquiring a connection from the pool
2026-11-07T14:02:24.702Z WARN  [k8s] readiness probe failed: GET /api/ready answered 503
2026-11-07T14:02:26.015Z FATAL [db] lost connection to pg-primary:5432 (ECONNRESET); exiting so the pod restarts`,
      highlight: ['pg-primary', 'ord_9Lk2mQ'],
      note: 'The pool ran dry three seconds before the first 503: the **slow query** on `orders` holds its connections. An index on `orders (customer_id, created_at)` should end it.',
    },
  },
  {
    id: 'cron',
    title: 'Cron schedule',
    group: 'code',
    use: 'A cron expression explained in words, field by field, with its next runs worked out in its time zone; edit it to try another.',
    keywords: 'cron crontab expression job recurring hourly daily weekly next runs time zone timer github actions',
    shape: `{
  expression: string           // 5 fields (minute hour day month weekday), 6 with seconds first, or @daily, @hourly…
  tz?: string                  // the zone it runs in (IANA): "Europe/Athens"; the device's own unless set
  command?: string             // what it runs: shown as the crontab line to copy
  explain?: { field: string, meaning: md }[]   // your words for each field, in order
  next?: number                // how many next runs to list (5 unless set)
  note?: md
}`,
    example: {
      expression: '*/15 8-18 * * 1-5',
      tz: 'America/Chicago',
      command: 'node /srv/inventory/sync.js',
      explain: [
        { field: '*/15', meaning: 'Every 15 minutes: at :00, :15, :30 and :45.' },
        { field: '8-18', meaning: 'From the 8 am hour to the 6 pm hour, so the last run is at **18:45**.' },
        { field: '*', meaning: 'Any day of the month.' },
        { field: '*', meaning: 'Every month.' },
        { field: '1-5', meaning: 'Monday to Friday: the warehouse is closed at weekends.' },
      ],
      next: 5,
      note: 'Cron reads these times on the server’s clock, set to **Chicago time**; a hosted scheduler such as GitHub Actions would read them in UTC.',
    },
  },
];
