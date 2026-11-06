// The editors' AI tools' dialogs, loaded the first time one is asked for: the one open, handing what it made to the
// editor that asked (closeTool), or, for a video still being made, handing it over to be followed (videoJobs.ts). A
// picture with no OpenRouter key may be drawn instead (SVG, which needs none): the drawing goes to the editor as the
// picture would have.
import { useState } from 'react';
import { EditPicture } from './EditPicture';
import { MakeDrawing } from './MakeDrawing';
import { MakePicture } from './MakePicture';
import { MakePlot } from './MakePlot';
import { MakeVideo } from './MakeVideo';
import { closeTool, letGo, type DrawingOpts, type StudioAsk } from './store';
import { follow } from './videoJobs';

export default function Dialogs({ ask }: { ask: StudioAsk & { n: number } }) {
  // A picture asked for, made as a drawing instead (it needs no OpenRouter key): the same answer to the editor.
  const [drawing, setDrawing] = useState<DrawingOpts | null>(null);
  const done = (made: unknown) => closeTool(ask.n, made);
  switch (ask.tool) {
    case 'picture':
      return drawing ? <MakeDrawing o={drawing} onDone={done} /> : <MakePicture o={ask.o} onDone={done} onDraw={setDrawing} />;
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
