// What each kind of page exports as, in the order the Export menus show them.
import type { ReactNode } from 'react';
import { BookOpen, FileArchive, FileCode2, FilePen, FileSpreadsheet, FileText, FileType2, Images, NotebookText, PackageCheck, Presentation, Sheet, TextAlignStart } from 'lucide-react';
import type { PageInfo } from '@shared/pages';
import type { ExportFormat } from './exportFile';

type Item = { format: ExportFormat; label: string; icon: ReactNode };

const PDF: Item = { format: 'pdf', label: 'PDF', icon: <FileText size={14} /> };
const HTML: Item = { format: 'html', label: 'Web page (.html)', icon: <FileCode2 size={14} /> };

export const EXPORTS = (kind: PageInfo['kind']): Item[] =>
  kind === 'slides'
    ? [{ format: 'pptx', label: 'PowerPoint (.pptx)', icon: <Presentation size={14} /> }, PDF, { format: 'png', label: 'Pictures of the slides (.png)', icon: <Images size={14} /> }, HTML]
    : kind === 'doc'
      ? [
          { format: 'docx', label: 'Word document (.docx)', icon: <FileType2 size={14} /> },
          { format: 'odt', label: 'OpenDocument (.odt)', icon: <FilePen size={14} /> },
          PDF,
          { format: 'md', label: 'Markdown (.md)', icon: <FileCode2 size={14} /> },
          { format: 'epub', label: 'EPUB (.epub)', icon: <BookOpen size={14} /> },
          { format: 'txt', label: 'Plain text (.txt)', icon: <TextAlignStart size={14} /> },
          HTML,
        ]
      : kind === 'sheet'
        ? [{ format: 'xlsx', label: 'Excel (.xlsx)', icon: <FileSpreadsheet size={14} /> }, { format: 'csv', label: 'CSV (.csv)', icon: <Sheet size={14} /> }, PDF, HTML]
        : kind === 'tex'
          ? [
              PDF,
              { format: 'tex', label: 'LaTeX source (.tex)', icon: <FileCode2 size={14} /> },
              { format: 'zip', label: 'LaTeX project (.zip)', icon: <FileArchive size={14} /> },
              { format: 'arxiv', label: 'arXiv package (.zip)', icon: <PackageCheck size={14} /> },
            ]
          : kind === 'notebook'
            ? [{ format: 'ipynb', label: 'Jupyter notebook (.ipynb)', icon: <NotebookText size={14} /> }, { format: 'py', label: 'Python script (.py)', icon: <FileCode2 size={14} /> }, PDF, HTML]
            : [PDF, { format: 'docx', label: 'Word document (.docx)', icon: <FileType2 size={14} /> }, HTML];
