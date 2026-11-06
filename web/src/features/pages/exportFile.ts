// A page or a deck as a file, downloaded: a PDF, a Word document, a PowerPoint deck, a deck's slides as pictures or a
// web page, made by the server (GET /api/pages/:id/export). Paper is Letter where people use it, else A4. Without the
// browser the server makes PDFs with, a deck still prints from here: every slide on a page, through the device's own Print.
// A LaTeX document's arXiv package opens its dialog first (what goes in, ticked), which then downloads it.
import type { Deck } from '@shared/slides';
import { ApiError, enc } from '../../lib/api';
import { mu } from '../../lib/machine';
import { toast } from '../../lib/store';
import { askArxiv } from './latex/arxivAsk';
import { PICS, RT } from './slides/rt';

export type ExportFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'csv' | 'md' | 'tex' | 'zip' | 'html' | 'ipynb' | 'py' | 'png' | 'jpg' | 'arxiv';

const LETTER = /^(en-US|en-CA|es-US|es-MX|fr-CA|en-PH|es-CO|es-CL|es-VE|es-GT|es-CR|es-PA)$/i;

/** Saves bytes as a file in the browser's downloads. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const nameOf = (res: Response, fallback: string) => {
  const cd = res.headers.get('content-disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {}
  }
  return /filename="([^"]+)"/i.exec(cd)?.[1] ?? fallback;
};

/** Every slide printed by the device (when the server has no browser to make the PDF). */
export function printDeck(deck: Deck) {
  const host = document.createElement('div');
  host.className = 'ns-print-host';
  const sheet = document.createElement('style');
  sheet.textContent = '@media print{body>*:not(.ns-print-host){display:none!important}.ns-print-host{display:block!important}}.ns-print-host{display:none}';
  host.appendChild(sheet);
  document.body.appendChild(host);
  RT.print(host, deck, PICS);
  const done = () => {
    host.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  void document.fonts.ready.then(() => setTimeout(() => window.print(), 250));
}

const WHAT: Record<ExportFormat, string> = {
  pdf: 'the PDF',
  docx: 'the Word document',
  pptx: 'the PowerPoint file',
  xlsx: 'the Excel file',
  csv: 'the CSV file',
  md: 'the Markdown file',
  tex: 'the LaTeX file',
  zip: 'the LaTeX project',
  arxiv: 'the arXiv package',
  html: 'the web page',
  ipynb: 'the notebook',
  py: 'the Python script',
  png: 'the pictures',
  jpg: 'the picture',
};

/** Downloads the page (or its version `version`) as a file; a deck's PDF prints here when the server cannot make it. */
export async function exportFile(id: string, format: ExportFormat, o: { version?: number; deck?: Deck; slide?: number } = {}) {
  if (format === 'arxiv') return askArxiv(id, o.version);
  const paper = LETTER.test(navigator.language) ? 'letter' : 'a4';
  if (format !== 'html' && format !== 'csv' && format !== 'md' && format !== 'tex' && format !== 'ipynb' && format !== 'py') toast(o.slide ? 'Making the picture…' : `Making ${WHAT[format]}…`);
  const res = await fetch(mu(`/api/pages/${enc(id)}/export?format=${format}&paper=${paper}${o.version ? `&v=${o.version}` : ''}${o.slide ? `&slide=${o.slide}` : ''}`), { credentials: 'same-origin' });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 503 && format === 'pdf' && o.deck) {
      toast('Printing it here: pick “Save as PDF” in the print window.');
      printDeck(o.deck);
      return;
    }
    throw new ApiError(j?.error ?? `${res.status} ${res.statusText}`, res.status);
  }
  saveBlob(await res.blob(), nameOf(res, `page.${format}`));
  // A web-format deck made PowerPoint's says what changed on the way (its parts as pictures, its effects as PowerPoint's).
  const note = res.headers.get('X-Export-Note') ?? '';
  const changed = /Made for PowerPoint: [^]*/.exec(note)?.[0];
  if (changed) toast(changed);
}
