// The keys an app needs (shared/app-secrets.ts), as the vault has them: which are there and which are missing, the
// hosts an app sends one to that the key is not allowed to go to yet, and saving the values the person gives (on the
// app's form, the card that installs it, or its card in a session). A new key goes to the vault with the hosts and
// settings the app says; a key the vault has keeps the person's own, and only its value changes. An app whose models
// run through OpenRouter (models.ts) needs OpenRouter's key too: asked for the same way, and kept with Settings → Models.
import type { AppRecipe } from '../../shared/apps.ts';
import type { AppSecretState } from '../../shared/app-secrets.ts';
import { allSteps } from '../../shared/app-manifest.ts';
import { neededBy } from '../../shared/app-secrets.ts';
import { domainAllowed } from '../../shared/connections.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { saveSecret, secretView } from '../connections/vault.ts';
import { providerKey, saveProviderKey } from './models.ts';

/**
 * A key as an app's pages show it: whether the vault has it, its masked end, and what the vault does not allow yet.
 * `provider`: a provider's own key (OpenRouter's), kept with Settings → Models rather than in the vault.
 */
export type SecretStateView = AppSecretState & { blocked?: string[]; noCommands?: boolean; provider?: 'openrouter' };

type Recipe = Pick<AppRecipe, 'secrets'> & Partial<Pick<AppRecipe, 'name' | 'requires' | 'flow' | 'flows' | 'agent' | 'acpAgent' | 'model'>>;

/** The keys a recipe needs, each with how the vault has it; OpenRouter's last, when its models run there. */
export function secretsOf(db: DB, recipe: Recipe): SecretStateView[] {
  const own: SecretStateView[] = (recipe.secrets ?? []).map((s) => {
    const v = secretView(db, s.name);
    if (!v) return { ...s, have: false };
    const blocked = (s.domains ?? []).filter((d) => !domainAllowed(d, v.domains));
    return { ...s, have: true, hint: v.hint, ...(blocked.length ? { blocked } : {}), ...(s.commands && !v.commands ? { noCommands: true } : {}) };
  });
  const p = providerKey(recipe);
  return p && !own.some((s) => s.name === p.name) ? [...own, p] : own;
}

/**
 * The keys one of its flows besides the main one signs its requests with (http_request's auth): that flow needs them,
 * even when the app can do without them (a ready-made app's Publish, which needs a Hugging Face token the rest does not).
 */
export function keysOfFlow(recipe: Recipe, flow?: string): string[] {
  const f = flow && flow !== 'run' ? recipe.flows?.[flow] : undefined;
  if (!f) return [];
  const names = new Set<string>();
  for (const s of allSteps(f.steps)) if (s.do === 'tool' && s.tool === 'http_request' && typeof s.with?.auth === 'string' && s.with.auth.trim()) names.add(s.with.auth.trim());
  return [...names];
}

/**
 * The keys a run of one of its flows ("run", the main one) needs and the vault does not have: those it cannot do without
 * that are for that flow (a key that names its flows is for those alone), and an optional one that flow signs with.
 */
export const missingSecrets = (db: DB, recipe: Recipe, flow = 'run') => {
  const used = keysOfFlow(recipe, flow);
  return secretsOf(db, recipe).filter((s) => !s.have && ((!s.optional && neededBy(s, flow)) || used.includes(s.name)));
};

/** Refuses a run (of a flow: "run", the main one) that needs keys the vault does not have, saying which; the pages ask for them on seeing `secrets`. */
export function needSecrets(db: DB, recipe: Recipe, flow = 'run') {
  const states = secretsOf(db, recipe);
  const miss = missingSecrets(db, recipe, flow);
  if (!miss.length) return;
  const names = miss.map((s) => s.label).join(', ');
  const vault = miss.map((s) => s.name).join(', ');
  // The keys this flow needs that the vault lacks, the optional ones too, for the page to ask for together.
  const secrets = states.filter((s) => !s.have && neededBy(s, flow)).map(({ name, label, help, url, optional }) => ({ name, label, help, url, optional, have: false }));
  // Whole sentences, so each reads right in the app's other languages.
  if (miss.length > 1) throw new HttpError(409, `${recipe.name} needs these keys first: ${names}. Add them on its page (or in Keys, as ${vault}).`, { secrets });
  throw new HttpError(409, `${recipe.name} needs a key first: ${names}. Add it on its page (or in Keys, as ${vault}).`, { secrets });
}

/**
 * Saves the values given for an app's keys (by name; others are ignored). Gives the names saved. With `allow`,
 * a key the vault has may also go to the app's hosts, and be used in commands when the app needs that.
 */
export function saveAppSecrets(db: DB, recipe: Recipe, values: unknown, o: { allow?: string[] } = {}): string[] {
  const given = values && typeof values === 'object' && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
  const saved: string[] = [];
  // OpenRouter's key, for an app whose models run there: kept with Settings → Models (unless the app names a vault key so).
  const p = providerKey(recipe);
  const pv = p ? given[p.name] : undefined;
  if (p && !(recipe.secrets ?? []).some((s) => s.name === p.name) && typeof pv === 'string' && pv.trim()) {
    if (pv.length > 16_000) throw new HttpError(400, `${p.label}: that is too long for a key`);
    saveProviderKey(pv.trim());
    saved.push(p.name);
  }
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
