// An agent's result as an email to people (its "An email" place): a subject with {date}, {time} and {agent} filled in,
// and the result readable in any mail program, as HTML with its styles written on each part (mail programs drop style
// sheets) and as plain text. It goes out from one of the person's connected mail accounts (server/mail/) at once,
// without the Outbox: the person set this place up themselves, with its addresses.
import type { AnswerField } from '../../shared/apps.ts';
import { DEFAULT_EMAIL_SUBJECT, type Assistant, type OutputTarget } from '../../shared/assistants.ts';
import type { DB } from '../db.ts';
import { sendMail } from '../mail/send.ts';

export interface ResultMail {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const p2 = (n: number) => String(n).padStart(2, '0');

/** The email's own few words, in the language the app speaks (the result is in the agent's words). */
const MAIL_WORDS: Record<string, { locale: string; foot: (name: string) => string }> = {
  en: { locale: 'en-GB', foot: (n) => `Sent by ${n}, an agent in Hydor, as its results are set to go.` },
  de: { locale: 'de-DE', foot: (n) => `Gesendet von ${n}, einem Agenten in Hydor, wie es für seine Ergebnisse eingestellt ist.` },
  es: { locale: 'es', foot: (n) => `Enviado por ${n}, un agente de Hydor, según el destino configurado para sus resultados.` },
  fr: { locale: 'fr-FR', foot: (n) => `Envoyé par ${n}, un agent de Hydor, selon la destination choisie pour ses résultats.` },
  pt: { locale: 'pt-BR', foot: (n) => `Enviado por ${n}, um agente do Hydor, conforme o destino definido para os resultados dele.` },
  el: { locale: 'el-GR', foot: (n) => `Στάλθηκε από τον πράκτορα ${n} στο Hydor, όπως έχουν οριστεί να πηγαίνουν τα αποτελέσματά του.` },
  ja: { locale: 'ja-JP', foot: (n) => `Hydorのエージェント「${n}」が、結果の送信先の設定に従って送信しました。` },
  zh: { locale: 'zh-CN', foot: (n) => `由 Hydor 中的智能体“${n}”按其结果去向的设置发送。` },
};

/** A subject with its placeholders filled in: {date} (2026-11-15), {time} (09:30) and {agent} (its name). */
export function mailSubject(pattern: string | undefined, a: Pick<Assistant, 'name'>, now: Date): string {
  const date = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
  const time = `${p2(now.getHours())}:${p2(now.getMinutes())}`;
  return (pattern?.trim() || DEFAULT_EMAIL_SUBJECT)
    .replaceAll('{date}', date)
    .replaceAll('{time}', time)
    .replaceAll('{agent}', a.name)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
}

/** The HTML of a result (markdownHtml's) with each part's look written on it, as mail programs need. */
function inlineStyles(html: string): string {
  const S: Record<string, string> = {
    h1: 'font-size:20px;margin:18px 0 8px',
    h2: 'font-size:16px;margin:18px 0 6px',
    h3: 'font-size:15px;margin:14px 0 6px',
    h4: 'font-size:14px;margin:12px 0 6px',
    p: 'margin:0 0 10px',
    ul: 'margin:0 0 10px;padding-left:22px',
    ol: 'margin:0 0 10px;padding-left:22px',
    li: 'margin:0 0 4px',
    table: 'border-collapse:collapse;margin:0 0 12px;font-size:14px',
    th: 'border:1px solid #d0d0d0;padding:6px 10px;text-align:left;background:#f4f4f4',
    td: 'border:1px solid #d0d0d0;padding:6px 10px;vertical-align:top',
    code: 'font-family:Consolas,Menlo,monospace;background:#f4f4f4;padding:1px 4px;border-radius:3px',
    a: 'color:#1a5fb4',
    img: 'max-width:100%',
  };
  return html.replace(/<(h[1-4]|p|ul|ol|li|table|th|td|code|a|img)(\s|>)/g, (_m, tag: string, after: string) => `<${tag} style="${S[tag]}"${after}`);
}

/**
 * The email for a result: to the target's people, its subject filled in, the result as HTML (`html`: the result in
 * HTML, from its Markdown) and as plain text (`markdown`), under a line saying which agent sent it and when.
 */
export function resultMail(t: Extract<OutputTarget, { kind: 'email' }>, a: Pick<Assistant, 'name'>, o: { fields: AnswerField[]; markdown: string; html: string; now: Date; lang?: string }): ResultMail {
  const subject = mailSubject(t.subject, a, o.now);
  const words = MAIL_WORDS[o.lang ?? 'en'] ?? MAIL_WORDS.en;
  const when = o.now.toLocaleString(words.locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const foot = words.foot(a.name);
  const html = [
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${esc(subject)}</title></head>`,
    '<body style="margin:0;padding:0;background:#ffffff">',
    '<div style="max-width:680px;margin:0 auto;padding:20px 16px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f1f1f">',
    `<div style="font-size:13px;color:#6b6b6b;margin:0 0 12px">${esc(a.name)} · ${esc(when)}</div>`,
    inlineStyles(o.html),
    `<div style="font-size:12px;color:#8a8a8a;border-top:1px solid #e4e4e4;margin-top:20px;padding-top:10px">${esc(foot)}</div>`,
    '</div></body></html>',
  ].join('\n');
  const text = `${a.name} · ${when}\n\n${o.markdown.trim()}\n\n-- \n${foot}\n`;
  return { to: t.to, subject, text, html };
}

/** What the mail server said of an email of results. */
export interface MailSent {
  accepted: string[];
  rejected: string[];
  note?: string;
}

/**
 * Sends an email of results from a connected mail account (`account`: its address, id or name; none: the first), with
 * the Email connection's sendMail (a copy kept in its Sent folder). It throws in plain words when no account is
 * connected, the password is wrong or the server refuses the people.
 */
export async function sendResultMail(db: DB, account: string | undefined, mail: ResultMail): Promise<MailSent> {
  const r = await sendMail(account, { to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }, { db });
  return { accepted: r.accepted, rejected: r.rejected, ...(r.note ? { note: r.note } : {}) };
}

/** For tests: sends through this instead of the mail code. */
let instead: typeof sendResultMail | null = null;
export const sendResultMailVia = (fn: typeof sendResultMail | null) => {
  instead = fn;
};

/** Sends it, through the test's stand-in when one is set. */
export const sendMailOfResult = (db: DB, account: string | undefined, mail: ResultMail) => (instead ?? sendResultMail)(db, account, mail);
