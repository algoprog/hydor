export function slugify(text, { maxLength = 60, separator = '-' } = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const words = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = words.join(separator).slice(0, maxLength);
  while (slug.endsWith(separator)) slug = slug.slice(0, -separator.length);
  return slug;
}
