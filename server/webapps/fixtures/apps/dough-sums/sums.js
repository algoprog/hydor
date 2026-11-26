'use strict';
// The one place the sums are done. The page and /api/work-out both use it.

const FIELDS = {
  loaves: { label: 'Loaves', name: 'the number of loaves', min: 1, max: 60, whole: true, unit: '' },
  loafWeight: { label: 'Loaf weight', name: 'the loaf weight', min: 200, max: 1500, whole: true, unit: ' g' },
  water: { label: 'Water', name: 'the water', min: 50, max: 100, usual: 72, unit: '%' },
  salt: { label: 'Salt', name: 'the salt', min: 0, max: 5, usual: 2, unit: '%' },
  starter: { label: 'Starter', name: 'the starter', min: 0, max: 50, usual: 20, unit: '%' },
};

function readField(key, raw) {
  const f = FIELDS[key];
  const blank = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
  if (blank) {
    if (f.usual !== undefined) return { value: f.usual };
    return { error: `Please put in ${f.name}.` };
  }

  let value = NaN;
  if (typeof raw === 'number') value = raw;
  else if (typeof raw === 'string' && /^-?(\d+(\.\d*)?|\.\d+)$/.test(raw.trim())) value = Number(raw.trim());

  const kind = f.whole ? 'a whole number' : 'a number';
  const rule = `${f.name[0].toUpperCase()}${f.name.slice(1)} must be ${kind} from ${f.min} to ${f.max}${f.unit}.`;
  if (!Number.isFinite(value) || value < f.min || value > f.max) return { error: rule };
  if (f.whole && !Number.isInteger(value)) return { error: rule };
  return { value: value + 0 };
}

// The tiny addition stops an exact half (such as 18.45) being rounded down
// only because of how computers store decimals.
const toGram = (x) => Math.round(x + 1e-9);
const toTenth = (x) => Math.round(x * 10 + 1e-8) / 10;

function workOut(input) {
  const used = {};
  const errors = [];
  for (const key of Object.keys(FIELDS)) {
    const read = readField(key, input[key]);
    if (read.error) errors.push({ field: key, message: read.error });
    else used[key] = read.value;
  }
  if (errors.length) return { ok: false, errors };

  const totalDough = used.loaves * used.loafWeight;
  // All the flour, the starter's included.
  const allFlour = (totalDough * 100) / (100 + used.water + used.salt);
  const allWater = (allFlour * used.water) / 100;
  const salt = (allFlour * used.salt) / 100;
  const starter = (allFlour * used.starter) / 100;
  // The starter is half flour and half water.
  const half = starter / 2;

  return {
    ok: true,
    used,
    result: {
      flour: toGram(allFlour - half),
      water: toGram(allWater - half),
      salt: toTenth(salt),
      starter: toGram(starter),
      totalDough,
    },
    starterBrings: toGram(half),
  };
}

module.exports = { FIELDS, workOut };
