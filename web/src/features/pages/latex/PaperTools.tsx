// The LaTeX editor's tools for a paper (Tools → Check before submitting, and Tools → Your paper): the check's dialog;
// Make it camera-ready and Move to another template, each a request for the agent beside the editor, written from
// the venue's rules (what its final version changes, its pages, its parts) or the template picked; the arXiv
// package (Export's, for this document); and three ready-made apps opened with the paper filled in (Review it as
// reviewers would, Answer reviews, Make a talk, poster and thread): its PDF, or its project's folder, on this
// computer. What is not saved yet is saved first, so they get the paper as it is in front of you.
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRightLeft, BadgeCheck, FileArchive, GraduationCap, ListChecks, MessagesSquare, Presentation, Reply, Sparkles } from 'lucide-react';
import { TEX_MAIN, type TexComment, type TexDoc } from '@shared/latex';
import { PAPER_APPS, paperAppPath, venueById, venueSummary, type CheckEdit } from '@shared/latex-submit';
import { Button, cx, Dialog, inputCls, Segmented } from '../../../components/ui';
import { go } from '../../../lib/nav';
import { toast, toastError } from '../../../lib/store';
import type { MenuEntry } from '../common/menus';
import { askArxiv } from './arxivAsk';
import { CheckDialog, VenueSelect } from './CheckDialog';
import { applyEdits, paperOnDisk, venueFor } from './paper';

export type PaperAsk = { kind: 'check' } | { kind: 'ready' } | { kind: 'move' } | { kind: 'arxiv' } | { kind: 'app'; app: string } | null;

const APP_ICON: Record<string, ReactNode> = {
  'reviewer-simulator': <MessagesSquare size={14} />,
  'rebuttal-workbench': <Reply size={14} />,
  'paper-to-talk': <Presentation size={14} />,
};
const APP_WORDS: Record<string, string> = {
  'reviewer-simulator': 'reviewer simulator review score weaknesses baselines ablations',
  'rebuttal-workbench': 'rebuttal workbench reviews reply response',
  'paper-to-talk': 'paper to talk slides poster thread project page present conference',
};

/** Tools' items for a paper: the check, and Your paper's list. */
export function paperItems(o: { ask: (a: PaperAsk) => void; readOnly?: boolean; canAsk: boolean; canArxiv: boolean }): MenuEntry[] {
  return [
    { label: 'Check before submitting', icon: <ListChecks size={14} />, also: 'pre-submission venue anonymity anonymous page limit references bibliography citations fonts tables bold', run: () => o.ask({ kind: 'check' }) },
    {
      label: 'Your paper',
      icon: <GraduationCap size={14} />,
      also: 'paper research conference journal',
      items: [
        { label: 'Make it camera-ready', icon: <BadgeCheck size={14} />, disabled: o.readOnly || !o.canAsk, also: 'final version accepted authors copyright', run: () => o.ask({ kind: 'ready' }) },
        { label: 'Move to another template', icon: <ArrowRightLeft size={14} />, disabled: o.readOnly || !o.canAsk, also: 'venue class style conference journal format resubmit', run: () => o.ask({ kind: 'move' }) },
        o.canArxiv && { label: 'arXiv package (.zip)', icon: <FileArchive size={14} />, also: 'arxiv preprint submit upload zip comments bbl', run: () => o.ask({ kind: 'arxiv' }) },
        '-',
        ...PAPER_APPS.map((a) => ({ label: a.label, icon: APP_ICON[a.id], also: APP_WORDS[a.id], run: () => o.ask({ kind: 'app', app: a.id }) })),
      ],
    },
  ];
}

const textIn = (d: TexDoc, name: string) => (name === TEX_MAIN ? d.main : (d.files.find((f) => f.name === name)?.text ?? null));

/** Templates to move to besides the venues'. */
const MORE_TEMPLATES = [
  { id: 'lncs', label: 'Springer LNCS (llncs)', group: 'Other templates', kit: 'https://www.springer.com/gp/computer-science/lncs/conference-proceedings-guidelines' },
  { id: 'elsarticle', label: 'Elsevier (elsarticle)', group: 'Other templates', kit: 'https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions' },
  { id: 'article', label: 'A plain article (the article class)', group: 'Other templates', kit: '' },
];

export function PaperTools({
  ask,
  onClose,
  doc,
  pageId,
  onDisk,
  base,
  dirty,
  save,
  readOnly,
  canComment,
  label,
  onAsk,
  goTo,
  editFile,
  setComments,
  showComments,
}: {
  ask: PaperAsk;
  onClose: () => void;
  /** The document as it is in the editor. */
  doc: TexDoc;
  pageId?: string;
  onDisk?: { folder?: string; main: string };
  /** The last typesetting that went well (the check starts from it). */
  base?: string;
  dirty: boolean;
  save: () => Promise<boolean>;
  readOnly?: boolean;
  canComment: boolean;
  label: (file: string) => string;
  onAsk?: (text: string) => void;
  goTo: (file: string, line: number) => void;
  editFile: (name: string, f: (text: string) => string) => void;
  setComments: (f: (cs: TexComment[]) => TexComment[]) => void;
  showComments: () => void;
}) {
  const docKey = pageId ?? `file:${onDisk?.folder ?? ''}/${onDisk?.main ?? ''}`;

  // An app opened with the paper, or the arXiv package: saved first, then off it goes.
  useEffect(() => {
    if (!ask || (ask.kind !== 'app' && ask.kind !== 'arxiv')) return;
    let alive = true;
    void (async () => {
      try {
        if (dirty && !readOnly && !(await save())) return;
        if (ask.kind === 'arxiv') {
          if (pageId) askArxiv(pageId);
          return;
        }
        const app = ask.kind === 'app' ? PAPER_APPS.find((a) => a.id === ask.app) : undefined;
        if (!app) return;
        toast(`Opening “${app.label}” with this paper…`);
        const where = await paperOnDisk({ model: doc, page: pageId, folder: onDisk?.folder, base });
        if (!alive) return;
        go(paperAppPath(app.id, app.takes === 'pdf' ? (where.pdf ?? where.folder) : where.folder));
      } catch (e) {
        toastError(e);
      } finally {
        if (alive) onClose();
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  /** A fix's changes, each file's in its editor (so Undo takes them back); none when one of them cannot be placed. */
  const fix = (edits: CheckEdit[]): boolean => {
    const byFile = new Map<string, CheckEdit[]>();
    for (const e of edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
    for (const [file, list] of byFile) {
      const text = textIn(doc, file);
      if (text === null || applyEdits(text, list) === null) return false;
    }
    for (const [file, list] of byFile) editFile(file, (text) => applyEdits(text, list) ?? text);
    return true;
  };

  return (
    <>
      <CheckDialog
        open={ask?.kind === 'check'}
        onClose={onClose}
        doc={doc}
        docKey={docKey}
        page={pageId}
        folder={onDisk?.folder}
        base={base}
        label={label}
        readOnly={readOnly}
        canComment={canComment}
        onShow={goTo}
        onFix={fix}
        onAsk={onAsk}
        onComments={setComments}
        onShowComments={showComments}
      />
      <RequestDialog open={ask?.kind === 'ready'} kind="ready" onClose={onClose} start={venueFor(docKey, doc.main).venue} onAsk={onAsk} />
      <RequestDialog open={ask?.kind === 'move'} kind="move" onClose={onClose} start={venueFor(docKey, doc.main).venue} onAsk={onAsk} />
    </>
  );
}

/** Make it camera-ready, or Move to another template: what the agent will be asked, from the venue or template picked. */
function RequestDialog({ open, kind, onClose, start, onAsk }: { open: boolean; kind: 'ready' | 'move'; onClose: () => void; start: string; onAsk?: (text: string) => void }) {
  const ready = kind === 'ready';
  const [target, setTarget] = useState(start);
  const [version, setVersion] = useState<'review' | 'final'>('review');
  const [people, setPeople] = useState('');
  useEffect(() => {
    if (!open) return;
    // Moving goes somewhere else than where it is now, to start with.
    setTarget(ready ? start : start === 'other' ? 'arr-long' : start);
    setVersion(venueById(start).anonymous ? 'review' : 'final');
  }, [open, start, ready]);
  const more = MORE_TEMPLATES.find((t) => t.id === target);
  const v = venueById(target);
  const name = more?.label ?? v.label;
  const request = ready
    ? [
        `Make this paper camera-ready${v.id === 'other' ? '' : ` for ${v.label}`}: ${v.final}.`,
        v.finalPages ? `The final version may have ${v.finalPages} pages${v.refsCount ? '' : ' before the references'}.` : '',
        v.parts.some((p) => p.final) ? `Add what the final version needs: ${v.parts.filter((p) => p.final).map((p) => p.label).join(' and ')}.` : '',
        people.trim() ? `The authors, their affiliations and the acknowledgements: ${people.trim()}` : 'The authors and their affiliations may be in the source as comments; if they are not, ask me for them.',
        'Keep everything else as it is, typeset it, fix any errors, and tell me in a few lines what you changed.',
      ]
    : [
        `Move this paper to ${name}${more ? '' : '’s template'}${(more?.kit ?? v.kit) ? ` (its files: ${more?.kit ?? v.kit})` : ''}.`,
        'Keep its title, sections, words, figures, tables, equations and references as they are.',
        more?.id === 'article' ? '' : 'Use the template’s own class or style files: if this computer’s TeX does not have them, fetch them and add them to the document as files.',
        version === 'review' ? 'Make it the anonymous version for review, with the authors and acknowledgements hidden or left out.' : 'Make it the final version, with the authors and their affiliations.',
        more ? '' : `Follow its rules (${venueSummary(v)}), and its parts${v.parts.length > 1 ? `: ${v.parts.map((p) => p.label).join(', ')}` : ''}.`,
        'Typeset it, fix any errors, and tell me what had to change (pages over the limit, parts it asks for).',
      ];
  const text = request.filter(Boolean).join(' ');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={ready ? 'Make it camera-ready' : 'Move to another template'}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Sparkles size={14} />}
            disabled={!onAsk}
            onClick={() => {
              onClose();
              onAsk?.(text);
            }}
          >
            Ask the agent
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <VenueSelect label={ready ? 'Accepted at' : 'Move it to'} value={target} onChange={setTarget} without={ready ? [] : ['other']} extra={ready ? [] : MORE_TEMPLATES} />
        {!ready && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
            <span>As its</span>
            <Segmented
              size="sm"
              value={version}
              onChange={setVersion}
              options={[
                { value: 'review', label: 'Version for review' },
                { value: 'final', label: 'Final version' },
              ]}
            />
          </div>
        )}
        {ready && (
          <label className="block space-y-1.5 text-[13px] text-fg-2">
            <span>The authors, their affiliations and the acknowledgements (if they are not in the source)</span>
            <textarea value={people} onChange={(e) => setPeople(e.target.value)} rows={3} placeholder="Ada Lovelace, University of London, ada@example.org; …" className={cx(inputCls, 'h-auto py-2 text-[13.5px]')} />
          </label>
        )}
        <div>
          <div className="mb-1 text-[12px] font-medium text-fg-3">The agent beside the editor is asked</div>
          <p className="rounded-xl bg-bg-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-2">{text}</p>
        </div>
        {!onAsk && <p className="text-[12.5px] text-fg-3">There is no agent beside this editor to ask: open the document from the Library.</p>}
        {v.id !== 'other' && !more && v.call && (
          <p className="text-[12px] text-fg-3">
            Venues change their rules each year:{' '}
            <a href={v.call} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              check the call for papers
            </a>
            .
          </p>
        )}
      </div>
    </Dialog>
  );
}

