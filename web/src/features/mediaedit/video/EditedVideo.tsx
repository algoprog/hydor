// What edit_video made, with the agent's reply: while ffmpeg works, a line saying so; then the video as generate_video's
// card shows it (to play, download, edit again and keep in the Library), or a frame or a GIF as generate_image's card
// shows pictures; when it could not be made, why.
import type { ToolItem } from '@shared/types';
import { Throbber } from '../../../components/ui';
import { GeneratedImages, picsOf } from '../../images/GeneratedImages';
import { GeneratedVideos } from '../../images/GeneratedVideos';

export function EditedVideo({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  if (t.status === 'running' || t.status === 'pending' || t.status === 'waiting')
    return (
      <div className="tl-item my-1.5 flex items-center gap-2 text-[13px] text-fg-2">
        <Throbber size={13} />
        Editing the video
      </div>
    );
  // A frame or a GIF is a picture; anything else (a video, or why there is none) shows as a video's card does.
  return picsOf(t.output).length ? <GeneratedImages item={item} sessionKey={sessionKey} /> : <GeneratedVideos item={item} sessionKey={sessionKey} />;
}
