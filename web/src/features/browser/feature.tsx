// The agents' web browser: a live view to watch above the message box, taking over to log in, its steps
// and cards in the conversation, and Settings → Browser.
import { useEffect } from 'react';
import { Globe } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { MenuItem } from '../../components/ui';
import type { WebFeature } from '../registry';
import { BrowserDock, showBrowser } from './Dock';
import { BrowserNoteCard } from './Notes';
import { BrowserSettingsBody } from './Settings';
import { BrowserStep } from './Steps';
import { browserCall, listenBrowser, loadBrowser, useBrowser } from './store';

/** In a session's menu: open its browser yourself (to log in before asking the agent), or show it. */
function BrowserMenuItem({ s, close }: { s: SessionSummary; close: () => void }) {
  useEffect(() => {
    listenBrowser();
    void loadBrowser(s.key);
  }, [s.key]);
  const open = useBrowser((x) => !!x.views[s.key]?.open);
  return (
    <MenuItem
      icon={<Globe size={15} />}
      onClick={async () => {
        close();
        if (!open && !(await browserCall(s.key, '/open'))) return;
        showBrowser(s.key);
      }}
    >
      {open ? 'Show the browser' : 'Open a browser'}
    </MenuItem>
  );
}

const step = { place: 'work' as const, Row: BrowserStep };

export const browserFeature: WebFeature = {
  id: 'browser',
  toolViews: {
    browser_open: step,
    browser_act: step,
    browser_read: step,
    browser_tabs: step,
    browser_upload: step,
    browser_ask_user: step,
  },
  noteViews: { browser: BrowserNoteCard },
  SessionDock: BrowserDock,
  SessionMenu: BrowserMenuItem,
  settings: [{ id: 'browser', label: 'Browser', icon: Globe, sub: 'A web browser agents use, which you can watch and take over', Body: BrowserSettingsBody }],
};
