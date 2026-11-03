// The keys an app needs (shared/app-secrets.ts), as the vault has them: which are there and which are missing, the
// hosts an app sends one to that the key is not allowed to go to yet, and saving the values the person gives (on the
// app's form, the card that installs it, or its card in a session). A new key goes to the vault with the hosts and
// settings the app says; a key the vault has keeps the person's own, and only its value changes.
import type { AppRecipe } from '../../shared/apps.ts';
import type { AppSecretState } from '../../shared/app-secrets.ts';
import { domainAllowed } from '../../shared/connections.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { saveSecret, secretView } from '../connections/vault.ts';

/** A key as an app's pages show it: whether the vault has it, its masked end, and what the vault does not allow yet. */
export type SecretStateView = AppSecretState & { blocked?: string[]; noCommands?: boolean };

/** The keys a recipe needs, each with how the vault has it. */
export function secretsOf(db: DB, recipe: Pick<AppRecipe, 'secrets'>): SecretStateView[] {
  return (recipe.secrets ?? []).map((s) => {
    const v = secretView(db, s.name);
    if (!v) return { ...s, have: false };
    const blocked = (s.domains ?? []).filter((d) => !domainAllowed(d, v.domains));
    return { ...s, have: true, hint: v.hint, ...(blocked.length ? { blocked } : {}), ...(s.commands && !v.commands ? { noCommands: true } : {}) };
  });
}

/** The keys it needs and the vault does not have (not those it can do without). */
export const missingSecrets = (db: DB, recipe: Pick<AppRecipe, 'secrets'>) => secretsOf(db, recipe).filter((s) => !s.have && !s.optional);

/** Refuses a run that needs keys the vault does not have, saying which; the pages ask for them on seeing `secrets`. */
export function needSecrets(db: DB, recipe: Pick<AppRecipe, 'secrets' | 'name'>) {
  const miss = missingSecrets(db, recipe);
  if (!miss.length) return;
  const names = miss.map((s) => s.label).join(', ');
  const vault = miss.map((s) => s.name).join(', ');
  const secrets = miss.map(({ name, label, help, url, optional }) => ({ name, label, help, url, optional, have: false }));
  // Whole sentences, so each reads right in the app's other languages.
  if (miss.length > 1) throw new HttpError(409, `${recipe.name} needs these keys first: ${names}. Add them on its page (or in Keys, as ${vault}).`, { secrets });
  throw new HttpError(409, `${recipe.name} needs a key first: ${names}. Add it on its page (or in Keys, as ${vault}).`, { secrets });
}

/**
 * Saves the values given for an app's keys (by name; others are ignored). Gives the names saved. With `allow`,
 * a key the vault has may also go to the app's hosts, and be used in commands when the app needs that.
 */
export function saveAppSecrets(db: DB, recipe: Pick<AppRecipe, 'secrets' | 'name'>, values: unknown, o: { allow?: string[] } = {}): string[] {
  const given = values && typeof values === 'object' && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
  const saved: string[] = [];
  for (const s of recipe.secrets ?? []) {
    const v = given[s.name];
    const old = secretView(db, s.name);
    const widen = old && o.allow?.includes(s.name);
    if (typeof v === 'string' && v.trim()) {
      if (v.length > 16_000) throw new HttpError(400, `${s.label}: that is too long for a key`);
      saveSecret(
        db,
        old
          ? { name: s.name, value: v, ...(widen ? { domains: [...new Set([...old.domains, ...(s.domains ?? [])])], ...(s.commands ? { commands: true } : {}) } : {}) }
          : { name: s.name, value: v, domains: s.domains ?? [], commands: !!s.commands, note: `${recipe.name}: ${s.label}`.slice(0, 300), header: s.header ?? null, prefix: s.prefix ?? null, query: s.query ?? null },
      );
      saved.push(s.name);
    } else if (widen) {
      saveSecret(db, { name: s.name, domains: [...new Set([...old.domains, ...(s.domains ?? [])])], ...(s.commands ? { commands: true } : {}) });
      saved.push(s.name);
    }
  }
  return saved;
}
