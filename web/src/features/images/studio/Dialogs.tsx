// The editors' AI tools' dialogs, loaded the first time one is asked for: the one open, handing what it made to the
// editor that asked (closeTool), or, for a video still being made, handing it over to be followed (videoJobs.ts).
import { EditPicture } from './EditPicture';
import { MakeDrawing } from './MakeDrawing';
import { MakePicture } from './MakePicture';
import { MakePlot } from './MakePlot';
import { MakeVideo } from './MakeVideo';
import { closeTool, letGo, type StudioAsk } from './store';
import { follow } from './videoJobs';

export default function Dialogs({ ask }: { ask: StudioAsk & { n: number } }) {
  const done = (made: unknown) => closeTool(ask.n, made);
  switch (ask.tool) {
    case 'picture':
      return <MakePicture o={ask.o} onDone={done} />;
    case 'edit':
      return <EditPicture o={ask.o} onDone={done} />;
    case 'drawing':
      return <MakeDrawing o={ask.o} onDone={done} />;
    case 'plot':
      return <MakePlot o={ask.o} onDone={done} />;
    case 'video':
      return (
        <MakeVideo
          o={ask.o}
          onDone={done}
          onLetGo={(job, prompt) => {
            const d = letGo(ask.n);
            if (d) follow(job, prompt, d);
          }}
        />
      );
  }
}
