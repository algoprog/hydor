// The one page, written on the server so that every word and number is in the HTML.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const money = (n) => pounds.format(n);
const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = (iso) => longDate.format(new Date(`${iso}T00:00:00Z`));
const count = (n, one, many = `${one}s`) => `${n} ${Math.abs(n) === 1 ? one : many}`;

const SHOWN_SKIPS = 20;

function results(r, fileName) {
  const biggest = Math.max(0, ...r.days.map((d) => d.takings));
  const dayRows = r.days.map((d) => {
    const width = biggest > 0 ? Math.max(0, (d.takings / biggest) * 100) : 0;
    return `<tr>
          <th scope="row"><time datetime="${d.date}">${esc(day(d.date))}</time>
            <svg class="bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect width="${width.toFixed(1)}" height="6"/></svg></th>
          <td>${money(d.takings)}</td>
        </tr>`;
  }).join('\n        ');

  const skips = r.skipped.slice(0, SHOWN_SKIPS).map((s) => `<li>Line ${s.line}: ${esc(s.why)}.</li>`).join('');
  const more = r.skipped.length > SHOWN_SKIPS ? `<li>And ${r.skipped.length - SHOWN_SKIPS} more.</li>` : '';

  return `
    <section class="results" id="results" aria-labelledby="results-title">
      <h2 id="results-title">Your sums${fileName ? ` <span class="file">from ${esc(fileName)}</span>` : ''}</h2>
      ${r.salesLines === 0 ? '<p class="note">There were no sales lines that could be read in this file.</p>' : ''}
      <div class="total">
        <p class="label">Total takings</p>
        <p class="figure">${money(r.totalTakings)}</p>
        <p class="small">Refunds already taken off</p>
      </div>
      <dl class="cards">
        <div><dt>Candles sold</dt><dd>${r.candlesSold}</dd><dd class="small">After refunds</dd></div>
        <div class="wide"><dt>Best seller</dt><dd class="name">${r.bestSeller === null ? 'None' : esc(r.bestSeller)}</dd><dd class="small">${r.bestSeller === null ? 'No candle was sold after refunds' : `${count(r.bestSellerQuantity, 'candle')} sold`}</dd></div>
        <div><dt>Refunds</dt><dd>${r.refunds}</dd><dd class="small">Lines that were refunds</dd></div>
        <div><dt>Skipped lines</dt><dd>${r.skippedLines}</dd><dd class="small">Lines that could not be read</dd></div>
      </dl>
      ${r.days.length ? `<table>
        <caption>Takings for each day</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Takings</th></tr></thead>
        <tbody>
        ${dayRows}
        </tbody>
      </table>` : ''}
      ${r.skippedLines ? `<div class="skips">
        <h3>${count(r.skippedLines, 'line was', 'lines were')} left out of the sums</h3>
        <ul>${skips}${more}</ul>
      </div>` : ''}
    </section>`;
}

export function page({ result = null, error = null, fileName = '' } = {}) {
  const form = `
    <form method="post" action="/" enctype="multipart/form-data" id="form">
      <label class="drop" id="drop" for="file">
        <strong id="drop-words">${result || error ? 'Drop another file here' : 'Drop your file here'}</strong>
        <span>or choose it from your computer (a CSV file)</span>
        <input type="file" name="file" id="file" accept=".csv,text/csv,text/plain" required>
      </label>
      <button type="submit" id="go">Work out my sums</button>
    </form>
    <p class="error" id="error" role="alert"${error ? '' : ' hidden'}>${error ? esc(error) : ''}</p>`;

  // Once there are sums they come first, and the drop box moves below them ready for the next file.
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Market Day Sums</title>
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css">
  <script src="/drop.js" defer></script>
</head>
<body${result ? ' class="answered"' : ''}>
  <main>
    <header>
      <img src="/icon.svg" alt="" width="56" height="56">
      <h1>Market Day Sums</h1>
      <p>Drop in your card reader's weekend file to see what you took, how many candles you sold, your best seller, your refunds and your takings for each day.</p>
    </header>
${result ? results(result, fileName) + form : form}
    <footer>Nothing is kept. Your file is read, added up and forgotten.</footer>
  </main>
</body>
</html>
`;
}
