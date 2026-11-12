// The question asked before a file with changes not saved is closed or left (unsaved.ts): Save, Don't save or Cancel.
// Shown once on the Files page, whichever file's tab asks.
import { basename } from '../../lib/format';
import { Button, Dialog } from '../../components/ui';
import { useFiles } from './unsaved';

export function UnsavedDialog() {
  const asking = useFiles((s) => s.asking);
  const answer = (a: 'save' | 'discard' | 'cancel') => asking?.resolve(a);
  return (
    <Dialog
      open={!!asking}
      onClose={() => answer('cancel')}
      title="Save the changes?"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={() => answer('cancel')}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => answer('discard')}>
            Don't save
          </Button>
          <Button variant="primary" onClick={() => answer('save')} autoFocus>
            Save
          </Button>
        </>
      }
    >
      <div className="text-[14px] leading-relaxed text-fg-2">
        <span translate="no" className="font-medium text-fg">
          {asking ? basename(asking.path) : ''}
        </span>{' '}
        has changes that are not saved. Closing it now would lose them.
      </div>
    </Dialog>
  );
}
