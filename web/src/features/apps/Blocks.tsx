// Blocks in Add a step: templates made to be steps of others (yours marked A block, and the ready-made ones),
// as a row of chips under the kinds of step, so the menu stays short. Picking one puts in a Call an app step
// that runs it, its form's answers to fill in (those the template's own form has by the same name, given).
import type { AppDef, AppTemplate } from '@shared/apps';
import type { Ctx } from './StepsEditor';

export function BlockChips({ ctx, onPick }: { ctx: Ctx; onPick: (b: AppDef | AppTemplate) => void }) {
  const { mine, ready } = ctx.blocks;
  if (!mine.length && !ready.length) return null;
  const chip = 'h-7 rounded-full border border-line-2 bg-bg-1 px-2.5 text-[12.5px] hover:border-fg-3 hover:bg-bg-2';
  return (
    <div className="border-t border-line px-2.5 pt-2 pb-2.5">
      <div className="mb-1.5 text-[11.5px] font-medium text-fg-3">Blocks</div>
      <div className="flex flex-wrap gap-1.5">
        {mine.map((a) => (
          <button key={a.id} type="button" title={a.description || undefined} className={chip} onClick={() => onPick(a)} translate="no">
            {a.name}
          </button>
        ))}
        {ready.map((t) => (
          <button key={t.id} type="button" title={t.description} className={chip} onClick={() => onPick(t)}>
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
