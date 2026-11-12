---
name: ui-mockups
description: Use when about to build or redesign a screen, page or app layout whose look is not settled, to show two or three quick, clearly different mockups to compare and pick from. Not for small, precise changes to an existing design.
category: creative
triggers: [mockup, mock-up, mock up, wireframe, design options, layout options, landing page, redesign, what it could look like, ui design, design a screen, two versions]
---

# UI mockups

When a screen's layout and look are still open, show two or three quick, clearly different
mockups side by side, with realistic content, and let the person pick or mix. A few minutes of
mockups saves hours of building the wrong layout. Then refine the chosen one and build it.

## When to use it, and when to skip it

- **Use it:** a new screen, page or app; a redesign; a dashboard, a landing page, a form or an
  onboarding flow; the request says little about layout or style; several sensible layouts exist.
- **Skip it:** a small or exact change ("make the button blue", "add a column for dates"); the
  product's design system already decides the look and the request fits it; the user gave a sketch
  or a screen to copy (then make one mockup to confirm, at most); they said "just build it". A
  screen that works but looks unfinished needs polish, not options: the frontend-polish skill.

## 1. Gather what the screen is for

From the request, the codebase and the existing screens:

- who uses it, on what device (phone, desktop, both), and how often;
- the one thing they must be able to do there, and what comes second;
- the content: real items, names, numbers, dates and the longest likely text, from the user's own
  data or field; the empty, error and sold-out cases;
- the style to follow: the product's colours, fonts and components (read its CSS or theme); the
  app's own look when there is none;
- limits: accessibility, languages, what the backend can deliver.

If an unknown would change everything (who the users are, what the page must achieve), ask one
question first (the clarify-first skill). Otherwise assume, and say what you assumed.

## 2. Make two or three directions that differ in what matters

Vary one or two big decisions and keep the rest the same, so the difference is visible:

- **Structure:** a list, cards or a table; one long page, steps or tabs; navigation at the side, top
  or bottom.
- **Emphasis:** what comes first: the total, the search box, the call to action, the photo.
- **Density:** compact for daily experts, spacious for occasional visitors.
- **Flow:** edit in place or in a form; a wizard or a single page; choose first or browse first.

Three colour schemes of one layout are not three directions. Give each option a short name that
says its idea ("A · A list of today's bakes", "B · Picture cards", "C · Order ahead"), and one
sentence on who it suits.

## 3. Build them as one page

- One `show_html` page with the options side by side, each in a frame the size of the target
  device: a phone frame about 360 to 390 pixels wide; a desktop layout full width, one option under
  the other. A tested template is in `references/mockup-page.md`.
- **Realistic content, never lorem ipsum:** real product names, prices, dates, people's names
  (invented but plausible), a long name that wraps, an item that is sold out, an empty state.
  Placeholder text hides exactly the problems mockups are for.
- **Static:** HTML and CSS only, little or no script, no real data. Pictures as labelled grey boxes
  ("photo: sourdough") unless the user has real ones or the look depends on them
  (`generate_image` can make stand-ins).
- **The right look:** the product's own colours and fonts when it has them; otherwise the app's
  (`<body class="n-page">` and the page kit's variables).
- **Pickable:** put `data-choice="A · A list of today's bakes"` on each option and `data-group` on
  their container; a click puts the choice in the user's message box. Invite mixing: "or tell me
  what to take from each".

## 4. Look before you show

Write the page to a file and look at it with `ui_screenshot` (phase `check`, viewport `both`). It
shows a page made with the kit as the app does, in the dark theme: look once with `theme: "light"`
too. Nothing overflows or overlaps, every text reads well on what is behind it in both themes, text
is readable at phone width, the options look clearly different, the numbers add up. Fix, then show
it.

## 5. Say what differs, briefly

In the reply, not repeating the page: one line per option on its idea and its cost ("B sells
better to newcomers, but regulars scroll more"), then your recommendation and why, tied to what the
user said. Ask them to pick, mix, or say what is missing.

## 6. Refine the chosen one, then build

- Apply their choice and comments in one refined mockup that also shows the hard states: empty,
  loading, error, very long text, many items. One more round at most for big changes.
- Build it in the real codebase with the project's own components and styles; match the mockup's
  layout and content rules, not its throwaway CSS.
- Before changing an existing screen, take `ui_screenshot` phase `before`; when done, phase `after`
  with the same label, so the user sees the change side by side.
- Keep the agreed mockup (`save_page`) if the user wants it as a reference.

## Pitfalls

- Options that differ only in colour or font.
- Lorem ipsum and perfect data: everything fits, nothing is sold out, no name is long.
- Polishing too early: animations, real logic, pixel-perfect spacing before a direction is chosen.
- Four or more options: people compare two or three well, more poorly.
- Building before they choose, or choosing for them without saying so.
- A desktop mockup for a screen people use on their phones.
