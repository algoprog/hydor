// Settings → Voice: dictation (the language, and whose recognition), speech recognition on the server
// (off by default; whisper.cpp downloads when turned on, or an OpenAI-compatible service), and how
// replies are read aloud. What concerns the browser stays in the browser; the server keeps its own.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Cpu, Lock, MicOff, Trash2 } from 'lucide-react';
import { WHISPER_MODELS, type VoiceEngine, type VoicePatch, type VoiceState, type WhisperSize } from '@shared/voice';
import { api, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, cx, inputCls, OptionRow, Picker, Section, Segmented, Throbber, useConfirm } from '../../components/ui';
import { languageName, LANGUAGES } from './languages';
import { canRecord, canSpeak, SpeechRecognition, speechLang, useServerVoice, useVoicePrefs, useVoiceServer } from './prefs';
import { readAloud, stopReading, useReading, useVoices } from './speech';

const MB = 1024 ** 2;
const size = (b: number) => (b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(1)} GB` : `${Math.max(1, Math.round(b / MB))} MB`);

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-[200px] flex-1">
        <div className="text-[13.5px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Note({ icon, tone, children }: { icon: ReactNode; tone?: 'ok' | 'warn' | 'err'; children: ReactNode }) {
  return (
    <div
      className={cx(
        'flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed',
        tone === 'warn' ? 'bg-warn/10 text-fg-2' : tone === 'err' ? 'bg-err/10 text-fg-2' : 'bg-bg-2 text-fg-2',
      )}
    >
      <span className={cx('mt-0.5 shrink-0', tone === 'warn' ? 'text-warn' : tone === 'err' ? 'text-err' : tone === 'ok' ? 'text-ok' : 'text-fg-3')}>{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function VoiceSettings() {
  return (
    <div className="space-y-4">
      <DictationSettings />
      <ServerSettings />
      <ReadAloudSettings />
    </div>
  );
}

// ---- dictation ----------------------------------------------------------------------------------------

function DictationSettings() {
  const server = useServerVoice();
  const p = useVoicePrefs();
  const own = !!SpeechRecognition();
  const both = own && !!server?.ready && canRecord();
  return (
    <Section title="Dictation" sub="The microphone by the message box: what you say goes into your message, and you send it yourself.">
      <div className="space-y-2">
        {!window.isSecureContext && (
          <Note icon={<Lock size={14} />} tone="warn">
            The microphone needs a secure connection: HTTPS, or localhost on this computer. This page is at <span className="font-mono text-[12px]">{location.origin}</span>, so dictation cannot
            start here. Open Naget Agent through an HTTPS address to use it.
          </Note>
        )}
        {own ? (
          <Note icon={<Check size={14} />} tone="ok">
            This browser recognizes speech itself: your words show as you speak. Browsers may send your voice to their maker to do it (Chrome to Google, Safari to Apple); to keep it on
            your machine, turn on whisper.cpp below and choose the server.
          </Note>
        ) : (
          <Note icon={<MicOff size={14} />}>
            This browser cannot recognize speech by itself.{' '}
            {server?.ready ? 'The server does it: the microphone is by the message box.' : 'Turn on speech recognition on the server below, and the microphone shows by the message box.'}
          </Note>
        )}
      </div>
      <div className="mt-1 -mb-2 divide-y divide-line">
        <Row label="Language you speak" hint="Dictation listens for it; you can also change it while dictating.">
          <Picker value={p.lang ? languageName(p.lang) : 'Same as this browser'} title="The language you speak" width={280}>
            {(close) => (
              <>
                <OptionRow label="Same as this browser" hint={languageName(navigator.language || 'en-US')} selected={!p.lang} onClick={() => (close(), p.set({ lang: '' }))} />
                {LANGUAGES.map((l) => (
                  <OptionRow key={l} label={languageName(l)} hint={l} selected={p.lang === l} onClick={() => (close(), p.set({ lang: l }))} />
                ))}
              </>
            )}
          </Picker>
        </Row>
        {both && (
          <Row label="Recognize with" hint={p.use === 'server' ? 'The server: private with whisper.cpp; the words come when you stop.' : 'This browser: the words show as you speak.'}>
            <Segmented
              size="sm"
              value={p.use}
              onChange={(v) => p.set({ use: v })}
              options={[
                { value: 'browser', label: 'This browser' },
                { value: 'server', label: 'The server' },
              ]}
            />
          </Row>
        )}
      </div>
    </Section>
  );
}

// ---- the server's recognition ---------------------------------------------------------------------------

function ServerSettings() {
  const st = useServerVoice();
  // A choice shown before it is turned on: whisper.cpp's download, or the service's address.
  const [pending, setPending] = useState<VoiceEngine | null>(null);
  const [busy, setBusy] = useState(false);
  const put = async (patch: VoicePatch) => {
    setBusy(true);
    try {
      useVoiceServer.setState({ st: await api<VoiceState>('/api/voice', { method: 'PUT', body: patch }) });
      if (patch.engine) setPending(null);
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!st)
    return (
      <Section title="Speech recognition on the server">
        <div className="flex justify-center py-4 text-fg-3">
          <Throbber size={22} />
        </div>
      </Section>
    );
  const shown = pending ?? st.engine;
  const pick = (v: VoiceEngine) => {
    if (v === 'off') return void (setPending(null), st.engine !== 'off' && put({ engine: 'off' }));
    if (v === st.engine) return setPending(null);
    if (v === 'local') return st.local.needBytes === 0 ? void put({ engine: 'local' }) : setPending('local');
    return st.endpoint ? void put({ engine: 'endpoint' }) : setPending('endpoint');
  };
  return (
    <Section
      title="Speech recognition on the server"
      sub="For browsers that cannot recognize speech themselves, or to keep your voice on your machine. Off until you turn it on: nothing is downloaded before."
    >
      <Segmented
        value={shown}
        onChange={pick}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'local', label: 'On this machine' },
          { value: 'endpoint', label: 'A service' },
        ]}
      />
      {shown === 'local' && <LocalEngine st={st} put={put} busy={busy} />}
      {shown === 'endpoint' && <EndpointEngine st={st} put={put} busy={busy} />}
      <Downloaded st={st} />
    </Section>
  );
}

function Progress({ st }: { st: VoiceState }) {
  const p = st.local.progress;
  const label =
    p?.step === 'build'
      ? (p.detail ?? 'Building whisper.cpp for this machine')
      : p?.step === 'model'
        ? `Downloading the ${p.detail ?? 'model'}`
        : p?.detail && !/^whisper/.test(p.detail)
          ? `Downloading: ${p.detail}`
          : `Downloading ${p?.detail ?? 'whisper.cpp'}`;
  const pct = p?.step === 'build' && p.percent ? p.percent : p?.totalBytes ? (p.doneBytes / p.totalBytes) * 100 : null;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl bg-bg-2 px-3 py-2.5">
      <Throbber size={16} className="shrink-0 text-fg-3" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-snug break-words">{label}</div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fg/10">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct == null ? 4 : Math.max(2, Math.min(100, pct))}%` }} />
        </div>
        <div className="tnum mt-1 text-[11.5px] text-fg-3">
          {p?.step === 'build' && !p.totalBytes ? `${Math.round(p.percent ?? 0)}%` : p?.totalBytes ? `${size(p.doneBytes)} of ${size(p.totalBytes)}` : p?.doneBytes ? size(p.doneBytes) : 'Starting…'}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={() => post<VoiceState>('/api/voice/cancel').then((s) => useVoiceServer.setState({ st: s }), toastError)}>
        Cancel
      </Button>
    </div>
  );
}

function LocalEngine({ st, put, busy }: { st: VoiceState; put: (p: VoicePatch) => Promise<boolean>; busy: boolean }) {
  const L = st.local;
  const on = st.engine === 'local';
  const m = WHISPER_MODELS.find((x) => x.size === L.size)!;
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    try {
      const r = await post<{ ms: number }>('/api/voice/test');
      toast(`whisper.cpp answered in ${(r.ms / 1000).toFixed(1)} s`, 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setTesting(false);
    }
  };
  const where = L.program?.source === 'yours' ? 'your own whisper-cli' : L.program?.source === 'built' ? `whisper.cpp ${L.program.version ?? ''} (built here)` : `whisper.cpp ${L.program?.version ?? ''}`;
  return (
    <div className="mt-2">
      <div className="-mb-1 divide-y divide-line">
        <Row label="Model" hint={`${m.note} ${size(m.bytes)}.`}>
          <Segmented<WhisperSize> size="sm" value={L.size} onChange={(v) => put({ size: v })} options={WHISPER_MODELS.map((x) => ({ value: x.size, label: x.label }))} />
        </Row>
        <Row label="Languages" hint={L.english ? 'English only: a little more accurate in English.' : 'Any language: it follows the language you speak (Dictation, above).'}>
          <Segmented
            size="sm"
            value={L.english ? 'en' : 'any'}
            onChange={(v) => put({ english: v === 'en' })}
            options={[
              { value: 'any', label: 'Any language' },
              { value: 'en', label: 'English only' },
            ]}
          />
        </Row>
      </div>
      {!on && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="primary" size="sm" disabled={busy} onClick={() => put({ engine: 'local' })}>
            {L.needBytes ? `Turn on · download ${size(L.needBytes)}` : 'Turn on'}
          </Button>
          <span className="text-[12px] text-fg-3">
            {L.needBytes ? `${L.program ? 'The model goes' : 'whisper.cpp and the model go'} into the app’s data folder on this machine.` : 'Everything it needs is here already.'}
          </span>
        </div>
      )}
      {on && L.status === 'installing' && <Progress st={st} />}
      {on && L.status === 'ready' && (
        <div className="mt-3">
          <Note icon={<Check size={14} />} tone="ok">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="min-w-0 flex-1">
                Ready: {where} with the {m.label} model{L.english ? ', English only' : ''}, on this machine’s processor. Your voice stays here.
                {!st.ffmpeg && ' (Without ffmpeg here, the browser turns recordings into WAV itself; current browsers all can.)'}
              </span>
              <Button size="sm" variant="secondary" disabled={testing} onClick={test}>
                {testing ? 'Testing…' : 'Test'}
              </Button>
            </div>
          </Note>
        </div>
      )}
      {on && L.status === 'failed' && (
        <div className="mt-3">
          <Note icon={<AlertTriangle size={14} />} tone="err">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="min-w-0 flex-1 break-words">{L.error}</span>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => put({ engine: 'local' })}>
                Try again
              </Button>
            </div>
          </Note>
        </div>
      )}
    </div>
  );
}

function EndpointEngine({ st, put, busy }: { st: VoiceState; put: (p: VoicePatch) => Promise<boolean>; busy: boolean }) {
  const [url, setUrl] = useState(st.endpoint?.url ?? '');
  const [model, setModel] = useState(st.endpoint?.model ?? '');
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const on = st.engine === 'endpoint';
  const save = async () => {
    if (await put({ endpoint: { url, model, ...(key.trim() ? { apiKey: key.trim() } : {}) }, engine: 'endpoint' })) {
      setKey('');
      toast(on ? 'Saved' : 'The service recognizes speech now', 'ok');
    }
  };
  const test = async () => {
    setTesting(true);
    try {
      const r = await post<{ ms: number }>('/api/voice/test');
      toast(`The service answered in ${(r.ms / 1000).toFixed(1)} s`, 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setTesting(false);
    }
  };
  const field = 'mb-1 block text-[12px] font-medium text-fg-2';
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[12.5px] leading-relaxed text-fg-3">
        Any service with OpenAI’s <span className="font-mono text-[11.5px]">/audio/transcriptions</span>: OpenAI itself, or a server on your network (Speaches, LocalAI, whisper.cpp’s server,
        one on a GPU). Recordings are sent to it.
      </p>
      <label className="block">
        <span className={field}>Address</span>
        <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.openai.com/v1" autoComplete="off" spellCheck={false} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={field}>API key</span>
          <input
            className={inputCls}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={st.endpoint?.keyHint ? `Saved: ${st.endpoint.keyHint}` : 'Not needed by most servers on your network'}
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className={field}>Model</span>
          <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="whisper-1" autoComplete="off" spellCheck={false} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={!url.trim() || busy} onClick={save}>
          {on ? 'Save' : 'Save and turn on'}
        </Button>
        {on && (
          <Button variant="secondary" size="sm" disabled={testing} onClick={test}>
            {testing ? 'Testing…' : 'Test'}
          </Button>
        )}
        {st.endpoint?.keyHint && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => put({ endpoint: { url: st.endpoint!.url, model: st.endpoint!.model, apiKey: null } })}>
            Remove the key
          </Button>
        )}
      </div>
    </div>
  );
}

/** What whisper.cpp left on this machine, to remove when it is no longer wanted. */
function Downloaded({ st }: { st: VoiceState }) {
  const [confirm, confirmNode] = useConfirm();
  const L = st.local;
  const own = L.program?.source !== 'yours' ? L.program : undefined;
  if (!own && !L.models.length) return null;
  const total = (own?.sizeBytes ?? 0) + L.models.reduce((a, m) => a + m.sizeBytes, 0);
  const label = (m: { size: WhisperSize; english: boolean }) => `${WHISPER_MODELS.find((x) => x.size === m.size)?.label ?? m.size} model${m.english ? ', English only' : ''}`;
  const set = (s: VoiceState) => useVoiceServer.setState({ st: s });
  const inUse = (m: { size: WhisperSize; english: boolean }) => st.engine === 'local' && m.size === L.size && m.english === L.english;
  const removeOne = async (m: { size: WhisperSize; english: boolean; sizeBytes: number }) => {
    if (inUse(m) && !(await confirm({ title: `Remove the ${label(m)}?`, body: 'Speech recognition on the server turns off with it.', confirm: 'Remove', danger: true }))) return;
    post<VoiceState>('/api/voice/remove', m).then(set, toastError);
  };
  const removeAll = async () => {
    if (!(await confirm({ title: 'Remove whisper.cpp and its models?', body: `${size(total)} is freed. Turning it on again downloads them again.`, confirm: 'Remove', danger: true }))) return;
    post<VoiceState>('/api/voice/remove', { all: true }).then(set, toastError);
  };
  return (
    <div className="mt-4 border-t border-line pt-3">
      {confirmNode}
      <div className="mb-1 flex items-center gap-2">
        <span className="flex-1 text-[12px] font-medium tracking-wide text-fg-3 uppercase">On this machine · {size(total)}</span>
        {st.engine !== 'local' && (
          <Button size="sm" variant="ghost" onClick={removeAll}>
            Remove all
          </Button>
        )}
      </div>
      {own && (
        <div className="flex items-center gap-2.5 py-1.5 text-[13px]">
          <Cpu size={14} className="shrink-0 text-fg-3" />
          <span className="min-w-0 flex-1 truncate">
            whisper.cpp {own.version ?? ''} {own.source === 'built' ? '(built here)' : ''}
          </span>
          <span className="tnum text-[12px] text-fg-3">{size(own.sizeBytes)}</span>
          <span className="w-7" />
        </div>
      )}
      {L.models.map((m) => (
        <div key={`${m.size}${m.english}`} className="flex items-center gap-2.5 py-1 text-[13px]">
          <span className="w-[14px] shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {label(m)}
            {inUse(m) && <span className="text-fg-3"> · in use</span>}
          </span>
          <span className="tnum text-[12px] text-fg-3">{size(m.sizeBytes)}</span>
          <button type="button" onClick={() => removeOne(m)} title={`Remove the ${label(m)}`} aria-label={`Remove the ${label(m)}`} className="rounded-md p-1.5 text-fg-3 transition-colors hover:bg-err/10 hover:text-err">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---- read aloud ---------------------------------------------------------------------------------------

const SAMPLE = 'This is how replies sound when they are read aloud. Code is left out, and links are read by their words.';

function ReadAloudSettings() {
  const p = useVoicePrefs();
  const voices = useVoices();
  const playing = useReading((r) => r.id === 'voice-sample' && r.status !== 'idle');
  if (!canSpeak())
    return (
      <Section title="Read aloud">
        <p className="text-[13px] text-fg-3">This browser cannot read text aloud.</p>
      </Section>
    );
  const lang = speechLang(p.lang).toLowerCase().split('-')[0];
  // Voices for the language you speak first, then the rest.
  const sorted = [...voices].sort((a, b) => Number(b.lang.toLowerCase().startsWith(lang)) - Number(a.lang.toLowerCase().startsWith(lang)) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  const cur = voices.find((v) => v.voiceURI === p.voice);
  return (
    <Section title="Read aloud" sub="The speaker on a reply reads it to you, leaving out its code. Each browser keeps its own voice and speed.">
      <div className="-my-2 divide-y divide-line">
        <Row label="Voice" hint={cur ? `${cur.lang}${cur.localService ? ' · on this device' : ' · online'}` : `The browser’s voice for ${languageName(speechLang(p.lang))}`}>
          <Picker value={cur?.name ?? 'Automatic'} title="The voice replies are read in" width={300}>
            {(close) => (
              <>
                <OptionRow label="Automatic" hint="The browser’s voice for the language you speak" selected={!cur} onClick={() => (close(), p.set({ voice: '' }))} />
                {sorted.map((v) => (
                  <OptionRow key={v.voiceURI} label={v.name} hint={`${v.lang}${v.localService ? '' : ' · online'}`} selected={v.voiceURI === p.voice} onClick={() => (close(), p.set({ voice: v.voiceURI }))} />
                ))}
              </>
            )}
          </Picker>
        </Row>
        <Row label="Speed">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={p.rate}
              onChange={(e) => p.set({ rate: Number(e.target.value) })}
              aria-label="Reading speed"
              className="w-40 accent-accent"
            />
            <span className="tnum w-9 text-right text-[13px] text-fg-2">{p.rate.toFixed(1)}×</span>
          </div>
        </Row>
        <Row label="Try it" hint="A sentence in the voice and speed above.">
          <Button size="sm" variant="secondary" onClick={() => (playing ? stopReading() : readAloud('voice-sample', SAMPLE))}>
            {playing ? 'Stop' : 'Play a sample'}
          </Button>
        </Row>
      </div>
    </Section>
  );
}
