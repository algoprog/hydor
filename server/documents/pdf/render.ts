// Pictures of a PDF's pages (PNG), drawn by whatever this computer has: poppler's pdftoppm where it is installed (the
// Docker image and most Linux systems; Macs with Homebrew's poppler), else what the system itself has: on a Mac,
// sips draws a PDF's first page, so the page goes alone into a PDF of its own first; on Windows, the PDF renderer of
// Windows 10 and 11 (Windows.Data.Pdf) through PowerShell; else the browser the app takes its pictures with, drawing
// the page with pdf.js loaded from jsDelivr. Pictures are kept by the PDF's hash, so asking again costs nothing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../../config.ts';
import { canCapture, withTab } from '../../capture/index.ts';
import { PDFJS } from '../pdf.ts';
import { run, which } from '../tools.ts';

const CACHE = path.join(config.dataDir, 'pdf-pages');

/** Old pictures go: at most 600 kept, none older than a week. */
function sweep() {
  try {
    const list = fs
      .readdirSync(CACHE)
      .map((n) => ({ f: path.join(CACHE, n), t: fs.statSync(path.join(CACHE, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    list.forEach((x, i) => (i >= 600 || Date.now() - x.t > 7 * 86400_000) && fs.rmSync(x.f, { force: true }));
  } catch {}
}

export interface PictureOpts {
  /** The picture's width in pixels (default 1200). */
  width?: number;
}

const drawing = new Map<string, Promise<Buffer>>();

/**
 * A PNG of a page (from 1). `pageOnly` is the page alone as a one-page PDF, for the ways of drawing that take only a
 * first page (made when needed).
 */
export async function renderPage(pdf: Buffer, page: number, o: PictureOpts = {}, pageOnly?: () => Buffer): Promise<Buffer> {
  const width = Math.max(64, Math.min(4000, Math.round(o.width ?? 1200)));
  const key = crypto.createHash('sha256').update(pdf).digest('hex').slice(0, 32) + `-${page}-${width}`;
  const file = path.join(CACHE, `${key}.png`);
  try {
    const hit = fs.readFileSync(file);
    fs.utimesSync(file, new Date(), new Date());
    return hit;
  } catch {}
  let job = drawing.get(key);
  if (!job) {
    job = draw(pdf, page, width, pageOnly)
      .then((png) => {
        fs.mkdirSync(CACHE, { recursive: true, mode: 0o700 });
        fs.writeFileSync(file, png);
        sweep();
        return png;
      })
      .finally(() => drawing.delete(key));
    drawing.set(key, job);
  }
  return job;
}

async function draw(pdf: Buffer, page: number, width: number, pageOnly?: () => Buffer): Promise<Buffer> {
  const errors: string[] = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-pdf-'));
  try {
    const input = path.join(dir, 'in.pdf');
    fs.writeFileSync(input, pdf);
    const pop = which('pdftoppm') ?? which('pdftocairo');
    if (pop) {
      const r = await run(pop, ['-png', '-singlefile', '-f', String(page), '-l', String(page), '-scale-to-x', String(width), '-scale-to-y', '-1', input, path.join(dir, 'out')], { timeout: 60_000 });
      const out = path.join(dir, 'out.png');
      if (fs.existsSync(out)) return fs.readFileSync(out);
      errors.push(`poppler: ${r.err.trim().split('\n').pop() ?? 'no picture'}`);
    }
    if (process.platform === 'darwin' && fs.existsSync('/usr/bin/sips')) {
      // sips draws the first page only: the page goes alone into a PDF of its own.
      const one = path.join(dir, 'page.pdf');
      fs.writeFileSync(one, page === 1 || !pageOnly ? pdf : pageOnly());
      const out = path.join(dir, 'out.png');
      const r = await run('/usr/bin/sips', ['-s', 'format', 'png', '--resampleWidth', String(width), one, '--out', out], { timeout: 60_000 });
      if (fs.existsSync(out)) return fs.readFileSync(out);
      errors.push(`sips: ${r.err.trim().split('\n').pop() ?? 'no picture'}`);
    }
    if (process.platform === 'win32') {
      const out = path.join(dir, 'out.png');
      const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_SCRIPT, input, String(page - 1), String(width), out], { timeout: 60_000 });
      if (fs.existsSync(out) && fs.statSync(out).size > 0) return fs.readFileSync(out);
      errors.push(`Windows: ${r.err.trim().split('\n').pop() ?? 'no picture'}`);
    }
    if (canCapture()) {
      try {
        return await inBrowser(pdf, page, width);
      } catch (e) {
        errors.push(`the browser: ${(e as Error).message}`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  throw new Error(
    `The page could not be drawn here${errors.length ? ` (${errors.join('; ')})` : ''}. Install poppler (Debian or Ubuntu: sudo apt install poppler-utils; a Mac: brew install poppler), or let the app download a browser in Settings → Browser.`,
  );
}

// Windows' own PDF renderer, from PowerShell: its asynchronous calls are waited for through .NET's AsTask.
const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$in = $args[0]; $index = [uint32]$args[1]; $width = [uint32]$args[2]; $outPath = $args[3]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$ext = [System.WindowsRuntimeSystemExtensions].GetMethods()
$opT = ($ext | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
$actT = ($ext | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
function Wait-Op($op, $type) { $t = $opT.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait() | Out-Null; $t.Result }
function Wait-Act($op) { $t = $actT.Invoke($null, @($op)); $t.Wait() | Out-Null }
$file = Wait-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($in)) ([Windows.Storage.StorageFile])
$doc = Wait-Op ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
$page = $doc.GetPage($index)
$stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
$opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
$opts.DestinationWidth = $width
Wait-Act ($page.RenderToStreamAsync($stream, $opts))
$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
$size = [uint32]$stream.Size
Wait-Op ($reader.LoadAsync($size)) ([uint32]) | Out-Null
$bytes = New-Object byte[] $size
$reader.ReadBytes($bytes)
[System.IO.File]::WriteAllBytes($outPath, $bytes)
`;

/** The page drawn by pdf.js in the app's browser (pdf.js from jsDelivr, its worker made from the same files). */
export async function inBrowser(pdf: Buffer, page: number, width: number): Promise<Buffer> {
  const cdn = `https://cdn.jsdelivr.net/npm/${PDFJS}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="application/json" id="pdf">${JSON.stringify(pdf.toString('base64'))}</script></body></html>`;
  const script = `(async () => {
    const lib = await import('${cdn}/build/pdf.min.mjs');
    const src = await (await fetch('${cdn}/build/pdf.worker.min.mjs')).text();
    lib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' });
    const b64 = JSON.parse(document.getElementById('pdf').textContent);
    const bin = atob(b64);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    const doc = await lib.getDocument({ data, cMapUrl: '${cdn}/cmaps/', cMapPacked: true, standardFontDataUrl: '${cdn}/standard_fonts/', isEvalSupported: false }).promise;
    const p = await doc.getPage(${page});
    const vp = p.getViewport({ scale: ${width} / p.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    return canvas.toDataURL('image/png').split(',')[1];
  })()`;
  const data = await withTab({ html, width: 400, height: 300, settleMs: 0, blockPrivate: true }, (tab) => tab.evaluate<string>(script, 90_000));
  if (!data) throw new Error('pdf.js drew nothing');
  return Buffer.from(data, 'base64');
}
