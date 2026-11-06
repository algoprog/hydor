// Translate the slides (Tools → Translate the slides): the editor's agent is asked to translate every slide's words and
// speaker notes into a language, keeping each slide's layout and shortening words where they no longer fit. The request
// goes through the Ask panel (the page's agent, which sees the deck and saves a new version, shown as it comes), its
// words written in it for the user to send; a language not in the menu is typed in a small dialog.
import { useState } from 'react';
import { cleanLang } from '@shared/write';
import { Button, Dialog, inputCls } from '../../../components/ui';
import { openPageAsk } from '../AskPage';

/** What the agent is asked, for a language by its English name. */
export const translateRequest = (lang: string) =>
  `Translate the words of every slide into ${lang}: text boxes, shapes, tables, charts’ titles and labels, quizzes and speaker notes. Keep each slide’s layout, theme, pictures, animations and transitions as they are; where translated words no longer fit their box, shorten them a little or make their text a little smaller (never under 18 px). Keep names, numbers and code as they are.`;

/** Opens the Ask panel with the request written, for every slide. */
export function askToTranslate(lang: string) {
  openPageAsk({ draft: translateRequest(lang), scope: 'all' });
}

/** A language typed in, for one the menu does not list. */
export function TranslateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [words, setWords] = useState('');
  const lang = cleanLang(words);
  const go = () => {
    if (!lang) return;
    onClose();
    setWords('');
    askToTranslate(lang);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Translate the slides"
      width={420}
      footer={
        <Button size="sm" variant="primary" disabled={!lang} onClick={go}>
          Ask the agent
        </Button>
      }
    >
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <p className="text-[12.5px] text-fg-3">The language to translate every slide’s words and notes into. An agent does it, keeping the slides’ layout; you see each slide change as it is saved.</p>
        <input autoFocus value={words} onChange={(e) => setWords(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Swahili, Hebrew, Thai…" aria-label="The language" className={inputCls} />
      </form>
    </Dialog>
  );
}
