// An HTML file made with the page kit (its body is .n-page, as agents make pages) shown as a page the way the app
// shows such a page in the conversation and on a page's canvas: with the kit's stylesheet and in the app's theme (its
// light or dark, your own colours and font), its pictures and styles loaded from its own folder through the file's
// short-lived link. In a frame of its own, as other HTML files show, it had no colours, borders or font: those are
// the kit's variables. Loaded only when such a file is shown (FileEditor).
import { Throbber } from '../../components/ui';
import { PageFrame, shownStore, withBase } from '../pages/frame';

/** `url`: the file's link (/api/fs/view-link), whose folder its own addresses resolve against; null while it comes. */
export function KitPage({ html, url, path, title }: { html: string; url: string | null; path: string; title: string }) {
  if (!url) {
    return (
      <div className="relative z-10 flex h-full items-center justify-center bg-bg text-fg-3">
        <Throbber size={34} />
      </div>
    );
  }
  const href = new URL(url, location.href).href;
  const base = href.slice(0, href.lastIndexOf('/') + 1);
  return (
    <div className="relative z-10 h-full w-full bg-bg">
      <PageFrame html={withBase(html, base)} title={title} store={shownStore(`file:${path}`)} fill className="absolute inset-0 h-full w-full" />
    </div>
  );
}
