// The words the pages of an agent app linked to a web app show for what the server names in English: the kinds of a question and of an answer's field.
import { tr } from '../../i18n/runtime';

/** A kind of question or answer field (as the server words it) in the language of the page. */
export function typeWord(t: string): string {
  switch (t) {
    case 'Short text':
      return tr('Short text');
    case 'Long text':
      return tr('Long text');
    case 'Number':
      return tr('Number');
    case 'Date':
      return tr('Date');
    case 'Choice':
      return tr('Choice');
    case 'Yes or no':
      return tr('Yes or no');
    case 'File':
      return tr('File');
    case 'Text':
      return tr('Text');
    case 'Formatted text':
      return tr('Formatted text');
    case 'Link':
      return tr('Link');
    case 'List':
      return tr('List');
    case 'Table':
      return tr('Table');
    case 'Pictures or files':
      return tr('Pictures or files');
    case 'A card':
      return tr('A card');
    default:
      return t;
  }
}

/** A run's state as a person says it. */
export function stateWord(status: string): { label: string; tone: 'ok' | 'err' | 'info' | 'neutral' | 'warn' } {
  switch (status) {
    case 'done':
      return { label: tr('Done'), tone: 'ok' };
    case 'failed':
      return { label: tr('Failed'), tone: 'err' };
    case 'stopped':
      return { label: tr('Stopped'), tone: 'neutral' };
    case 'waiting':
      return { label: tr('Needs you'), tone: 'warn' };
    case 'queued':
    case 'starting':
      return { label: tr('Starting'), tone: 'info' };
    default:
      return { label: tr('Working'), tone: 'info' };
  }
}
