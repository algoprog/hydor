---
name: frontend-polish
description: Use when a web interface works but looks or feels unfinished, or when asked to improve its layout, spacing, typography, colours, states, phone layout or accessibility. Not for testing whole user flows; see web-app-qa.
category: coding
triggers: [polish the ui, ui look*, polish the page, improve the ui, make it responsive, responsive design, looks bad on mobile, design system, color contrast, colour contrast, wcag, a11y]
---

# Frontend polish

Polish is many small decisions made the same way everywhere: one spacing scale, one type scale, a few
colours with enough contrast, every state designed, and a layout that holds from a phone to a wide
screen. Work from the design system already there, change things in passes, and judge by real
screenshots, not by reading CSS.

## 1. Look first, with screenshots

- Start the dev server. Before your first edit, take a "before" picture of each screen you will touch:
  the app's `ui_screenshot` tool with `phase: "before"`, a short `label` per screen, `viewport: "both"`
  (desktop 1280x800 and phone 390x844), and `full_page: true` for long pages. At the end, take
  `phase: "after"` with the same labels, so the user sees each pair side by side.
- Without that tool: Playwright's `page.screenshot({ path, fullPage: true })` at 1280 and 390 wide, or the
  browser's device toolbar.
- Write down what looks off, concretely: "card titles wrap at 390px", "three different greys for
  secondary text", "buttons are 32, 36 and 40px tall". Specific problems, not "make it nicer".

## 2. Find the system that is already there

- Read the design tokens before inventing values: CSS custom properties (`:root { --space-2: 8px }`), the
  Tailwind theme, the component library's theme (MUI, Chakra, shadcn/ui), SCSS variables.
- Reuse existing components and tokens. Where values are scattered, settle them onto a small scale
  instead of adding one more.
- Keep the product's look. Polish is not a redesign unless the user asked for one.

## 3. Layout and spacing

- One spacing scale on a 4 or 8px base (4, 8, 12, 16, 24, 32, 48, 64). Every margin, padding and gap
  comes from it.
- Related things sit closer together than unrelated things; space inside a card is no larger than the
  space between cards.
- Align to few edges: one left edge per column; labels, inputs and buttons share heights and baselines.
  Lay out with flex or grid and `gap`, not margins on children.
- Body text no wider than about 65 characters (`max-width: 65ch`).
- Reserve space for images and late content (`width` and `height`, or `aspect-ratio`) so nothing jumps.

## 4. Typography

- A short type scale (for example 12, 14, 16, 20, 24, 32) and two or three weights. Body text at least
  16px, line height about 1.5 for body and 1.2 for headings.
- Hierarchy through size and weight first, colour second; one clear heading per section.
- Numbers in tables: `font-variant-numeric: tabular-nums`, aligned right.
- Long words and user content: `overflow-wrap: anywhere` where text can be long; truncate with an
  ellipsis only where the full text is reachable (a tooltip, a detail view).

## 5. Colour and contrast

- A few colours with roles: background and surfaces, text (primary and secondary), borders, one accent,
  and status colours (success, warning, danger, info). No new hex values outside the palette.
- WCAG AA: 4.5:1 for normal text; 3:1 for large text (24px, or 18.66px bold) and for icons, input borders
  and focus rings against what is next to them. Check with `python3 scripts/contrast.py "#6b7280" "#fff"`
  (or `--pairs file` for many), or the colour picker in the browser's DevTools.
- Never carry meaning by colour alone: pair red with an icon or words ("Error: ...").
- If the app has a dark theme, check every changed screen in it as well.

## 6. Design every state

| State | What to check |
| --- | --- |
| Empty | Says what belongs here and how to start (a button), not a blank area |
| Loading | A skeleton, or a spinner after about 300ms; no jump when data arrives; buttons show progress and cannot be pressed twice |
| Error | Says what happened and what to do; keeps what the user typed; offers a retry where it makes sense |
| Extremes | One item and a thousand; a 200-character name; a missing image; a translation 40% longer |
| Disabled | Looks disabled, and says why when that is not obvious |
| Hover, focus, active | Hover only as an extra; a visible focus ring (`:focus-visible`) on everything interactive; pressed feedback |
| Success | Confirms what happened, close to where it happened |

## 7. Responsive

- Check at 360 or 390, 768, 1024, 1280 and 1920px wide. Nothing scrolls sideways: in the console,
  `document.documentElement.scrollWidth > innerWidth` is `true` when something overflows.
- Write mobile-first CSS: base styles for small screens, `min-width` media or container queries above.
- Touch targets at least 24x24 CSS px (WCAG 2.2 AA), 44x44 for primary actions, with space between.
- Tables on phones: scroll inside their own container, or become stacked cards.
- Inputs use at least 16px text, or iOS Safari zooms the page when they get focus.

## 8. Keyboard and screen reader basics

- Everything works from the keyboard: Tab order follows the visual order, Enter and Space activate,
  Escape closes dialogs and menus, focus moves into a dialog and back to its trigger on close.
- Use real elements: `<button>` for actions, `<a href>` for navigation, `<label>` tied to each input,
  headings in order, `<nav>` and `<main>` landmarks.
- Icon-only buttons need an accessible name (`aria-label`); images need `alt` (`alt=""` when decorative).
- Form errors are tied to their field (`aria-describedby`) and announced (`role="alert"`).
- Automated checks find only part of the problems: run Lighthouse (DevTools, or `npx lighthouse <url>
  --only-categories=accessibility --view`) or axe, then Tab through the page yourself.

## 9. Motion, sparingly

- Motion explains a change (opened, moved, added); it is not decoration. 150 to 250ms for small changes.
- Animate `transform` and `opacity`, not layout properties like `width` or `top`.
- Respect `@media (prefers-reduced-motion: reduce)` by turning non-essential motion off.

## 10. Check the result

- Take the "after" screenshots and compare each pair yourself before the user does: alignment, spacing,
  wrapping, contrast, states, both widths.
- Click through the changed screens once: hover, Tab focus, an error, an empty state, the phone width.
- Run the project's linters and tests. Report what changed and what you left alone, and why.

The full checklist (forms, buttons, tables, icons, copy) is in `references/checklist.md`.

## Pitfalls

- Judging from the code instead of looking at the page.
- One-off values (`margin-top: 13px`, a new grey) that drift from the scale.
- `outline: none` with no visible focus style in its place.
- Polishing only the happy path, leaving empty, loading and error states raw.
- Checking one screen width.
- Adding a UI library or a font for a small fix.
