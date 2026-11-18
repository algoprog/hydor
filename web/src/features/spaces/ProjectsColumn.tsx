// The column beside the rail on the Projects pages (the index, Shared knowledge and each project's own pages), the
// same kind as the Library's and the Apps page's: the logo with New project and Hide sidebar on top, then All
// projects and Shared knowledge, and a row for each project (its mark, its name, its sessions), the open place lit.
import { useState } from 'react';
import { Boxes, Library, Plus } from 'lucide-react';
import { Button } from '../../components/ui';
import { go } from '../../lib/nav';
import { PlaceRow, PlacesLabel } from '../layout/PlaceRow';
import { SideColumn } from '../layout/SideColumn';
import { NewSpaceDialog, SpaceMark } from './parts';
import { useSpaces } from './state';

/** `place`: All projects or Shared knowledge; `project`: the id of the project whose own pages are open. `tip`: the tip the logo points at. */
export function ProjectsColumn({ place, project, tip }: { place?: 'all' | 'shared'; project?: string; tip?: 'spaces' | 'knowledge' }) {
  const spaces = useSpaces();
  const [making, setMaking] = useState(false);
  return (
    <SideColumn
      label="Projects"
      tip={tip}
      actions={
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setMaking(true)}>
          New project
        </Button>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-4">
        <nav aria-label="Places in Projects" className="space-y-0.5">
          <PlaceRow on={place === 'all'} icon={<Boxes size={15} className="text-fg-3" />} label="All projects" count={spaces?.length} onClick={() => go('/projects')} />
          <PlaceRow on={place === 'shared'} icon={<Library size={15} className="text-fg-3" />} label="Shared knowledge" onClick={() => go('/knowledge')} />
          {!!spaces?.length && (
            <>
              <PlacesLabel>Projects</PlacesLabel>
              {spaces.map((s) => (
                <PlaceRow key={s.id} mine on={project === s.id} icon={<SpaceMark s={s} size={18} />} label={s.name} count={s.sessions} onClick={() => go(`/projects/${s.id}`)} />
              ))}
            </>
          )}
        </nav>
      </div>
      <NewSpaceDialog open={making} group={false} onClose={() => setMaking(false)} onMade={(s) => go(`/projects/${s.id}`)} />
    </SideColumn>
  );
}
