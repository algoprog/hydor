// Spaces → Shared knowledge: documents every session searches (in a space too, unless the space leaves them
// out). Drop files or a folder onto a knowledge base (they are copied into the app), or add a folder on this
// computer (read where it is and kept up to date); try a search the way agents do. A space's own documents
// are on its Memory tab. New documents also update the shared wiki memory, when that and learning from documents are on.
import { FolderPlus, Library, Plus } from 'lucide-react';
import type { KnowledgeBase } from '@shared/knowledge';
import { Button, cx, Empty, Throbber, useMediaQuery } from '../../components/ui';
import { post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import type { PickedFile } from '../../lib/upload';
import { NavButton, PageHeader } from '../layout/PageHeader';
import { SpacesTabs } from '../spaces/parts';
import { ProjectsColumn } from '../spaces/ProjectsColumn';
import { useWikiSettings } from '../wiki/spaceMemory';
import { useSpaces } from '../spaces/state';
import { addFiles, BaseCard, DropFiles, MeaningHint, MeaningWait, TrySearch, useKnowledge } from './parts';

export function KnowledgePage() {
  const [st, load] = useKnowledge();
  const spaces = useSpaces();
  const wiki = useWikiSettings();
  // On a computer the Projects column is beside the page and its title row stands where the header was; a phone and a narrow window keep the header and its tabs.
  const wide = useMediaQuery('(min-width: 1024px)');
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
  const newButton = shared.length > 0 && (
    <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => void newBase()}>
      <span className="max-sm:hidden">New knowledge base</span>
      <span className="sm:hidden">New</span>
    </Button>
  );
  return (
    <div className="flex h-full min-h-0">
      {wide && <ProjectsColumn place="shared" tip="knowledge" />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!wide && (
          <PageHeader title="Projects" tip="knowledge" sub="Documents every session can search and cite" actions={newButton}>
            <SpacesTabs tab="shared" />
          </PageHeader>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {wide && (
            <div className="mx-auto max-w-[1120px] px-3 pt-4 sm:px-6 sm:pt-5">
              <div className="flex min-h-8.5 flex-wrap items-center gap-x-3 gap-y-2">
                <NavButton />
                <h1 className="sr-only">Projects</h1>
                <h2 className="min-w-0 truncate text-[17px] font-semibold tracking-tight">Shared knowledge</h2>
                <span className="flex-1" />
                {newButton}
              </div>
              <div className="mt-0.5 text-[13px] text-fg-3">Documents every session can search and cite</div>
            </div>
          )}
          <div className={cx('mx-auto max-w-[880px] space-y-5 px-3 sm:px-6', wide ? 'pt-4 pb-5' : 'py-5')}>
            {wiki?.enabled && wiki.fromDocuments && (
              <p className="text-[12.5px] text-fg-3">
                New documents here also update the shared wiki memory.{' '}
                <button type="button" onClick={() => go('/settings?s=memory')} className="font-medium text-accent hover:underline">
                  Settings → Memory
                </button>
              </p>
            )}
            {!st ? (
              <div className="flex justify-center py-10 text-fg-3">
                <Throbber size={28} />
              </div>
            ) : !shared.length ? (
              <div className="space-y-4">
                <Empty icon={<Library size={22} />} title="Add your documents once">
                  Contracts, manuals, notes, papers, a whole folder: every session can then search them, by their words or by what they mean, and cites the file and page it read. A
                  project can have documents of its own too, on its Memory tab.
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
                <MeaningWait st={st} bases={shared} />
                {shared.map((b) => (
                  <BaseCard key={b.id} b={b} meaning={st.meaning} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
