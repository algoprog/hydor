// The right-click menu of one of your own tabs in the desktop app, in the app's own look and language (the system's menu
// looked like nothing else here). The desktop app finds what is where you clicked (a link, a picture, selected words, a
// field, one of your highlights), sends the menu's items, and does what you pick (desktop/browser.cjs); the page goes
// away under the menu while it is open, a picture of it in its place (NativePage).
import { useRef, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookPlus,
  ClipboardPaste,
  Clock,
  Code,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  Highlighter,
  Image,
  ImagePlus,
  Link,
  Plus,
  Printer,
  Redo2,
  RotateCw,
  Scissors,
  Search,
  Sparkles,
  SpellCheck,
  Star,
  TextSelect,
  Undo2,
} from 'lucide-react';
import { ContextMenu, type MenuEntry } from '../pages/common/menus';
import type { PageMenuItem, PageMenuRequest } from './PageView';

/** Each item's icon and words, by its id. An item this does not know keeps the desktop app's own words. */
const KNOWN: Record<string, [ReactNode, string]> = {
  'open-link': [<Plus size={14} />, 'Open link in new tab'],
  'open-link-external': [<ExternalLink size={14} />, 'Open link in your default browser'],
  'copy-link': [<Link size={14} />, 'Copy link address'],
  'read-link-later': [<Clock size={14} />, 'Read link later'],
  'open-image': [<Image size={14} />, 'Open image in new tab'],
  'save-image-as': [<Download size={14} />, 'Save image as…'],
  'save-image-library': [<ImagePlus size={14} />, 'Save image to Library'],
  'ask-image': [<Sparkles size={14} />, 'Ask about this image'],
  'copy-image': [<Copy size={14} />, 'Copy image'],
  'copy-image-address': [<Link size={14} />, 'Copy image address'],
  undo: [<Undo2 size={14} />, 'Undo'],
  redo: [<Redo2 size={14} />, 'Redo'],
  cut: [<Scissors size={14} />, 'Cut'],
  copy: [<Copy size={14} />, 'Copy'],
  paste: [<ClipboardPaste size={14} />, 'Paste'],
  'select-all': [<TextSelect size={14} />, 'Select all'],
  highlight: [<Highlighter size={14} />, 'Highlight'],
  'remove-highlight': [<Eraser size={14} />, 'Remove highlight'],
  back: [<ArrowLeft size={14} />, 'Back'],
  forward: [<ArrowRight size={14} />, 'Forward'],
  reload: [<RotateCw size={14} />, 'Reload'],
  bookmark: [<Star size={14} />, 'Bookmark this page'],
  'read-later': [<Clock size={14} />, 'Read this page later'],
  print: [<Printer size={14} />, 'Print…'],
  inspect: [<Code size={14} />, 'Inspect'],
  'no-suggestions': [<SpellCheck size={14} />, 'No suggestions'],
  'add-to-dictionary': [<BookPlus size={14} />, 'Add to dictionary'],
};

/** An item as the app's menus have it: its icon, its words in the app's language, and what a press does. */
function entry(it: PageMenuItem, pick: (id: string) => void): MenuEntry {
  if ('type' in it) return '-';
  const known = KNOWN[it.id];
  const a = it.args ?? {};
  // The words selected go in quotes, as they are; a suggested spelling is a word of the page's, never the app's.
  const label =
    it.id === 'search' && a.engine ? `Search ${a.engine} for “${a.text ?? ''}”` : it.id === 'ask' ? `Ask an agent about “${a.text ?? ''}”` : (known?.[1] ?? it.label);
  const icon = it.id === 'search' ? <Search size={14} /> : it.id === 'ask' ? <Sparkles size={14} /> : known?.[0];
  return { label, icon, disabled: !it.enabled, asIs: it.id.startsWith('spell-'), run: () => pick(it.id) };
}

/**
 * The menu, open at the point clicked until something is picked (the desktop app does it) or Esc or a press outside closes
 * it: onPick hears which (null: none), once.
 */
export function PageMenu({ req, onPick, onDone }: { req: PageMenuRequest; onPick: (item: string | null) => void; onDone: () => void }) {
  const ended = useRef(false);
  const picked = useRef<string | null>(null);
  const done = useRef({ onPick, onDone });
  done.current = { onPick, onDone };
  // A press closes the menu first and runs the item right after (menus.tsx): its id is known by the time this ends it.
  const end = () => {
    if (ended.current) return;
    ended.current = true;
    queueMicrotask(() => {
      done.current.onPick(picked.current);
      done.current.onDone();
    });
  };
  const items = req.items.map((it) =>
    entry(it, (id) => {
      picked.current = id;
      end();
    }),
  );
  // A little wider than the app's other menus: a page's items name what they act on ("Open link in your default browser").
  return <ContextMenu at={{ x: req.x, y: req.y }} items={items} onClose={end} title="Page" width={280} />;
}
