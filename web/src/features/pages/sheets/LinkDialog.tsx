// Insert → Link: a cell's link, to a web address or to a place in the workbook (a sheet's cell or range, or a named
// range), with the words the cell shows when it has none.
import { useState } from 'react';
import { cleanLink } from '@shared/sheets';
import { Button, cx, Dialog, inputCls } from '../../../components/ui';

export function LinkDialog({ link, text, places, onApply, onClose }: { link?: string; text: string; places: string[]; onApply: (link: string | null, text: string) => void; onClose: () => void }) {
  const [to, setTo] = useState(link ? (link.startsWith('#') ? link.slice(1) : link) : '');
  const [words, setWords] = useState(text);
  // A place in the workbook (Sheet2!A1, a named range) or a web address.
  const inside = (t: string) => /^[^/:.\s][^/]*![A-Za-z$]+[$\d]+(:[A-Za-z$]+[$\d]+)?$/.test(t) || places.some((p) => p.toLowerCase() === t.toLowerCase());
  const target = to.trim() ? (inside(to.trim()) ? `#${to.trim()}` : cleanLink(to.trim())) : null;
  return (
    <Dialog
      open
      onClose={onClose}
      width={440}
      title="Link"
      footer={
        <>
          {link && (
            <Button variant="ghost" className="mr-auto text-err" onClick={() => (onApply(null, words), onClose())}>
              Remove the link
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!target} onClick={() => target && (onApply(target, words), onClose())}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <div className="mb-1 text-[12.5px] font-medium text-fg-2">Text</div>
          <input value={words} onChange={(e) => setWords(e.target.value)} placeholder="What the cell shows" className={cx(inputCls, 'text-[13.5px]')} translate="no" />
        </label>
        <label className="block">
          <div className="mb-1 text-[12.5px] font-medium text-fg-2">Link to</div>
          <input autoFocus value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && target && (onApply(target, words), onClose())} placeholder="example.com, or a place: Sheet2!A1" className={cx(inputCls, 'text-[13.5px]')} translate="no" list="sheet-link-places" />
          <datalist id="sheet-link-places">
            {places.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        {to.trim() && !target && <div className="text-[12.5px] text-err">That is no web address, nor a place in this workbook.</div>}
      </div>
    </Dialog>
  );
}
