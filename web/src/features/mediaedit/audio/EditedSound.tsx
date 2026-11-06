// What edit_audio made, with the agent's reply: while ffmpeg works, a line saying so; then the sound as generate_audio's
// card shows it (to play, edit again, download and keep in the Library); when it could not be made, why.
import type { ToolItem } from '@shared/types';
import { Throbber } from '../../../components/ui';
import { GeneratedAudio } from '../../images/GeneratedAudio';

export function EditedSound({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  if (t.status === 'running' || t.status === 'pending' || t.status === 'waiting')
    return (
      <div className="tl-item my-1.5 flex items-center gap-2 text-[13px] text-fg-2">
        <Throbber size={13} />
        Editing the sound
      </div>
    );
  return <GeneratedAudio item={item} sessionKey={sessionKey} />;
}
