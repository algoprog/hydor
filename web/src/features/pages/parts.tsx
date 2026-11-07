// The Library's shared parts: a page's picture (or its first letter until the picture is ready), and the dialogs
// to rename a page, publish one (or a folder), and make a new page, deck, document, spreadsheet or LaTeX document
// (from a starting point, a file, or by asking an agent, from a kind picked in the gallery or in their own words), in
// a space or in none, or upload files of yours into the Library (each made what it is: uploads.ts); and a published
// site's row.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppWindow, FileText, Globe, GlobeLock, LayoutGrid, NotebookText, Palette, Presentation, Sheet, Sigma, Sparkles, Upload, Workflow, X } from 'lucide-react';
import type { ContentKind, ContentType } from '@shared/content-types';
import { DESCRIPTION_WORDS, wordCount, type PageInfo, type SiteInfo, type SiteVisibility } from '@shared/pages';
import { newDeck, THEMES, type Ratio } from '@shared/slides';
import { texFromTemplate, texTemplate, type TexTemplateId } from '@shared/latex-templates';
import { del, enc, patch, post } from '../../lib/api';
import { ago, basename, tildify } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { FolderPicker } from '../../components/FolderPicker';
import { Button, cx, Dialog, inputCls, Segmented, Throbber, useConfirm } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { useAskRun } from '../guide/ask';
import { startInSpace } from '../spaces/parts';
import { SpaceSelect } from '../spaces/SpacePick';
import { useSpaces } from '../spaces/state';
import { SiteLink, VISIBILITY } from './cards';
import { folderChain } from './folders';
import { usePagesStore } from './state';
import { STARTERS } from './templates';
import { appLanguage, openTypes, preloadTypes } from './types';
import { madeRequest } from './types/requests';
import { startMaking } from './types/start';
import { pickFiles } from './uploads';
import { SlideThumb } from './slides/Thumb';
import { MyThemeChoices, myThemeDeck, useMyThemes } from './slides/MyThemes';
import { TexTemplatePicker } from './latex/TemplatePicker';
import { designSize, sizeText, type DesignSize } from '@shared/design';
import { templateById, templatePage, templatesFor } from '@shared/design-templates';
import { fontsOf, NewDesign, paletteOf, type Colours } from './design/NewDesign';
import { useBrand } from './design/brand';

const TONES = ['from-accent/25 to-accent/5 text-accent', 'from-info/25 to-info/5 text-info', 'from-ok/25 to-ok/5 text-ok', 'from-warn/25 to-warn/5 text-warn', 'from-claude/25 to-claude/5 text-claude', 'from-codex/25 to-codex/5 text-codex'];
export const toneOf = (id: string) => TONES[parseInt(id.slice(0, 6), 16) % TONES.length];
const firstLetter = (title: string) => [...title.trim()][0]?.toUpperCase() ?? 'P';

/** A page's picture, or its first letter until the picture is ready. */
export function Thumb({ page, className }: { page: PageInfo; className?: string }) {
  const ready = usePagesStore((s) => s.thumbs[page.id]) ?? page.thumb;
  const [failed, setFailed] = useState<string | null>(null);
  const show = ready && failed !== ready;
  return (
    <div className={cx('relative overflow-hidden bg-gradient-to-br', toneOf(page.id), className)}>
      {show ? (
        <img src={mu(`/api/pages/${enc(page.id)}/thumb?v=${enc(ready)}`)} alt="" loading="lazy" draggable={false} onError={() => setFailed(ready)} className="absolute inset-0 h-full w-full object-cover object-top" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[34px] font-semibold opacity-80">{firstLetter(page.title)}</span>
      )}
    </div>
  );
}

/**
 * A page's title and its description (what it is, in a few sentences: the Library's search, the search box and agents
 * find it by it). Agents write one with what they save; files added get one from the helper model.
 */
export function RenameDialog({ page, open, onClose }: { page: PageInfo; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(page.title);
  const [text, setText] = useState(page.description ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(page.title);
    setText(page.description ?? '');
  }, [open, page.title, page.description]);
  const n = wordCount(text);
  const save = async () => {
    setBusy(true);
    try {
      await patch(`/api/pages/${enc(page.id)}`, { title, description: text });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit the title and description"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !title.trim() || n > DESCRIPTION_WORDS} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-fg-2">Title</span>
          <input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && n <= DESCRIPTION_WORDS && save()} className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-fg-2">Description</span>
          <textarea value={text} rows={4} onChange={(e) => setText(e.target.value)} className={`${inputCls} h-auto py-2 leading-snug`} />
          <span className={cx('block text-[12px] leading-snug', n > DESCRIPTION_WORDS ? 'text-warn' : 'text-fg-3')}>
            {n > DESCRIPTION_WORDS ? tr(`${n} words: keep it under ${DESCRIPTION_WORDS}`) : 'What it is and what it is for. The Library’s search finds it by these words and what they mean.'}
          </span>
        </label>
      </div>
    </Dialog>
  );
}

/** Publish a saved page, or (without one) a folder: a project's build. */
export function PublishDialog({ page, open, onClose }: { page?: { id: string; title: string; description?: string }; open: boolean; onClose: () => void }) {
  const [folder, setFolder] = useState('');
  // Where its link is shared: its description, and its picture (the page's own, one from this device, or none).
  const [desc, setDesc] = useState('');
  const [pic, setPic] = useState<string>('thumb');
  const [picBusy, setPicBusy] = useState(false);
  const [name, setName] = useState('');
  const [vis, setVis] = useState<SiteVisibility>('private');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<SiteInfo | null>(null);
  useEffect(() => {
    if (!open) return;
    setDone(null);
    setFolder('');
    setName(page?.title ?? '');
    setDesc(page?.description ?? '');
    setPic('thumb');
  }, [open, page?.id]);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await post<{ site: SiteInfo }>('/api/sites', { pageId: page?.id, folder: page ? undefined : folder, name, visibility: vis, ...(page ? { description: desc, image: pic } : {}) });
      setDone(r.site);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={page ? `Publish “${page.title}”` : 'Publish a folder'}
      width={500}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Globe size={14} />} disabled={busy || !name.trim() || (!page && !folder.trim())} onClick={submit}>
              Publish
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-2 text-[13.5px]">
          <p className="text-fg-2">“{done.name}” is published. Its link:</p>
          <SiteLink path={done.path} />
        </div>
      ) : (
        <div className="space-y-3.5 text-[13.5px]">
          {!page && (
            <label className="block space-y-1.5">
              <span className="text-[12.5px] font-medium text-fg-2">The folder: a built site with an index.html (dist/, build/ or out/)</span>
              <FolderPicker
                value={folder}
                onChange={(v) => {
                  setFolder(v);
                  if (!name.trim() || name === basename(folder.replace(/\/+$/, ''))) setName(basename(v.replace(/\/+$/, '')));
                }}
              />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-[12.5px] font-medium text-fg-2">Name</span>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="My site" className={inputCls} />
          </label>
          {page && (
            <>
              <label className="block space-y-1.5">
                <span className="text-[12.5px] font-medium text-fg-2">Description, where its link is shared</span>
                <textarea value={desc} maxLength={300} rows={2} onChange={(e) => setDesc(e.target.value)} placeholder="A sentence on what it is" className={cx(inputCls, 'h-auto py-2')} />
              </label>
              <div className="space-y-1.5">
                <span className="block text-[12.5px] font-medium text-fg-2">Social picture</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented<string>
                    size="sm"
                    value={pic.startsWith('naget-asset:') ? 'own' : pic}
                    onChange={(v) => {
                      if (v !== 'own') return setPic(v);
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/png,image/jpeg,image/webp';
                      input.onchange = () => {
                        const f = input.files?.[0];
                        if (!f) return;
                        setPicBusy(true);
                        base64Of(f)
                          .then((b64) => post<{ src: string }>('/api/pages/assets', { data: `data:${f.type || 'image/png'};base64,${b64}` }))
                          .then((r) => setPic(r.src), toastError)
                          .finally(() => setPicBusy(false));
                      };
                      input.click();
                    }}
                    options={[
                      { value: 'thumb', label: 'The page as it looks' },
                      { value: 'own', label: 'A picture of yours' },
                      { value: 'none', label: 'None' },
                    ]}
                  />
                  {picBusy && <Throbber size={14} />}
                </div>
                <p className="text-[12px] leading-relaxed text-fg-3">What shows when the link is pasted in a chat or a post (its og:image).</p>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Segmented<SiteVisibility> size="sm" value={vis} onChange={setVis} options={VISIBILITY.map((v) => ({ value: v.value, label: v.label }))} />
            <p className="text-[12.5px] leading-relaxed text-fg-3">
              {VISIBILITY.find((v) => v.value === vis)!.hint}
              {page ? ' A published copy does not keep data: to use the page yourself on a phone, open it at its own address.' : ' It is served as it is on disk: a new build shows at once.'}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export type NewKind = 'page' | 'design' | 'slides' | 'doc' | 'sheet' | 'tex' | 'notebook' | 'diagram';
const NEW_TITLE: Record<NewKind, string> = { page: '', design: 'Design', slides: 'Slides', doc: 'Document', sheet: 'Spreadsheet', tex: 'LaTeX document', notebook: 'Notebook', diagram: 'Diagram' };
const ASK_FOR: Record<NewKind, string> = {
  page: 'Make me a page and keep it in my Library: ',
  design: 'Make me a design and keep it in my Library: ',
  slides: 'Make me slides and keep them in my Library: ',
  doc: 'Write me a document and keep it in my Library: ',
  sheet: 'Make me a spreadsheet and keep it in my Library: ',
  tex: 'Write me a LaTeX document and keep it in my Library: ',
  notebook: 'Make me a Jupyter notebook, run it, and keep it in my Library: ',
  diagram: 'Make me a diagram and keep it in my Library: ',
};
/** The kinds the gallery has for each: Choose a kind picks one of them, which the request is then made from. */
const TYPES_FOR: Partial<Record<NewKind, ContentKind>> = { page: 'page', design: 'design', slides: 'deck', doc: 'doc', sheet: 'sheet', diagram: 'diagram' };
const OPENS: Partial<Record<NewKind, string>> = { slides: '.pptx,.ppsx,.potx,.pptm', doc: '.docx,.docm,.dotx,.pdf,.md,.markdown,.txt,.html,.htm', sheet: '.xlsx,.ods,.csv,.tsv', tex: '.tex,.ltx,.zip', notebook: '.ipynb', diagram: '.drawio,.dio,.xml,.mmd,.mermaid,.svg,.png' };
const KIND_TILES: { value: NewKind; label: string; icon: ReactNode }[] = [
  { value: 'page', label: 'A page', icon: <AppWindow size={16} /> },
  { value: 'design', label: 'Design', icon: <Palette size={16} /> },
  { value: 'slides', label: 'Slides', icon: <Presentation size={16} /> },
  { value: 'doc', label: 'Document', icon: <FileText size={16} /> },
  { value: 'sheet', label: 'Spreadsheet', icon: <Sheet size={16} /> },
  { value: 'tex', label: 'LaTeX', icon: <Sigma size={16} /> },
  { value: 'notebook', label: 'Notebook', icon: <NotebookText size={16} /> },
  { value: 'diagram', label: 'Diagram', icon: <Workflow size={16} /> },
];

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

/** New in the Library: a page, slides, a document… made in the space it shows (`space`), in its folder open (`folder`) unless another project is picked. */
export function NewPageDialog({ open, onClose, kind: startKind = 'page', space, folder }: { open: boolean; onClose: () => void; kind?: NewKind; space?: string | null; folder?: string }) {
  const [kind, setKind] = useState<NewKind>(startKind);
  const [pick, setPick] = useState(STARTERS[0].id);
  const [title, setTitle] = useState(STARTERS[0].title);
  const [theme, setTheme] = useState(THEMES[0].id);
  const [ratio, setRatio] = useState<Ratio>('16:9');
  // A LaTeX document's template, and the name it gives (the article keeps the usual one).
  const [tpl, setTpl] = useState<TexTemplateId>('article');
  const tplTitle = (id: TexTemplateId) => (id === 'article' ? NEW_TITLE.tex : (texTemplate(id)?.title ?? NEW_TITLE.tex));
  const [ask, setAsk] = useState('');
  // A kind picked in the gallery (a pitch deck, a cover letter): the request is made from it and the words, if any.
  const [type, setType] = useState<ContentType | null>(null);
  const askBox = useRef<HTMLInputElement>(null);
  // Who makes it when a kind is picked: the agent and model picked last on the start page, as the editors' Ask does.
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
  }, [open, startKind, space]);
  const starter = STARTERS.find((s) => s.id === pick)!;
  const defaultTitle = kind === 'tex' ? tplTitle(tpl) : NEW_TITLE[kind] || starter.title;
  // In the folder the Library shows, unless another project is picked.
  const inFolder = folder && where === (space ?? null) ? folder : undefined;
  const make = async () => {
    setBusy(true);
    try {
      const t = title.trim() || defaultTitle;
      const at = { space: where, folder: inFolder };
      const tpl = dTpl ? (templateById(dTpl) ?? null) : null;
      const r =
        kind === 'design'
          ? await post<{ page: PageInfo }>('/api/pages', { title: t, html: templatePage(tpl, dSize, { title: t, palette: paletteOf(dColours, brand), fonts: fontsOf(tpl, dColours, brand) }), ...at })
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
  /** A PowerPoint deck, a Word document or a PDF, a spreadsheet or a CSV opened as a page of its kind. */
  const openFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = OPENS[kind] ?? '';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setBusy(true);
      try {
        const r = await post<{ page: PageInfo; notes?: string[] }>('/api/pages/import', { name: f.name, data: await base64Of(f), space: where, folder: inFolder, ...(kind === 'diagram' ? { kind } : {}) });
        onClose();
        go(`/pages/${r.page.id}`);
        if (r.notes?.length) toast(r.notes.map((n) => tr(n)).join(' '));
      } catch (e) {
        toastError(e);
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };
  /** A page made from a file (Markdown, a Notion export, a Word file, a web page): it opens in Edit. */
  const importPage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt,.zip,.docx,.html,.htm,.csv';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setBusy(true);
      try {
        const r = await post<{ page: PageInfo; notes?: string[] }>('/api/pages/import-page', { name: f.name, data: await base64Of(f), space: where, folder: inFolder });
        onClose();
        go(`/pages/${r.page.id}?mode=edit`);
        if (r.notes?.length) toast(r.notes.join(' '));
      } catch (e) {
        toastError(e);
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };
  const switchKind = (k: NewKind) => {
    if (title === defaultTitle || !title.trim()) setTitle(NEW_TITLE[k] || starter.title);
    if (k !== kind) setType(null);
    setKind(k);
  };
  const typesFor = TYPES_FOR[kind];
  const chooseKind = () =>
    typesFor &&
    openTypes({
      kind: typesFor,
      onPick: (t) => {
        setType(t);
        if (window.matchMedia('(min-width: 768px)').matches) requestAnimationFrame(() => askBox.current?.focus());
      },
    });
  /**
   * Or describe it: an agent makes it. A kind picked: its session starts at once, the message a short line in the
   * person's words, the agent told the rest (the kind's request, the name, the theme and shape, the folder). Words
   * alone: the start page, with the request in its box. In a space, either starts there, so what it saves lands in it.
   */
  const describe = () => {
    if (!ask.trim() && !type) return;
    const sp = spaces?.find((x) => x.id === where) ?? null;
    if (type) {
      const t = title.trim();
      const names = inFolder ? folderChain(folders, inFolder).map((f) => f.name) : [];
      const th = kind === 'slides' ? THEMES.find((x) => x.id === theme) : undefined;
      const r = madeRequest(type, ask, {
        kind: type.kind,
        title: t && t !== defaultTitle ? t : undefined,
        theme: th ? { id: th.id, label: th.label } : undefined,
        ratio: kind === 'slides' ? ratio : undefined,
        size: kind === 'design' ? { label: dSize.label, w: dSize.w, h: dSize.h } : undefined,
        folder: names.join('/') || undefined,
        lang: appLanguage(),
      });
      if (!r) return;
      onClose();
      return startMaking(run, { prompt: r.prompt, make: r.make, space: sp });
    }
    onClose();
    const prompt = `${tr(ASK_FOR[kind])}${ask.trim()}${kind === 'design' ? ` (${tr(dSize.label)}, ${sizeText(dSize)})` : ''}`;
    if (sp) startInSpace(sp, prompt);
    else go(`/?prompt=${enc(prompt)}`);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kind === 'design' ? 'A new design' : kind === 'slides' ? 'New slides' : kind === 'doc' ? 'A new document' : kind === 'sheet' ? 'A new spreadsheet' : kind === 'tex' ? 'A new LaTeX document' : kind === 'notebook' ? 'A new notebook' : kind === 'diagram' ? 'A new diagram' : 'A new page'}
      width={kind === 'design' ? 860 : 680}
      footer={
        <>
          {/* Files of yours instead, as many as you pick, each made what it is, in the project picked below. */}
          {/* A kind picked: on a phone its two buttons only (the sheet closes by its X), so they fit across it. */}
          <Button variant="ghost" icon={<Upload size={14} />} onClick={() => pickFiles(where, onClose)} title="Add files of yours: documents, spreadsheets, slides, pictures, videos and sounds" className={cx('mr-auto', type && 'max-sm:hidden')}>
            Upload files
          </Button>
          <Button variant="ghost" onClick={onClose} className={type ? 'max-sm:hidden' : undefined}>
            Cancel
          </Button>
          {/* A kind picked: making it with AI is what the dialog is for now; an empty one stays a click away. */}
          {type ? (
            <>
              <Button variant="secondary" disabled={busy} onClick={make}>
                Make an empty one
              </Button>
              <Button variant="primary" icon={<Sparkles size={14} />} onClick={describe}>
                Make it with AI
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={busy} onClick={make}>
              Make it
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-[13.5px]">
        <div className="grid grid-cols-8 gap-1.5 max-sm:grid-cols-4" role="radiogroup" aria-label="What to make">
          {KIND_TILES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={kind === t.value}
              onClick={() => switchKind(t.value)}
              className={cx(
                'flex flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-[12.5px] transition-colors',
                kind === t.value ? 'border-accent/60 bg-accent-soft font-medium text-fg' : 'border-line text-fg-2 hover:border-line-2 hover:bg-bg-1',
              )}
            >
              <span className={cx(kind === t.value ? 'text-accent' : 'text-fg-3')}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
        {kind === 'doc' || kind === 'sheet' || kind === 'tex' || kind === 'notebook' ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-2.5">
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-2">
              {kind === 'doc'
                ? 'A document to write and edit as in Word or Google Docs, and save as a Word file, a PDF or Markdown.'
                : kind === 'sheet'
                  ? 'A spreadsheet with formulas, as in Excel or Google Sheets, to save as an Excel file, a CSV or a PDF.'
                  : kind === 'notebook'
                    ? 'A Jupyter notebook: text and code cells you run here, with their outputs, to save as an .ipynb file, a Python script or a PDF.'
                    : 'LaTeX source beside its typeset pages, as in Overleaf, to save as a PDF or the .tex project.'}
            </span>
            <Button size="sm" variant="secondary" icon={<Upload size={14} />} disabled={busy} onClick={openFile}>
              {kind === 'doc' ? 'Open a Word, PDF or text file' : kind === 'sheet' ? 'Open an Excel or CSV file' : kind === 'notebook' ? 'Open a notebook (.ipynb)' : 'Open a .tex or .zip file'}
            </Button>
          </div>
        ) : kind === 'design' ? (
          <NewDesign size={dSize} onSize={pickSize} tpl={dTpl} onTpl={setDTpl} colours={dColours} onColours={setDColours} brand={brand} />
        ) : kind === 'diagram' ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-2.5">
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-2">A diagram to draw and edit as in draw.io, and save as a picture, a PDF or a draw.io file.</span>
            <Button size="sm" variant="secondary" icon={<Upload size={14} />} disabled={busy} onClick={openFile}>
              Open a draw.io or Mermaid file
            </Button>
          </div>
        ) : kind === 'page' ? (
          <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STARTERS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (title === starter.title || !title.trim()) setTitle(s.title);
                  setPick(s.id);
                }}
                className={cx('rounded-xl border px-3 py-2.5 text-left transition-colors', pick === s.id ? 'border-accent/60 bg-accent-soft' : 'border-line hover:border-line-2 hover:bg-bg-1')}
              >
                <span className="block font-medium text-fg">{s.label}</span>
                <span className="block text-[12px] leading-snug text-fg-3">{s.hint}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-2.5">
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-2">Or bring a page in: Markdown, a Notion export (.zip, with its databases), a Word file or a web page.</span>
            <Button size="sm" variant="secondary" icon={<Upload size={14} />} disabled={busy} onClick={importPage}>
              Import a page
            </Button>
          </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map((th) => {
                const d = newDeck(title.trim() || 'Slides', th.id, ratio);
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setTheme(th.id)}
                    className={cx('overflow-hidden rounded-lg border text-left transition-colors', theme === th.id ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-2')}
                  >
                    <SlideThumb deck={d} index={0} slide={d.slides[0]} theme={d.theme} width={118} fonts={0} />
                    <span className="block truncate px-2 py-1 text-[12px] text-fg-2">{th.label}</span>
                  </button>
                );
              })}
              <MyThemeChoices value={theme} onPick={setTheme} title={title.trim() || 'Slides'} ratio={ratio} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented<Ratio>
                size="sm"
                value={ratio}
                onChange={setRatio}
                options={[
                  { value: '16:9', label: 'Wide (16:9)' },
                  { value: '4:3', label: 'Standard (4:3)' },
                ]}
              />
              <Button size="sm" variant="secondary" icon={<Upload size={14} />} disabled={busy} onClick={openFile}>
                Open a PowerPoint file
              </Button>
            </div>
          </>
        )}
        {kind === 'tex' && (
          <TexTemplatePicker
            value={tpl}
            onChange={(t) => {
              if (title === defaultTitle || !title.trim()) setTitle(tplTitle(t.id));
              setTpl(t.id);
            }}
          />
        )}
        <div className={cx('grid gap-3', !!spaces?.length && 'sm:grid-cols-[1fr_auto]')}>
          <label className="block min-w-0 space-y-1.5">
            <span className="text-[12.5px] font-medium text-fg-2">Its name</span>
            <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && make()} className={inputCls} />
          </label>
          {!!spaces?.length && (
            <div className="min-w-0 space-y-1.5 sm:w-[200px]">
              <span className="block text-[12.5px] font-medium text-fg-2">In a project</span>
              <SpaceSelect value={where} onChange={setWhere} className="w-full" />
            </div>
          )}
        </div>
        <form
          className="space-y-1.5 border-t border-line pt-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            describe();
          }}
        >
          <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2">
            <Sparkles size={13} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">Or describe it, and an agent makes it</span>
            {typesFor && (
              <button type="button" onPointerEnter={preloadTypes} onFocus={preloadTypes} onClick={chooseKind} className="flex shrink-0 items-center gap-1 rounded-md px-1 font-medium text-accent hover:underline">
                <LayoutGrid size={13} />
                Choose a kind
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {/* The kind picked goes before the words, as a chip; the words are then what it is about. */}
            <label className={cx(inputCls, 'flex min-w-0 flex-1 cursor-text items-center gap-1.5 focus-within:border-accent/60 focus-within:ring-3 focus-within:ring-accent/15', type && 'pl-1.5')}>
              {type && (
                <span className="flex h-6.5 max-w-[45%] shrink-0 items-center gap-0.5 rounded-md bg-accent-soft pr-0.5 pl-2 text-[12.5px] font-medium text-fg">
                  <span className="truncate">{type.label}</span>
                  <button type="button" aria-label="Not this kind" onClick={() => setType(null)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-3 hover:text-fg">
                    <X size={12} />
                  </button>
                </span>
              )}
              <input
                ref={askBox}
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder={
                  type?.hint ??
                  (kind === 'design'
                    ? 'A poster for our summer street party'
                    : kind === 'diagram'
                    ? 'A flowchart of how we handle a refund'
                    : kind === 'slides'
                    ? 'A 10-minute talk on our first year'
                    : kind === 'doc'
                      ? 'A cover letter for a design job'
                      : kind === 'sheet'
                        ? 'A monthly budget for two'
                        : kind === 'tex'
                          ? 'A two-page paper on my results, with equations'
                          : kind === 'notebook'
                            ? 'A notebook that charts my monthly spending from a CSV'
                            : 'A packing list for a week of hiking')
                }
                className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3"
              />
            </label>
            {!type && (
              <Button type="submit" variant="secondary" disabled={!ask.trim()}>
                Ask
              </Button>
            )}
          </div>
        </form>
      </div>
    </Dialog>
  );
}

/** A published site: its name, whether anyone may open it, where it came from, its link, and Unpublish. */
export function SiteRow({ site }: { site: SiteInfo }) {
  const home = useApp((s) => s.boot?.home);
  const [confirm, confirmNode] = useConfirm();
  const remove = async () => {
    if (!(await confirm({ title: `Unpublish “${site.name}”?`, body: 'Its link stops working at once. You can publish it again, under a new private link.', confirm: 'Unpublish', danger: true }))) return;
    del(`/api/sites/${enc(site.id)}`)
      .then(() => toast('Unpublished', 'ok'))
      .catch(toastError);
  };
  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-panel px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
          {site.visibility === 'private' ? <GlobeLock size={19} strokeWidth={1.8} /> : <Globe size={19} strokeWidth={1.8} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span translate="no" className="truncate text-[13.5px] leading-5 font-medium text-fg">
              {site.name}
            </span>
            <span className={cx('shrink-0 rounded-md px-1.5 text-[11px] leading-[18px] font-medium', site.visibility === 'public' ? 'bg-warn/12 text-warn' : 'bg-bg-2 text-fg-3')}>{site.visibility === 'public' ? 'Public' : 'Private'}</span>
          </span>
          <span className="block truncate text-[12px] leading-4 text-fg-3" title={site.folder}>
            {site.kind === 'page' ? `The page “${site.pageTitle ?? site.pageId}”` : tildify(site.folder ?? '', home)} · {ago(site.createdAt)}
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={remove} className="h-8 px-2.5">
          Unpublish
        </Button>
      </div>
      <SiteLink path={site.path} />
      {confirmNode}
    </div>
  );
}
