// Spaces → Shared knowledge: documents every session searches (in a space too, unless the space leaves them
// out). Drop files or a folder onto a knowledge base (they are copied into the app), or add a folder on this
// computer (read where it is and kept up to date); try a search the way agents do. A space's own documents
// are on its Knowledge tab.
import { FolderPlus, Library, Plus } from 'lucide-react';
import type { KnowledgeBase } from '@shared/knowledge';
import { Button, Empty, Throbber } from '../../components/ui';
import { post } from '../../lib/api';
import { toastError } from '../../lib/store';
import type { PickedFile } from '../../lib/upload';
import { PageHeader } from '../layout/PageHeader';
import { SpacesTabs } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { addFiles, BaseCard, DropFiles, MeaningHint, TrySearch, useKnowledge } from './parts';

export function KnowledgePage() {
  const [st, load] = useKnowledge();
  const spaces = useSpaces();
  // Shared: in no space (or in one that is gone).
  const shared = st?.bases.filter((b) => !b.space || (spaces && !spaces.some((s) => s.id === b.space))) ?? [];
  const newBase = async () => {
    try {
      await post('/api/knowledge', { name: shared.length ? 'New knowledge base' : 'My documents' });
      load();
    } catch (e) {
      toastError(e);
    }
  };
  /** Files dropped before there is any base: one is made for them. */
  const firstFiles = async (picked: PickedFile[]) => {
    try {
      const b = await post<KnowledgeBase>('/api/knowledge', { name: 'My documents' });
      await addFiles(b, picked);
      load();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Spaces"
        sub="Documents every session can search and cite"
        actions={
          shared.length > 0 && (
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => void newBase()}>
              <span className="max-sm:hidden">New knowledge base</span>
              <span className="sm:hidden">New</span>
            </Button>
          )
        }
      >
        <SpacesTabs tab="shared" />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] space-y-5 px-3 py-5 sm:px-6">
          {!st ? (
            <div className="flex justify-center py-10 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : !shared.length ? (
            <div className="space-y-4">
              <Empty icon={<Library size={22} />} title="Add your documents once">
                Contracts, manuals, notes, papers, a whole folder: every session can then search them, by their words or by what they mean, and cites the file and page it read. A
                space can have documents of its own too, on its Knowledge tab.
              </Empty>
              <DropFiles big onFiles={(p) => void firstFiles(p)} />
              <div className="text-center">
                <Button variant="ghost" icon={<FolderPlus size={14} />} onClick={() => void newBase()}>
                  Start with a folder on this computer instead
                </Button>
              </div>
            </div>
          ) : (
            <>
              <TrySearch space={null} />
              {!st.meaning && <MeaningHint />}
              {shared.map((b) => (
                <BaseCard key={b.id} b={b} meaning={st.meaning} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
