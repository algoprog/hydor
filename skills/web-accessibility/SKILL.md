---
name: web-accessibility
description: Use when making a website or web app usable by everyone (keyboard, screen readers, zoom, contrast, captions) or checking it, such as an accessibility audit, WCAG, ARIA, focus, forms or dialogs. Not for visual polish (frontend-polish).
category: coding
triggers: [web accessibility, accessibility audit*, accessibility check*, accessibility issue*, accessibility test*, screen reader*, keyboard navigation, focus trap*, aria-*, wcag, a11y, accessibility act]
---

# Web accessibility

Accessible means people can finish the task: with only a keyboard, with a screen reader, zoomed to
400%, with low vision or colour blindness, without sound, or with an unsteady hand. Native HTML does
most of the work; most failures come from custom widgets, missing names, lost focus and errors nobody
can find. Judge by doing the tasks those ways: a scanner's score is a start, never the verdict.

## 1. Agree what you check, and against what

- The tasks and pages (sign up, search, checkout, the contact form) and their states: a menu or dialog
  open, an error shown, loading, empty, signed in.
- The bar: WCAG 2.2 level AA unless the person says otherwise. Laws point to WCAG at AA: in the EU
  the European Accessibility Act, through EN 301 549 (its 2026 version follows WCAG 2.2); in the US,
  Section 508 (WCAG 2.0) and the ADA rule for public bodies (WCAG 2.1). Whether a law applies to them
  is for a lawyer or an accessibility specialist; you report what you found.
- For a new feature, write down first what it must do for keyboard and screen reader users (the
  checklist in `references/testing.md`), so the tests check exactly that.

## 2. Native HTML first

- `<button>` for actions, `<a href>` for going somewhere, `<label for>` on every input, `<fieldset>`
  and `<legend>` around a group of radio buttons, `<details>` to show and hide, `<dialog>` for
  dialogs, `<table>` with `<th scope>` for data.
- Structure: one `<h1>` and headings in order (never chosen for their size); `<header>`, `<nav>`,
  `<main>`, `<footer>`; a "Skip to main content" link first where menus are long; `<html lang="en">`;
  a `<title>` that names the page, updated on each route change in a single-page app.
- ARIA only where HTML has no element. It changes what is announced, not what happens:
  `<div role="button">` still needs `tabindex="0"` and Enter and Space handling. No role on an element
  that already has it, never `aria-hidden="true"` on anything focusable. No ARIA beats wrong ARIA.

## 3. Names and text alternatives

- Every control has a name, usually its visible text. Icon-only buttons get `aria-label="Close"` (or
  visually hidden text). Keep the visible words in the name, so speech users can say what they see.
- A placeholder is not a label: it disappears as people type.
- Images: `alt` says what the picture tells in that place ("Sales doubled in 2025", not "chart");
  decorative ones get `alt=""`; a linked image says where it goes; a complex chart gets its data or a
  summary in text nearby.
- Links make sense on their own: "Download the 2025 report (PDF, 2 MB)", not "click here".
- See the names: the browser's accessibility view (Chrome DevTools → Elements → Accessibility;
  Firefox's Accessibility Inspector) shows each element's role, name and state.

## 4. Keyboard and focus

- Everything works with Tab, Shift+Tab, Enter, Space and Escape, plus arrow keys inside widgets that
  use them (menus, tabs, radio groups, lists).
- Focus moves in reading order: no positive `tabindex`; `tabindex="0"` only on custom controls;
  `tabindex="-1"` for what script focuses.
- Focus is always visible: never `outline: none` without a replacement; a `:focus-visible` style with
  3:1 contrast; never hidden under a sticky header (`scroll-padding-top`).
- No traps: Tab leaves everything except an open modal dialog, and Escape closes that.
- Focus lands somewhere sensible: back on the button that opened a dialog or menu when it closes; on a
  neighbour after an item is deleted; on the new page's `<h1>` after a route change.
- What appears on hover also appears on focus, stays while the pointer moves onto it, and closes with
  Escape.

## 5. Forms and errors

- A visible label for each field; required fields marked in words, not only colour; the expected
  format before the field ("Date, as DD/MM/YYYY").
- `autocomplete` on personal data (`name`, `email`, `tel`, `street-address`, `postal-code`,
  `one-time-code`) and the right `type`, so browsers and password managers can fill them.
- Errors say what is wrong and how to fix it ("Enter a date in the past"), next to the field, tied to
  it with `aria-describedby`, the field marked `aria-invalid="true"`. With several errors, a list at
  the top linking to each field, with focus moved to it. Keep everything typed.
- Pasting works in password and code fields, and logging in never depends on a puzzle alone.
- Success is said in text, in a status region that exists before the message arrives.
- Never disable the submit button until the form is valid: people cannot tell why. Let them submit,
  then show the errors.

## 6. Dialogs, menus and other widgets

- Dialogs: `<dialog>` opened with `showModal()` keeps focus inside, closes with Escape and makes the
  page behind inert. Give it a name (`aria-labelledby` its heading), a visible close button, a
  sensible first focus (never a destructive button), and focus back on the opener when it closes.
  Never `aria-hidden` on the backdrop or on anything that contains the dialog.
- A site's menu on a phone: a `<button aria-expanded="false" aria-controls="menu">` showing ordinary
  links inside `<nav>`, with `aria-current="page"` on the current one. Not `role="menu"`, which
  promises arrow-key behaviour like an app's menu bar.
- Tabs, autocompletes (comboboxes), listboxes, trees and grids: a native element or a maintained
  component library first. If custom, follow the WAI-ARIA Authoring Practices pattern completely
  (roles, states, keys) and test it with a screen reader.
- Changes without a page load ("Saved", a result count, a toast): a polite live region;
  `role="alert"` only for what is urgent. Anything that moves or updates for more than five seconds
  gets a pause button.
- Code for each of these: `references/patterns.md`.

## 7. Seeing, hearing, moving

- Contrast at AA: 4.5:1 for text, 3:1 for large text (24px, or 18.66px bold) and for input borders,
  icons, focus rings and chart lines. Measure with the frontend-polish skill's contrast script or the
  browser's colour picker.
- Never colour alone: links in text underlined, errors with words and an icon, charts with labels.
- Zoom: usable at 200% text size and at 320 CSS pixels wide (400% zoom) without sideways scrolling,
  except tables, maps and code; nothing cut off when text spacing grows. Use `rem`, no fixed heights
  on text, and never `user-scalable=no` or `maximum-scale=1`.
- Targets at least 24×24 CSS pixels or with space around them; anything dragged has a click
  alternative.
- Motion: `prefers-reduced-motion: reduce` turns off what is not essential; nothing flashes more than
  three times a second; no sound plays by itself without a way to stop it.
- Video with speech has captions (checked, not raw automatic ones); information shown only in the
  picture is described; audio-only content has a transcript.

## 8. Test with tools, the keyboard and a screen reader

Tools find only part of the problems. They cannot tell whether alt text makes sense, focus order is
logical or a widget can be used. Do all four:

1. **Automated:** axe in a Playwright test, `npx pa11y <url> --runner axe`, Lighthouse
   (`npx lighthouse <url> --only-categories=accessibility`), or the axe DevTools and WAVE browser
   extensions; in each state (menu open, errors shown). Commands: `references/testing.md`.
2. **Keyboard:** each task with the keys alone. With Hydor's browser, a `browser_act` step
   `{"action": "keys", "keys": "Tab"}` then `browser_read` with `kind: "screenshot"` shows where focus
   went. Note where it is lost, invisible or stuck.
3. **Screen reader:** NVDA (free, Windows) with Firefox or Chrome, VoiceOver (built into Macs and
   iPhones) with Safari, JAWS if the audience uses it, TalkBack on Android. If you cannot listen,
   read the accessibility tree (Playwright's `ariaSnapshot()`) and give the person a short script to
   try, with the keys from the reference.
4. **Zoom and settings:** 200% and 400% zoom, reduced motion and forced colours (DevTools → Rendering),
   and a phone.

## 9. Report honestly

- Each issue: where (page, element, state), who it stops and how, the WCAG criterion with number,
  name and level ("2.4.7 Focus Visible, AA", from `references/wcag-aa.md`), how bad (blocks the task,
  makes it hard, annoys), the fix, and the evidence (a screenshot, the tool's rule, what the screen
  reader said).
- Say what you tested (pages, states, tools and versions, browsers, screen readers) and what not.
- Never call a site "WCAG compliant" or "fully accessible" from a scan or a sample. Write "no automated
  failures on these five pages; keyboard pass done on checkout; not tested with a screen reader". A
  conformance claim needs every page in scope checked against every criterion, usually by a
  specialist.
- Bugs in whole user flows: the web-app-qa skill's report format. Visual fixes: frontend-polish.
  Before saying a fix works: evidence-before-done.

## Pitfalls

- A high Lighthouse score taken as "accessible".
- ARIA added where a native element would have done the job.
- `outline: none` with nothing in its place.
- Focus lost after a dialog closes or the route changes.
- A placeholder as the only label; errors shown only in red.
- `role="menu"` on a site's navigation.
- An "accessibility overlay" widget sold as making a site compliant: it does not (in 2025 the US FTC
  made one maker pay $1 million over that claim).
- Testing only the happy path: not errors, empty states, zoom or phones.
