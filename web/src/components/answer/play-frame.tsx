// The frame of one run of a code playground (uis/code.tsx): its page (playground-doc.ts) in the app's sandboxed page frame,
// as tall as its output up to what a page may stand in a conversation, then it scrolls. Loaded when the first run is made,
// so the page frame's code stays out of the replies that never run anything; a new run is a new `key`.
import { useMemo, useState } from 'react';
import { memoryStore, PageFrame, usePreviewMax } from '../../features/pages/frame';

export default function PlayFrame({ html, title, min = 56 }: { html: string; title: string; min?: number }) {
  const store = useMemo(() => memoryStore(), []);
  const [h, setH] = useState(0);
  const max = usePreviewMax();
  return (
    <div style={{ height: Math.min(Math.max(h || min, min), max) }} className="relative">
      <PageFrame html={html} title={title} store={store} onHeight={setH} />
    </div>
  );
}
