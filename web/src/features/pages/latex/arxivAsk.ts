// Which document's arXiv package is being made, if any: asked from the Export menus (Export → arXiv package (.zip),
// a card's Download as, the page beside a conversation) and the LaTeX editor's Tools → Your paper; ArxivHost, always
// on the page, shows its dialog (loaded the first time it is asked for).
import { create } from 'zustand';

export const useArxivAsk = create<{ ask: { page: string; version?: number; n: number } | null }>(() => ({ ask: null }));

/** Opens the arXiv package's dialog for a LaTeX document of the Library (an older version of it with `version`). */
export const askArxiv = (page: string, version?: number) => useArxivAsk.setState({ ask: { page, version, n: Date.now() } });

export const closeArxiv = () => useArxivAsk.setState({ ask: null });
