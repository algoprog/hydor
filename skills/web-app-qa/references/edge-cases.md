# Edge cases worth trying

Pick what fits the screen in front of you. The goal is to find where the app stops behaving, not to
run every line.

## Text fields

- Empty; a single space; spaces before and after the value (are they trimmed?).
- The maximum length, one more than the maximum, and 5,000 characters pasted in.
- Accents and other scripts: `Zoë Ñúñez`, `Ελληνικά`, `中文`, `العربية` (right to left), and emoji,
  including ones built from several joined characters (skin tones, families, flags), which break naive
  length limits and truncation.
- Markup and code as plain text: `<b>bold</b>`, `<script>alert(1)</script>`, `{{7*7}}`, `${7*7}`. They must
  show as typed, never run or render.
- Quotes and separators: `O'Brien`, `"quoted"`, `a,b;c`, a backslash `\`, a tab, a line break pasted in.
- Look-alikes: `0` and `O`, `l` and `1`; copying a value with an invisible trailing space.
- Email: `a+tag@example.com`, upper case, a missing domain, a very long address.
- Phone and postcodes: leading zeros (`01234`), spaces, a plus sign, letters (UK and Dutch postcodes).

## Numbers, money and dates

- 0, -1, 0.1 + 0.2, very large values, more decimals than allowed, a decimal comma (`3,5`), thousands
  separators (`1,000` and `1.000`).
- Currency rounding: totals of many small items; discounts that would go below zero.
- Dates: 29 February, 31 April, 1 January, end of month, a date in the past or far future.
- Time zones: the user's time zone differs from the server's; a time around a daylight saving change;
  midnight; showing a date to someone in another time zone.

## Actions and timing

- Double-click every submit button; press Enter twice; click again while it is loading.
- Back after a successful submit, then submit again. Reload in the middle of a multi-step flow.
- The same record open in two tabs: change it in one, then in the other.
- Deep links: open step 3 of a flow directly; open an item that was deleted; an id that does not exist.
- Leave a form half-filled and navigate away: is there a warning, and is anything lost?
- Wait until the session expires, then act. Log out in one tab, act in another.
- Very fast typing in a search box with suggestions: do old results overwrite new ones?

## Network and data

- A slow connection (DevTools Network throttling, or a delayed route in Playwright): are there loading
  states, and can things be pressed twice meanwhile?
- Offline, then back online: is the user told, and is work kept?
- A failing API (block one request in DevTools, or return a 500 from a Playwright route): is there an
  error message, and a way to retry?
- A brand-new account with no data; an account with thousands of items; a very long name or title.
- Uploads: an empty file, a huge file, the wrong type renamed to the right extension, a name with spaces
  and accents, two uploads at once, cancelling halfway.

## Screens and input methods

- Widths: 360 or 390 (phone), 768 (tablet), 1280, 1920. Landscape on a phone.
- Zoom to 200%; the browser's larger text setting.
- Keyboard only: Tab through the whole flow, Enter and Space to activate, Escape to close.
- Touch: no hover available; targets big enough; swipes that conflict with scrolling.
- Dark theme, high contrast mode, reduced motion if the app supports them.
- Other browsers: Firefox and Safari behave differently with dates, forms and scrolling.

## Permissions and privacy

- Open an admin page's address as a normal user; call its API directly.
- Change an id in the address (`/orders/1042` to `/orders/1041`): do you see someone else's data?
- Do error pages or messages show stack traces, queries, internal paths or other users' details?
- After logging out, does Back show private pages from the cache?

## Things to check after every action

- The visible result is right, and still right after a reload.
- It happened once (no second order, email or charge), and nothing else changed (other records, another
  user's data).
- No errors in the console; no failed requests in the Network panel.
- The address, page title and Back button make sense.
- Focus lands somewhere sensible (on the new content, the error, or the dialog).
- Any email, notification or export the action should produce, actually produced and correct.
