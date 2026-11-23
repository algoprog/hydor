// Word suggestions: the grey rest of the word after the caret while you type (and the next word, dimmer). The
// capability is Settings → Capabilities → Word suggestions; the grey words themselves live in the text boxes
// (useTextareaSuggest.tsx, useDocSuggest.tsx).
import { TextCursorInput } from 'lucide-react';
import type { WebFeature } from '../registry';
import { SuggestSettings } from './SuggestSettings';

export const suggestFeature: WebFeature = {
  id: 'suggest',
  settings: [{ id: 'suggest', label: 'Word suggestions', icon: TextCursorInput, sub: 'The rest of the word you are typing in grey, and the next word, from a small model that learns from your writing', Body: SuggestSettings }],
};
