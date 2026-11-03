# Frontend polish checklist

Go through the parts that apply to the screens you changed. Numbers are sensible defaults; the
project's own design system wins where it has one.

## Scales to settle first

| Thing | A good default |
| --- | --- |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64 px |
| Type sizes | 12, 14, 16, 20, 24, 32, 40 px; body 16 |
| Line height | 1.5 body, 1.2 to 1.3 headings |
| Font weights | 400 regular, 500 or 600 for emphasis, 700 for headings (two or three in all) |
| Radius | one small (4 to 6px) for inputs and buttons, one larger (8 to 12px) for cards and dialogs |
| Shadows | two or three levels: resting cards, raised menus, dialogs |
| Layers (z-index) | a named set: dropdown, sticky header, overlay, modal, toast |
| Breakpoints | 640, 768, 1024, 1280 px (or the framework's) |
| Durations | 150ms small, 250ms panels, 300ms or less for anything people wait on |

## Layout

- [ ] Every margin, padding and gap comes from the spacing scale.
- [ ] Grouping is visible from spacing alone; related items are closer than unrelated ones.
- [ ] Content aligns to a few vertical edges; no element is a few pixels off its neighbours.
- [ ] Page width is capped for reading; body text 65 characters wide or less.
- [ ] Images and embeds have reserved space; no layout shift when they load.
- [ ] Sticky headers and footers do not hide focused elements or anchors.

## Typography

- [ ] Sizes and weights come from the scale; no stray 13px or 15px.
- [ ] One h1 per page; headings in order; each section has a clear heading.
- [ ] Long text wraps; long words and URLs do not overflow; truncated text is reachable in full.
- [ ] Numbers in columns use tabular figures and align right; units and currencies are consistent.
- [ ] Dates, times and numbers are formatted for the user's locale.

## Colour

- [ ] Every colour is from the palette and has a role.
- [ ] Text contrast 4.5:1 (large text 3:1); icons, borders of inputs, focus rings 3:1.
- [ ] Status is shown by more than colour (icon, text, pattern).
- [ ] Links look like links in body text (underline or another clear cue).
- [ ] Dark theme, if any, checked on every changed screen: contrast, borders, shadows, images.

## Buttons and links

- [ ] One primary action per view; secondary and tertiary styles are clearly quieter.
- [ ] Destructive actions look destructive and ask for confirmation, or can be undone.
- [ ] Button labels are verbs that say what happens ("Save changes", not "OK").
- [ ] Same height for buttons and inputs in a row; icons the same size and aligned with the text.
- [ ] Loading state on buttons that start slow work; they cannot be pressed twice.

## Forms

- [ ] Every input has a visible label (not only a placeholder).
- [ ] Required and optional are marked consistently.
- [ ] Input widths hint at the expected length (a postcode field is short).
- [ ] The right input types and keyboards: `type="email"`, `inputmode="numeric"`, `autocomplete`.
- [ ] Errors appear next to the field, say how to fix it, and keep what was typed.
- [ ] Submitting shows progress, then success or an error; Enter submits where expected.

## Tables and lists

- [ ] Header row distinct; columns aligned (text left, numbers right).
- [ ] Empty state, loading state, and a very long list (pagination or virtualisation).
- [ ] On phones: horizontal scroll inside the table's container, or stacked cards.
- [ ] Sorting and filtering state is visible.

## Icons and images

- [ ] One icon set, consistent stroke and size (16, 20 or 24px).
- [ ] Icon-only buttons have an accessible name and a tooltip.
- [ ] Images are sized for their display size, in a modern format, lazy below the fold.
- [ ] Decorative images have `alt=""`; meaningful ones say what they show.

## States

- [ ] Empty, loading, error, partial, success, disabled designed for each component touched.
- [ ] Hover adds information but is never the only way to reach it (no hover on touch screens).
- [ ] Focus ring visible on every interactive element, with 3:1 contrast.

## Responsive

- [ ] 360 or 390, 768, 1024, 1280 and 1920px wide all checked.
- [ ] No horizontal scrolling of the page; no text smaller than 12px; inputs 16px or more.
- [ ] Touch targets 24x24 px minimum, 44x44 for primary actions.
- [ ] Navigation works on a phone (menu opens, closes, and is reachable by keyboard).
- [ ] Zoom to 200% still usable.

## Keyboard and screen readers

- [ ] Tab order matches the visual order; nothing unreachable; no focus traps except open dialogs.
- [ ] Escape closes dialogs and menus; focus returns to what opened them.
- [ ] Landmarks (`header`, `nav`, `main`, `footer`) and a skip link on long pages.
- [ ] Live regions announce async results and errors.
- [ ] Automated check (Lighthouse or axe) passes with no serious issues; manual Tab-through done.

An axe check in a Playwright test:

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('settings page has no detectable accessibility violations', async ({ page }) => {
  await page.goto('http://localhost:5173/settings');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});
```

## Motion

- [ ] Each animation explains a change; nothing loops for decoration.
- [ ] `transform` and `opacity` only; no animating `width`, `height`, `top` or `left`.
- [ ] `prefers-reduced-motion: reduce` turns non-essential motion off.

## Copy

- [ ] Labels and messages in the product's voice, consistent capitalisation (sentence case is easiest).
- [ ] The same thing has the same name everywhere.
- [ ] Error messages say what happened and what to do, without blaming the user or showing codes alone.
- [ ] No placeholder text ("Lorem ipsum", "TODO") left on screen.
