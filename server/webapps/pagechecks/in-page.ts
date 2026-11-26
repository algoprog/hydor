// What is read inside a page open in the browser. The browser is handed each function's text, so each has nothing outside it but
// its arguments and `helpers`, which is put in the page first (globalThis.__pc).

export interface Helpers {
  /** `button "Save"`, `input (email)`. */
  what(el: Element): string;
  /** Drawn, and not hidden from everyone. */
  shown(el: Element): boolean;
  /** The words a person would hear for a control, or "". */
  name(el: Element): string;
  controls: string;
}

export const helpers = (): void => {
  const text = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const what = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const said = (el.getAttribute("aria-label") ?? (/^(input|select|textarea)$/.test(tag) ? "" : text(el))).trim().slice(0, 40);
    if (said) return `${tag} "${said}"`;
    const attr = el.getAttribute("name") ?? el.getAttribute("id") ?? el.getAttribute("href") ?? el.getAttribute("src") ?? el.getAttribute("class") ?? "";
    return `${tag}${el.getAttribute("type") ? `[type=${el.getAttribute("type")}]` : ""}${attr ? ` (${attr.slice(0, 50)})` : ""}`;
  };
  const shown = (el: Element): boolean => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility !== "visible") return false;
    if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    // content-visibility, a closed <details>
    return (el as HTMLElement).checkVisibility ? (el as HTMLElement).checkVisibility() : true;
  };
  const name = (el: Element): string => {
    const direct = (el.getAttribute("aria-label") ?? "").trim() || (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => text(document.getElementById(id))).join(" ").trim();
    if (direct) return direct;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    if (tag === "input" && ["submit", "button", "reset"].includes(type)) return (el.getAttribute("value") ?? (type === "button" ? "" : type)).trim();
    if (tag === "input" && type === "image") return (el.getAttribute("alt") ?? "").trim();
    if (tag === "input" || tag === "select" || tag === "textarea") {
      const labels = Array.from((el as HTMLInputElement).labels ?? []).map(text).join(" ").trim();
      return labels || (el.getAttribute("title") ?? "").trim();
    }
    const inner = text(el) || Array.from(el.querySelectorAll("img[alt], svg[aria-label], svg title, [role=img][aria-label]")).map((x) => x.getAttribute("alt") ?? x.getAttribute("aria-label") ?? text(x)).join(" ").trim();
    return inner || (el.getAttribute("title") ?? "").trim();
  };
  const controls = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=switch], [role=radio], [role=combobox], [role=menuitem], [role=tab], [role=option]";
  (globalThis as any).__pc = { what, shown, name, controls } satisfies Helpers;
};

export interface FormFact {
  action: string;
  method: string;
  multipart: boolean;
  what: string;
  fields: { name: string; type: string; value: string; options?: string[]; min?: string; max?: string; checked?: boolean; required?: boolean; accept?: string; numeric?: boolean }[];
  submit: { name: string; value: string } | null;
  password: boolean;
}

export interface ReadingFacts {
  title: string;
  lang: string;
  /** The main headings, as their words. */
  mains: string[];
  /** Every heading's level, in order, with its words. */
  headings: { level: number; words: string }[];
  /** <meta name="description">. */
  description: string;
  noAlt: string[];
  unlabelled: string[];
  unnamed: string[];
  /** `#places` the page's links jump to that are not in it. */
  missingTargets: string[];
  /** Where the page's links go, as the browser resolves them. */
  hrefs: string[];
  forms: FormFact[];
  referrerMeta: boolean;
  hasPassword: boolean;
}

export const readingFacts = (): ReadingFacts => {
  const h: Helpers = (globalThis as any).__pc;
  const all = Array.from(document.querySelectorAll(h.controls)).filter(h.shown);
  const isField = (el: Element) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !["submit", "button", "reset", "image"].includes((el.getAttribute("type") ?? "").toLowerCase());
  const headings = Array.from(document.querySelectorAll('h1, [role=heading][aria-level="1"]')).filter(h.shown);
  const pictures = [
    ...Array.from(document.querySelectorAll("img")).filter((i) => h.shown(i) && !i.hasAttribute("alt") && !i.getAttribute("aria-label") && !["presentation", "none"].includes(i.getAttribute("role") ?? "")),
    ...Array.from(document.querySelectorAll('svg[role=img], [role=img]:not(img):not(svg), input[type=image]')).filter((e) => h.shown(e) && h.name(e) === "" && !e.querySelector(":scope > title")),
  ];
  const targets = Array.from(document.querySelectorAll("a[href]"))
    .map((a) => a.getAttribute("href") ?? "")
    .filter((x) => x.startsWith("#") && x.length > 1 && !x.startsWith("#/") && !x.startsWith("#!"))
    .map((x) => x.slice(1));
  const forms: FormFact[] = Array.from(document.forms).map((f) => {
    const els = Array.from(f.elements) as HTMLInputElement[];
    const button = els.find((e) => (e.tagName === "BUTTON" && (e.getAttribute("type") ?? "submit") === "submit") || e.type === "submit" || e.type === "image");
    return {
      action: new URL(button?.getAttribute("formaction") || f.getAttribute("action") || location.href, document.baseURI).href,
      method: (button?.getAttribute("formmethod") || f.getAttribute("method") || "get").toLowerCase(),
      multipart: /multipart/i.test(f.getAttribute("enctype") ?? ""),
      what: `form ${button ? `"${(button.textContent || button.value || "").replace(/\s+/g, " ").trim().slice(0, 40)}"` : f.getAttribute("id") ? `#${f.getAttribute("id")}` : "without a button"}`,
      fields: els
        .filter((e) => e.name && !["submit", "button", "reset", "image", "fieldset"].includes(e.type) && e.tagName !== "BUTTON" && !e.disabled)
        .map((e) => ({ name: e.name, type: e.type, value: e.value, ...(e.tagName === "SELECT" ? { options: Array.from((e as unknown as HTMLSelectElement).options).map((o) => o.value) } : {}), ...(e.min ? { min: e.min } : {}), ...(e.max ? { max: e.max } : {}), ...(e.type === "checkbox" || e.type === "radio" ? { checked: e.checked } : {}), ...(e.required ? { required: true } : {}), ...(e.accept ? { accept: e.accept } : {}), ...(/^(numeric|decimal)$/.test(e.inputMode) || e.pattern?.startsWith("[0-9") ? { numeric: true } : {}) })),
      submit: button?.name ? { name: button.name, value: button.value } : null,
      password: els.some((e) => e.type === "password"),
    };
  });
  return {
    title: document.title.trim(),
    lang: (document.documentElement.getAttribute("lang") ?? "").trim(),
    mains: headings.map((x) => (x.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60)),
    headings: Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]"))
      .filter(h.shown)
      .map((x) => ({ level: Number(x.getAttribute("aria-level") ?? (/^H[1-6]$/.test(x.tagName) ? x.tagName[1] : 2)), words: (x.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40) })),
    description: (document.querySelector('meta[name="description" i]')?.getAttribute("content") ?? "").trim(),
    noAlt: pictures.map(h.what),
    unlabelled: all.filter((e) => isField(e) && h.name(e) === "").map(h.what),
    unnamed: all.filter((e) => !isField(e) && h.name(e) === "").map(h.what),
    missingTargets: [...new Set(targets)].filter((id) => {
      let key = id;
      try {
        key = decodeURIComponent(id);
      } catch {}
      return !document.getElementById(key) && !document.getElementsByName(key).length && key !== "top";
    }),
    hrefs: [...new Set(Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href], area[href]")).filter((a) => !a.hasAttribute("download")).map((a) => a.href))],
    forms,
    referrerMeta: !!document.querySelector('meta[name="referrer" i]'),
    hasPassword: !!document.querySelector("input[type=password]"),
  };
};

export interface PhoneFacts {
  scrollWidth: number;
  viewportTag: boolean;
  /** What reaches past the right edge. */
  wide: string[];
  small: { what: string; px: number }[];
}

export const phoneFacts = (width: number, textMin: number): PhoneFacts => {
  const h: Helpers = (globalThis as any).__pc;
  const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0, window.innerWidth);
  const wide: Element[] = [];
  if (scrollWidth > width + 1)
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= width + 1 || !h.shown(el)) continue;
      // inside something that scrolls or cuts off by itself, it does not widen the page
      let boxed = false;
      for (let up = el.parentElement; up && up !== document.body && up !== document.documentElement; up = up.parentElement)
        if (getComputedStyle(up).overflowX !== "visible" && up.getBoundingClientRect().right <= width + 1) boxed = true;
      if (!boxed && !wide.some((w) => w.contains(el))) wide.push(el);
    }
  const small = new Map<Element, number>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !(n.textContent ?? "").trim() || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|SUP|SUB)$/.test(el.tagName) || el.closest("sup, sub, svg")) continue;
    const s = getComputedStyle(el);
    const px = parseFloat(s.fontSize);
    if (px >= textMin - 0.1 || !h.shown(el) || Number(s.opacity) === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || r.right < 0) continue; // for screen readers only
    small.set(el, Math.round(px * 10) / 10);
  }
  return {
    scrollWidth,
    viewportTag: !!document.querySelector('meta[name="viewport" i]'),
    wide: wide.slice(0, 5).map((e) => `${h.what(e)}, ${Math.round(e.getBoundingClientRect().width)} px wide`),
    small: [...small].slice(0, 20).map(([e, px]) => ({ what: h.what(e), px })),
  };
};

/**
 * The controls that can be tapped, each with the size of the place where a tap reaches it, measured by asking the browser what is at
 * a point (elementFromPoint), going out from the middle until something else is there: a hit area made bigger than the drawn box (a
 * pseudo-element, a label round a checkbox) counts, and a small box inside a bigger field does not. Each is scrolled to the middle of
 * the screen first; one still cut by the edge of the screen is as big as it is drawn, not as big as what shows of it. The boxes (for
 * the room between them) are all taken first, at the top of the page.
 */
export const tapTargets = (min: number) => {
  const h: Helpers = (globalThis as any).__pc;
  const out: { what: string; width: number; height: number; iconOnly: boolean; inline?: boolean; asBrowser?: boolean; layer: number; box: { x: number; y: number; width: number; height: number } }[] = [];
  // A point beyond the edge of the screen cannot be asked about (elementFromPoint answers nothing there): such a point counts when the
  // nearest point on the screen reaches the target and the point is inside the target's drawn box.
  const hits = (target: Element, x: number, y: number) => {
    const sx = Math.min(Math.max(x, 0), innerWidth - 1);
    const sy = Math.min(Math.max(y, 0), innerHeight - 1);
    const at = document.elementFromPoint(sx, sy);
    if (at === null || !target.contains(at)) return false;
    if (sx === x && sy === y) return true;
    const box = target.getBoundingClientRect();
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  };
  // The size the browser gives it by itself: a copy with none of the page's styles is as big.
  const asBrowser = (el: Element): boolean => {
    if (!/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) return false;
    const copy = el.cloneNode(true) as HTMLElement;
    for (const a of ["id", "name", "class", "style", "width", "height", "size"]) copy.removeAttribute(a);
    const mine = el.getBoundingClientRect();
    copy.style.cssText = "all: revert !important";
    document.body.appendChild(copy);
    const plain = copy.getBoundingClientRect();
    copy.remove();
    return Math.abs(plain.width - mine.width) <= 1 && Math.abs(plain.height - mine.height) <= 1;
  };
  const layers: Element[] = [];
  const layerOf = (el: Element): number => {
    for (let up: Element | null = el; up && up !== document.body && up !== document.documentElement; up = up.parentElement)
      if (/^(fixed|sticky)$/.test(getComputedStyle(up).position)) return layers.indexOf(up) >= 0 ? layers.indexOf(up) + 1 : layers.push(up);
    return 0;
  };
  const started = { x: scrollX, y: scrollY };
  scrollTo(0, 0);
  const seen = new Set<Element>();
  const targets: { el: Element; target: Element; box: { x: number; y: number; width: number; height: number }; layer: number }[] = [];
  for (const el of Array.from(document.querySelectorAll(h.controls))) {
    if (targets.length >= 300) break;
    if (!h.shown(el) || (el as HTMLButtonElement).disabled || el.getAttribute("role") === "spinbutton") continue;
    // a checkbox, radio or switch is hit by the label that holds it, too
    const isTick = (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) || ["checkbox", "radio", "switch"].includes(el.getAttribute("role") ?? "");
    const target: Element = isTick ? (el.closest("label") ?? (el as HTMLInputElement).labels?.[0] ?? el) : el;
    if (seen.has(target)) continue;
    seen.add(target);
    const r = target.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || (r.width <= 1 && r.height <= 1)) continue; // visually hidden
    targets.push({ el, target, box: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }, layer: layerOf(target) });
  }
  for (const { el, target, box, layer } of targets) {
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    const r = target.getBoundingClientRect();
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue; // off the screen for good (a closed drawer)
    const name = h.what(target);
    const words = (target.textContent ?? "").trim();
    const textual = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    const iconOnly = !textual && (words.length <= 1 || !/[\p{L}\p{N}]{2}/u.test(words));
    // a link inside a sentence is exempt: it is inline in text that goes on around it
    if (target instanceof HTMLAnchorElement && getComputedStyle(target).display === "inline" && target.parentElement && target.parentElement.textContent!.trim() !== target.textContent!.trim()) {
      out.push({ what: name, width: r.width, height: r.height, iconOnly, inline: true, layer, box });
      continue;
    }
    // a link split over lines is measured on its first
    const line = target.getClientRects()[0] ?? r;
    const cx = line.left + line.width / 2;
    const cy = line.top + line.height / 2;
    const reach = (dx: number, dy: number) => {
      let n = 0;
      while (n < min && hits(target, cx + dx * n, cy + dy * n)) n++;
      return n;
    };
    // both ways from the middle, which is counted once
    const across = (a: number, b: number) => Math.max(0, a + b - 1);
    let height = across(reach(0, -1), reach(0, 1));
    if (height === 0) continue; // not reachable by a tap at all now (covered, or pointer-events: none)
    let width = across(reach(-1, 0), reach(1, 0));
    // a control reached over most of its drawn box is as big as it is drawn
    if ((line.height >= min && height >= line.height * 0.85) || Math.abs(height - line.height) <= 1.5) height = line.height;
    if ((line.width >= min && width >= line.width * 0.85) || Math.abs(width - line.width) <= 1.5 || (width >= 2 * min - 1 && line.width > width)) width = line.width;
    if (height < min) {
      // a control that fills a bigger field is that field's
      for (let up = target.parentElement, depth = 0; up && depth < 3; up = up.parentElement, depth++) {
        const f = up.getBoundingClientRect();
        if (f.height >= min - 0.5 && (textual || (f.height <= min + 12 && r.height >= f.height * 0.85)) && f.left <= r.left + 1 && f.right >= r.right - 1) {
          height = f.height;
          break;
        }
      }
    }
    out.push({ what: name, width, height, iconOnly, ...(asBrowser(el) ? { asBrowser: true } : {}), layer, box });
  }
  scrollTo(started.x, started.y);
  return out;
};

/**
 * What stays covered by something fixed wherever the page is scrolled to: the end of a page under a bar at the bottom, the start under
 * a header with no room left for it, or a whole screen under a box that does not go away.
 */
export const hiddenBehindFixed = () => {
  const h: Helpers = (globalThis as any).__pc;
  const pinned = (el: Element | null): Element | null => {
    for (let up = el; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
      const p = getComputedStyle(up).position;
      if (p === "fixed" || p === "sticky") return up;
    }
    return null;
  };
  if (!Array.from(document.querySelectorAll("body *")).some((e) => /^(fixed|sticky)$/.test(getComputedStyle(e).position))) return [];
  const coveredBy = (el: Element): Element | null => {
    const r = el.getClientRects()[0];
    if (!r) return null;
    let by: Element | null = null;
    // covered when the middle and both ends of its first line are
    for (const f of [0.15, 0.5, 0.85]) {
      const x = r.left + r.width * f;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
      const at = document.elementFromPoint(x, y);
      if (!at || el.contains(at) || at.contains(el)) return null;
      const p = pinned(at);
      if (!p || p.contains(el)) return null;
      by = p;
    }
    return by;
  };
  const out: { what: string; by: string }[] = [];
  const started = { x: scrollX, y: scrollY };
  const important = Array.from(document.querySelectorAll(`${h.controls}, h1, h2, h3, p, li, td, th, label, img, output`)).filter((e) => h.shown(e) && !pinned(e) && e.getBoundingClientRect().width > 2 && e.getBoundingClientRect().height > 2);
  for (const el of important.slice(0, 500)) {
    if (out.length >= 8) break;
    let by: Element | null = null;
    let always = true;
    for (const block of ["center", "end", "start"] as const) {
      el.scrollIntoView({ block, inline: "nearest", behavior: "instant" });
      const c = coveredBy(el);
      if (!c) {
        always = false;
        break;
      }
      by = c;
    }
    if (always && by) out.push({ what: h.what(el), by: h.what(by) });
  }
  scrollTo(started.x, started.y);
  return out;
};

/** Stills the page for pictures of it: nothing fading, moving or blinking. A constructed sheet, which a content policy does not stop. */
export const still = (): void => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync("*, *::before, *::after { transition: none !important; animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; caret-color: transparent !important; scroll-behavior: auto !important; }");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
};

/** Takes the words away (`on`) or brings them back, to see what is behind them. */
export const hideWords = (on: boolean): Promise<void> => {
  const g = globalThis as any;
  if (on) {
    g.__pcHidden = new CSSStyleSheet();
    g.__pcHidden.replaceSync("*, *::before, *::after, ::marker, ::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; -webkit-text-stroke-color: transparent !important; } svg text { fill: transparent !important; stroke: transparent !important; }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, g.__pcHidden];
  } else document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== g.__pcHidden);
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
};

export interface TextRun {
  what: string;
  words: string;
  /** The colour of the words, with how solid they are drawn (their own, times every opacity above them). */
  color: [number, number, number, number];
  px: number;
  weight: number;
  /** Their lines, on the screen now. */
  boxes: { x: number; y: number; width: number; height: number }[];
}

/**
 * Turns on (or back off) the dark look a page keeps in a class or an attribute of <html>, as many apps' own switch does. Gives
 * nothing back: whether the page really turned dark is seen in its picture.
 */
export const darkSwitch = (on: boolean): Promise<void> => {
  const root = document.documentElement;
  const g = globalThis as any;
  const names = ["data-theme", "data-bs-theme", "data-mode"];
  if (on) {
    g.__pcDark = { had: root.classList.contains("dark"), was: names.map((n) => root.getAttribute(n)) };
    root.classList.add("dark");
    for (const n of names) root.setAttribute(n, "dark");
  } else if (g.__pcDark) {
    root.classList.toggle("dark", g.__pcDark.had);
    names.forEach((n, i) => (g.__pcDark.was[i] === null ? root.removeAttribute(n) : root.setAttribute(n, g.__pcDark.was[i])));
  }
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
};

/** The words on the screen now and their colours; each is read once, on the first screen it is whole on. */
export const textRuns = (): TextRun[] => {
  const h: Helpers = (globalThis as any).__pc;
  const g = globalThis as any;
  const done: WeakSet<Node> = (g.__pcRead ??= new WeakSet<Node>());
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const pen = canvas.getContext("2d", { willReadFrequently: true })!;
  // any way of writing a colour (rgb, oklch, color()) as the browser draws it
  const rgba = (css: string): [number, number, number, number] => {
    pen.clearRect(0, 0, 1, 1);
    pen.fillStyle = "#000";
    pen.fillStyle = css;
    pen.fillRect(0, 0, 1, 1);
    const d = pen.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const out: TextRun[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n && out.length < 200; n = walker.nextNode()) {
    const el = n.parentElement;
    const words = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!el || done.has(n) || !words || !/[\p{L}\p{N}]/u.test(words) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName)) continue;
    // greyed-out controls are not asked to be readable
    if (el.closest(":disabled, [aria-disabled=true], svg") || !h.shown(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const boxes = Array.from(range.getClientRects()).filter((r) => r.width > 2 && r.height > 4 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth);
    if (!boxes.length) continue;
    const at = document.elementFromPoint(boxes[0].left + boxes[0].width / 2, boxes[0].top + boxes[0].height / 2);
    if (!at || !(el === at || el.contains(at) || at.contains(el))) continue; // under something else now
    done.add(n);
    const s = getComputedStyle(el);
    let opacity = 1;
    for (let up: Element | null = el; up; up = up.parentElement) opacity *= Number(getComputedStyle(up).opacity);
    const color = rgba(s.getPropertyValue("-webkit-text-fill-color") || s.color);
    color[3] *= opacity;
    if (color[3] < 0.05) continue; // not drawn in a colour (a gradient through the letters): not judged
    out.push({ what: h.what(el), words: words.slice(0, 40), color, px: parseFloat(s.fontSize), weight: Number(s.fontWeight) || 400, boxes: boxes.slice(0, 3).map((r) => ({ x: r.left, y: r.top, width: r.width, height: r.height })) });
  }
  return out;
};

export const forgetRuns = (): void => {
  (globalThis as any).__pcRead = new WeakSet<Node>();
};

export const pageSize = () => ({ height: Math.max(document.documentElement.scrollHeight, innerHeight), view: innerHeight, width: innerWidth });
export const scrollToY = (y: number): Promise<number> => {
  scrollTo({ top: y, left: 0, behavior: "instant" });
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(scrollY))));
};

/** Goes down the whole page, so that what is loaded only when it is reached is. */
export const scrollThrough = async (): Promise<void> => {
  for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 30_000); y += innerHeight) {
    scrollTo({ top: y, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 40));
  }
  scrollTo({ top: 0, behavior: "instant" });
};

export const brokenPictures = (): string[] => {
  const h: Helpers = (globalThis as any).__pc;
  return Array.from(document.images)
    .filter((i) => (i.getAttribute("src") ?? i.getAttribute("srcset")) && i.complete && i.naturalWidth === 0 && h.shown(i))
    .map((i) => {
      const at = new URL(i.currentSrc || i.getAttribute("src") || "", location.href);
      return `picture ${(at.origin === location.origin ? at.pathname + at.search : at.href).slice(0, 100)}`;
    });
};

/** The control the keyboard is on now: where to take its picture, and whether it has been there before. */
export const focused = () => {
  const h: Helpers = (globalThis as any).__pc;
  const g = globalThis as any;
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || el === document.documentElement) return null;
  const seen: Element[] = (g.__pcFocused ??= []);
  const before = seen.indexOf(el);
  if (before < 0) seen.push(el);
  const same = g.__pcLast === el;
  g.__pcLast = el;
  const r0 = el.getBoundingClientRect();
  if (r0.top < 8 || r0.bottom > innerHeight - 8) el.scrollIntoView({ block: "center", behavior: "instant" });
  // a tick box drawn by its label shows focus on the label
  let box = el.getBoundingClientRect();
  const label = (el as HTMLInputElement).labels?.[0];
  if (label && (box.width < 4 || box.height < 4 || Number(getComputedStyle(el).opacity) === 0)) box = label.getBoundingClientRect();
  const x = Math.max(0, box.left - 10);
  const y = Math.max(0, box.top - 10);
  const clip = { x: x + scrollX, y: y + scrollY, width: Math.max(0, Math.min(innerWidth, box.right + 10) - x), height: Math.max(0, Math.min(innerHeight, box.bottom + 10) - y) };
  return { what: h.what(el), again: before >= 0, same, first: before === 0, inDialog: !!el.closest("dialog, [role=dialog], [role=alertdialog], [aria-modal=true]"), frame: el.tagName === "IFRAME", clip };
};

export const blurNow = (): Promise<void> => {
  (document.activeElement as HTMLElement | null)?.blur();
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
};
export const focusAgain = (): Promise<void> => {
  const seen: HTMLElement[] = (globalThis as any).__pcFocused ?? [];
  seen[seen.length - 1]?.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
  return new Promise((r) => requestAnimationFrame(() => r()));
};

/**
 * What a mouse can press and the keyboard cannot reach: something with a click of its own (an onclick, a listener marked by the
 * checker, or the pointing hand) that takes no focus, has nothing in it that does and is in nothing that does.
 */
export const mouseOnly = (): string[] => {
  const h: Helpers = (globalThis as any).__pc;
  const keys = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable=true], audio[controls], video[controls]';
  const found: Element[] = [];
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    const s = getComputedStyle(el);
    const handler = el.hasAttribute("data-pc-click") || el.hasAttribute("onclick") || typeof (el as HTMLElement).onclick === "function";
    const hand = s.cursor === "pointer" && el.parentElement !== null && getComputedStyle(el.parentElement).cursor !== "pointer";
    if (!handler && !hand) continue;
    if (el.closest(keys) || el.closest("label") || el.querySelector(keys) || !h.shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    // a box that fills the screen (a backdrop that closes on a click) has Escape or a button of its own
    if (r.width >= innerWidth * 0.95 && r.height >= innerHeight * 0.95) continue;
    if (!found.some((f) => f.contains(el))) found.push(el);
  }
  return found.slice(0, 12).map(h.what);
};
