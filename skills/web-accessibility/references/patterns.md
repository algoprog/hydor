# Accessible patterns, with code

Open this when building or fixing a dialog, a menu, tabs, an autocomplete, form errors, status
messages, route changes, a data table or a video. Prefer the project's own components when they already
behave this way; check that they do.

## A dialog

```html
<button type="button" id="edit-open">Edit profile</button>

<dialog id="edit" aria-labelledby="edit-title">
  <h2 id="edit-title">Edit profile</h2>
  <form method="dialog">
    <label for="name">Name</label>
    <input id="name" name="name" autocomplete="name" autofocus>
    <button value="cancel" formnovalidate>Cancel</button>
    <button value="save">Save</button>
  </form>
</dialog>

<script>
  const dialog = document.getElementById('edit');
  const opener = document.getElementById('edit-open');
  opener.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('close', () => opener.focus());
</script>
```

- `showModal()`, not the `open` attribute: only the modal form keeps focus inside, closes with Escape
  and makes the page behind inert.
- `autofocus` chooses the first focus; without it, the first focusable element gets it. For a long
  dialog, focus its heading instead (give the heading `tabindex="-1"`).
- `<form method="dialog">` closes the dialog and leaves the button's `value` in `dialog.returnValue`.
- Without `<dialog>`: `role="dialog"`, `aria-modal="true"`, `inert` on the rest of the page, Tab kept
  inside, Escape to close and focus put back. It is more work than it looks; prefer `<dialog>`.

## A site menu on a phone (show and hide)

```html
<nav aria-label="Main">
  <button type="button" aria-expanded="false" aria-controls="main-menu">Menu</button>
  <ul id="main-menu" hidden>
    <li><a href="/" aria-current="page">Home</a></li>
    <li><a href="/shop">Shop</a></li>
  </ul>
</nav>

<script>
  const button = document.querySelector('[aria-controls="main-menu"]');
  const list = document.getElementById('main-menu');
  const setOpen = (open) => { button.setAttribute('aria-expanded', String(open)); list.hidden = !open; };
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  list.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); button.focus(); } });
</script>
```

Ordinary links, ordinary Tab order. A section that shows and hides without script:
`<details><summary>Shipping costs</summary>…</details>`.

## Tabs

| Key | Does |
| --- | --- |
| Tab | Into the tab list, onto the selected tab; Tab again goes to the panel |
| Left, Right | The previous or next tab, wrapping round |
| Home, End | The first or last tab |
| Enter, Space | Selects the focused tab, when tabs do not select as focus moves |

Markup: a `role="tablist"` with an `aria-label`; each tab `role="tab"` with `aria-selected` and
`aria-controls`; `tabindex="0"` on the selected tab and `tabindex="-1"` on the others (so Tab stops
once); each panel `role="tabpanel"` with `aria-labelledby` pointing at its tab, and `tabindex="0"`
when it has nothing focusable inside.

## An autocomplete (combobox)

Use a maintained component (the design system's own, React Aria, Radix, Headless UI and the like) and
test it; a plain `<select>` when the list is short and fixed. What it must do: an input with
`role="combobox"`, `aria-expanded` and `aria-controls` pointing at a `role="listbox"`; options with
`role="option"` and `aria-selected`; Down Arrow opens and moves, Enter picks, Escape closes; the
highlighted option named in `aria-activedescendant` while focus stays in the input; the number of
results said in a polite live region.

## Form errors

```html
<div id="error-summary" tabindex="-1" hidden>
  <h2>There is a problem</h2>
  <ul>
    <li><a href="#email">Enter an email address like name@example.com</a></li>
  </ul>
</div>

<label for="email">Email</label>
<p id="email-hint">We send the receipt here.</p>
<input id="email" name="email" type="email" autocomplete="email"
       aria-describedby="email-hint email-error" aria-invalid="true">
<p id="email-error">Enter an email address like name@example.com</p>
```

- On a failed submit: fill in the summary, show it, and move focus to it (`summary.focus()`); each link
  leads to its field.
- Put the error's id in `aria-describedby`, and `aria-invalid="true"` on the field, only while the
  error shows: hidden text referenced there is still read out.
- Keep the values typed. Check again as people fix a field, not on every key press before they finish.

## Status messages

```html
<div role="status" id="status"></div>   <!-- in the page from the start, empty -->
<script>document.getElementById('status').textContent = 'Saved';</script>
```

A region added at the same moment as its text is often not read. `role="alert"` interrupts: keep it
for errors that need attention now.

## Route changes in a single-page app

```js
document.title = 'Orders – My shop';
const heading = document.querySelector('main h1');
heading.setAttribute('tabindex', '-1');
heading.focus();
```

Back and Forward must work, and a deep link must open the right state.

## Skip link, hidden text, focus style, reduced motion

```html
<a class="skip-link" href="#main">Skip to main content</a>
…
<main id="main">…</main>
```

```css
.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: 1rem; top: 1rem; z-index: 1000; }

.visually-hidden {            /* read by screen readers, not shown */
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

:focus-visible { outline: 3px solid #1a5fb4; outline-offset: 2px; }
html { scroll-padding-top: 5rem; }   /* room for a sticky header */

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important; scroll-behavior: auto !important;
  }
}
```

## Data tables

```html
<table>
  <caption>Orders this month</caption>
  <thead>
    <tr><th scope="col">Order</th><th scope="col">Date</th><th scope="col">Total</th></tr>
  </thead>
  <tbody>
    <tr><th scope="row">#1042</th><td>3 Nov</td><td>€45.00</td></tr>
  </tbody>
</table>
```

Tables only for data, never for layout. A complex table (headers in several rows) is often better
split into simpler ones.

## Video

```html
<video controls>
  <source src="intro.mp4" type="video/mp4">
  <track kind="captions" src="intro.en.vtt" srclang="en" label="English" default>
</video>
```

Captions include who speaks and meaningful sounds. Information that is only in the picture is said in
the narration, or in an audio-described version. No autoplay with sound.
