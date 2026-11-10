const CATALOG = {
  info: ['overview', 'totals'],
  warn: ['late payments'],
  error: [],
};

export function catalog(kind) {
  return CATALOG[kind] ?? [];
}
