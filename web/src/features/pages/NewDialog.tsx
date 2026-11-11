// New in the Library: a page, a design, slides, a document, a spreadsheet, a LaTeX document, a notebook or a diagram.
// What to make is a list on the left (chips across the top on a phone, or below the width of two panes). For it, a box
// at the top to describe it in, for an agent to make, with the kinds agents make best as chips under the words (More
// kinds: all of them, in the gallery); then what to start from yourself, each drawn as it will look (newArt.tsx): a
// page's starters, a design's size and templates, a deck's themes, LaTeX's templates, a blank one, and a file of yours.
// At the bottom its name and the buttons, which follow the box: with words or a kind in it, Make it with AI starts the
// session that makes it at once (Make it yourself makes what is picked instead); else Make it makes what is picked. The
// project it goes in and Upload files are at the foot of the list (on a phone, under the cards and in the bar). It keeps
// its size as the kind changes, and nothing fades in.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Activity,
  AppWindow,
  Backpack,
  Blocks,
  BrainCircuit,
  ChartGantt,
  CircleQuestionMark,
  Clock,
  FileChartColumn,
  FileText,
  FlaskConical,
  GraduationCap,
  IdCard,
  LayoutGrid,
  Mail,
  Megaphone,
  NotebookText,
  Palette,
  PenLine,
  PiggyBank,
  Presentation,
  Quote,
  ReceiptText,
  Rocket,
  Sheet,
  Sigma,
  Sparkles,
  Tags,
  Upload,
  UsersRound,
  Wallet,
  Image as ImageIcon,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ContentKind, ContentType } from '@shared/content-types';
import type { PageInfo } from '@shared/pages';
import { newDeck, THEMES, type Ratio } from '@shared/slides';
import { texFromTemplate, texTemplate, type TexTemplateId } from '@shared/latex-templates';
import { designSize, type DesignSize } from '@shared/design';
import { templateById, templatePage, templatesFor } from '@shared/design-templates';
import { post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, IconButton, inputCls, Segmented, useIsMobile } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { useAskRun } from '../guide/ask';
import { SpaceSelect } from '../spaces/SpacePick';
import { useSpaces } from '../spaces/state';
import { folderChain } from './folders';
import { usePagesStore } from './state';
import { STARTERS } from './templates';
import { appLanguage, openTypes, preloadTypes } from './types';
import { madeRequest } from './types/requests';
import { startMaking } from './types/start';
import { pickFiles } from './uploads';
import { SlideThumb } from './slides/Thumb';
import { myThemeDeck, useMyThemeList, useMyThemes } from './slides/MyThemes';
import { TexTemplateTiles } from './latex/TemplatePicker';
import { fontsOf, NewDesign, paletteOf, type Colours } from './design/NewDesign';
import { useBrand } from './design/brand';
import { AutoWidth, BlankArt, OpenTile, PictureArt, StarterArt, Tile } from './newArt';
import { fitNewSize, NEW_PRESETS, newPictureName, blankSrc, presetOf, type NewBackground } from '../mediaedit/picture/newpicture';
import { openEditor, pageName } from '../mediaedit/host';

export type NewKind = 'page' | 'design' | 'slides' | 'doc' | 'sheet' | 'tex' | 'notebook' | 'diagram' | 'picture';

const KINDS: { value: NewKind; label: string; icon: LucideIcon; colour: string }[] = [
  { value: 'page', label: 'Page', icon: AppWindow, colour: 'var(--accent)' },
  { value: 'design', label: 'Design', icon: Palette, colour: 'var(--viz-5)' },
  { value: 'slides', label: 'Slides', icon: Presentation, colour: 'var(--viz-2)' },
  { value: 'doc', label: 'Document', icon: FileText, colour: 'var(--viz-1)' },
  { value: 'sheet', label: 'Spreadsheet', icon: Sheet, colour: 'var(--viz-3)' },
  { value: 'tex', label: 'LaTeX', icon: Sigma, colour: 'var(--viz-7)' },
  { value: 'notebook', label: 'Notebook', icon: NotebookText, colour: 'var(--viz-4)' },
  { value: 'diagram', label: 'Diagram', icon: Workflow, colour: 'var(--viz-8)' },
  { value: 'picture', label: 'Picture', icon: ImageIcon, colour: 'var(--viz-6)' },
];
const kindOf = (k: NewKind) => KINDS.find((x) => x.value === k)!;

const HEAD: Record<NewKind, string> = {
  page: 'A new page',
  design: 'A new design',
  slides: 'New slides',
  doc: 'A new document',
  sheet: 'A new spreadsheet',
  tex: 'A new LaTeX document',
  notebook: 'A new notebook',
  diagram: 'A new diagram',
  picture: 'A new picture',
};
const ABOUT: Record<NewKind, string> = {
  page: 'A page or a small tool of your own: notes, a checklist, a tracker, a wiki. What you enter in it is kept, on every device.',
  design: 'A poster, a flyer, a social post or a card, to edit as in Canva and save as a picture or a PDF.',
  slides: 'A deck to present, in a theme of yours, and to save as a PowerPoint file or a PDF.',
  doc: 'A document to write and edit as in Word or Google Docs, and save as a Word file, a PDF or Markdown.',
  sheet: 'A spreadsheet with formulas, as in Excel or Google Sheets, to save as an Excel file, a CSV or a PDF.',
  tex: 'LaTeX source beside its typeset pages, as in Overleaf, to save as a PDF or the .tex project.',
  notebook: 'A Jupyter notebook: text and code cells you run here, with their outputs, to save as an .ipynb file, a Python script or a PDF.',
  diagram: 'A diagram to draw and edit as in draw.io, and save as a picture, a PDF or a draw.io file.',
  picture: 'A blank picture to paint and edit as in Photoshop, in a size you pick, saved in your Library as a PNG, JPEG or WebP.',
};
const NEW_TITLE: Record<NewKind, string> = { page: '', design: 'Design', slides: 'Slides', doc: 'Document', sheet: 'Spreadsheet', tex: 'LaTeX document', notebook: 'Notebook', diagram: 'Diagram', picture: 'Picture' };
/** What an agent is asked for a LaTeX document or a notebook, which the gallery has no kinds of: these words, then the person's. */
const ASK_FOR: Partial<Record<NewKind, string>> = { tex: 'Write me a LaTeX document and keep it in my Library: ', notebook: 'Make me a Jupyter notebook, run it, and keep it in my Library: ', picture: 'Make me a picture and keep it in my Library: ' };
const EXAMPLE: Record<NewKind, string> = {
  page: 'A packing list for a week of hiking',
  design: 'A poster for our summer street party',
  slides: 'A 10-minute talk on our first year',
  doc: 'A cover letter for a design job',
  sheet: 'A monthly budget for two',
  tex: 'A two-page paper on my results, with equations',
  notebook: 'A notebook that charts my monthly spending from a CSV',
  diagram: 'A flowchart of how we handle a refund',
  picture: 'A watercolour of a lighthouse at dusk',
};
/** The gallery's kinds for each (shared/content-types.ts): its chips pick one, as More kinds does from all of them. */
const TYPES_FOR: Partial<Record<NewKind, ContentKind>> = { page: 'page', design: 'design', slides: 'deck', doc: 'doc', sheet: 'sheet', diagram: 'diagram' };
/** The kinds agents make most, by their ids, names and icons in the gallery (its list loads only when one is picked). */
const FEATURED: Partial<Record<NewKind, { id: string; label: string; icon: LucideIcon }[]>> = {
  page: [
    { id: 'page.packing', label: 'Packing list', icon: Backpack },
    { id: 'page.budget-planner', label: 'Budget planner', icon: PiggyBank },
    { id: 'page.quiz', label: 'Quiz', icon: CircleQuestionMark },
    { id: 'page.landing', label: 'Landing page', icon: Rocket },
  ],
  design: [
    { id: 'design.event-poster', label: 'Event poster', icon: Megaphone },
    { id: 'design.sale-flyer', label: 'Sale flyer', icon: Tags },
    { id: 'design.quote-post', label: 'Quote post', icon: Quote },
    { id: 'design.business-card', label: 'Business card', icon: IdCard },
  ],
  slides: [
    { id: 'deck.pitch', label: 'Pitch deck', icon: Rocket },
    { id: 'deck.lecture', label: 'Lecture', icon: GraduationCap },
    { id: 'deck.research-talk', label: 'Research talk', icon: FlaskConical },
    { id: 'deck.status', label: 'Project status', icon: Activity },
  ],
  doc: [
    { id: 'doc.cv', label: 'CV or résumé', icon: IdCard },
    { id: 'doc.cover-letter', label: 'Cover letter', icon: Mail },
    { id: 'doc.report', label: 'Report', icon: FileChartColumn },
    { id: 'doc.essay', label: 'Essay', icon: PenLine },
  ],
  sheet: [
    { id: 'sheet.budget', label: 'Budget', icon: Wallet },
    { id: 'sheet.invoice', label: 'Invoice', icon: ReceiptText },
    { id: 'sheet.gantt', label: 'Project plan (Gantt)', icon: ChartGantt },
    { id: 'sheet.timesheet', label: 'Timesheet', icon: Clock },
  ],
  diagram: [
    { id: 'diagram.flowchart', label: 'Flowchart', icon: Workflow },
    { id: 'diagram.mind-map', label: 'Mind map', icon: BrainCircuit },
    { id: 'diagram.org-chart', label: 'Org chart', icon: UsersRound },
    { id: 'diagram.architecture', label: 'System architecture', icon: Blocks },
  ],
};
/** The files each kind opens as one of its own (a page brings one in with Import a page). */
const OPENS: Partial<Record<NewKind, { accept: string; label: string }>> = {
  slides: { accept: '.pptx,.ppsx,.potx,.pptm', label: 'Open a PowerPoint file' },
  doc: { accept: '.docx,.docm,.dotx,.pdf,.md,.markdown,.txt,.html,.htm', label: 'Open a Word, PDF or text file' },
  sheet: { accept: '.xlsx,.ods,.csv,.tsv', label: 'Open an Excel or CSV file' },
  tex: { accept: '.tex,.ltx,.zip', label: 'Open a .tex or .zip file' },
  notebook: { accept: '.ipynb', label: 'Open a notebook (.ipynb)' },
  diagram: { accept: '.drawio,.dio,.xml,.mmd,.mermaid,.svg,.png', label: 'Open a draw.io or Mermaid file' },
};
const BLANK: Record<'doc' | 'sheet' | 'notebook' | 'diagram', string> = { doc: 'Blank document', sheet: 'Blank spreadsheet', notebook: 'Blank notebook', diagram: 'Blank diagram' };

/** A file's bytes as base64, for the import. */
const base64Of = (f: File) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => fail(new Error('The file could not be read'));
    r.readAsDataURL(f);
  });

/** A new deck in a ready-made theme, or in one of the user's own ("my:<id>", its logo on it). */
function deckIn(theme: string, title: string, ratio: Ratio) {
  const mine = theme.startsWith('my:') ? useMyThemes.getState().list?.find((t) => `my:${t.id}` === theme) : undefined;
  return mine ? myThemeDeck(mine, title, ratio) : newDeck(title, theme, ratio);
}

/** A kind's icon on a tile of its colour. */
function KindMark({ kind, size, className }: { kind: NewKind; size: number; className?: string }) {
  const k = kindOf(kind);
  const Icon = k.icon;
  return (
    <span
      aria-hidden
      className={cx('grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), color: k.colour, background: `color-mix(in srgb, ${k.colour} 16%, transparent)` }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={1.9} />
    </span>
  );
}

/** A kind an agent makes, under the words: picked, it is what the agent makes (a click again takes it off). */
function KindChip({ on, icon, label, title, onClick }: { on: boolean; icon: ReactNode; label: ReactNode; title?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={cx(
        'flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-colors',
        on ? 'border-accent/60 bg-accent-soft font-medium text-fg' : 'border-line bg-elevated text-fg-2 hover:border-line-2 hover:text-fg',
      )}
    >
      <span className={cx('flex shrink-0', on ? 'text-accent' : 'text-fg-3')}>{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
      {on && <X size={12} className="-mr-0.5 shrink-0 text-fg-3" />}
    </button>
  );
}

/** New in the Library: a page, slides, a document… made in the space it shows (`space`), in its folder open (`folder`) unless another project is picked. */
export function NewPageDialog({ open, onClose, kind: startKind = 'page', space, folder }: { open: boolean; onClose: () => void; kind?: NewKind; space?: string | null; folder?: string }) {
  const mobile = useIsMobile();
  const [kind, setKind] = useState<NewKind>(startKind);
  const [pick, setPick] = useState(STARTERS[0].id);
  const [title, setTitle] = useState(STARTERS[0].title);
  const [theme, setTheme] = useState(THEMES[0].id);
  const [ratio, setRatio] = useState<Ratio>('16:9');
  const myThemes = useMyThemeList();
  // A LaTeX document's template, and the name it gives (the article keeps the usual one).
  const [tpl, setTpl] = useState<TexTemplateId>('article');
  const tplTitle = (id: TexTemplateId) => (id === 'article' ? NEW_TITLE.tex : (texTemplate(id)?.title ?? NEW_TITLE.tex));
  const [ask, setAsk] = useState('');
  // A kind picked under the words (a pitch deck, a cover letter): the request is made from it and the words, if any.
  const [type, setType] = useState<ContentType | null>(null);
  const askBox = useRef<HTMLTextAreaElement>(null);
  const askId = useId();
  // Who makes it: the agent and model picked last on the start page, as the editors' Ask does.
  const run = useAskRun();
  const [busy, setBusy] = useState(false);
  // Where it goes: the space the Library shows now, or none; asked only when there are spaces.
  const spaces = useSpaces();
  const folders = usePagesStore((s) => s.folders);
  const [where, setWhere] = useState<string | null>(space ?? null);
  // A design: its size, the template it starts from (none: blank) and its colours.
  const brand = useBrand();
  const [dSize, setDSize] = useState<DesignSize>(() => designSize('instagram-post')!);
  const [dTpl, setDTpl] = useState<string | null>(() => templatesFor(designSize('instagram-post')!)[0]?.id ?? null);
  const [dColours, setDColours] = useState<Colours>('own');
  // A picture: its size (a preset, or any: Custom), and what it starts as.
  const [pSize, setPSize] = useState({ w: 1080, h: 1080 });
  const [pCustom, setPCustom] = useState(false);
  const [pBg, setPBg] = useState<NewBackground>('white');
  const [pColor, setPColor] = useState('#1f2937');
  const kindNow = useRef(kind);
  kindNow.current = kind;
  const rail = useRef<Partial<Record<NewKind, HTMLButtonElement | null>>>({});
  const chips = useRef<Partial<Record<NewKind, HTMLButtonElement | null>>>({});
  const pickSize = (s: DesignSize) => {
    if (kind === 'design' && (title === tr(dSize.label) || title === NEW_TITLE.design || !title.trim())) setTitle(tr(s.label));
    setDSize(s);
    const list = templatesFor(s);
    if (dTpl && !list.some((t) => t.id === dTpl)) setDTpl(list[0]?.id ?? null);
  };
  useEffect(() => {
    if (!open) return;
    setKind(startKind);
    setPick(STARTERS[0].id);
    setTitle(NEW_TITLE[startKind] || STARTERS[0].title);
    setTpl('article');
    setAsk('');
    setType(null);
    setWhere(space ?? null);
    setPSize({ w: 1080, h: 1080 });
    setPCustom(false);
    setPBg('white');
    // The gallery's kinds, so a chip or More kinds answers at once.
    preloadTypes();
  }, [open, startKind, space]);
  // On a computer the words box takes the keys at once; on a phone the keyboard waits for a tap.
  useEffect(() => {
    if (open && !mobile) requestAnimationFrame(() => askBox.current?.focus());
  }, [open, mobile]);
  // The chip of the kind open stays in view on a phone.
  useEffect(() => {
    if (open) chips.current[kind]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [open, kind]);
  // The box grows with what is written in it, up to a few lines.
  useLayoutEffect(() => {
    const el = askBox.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [ask, open, kind]);

  const starter = STARTERS.find((s) => s.id === pick)!;
  const defaultTitle = kind === 'tex' ? tplTitle(tpl) : NEW_TITLE[kind] || starter.title;
  // In the folder the Library shows, unless another project is picked.
  const inFolder = folder && where === (space ?? null) ? folder : undefined;
  const aiReady = !!type || !!ask.trim();

  const make = async () => {
    if (kind === 'picture') {
      // Not a page: the picture editor opens on a blank picture, and its Save keeps it in the Library here.
      const f = fitNewSize(pSize.w, pSize.h);
      const fill = pBg === 'transparent' ? null : pBg === 'white' ? '#ffffff' : pColor.slice(0, 7);
      onClose();
      openEditor({ kind: 'image', src: blankSrc(f.w, f.h, fill), title: title.trim() || newPictureName(f.w, f.h), from: { label: pageName() }, fresh: { space: where, folder: inFolder }, save: (r) => void (r.media && toast('Saved to your Library', 'ok')) });
      return;
    }
    setBusy(true);
    try {
      const t = title.trim() || defaultTitle;
      const at = { space: where, folder: inFolder };
      const dt = dTpl ? (templateById(dTpl) ?? null) : null;
      const r =
        kind === 'design'
          ? await post<{ page: PageInfo }>('/api/pages', { title: t, html: templatePage(dt, dSize, { title: t, palette: paletteOf(dColours, brand), fonts: fontsOf(dt, dColours, brand) }), ...at })
          : kind === 'slides'
            ? await post<{ page: PageInfo }>('/api/pages', { title: t, kind: 'slides', model: deckIn(theme, t, ratio), ...at })
            : kind === 'page'
              ? await post<{ page: PageInfo }>('/api/pages', { title: t, html: starter.html(t), ...at })
              : kind === 'tex'
                ? await post<{ page: PageInfo }>('/api/pages', { title: t, kind, model: texFromTemplate(tpl, t), ...at })
                : await post<{ page: PageInfo }>('/api/pages', { title: t, kind, ...at });
      onClose();
      go(kind === 'design' ? `/pages/${r.page.id}?mode=edit` : kind === 'page' ? `/pages/${r.page.id}?mode=${pick === 'blank' ? 'edit' : 'view'}` : `/pages/${r.page.id}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  /** Picks a file of the device, then sends it: a page of its kind made from it opens. */
  const fromFile = (accept: string, send: (f: File) => Promise<{ page: PageInfo; notes?: string[] }>, mode = '') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setBusy(true);
      try {
        const r = await send(f);
        onClose();
        go(`/pages/${r.page.id}${mode}`);
        if (r.notes?.length) toast(r.notes.map((n) => tr(n)).join(' '));
      } catch (e) {
        toastError(e);
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };
  /** A PowerPoint deck, a Word document or a PDF, a spreadsheet or a CSV opened as a page of its kind. */
  const openFile = () =>
    fromFile(OPENS[kind]?.accept ?? '', async (f) => post('/api/pages/import', { name: f.name, data: await base64Of(f), space: where, folder: inFolder, ...(kind === 'diagram' ? { kind } : {}) }));
  /** A page made from a file (Markdown, a Notion export, a Word file, a web page): it opens in Edit. */
  const importPage = () =>
    fromFile('.md,.markdown,.txt,.zip,.docx,.html,.htm,.csv', async (f) => post('/api/pages/import-page', { name: f.name, data: await base64Of(f), space: where, folder: inFolder }), '?mode=edit');

  const switchKind = (k: NewKind) => {
    if (title === defaultTitle || !title.trim()) setTitle(NEW_TITLE[k] || starter.title);
    if (k !== kind) setType(null);
    setKind(k);
  };
  /** Up and down the list of kinds with the arrow keys, as in a list of choices. */
  const railKeys = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = KINDS.findIndex((k) => k.value === kind);
    const next = KINDS[(i + d + KINDS.length) % KINDS.length].value;
    switchKind(next);
    (rail.current[next] ?? chips.current[next])?.focus();
  };
  const typesFor = TYPES_FOR[kind];
  const chose = (t: ContentType) => {
    if (TYPES_FOR[kindNow.current] !== t.kind) return;
    setType(t);
    if (!mobile) requestAnimationFrame(() => askBox.current?.focus());
  };
  /** A chip: its kind from the gallery's list (loaded when the dialog opened), or off again. */
  const pickFeatured = (id: string) => {
    if (type?.id === id) return setType(null);
    void import('@shared/content-types').then((m) => {
      const t = m.contentType(id);
      if (t) chose(t);
    }, toastError);
  };
  const moreKinds = () => typesFor && openTypes({ kind: typesFor, onPick: chose });
  /**
   * Make it with AI: its session starts at once, the message a short line in the person's words, the agent told the
   * rest (the kind picked or the words, the name, a deck's theme and shape, a design's size, the folder, the app's
   * language). A LaTeX document or a notebook, which the gallery has no kinds of, is asked for in words. In a project,
   * it starts there, so what it saves lands in it.
   */
  const describe = () => {
    if (!aiReady) return;
    const sp = spaces?.find((x) => x.id === where) ?? null;
    const ck = TYPES_FOR[kind];
    const t = title.trim();
    const names = inFolder ? folderChain(folders, inFolder).map((f) => f.name) : [];
    if (!ck) {
      // In the person's words, with its name and folder said in the app's language, as the message they see.
      const named = t && t !== defaultTitle ? ` ${tr(`Call it “${t}”.`)}` : '';
      const into = names.length ? ` ${tr(`Keep it in my Library folder “${names.join('/')}”.`)}` : '';
      const words = ask.trim();
      const end = (named || into) && !/[.!?…。！？]$/.test(words) ? '.' : '';
      onClose();
      return startMaking(run, { prompt: `${tr(ASK_FOR[kind] ?? '')}${words}${end}${named}${into}`, space: sp });
    }
    const th = kind === 'slides' ? THEMES.find((x) => x.id === theme) : undefined;
    const r = madeRequest(type, ask, {
      kind: type?.kind ?? ck,
      title: t && t !== defaultTitle ? t : undefined,
      theme: th ? { id: th.id, label: th.label } : undefined,
      ratio: kind === 'slides' ? ratio : undefined,
      size: kind === 'design' ? { label: dSize.label, w: dSize.w, h: dSize.h } : undefined,
      folder: names.join('/') || undefined,
      lang: appLanguage(),
    });
    if (!r) return;
    onClose();
    startMaking(run, { prompt: r.prompt, make: r.make, space: sp });
  };
  const primary = () => (aiReady ? describe() : busy ? undefined : make());
  /** A double click on a starting point: it is made at once, whatever the box says. */
  const makeNow = () => void (busy || make());

  // The themes drawn with its name on their title slides (made again only when the name or the shape changes).
  const deckName = title.trim() || 'Slides';
  const themeDecks = useMemo(() => (kind === 'slides' ? THEMES.map((th) => newDeck(deckName, th.id, ratio)) : []), [kind, deckName, ratio]);
  const myDecks = useMemo(() => (kind === 'slides' ? (myThemes ?? []).map((t) => myThemeDeck(t, deckName, ratio)) : []), [kind, myThemes, deckName, ratio]);
  const featured = FEATURED[kind] ?? [];
  const otherType = type && !featured.some((f) => f.id === type.id) ? type : null;
  // A kind from More kinds goes first, in place of the last of the others, so the chips keep to a line.
  const shownFeatured = otherType ? featured.slice(0, -1) : featured;
  const projectPick = !!spaces?.length && <SpaceSelect value={where} onChange={setWhere} className="w-full" />;
  const nameBox = (cls: string) => (
    <input value={title} maxLength={120} aria-label="Name" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && primary()} className={cls} />
  );
  const grid = 'grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4';

  /** What to start from yourself, for the kind open. */
  const gallery = () => {
    if (kind === 'page')
      return (
        <div className={grid} role="radiogroup" aria-label="Start from">
          {STARTERS.map((s) => (
            <Tile
              key={s.id}
              on={pick === s.id}
              onClick={() => {
                if (title === starter.title || !title.trim()) setTitle(s.title);
                setPick(s.id);
              }}
              onOpen={makeNow}
              art={<StarterArt id={s.id} />}
              label={s.label}
              hint={s.hint}
            />
          ))}
          <OpenTile label="Import a page" hint="Markdown, a Notion export, a Word file or a web page" onClick={importPage} disabled={busy} />
        </div>
      );
    if (kind === 'design') return <NewDesign size={dSize} onSize={pickSize} tpl={dTpl} onTpl={setDTpl} colours={dColours} onColours={setDColours} brand={brand} onMake={makeNow} />;
    if (kind === 'slides') {
      const shape = ratio === '4:3' ? '4 / 3' : '16 / 9';
      return (
        <div className={grid} role="radiogroup" aria-label="Theme">
          {THEMES.map((th, i) => (
            <Tile
              key={th.id}
              on={theme === th.id}
              onClick={() => setTheme(th.id)}
              onOpen={makeNow}
              ratio={shape}
              art={themeDecks[i] && <ThemeArt deck={themeDecks[i]} />}
              label={th.label}
              extra={
                <span aria-hidden className="ml-auto flex shrink-0 -space-x-0.5">
                  {th.colors.slice(0, 4).map((c) => (
                    <span key={c} className="h-2.5 w-2.5 rounded-full ring-1 ring-elevated" style={{ background: c }} />
                  ))}
                </span>
              }
            />
          ))}
          {(myThemes ?? []).map((t, i) => (
            <Tile
              key={t.id}
              on={theme === `my:${t.id}`}
              onClick={() => setTheme(`my:${t.id}`)}
              onOpen={makeNow}
              ratio={shape}
              art={myDecks[i] && <ThemeArt deck={myDecks[i]} />}
              label={<span translate="no">{t.name}</span>}
            />
          ))}
          <OpenTile label={OPENS.slides!.label} hint=".pptx, .ppsx, .potx or .pptm" onClick={openFile} disabled={busy} ratio={shape} />
        </div>
      );
    }
    if (kind === 'tex')
      return (
        <TexTemplateTiles
          value={tpl}
          onChange={(t) => {
            if (title === defaultTitle || !title.trim()) setTitle(tplTitle(t.id));
            setTpl(t.id);
          }}
          onOpen={openFile}
          onMake={makeNow}
          busy={busy}
        />
      );
    if (kind === 'picture') {
      const shown = pCustom ? NEW_PRESETS[NEW_PRESETS.length - 1] : presetOf(pSize.w, pSize.h);
      const fit = fitNewSize(pSize.w, pSize.h);
      const num = (v: string) => Math.max(1, Math.round(Number(v) || 1));
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5" role="radiogroup" aria-label="Size">
            {NEW_PRESETS.map((p) => (
              <Tile
                key={p.id}
                on={shown.id === p.id}
                onClick={() => {
                  if (p.w && p.h) (setPSize({ w: p.w, h: p.h }), setPCustom(false));
                  else setPCustom(true);
                }}
                onOpen={makeNow}
                art={<PictureArt w={p.w ?? pSize.w} h={p.h ?? pSize.h} bg={pBg} color={pColor} />}
                label={p.label}
                hint={p.w && p.h ? `${p.w} × ${p.h}` : 'Any size'}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-[13px]">
            <label className="flex items-center gap-2">
              <span className="text-fg-3">Width</span>
              <input type="number" min={1} max={8192} value={pSize.w} aria-label="Width in pixels" onChange={(e) => (setPSize((s) => ({ ...s, w: num(e.target.value) })), setPCustom(true))} className={cx(inputCls, 'w-24')} />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-fg-3">Height</span>
              <input type="number" min={1} max={8192} value={pSize.h} aria-label="Height in pixels" onChange={(e) => (setPSize((s) => ({ ...s, h: num(e.target.value) })), setPCustom(true))} className={cx(inputCls, 'w-24')} />
            </label>
            <Button size="sm" variant="ghost" onClick={() => (setPSize((s) => ({ w: s.h, h: s.w })), setPCustom(!NEW_PRESETS.some((p) => p.w === pSize.h && p.h === pSize.w)))}>
              Swap
            </Button>
            <span className="flex items-center gap-2">
              <span className="text-fg-3">Background</span>
              <Segmented<NewBackground>
                size="sm"
                value={pBg}
                onChange={setPBg}
                options={[
                  { value: 'white', label: 'White' },
                  { value: 'transparent', label: 'See-through' },
                  { value: 'colour', label: 'Colour' },
                ]}
              />
              {pBg === 'colour' && <input type="color" value={pColor.slice(0, 7)} aria-label="Background colour" onChange={(e) => setPColor(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-line-2 bg-transparent p-0.5" />}
            </span>
          </div>
          <p className={cx('text-[12.5px]', fit.cut ? 'text-err' : 'text-fg-3')}>{fit.cut ? tr(`That is more than the editor holds: it will be ${fit.w} × ${fit.h} pixels.`) : tr(`${fit.w} × ${fit.h} pixels. It opens in the picture editor; Save keeps it in your Library.`)}</p>
        </div>
      );
    }
    // A document, a spreadsheet, a notebook or a diagram: blank, or from a file of yours.
    const k = kind as 'doc' | 'sheet' | 'notebook' | 'diagram';
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-4" role="radiogroup" aria-label="Start from">
        <Tile on onClick={() => undefined} onOpen={makeNow} ratio="16 / 10" art={<BlankArt kind={k} />} label={BLANK[k]} />
        <OpenTile label={OPENS[k]!.label} onClick={openFile} disabled={busy} ratio="16 / 10" />
      </div>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} bare width={940} label={HEAD[kind]}>
      <div className="flex h-[92dvh] min-h-0 sm:h-[min(680px,calc(100dvh-32px))]">
        {/* What to make, on a computer: the kinds down the side, then where it goes and Upload files. */}
        <nav aria-label="What to make" className="flex w-[216px] shrink-0 flex-col border-r border-line bg-bg-1 max-md:hidden">
          <div className="px-5 pt-5 pb-3.5 text-[17px] leading-6 font-semibold tracking-tight text-fg">New</div>
          <div role="radiogroup" aria-label="What to make" onKeyDown={railKeys} className="flex flex-col gap-0.5 px-3">
            {KINDS.map((k) => {
              const on = kind === k.value;
              return (
                <button
                  key={k.value}
                  ref={(el) => void (rail.current[k.value] = el)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => switchKind(k.value)}
                  className={cx(
                    'flex h-10 items-center gap-2.5 rounded-[10px] px-2 text-left text-[13.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                    on ? 'bg-elevated font-medium text-fg shadow-[0_1px_2px_rgba(0,0,0,0.1)] ring-1 ring-line' : 'text-fg-2 hover:bg-bg-2 hover:text-fg',
                  )}
                >
                  <KindMark kind={k.value} size={28} />
                  <span className="min-w-0 truncate">{k.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-auto flex flex-col gap-2.5 border-t border-line p-3">
            {projectPick && (
              <div className="space-y-1.5">
                <span className="block px-1 text-[12px] font-medium text-fg-3">In a project</span>
                {projectPick}
              </div>
            )}
            {/* Files of yours instead, as many as you pick, each made what it is, in the project picked above. */}
            <button
              type="button"
              onClick={() => pickFiles(where, onClose)}
              title="Add files of yours: documents, spreadsheets, slides, pictures, videos and sounds"
              className="flex h-9 items-center gap-2 rounded-[10px] px-2 text-[13px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
            >
              <Upload size={15} className="shrink-0 text-fg-3" />
              Upload files
            </button>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-start gap-3 px-6 pt-5 pb-4 max-md:px-4 max-md:pt-4 max-md:pb-3">
            <KindMark kind={kind} size={40} className="max-md:hidden" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[17px] leading-6 font-semibold tracking-tight text-fg">{HEAD[kind]}</h2>
              <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-[18px] text-fg-3 max-md:hidden">{ABOUT[kind]}</p>
            </div>
            <IconButton label="Close" onClick={onClose} className="-mt-0.5 -mr-1.5">
              <X size={17} />
            </IconButton>
          </div>

          {/* What to make, on a phone or a narrow window: the kinds as chips across. */}
          <div role="radiogroup" aria-label="What to make" onKeyDown={railKeys} className="-mt-1 flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-3 md:hidden [&::-webkit-scrollbar]:hidden">
            {KINDS.map((k) => {
              const on = kind === k.value;
              const Icon = k.icon;
              return (
                <button
                  key={k.value}
                  ref={(el) => void (chips.current[k.value] = el)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => switchKind(k.value)}
                  className={cx(
                    'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors',
                    on ? 'border-accent/60 bg-accent-soft font-medium text-fg' : 'border-line text-fg-2',
                  )}
                >
                  <Icon size={14} style={{ color: k.colour }} />
                  {k.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-0.5 pb-6 max-md:px-4">
            {/* Describe it: an agent makes it. */}
            <div className="rounded-2xl border border-line-2 bg-bg-1 transition-[border-color,box-shadow] focus-within:border-accent/60 focus-within:ring-3 focus-within:ring-accent/15">
              <label htmlFor={askId} className="flex items-center gap-1.5 px-3.5 pt-3 text-[12.5px] font-medium text-fg-2">
                <Sparkles size={14} className="shrink-0 text-accent" />
                Describe it, and an agent makes it
              </label>
              <textarea
                id={askId}
                ref={askBox}
                rows={2}
                value={ask}
                maxLength={2000}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  primary();
                }}
                placeholder={type?.hint ?? EXAMPLE[kind]}
                className="block w-full resize-none bg-transparent px-3.5 pt-1.5 pb-3 text-[14px] leading-[21px] text-fg outline-none placeholder:text-fg-3"
              />
              {typesFor && (
                <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
                  {otherType && <KindChip on icon={<Sparkles size={13} />} label={otherType.label} title={otherType.blurb} onClick={() => setType(null)} />}
                  {shownFeatured.map((f) => {
                    const Icon = f.icon;
                    return <KindChip key={f.id} on={type?.id === f.id} icon={<Icon size={13} />} label={f.label} onClick={() => pickFeatured(f.id)} />;
                  })}
                  <button
                    type="button"
                    onPointerEnter={preloadTypes}
                    onFocus={preloadTypes}
                    onClick={moreKinds}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12.5px] font-medium text-accent hover:bg-accent-soft"
                  >
                    <LayoutGrid size={13} />
                    More kinds
                  </button>
                </div>
              )}
            </div>

            {/* Or make it yourself, from what is picked here. */}
            <section className="mt-6">
              <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
                <h3 className="text-[13px] font-semibold text-fg">Or start from</h3>
                {kind === 'slides' && (
                  <div className="ml-auto">
                    <Segmented<Ratio>
                      size="sm"
                      value={ratio}
                      onChange={setRatio}
                      options={[
                        { value: '16:9', label: 'Wide (16:9)' },
                        { value: '4:3', label: 'Standard (4:3)' },
                      ]}
                    />
                  </div>
                )}
              </div>
              {gallery()}
            </section>

            {/* On a phone, its name and project under the cards (the bar at the bottom has room for its buttons only). */}
            <div className="mt-6 grid gap-3 md:hidden">
              <label className="block space-y-1.5">
                <span className="block text-[12.5px] font-medium text-fg-2">Name</span>
                {nameBox(inputCls)}
              </label>
              {projectPick && (
                <div className="space-y-1.5">
                  <span className="block text-[12.5px] font-medium text-fg-2">In a project</span>
                  {projectPick}
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-line px-6 pt-3 pb-3 max-md:px-4 max-sm:pb-[max(12px,var(--safe-bottom))]">
            <IconButton label="Upload files" onClick={() => pickFiles(where, onClose)} className="md:hidden">
              <Upload size={17} />
            </IconButton>
            <label
              className={cx(inputCls, 'flex max-w-[320px] min-w-0 flex-1 cursor-text items-center gap-2 focus-within:border-accent/60 focus-within:ring-3 focus-within:ring-accent/15 max-md:hidden')}
            >
              <span className="shrink-0 text-[12.5px] font-medium text-fg-3">Name</span>
              {nameBox('h-full min-w-0 flex-1 bg-transparent outline-none')}
            </label>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {aiReady ? (
                <>
                  <Button variant="ghost" disabled={busy} onClick={make}>
                    Make it yourself
                  </Button>
                  <Button variant="primary" icon={<Sparkles size={14} />} onClick={describe}>
                    Make it with AI
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={onClose} className="max-sm:hidden">
                    Cancel
                  </Button>
                  <Button variant="primary" disabled={busy} onClick={make} className="min-w-[96px]">
                    Make it
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** A theme as its deck's title slide, as wide as its card. */
function ThemeArt({ deck }: { deck: ReturnType<typeof newDeck> }) {
  return (
    <span className="absolute inset-0 block overflow-hidden">
      <AutoWidth>{(w) => (w ? <SlideThumb deck={deck} index={0} slide={deck.slides[0]} theme={deck.theme} width={w} fonts={0} /> : null)}</AutoWidth>
    </span>
  );
}
