// Settings → Capabilities → Word suggestions: the grey rest of the word after the caret while you type (and the next
// word, dimmer), from a small model of the app's own, learning from what you write, and a larger language model, both
// on this computer. At the top the switch and how it is doing (set-up, the language model and why it is not running,
// which model is in use, when it last learned, learning under way); then every option, in groups.
import { useEffect, useState, type ReactNode } from 'react';
import { useSearch } from 'wouter';
import { SUGGEST_LIMITS, type SuggestCounts, type SuggestSettings as Settings, type SuggestStatus } from '@shared/suggest';
import { Button, Segmented, Switch, Throbber, useConfirm } from '../../components/ui';
import { DownloadBar } from '../../components/DownloadBar';
import { ago } from '../../lib/format';
import { LOCALE } from '../../i18n/locale';
import { toastError, useUI } from '../../lib/store';
import { Group, Notice, Row, Select, Stack, Stepper } from '../settings/kit';
import { hasCounts, summarise } from './logic';
import { forgetPersonal, resetUsage, retrainNow, setSuggest, useSuggest, useSuggestOpen } from './store';
import { discardUsage, flushUsage } from './usage';

const automatic = (n: number) => (n === 0 ? 'Automatic' : String(n));

/** The three answers to "how sure before showing", and the share of right suggestions each aims at. */
const SURE = [
  { id: 'more', value: 0.3, label: 'More' },
  { id: 'balanced', value: 0.4, label: 'Balanced' },
  { id: 'surer', value: 0.5, label: 'Surer' },
] as const;
const nearestSure = (p: number) => SURE.reduce((a, b) => (Math.abs(b.value - p) < Math.abs(a.value - p) ? b : a)).id;

/** A memory size in GB with one decimal, written as the app's language writes numbers. */
const gb = (mb: number) => (mb / 1024).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A whole number as the app's language writes it. */
const int = (n: number) => n.toLocaleString(LOCALE);

const day = (ts: number) => new Date(ts).toLocaleDateString(LOCALE, { dateStyle: 'medium' });

const when = (ts: number) => new Date(ts).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** What the language model is doing, in words: running, or not and why. */
function llmLine(s: SuggestStatus, wanted: Settings['llm']): { tone: 'ok' | 'info' | 'warn' | 'err'; text: ReactNode } {
  const l = s.llm;
  if (l.state === 'ready') return { tone: 'ok', text: 'The language model is running, so guesses are better.' };
  if (l.state === 'starting') return { tone: 'info', text: 'The language model is loading…' };
  if (l.state === 'memory') {
    // Whole sentences with only numbers in them, so each is translated as one.
    return {
      tone: 'warn',
      text: l.totalMb
        ? `The language model is not running: this computer has ${gb(l.totalMb)} GB of memory, and it needs a computer with at least ${gb(l.needMb ?? 8192)} GB. The small model alone is making the suggestions.`
        : l.freeMb
          ? `The language model is not running: this computer has too little free memory. ${gb(l.freeMb)} GB is free; it needs about ${gb(l.needMb ?? 2500)} GB. The small model alone is making the suggestions.`
          : 'The language model is not running: this computer has too little free memory. The small model alone is making the suggestions.',
    };
  }
  if (l.state === 'failed') {
    return { tone: 'err', text: l.detail ? `The language model could not start: ${l.detail}. The small model alone is making the suggestions.` : 'The language model could not start. The small model alone is making the suggestions.' };
  }
  return { tone: 'info', text: wanted === 'off' ? 'The language model is turned off here. The small model alone is making the suggestions.' : 'The language model is not running (it starts when you next type).' };
}

/** How it is doing: set-up and loading, the language model, the small model in use, and learning. */
function Status({ settings, status }: { settings: Settings; status: SuggestStatus }) {
  if (!settings.enabled && status.state === 'off') return null;
  const t = status.training;
  const llm = status.state === 'ready' || status.state === 'starting' ? llmLine(status, settings.llm) : null;
  return (
    <div className="space-y-2.5">
      {status.state === 'waiting' && <Notice>Not set up yet: it sets itself up the first time you type in a message box or a document, and downloads about 1.3 GB then.</Notice>}
      {status.state === 'setting-up' && (
        <Notice icon={<Throbber size={15} />}>
          <span translate="no">{status.detail || 'Setting up…'}</span>
          <span className="block text-[12px] text-fg-3">The first time it installs what it needs and downloads about 1.3 GB; it works once that is done.</span>
        </Notice>
      )}
      {status.state === 'starting' && <Notice icon={<Throbber size={15} />}>Loading the models…</Notice>}
      {status.state === 'failed' && (
        <Notice tone="err">
          Word suggestions could not start.
          {status.detail && (
            <span translate="no" className="block text-[12px] break-words">
              {status.detail}
            </span>
          )}
        </Notice>
      )}
      {status.state === 'ready' && <Notice tone="ok">Ready: suggestions show as you type.</Notice>}
      {llm && <Notice tone={llm.tone}>{llm.text}</Notice>}
      {(status.state === 'ready' || status.state === 'starting') && (
        <Notice>
          {status.model.kind === 'personal' ? (
            <>
              <span>The small model is the one made on this computer from what you write.</span>
              {status.model.trainedAt ? <span className="block">{`Last learned ${ago(status.model.trainedAt)}.`}</span> : null}
              {status.model.tokens ? <span className="block">{`${status.model.tokens.toLocaleString(LOCALE)} tokens of yours.`}</span> : null}
            </>
          ) : (
            <>The small model is the one that came with the app; it has not learned from your writing yet.</>
          )}
        </Notice>
      )}
      {t.state === 'running' && (
        <Notice icon={<Throbber size={15} />}>
          {t.progress && t.progress.total ? `Learning from your writing: ${Math.round((100 * t.progress.done) / t.progress.total)}%` : 'Learning from your writing…'}
          {t.progress && t.progress.total > 0 && <DownloadBar share={t.progress.done / t.progress.total} label="Learning" className="mt-2 w-64 max-w-full" />}
        </Notice>
      )}
      {t.state === 'waiting' && settings.personalise && <Notice>{t.next ? `It learns from your writing next at ${when(t.next)}, when the computer is quiet.` : 'It learns from your writing when the computer is quiet.'}</Notice>}
      {t.state === 'failed' && (
        <Notice tone="warn">
          The last time it learned from your writing did not finish.
          {t.detail && (
            <span translate="no" className="block text-[12px] break-words">
              {t.detail}
            </span>
          )}
        </Notice>
      )}
      {t.state === 'idle' && settings.personalise && t.lastAt && status.model.kind !== 'personal' && <Notice>{`It last learned from your writing ${ago(t.lastAt)}.`}</Notice>}
    </div>
  );
}

/** What a set of counts says, in two whole sentences (only numbers in them, so each is translated as one). */
function Numbers({ counts }: { counts: SuggestCounts }) {
  const n = summarise(counts);
  return (
    <>
      <span className="block">{`Keystrokes saved: ${int(n.saved)} (${int(n.savedShare)}% of your typing)`}</span>
      <span className="block">{`Suggestions right: ${int(n.right)} of ${int(n.judged)} (${int(n.rightShare)}%), taken with Tab: ${int(n.taken)}`}</span>
    </>
  );
}

/** How it is helping: the keystrokes saved and the suggestions that were right, always in view; today, this week and the date it started behind a button. */
function Helping({ status, off }: { status: SuggestStatus; off: boolean }) {
  const u = status.usage;
  const [open, setOpen] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const [busy, setBusy] = useState(false);
  // The search box points at "Reset the numbers", which is in the folded part: open it.
  const find = new URLSearchParams(useSearch()).get('find');
  useEffect(() => {
    if (find && /reset the numbers/i.test(find)) setOpen(true);
  }, [find]);
  const counted = !!u && hasCounts(u.total);
  const total = u ? summarise(u.total) : null;
  const period = (label: string, c: SuggestCounts) => (
    <Row label={label} hint={hasCounts(c) ? <Numbers counts={c} /> : 'Nothing counted.'} />
  );
  return (
    <Group title="How it's helping">
      {confirmNode}
      {counted && total ? (
        <Row
          label={`Keystrokes saved: ${int(total.saved)} (${int(total.savedShare)}% of your typing)`}
          hint={`Suggestions right: ${int(total.right)} of ${int(total.judged)} (${int(total.rightShare)}%), taken with Tab: ${int(total.taken)}`}
          control={
            <Button size="sm" variant="secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide the details' : 'Show the details'}
            </Button>
          }
        />
      ) : (
        <Row label={off ? 'Nothing has been counted yet. Turn word suggestions on, and the numbers show here as you type.' : 'Nothing has been counted yet. The numbers show here as you type.'} />
      )}
      {open && u && (
        <>
          {counted && period('Today', u.today)}
          {counted && period('This week', u.week)}
          {counted && <Row label={`Since ${day(u.since)}`} hint={<Numbers counts={u.total} />} />}
          <Row
            label="Reset the numbers"
            hint="Starts counting again from nothing; it does not change how suggestions work"
            control={
              <Button
                size="sm"
                variant="danger"
                disabled={busy || !counted}
                onClick={async () => {
                  const ok = await confirm({ title: 'Reset the numbers?', body: 'The keystrokes saved and the suggestions that were right go back to zero, and counting starts again now. Nothing else changes.', confirm: 'Reset', danger: true });
                  if (!ok) return;
                  setBusy(true);
                  discardUsage();
                  resetUsage()
                    .catch(toastError)
                    .finally(() => setBusy(false));
                }}
              >
                Reset
              </Button>
            }
          />
        </>
      )}
    </Group>
  );
}

export function SuggestSettings() {
  useSuggestOpen();
  // What this tab counted but has not sent yet is in the numbers when the page opens.
  useEffect(() => void flushUsage(), []);
  const settings = useSuggest((s) => s.settings);
  const status = useSuggest((s) => s.status);
  const here = useUI((s) => s.wordSuggestions);
  const [confirm, confirmNode] = useConfirm();
  const [busy, setBusy] = useState<'train' | 'forget' | null>(null);
  if (!settings || !status) return <Throbber className="text-fg-3" />;
  const set = (c: Parameters<typeof setSuggest>[0]) => void setSuggest(c);
  const off = !settings.enabled;
  const learning = !settings.personalise;
  const running = status.training.state === 'running';
  const num = (key: 'typedWords' | 'contextWords' | 'threads' | 'userWeight' | 'trainThreads', label: string, step = 1, format?: (n: number) => string) => (
    <Stepper label={label} value={settings[key]} min={SUGGEST_LIMITS[key][0]} max={SUGGEST_LIMITS[key][1]} step={step} format={format} onChange={(n) => set({ [key]: n })} />
  );
  const source = (key: keyof Settings['sources'], label: string, hint: string) => (
    <Row label={label} hint={hint} disabled={learning} control={<Switch on={settings.sources[key]} label={label} disabled={learning} onChange={(v) => set({ sources: { [key]: v } })} />} />
  );
  const where = (key: keyof Settings['where'], label: string, hint: string) => (
    <Row label={label} hint={hint} control={<Switch on={settings.where[key]} label={label} onChange={(v) => set({ where: { [key]: v } })} />} />
  );
  return (
    // A part of its own for the translations: "More" here means more suggestions (suggest::More), not "Other".
    <div data-i18n="suggest">
    <Stack>
      {confirmNode}
      <Group title="Suggestions">
        <Row
          label="Word suggestions"
          hint="Shows the rest of the word you are typing in grey, and the next word dimmer: Tab takes it. It runs on this computer, so nothing you type leaves it; the first time it is used, it downloads about 1.3 GB."
          control={<Switch on={settings.enabled} label="Word suggestions" onChange={(enabled) => set({ enabled })} />}
        >
          <Status settings={settings} status={status} />
        </Row>
        <Row label="Show in this browser" hint="Turn the grey words off here only; your other devices keep theirs" disabled={off} control={<Switch on={here} label="Show in this browser" disabled={off} onChange={(v) => useUI.getState().set({ wordSuggestions: v })} />} />
        <Row
          label="Language model"
          hint="A larger model that guesses better. Automatic uses it when this computer has enough free memory"
          control={
            <Segmented<Settings['llm']>
              size="sm"
              value={settings.llm}
              onChange={(llm) => set({ llm })}
              options={[
                { value: 'auto', label: 'Automatic' },
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
            />
          }
        />
        <Row
          label="Language model size"
          hint="8-bit guesses a little better; 4-bit takes less memory"
          control={
            <Segmented<Settings['quant']>
              size="sm"
              value={settings.quant}
              onChange={(quant) => set({ quant })}
              options={[
                { value: 'q8', label: '8-bit' },
                { value: 'q4', label: '4-bit' },
              ]}
            />
          }
        />
        <Row
          label="How sure before showing"
          hint="More shows more guesses, some of them wrong; Surer shows fewer, and more of them are right"
          control={<Segmented size="sm" value={nearestSure(settings.precision)} onChange={(id) => set({ precision: SURE.find((x) => x.id === id)!.value })} options={SURE.map((x) => ({ value: x.id, label: x.label }))} />}
        />
        <Row label="Show the next word" hint="Also shows the word after it, dimmer; press Tab again to take it" control={<Switch on={settings.nextWord} label="Show the next word" onChange={(nextWord) => set({ nextWord })} />} />
      </Group>
      <Helping status={status} off={off} />
      <Group title="Where">
        {where('chat', 'In message boxes', 'When you write to an agent, on the start page or in a conversation')}
        {where('docs', 'In documents', 'While you write in Docs')}
        {where('notes', 'In notes', 'In memory notes and your profile')}
        {where('other', 'In other text boxes', 'In follow-ups, the Ask panels and other small boxes')}
      </Group>
      <Group title="What it reads">
        <Row label="Words of what you typed" hint="How much of your text before the cursor it reads; more is slower" control={num('typedWords', 'Words of what you typed', 10)} />
        <Row label="Words of the reply or document" hint="How much of the agent's last reply, or of the document above the paragraph, it reads; 0 reads none" control={num('contextWords', 'Words of the reply or document', 10)} />
        <Row label="Choose by language" hint="Picks the better of the two models for the language you are writing in" control={<Switch on={settings.switchByLanguage} label="Choose by language" onChange={(switchByLanguage) => set({ switchByLanguage })} />} />
        <Row label="Learn from the conversation" hint="Picks up the words used earlier in the conversation as you type" control={<Switch on={settings.sessionCache} label="Learn from the conversation" onChange={(sessionCache) => set({ sessionCache })} />} />
        <Row label="Threads" hint="How many processor threads suggestions use; Automatic picks from the computer's cores" control={num('threads', 'Threads', 1, automatic)} />
      </Group>
      <Group title="Learning">
        <Row
          label="Learn from what I write"
          hint="Trains the small model on this computer from your writing, so it suggests your words. It never leaves this computer"
          control={<Switch on={settings.personalise} label="Learn from what I write" onChange={(personalise) => set({ personalise })} />}
        />
        <Row
          label="When it learns"
          hint="Learning runs at the lowest priority, when you have not typed for a while"
          disabled={learning}
          control={
            <Select<Settings['schedule']>
              label="When it learns"
              value={settings.schedule}
              disabled={learning}
              onChange={(schedule) => set({ schedule })}
              options={[
                { value: 'nightly', label: 'Every night' },
                { value: 'weekly', label: 'Every week' },
                { value: 'manual', label: 'Only when I ask' },
              ]}
            />
          }
        />
        {source('messages', 'From my messages', 'What you wrote to agents')}
        {source('replies', "From agents' replies", 'What agents wrote back')}
        {source('notes', 'From my notes', 'The memory notes you wrote')}
        {source('docs', 'From my documents', 'The pages and documents you wrote')}
        <Row label="Weight of my own words" hint="How much more your own typing counts than text from agents; 1 counts them alike" disabled={learning} control={num('userWeight', 'Weight of my own words')} />
        <Row label="Threads for learning" hint="How many processor threads learning uses; Automatic picks from the computer's cores" disabled={learning} control={num('trainThreads', 'Threads for learning', 1, automatic)} />
        <Row
          label="Retrain now"
          hint="Learns from your writing again now; the first time can take hours on a computer without a graphics card"
          disabled={learning || off}
          control={
            <Button
              size="sm"
              disabled={learning || off || running || busy === 'train'}
              onClick={() => {
                setBusy('train');
                retrainNow()
                  .catch(toastError)
                  .finally(() => setBusy(null));
              }}
            >
              {running ? 'Learning…' : 'Retrain now'}
            </Button>
          }
        />
        <Row
          label="Forget what it learned"
          hint="Deletes the model made from your writing and goes back to the one that came with the app"
          control={
            <Button
              size="sm"
              variant="danger"
              disabled={busy === 'forget' || (status.model.kind !== 'personal' && !running)}
              onClick={async () => {
                const ok = await confirm({ title: 'Forget what it learned?', body: 'This deletes the small model that was made on this computer from your writing. Suggestions go back to the one that came with the app, and it learns again at its next time.', confirm: 'Forget', danger: true });
                if (!ok) return;
                setBusy('forget');
                forgetPersonal()
                  .catch(toastError)
                  .finally(() => setBusy(null));
              }}
            >
              Forget what it learned
            </Button>
          }
        />
      </Group>
    </Stack>
    </div>
  );
}

