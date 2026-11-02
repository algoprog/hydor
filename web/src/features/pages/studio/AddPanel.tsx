// The visual editor's Add: parts to put in the page (words, pictures, buttons), blocks to lay them out
// (columns, cards, a table), and ready-made sections (an opening, features, prices, questions, a footer),
// after the part picked, inside it, or at the end of the page.
import { useState, type ReactNode, type RefObject } from 'react';
import {
  AppWindow,
  BarChart3,
  ChevronsDownUp,
  Columns2,
  Columns3,
  CreditCard,
  Heading,
  HelpCircle,
  Image,
  LayoutGrid,
  Link2,
  List,
  ListOrdered,
  Mail,
  Megaphone,
  Minus,
  MousePointerClick,
  MoveVertical,
  PanelBottom,
  Quote,
  Sparkles,
  Square,
  Star,
  Table,
  TextCursorInput,
  Type,
} from 'lucide-react';
import { cx, Popover, SheetsOnPhone } from '../../../components/ui';
import type { EdSel } from '../frame';
import { BLOCKS, type BlockKind } from './blocks';
import { Choice } from './fields';
import type { Cmd } from './Inspector';

const ICONS: Record<string, ReactNode> = {
  heading: <Heading size={17} />,
  text: <Type size={17} />,
  button: <MousePointerClick size={17} />,
  link: <Link2 size={17} />,
  image: <Image size={17} />,
  list: <List size={17} />,
  quote: <Quote size={17} />,
  divider: <Minus size={17} />,
  space: <MoveVertical size={17} />,
  section: <Square size={17} />,
  columns: <Columns2 size={17} />,
  columns3: <Columns3 size={17} />,
  card: <CreditCard size={17} />,
  cards: <LayoutGrid size={17} />,
  table: <Table size={17} />,
  stats: <BarChart3 size={17} />,
  foldout: <ChevronsDownUp size={17} />,
  field: <TextCursorInput size={17} />,
  hero: <AppWindow size={17} />,
  features: <Sparkles size={17} />,
  pricing: <Star size={17} />,
  steps: <ListOrdered size={17} />,
  faq: <HelpCircle size={17} />,
  testimonial: <Quote size={17} />,
  cta: <Megaphone size={17} />,
  contact: <Mail size={17} />,
  footer: <PanelBottom size={17} />,
};

const KINDS: { value: BlockKind; label: string }[] = [
  { value: 'basic', label: 'Basics' },
  { value: 'layout', label: 'Layout' },
  { value: 'section', label: 'Sections' },
];

type Where = 'after' | 'inside' | 'end';

export function AddPanel({ anchor, open, onClose, sel, cmd }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; sel: EdSel | null; cmd: Cmd }) {
  const [kind, setKind] = useState<BlockKind>('basic');
  const picked = !!sel && sel.tag !== 'body';
  const [where, setWhere] = useState<Where>('after');
  const at: Where = !picked ? 'end' : where === 'inside' && !sel.holds ? 'after' : where;
  return (
    <SheetsOnPhone.Provider value>
      <Popover anchor={anchor} open={open} onClose={onClose} width={344} title="Add to the page">
        <div className="p-1">
          <div role="tablist" className="mb-1.5 flex gap-1">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="tab"
                aria-selected={kind === k.value}
                onClick={() => setKind(k.value)}
                className={cx('h-7.5 flex-1 rounded-lg text-[12.5px] font-medium transition-colors max-md:h-9', kind === k.value ? 'bg-bg-2 text-fg' : 'text-fg-3 hover:text-fg')}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {BLOCKS.filter((b) => b.kind === kind).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onClose();
                  cmd('insert', { html: b.html, edit: b.edit, where: at });
                }}
                className="flex h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border border-line px-1 text-center text-[12px] leading-tight text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-2 hover:text-fg max-md:h-[76px]"
              >
                <span className="text-fg-3">{ICONS[b.id] ?? <Square size={17} />}</span>
                {b.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-line px-1 pt-2">
            <span className="shrink-0 text-[12px] text-fg-3">Put it</span>
            {picked ? (
              <Choice
                value={at}
                onChange={setWhere}
                options={[
                  { value: 'after', label: 'After it', title: `After the ${sel.name.toLowerCase()} picked` },
                  ...(sel.holds ? [{ value: 'inside' as const, label: 'Inside it', title: `At the end of the ${sel.name.toLowerCase()} picked` }] : []),
                  { value: 'end', label: 'At the end', title: 'At the end of the page' },
                ]}
              />
            ) : (
              <span className="text-[12px] text-fg-2">At the end of the page (pick a part to put it after)</span>
            )}
          </div>
        </div>
      </Popover>
    </SheetsOnPhone.Provider>
  );
}
