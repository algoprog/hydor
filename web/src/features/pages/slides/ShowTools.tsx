// What the app adds to a slideshow, in each window that shows one (the slideshow, the presenter's view, the audience's
// window): your camera in a round bubble (V, or the camera button among the slideshow's controls) and your phone as
// the remote (the phone button), both drawn over the slides, inside what goes full screen.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Deck } from '@shared/slides';
import type { Show, ShowExtra } from '@shared/slides-runtime';
import { tr } from '../../../i18n/runtime';
import { CameraBubble, useCamera } from './Camera';
import { useRemote } from './Remote';

/** A short word over the slides (the camera could not start, say), gone after a few seconds or a click. */
export function ShowNote({ text, onDone }: { text: string; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => done.current(), 5000);
    return () => window.clearTimeout(t);
  }, [text]);
  return (
    <button type="button" onClick={onDone} className="absolute top-4 left-1/2 z-[7] max-w-[min(90vw,460px)] -translate-x-1/2 rounded-xl bg-[#1c1c1f]/95 px-3.5 py-2 text-left text-[13px] leading-snug text-[#ecebe8] shadow-xl ring-1 ring-white/10">
      {text}
    </button>
  );
}

/**
 * The camera and the phone remote for a slideshow: `extras` go to the runtime's controls, `attach` gives them the
 * slideshow once made, `moved` and `blanked` tell the phone where it is, `overlays` go over the slides.
 */
export function useShowTools(o: { deck: Deck | null; pageId?: string; title?: string; camera?: boolean }) {
  const [camOn, setCamOn] = useState(!!o.camera);
  const cam = useCamera(camOn);
  const remote = useRemote({ deck: o.deck, pageId: o.pageId, title: o.title });
  const show = useRef<Show | null>(null);
  const toggle = useRef(remote.toggle);
  toggle.current = remote.toggle;
  const extras = useMemo<ShowExtra[]>(
    () => [{ id: 'camera', icon: 'camera', label: tr('Your camera (V)'), key: 'v', run: () => setCamOn((c) => !c) }, ...(o.pageId ? [{ id: 'remote', icon: 'phone' as const, label: tr('Phone remote'), run: () => toggle.current() }] : [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => show.current?.extra('camera', camOn), [camOn]);
  useEffect(() => show.current?.extra('remote', remote.on), [remote.on]);
  const overlays = (
    <>
      {camOn && cam.stream && <CameraBubble stream={cam.stream} onHide={() => setCamOn(false)} />}
      {camOn && cam.error && <ShowNote text={cam.error} onDone={() => setCamOn(false)} />}
      {remote.panel}
    </>
  );
  return {
    extras,
    overlays,
    attach: (s: Show | null) => {
      show.current = s;
      remote.attach(s);
      s?.extra('camera', camOn);
    },
    moved: remote.moved,
    blanked: remote.blanked,
    camOn,
    setCamOn,
  };
}
