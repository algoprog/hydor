// Script tests for asking before sending on signed-in sites, without a browser: which button names count as sending,
// posting, deleting or transferring (and which do not), the ask and the OK that lets one press through for two minutes,
// the setting, and which button Enter would press.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/confirm-test.ts
//   DATA_DIR=/tmp/hydor-test-confirm node dist/dev/confirm-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserAsk } from '../../shared/browser.ts';
import { openDb } from '../db.ts';
import { allow, ALLOW_MS, hostOf, useAllowance } from './confirm.ts';
import { confirmFirst, consequentialOnPage, forgetSession, remember, type OpCtx } from './ops.ts';
import { isConsequential, type El } from './outline.ts';
import type { SessionBrowser } from './session.ts';
import { browserSettings, setBrowserSettings } from './settings.ts';
import type { Tab } from './tab.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- the words ------------------------------------------------------------------------------------------------

const YES = {
  English: ['Send', 'Send message', 'Post', 'Post comment', 'Publish', 'Share', 'Reply', 'Reply all', 'Comment', 'Tweet', 'Delete', 'Delete account', 'Remove', 'Erase', 'Discard', 'Transfer', 'Transfer funds', 'Send money', 'Withdraw', 'Unsubscribe', 'Submit', 'Cancel subscription', 'Cancel my membership', 'Close account', 'Close your account', 'Add a comment', 'Yes, delete', 'Confirm and send', 'Send now'],
  German: ['Senden', 'Absenden', 'Posten', 'Veröffentlichen', 'Teilen', 'Antworten', 'Kommentieren', 'Löschen', 'Entfernen', 'Überweisen', 'Nachricht senden', 'Konto löschen', 'Geld überweisen', 'Abonnement kündigen', 'Verwerfen', 'Abheben'],
  Greek: ['Αποστολή', 'Δημοσίευση', 'Διαγραφή', 'Μεταφορά', 'Κοινοποίηση', 'Απάντηση', 'Ανάληψη', 'Διαγραφή λογαριασμού', 'Ακύρωση συνδρομής', 'Κλείσιμο λογαριασμού', 'Υποβολή'],
  Chinese: ['发送', '发布', '删除', '转账', '提交', '分享', '回复', '发表评论', '发送消息', '删除账户', '取消订阅', '退订', '提现', '注销账户'],
  French: ['Envoyer', 'Publier', 'Supprimer', 'Virement', 'Effectuer un virement', 'Partager', 'Répondre', 'Commenter', 'Envoyer le message', 'Supprimer le compte', 'Annuler mon abonnement', 'Fermer le compte', 'Se désabonner'],
  Spanish: ['Enviar', 'Publicar', 'Eliminar', 'Transferir', 'Compartir', 'Responder', 'Comentar', 'Borrar', 'Enviar mensaje', 'Cancelar suscripción', 'Cerrar cuenta', 'Darse de baja'],
};

const NO = {
  English: ['Search', 'Sign in', 'Log in', 'Next', 'Continue', 'Save draft', 'Save', 'Cancel', 'Close', 'Back', 'Learn more', 'Comments', '12 comments', 'Posts', 'Sent', 'Sent mail', 'Deleted items', 'Send code', 'Send me a link', 'Resend code', 'Send verification email', 'Remove filter', 'How to delete your data and more besides this', 'Share your thoughts about the weather today', 'OK', 'Confirm', 'Yes'],
  German: ['Suche', 'Anmelden', 'Weiter', 'Abbrechen', 'Entwurf speichern', 'Schließen', 'Code senden', 'Link senden', 'Code erneut senden', 'Kommentare', 'Zurück'],
  Greek: ['Αναζήτηση', 'Σύνδεση', 'Επόμενο', 'Ακύρωση', 'Αποθήκευση πρόχειρου', 'Κλείσιμο', 'Αποστολή κωδικού', 'Πίσω'],
  Chinese: ['搜索', '登录', '下一步', '取消', '保存草稿', '关闭', '发送验证码', '已发送', '评论 12', '分享 3', '返回'],
  French: ['Rechercher', 'Se connecter', 'Suivant', 'Annuler', 'Enregistrer le brouillon', 'Fermer', 'Continuer', 'Envoyer le code', 'Renvoyer le code', 'Commentaires'],
  Spanish: ['Buscar', 'Iniciar sesión', 'Siguiente', 'Cancelar', 'Guardar borrador', 'Cerrar', 'Continuar', 'Enviar código', 'Reenviar código', 'Comentarios'],
};

for (const [lang, names] of Object.entries(YES)) test(`${lang}: names that send, post, delete or transfer count`, () => {
  for (const n of names) assert.equal(isConsequential(n, { role: 'button' }), true, n);
});
for (const [lang, names] of Object.entries(NO)) test(`${lang}: names that only search, sign in, go on, save or close do not`, () => {
  for (const n of names) assert.equal(isConsequential(n, { role: 'button' }), false, n);
});

test('only what presses counts: a text field or a checkbox named "Send" does not', () => {
  assert.equal(isConsequential('Send', { role: 'textbox' }), false);
  assert.equal(isConsequential('Delete', { role: 'checkbox' }), false);
  for (const role of ['button', 'link', 'menuitem', 'clickable']) assert.equal(isConsequential('Delete', { role }), true, role);
  assert.equal(isConsequential('', { role: 'button' }), false);
});

test('a bare Confirm, Yes or OK counts when the page is about sending, deleting or transferring', () => {
  const page = 'Delete this post? This cannot be undone.';
  for (const n of ['Confirm', 'Yes', 'OK', 'Bestätigen', 'Confirmer', 'Confirmar', '确认', 'Επιβεβαίωση']) assert.equal(isConsequential(n, { role: 'button' }), false, `${n} alone`);
  for (const n of ['Confirm', 'Yes', 'OK']) assert.equal(isConsequential(n, { role: 'button', page }), true, n);
  assert.equal(isConsequential('Bestätigen', { role: 'button', page: 'Dieses Konto löschen?' }), true);
  assert.equal(isConsequential('Confirmar', { role: 'button', page: '¿Eliminar este mensaje?' }), true);
  assert.equal(isConsequential('确认', { role: 'button', page: '确定要删除吗？' }), true);
  assert.equal(isConsequential('Επιβεβαίωση', { role: 'button', page: 'Διαγραφή της ανάρτησης;' }), true);
  assert.equal(isConsequential('Confirm', { role: 'button', page: 'Confirm your email address to continue.' }), false);
  assert.equal(isConsequential('OK', { role: 'button', page: 'Your settings were saved.' }), false);
});

// ---- the ask and the OK -----------------------------------------------------------------------------------------

/** A session browser with only what the ask needs: its profile, its asks and OKs, and where it is. */
function fake(profile: string, url = 'https://social.example/home') {
  const asked: BrowserAsk[] = [];
  const b = {
    key: 'k',
    profile,
    asks: asked,
    allowed: new Map<string, number>(),
    active: null as unknown,
    refs: new Map(),
    async ask(kind: BrowserAsk['kind'], text: string) {
      const a: BrowserAsk = { id: `a${asked.length}`, kind, text, url: t.url, at: Date.now() };
      asked.push(a);
      return a;
    },
  };
  const t = { url } as Tab;
  b.active = t;
  return { b: b as unknown as SessionBrowser & typeof b, t };
}
const el = (o: Partial<El> & { id: number; name: string }): El => ({ session: 's', backendNodeId: o.id, role: 'button', box: { x: 0, y: 0, w: 10, h: 10 }, inView: true, tag: 'button', ...o });
const ctx = (confirmSignedIn?: boolean) => ({ confirmSignedIn }) as OpCtx;

test('a signed-in browser asks before pressing Send, and tells the agent to end its turn', async () => {
  const { b, t } = fake('browsing');
  const r = await confirmFirst(b, t, el({ id: 4, name: 'Send', consequential: true }), ctx());
  assert.ok(r);
  assert.match(r.line, /Did not press \[4\] “Send”/);
  assert.match(r.line, /on social\.example/);
  assert.match(r.stop!, /End your turn/);
  assert.equal(b.asks.length, 1);
  assert.equal(b.asks[0].kind, 'confirm');
  assert.equal(b.asks[0].text, 'Send');
  assert.equal(hostOf(b.asks[0].url), 'social.example');
});

test('asking again about the same button on the same site does not add a second card', async () => {
  const { b, t } = fake('p1');
  const e = el({ id: 4, name: 'Post', consequential: true });
  await confirmFirst(b, t, e, ctx());
  await confirmFirst(b, t, e, ctx());
  assert.equal(b.asks.length, 1);
  await confirmFirst(b, t, el({ id: 5, name: 'Delete', consequential: true }), ctx());
  assert.equal(b.asks.length, 2);
});

test('a fresh browser (no profile), a plain button, and the setting turned off all go ahead', async () => {
  const e = el({ id: 4, name: 'Send', consequential: true });
  const fresh = fake('');
  assert.equal(await confirmFirst(fresh.b, fresh.t, e, ctx()), null);
  assert.equal(fresh.b.asks.length, 0);
  const signed = fake('p1');
  assert.equal(await confirmFirst(signed.b, signed.t, el({ id: 6, name: 'Next' }), ctx()), null);
  assert.equal(await confirmFirst(signed.b, signed.t, e, ctx(false)), null);
  assert.equal(signed.b.asks.length, 0);
  assert.ok(await confirmFirst(signed.b, signed.t, e, ctx(true)));
});

test('an OK lets one press of the same words on that site through, once', async () => {
  const { b, t } = fake('p1');
  const e = el({ id: 4, name: 'Send', consequential: true });
  allow(b.allowed, t.url, 'Send');
  assert.equal(await confirmFirst(b, t, e, ctx()), null, 'the press the OK is for');
  assert.equal(b.asks.length, 0);
  assert.ok(await confirmFirst(b, t, e, ctx()), 'the second press asks again');
  assert.equal(b.asks.length, 1);
});

test('an OK is for those words on that site: other words or another site still ask', async () => {
  const { b, t } = fake('p1');
  allow(b.allowed, t.url, 'Send');
  assert.ok(await confirmFirst(b, t, el({ id: 5, name: 'Delete', consequential: true }), ctx()));
  const other = { url: 'https://elsewhere.example/home' } as Tab;
  assert.ok(await confirmFirst(b, other, el({ id: 4, name: 'Send', consequential: true }), ctx()));
  // The words match however the page cases and spaces them.
  allow(b.allowed, t.url, 'Send  Message');
  assert.equal(await confirmFirst(b, t, el({ id: 7, name: 'send message', consequential: true }), ctx()), null);
});

test('an OK lasts two minutes', () => {
  const m = new Map<string, number>();
  const t0 = 1_000_000;
  allow(m, 'https://a.example/x', 'Post', t0);
  assert.equal(useAllowance(m, 'https://a.example/y', 'post', t0 + ALLOW_MS - 1), true);
  allow(m, 'https://a.example/x', 'Post', t0);
  assert.equal(useAllowance(m, 'https://a.example/y', 'post', t0 + ALLOW_MS + 1), false);
  assert.equal(m.size, 0, 'an expired OK is dropped');
  assert.equal(ALLOW_MS, 120_000);
});

// ---- Enter ----------------------------------------------------------------------------------------------------

test('Enter in a field presses a sending button of its own form, or in no form any in view', () => {
  const { b, t } = fake('p1');
  const tab = t as unknown as object;
  b.refs = new Map([1, 2, 3, 4].map((id) => [id, { tab }])) as never;
  b.active = tab as never;
  forgetSession('k');
  const search = el({ id: 1, name: 'Search', role: 'searchbox', tag: 'input', form: 'f:search' });
  const compose = el({ id: 2, name: 'Message', role: 'textbox', tag: 'textarea', form: 'f:compose' });
  const post = el({ id: 3, name: 'Post', consequential: true, form: 'f:compose' });
  const chat = el({ id: 4, name: 'Chat', role: 'textbox', tag: 'input' });
  remember('k', [search, compose, post, chat]);
  assert.equal(consequentialOnPage(b, search), undefined, 'a search box in its own form');
  assert.equal(consequentialOnPage(b, compose)?.id, 3);
  assert.equal(consequentialOnPage(b, chat)?.id, 3, 'a field in no form: a chat sends on Enter');
  forgetSession('k');
});

// ---- the setting ----------------------------------------------------------------------------------------------

test('Settings → Browser: asking is on until turned off, and the choice is kept', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-confirm-test-'));
  const db = openDb(path.join(dir, 'test.db'));
  assert.equal(browserSettings(db).confirmSignedIn, true);
  assert.equal(setBrowserSettings(db, { screenshots: false }).confirmSignedIn, true, 'another change leaves it on');
  assert.equal(setBrowserSettings(db, { confirmSignedIn: false }).confirmSignedIn, false);
  assert.equal(browserSettings(db).confirmSignedIn, false);
  assert.equal(setBrowserSettings(db, { confirmSignedIn: true }).confirmSignedIn, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
