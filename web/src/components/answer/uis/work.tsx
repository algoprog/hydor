// The answer UIs for work and business (invoices, review findings, action items, job openings, QR codes…): their views, by name (shared/answer-ui/work.ts has what each takes).
import { useMemo, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  CircleHelp,
  Clock,
  Copy as CopyIcon,
  ExternalLink,
  Feather,
  FileDown,
  FileImage,
  FileCode2,
  Globe,
  House,
  Info,
  Link2,
  Mail,
  OctagonX,
  Phone,
  QrCode as QrIcon,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Type,
  UserRound,
  Wifi,
} from 'lucide-react';
import { qrCode, qrPath, qrSvg, type QrCode, type QrLevel } from '@shared/qr';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { CodeBlock } from '../../Markdown';
import { cx } from '../../ui';
import { arr, Ask, Avatar, Btn, Card, Chip, Copy, download, fmtDate, fmtMoney, fmtNum, Head, hostOf, initials, isObj, Md, Meter, num, obj, Pic, Section, Seg, str, textOf, TONE, useKept, usePicOk, words, yes, type AnswerUiView, type Data, type Tone } from '../kit';

// ---- shared by the views below ----------------------------------------------------------------------------------------

const lang = () => LOCALE ?? (typeof navigator !== 'undefined' ? navigator.language : 'en');

/** A day written YYYY-MM-DD (perhaps with a time after it): that day at noon; null when it is not one. */
function dayOf(v: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v).trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[3]) ? null : d;
}

/** Whole days from today to a day: 0 today, 1 tomorrow, -1 yesterday. */
function daysFromToday(d: Date): number {
  const t = new Date();
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12).getTime()) / 86_400_000);
}

/** Days from today in words: "in 4 days", "yesterday", "3 weeks ago". */
function relDays(days: number): string {
  try {
    const rtf = new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' });
    if (Math.abs(days) < 14) return rtf.format(days, 'day');
    if (Math.abs(days) < 60) return rtf.format(Math.round(days / 7), 'week');
    return rtf.format(Math.round(days / 30), 'month');
  } catch {
    return '';
  }
}

/** Markdown as plain words (for the message box and plain text): no stars, backticks or link addresses. */
const plainMd = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .trim();
/** The same on one line. */
const plainLine = (s: string) => plainMd(s).replace(/\s*\n+\s*/g, ' ');

/** A name fit for a file: letters, digits, dots and dashes. */
const fileName = (s: string, fallback: string) =>
  s
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || fallback;

/** Saves a file made here (a picture). */
function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/** A button with words that copies text, and says so for a moment. */
function CopyBtn({ text, children }: { text: string | (() => string); children: ReactNode }) {
  const [ok, setOk] = useState(false);
  return (
    <Btn
      icon={ok ? <Check size={14} className="text-ok" /> : <CopyIcon size={13} />}
      onClick={() => {
        void copyText(typeof text === 'function' ? text() : text);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
    >
      {children}
    </Btn>
  );
}

/** A small square button with an icon (save, start over), as the other UIs have. */
function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className="grid h-7 w-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
      {children}
    </button>
  );
}

/** Text in Markdown with its lines kept (an address, bank details): each line its own. */
function Lines({ text, className }: { text: unknown; className?: string }) {
  const lines = str(text)
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return null;
  return (
    <div className={className}>
      {lines.map((l, i) => (
        <Md key={i} text={l} inline className="block" />
      ))}
    </div>
  );
}

const TONE_TEXT: Record<Tone, string> = { good: 'text-ok', warn: 'text-warn', bad: 'text-err', info: 'text-info', accent: 'text-accent', neutral: 'text-fg-3' };

// ---- an invoice, a quote or a receipt ---------------------------------------------------------------------------------

type InvoiceKind = 'invoice' | 'quote' | 'receipt';

/** How many decimals a currency's amounts take (2 for most, 0 for yen); 2 for a sign or nothing. */
function moneyDigits(currency: string): number {
  if (!/^[A-Za-z]{3}$/.test(currency)) return 2;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** A tax rate as written on a bill: up to three decimals (8.625). */
const rateText = (r: number) => fmtNum(r, { maximumFractionDigits: 3 });

interface InvoiceLine {
  description: string;
  qty: number;
  price: number;
  rate: number;
  amount: number;
}

/** The sums: each line, the subtotal, the discount, the tax at each rate (on what is left after the discount) and the total. */
function invoiceSums(data: Data) {
  const currency = str(data.currency).trim() || 'USD';
  const digits = moneyDigits(currency);
  const round = (x: number) => {
    const f = 10 ** digits;
    return Math.round((x + Math.sign(x) * Number.EPSILON) * f) / f;
  };
  const taxAll = num(data.tax ?? data.tax_rate ?? data.vat) ?? 0;
  const lines: InvoiceLine[] = arr(data.items ?? data.lines)
    .map((it) => (isObj(it) ? it : { description: str(it) }))
    .map((it) => {
      const qty = num(it.qty ?? it.quantity ?? it.hours) ?? 1;
      const total = num(it.amount ?? it.total);
      const price = num(it.unit_price ?? it.price ?? it.rate ?? it.unitPrice) ?? (total !== null && qty ? total / qty : 0);
      return { description: textOf(it, 'description', 'name', 'item', 'title'), qty, price, rate: num(it.tax ?? it.vat) ?? taxAll, amount: round(qty * price) };
    })
    .filter((l) => l.description || l.amount);
  const subtotal = round(lines.reduce((m, l) => m + l.amount, 0));
  const off = data.discount;
  const discount = Math.min(Math.max(0, subtotal), Math.max(0, typeof off === 'string' && /%\s*$/.test(off) ? round((subtotal * (num(off) ?? 0)) / 100) : (num(off) ?? 0)));
  const keep = subtotal > 0 ? 1 - discount / subtotal : 1;
  const byRate = new Map<number, number>();
  for (const l of lines) if (l.rate) byRate.set(l.rate, (byRate.get(l.rate) ?? 0) + l.amount * keep);
  const taxes = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, base]) => ({ rate, amount: round((base * rate) / 100) }));
  const total = round(subtotal - discount + taxes.reduce((m, t) => m + t.amount, 0));
  const money = (n: number) => fmtMoney(n, currency, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return { currency, lines, subtotal, discount, taxes, total, money, mixed: new Set(lines.map((l) => l.rate)).size > 1 };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** An agent's Markdown as HTML for the saved page: bold, italics, code and links, its lines kept. */
const mdHtml = (s: string) =>
  esc(s.trim())
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t: string, u: string) => (/^(https?:|mailto:)/i.test(u) ? `<a href="${u}">${t}</a>` : t))
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a: string, b: string) => `<strong>${a ?? b}</strong>`)
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\r?\n/g, '<br>');

function Party({ label, p }: { label: string; p: Data }) {
  const name = textOf(p, 'name', 'company', 'title');
  const email = str(p.email).trim();
  const taxId = str(p.tax_id ?? p.vat ?? p.vat_id ?? p.taxId).trim();
  if (!name && !str(p.address) && !email) return null;
  return (
    <div className="min-w-0">
      <div className="aui-h4 mb-1">{label}</div>
      {name && <div className="font-semibold text-fg">{name}</div>}
      <Lines text={p.address} className="text-[13px] leading-snug text-fg-2" />
      {email && (
        <a href={`mailto:${email}`} className="block truncate text-[13px] text-accent hover:underline">
          {email}
        </a>
      )}
      {str(p.phone) && <div className="text-[13px] text-fg-2">{str(p.phone)}</div>}
      {taxId && <div className="mt-0.5 text-[12px] text-fg-3">{`${tr('Tax ID')} ${taxId}`}</div>}
    </div>
  );
}

function Invoice({ data, done }: { data: Data; done: boolean }) {
  const k = str(data.kind ?? data.type).trim().toLowerCase();
  const kind: InvoiceKind = /^(quote|quotation|estimate|offer|proposal)$/.test(k) ? 'quote' : k === 'receipt' ? 'receipt' : 'invoice';
  const kindLabel = kind === 'quote' ? tr('Quote') : kind === 'receipt' ? tr('Receipt') : tr('Invoice');
  const number = str(data.number ?? data.id ?? data.no).trim();
  const from = obj(data.from ?? data.seller ?? data.vendor);
  const to = obj(data.to ?? data.client ?? data.customer ?? data.bill_to);
  const s = invoiceSums(data);
  const issued = dayOf(data.date ?? data.issued);
  const due = dayOf(data.due ?? data.due_date ?? data.valid_until);
  const paid = kind === 'receipt' || yes(data.paid) || /^paid$/i.test(str(data.status).trim());
  const left = due ? daysFromToday(due) : null;
  const status: { tone: Tone; label: string; Icon: LucideIcon } | null = paid
    ? { tone: 'good', label: tr('Paid'), Icon: BadgeCheck }
    : kind === 'quote'
      ? left !== null && left < 0
        ? { tone: 'warn', label: tr('Expired'), Icon: Clock }
        : null
      : left !== null
        ? left < 0
          ? { tone: 'bad', label: tr('Overdue'), Icon: CircleAlert }
          : { tone: left <= 7 ? 'warn' : 'neutral', label: left === 0 ? tr('Due today') : tr('Due {0}').replace('{0}', relDays(left)), Icon: Clock }
        : data.paid === false
          ? { tone: 'neutral', label: tr('Unpaid'), Icon: Clock }
          : null;
  const dueLabel = kind === 'quote' ? tr('Valid until') : tr('Due');
  const toLabel = kind === 'quote' ? tr('Prepared for') : kind === 'receipt' ? tr('Paid by') : tr('Bill to');
  const totalLabel = paid ? tr('Total paid') : kind === 'invoice' ? tr('Total due') : tr('Total');
  const notes = str(data.notes ?? data.note);
  const payment = str(data.payment ?? data.pay);
  const title = `${kindLabel}${number ? ` ${number}` : ''}`;
  const partyText = (p: Data) =>
    [textOf(p, 'name', 'company', 'title'), ...str(p.address).split(/\r?\n/).map(plainLine), str(p.email), str(p.tax_id ?? p.vat ?? p.vat_id) ? `${tr('Tax ID')} ${str(p.tax_id ?? p.vat ?? p.vat_id)}` : '']
      .map((x) => x.trim())
      .filter(Boolean);
  const asText = () => {
    const out: string[] = [title.toUpperCase()];
    const f = partyText(from);
    const t = partyText(to);
    if (f.length) out.push('', `${tr('From')}: ${f.join(', ')}`);
    if (t.length) out.push(`${toLabel}: ${t.join(', ')}`);
    const dates = [issued ? `${tr('Issued')}: ${fmtDate(issued, 'medium')}` : '', due ? `${dueLabel}: ${fmtDate(due, 'medium')}` : ''].filter(Boolean);
    if (dates.length) out.push(dates.join(' · '));
    out.push('');
    for (const l of s.lines) out.push(`${plainLine(l.description)}: ${fmtNum(l.qty)} × ${s.money(l.price)} = ${s.money(l.amount)}${s.mixed && l.rate ? ` (${tr('Tax {0}%').replace('{0}', rateText(l.rate))})` : ''}`);
    out.push('', `${tr('Subtotal')}: ${s.money(s.subtotal)}`);
    if (s.discount > 0) out.push(`${tr('Discount')}: −${s.money(s.discount)}`);
    for (const x of s.taxes) out.push(`${tr('Tax {0}%').replace('{0}', rateText(x.rate))}: ${s.money(x.amount)}`);
    out.push(`${totalLabel}: ${s.money(s.total)}`);
    if (payment) out.push('', `${paid ? tr('Payment') : tr('How to pay')}:`, ...payment.split(/\r?\n/).map(plainLine).filter(Boolean));
    if (notes) out.push('', plainMd(notes));
    return out.join('\n');
  };
  const asPage = () => {
    const party = (label: string, p: Data) => {
      const name = textOf(p, 'name', 'company', 'title');
      const tax = str(p.tax_id ?? p.vat ?? p.vat_id).trim();
      if (!name && !str(p.address) && !str(p.email)) return '';
      return `<div class="party"><div class="label">${esc(label)}</div>${name ? `<div class="name">${esc(name)}</div>` : ''}${str(p.address) ? `<div>${mdHtml(str(p.address))}</div>` : ''}${str(p.email) ? `<div>${esc(str(p.email))}</div>` : ''}${tax ? `<div class="muted">${esc(tr('Tax ID'))} ${esc(tax)}</div>` : ''}</div>`;
    };
    const row = (label: string, value: string, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`;
    const dates = [issued ? `<div><span class="label">${esc(tr('Issued'))}</span> ${esc(fmtDate(issued, 'medium'))}</div>` : '', due ? `<div><span class="label">${esc(dueLabel)}</span> ${esc(fmtDate(due, 'medium'))}</div>` : ''].join('');
    const body = `<div class="sheet">
<header><div><h1>${esc(kindLabel)}</h1>${number ? `<div class="muted">${esc(tr('No. {0}').replace('{0}', number))}</div>` : ''}</div>${paid ? `<div class="stamp">${esc(tr('Paid'))}</div>` : ''}</header>
<div class="parties">${party(tr('From'), from)}${party(toLabel, to)}</div>
${dates ? `<div class="dates">${dates}</div>` : ''}
<table class="items"><thead><tr><th>${esc(tr('Description'))}</th><th class="num">${esc(tr('Qty'))}</th><th class="num">${esc(tr('Price'))}</th><th class="num">${esc(tr('Amount'))}</th></tr></thead><tbody>
${s.lines.map((l) => `<tr><td>${mdHtml(l.description)}${s.mixed && l.rate ? `<div class="muted">${esc(tr('Tax {0}%').replace('{0}', rateText(l.rate)))}</div>` : ''}</td><td class="num">${esc(fmtNum(l.qty))}</td><td class="num">${esc(s.money(l.price))}</td><td class="num">${esc(s.money(l.amount))}</td></tr>`).join('\n')}
</tbody></table>
<table class="totals">${row(tr('Subtotal'), s.money(s.subtotal))}${s.discount > 0 ? row(tr('Discount'), `−${s.money(s.discount)}`) : ''}${s.taxes.map((x) => row(tr('Tax {0}%').replace('{0}', rateText(x.rate)), s.money(x.amount))).join('')}${row(totalLabel, s.money(s.total), 'total')}</table>
${payment ? `<section><div class="label">${esc(paid ? tr('Payment') : tr('How to pay'))}</div><div>${mdHtml(payment)}</div></section>` : ''}
${notes ? `<section><div>${mdHtml(notes)}</div></section>` : ''}
</div>`;
    const css = `*{box-sizing:border-box}body{margin:0;padding:32px 16px;background:#f3f3f1;color:#1d1d1b;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.sheet{max-width:780px;margin:0 auto;background:#fff;padding:48px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:28px}h1{margin:0;font-size:30px;letter-spacing:-.02em}
.muted{color:#6b6b66;font-size:12.5px}.label{color:#6b6b66;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px}
.name{font-weight:600}.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:20px}.dates{display:flex;gap:32px;margin-bottom:24px}.dates .label{display:inline;margin-right:6px}
table{width:100%;border-collapse:collapse}.items th{text-align:left;color:#6b6b66;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid #d9d9d4;padding:8px 6px}
.items td{padding:10px 6px;border-bottom:1px solid #ecece8;vertical-align:top}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.items th.num{text-align:right}
.totals{width:300px;margin:16px 0 0 auto}.totals td{padding:4px 6px}.totals .total td{border-top:1px solid #d9d9d4;padding-top:10px;font-size:18px;font-weight:700}
section{margin-top:28px}a{color:inherit}code{font-family:ui-monospace,Menlo,monospace;font-size:.92em}
.stamp{border:2px solid #156b35;color:#156b35;border-radius:8px;padding:4px 14px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;transform:rotate(-6deg)}
@media (max-width:560px){.sheet{padding:24px}.parties{grid-template-columns:1fr}.totals{width:100%}}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none;padding:0}}`;
    const page = `<!doctype html>\n<html lang="${esc(lang())}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc([title, textOf(from, 'name', 'company')].filter(Boolean).join(' · '))}</title>\n<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
    download(`${fileName(`${kindLabel}-${number || textOf(to, 'name', 'company')}`, 'invoice')}.html`, 'text/html', page);
  };
  const hasParties = !!(textOf(from, 'name', 'company') || textOf(to, 'name', 'company') || str(from.address) || str(to.address));
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="aui-h3 !text-[19px]">{kindLabel}</h3>
          {number && <div className="mt-0.5 text-[13px] text-fg-3 tabular-nums">{tr('No. {0}').replace('{0}', number)}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status && (
            <Chip tone={status.tone} className="mr-1">
              <status.Icon size={12} />
              {status.label}
            </Chip>
          )}
          {done && s.lines.length > 0 && (
            <>
              <Copy text={asText} label={tr('Copy as text')} />
              <IconBtn title={tr('Save as a page to print')} onClick={asPage}>
                <FileDown size={14} />
              </IconBtn>
            </>
          )}
        </div>
      </div>
      {hasParties && (
        <div className="mt-4 grid gap-4 @md:grid-cols-2">
          <Party label={tr('From')} p={from} />
          <Party label={toLabel} p={to} />
        </div>
      )}
      {(issued || due) && (
        <dl className="m-0 mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
          {issued && (
            <div>
              <dt className="aui-h4">{tr('Issued')}</dt>
              <dd className="m-0 font-medium text-fg">{fmtDate(issued, 'medium')}</dd>
            </div>
          )}
          {due && (
            <div>
              <dt className="aui-h4">{dueLabel}</dt>
              <dd className={cx('m-0 font-medium', status?.tone === 'bad' ? 'text-err' : 'text-fg')}>
                {fmtDate(due, 'medium')}
                {!paid && left !== null && left < 0 && <span className="ml-1.5 text-[12px] font-normal">{`(${relDays(left)})`}</span>}
              </dd>
            </div>
          )}
        </dl>
      )}
      {s.lines.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className="py-1.5 pr-3 text-left text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{tr('Description')}</th>
                <th className="hidden px-2 py-1.5 text-right text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase @md:table-cell">{tr('Qty')}</th>
                <th className="hidden px-2 py-1.5 text-right text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase @md:table-cell">{tr('Price')}</th>
                <th className="py-1.5 pl-2 text-right text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{tr('Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l, i) => (
                <tr key={i} className="border-b border-line/60 align-top">
                  <td className="py-2 pr-3">
                    <Md text={l.description} inline className="text-fg" />
                    <span className="block text-[12px] text-fg-3 tabular-nums @md:hidden">{`${fmtNum(l.qty)} × ${s.money(l.price)}`}</span>
                    {s.mixed && <span className="block text-[12px] text-fg-3">{l.rate ? tr('Tax {0}%').replace('{0}', rateText(l.rate)) : tr('No tax')}</span>}
                  </td>
                  <td className="hidden px-2 py-2 text-right text-fg-2 tabular-nums @md:table-cell">{fmtNum(l.qty)}</td>
                  <td className="hidden px-2 py-2 text-right whitespace-nowrap text-fg-2 tabular-nums @md:table-cell">{s.money(l.price)}</td>
                  <td className="py-2 pl-2 text-right font-medium whitespace-nowrap text-fg tabular-nums">{s.money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="m-0 mt-3 ml-auto w-full max-w-[300px] text-[13.5px]">
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-fg-3">{tr('Subtotal')}</dt>
              <dd className="m-0 text-fg-2 tabular-nums">{s.money(s.subtotal)}</dd>
            </div>
            {s.discount > 0 && (
              <div className="flex justify-between gap-4 py-0.5">
                <dt className="text-fg-3">{tr('Discount')}</dt>
                <dd className="m-0 text-fg-2 tabular-nums">{`−${s.money(s.discount)}`}</dd>
              </div>
            )}
            {s.taxes.map((x) => (
              <div key={x.rate} className="flex justify-between gap-4 py-0.5">
                <dt className="text-fg-3">{tr('Tax {0}%').replace('{0}', rateText(x.rate))}</dt>
                <dd className="m-0 text-fg-2 tabular-nums">{s.money(x.amount)}</dd>
              </div>
            ))}
            <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-line pt-2">
              <dt className="font-semibold text-fg">{totalLabel}</dt>
              <dd className="m-0 text-[20px] font-semibold text-fg tabular-nums">{s.money(s.total)}</dd>
            </div>
          </dl>
        </div>
      )}
      {payment && (
        <div className="mt-4 rounded-xl bg-bg-1 px-3.5 py-3">
          <div className="aui-h4 mb-1">{paid ? tr('Payment') : tr('How to pay')}</div>
          <Lines text={payment} className="text-[13px] leading-relaxed text-fg-2" />
        </div>
      )}
      {notes && <Md text={notes} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- review findings ----------------------------------------------------------------------------------------------------

type Severity = 'critical' | 'major' | 'minor' | 'nit' | 'info';

const SEVERITIES: { key: Severity; tone: Tone; Icon: LucideIcon; label: () => string }[] = [
  { key: 'critical', tone: 'bad', Icon: OctagonX, label: () => tr('Critical') },
  { key: 'major', tone: 'warn', Icon: TriangleAlert, label: () => tr('Major') },
  { key: 'minor', tone: 'info', Icon: CircleAlert, label: () => tr('Minor') },
  { key: 'nit', tone: 'neutral', Icon: Feather, label: () => tr('Nitpick') },
  { key: 'info', tone: 'neutral', Icon: Info, label: () => tr('Note') },
];
const SEVERITY = Object.fromEntries(SEVERITIES.map((s) => [s.key, s])) as Record<Severity, (typeof SEVERITIES)[number]>;

/** A severity from the words reviewers use for one; minor otherwise. */
function severityOf(v: unknown): Severity {
  const s = str(v).trim().toLowerCase();
  if (/^(critical|blocker|blocking|severe|urgent|security|p0)$/.test(s)) return 'critical';
  if (/^(major|high|error|important|serious|bug|p1)$/.test(s)) return 'major';
  if (/^(nit|nits|nitpick|style|trivial|cosmetic|typo|suggestion|optional)$/.test(s)) return 'nit';
  if (/^(info|note|fyi|praise|good|positive|question|comment|kudos)$/.test(s)) return 'info';
  return 'minor';
}

/** A place in code ("src/app.ts:42", "lib/x.py"), written in the code's letters. */
const isPath = (s: string) => /^[\w@./~-]+\.[\w]{1,8}(:\d+(-\d+)?)?(:\d+)?$/.test(s.trim()) || /^[\w./-]+\/[\w./-]+$/.test(s.trim());
/** Quoted words that are code, not prose: code's signs, an indent, or a language given. */
const isCodeQuote = (q: string, lang: string, where: string) => !!lang || isPath(where) || /[{};=<>]|=>|\(\)|^\s{2,}\S/m.test(q);

interface Finding {
  i: number;
  title: string;
  sev: Severity;
  where: string;
  quote: string;
  why: string;
  fix: string;
  code: string;
  lang: string;
}

function Issues({ data, done }: { data: Data; done: boolean }) {
  const all: Finding[] = arr(data.issues ?? data.findings ?? data.items)
    .map((x) => (isObj(x) ? x : { title: str(x) }))
    .map((x, i) => ({
      i,
      title: textOf(x, 'title', 'issue', 'summary', 'name'),
      sev: severityOf(x.severity ?? x.level ?? x.priority),
      where: str(x.where ?? x.location ?? x.file ?? x.line).trim(),
      quote: str(x.quote ?? x.excerpt ?? x.snippet).replace(/^\n+|\s+$/g, ''),
      why: str(x.why ?? x.reason ?? x.detail),
      fix: str(x.fix ?? x.suggestion ?? x.recommendation),
      code: str(x.code),
      lang: str(x.lang ?? x.language),
    }))
    .filter((x) => x.title || x.why || x.quote);
  const [filter, setFilter] = useKept<string>('severity', '');
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  const counts = SEVERITIES.map((s) => ({ ...s, n: all.filter((x) => x.sev === s.key).length })).filter((s) => s.n > 0);
  const on = done && counts.some((c) => c.key === filter) ? (filter as Severity) : '';
  const shown = on ? all.filter((x) => x.sev === on) : all;
  const fixable = shown.filter((x) => x.sev !== 'info');
  const line = (x: Finding) => `${plainLine(x.title)}${x.where ? ` (${x.where})` : ''}`;
  const askOne = (x: Finding) => [`${tr('Please fix this:')} ${line(x)}`, x.quote ? `> ${x.quote.split('\n').join('\n> ')}` : '', x.fix ? `${tr('Suggested fix:')} ${plainLine(x.fix)}` : ''].filter(Boolean).join('\n');
  const askAll = () => [tr('Please fix these:'), ...fixable.map((x) => `- [${SEVERITY[x.sev].label()}] ${line(x)}${x.fix ? `: ${plainLine(x.fix)}` : ''}`)].join('\n');
  return (
    <Card>
      <Head title={data.title} sub={data.subject} aside={all.length > 1 ? <span className="text-[12px] text-fg-3 tabular-nums">{shown.length === all.length ? tr('{0} findings').replace('{0}', String(all.length)) : `${shown.length} / ${all.length}`}</span> : undefined} />
      {str(data.summary) && <Md text={data.summary} className="mb-3 text-[13.5px] text-fg-2" />}
      {counts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {counts.map((c) => {
            const active = on === c.key;
            return (
              <button
                key={c.key}
                type="button"
                disabled={!done}
                aria-pressed={active}
                onClick={() => setFilter(active ? '' : c.key)}
                title={active ? tr('Show all') : tr('Show only these')}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors disabled:cursor-default',
                  active ? cx(TONE[c.tone], 'border-current/30') : 'border-line text-fg-2 enabled:hover:bg-bg-2',
                )}
              >
                <c.Icon size={13} className={TONE_TEXT[c.tone]} />
                <span className="font-semibold text-fg tabular-nums">{c.n}</span>
                {c.label()}
              </button>
            );
          })}
        </div>
      )}
      {shown.length > 0 && (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {shown.map((x) => {
            const S = SEVERITY[x.sev];
            const isOpen = !!open[x.i];
            const more = !!(x.quote || x.why || x.fix || x.code);
            const code = isCodeQuote(x.quote, x.lang, x.where);
            return (
              <div key={x.i}>
                <button
                  type="button"
                  onClick={() => more && setOpen((o) => ({ ...o, [x.i]: !isOpen }))}
                  aria-expanded={more ? isOpen : undefined}
                  className={cx('flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors', more ? 'hover:bg-bg-1' : 'cursor-default')}
                >
                  <ChevronRight size={14} className={cx('mt-[3px] shrink-0 text-fg-3 transition-transform', isOpen && 'rotate-90', !more && 'invisible')} />
                  <S.Icon size={15} className={cx('mt-[2px] shrink-0', TONE_TEXT[S.tone])} aria-label={S.label()} />
                  <span className="min-w-0 flex-1">
                    <Md text={x.title} inline className="block text-[13.5px] leading-snug font-medium text-fg" />
                    {x.where && <span className={cx('mt-0.5 block text-[12px] break-all text-fg-3', isPath(x.where) && 'font-mono text-[11.5px]')}>{x.where}</span>}
                  </span>
                  <span className="hidden shrink-0 @md:inline-flex">
                    <Chip tone={S.tone}>{S.label()}</Chip>
                  </span>
                </button>
                {isOpen && more && (
                  <div className="space-y-2.5 px-3 pb-3.5 pl-[52px]">
                    {x.quote &&
                      (code ? (
                        <pre className="m-0 max-h-56 overflow-auto rounded-lg border border-line bg-code-bg px-3 py-2 font-mono text-[12.5px] leading-[1.55] break-words whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]">{x.quote}</pre>
                      ) : (
                        <blockquote className="m-0 border-l-2 border-line-2 pl-3 text-[13.5px] whitespace-pre-wrap text-fg-2 italic">{x.quote}</blockquote>
                      ))}
                    {x.why && (
                      <div>
                        <div className="aui-h4 mb-0.5">{tr('Why it matters')}</div>
                        <Md text={x.why} className="text-[13.5px] text-fg-2" />
                      </div>
                    )}
                    {x.fix && (
                      <div>
                        <div className="aui-h4 mb-0.5">{tr('The fix')}</div>
                        <Md text={x.fix} className="text-[13.5px] text-fg" />
                      </div>
                    )}
                    {x.code && <CodeBlock code={x.code} lang={x.lang || null} className="!my-0" />}
                    {done && x.sev !== 'info' && <Ask text={askOne(x)}>{tr('Ask to fix')}</Ask>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {done && fixable.length > 1 && (
        <div className="mt-3 flex justify-end">
          <Ask primary text={askAll()}>
            {on ? tr('Ask to fix these {0}').replace('{0}', String(fixable.length)) : tr('Ask to fix all {0}').replace('{0}', String(fixable.length))}
          </Ask>
        </div>
      )}
    </Card>
  );
}

// ---- action items ---------------------------------------------------------------------------------------------------------

type ItemStatus = 'todo' | 'doing' | 'done' | 'blocked';
type Priority = 'high' | 'medium' | 'low' | '';

function statusOf(v: unknown): ItemStatus {
  const s = str(v).trim().toLowerCase();
  if (/^(done|complete|completed|finished|closed|resolved|shipped)$/.test(s)) return 'done';
  if (/^(doing|in[ -]?progress|started|wip|active|ongoing|underway)$/.test(s)) return 'doing';
  if (/^(blocked|stuck|waiting|on[ -]hold)$/.test(s)) return 'blocked';
  return 'todo';
}
function priorityOf(v: unknown): Priority {
  const s = str(v).trim().toLowerCase();
  if (/^(high|urgent|critical|top|p0|p1)$/.test(s)) return 'high';
  if (/^(medium|normal|mid|p2)$/.test(s)) return 'medium';
  if (/^(low|minor|later|p3|p4)$/.test(s)) return 'low';
  return '';
}
const PRIORITY: Record<Exclude<Priority, ''>, { tone: Tone; label: () => string }> = {
  high: { tone: 'bad', label: () => tr('High') },
  medium: { tone: 'warn', label: () => tr('Medium') },
  low: { tone: 'neutral', label: () => tr('Low') },
};

interface ActionItem {
  i: number;
  task: string;
  owner: string;
  due: Date | null;
  status: ItemStatus;
  priority: Priority;
  note: string;
}

/** The groups by due date, in order: what is late, today's, the coming week's, later, and what has no date. */
const DUE_GROUPS = ['past', 'today', 'week', 'later', 'none'] as const;
type DueGroup = (typeof DUE_GROUPS)[number];
const dueGroup = (d: Date | null): DueGroup => {
  if (!d) return 'none';
  const n = daysFromToday(d);
  return n < 0 ? 'past' : n === 0 ? 'today' : n <= 7 ? 'week' : 'later';
};

function ActionItems({ data, done }: { data: Data; done: boolean }) {
  const items: ActionItem[] = arr(data.items ?? data.actions ?? data.tasks)
    .map((x) => (isObj(x) ? x : { task: str(x) }))
    .map((x, i) => ({
      i,
      task: textOf(x, 'task', 'text', 'title', 'action'),
      owner: textOf(x.owner ?? x.who ?? x.assignee, 'name'),
      due: dayOf(x.due ?? x.deadline ?? x.by),
      status: statusOf(x.status ?? (yes(x.done) ? 'done' : '')),
      priority: priorityOf(x.priority),
      note: str(x.note),
    }))
    .filter((x) => x.task);
  const decisions = arr(data.decisions).map((d) => textOf(d, 'text', 'decision', 'title')).filter(Boolean);
  const questions = arr(data.questions ?? data.open_questions).map((q) => textOf(q, 'text', 'question', 'title')).filter(Boolean);
  const [ticks, setTicks] = useKept<Record<number, boolean>>('ticks', {});
  const owners = items.some((x) => x.owner);
  const dues = items.some((x) => x.due);
  const [by, setBy] = useKept<'owner' | 'due'>('by', owners ? 'owner' : 'due');
  const mode: 'owner' | 'due' | '' = owners && dues ? (by === 'due' ? 'due' : 'owner') : owners ? 'owner' : dues ? 'due' : '';
  const isDone = (x: ActionItem) => (done && typeof ticks[x.i] === 'boolean' ? ticks[x.i] : x.status === 'done');
  const late = (x: ActionItem) => !!x.due && !isDone(x) && daysFromToday(x.due) < 0;
  const groups: { key: string; name: string; owner?: string; items: ActionItem[] }[] = (() => {
    if (mode === 'owner') {
      const names = [...new Set(items.map((x) => x.owner).filter(Boolean))];
      return [...names.map((o) => ({ key: o, name: o, owner: o, items: items.filter((x) => x.owner === o) })), { key: '', name: tr('No one yet'), items: items.filter((x) => !x.owner) }].filter((g) => g.items.length);
    }
    if (mode === 'due') {
      const sorted = [...items].sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) || a.i - b.i);
      return DUE_GROUPS.map((g) => {
        const list = sorted.filter((x) => dueGroup(x.due) === g);
        const name = g === 'past' ? (list.some((x) => !isDone(x)) ? tr('Overdue') : tr('Earlier')) : g === 'today' ? tr('Today') : g === 'week' ? tr('In the next 7 days') : g === 'later' ? tr('Later') : tr('No due date');
        return { key: g, name, items: list };
      }).filter((g) => g.items.length);
    }
    return [{ key: '', name: '', items }];
  })();
  const total = items.length;
  const finished = items.filter(isDone).length;
  const lateCount = items.filter(late).length;
  /** What a line of the copied list says after the task: who (unless the heading says), when, how urgent, and if it is stuck. */
  const meta = (x: ActionItem) =>
    [mode !== 'owner' && x.owner ? x.owner : '', x.due ? tr('due {0}').replace('{0}', fmtDate(x.due, 'medium')) : '', x.priority ? tr('{0} priority').replace('{0}', PRIORITY[x.priority].label().toLowerCase()) : '', x.status === 'blocked' && !isDone(x) ? tr('blocked') : ''].filter(Boolean);
  const markdown = () => {
    const out: string[] = [];
    if (str(data.title)) out.push(`## ${str(data.title)}`);
    const sub = [str(data.meeting), dayOf(data.date) ? fmtDate(dayOf(data.date), 'medium') : ''].filter(Boolean).join(' · ');
    if (sub) out.push(sub);
    for (const g of groups) {
      if (out.length) out.push('');
      if (g.name) out.push(`### ${g.name}`);
      for (const x of g.items) {
        const m = meta(x);
        out.push(`- [${isDone(x) ? 'x' : ' '}] ${x.task}${m.length ? ` (${m.join(', ')})` : ''}`);
        if (x.note) out.push(`  ${plainLine(x.note)}`);
      }
    }
    if (decisions.length) out.push('', `### ${tr('Decisions')}`, ...decisions.map((d) => `- ${d}`));
    if (questions.length) out.push('', `### ${tr('Open questions')}`, ...questions.map((q) => `- ${q}`));
    return out.join('\n');
  };
  const when = dayOf(data.date);
  const sub = [str(data.meeting), when ? fmtDate(when, 'medium') : ''].filter(Boolean).join(' · ');
  return (
    <Card>
      <Head
        title={data.title}
        sub={sub}
        aside={
          done && total > 0 ? (
            <span className="flex items-center gap-0.5">
              {Object.keys(ticks).length > 0 && (
                <IconBtn title={tr('Start over')} onClick={() => setTicks({})}>
                  <RotateCcw size={13} />
                </IconBtn>
              )}
              <Copy text={markdown} label={tr('Copy as Markdown')} />
            </span>
          ) : undefined
        }
      />
      {total > 1 && (
        <div className="mb-3 flex items-center gap-3">
          <Meter value={finished} max={total} className="flex-1" tone={finished === total ? 'good' : undefined} />
          <span className="text-[12px] whitespace-nowrap text-fg-3 tabular-nums">
            {tr('{0} of {1} done').replace('{0}', String(finished)).replace('{1}', String(total))}
            {lateCount > 0 && <span className="font-medium text-err">{` · ${tr('{0} late').replace('{0}', String(lateCount))}`}</span>}
          </span>
        </div>
      )}
      {done && owners && dues && total > 1 && (
        <Seg
          size="sm"
          className="mb-3"
          options={[
            { value: 'owner' as const, label: tr('By owner') },
            { value: 'due' as const, label: tr('By due date') },
          ]}
          value={mode === 'due' ? 'due' : 'owner'}
          onChange={setBy}
        />
      )}
      <div className={cx('grid gap-x-6 gap-y-4', groups.length > 1 && '@2xl:grid-cols-2')}>
        {groups.map((g) => (
          <section key={g.key || '-'} className="min-w-0">
            {g.name && (
              <div className="mb-1 flex items-center gap-2">
                {mode === 'owner' &&
                  (g.owner ? <Avatar name={g.owner} className="h-6 w-6 text-[10px]" /> : <CircleDashed size={18} className="shrink-0 text-fg-3" aria-hidden />)}
                <h4 className={cx('min-w-0 flex-1 truncate', mode === 'owner' ? 'text-[13.5px] font-semibold text-fg' : cx('aui-h4', g.key === 'past' && g.items.some((x) => !isDone(x)) && '!text-err'))}>{g.name}</h4>
                <span className="text-[11.5px] text-fg-3 tabular-nums">{`${g.items.filter(isDone).length}/${g.items.length}`}</span>
              </div>
            )}
            <ul className="m-0 list-none space-y-0.5 p-0">
              {g.items.map((x) => {
                const v = isDone(x);
                const lateNow = late(x);
                return (
                  <li key={x.i}>
                    <label className={cx('flex items-start gap-2.5 rounded-md px-1 py-1.5', done ? 'cursor-pointer hover:bg-bg-1' : 'cursor-default')}>
                      <input type="checkbox" checked={v} disabled={!done} onChange={() => setTicks((t) => ({ ...t, [x.i]: !v }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                      <span className="min-w-0 flex-1">
                        <Md text={x.task} inline className={cx('text-[13.5px]', v ? 'text-fg-3 line-through decoration-line-2' : 'text-fg')} />
                        {(x.due || (mode !== 'owner' && x.owner) || (!v && (x.priority || x.status === 'doing' || x.status === 'blocked'))) && (
                          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-fg-3">
                            {mode !== 'owner' && x.owner && (
                              <span className="inline-flex items-center gap-1">
                                <UserRound size={12} />
                                {x.owner}
                              </span>
                            )}
                            {x.due && (
                              <span className={cx('inline-flex items-center gap-1 tabular-nums', lateNow && 'font-medium text-err')}>
                                <CalendarDays size={12} />
                                {fmtDate(x.due, 'short')}
                                {lateNow && ` · ${tr('late')}`}
                              </span>
                            )}
                            {!v && x.status === 'doing' && <Chip tone="info">{tr('In progress')}</Chip>}
                            {!v && x.status === 'blocked' && <Chip tone="bad">{tr('Blocked')}</Chip>}
                            {!v && x.priority && <Chip tone={PRIORITY[x.priority].tone}>{PRIORITY[x.priority].label()}</Chip>}
                          </span>
                        )}
                        {x.note && <Md text={x.note} inline className="mt-0.5 block text-[12px] text-fg-3" />}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {(decisions.length > 0 || questions.length > 0) && (
        <div className={cx('mt-4 grid gap-x-6 gap-y-4 border-t border-line pt-3.5', decisions.length > 0 && questions.length > 0 && '@xl:grid-cols-2')}>
          {decisions.length > 0 && (
            <Section title={tr('Decisions')}>
              <ul className="m-0 list-none space-y-1.5 p-0">
                {decisions.map((d, i) => (
                  <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-fg-2">
                    <Check size={14} strokeWidth={2.5} className="mt-[3px] shrink-0 text-ok" />
                    <Md text={d} inline className="min-w-0" />
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {questions.length > 0 && (
            <Section title={tr('Open questions')}>
              <ul className="m-0 list-none space-y-1.5 p-0">
                {questions.map((q, i) => (
                  <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-fg-2">
                    <CircleHelp size={14} className="mt-[3px] shrink-0 text-info" />
                    <Md text={q} inline className="min-w-0" />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </Card>
  );
}

// ---- a QR code ---------------------------------------------------------------------------------------------------------------

type QrKind = 'url' | 'text' | 'wifi' | 'contact' | 'email' | 'phone';

const QR_KINDS: Record<QrKind, { Icon: LucideIcon; label: () => string }> = {
  url: { Icon: Link2, label: () => tr('Link') },
  text: { Icon: Type, label: () => tr('Text') },
  wifi: { Icon: Wifi, label: () => tr('Wi-Fi network') },
  contact: { Icon: UserRound, label: () => tr('Contact') },
  email: { Icon: Mail, label: () => tr('Email') },
  phone: { Icon: Phone, label: () => tr('Phone number') },
};

/** Wi-Fi codes escape these with a backslash. */
const wifiEsc = (s: string) => s.replace(/([\\;,":])/g, '\\$1');
/** A vCard's text escapes. */
const vcardEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** What the code holds: its kind, its text as phones read it, and what to show beside it. */
function qrContent(data: Data): { kind: QrKind; text: string; rows: { label: string; value: string; href?: string; mono?: boolean }[] } {
  const wifi = obj(data.wifi);
  const contact = obj(data.contact ?? data.card);
  const value = str(data.value ?? data.url ?? data.text ?? data.link ?? data.email ?? data.phone).trim();
  const k = str(data.kind ?? data.type).trim().toLowerCase();
  const kind: QrKind = /^(wifi|wi-fi|wlan|network)$/.test(k) || (!k && str(wifi.ssid ?? wifi.name))
    ? 'wifi'
    : /^(contact|vcard|mecard|card|person)$/.test(k) || (!k && textOf(contact, 'name'))
      ? 'contact'
      : /^(email|e-mail|mail|mailto)$/.test(k) || (!k && /^(mailto:)?[^\s@]+@[^\s@]+\.\w+$/i.test(value))
        ? 'email'
        : /^(phone|tel|telephone|call|mobile)$/.test(k) || (!k && /^(tel:)?\+?[\d\s().-]{6,}$/.test(value))
          ? 'phone'
          : /^(text|words|plain|note)$/.test(k) || (!k && value && !/^(https?:\/\/|www\.)/i.test(value))
            ? 'text'
            : 'url';
  if (kind === 'wifi') {
    const ssid = str(wifi.ssid ?? wifi.name ?? wifi.network);
    const password = str(wifi.password ?? wifi.pass ?? wifi.key);
    const raw = str(wifi.security ?? wifi.auth ?? wifi.encryption).trim().toUpperCase();
    const sec = /^(NOPASS|NONE|OPEN)$/.test(raw) || (!raw && !password) ? 'nopass' : raw === 'WEP' ? 'WEP' : 'WPA';
    const hidden = yes(wifi.hidden);
    return {
      kind,
      text: ssid ? `WIFI:T:${sec};S:${wifiEsc(ssid)};${sec !== 'nopass' && password ? `P:${wifiEsc(password)};` : ''}${hidden ? 'H:true;' : ''};` : '',
      rows: [
        { label: tr('Network'), value: ssid },
        { label: tr('Password'), value: sec === 'nopass' ? '' : password, mono: true },
        { label: tr('Security'), value: sec === 'nopass' ? tr('None (open network)') : sec === 'WEP' ? 'WEP' : 'WPA/WPA2/WPA3' },
        { label: tr('Hidden network'), value: hidden ? tr('Yes') : '' },
      ],
    };
  }
  if (kind === 'contact') {
    const name = textOf(contact, 'name', 'full_name') || value;
    const parts = name.trim().split(/\s+/);
    const family = parts.length > 1 ? parts[parts.length - 1] : name.trim();
    const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    const phone = str(contact.phone ?? contact.tel ?? contact.mobile).trim();
    const email = str(contact.email).trim();
    const org = str(contact.org ?? contact.company ?? contact.organization).trim();
    const role = str(contact.title ?? contact.role).trim();
    const url = str(contact.url ?? contact.website).trim();
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vcardEsc(family)};${vcardEsc(given)};;;`, `FN:${vcardEsc(name.trim())}`];
    if (org) lines.push(`ORG:${vcardEsc(org)}`);
    if (role) lines.push(`TITLE:${vcardEsc(role)}`);
    if (phone) lines.push(`TEL;TYPE=CELL:${phone.replace(/[^\d+]/g, '')}`);
    if (email) lines.push(`EMAIL:${vcardEsc(email)}`);
    if (url) lines.push(`URL:${vcardEsc(url)}`);
    lines.push('END:VCARD');
    return {
      kind,
      text: name.trim() ? lines.join('\r\n') : '',
      rows: [
        { label: tr('Name'), value: name },
        { label: role ? tr('Job') : tr('Company'), value: [role, org].filter(Boolean).join(', ') },
        { label: tr('Phone'), value: phone, href: phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined },
        { label: tr('Email'), value: email, href: email ? `mailto:${email}` : undefined },
        { label: tr('Website'), value: url ? hostOf(url) || url : '', href: /^https?:\/\//i.test(url) ? url : undefined },
      ],
    };
  }
  if (kind === 'email') {
    const address = value.replace(/^mailto:/i, '');
    return { kind, text: address ? (/^mailto:/i.test(value) ? value : `mailto:${address}`) : '', rows: [{ label: tr('Email'), value: address.split('?')[0], href: address ? `mailto:${address}` : undefined }] };
  }
  if (kind === 'phone') {
    const number = value.replace(/^tel:/i, '');
    const digits = number.replace(/[^\d+]/g, '');
    return { kind, text: digits ? `tel:${digits}` : '', rows: [{ label: tr('Phone'), value: number, href: digits ? `tel:${digits}` : undefined }] };
  }
  if (kind === 'text') return { kind, text: value, rows: [] };
  const url = value && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? `https://${value}` : value;
  return { kind, text: url, rows: [{ label: tr('Opens'), value: url, href: /^https?:\/\//i.test(url) ? url : undefined }] };
}

/** The code as a PNG, its squares drawn on a canvas a whole number of pixels each, with a quiet margin of four round them. */
function savePng(code: QrCode, name: string) {
  const quiet = 4;
  const n = code.size + quiet * 2;
  const px = Math.max(4, Math.floor(1200 / n));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n * px;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#000000';
  code.modules.forEach((row, y) => row.forEach((dark, x) => dark && g.fillRect((x + quiet) * px, (y + quiet) * px, px, px)));
  canvas.toBlob((b) => b && saveBlob(`${name}.png`, b), 'image/png');
}

function Qr({ data, done }: { data: Data; done: boolean }) {
  const c = qrContent(data);
  const want = str(data.level).trim().toUpperCase();
  const level: QrLevel = want === 'L' || want === 'Q' || want === 'H' ? want : 'M';
  // Drawn once the block is whole: a code of half a link would scan to the wrong place.
  const code = useMemo(() => {
    if (!done || !c.text) return null;
    try {
      return qrCode(c.text, { level });
    } catch {
      return 'long' as const;
    }
  }, [done, c.text, level]);
  const K = QR_KINDS[c.kind];
  const title = str(data.title);
  const name = fileName(title || `qr-${c.kind}`, 'qr-code');
  const rows = c.rows.filter((r) => r.value);
  const side = 188;
  return (
    <Card>
      <Head title={title} />
      <div className="flex flex-col items-center gap-5 @md:flex-row @md:items-start">
        <div className="shrink-0">
          {code && code !== 'long' ? (
            <svg width={side} height={side} viewBox={`-4 -4 ${code.size + 8} ${code.size + 8}`} shapeRendering="crispEdges" role="img" aria-label={tr('QR code')} className="block rounded-xl border border-line">
              <rect x={-4} y={-4} width={code.size + 8} height={code.size + 8} fill="#ffffff" />
              <path d={qrPath(code)} fill="#000000" />
            </svg>
          ) : (
            <div className="grid place-items-center rounded-xl border border-dashed border-line-2 bg-bg-1 px-4 text-center text-fg-3" style={{ width: side, height: side }}>
              <span className="flex flex-col items-center gap-2">
                <QrIcon size={36} className="opacity-50" />
                {code === 'long' && <span className="text-[12.5px]">{tr('Too long for a QR code')}</span>}
              </span>
            </div>
          )}
        </div>
        <div className="w-full min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">
            <K.Icon size={13} />
            {K.label()}
          </div>
          {c.kind === 'text'
            ? c.text && <div className="max-h-56 overflow-y-auto rounded-lg bg-bg-1 px-3 py-2 text-[13.5px] break-words whitespace-pre-wrap text-fg">{c.text}</div>
            : rows.length > 0 && (
                <dl className="m-0">
                  {rows.map((r, i) => (
                    <div key={i} className={cx('flex min-w-0 border-b border-line/70 py-1.5 text-[13.5px] last:border-b-0', r.value.length > 32 ? 'flex-col gap-0.5' : 'items-baseline justify-between gap-4')}>
                      <dt className="shrink-0 text-fg-3">{r.label}</dt>
                      <dd className={cx('m-0 min-w-0 font-medium break-words text-fg', r.value.length > 32 ? 'text-left' : 'text-right', r.mono && 'font-mono text-[13px]')}>
                        {r.href ? (
                          <a href={r.href} target={/^https?:/i.test(r.href) ? '_blank' : undefined} rel="noopener noreferrer" className="break-all text-accent hover:underline">
                            {r.value}
                          </a>
                        ) : (
                          r.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
          {str(data.caption) && <Md text={data.caption} className="mt-2.5 text-[13px] text-fg-2" />}
          {code && code !== 'long' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn icon={<FileCode2 size={14} />} onClick={() => download(`${name}.svg`, 'image/svg+xml', qrSvg(code, { quiet: 4, width: 512 }))}>
                {tr('SVG')}
              </Btn>
              <Btn icon={<FileImage size={14} />} onClick={() => savePng(code, name)}>
                {tr('PNG')}
              </Btn>
              <CopyBtn text={c.text}>{tr('Copy the text')}</CopyBtn>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---- job openings ----------------------------------------------------------------------------------------------------------

type Workplace = 'remote' | 'hybrid' | 'onsite' | '';
type JobType = 'full-time' | 'part-time' | 'contract' | 'internship' | '';

function workplaceOf(v: unknown): Workplace {
  if (v === true) return 'remote';
  const s = str(v).trim().toLowerCase();
  if (/hybrid|flex/.test(s)) return 'hybrid';
  if (/remote|anywhere|distributed|work from home|wfh/.test(s)) return 'remote';
  if (/on[- ]?site|office|in[- ]person/.test(s)) return 'onsite';
  return '';
}
function jobTypeOf(v: unknown): JobType {
  const s = str(v).trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (/^full/.test(s) || s === 'permanent') return 'full-time';
  if (/^part/.test(s)) return 'part-time';
  if (/contract|freelance|temp|fixed-term|consult/.test(s)) return 'contract';
  if (/intern|placement|trainee|apprentice/.test(s)) return 'internship';
  return '';
}
const WORKPLACE: Record<Exclude<Workplace, ''>, { Icon: LucideIcon; label: () => string }> = {
  remote: { Icon: Globe, label: () => tr('Remote') },
  hybrid: { Icon: House, label: () => tr('Hybrid') },
  onsite: { Icon: Building2, label: () => tr('On site') },
};
const JOB_TYPE: Record<Exclude<JobType, ''>, () => string> = {
  'full-time': () => tr('Full-time'),
  'part-time': () => tr('Part-time'),
  contract: () => tr('Contract'),
  internship: () => tr('Internship'),
};

interface Job {
  i: number;
  title: string;
  company: string;
  logo: string;
  location: string;
  workplace: Workplace;
  salary: string;
  type: JobType;
  posted: Date | null;
  url: string;
  tags: string[];
  summary: string;
  why: string;
}

/** Chips that pick one of a few (or all): a filter. */
function FilterChips<T extends string>({ options, value, onChange, label, count }: { options: T[]; value: T | ''; onChange: (v: T | '') => void; label: (v: T | '') => string; count: (v: T | '') => number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(['', ...options] as (T | '')[]).map((o) => {
        const n = count(o);
        return (
          <button
            key={o || '*'}
            type="button"
            aria-pressed={value === o}
            disabled={!n && value !== o}
            onClick={() => onChange(o)}
            className={cx('rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors disabled:opacity-45', value === o ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line text-fg-2 enabled:hover:bg-bg-2')}
          >
            {label(o)}
            <span className="ml-1 text-fg-3 tabular-nums">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A company's logo on a white tile (logos are made for a light ground), or its initials. */
function Logo({ src, name }: { src: string; name: string }) {
  const ok = usePicOk(src);
  // A logo that cannot load leaves the initials in its place; its tile stays in the tree (hidden) so a retry can bring it back.
  return (
    <>
      {src && (
        <span className={cx('grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-1.5 ring-1 ring-line', !ok && 'hidden')}>
          <Pic src={src} alt={name} fit="contain" zoom={false} className="h-full w-full bg-transparent" />
        </span>
      )}
      {!ok && (
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-bg-2 text-[15px] font-semibold text-fg-2 select-none">
          {initials(name) || '?'}
        </span>
      )}
    </>
  );
}

function JobCard({ j, done }: { j: Job; done: boolean }) {
  const days = j.posted ? daysFromToday(j.posted) : null;
  const est = /^\s*(est\.?|estimated|~|about|approx\.?)\s*/i.exec(j.salary);
  const link = /^https?:\/\//i.test(j.url) ? j.url : '';
  const W = j.workplace ? WORKPLACE[j.workplace] : null;
  return (
    <article className="min-w-0 rounded-xl border border-line p-3.5 @lg:p-4">
      <div className="flex min-w-0 items-start gap-3 @md:gap-3.5">
        <Logo src={j.logo} name={j.company || j.title} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="text-[15px] leading-snug font-semibold text-fg hover:text-accent hover:underline">
                  {j.title}
                </a>
              ) : (
                <span className="text-[15px] leading-snug font-semibold text-fg">{j.title}</span>
              )}
              {(j.company || j.location) && (
                <div className="mt-0.5 text-[13px] text-fg-2">
                  {j.company}
                  {j.location && <span className="text-fg-3">{`${j.company ? ' · ' : ''}${j.location}`}</span>}
                </div>
              )}
            </div>
            {days !== null && days <= 0 && (
              <span className={cx('shrink-0 text-[12px] whitespace-nowrap', days >= -2 ? 'font-medium text-accent' : 'text-fg-3')} title={fmtDate(j.posted, 'medium')}>
                {relDays(days)}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="min-w-0 @md:pl-[58px]">
        {(W || j.type || j.salary) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {W && (
              <Chip>
                <W.Icon size={12} />
                {W.label()}
              </Chip>
            )}
            {j.type && <Chip>{JOB_TYPE[j.type]()}</Chip>}
            {j.salary && (
              <span className="ml-0.5 text-[13px] font-semibold text-fg tabular-nums" title={est ? tr('An estimate, not the published pay') : undefined}>
                {est ? (
                  <>
                    <span className="mr-1 text-[11.5px] font-medium text-fg-3">{tr('est.')}</span>
                    {j.salary.slice(est[0].length)}
                  </>
                ) : (
                  j.salary
                )}
              </span>
            )}
          </div>
        )}
        {j.summary && <Md text={j.summary} className="mt-2 text-[13px] text-fg-2" />}
        {j.why && (
          <div className="mt-2 flex gap-2 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[13px]">
            <Sparkles size={13} className="mt-[3px] shrink-0 text-accent" aria-label={tr('Why it fits')} />
            <Md text={j.why} inline className="min-w-0 text-fg" />
          </div>
        )}
        {j.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {j.tags.map((t, i) => (
              <span key={i} className="rounded-md bg-bg-2 px-1.5 py-0.5 text-[11.5px] text-fg-2">
                {t}
              </span>
            ))}
          </div>
        )}
        {(link || done) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-accent-fg transition-opacity hover:opacity-90">
                {tr('Apply')}
                <ExternalLink size={13} />
              </a>
            )}
            {done && <Ask text={tr('Tell me more about the {0} job at {1}.').replace('{0}', j.title).replace('{1}', j.company)}>{tr('Ask about this job')}</Ask>}
            {link && <span className="truncate text-[12px] text-fg-3">{hostOf(link)}</span>}
          </div>
        )}
      </div>
    </article>
  );
}

function Jobs({ data, done }: { data: Data; done: boolean }) {
  const jobs: Job[] = arr(data.jobs ?? data.items ?? data.openings)
    .filter(isObj)
    .map((x, i) => ({
      i,
      title: textOf(x, 'title', 'role', 'position', 'name'),
      company: textOf(x.company ?? x.employer ?? x.org, 'name'),
      logo: str(x.logo ?? x.image).trim(),
      location: str(x.location ?? x.place ?? x.city),
      workplace: workplaceOf(x.remote ?? x.workplace ?? x.where),
      salary: str(x.salary ?? x.pay ?? x.compensation).trim(),
      type: jobTypeOf(x.type ?? x.employment),
      posted: dayOf(x.posted ?? x.date),
      url: str(x.url ?? x.link ?? x.apply).trim(),
      tags: words(x.tags ?? x.skills),
      summary: str(x.summary ?? x.description),
      why: str(x.why ?? x.fit),
    }))
    .filter((j) => j.title || j.company);
  const [where, setWhere] = useKept<string>('workplace', '');
  const [kind, setKind] = useKept<string>('type', '');
  const [sort, setSort] = useKept<string>('sort', '');
  const places = (['remote', 'hybrid', 'onsite'] as const).filter((w) => jobs.some((j) => j.workplace === w));
  const types = (['full-time', 'part-time', 'contract', 'internship'] as const).filter((t) => jobs.some((j) => j.type === t));
  const w = done && (places as readonly string[]).includes(where) ? (where as Workplace) : '';
  const t = done && (types as readonly string[]).includes(kind) ? (kind as JobType) : '';
  const dated = jobs.filter((j) => j.posted).length > 1;
  const newest = done && dated && sort === 'new';
  const shown = jobs.filter((j) => (!w || j.workplace === w) && (!t || j.type === t));
  const list = newest ? [...shown].sort((a, b) => (b.posted?.getTime() ?? -Infinity) - (a.posted?.getTime() ?? -Infinity) || a.i - b.i) : shown;
  const tools = done && jobs.length > 2 && (places.length > 1 || types.length > 1 || dated);
  return (
    <Card>
      <Head title={data.title} aside={jobs.length > 1 ? <span className="text-[12px] text-fg-3 tabular-nums">{list.length === jobs.length ? tr('{0} jobs').replace('{0}', String(jobs.length)) : `${list.length} / ${jobs.length}`}</span> : undefined} />
      {tools && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {places.length > 1 && (
            <FilterChips<Exclude<Workplace, ''>>
              options={[...places]}
              value={w}
              onChange={setWhere}
              label={(v) => (v ? WORKPLACE[v].label() : tr('Anywhere'))}
              count={(v) => jobs.filter((j) => (!v || j.workplace === v) && (!t || j.type === t)).length}
            />
          )}
          {types.length > 1 && (
            <FilterChips<Exclude<JobType, ''>>
              options={[...types]}
              value={t}
              onChange={setKind}
              label={(v) => (v ? JOB_TYPE[v]() : tr('Any kind'))}
              count={(v) => jobs.filter((j) => (!v || j.type === v) && (!w || j.workplace === w)).length}
            />
          )}
          {dated && (
            <Seg
              size="sm"
              className="ml-auto"
              options={[
                { value: '', label: tr('Best match') },
                { value: 'new', label: tr('Newest') },
              ]}
              value={newest ? 'new' : ''}
              onChange={setSort}
            />
          )}
        </div>
      )}
      {list.length > 0 ? (
        <div className="space-y-2.5">
          {list.map((j) => (
            <JobCard key={j.i} j={j} done={done} />
          ))}
        </div>
      ) : (
        jobs.length > 0 && (
          <div className="rounded-xl bg-bg-1 px-4 py-6 text-center text-[13px] text-fg-3">
            {tr('No jobs match these filters.')}{' '}
            <button
              type="button"
              onClick={() => {
                setWhere('');
                setKind('');
              }}
              className="font-medium text-accent hover:underline"
            >
              {tr('Show all')}
            </button>
          </div>
        )
      )}
    </Card>
  );
}

export const WORK_UIS: Record<string, AnswerUiView> = {
  invoice: Invoice,
  issues: Issues,
  'action-items': ActionItems,
  qr: Qr,
  jobs: Jobs,
};
