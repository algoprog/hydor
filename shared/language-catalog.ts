// Language supplements are named <language>.<module>.json and merged in stable order.
export type LanguageCatalog = Record<string, string>;

/** Only simple names are accepted so catalog lookup cannot leave its directory. */
export function isLanguageSupplement(name: string, lang: string): boolean {
  return /^[a-z]{2,3}$/.test(lang) && new RegExp(`^${lang}\\.[a-z0-9_-]+\\.json$`).test(name);
}

/** A base translation takes precedence; supplements fill missing entries in filename order. */
export function combineLanguageCatalogs(base: LanguageCatalog, supplements: [string, LanguageCatalog][]): LanguageCatalog {
  const result = { ...base };
  for (const [, supplement] of [...supplements].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    for (const [key, value] of Object.entries(supplement)) {
      if (!Object.hasOwn(result, key)) result[key] = value;
    }
  }
  return result;
}
