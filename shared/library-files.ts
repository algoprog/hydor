// Files added to the Library by dropping them on it (or picking them with Upload files): what the server answers about
// each. A file becomes what it is: a document, a spreadsheet, slides, a LaTeX document or a notebook (a page of that
// kind), a picture, a video or a sound (the Library's media), or, dropped on a project, a file in the project's folder.
// In the desktop app a dropped file is moved in by its path instead of uploaded: then also where the original went.
import type { MediaItem } from './media.ts';
import type { PageInfo } from './pages.ts';

/** What a file will become, by its name: a page of a kind, a picture, a video or a sound, or a file in a project's folder. */
export type FileBecomes = 'page' | 'image' | 'video' | 'audio' | 'file';

/** POST /api/library/uploads: where to send the file's pieces, and what it will become. */
export interface UploadStarted {
  upload: string;
  becomes: FileBecomes;
  /** A page's kind (doc, sheet, slides, tex, notebook), when it becomes one. */
  kind?: string;
  /** The most bytes a piece may carry. */
  piece: number;
}

/** Why the Library could not take a file, beside the error's words: its kind, its size, or no room on the disk. */
export type FileRefused = 'kind' | 'size' | 'room';

/** Why a dropped file's original could not be moved in by its path, so a copy is uploaded instead (the original stays). */
export type MoveRefused = 'project' | 'data' | 'system' | 'link';

/** What a file became. */
export interface FileAdded {
  as: 'page' | 'media' | 'file';
  page?: PageInfo;
  item?: MediaItem;
  /** A picture, a video or a sound the Library had already (the same bytes): that one, and no copy was made. */
  existed?: boolean;
  /** A file put in a project's folder: where it is now. */
  path?: string;
  /** The project it went in; none: in no project. */
  space?: string;
  /** What did not come along (the import's notes), or why a file went in the project's folder rather than becoming a page. */
  notes: string[];
  /** Moved in by its path: the original left its place. */
  moved?: boolean;
  /** Where the original is now, in the app's Trash: a file the Library made a page of, which Put back brings back. */
  trashed?: string;
  /**
   * Moved in by its path, but the original stayed where it was: the page made of it could not keep all of it (its notes
   * say what, and `lost` names it: a Word file's headers, footnotes…, an Excel file's charts…, as Files' editors name
   * them; 'cut': it did not all fit; 'files': a LaTeX file reads others of its folder; 'pictures': a Markdown or HTML
   * file shows pictures of its folder).
   */
  stayed?: boolean;
  lost?: string[];
}
