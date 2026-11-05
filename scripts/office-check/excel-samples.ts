// The workbooks excel-check.ts compares with what Office makes of them: between them, everything the spreadsheet editor
// has (number formats and Excel's own codes, fonts, sizes and colours, fills, borders of every kind, alignment,
// wrapped and turned words, widths and heights, merged and hidden cells, frozen panes, formulas, a filter, conditional
// formatting, lists, checkboxes and ratings, every kind of chart, notes and comments, several sheets, a long sheet over
// pages and a wide one), as an agent or the editor gives them (shared/sheets.ts normalizeBook checks them as it does those).

export interface BookSample {
  name: string;
  title: string;
  model: Record<string, unknown>;
}

const now = Date.UTC(2026, 9, 20, 9, 30);

export function bookSamples(): BookSample[] {
  return [
    {
      name: 'excel-formats',
      title: 'Formats',
      model: {
        sheets: [
          {
            name: 'Formats',
            header: true,
            rows: [
              ['Kind', 'Value', 'Shown', 'Notes'],
              ['General', 1234.5, '=B2', 'as typed'],
              ['Number, 2 places', 1234.5678, '=B3', 'turned up'],
              ['Percent', 0.256, '=B4', 'turned down'],
              ['Currency $', 1234.5, '=B5', 'top'],
              ['Currency €', -99.95, '=B6', 'negative'],
              ['Accounting', 1234.5, '=B7', ''],
              ['Scientific', 0.000123, '=B8', ''],
              ['Date', '2026-01-31', '=B9', ''],
              ['Time', '14:30', '=B10', ''],
              ['Date and time', '2026-01-31 14:30', '=B11', ''],
              ['Duration', '=B10*3', '=B12', 'hours over a day'],
              ['Text', "'007", '=B13', ''],
              ['Code: red negatives', -1234.5, '=B14', '#,##0.0;[Red]-#,##0.0'],
              ['Code: long date', '2026-03-05', '=B15', 'd mmmm yyyy'],
              ['Total', '=SUM(B2:B7)', '=B16*2', 'formulas'],
            ],
            // Per cell, through styles (formats takes whole columns).
            formats: { C: 'general' },
            widths: { A: 170, B: 110, C: 130, D: 160 },
            heights: { '1': 30, '16': 28 },
            freeze: { rows: 1, cols: 1 },
            styles: {
              'B3:C3': { fmt: 'number', dp: 2 },
              'B4:C4': { fmt: 'percent', dp: 1 },
              'B5:C5': { fmt: 'currency' },
              'B6:C6': { fmt: 'currency', cur: '€' },
              'B7:C7': { fmt: 'accounting' },
              'B8:C8': { fmt: 'scientific' },
              'B9:C9': { fmt: 'date' },
              'B10:C10': { fmt: 'time' },
              'B11:C11': { fmt: 'datetime' },
              'B12:C12': { fmt: 'duration' },
              'B13:C13': { fmt: 'text' },
              'B14:C14': { code: '#,##0.0;[Red]-#,##0.0' },
              'B15:C15': { code: 'd mmmm yyyy' },
              'A1:D1': { b: true, fill: '#1f4e78', color: '#ffffff', align: 'center', valign: 'middle', border: 'thin #1f4e78' },
              'A16:D16': { b: true, fill: '#fff3cd', bt: 'double', bb: 'thick' },
              A2: { font: 'Georgia', size: 12 },
              A3: { font: 'Courier New' },
              A4: { font: 'Times New Roman', i: true },
              A5: { font: 'Verdana', size: 9 },
              A6: { color: '#c5221f', u: true },
              A7: { s: true },
              D2: { wrap: true },
              D3: { rot: 45 },
              D4: { rot: -30 },
              'B2:B15': { border: 'thin #999999' },
              'C2:C15': { bl: 'dashed #1a73e8', br: 'dotted', align: 'right' },
              'D5:D8': { valign: 'top', fill: '#e6f4ea' },
              'A2:D16': { outline: 'medium' },
            },
          },
          {
            name: 'Merged',
            rows: [
              ['A wide title merged across four columns', null, null, null],
              ['Left', 'Middle', null, 'Right'],
              ['Down', 1, 2, 3],
              [null, 4, 5, 6],
              ['Hidden row next', 7, 8, 9],
              ['This row is hidden', 0, 0, 0],
              ['After it', 10, 11, 12],
            ],
            merges: ['A1:D1', 'B2:C2', 'A3:A4'],
            hidden: { rows: [6], cols: ['E'] },
            styles: { A1: { size: 16, b: true, align: 'center', fill: '#e8f0fe' }, 'A3:A4': { valign: 'middle', fill: '#fef7e0' } },
            widths: { A: 140 },
          },
        ],
      },
    },
    {
      name: 'excel-rules',
      title: 'Rules',
      model: {
        sheets: [
          {
            name: 'Tasks',
            header: true,
            rows: [
              ['Task', 'Owner', 'Status', 'Done', 'Rating', 'Hours', 'Score', 'Due'],
              ['Plan the beds', 'Ana', 'Open', false, 3, 4, 12, '2026-04-02'],
              ['Order soil', 'Ben', 'Done', true, 5, 2, 88, '2026-03-20'],
              ['Build the frames', 'Ana', 'Doing', false, 4, 12, 45, '2026-04-10'],
              ['Paint the fence', 'Cy', 'Open', false, 2, 6, 67, '2026-04-15'],
              ['Plant beans', 'Ben', 'Doing', false, 1, 3, 30, '2026-05-01'],
              ['Water rota', 'Cy', 'Done', true, 5, 1, 95, '2026-03-01'],
              ['Compost bins', 'Ana', 'Open', false, 0, 8, 5, '2026-06-01'],
            ],
            widths: { A: 150, B: 80, C: 90, D: 60, E: 100, F: 70, G: 80, H: 100 },
            formats: { H: 'date' },
            freeze: { rows: 1 },
            filter: { range: 'A1:H8', cols: { B: { hide: ['Cy'] } } },
            conditional: [
              { range: 'F2:F8', when: { op: 'gt', a: '5' }, style: { fill: '#fce8e6', color: '#c5221f', b: true } },
              { range: 'A2:A8', when: { op: 'contains', a: 'beans' }, style: { i: true, color: '#188038' } },
              { range: 'G2:G8', scale: ['#f8696b', '#ffeb84', '#63be7b'] },
              { range: 'H2:H8', when: { op: 'before', a: '2026-04-01' }, style: { s: true } },
            ],
            validation: [
              {
                range: 'C2:C8',
                list: [
                  { v: 'Open', color: '#e8eaed' },
                  { v: 'Doing', color: '#fde293' },
                  { v: 'Done', color: '#ceead6' },
                ],
              },
              { range: 'D2:D8', checkbox: true },
              { range: 'E2:E8', rating: 5 },
              { range: 'F2:F8', type: 'number', when: { op: 'between', a: '0', b: '40' }, reject: true },
            ],
          },
          {
            name: 'Bars',
            header: true,
            rows: [['Item', 'Amount'], ...['Seeds', 'Soil', 'Tools', 'Timber', 'Water', 'Paint'].map((k, i) => [k, [120, 410, 95, 300, 60, 150][i]])],
            conditional: [
              { range: 'B2:B7', bar: '#638ec6' },
              { range: 'A2:A7', when: { op: 'dup' }, style: { fill: '#fff3cd' } },
              { range: 'B2:B7', when: { op: 'top', a: '2' }, style: { b: true } },
            ],
            formats: { B: 'currency' },
            widths: { A: 120, B: 140 },
          },
        ],
      },
    },
    {
      name: 'excel-charts',
      title: 'Charts',
      model: {
        sheets: [
          {
            name: 'Charts',
            header: true,
            rows: [
              ['Month', 'Beans', 'Peas', 'Squash'],
              ['Jan', 12, 8, 3],
              ['Feb', 15, 9, 5],
              ['Mar', 22, 14, 9],
              ['Apr', 30, 21, 14],
              ['May', 41, 26, 22],
              ['Jun', 38, 30, 27],
            ],
            widths: { A: 70, B: 70, C: 70, D: 70 },
            charts: [
              { kind: 'column', range: 'A1:D7', title: 'Harvest by month', at: 'F1:L15', yTitle: 'kg' },
              { kind: 'bar', range: 'A1:C7', title: 'Bars, stacked', stacked: true, at: 'M1:S15', legend: 'right' },
              { kind: 'line', range: 'A1:D7', title: 'Lines', at: 'F17:L31', legend: 'top' },
              { kind: 'area', range: 'A1:C7', title: 'Area', at: 'M17:S31' },
              { kind: 'pie', range: 'A1:B7', title: 'Beans by month', at: 'F33:L47' },
              { kind: 'doughnut', range: 'A1:A7,D1:D7', title: 'Squash', at: 'M33:S47', legend: 'none' },
              { kind: 'scatter', range: 'B1:C7', title: 'Peas against beans', at: 'F49:L63', xTitle: 'Beans', yTitle: 'Peas', colors: ['#c5221f'] },
            ],
          },
        ],
      },
    },
    {
      name: 'excel-notes',
      title: 'Notes and pages',
      model: {
        sheets: [
          {
            name: 'Log',
            header: true,
            rows: [
              ['Day', 'What happened', 'Hours', 'Cost'],
              ...Array.from({ length: 90 }, (_, i) => [
                `2026-0${1 + Math.floor(i / 30)}-${String(1 + (i % 28)).padStart(2, '0')}`,
                ['Watered', 'Weeded the beds', 'Mended the fence by the shed', 'Planted', 'Harvested beans'][i % 5],
                1 + (i % 4),
                5 * (i % 7),
              ]),
            ],
            formats: { A: 'date', D: 'currency' },
            widths: { A: 100, B: 260, C: 70, D: 90 },
            notes: { B2: 'The first watering of the year', C5: 'Two people' },
            comments: [
              { id: 'k1', cell: 'B3', by: 'user', author: 'Maria Lopez', text: 'Was this the morning?', at: now, replies: [{ by: 'agent', text: 'Yes, before nine.', at: now + 60000 }] },
              { id: 'k2', cell: 'D4', by: 'agent', text: 'Checked against the receipt.', at: now + 120000, resolved: true },
            ],
          },
          {
            name: 'Wide',
            rows: [Array.from({ length: 16 }, (_, c) => `Column ${c + 1}`), ...Array.from({ length: 6 }, (_, r) => Array.from({ length: 16 }, (_, c) => (r + 1) * (c + 1)))],
            widths: Object.fromEntries(Array.from({ length: 16 }, (_, c) => [String.fromCharCode(65 + c), 90])),
          },
        ],
      },
    },
  ];
}
