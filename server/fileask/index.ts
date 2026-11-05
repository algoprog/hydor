// A request made from a file open in Files (`extra.file`: its path), with its Ask button: the session is about that
// file. The agent works on the file itself, and the editor there takes in each change as it is written.
import path from 'node:path';
import type { Feature } from '../features/types.ts';

const BY_KIND: Record<string, string> = {
  docx: 'It is a Word document: change it with a script that keeps what you do not change (python-docx, say), not by rewriting it from scratch.',
  xlsx: 'It is an Excel workbook: change it with a script that keeps the rest as it is (openpyxl, say), and keep formulas as formulas.',
  ipynb: 'It is a Jupyter notebook: change its cells with your notebook-editing tool (NotebookEdit) or nbformat rather than rewriting its JSON, keep the cell ids and the outputs of cells you do not change, and remember that a cell you change has no output until it runs again ("cell 3" is the third, as the notebook page numbers them).',
};

/** What the agent is told of the file it was asked about. */
export function fileAskInstructions(v: unknown): string | null {
  if (typeof v !== 'string' || !path.isAbsolute(v)) return null;
  const ext = path.extname(v).slice(1).toLowerCase();
  return [
    `The user is asking from the file ${v}, open in front of them in the app's Files: their messages are about that file.`,
    'When they ask for a change, edit that file in place (not a copy, and no new files unless they ask); when they ask a question about it, read it and answer.',
    BY_KIND[ext] ?? '',
    'What they look at updates as soon as you write the file, so they watch your edits arrive; keep any changes of their own, change only what they asked for, and answer in a sentence or two what you changed.',
  ]
    .filter(Boolean)
    .join(' ');
}

export const fileAsk: Feature = {
  id: 'fileask',
  spawn: (s) => {
    const ask = fileAskInstructions(s.extra?.file);
    return ask ? { instructions: [ask] } : undefined;
  },
};
