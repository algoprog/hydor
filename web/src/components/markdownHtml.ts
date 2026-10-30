// HTML inside Markdown files and notebook cells (centred titles, sized images, <details>, <kbd>…), the way
// GitHub shows it: kept, minus anything that could run. Loaded only where Markdown documents are shown.
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { enc } from '../lib/api';
import { joinPath } from '../lib/format';
import { mu } from '../lib/machine';

export const htmlSchema = {
  ...defaultSchema,
  strip: [...(defaultSchema.strip ?? []), 'style'],
  tagNames: [...(defaultSchema.tagNames ?? []), 'center', 'font', 'u', 'mark', 'figure', 'figcaption', 'picture'],
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), 'width', 'height', 'align'],
    div: [...(defaultSchema.attributes?.div ?? []), 'align'],
    p: [...(defaultSchema.attributes?.p ?? []), 'align'],
    font: ['color', 'size'],
    code: [['className', /^language-./, 'math-inline', 'math-display']],
  },
  protocols: { ...defaultSchema.protocols, src: [...(defaultSchema.protocols?.src ?? []), 'data', 'attachment'] },
};

/** The rehype plugins that keep a document's HTML. */
export const MD_HTML = [rehypeRaw, [rehypeSanitize, htmlSchema]];

/**
 * Where a document's image is loaded from: files next to it (or anywhere on this machine) through the
 * file server, inline data images as they are. Other sites' images are not loaded (the page's policy
 * blocks them, so they cannot report that the document was opened): null shows them as links.
 */
export function localImages(dir: string, attachments?: Record<string, Record<string, string>>) {
  return (src: string): string | null => {
    if (src.startsWith('attachment:')) {
      const a = attachments?.[decodeURIComponent(src.slice('attachment:'.length))];
      const mime = a && Object.keys(a)[0];
      return mime ? `data:${mime};base64,${String(a[mime]).replace(/\s/g, '')}` : null;
    }
    if (src.startsWith('data:image/')) return src;
    if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return null;
    const file = decodeURIComponent(src.split(/[?#]/)[0]);
    return mu(`/api/fs/raw?path=${enc(file.startsWith('/') ? file : joinPath(dir, file))}`);
  };
}
