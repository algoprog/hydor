# A page of mockups to compare (tested)

Three phone-sized options side by side, stacked on a narrow screen. Each option is pickable: a
click puts "Order page: A · A list of today's bakes" in the user's message box (from `data-group`
and `data-choice`), and the kit marks it as selected. Colours come from the page kit's variables
(the app's theme); replace them with the product's own colours when it has a brand. Fallbacks after
each `var()` keep it readable when opened on its own.

```html
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order page: three directions</title>
<style>
.options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); gap: 16px; margin-top: 14px; }
.option { border: 1px solid var(--n-line, #ddd); border-radius: var(--n-radius, 12px); background: var(--n-card, #fff); padding: 14px; }
.option > h2 { margin: 0 0 2px; font-size: 16px; }
.option > p { margin: 0 0 12px; color: var(--n-muted, #666); font-size: 13.5px; }
/* the device frame: about 360 px for a phone */
.phone { max-width: 360px; margin: 0 auto; border: 1px solid var(--n-line, #ddd); border-radius: 22px; overflow: hidden;
         background: var(--n-bg, #f6f6f6); font-size: 14px; }
.bar { padding: 12px 14px; background: var(--n-card, #fff); border-bottom: 1px solid var(--n-line, #ddd); font-weight: 600;
       display: flex; justify-content: space-between; }
.body { padding: 12px 14px; display: grid; gap: 10px; }
.item { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px;
        background: var(--n-card, #fff); border: 1px solid var(--n-line, #ddd); border-radius: 10px; }
.item small, .muted { color: var(--n-muted, #666); }
.btn { border: 0; border-radius: 8px; padding: 7px 12px; background: var(--n-accent, #333); color: var(--n-accent-fg, #fff);
       font: inherit; font-weight: 600; white-space: nowrap; }
.btn.ghost { background: transparent; color: var(--n-accent, #333); border: 1px solid var(--n-accent, #333); }
.out { opacity: .55; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.card { background: var(--n-card, #fff); border: 1px solid var(--n-line, #ddd); border-radius: 10px; overflow: hidden; }
.pic { aspect-ratio: 4/3; background: var(--n-soft, #eee); display: grid; place-items: center; color: var(--n-muted, #666); font-size: 12px; }
.card .t { padding: 8px 10px; }
.field { display: grid; gap: 4px; font-size: 13px; }
.field .input { background: var(--n-card, #fff); border: 1px solid var(--n-line, #ddd); border-radius: 8px; padding: 8px 10px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--n-line, #ddd); border-radius: 999px; padding: 4px 10px; background: var(--n-card, #fff); font-size: 13px; }
.chip.on { border-color: var(--n-accent, #333); color: var(--n-accent, #333); font-weight: 600; }
</style></head>
<body class="n-page">
<h1>Ordering from Lisbon Bakes: three directions</h1>
<p class="n-muted">The same bakes and prices in each, on a phone. Click the one you prefer, or tell me what to take from each.</p>
<div class="options" data-group="Order page">
  <section class="option" data-choice="A · A list of today's bakes">
    <h2>A · A list of today's bakes</h2>
    <p>Fast for regulars: everything on one screen, prices and stock at a glance.</p>
    <div class="phone">
      <div class="bar">Today, Tue 3 Nov <span class="muted">Basket (2)</span></div>
      <div class="body">
        <div class="item"><div>Sourdough loaf, 750 g<br><small>€4.50 · 6 left</small></div><button class="btn">Add</button></div>
        <div class="item"><div>Cardamom bun<br><small>€3.20 · 14 left</small></div><button class="btn">Add</button></div>
        <div class="item out"><div>Rye with seeds, 1 kg<br><small>€5.10 · sold out, back Thursday</small></div><button class="btn ghost">Notify me</button></div>
        <div class="item"><div>Pastel de nata<br><small>€1.60 · 30 left</small></div><button class="btn">Add</button></div>
        <div class="muted">Pick up 07:30 to 13:00 at Rua da Prata 112.</div>
      </div>
    </div>
  </section>
  <section class="option" data-choice="B · Picture cards">
    <h2>B · Picture cards</h2>
    <p>Tempting for new customers; fewer items per screen, more scrolling.</p>
    <div class="phone">
      <div class="bar">Lisbon Bakes <span class="muted">Basket (2)</span></div>
      <div class="body">
        <div class="cards">
          <div class="card"><div class="pic">photo: sourdough</div><div class="t">Sourdough loaf<br><small>€4.50</small></div></div>
          <div class="card"><div class="pic">photo: buns</div><div class="t">Cardamom bun<br><small>€3.20</small></div></div>
          <div class="card out"><div class="pic">photo: rye</div><div class="t">Rye with seeds<br><small>Sold out</small></div></div>
          <div class="card"><div class="pic">photo: nata</div><div class="t">Pastel de nata<br><small>€1.60</small></div></div>
        </div>
      </div>
    </div>
  </section>
  <section class="option" data-choice="C · Order ahead for tomorrow">
    <h2>C · Order ahead for tomorrow</h2>
    <p>For planners: choose a pick-up time first, then the bakes; nothing sells out under them.</p>
    <div class="phone">
      <div class="bar">Order for Wed 4 Nov</div>
      <div class="body">
        <div class="field">Pick-up time<div class="chips"><span class="chip">07:30</span><span class="chip on">08:00</span><span class="chip">08:30</span><span class="chip">12:00</span></div></div>
        <div class="item"><div>Sourdough loaf, 750 g<br><small>€4.50</small></div><span>− 1 +</span></div>
        <div class="item"><div>Cardamom bun<br><small>€3.20</small></div><span>− 4 +</span></div>
        <div class="field">Name for the order<span class="input">Ana Costa</span></div>
        <button class="btn">Reserve, pay at pick-up (€17.30)</button>
      </div>
    </div>
  </section>
</div>
</body></html>
```

## Variations

- **Desktop screens:** drop the `.phone` frame; give each option the full width (`.options {
  grid-template-columns: 1fr }`) so they sit one under another, each at its real size. For a quick
  overview of very wide layouts, wrap each in a container with `zoom: 0.6`.
- **Tabs instead of side by side**, when each option is long: a row of buttons that show one option
  at a time (a few lines of script), each option still carrying its `data-choice`.
- **Several screens of one flow:** a row of frames per option (sign-up, then confirmation), the
  options as rows.
- **The product's own look:** copy its colour values and font from its CSS into variables at the
  top of the page and use those instead of the kit's.

## Checklist before showing

- The options differ in structure or emphasis, not just colour.
- Content is realistic: real-looking names and numbers, one long text, one empty or sold-out case.
- Totals and counts in the mockup add up.
- Looked at it with `ui_screenshot` (viewport `both`): nothing overflows at phone width.
