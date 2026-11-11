import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../src/report.mjs';

const r = (date, customer, sku, qty, unitPrice, region) => ({ date, customer, sku, qty, unitPrice, region });

const rows = [
  r('2025-01-03', 'Ana Silva', 'AB-1234', 3, 2.5, 'North'),
  r('2025-01-09', 'Bo Berg', 'XY99', 10, 1.459, 'South'),
  r('2025-01-15', 'Ana Silva', '10442', 2, 8, 'North'),
  r('2025-01-20', 'Émile Roux', 'AB-1234', 1, 2.5, 'East'),
  r('2025-02-02', 'emile roux', 'QQ-RT-55', 4, 12.25, 'East'),
  r('2025-02-05', 'Ana Silva', 'XY99', 6, 1.459, 'South'),
  r('2025-02-11', 'Bo Berg', 'ab12', 1, 99.9, 'South'),
  r('2025-02-14', 'Zoë Lee', '7', 5, 0.5, 'West'),
  r('2025-02-21', 'Zoe Lee', 'AB-1234', 2, 2.5, 'West'),
  r('2025-02-28', 'Ana Silva', 'MM-1', 1, 3, 'North'),
  r('2025-03-01', 'Bo Berg', 'QQ-RT-55', 2, 12.25, 'North'),
  r('2025-03-04', 'Ana Silva', 'XY99', 1, 1.459, 'East'),
  r('2025-03-08', 'Åsa Berg', 'ZZ100', 7, 4.2, 'South'),
  r('2025-03-12', 'Ana Silva', '7', 3, 0.5, 'North'),
  r('2025-03-17', 'Bo Berg', 'XY99', 8, 1.459, 'West'),
  r('2025-03-19', 'Émile Roux', '10442', 1, 8, 'East'),
  r('2025-03-25', 'Ana Silva', 'AB--12', 2, 5, 'South'),
  r('2025-03-30', 'Zoë Lee', 'ZZ100', 1, 4.2, 'West'),
  r('2025-03-31', 'Bo Berg', 'AB-1234', 9, 2.5, 'North'),
  r('2025-03-31', 'Ana Silva', 'ZZ100', 2, 4.2, 'East'),
];

const expected = `Revenue by customer
Bo Berg                                 173.16
Ana Silva                                56.61
emile roux                               49.00
Åsa Berg                                 29.40
Émile Roux                               10.50
Zoë Lee                                   6.70
Zoe Lee                                   5.00

Revenue by month
2025-01        4           40.59
2025-02        6          168.15
2025-03       10          121.63

Top SKUs by quantity
XY99                                      25
AB-1234                                   15
ZZ100                                     10
7                                          8
QQ-RT-55                                   6
10442                                      3
AB--12                                     2
ab12                                       1
MM-1                                       1

Invalid SKUs
Rows with an invalid SKU: 7
  "10442"
  "ab12"
  "7"
  "MM-1"
  "AB--12"

Median order by region
East                    8.00
North                  11.75
South                  14.59
West                    4.60

Customers active every month
  Ana Silva
  Bo Berg
`;

test('the report for twenty hand-written rows', () => {
  assert.equal(buildReport(rows), expected);
});

test('an empty list of rows gives six headings and nothing under them', () => {
  assert.equal(
    buildReport([]),
    'Revenue by customer\n\nRevenue by month\n\nTop SKUs by quantity\n\nInvalid SKUs\nRows with an invalid SKU: 0\n\nMedian order by region\n\nCustomers active every month\n',
  );
});
