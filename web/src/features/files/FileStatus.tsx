// The strip under a text file in the editor: where the cursor is (line and column, and how many characters are picked),
// the file's language, how it is indented (spaces or tabs, and how many: a click picks another), how its lines end
// (LF or CRLF: a click changes it), and whether long lines wrap. A click on the cursor's place goes to a line.
import { useRef, useState } from 'react';
import { cx, MenuItem, Popover } from '../../components/ui';
import type { EditorStatus } from '../../lib/codemirror';
import type { Indent } from '../../lib/indent';
import type { Eol } from './lineends';

const INDENTS: Indent[] = [
  { kind: 'spaces', size: 2 },
  { kind: 'spaces', size: 4 },
  { kind: 'spaces', size: 8 },
  { kind: 'tabs', size: 4 },
];
const same = (a: Indent, b: Indent) => a.kind === b.kind && a.size === b.size;
const indentLabel = (i: Indent) => (i.kind === 'tabs' ? 'Tabs' : `Spaces: ${i.size}`);

function Part({ children, onClick, title, className, refEl }: { children: React.ReactNode; onClick?: () => void; title?: string; className?: string; refEl?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={refEl} type="button" onClick={onClick} title={title} className={cx('h-full shrink-0 rounded px-1.5 whitespace-nowrap hover:bg-bg-2 hover:text-fg', className)}>
      {children}
    </button>
  );
}

export function FileStatus({
  status,
  eol,
  wrap,
  onEol,
  onWrap,
  onGoto,
  onIndent,
}: {
  status: EditorStatus | null;
  eol: Eol;
  wrap: boolean;
  onEol: () => void;
  onWrap: () => void;
  onGoto: () => void;
  onIndent: (i: Indent) => void;
}) {
  const indentRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  if (!status) return <div className="h-7 shrink-0 border-t border-line" />;
  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-t border-line bg-bg-1 px-2 text-[11.5px] text-fg-3 [&::-webkit-scrollbar]:hidden">
      <Part onClick={onGoto} title="Go to line">
        Ln {status.line}, Col {status.col}
        {status.selected > 0 && <span className="ml-1.5 text-fg-2">({status.selected} selected)</span>}
      </Part>
      <span className="min-w-2 flex-1" />
      <Part className="hidden sm:block" title={`${status.lines} lines`}>
        <span translate="no">{status.language}</span>
      </Part>
      <Part refEl={indentRef} onClick={() => setMenu(true)} title="Indentation">
        {indentLabel(status.indent)}
      </Part>
      <Popover anchor={indentRef} open={menu} onClose={() => setMenu(false)} align="end" width={180} prefer="above" title="Indentation">
        {INDENTS.map((i) => (
          <MenuItem
            key={indentLabel(i)}
            checked={same(i, status.indent)}
            onClick={() => {
              onIndent(i);
              setMenu(false);
            }}
          >
            {indentLabel(i)}
          </MenuItem>
        ))}
      </Popover>
      <Part onClick={onEol} title="How the file's lines end: click to change">
        {eol === 'crlf' ? 'CRLF' : 'LF'}
      </Part>
      <Part onClick={onWrap} title="Word wrap" className={wrap ? 'text-fg-2' : undefined}>
        {wrap ? 'Wrap' : 'No wrap'}
      </Part>
    </div>
  );
}
