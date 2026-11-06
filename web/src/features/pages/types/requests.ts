// What a request made from the gallery (or Turn it into) is: a short line in the person's words and the app's language,
// which is the message they see; what the session is asked to make (`extra.make`), which its agent hears in full from
// the pages capability; and the whole request as the agent would read it, for where a message must carry it all (the
// message box of a conversation beside a page). start.ts starts the session for something new.
import { composeAsk, turnAsk, type ComposeContext, type MakeExtra, type PageKindName } from '@shared/content-asks';
import type { ContentKind, ContentType } from '@shared/content-types';
import { tr } from '../../../i18n/runtime';

export interface MadeRequest {
  /** The message: short, in the person's words. */
  prompt: string;
  /** What the session is asked to make, told to its agent in full. */
  make: MakeExtra;
  /** The whole request, in English, as the agent reads it. */
  full: string;
}

/** "Add a slide after slide 3: SWOT analysis — our market in Greece", in the app's language (the words as written). */
function shortLine(kind: ContentKind, t: ContentType | null, words: string, c: ComposeContext): string {
  const what = t ? tr(t.label) : '';
  const n = c.after ? c.after.index + 1 : 0;
  const base =
    kind === 'slide'
      ? c.after
        ? t
          ? tr(`Add a slide after slide ${n}: ${what}`)
          : tr(`Add a slide after slide ${n}`)
        : t
          ? tr(`Add a slide at the end: ${what}`)
          : tr('Add a slide at the end')
      : kind === 'section'
        ? t
          ? tr(`Add a section: ${what}`)
          : tr('Add a section')
        : kind === 'block'
          ? t
            ? tr(`Add a block to the page: ${what}`)
            : tr('Add a block to the page')
          : kind === 'deck'
            ? t
              ? tr(`Make slides: ${what}`)
              : tr('Make slides')
            : kind === 'doc'
              ? t
                ? tr(`Write a document: ${what}`)
                : tr('Write a document')
              : kind === 'sheet'
                ? t
                  ? tr(`Make a spreadsheet: ${what}`)
                  : tr('Make a spreadsheet')
                : t
                  ? tr(`Make a page: ${what}`)
                  : tr('Make a page');
  const w = words.trim().slice(0, 2000);
  return w ? `${base}${t ? ' — ' : ': '}${w}` : base;
}

/** The request for a kind picked in the gallery (or the words alone), where it goes: its line, what to make, the whole of it. */
export function madeRequest(t: ContentType | null, words: string, c: ComposeContext & { kind: ContentKind }): MadeRequest | null {
  const w = words.trim().slice(0, 2000);
  const kind = t?.kind ?? c.kind;
  if (!t && !w) return null;
  const { kind: _k, ...where } = c;
  const make: MakeExtra = { ...(t ? { type: t.id } : { kind }), ...(w ? { words: w } : {}), ...where };
  return { prompt: shortLine(kind, t, w, c), make, full: composeAsk(t, w, { ...c, kind }) };
}

/** Turn it into: "Turn “Bakery plan” into slides", and what the session makes from which page. */
export function turnRequest(o: { from: PageKindName; to: 'slides' | 'doc' | 'page'; id: string; title: string; folder?: string }): MadeRequest {
  const title = o.title.replace(/\s+/g, ' ').trim().slice(0, 80);
  const prompt = o.to === 'slides' ? tr(`Turn “${title}” into slides`) : o.to === 'doc' ? tr(`Turn “${title}” into a document`) : tr(`Turn “${title}” into a page`);
  const make: MakeExtra = { turn: { from: o.from, to: o.to, id: o.id, title: o.title }, ...(o.folder ? { folder: o.folder } : {}) };
  return { prompt, make, full: turnAsk(o) };
}
