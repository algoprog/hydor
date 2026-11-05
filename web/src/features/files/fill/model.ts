// What Fill & sign works with: a PDF as the server reads it (pages, form fields and where they are, in points from
// each page's top-left), and the marks the user places on its pages (text boxes, ticks, crosses, signatures).

export interface Widget {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  on?: string;
}

export type FieldKind = 'text' | 'multiline' | 'checkbox' | 'radio' | 'list' | 'dropdown' | 'signature' | 'button';

export interface Field {
  name: string;
  kind: FieldKind;
  value: string | boolean | string[] | null;
  options?: { value: string; label?: string }[];
  label?: string;
  tooltip?: string;
  readOnly?: boolean;
  required?: boolean;
  maxLength?: number;
  comb?: boolean;
  multiSelect?: boolean;
  editable?: boolean;
  password?: boolean;
  signed?: boolean;
  locked?: boolean;
  widgets: Widget[];
}

export interface PdfInfo {
  pages: { width: number; height: number; rotate: number }[];
  encrypted: boolean;
  permissions: { modify: boolean; fillForms: boolean; annotate: boolean } | null;
  signed: boolean;
  certified: number | null;
  form: { fields: Field[]; xfa: boolean; dynamic: boolean };
  mtime: number;
}

export type Tool = 'text' | 'check' | 'cross' | 'date';

/** Something placed on a page, in points from its top-left. */
export interface Mark {
  id: string;
  type: 'text' | 'check' | 'cross' | 'image';
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** text: its words and size (points). */
  text?: string;
  size?: number;
  /** image: what shows it, and the signature it is: a saved one's id, or the PNG of one drawn now. */
  src?: string;
  signature?: string;
  png?: string;
}

/** The value a radio button stands for: its field's choice in its place, or the choice named as its state. */
export function radioValue(f: Field, w: Widget): string | undefined {
  const opts = f.options ?? [];
  const i = f.widgets.indexOf(w);
  return opts.find((o) => o.value === w.on)?.value ?? (opts.length === f.widgets.length ? opts[i]?.value : undefined) ?? w.on;
}

/** The fonts the page shows typed words in: the same widths as the one the PDF gets (Liberation Sans, Arial's). */
export const PAPER_FONT = 'Arial, "Liberation Sans", Helvetica, sans-serif';

let measurer: CanvasRenderingContext2D | null = null;
/** The width of a line of text at `size` (CSS pixels for a size in CSS pixels). */
export function textWidth(s: string, size: number): number {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return s.length * size * 0.55;
  measurer.font = `${size}px ${PAPER_FONT}`;
  return measurer.measureText(s).width;
}

let seq = 0;
export const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;
