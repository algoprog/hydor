// Preview session lessons without changing the wiki or the app's persistent state.
import crypto from 'node:crypto';
import type { TimelineItem } from '../../../shared/types.ts';
import { ownWords } from '../../memory/learn.ts';
import { redactSecrets, secretIn, steeringIn } from '../../memory/secrets.ts';

export interface Lesson {
  title: string;
  lesson: string;
  evidence: string;
  uncertainty: string;
  sourceIds: string[];
}

export interface LessonPreview {
  session: string;
  target: string;
  path: string;
  content: string;
  sha256: string;
  lessons: Lesson[];
}

// Remove familiar sensitive identifiers before sending input to a model or displaying results.
export function redact(text: string): string {
  return redactSecrets(text)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:https?:\/\/)[^\s)]+/gi, '[URL removed]');
}

// Keep only actual user messages and final assistant text; tool results are untrusted and may hold secrets.
export function lessonContext(items: TimelineItem[]): { id: string; role: string; text: string }[] {
  return items
    .filter((item): item is Extract<TimelineItem, { kind: 'user' | 'assistant' }> => (item.kind === 'user' && !item.meta && !item.peer) || (item.kind === 'assistant' && !item.streaming))
    .slice(-30)
    .map((item) => ({ id: item.id, role: item.kind, text: redact(item.kind === 'user' ? ownWords(item.text) : item.text).slice(0, 1500) }))
    .filter((item) => item.text.trim());
}

// Reject ungrounded model output rather than treating a generated lesson as verified history.
export function validateLessons(value: unknown, items: { id: string }[]): Lesson[] {
  const source = value && typeof value === 'object' ? (value as { lessons?: unknown }).lessons : null;
  if (!Array.isArray(source)) return [];
  const ids = new Set(items.map((item) => item.id));
  return source.slice(0, 8).flatMap((v): Lesson[] => {
    if (!v || typeof v !== 'object') return [];
    const x = v as Record<string, unknown>;
    const clean = (text: unknown, max: number) => typeof text === 'string' ? redact(text.replace(/[\r\n]+/g, ' ').trim()).slice(0, max) : '';
    const title = clean(x.title, 120), lesson = clean(x.lesson, 800), evidence = clean(x.evidence, 400), uncertainty = clean(x.uncertainty, 300);
    const sourceIds = Array.isArray(x.sourceIds) ? [...new Set(x.sourceIds.filter((id): id is string => typeof id === 'string' && ids.has(id)))].slice(0, 6) : [];
    if (!title || !lesson || !evidence || !sourceIds.length || [title, lesson, evidence, uncertainty].some((s) => secretIn(s) || steeringIn(s))) return [];
    return [{ title, lesson, evidence, uncertainty, sourceIds }];
  });
}

// A plain, bounded preview is suitable for explicit review and later use by the normal wiki write path.
export function previewLessons(options: { session: string; target: string; items: TimelineItem[]; candidates: unknown; date?: string; translate?: (text: string) => string }): LessonPreview {
  const context = lessonContext(options.items);
  const session = redact(options.session).replace(/[^\w:.-]/g, '_').slice(0, 120);
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid lesson date');
  const lessons = validateLessons({ lessons: options.candidates }, context);
  // Translate only generated labels; candidate text, evidence identifiers and source material stay intact.
  const t = options.translate ?? ((text: string) => text);
  const blocks = lessons.map((l) => `## ${l.title}\n\n${l.lesson}\n\n${t('Evidence')}: ${l.evidence}\n\n${t('Uncertainty')}: ${l.uncertainty || t('Not specified')}\n\n${t('Session messages')}: ${l.sourceIds.join(', ')}\n`);
  const content = `---\ntitle: ${JSON.stringify(t('Lessons Learned'))}\ntype: notes\ntags: [lessons-learned]\n---\n\n# ${t('Lessons Learned')}\n\n${t('Session')}: ${session}\n${t('Date')}: ${date}\n\n${blocks.join('\n')}`;
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return { session, target: options.target, path: `raw/notes/${date}-lessons-${hash.slice(0, 12)}.md`, content, sha256: hash, lessons };
}
