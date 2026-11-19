// The sites you published (/published): a page you made or a project's build (its dist/ folder), each at a private or a
// public link, with Unpublish on its row, and Publish a folder for one that is not a page. Reached from the search box
// and from a page's Share menu. The list is the app's (state.ts), refreshed when the server says sites changed.
import { useEffect, useState } from 'react';
import { Globe, Upload } from 'lucide-react';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, Empty, Throbber } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { PublishDialog, SiteRow } from './parts';
import { usePagesStore } from './state';

export function PublishedPage() {
  const sites = usePagesStore((s) => s.sites);
  const [publish, setPublish] = useState(false);
  useEffect(() => {
    usePagesStore.getState().loadSites().catch(toastError);
  }, []);
  const publishButton = (
    <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => setPublish(true)}>
      Publish a folder
    </Button>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Published" back={{ label: 'Back', onClick: () => go('/') }} actions={sites?.length ? publishButton : undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[920px] px-4 py-5 sm:px-6">
          {!sites ? (
            <div className="flex justify-center py-10 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : !sites.length ? (
            <Empty icon={<Globe size={22} />} title="Nothing published">
              <span className="block">Publish a page from its Share menu, or a project’s build (its dist/ folder), at a private or a public link. Agents can ask to publish too; nothing goes out until you confirm.</span>
              <span className="mt-3 inline-flex">{publishButton}</span>
            </Empty>
          ) : (
            <div className="grid gap-2.5">
              {sites.map((s) => (
                <SiteRow key={s.id} site={s} />
              ))}
            </div>
          )}
        </div>
      </div>
      <PublishDialog open={publish} onClose={() => setPublish(false)} />
    </div>
  );
}
