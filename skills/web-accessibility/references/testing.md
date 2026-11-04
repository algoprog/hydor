# Testing accessibility

Open this to plan the checks for a feature, run automated tools, do the keyboard and screen reader
passes, and write the report.

## Before building: what the feature must do

Agree on these with the person for each new feature, then test exactly them:

- [ ] With the keyboard alone, people can start, finish, cancel and recover from the task, and always
      see where focus is.
- [ ] Every control has a visible label, and the same words are its name in the accessibility tree.
- [ ] Errors are said in text next to the field, and fixed without typing everything again.
- [ ] What changes on screen is announced, or focus moves to it.
- [ ] It works at 400% zoom, with reduced motion, in forced colours, and without relying on colour.
- [ ] Custom widgets: the keys they answer to, written down.

## Automated checks

They catch missing alt text, unnamed buttons and links, missing labels, low contrast, wrong ARIA,
duplicate ids, a missing `lang`. They cannot judge whether alt text fits, whether the order makes
sense, whether a widget works with keys, or whether errors can be fixed. In a test, axe passed an
input named only by its placeholder and a `<div role="button">` the keyboard cannot reach. Run
them in every state: menu open, dialog open, errors shown.

axe in a Playwright test, the most useful because it covers states and runs again later
(`npm i -D @playwright/test @axe-core/playwright` and `npx playwright install chromium`):

```ts
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

test('sign-up form, empty and with errors', async ({ page }) => {
  await page.goto('http://localhost:3000/signup');
  expect((await scan(page)).violations).toEqual([]);
  await page.getByRole('button', { name: 'Create account' }).click();   // errors now shown
  expect((await scan(page)).violations).toEqual([]);
});
```

Each violation names its rule (`id`), its impact, the elements (`nodes[].target`) and a help link:
quote those in the report.

Without a test project:

- `npx pa11y https://example.com --runner axe` (fetches its own Chromium).
- `npx lighthouse https://example.com --only-categories=accessibility --output=json --output-path=./a11y.json --chrome-flags="--headless"`
  (needs Chrome or Chromium; set `CHROME_PATH` when it cannot find one). Its score sums up automated
  checks only.
- `npx @axe-core/cli https://example.com` needs a ChromeDriver matching the installed Chrome
  (`npx browser-driver-manager install chrome`).
- For the person: the axe DevTools, WAVE and Accessibility Insights browser extensions (the last has a
  guided manual check).

## The accessibility tree

What a screen reader is told, as Playwright sees it:

```ts
console.log(await page.locator('main').ariaSnapshot());
// - heading "Checkout" [level=1]
// - textbox "Email"
// - button "Pay"
```

A control without a name has nothing in quotes (`- button:`, `- link:`, `- img`).
`await expect(page.locator('main')).toMatchAriaSnapshot(...)` keeps it from changing unnoticed. In the
browser: Chrome DevTools → Elements → Accessibility, or Firefox's Accessibility Inspector.

## Keyboard pass

1. Start at the address bar; press Tab. A skip link should come first on long pages.
2. Do each task with Tab, Shift+Tab, Enter, Space, Escape and arrows only.
3. At every step: can you see the focus? Is the order the reading order? Does anything trap you? Does
   Escape close what is open, and does focus go back to where you were?
4. Trigger the errors and the empty states too, and recover from them.

On a Mac, Tab skips links in Safari until **Safari → Settings → Advanced → Press Tab to highlight each
item on a webpage** is on, and reaches all controls only with **System Settings → Keyboard → Keyboard
navigation** on. With Hydor's browser: a `browser_act` step `{"action": "keys", "keys": "Tab"}`
(several: `"Tab Tab Tab"`), then `browser_read` with `kind: "screenshot"` to see the focus ring.

## Screen reader pass

| | NVDA (Windows) | VoiceOver (Mac) | VoiceOver (iPhone) | TalkBack (Android) |
| --- | --- | --- | --- | --- |
| On, off | Ctrl+Alt+N; NVDA+Q to quit | Cmd+F5 | Settings → Accessibility → VoiceOver | Settings → Accessibility → TalkBack |
| Next item | Down Arrow | VO+Right Arrow (VO is Ctrl+Option) | swipe right | swipe right |
| Activate | Enter | VO+Space | double tap | double tap |
| Headings | H, Shift+H | VO+U, then the Headings list | rotor (two-finger turn) to Headings, swipe down | reading controls to Headings, swipe down |
| Lists of links, landmarks | NVDA+F7 | VO+U | rotor | reading controls |
| Typing in a field | Tab into it (NVDA+Space switches modes by hand) | Tab into it and type | double tap it, then type | double tap it, then type |

The NVDA key is Insert (or Caps Lock, if set). JAWS works much like NVDA (H for headings,
Insert+F7 for links). The screen readers used most are JAWS and NVDA on Windows and VoiceOver on
iPhones (WebAIM's screen reader surveys); test with the audience's.

If you cannot listen yourself, give the person a short script, for example:

1. Turn on VoiceOver (Cmd+F5) and open the page in Safari.
2. Press VO+U and look at the Headings list: does it read like the page's outline?
3. Tab to each field of the form: does each one say its label and whether it is required?
4. Submit it empty: is the problem read out, and can you get to the field?
5. Open the dialog and close it with Escape: where does focus land?

## Zoom, spacing, colours and motion

- 400% zoom on a window 1280 pixels wide (that is 320 CSS pixels), or DevTools' device toolbar at 320
  wide: no sideways scrolling, nothing hidden or overlapping.
- Text spacing: run in the console, then look for cut-off text:
  `document.head.insertAdjacentHTML('beforeend', '<style>*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}</style>')`
- DevTools → Rendering: emulate `prefers-reduced-motion: reduce`, `forced-colors: active`, and vision
  deficiencies. In Playwright: `await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' })`.

## The report

```markdown
## Accessibility check: <site>, <date>

**Checked:** <pages and states>, against WCAG 2.2 AA, with <tools and versions>, <browsers>,
<screen readers>. **Not checked:** <what and why>.

**In short:** <n> problems: <x> stop someone finishing a task, <y> make it hard, <z> are annoying.
The most important: <one or two lines>.

| # | Where | What is wrong, and for whom | WCAG | How bad | Fix | Evidence |
| - | ----- | --------------------------- | ---- | ------- | --- | -------- |
| 1 | Checkout, Pay button | No visible focus: keyboard users cannot see where they are | 2.4.7 Focus Visible (AA) | Stops the task | Add a `:focus-visible` outline | Screenshot 3 |
```

Write "not tested" rather than leaving a criterion out, and never turn "no automated failures" into
"accessible".
