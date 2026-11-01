// The language the user reads the app in (Settings → General): the pages tell the server as they start and
// when it changes, and every agent is asked to reply in it.
import { isLang, LANGS, type Lang } from '../../shared/i18n.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Feature } from '../features/types.ts';

const KEY = 'ui.language';

export const userLang = (db: DB): Lang => {
  const v = kvGet(db, KEY);
  return isLang(v) ? v : 'en';
};

export const language: Feature = {
  id: 'language',
  routes(d) {
    d.app.get('/api/me/language', async () => ({ lang: userLang(d.db) }));
    d.app.put('/api/me/language', async (req) => {
      const lang = (req.body as { lang?: unknown } | undefined)?.lang;
      if (isLang(lang)) kvSet(d.db, KEY, lang);
      return { lang: userLang(d.db) };
    });
  },
  spawn(_s, d) {
    const lang = userLang(d.db);
    if (lang === 'en') return undefined;
    const name = LANGS.find((l) => l.id === lang)!.english;
    return { instructions: [`Language: the user reads this app in ${name}. Write to them in ${name}, unless they write to you in another language or ask for one. Code, commands and file names stay as they are.`] };
  },
};
