// Settings → Voice: dictation (the language, and whose recognition), speech recognition on the server
// (off by default; whisper.cpp downloads when turned on, or an OpenAI-compatible service), and how
// replies are read aloud. What concerns the browser stays in the browser; the server keeps its own.
import { useState } from 'react';
import { Check, Cloud, Cpu, Languages, Lock, Mic, MicOff, Play, TriangleAlert } from 'lucide-react';
import { GPU_API, WHISPER_MODELS, type VoiceEngine, type VoicePatch, type VoiceState, type WhisperSize } from '@shared/voice';
import { api, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, Dialog, inputCls, MenuItem, Segmented, Throbber, useConfirm } from '../../components/ui';
import { EmptyRow, Group, MoreMenu, Notice, Row, Select, Stack } from '../settings/kit';
import { languageName, LANGUAGES } from './languages';
import { canRecord, canSpeak, SpeechRecognition, speechLang, useServerVoice, useVoicePrefs, useVoiceServer } from './prefs';
import { readAloud, stopReading, useReading, useVoices } from './speech';

const MB = 1024 ** 2;
const size = (b: number) => (b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(1)} GB` : `${Math.max(1, Math.round(b / MB))} MB`);

export function VoiceSettings() {
  return (
    <Stack>
      <DictationSettings />
      <ServerSettings />
      <ReadAloudSettings />
    </Stack>
  );
}

// ---- dictation ----------------------------------------------------------------------------------------

function DictationSettings() {
  const server = useServerVoice();
  const p = useVoicePrefs();
  const own = !!SpeechRecognition();
  const both = own && !!server?.ready && canRecord();
  return (
    <>
      {!window.isSecureContext && (
        <Notice tone="warn" icon={<Lock size={15} />}>
          The microphone needs a secure connection: HTTPS, or localhost on this computer. This page is at <span className="font-mono text-[12px]">{location.origin}</span>, so dictation cannot
          start here. Open Hydor through an HTTPS address to use it.
        </Notice>
      )}
      <Group title="Dictation" info="The microphone by the message box: what you say goes into your message, and you send it yourself.">
        <Row
          icon={own ? <Check size={16} className="text-ok" /> : <MicOff size={16} />}
          label="This browser"
          hint={own ? 'Recognizes speech itself: your words show as you speak' : server?.ready ? 'Cannot recognize speech itself: the server does it' : 'Cannot recognize speech itself'}
          info={
            own
              ? 'Browsers may send your voice to their maker to do it (Chrome to Google, Safari to Apple); to keep it on your machine, turn on whisper.cpp below and choose the server.'
              : server?.ready
                ? 'The microphone is by the message box.'
                : 'Turn on speech recognition on the server below, and the microphone shows by the message box.'
          }
        />
        <Row
          icon={<Languages size={16} />}
          label="Language you speak"
          hint="Dictation listens for it"
          info="You can also change it while dictating."
          control={
            <Select
              label="The language you speak"
              value={p.lang}
              width={280}
              options={[
                { value: '', label: 'Same as this browser', hint: languageName(navigator.language || 'en-US') },
                ...LANGUAGES.map((l) => ({ value: l as string, label: languageName(l), hint: l })),
              ]}
              onChange={(l) => p.set({ lang: l })}
            />
          }
        />
        {both && (
          <Row
            icon={<Mic size={16} />}
            label="Recognize with"
            hint={p.use === 'server' ? 'The server: private with whisper.cpp; the words come when you stop' : 'This browser: the words show as you speak'}
            control={
              <Segmented
                size="sm"
                value={p.use}
                onChange={(v) => p.set({ use: v })}
                options={[
                  { value: 'browser', label: 'This browser' },
                  { value: 'server', label: 'The server' },
                ]}
              />
            }
          />
        )}
      </Group>
    </>
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
  const shown = pending ?? st?.engine ?? 'off';
  const pick = (v: VoiceEngine) => {
    if (!st) return;
    if (v === 'off') return void (setPending(null), st.engine !== 'off' && put({ engine: 'off' }));
    if (v === st.engine) return setPending(null);
    if (v === 'local') return st.local.needBytes === 0 ? void put({ engine: 'local' }) : setPending('local');
    return st.endpoint ? void put({ engine: 'endpoint' }) : setPending('endpoint');
  };
  return (
    <>
      <Group
        title="Speech recognition on the server"
        info="For browsers that cannot recognize speech themselves, or to keep your voice on your machine. Off until you turn it on: nothing is downloaded before."
      >
        <Row
          label="Where it runs"
          hint={shown === 'off' ? 'Off: nothing is downloaded' : undefined}
          control={
            st ? (
              <Segmented
                size="sm"
                value={shown}
                onChange={pick}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'local', label: 'On this machine' },
                  { value: 'endpoint', label: 'A service' },
                ]}
              />
            ) : (
              <Throbber className="text-fg-3" />
            )
          }
        />
        {st && shown === 'local' && <LocalEngine st={st} put={put} busy={busy} />}
        {st && shown === 'endpoint' && <EndpointEngine st={st} put={put} busy={busy} />}
      </Group>
      {st && <Downloaded st={st} />}
    </>
  );
}

/** A bar and its words, under a row: what is downloading or building. */
function Bar({ percent, children, note }: { percent: number | null; children: string; note?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] leading-snug break-words text-fg-2">{children}</div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fg/10">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent == null ? 4 : Math.max(2, Math.min(100, percent))}%` }} />
      </div>
      {note && <div className="tnum mt-1 text-[11.5px] text-fg-3">{note}</div>}
    </div>
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
    <Row
      icon={<Throbber size={16} />}
      label="Getting it ready"
      control={
        <Button size="sm" variant="ghost" onClick={() => post<VoiceState>('/api/voice/cancel').then((s) => useVoiceServer.setState({ st: s }), toastError)}>
          Cancel
        </Button>
      }
    >
      <Bar percent={pct} note={p?.step === 'build' && !p.totalBytes ? `${Math.round(p.percent ?? 0)}%` : p?.totalBytes ? `${size(p.doneBytes)} of ${size(p.totalBytes)}` : p?.doneBytes ? size(p.doneBytes) : 'Starting…'}>
        {label}
      </Bar>
    </Row>
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
  // What it ran on the last time (the Test, or a recording): known once it has run.
  const dev = L.program?.runsOn;
  const runs = L.program?.gpuError
    ? `It runs on the processor for now: the GPU failed (${L.program.gpuError}). The GPU is tried again in a few minutes.`
    : dev?.on === 'gpu'
      ? dev.name
        ? `It runs on the GPU: ${dev.name} (${dev.api ?? 'GPU'}).`
        : `It runs on the GPU (${dev.api ?? 'GPU'}).`
      : dev?.on === 'cpu'
        ? L.program?.gpu
          ? 'It runs on the processor: whisper.cpp found no GPU it can use.'
          : 'It runs on this machine’s processor.'
        : null;
  return (
    <>
      <Row
        label="Model"
        hint={`${m.note} ${size(m.bytes)}`}
        control={<Segmented<WhisperSize> size="sm" value={L.size} onChange={(v) => put({ size: v })} options={WHISPER_MODELS.map((x) => ({ value: x.size, label: x.label }))} />}
      />
      <Row
        label="Languages"
        hint={L.english ? 'English only: a little more accurate in English' : 'Any language: it follows the language you speak'}
        control={
          <Segmented
            size="sm"
            value={L.english ? 'en' : 'any'}
            onChange={(v) => put({ english: v === 'en' })}
            options={[
              { value: 'any', label: 'Any language' },
              { value: 'en', label: 'English only' },
            ]}
          />
        }
      />
      {!on && (
        <Row
          label="Turn it on"
          hint={L.needBytes ? `Downloads ${size(L.needBytes)} into the app’s data folder` : 'Everything it needs is here already'}
          info={L.needBytes ? `${L.program ? 'The model goes' : 'whisper.cpp and the model go'} into the app’s data folder on this machine.` : undefined}
          control={
            <Button variant="primary" size="sm" disabled={busy} onClick={() => put({ engine: 'local' })}>
              {L.needBytes ? `Turn on · download ${size(L.needBytes)}` : 'Turn on'}
            </Button>
          }
        />
      )}
      {on && L.status === 'installing' && <Progress st={st} />}
      {on && L.status === 'ready' && (
        <>
          <Row
            icon={<Check size={16} className="text-ok" />}
            label="Ready: your voice stays here"
            hint={
              <span translate="no">
                {where} · {m.label} model{L.english ? ', English only' : ''}
              </span>
            }
            info={!st.ffmpeg ? 'Without ffmpeg here, the browser turns recordings into WAV itself; current browsers all can.' : undefined}
            control={
              <Button size="sm" variant="secondary" disabled={testing} onClick={test}>
                {testing ? 'Testing…' : 'Test'}
              </Button>
            }
          >
            {runs && <div className="text-[12.5px] leading-snug text-fg-3">{runs}</div>}
          </Row>
          <GpuBuild st={st} />
        </>
      )}
      {on && L.status === 'failed' && (
        <div className="p-3">
          <Notice
            tone="err"
            action={
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => put({ engine: 'local' })}>
                Try again
              </Button>
            }
          >
            <span className="break-words">{L.error}</span>
          </Notice>
        </div>
      )}
    </>
  );
}

/** whisper.cpp for this machine's NVIDIA GPU (none is ready-made for Linux): its build in the background, a build that failed, or what it needs. */
function GpuBuild({ st }: { st: VoiceState }) {
  const g = st.local.gpuBuild;
  if (!g) return null;
  const again = () => post<VoiceState>('/api/voice/gpu-build').then((s) => useVoiceServer.setState({ st: s }), toastError);
  if (g.status === 'building')
    return (
      <Row icon={<Throbber size={16} />} label="Building for the NVIDIA GPU" hint={<span className="tnum">{Math.round(g.percent ?? 0)}%</span>} info="Dictation works on the processor meanwhile. The build takes 5 to 20 minutes, then dictation runs on the GPU.">
        <Bar percent={g.percent ?? 0}>{g.detail ?? 'Building whisper.cpp for the NVIDIA GPU (CUDA)'}</Bar>
      </Row>
    );
  const failed = g.status === 'failed';
  return (
    <Row
      icon={failed ? <TriangleAlert size={16} className="text-warn" /> : <Cpu size={16} />}
      label={failed ? 'Could not build for the NVIDIA GPU' : 'This computer has an NVIDIA GPU'}
      hint={failed ? <span translate="no">{g.error ?? 'Dictation runs on the processor'}</span> : 'whisper.cpp has no ready-made build for it on Linux'}
      info={
        failed
          ? 'whisper.cpp could not be built for the NVIDIA GPU, so dictation runs on the processor.'
          : 'With NVIDIA’s CUDA toolkit installed (nvcc), the app builds one, and dictation runs on the GPU.'
      }
      control={
        <Button size="sm" variant="secondary" onClick={again}>
          {failed ? 'Try again' : 'Check again'}
        </Button>
      }
    />
  );
}

function EndpointEngine({ st, put, busy }: { st: VoiceState; put: (p: VoicePatch) => Promise<boolean>; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(st.endpoint?.url ?? '');
  const [model, setModel] = useState(st.endpoint?.model ?? '');
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const on = st.engine === 'endpoint';
  const save = async () => {
    if (await put({ endpoint: { url, model, ...(key.trim() ? { apiKey: key.trim() } : {}) }, engine: 'endpoint' })) {
      setKey('');
      setOpen(false);
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
  const edit = () => {
    setUrl(st.endpoint?.url ?? '');
    setModel(st.endpoint?.model ?? '');
    setKey('');
    setOpen(true);
  };
  return (
    <>
      <Row
        icon={<Cloud size={16} />}
        label="The service"
        hint={st.endpoint ? <span translate="no">{[st.endpoint.url, st.endpoint.model].filter(Boolean).join(' · ')}</span> : 'Recordings are sent to it'}
        info={
          <>
            <p>
              Any service with OpenAI’s <span className="font-mono text-[11.5px]">/audio/transcriptions</span>: OpenAI itself, or a server on your network (Speaches, LocalAI, whisper.cpp’s server, one on a GPU).
            </p>
            <p>Recordings are sent to it.</p>
          </>
        }
        control={
          <>
            {on && (
              <Button variant="secondary" size="sm" disabled={testing} onClick={test}>
                {testing ? 'Testing…' : 'Test'}
              </Button>
            )}
            <Button variant={on || st.endpoint ? 'secondary' : 'primary'} size="sm" onClick={edit}>
              {st.endpoint ? 'Edit' : 'Set up'}
            </Button>
            {st.endpoint?.keyHint && (
              <MoreMenu label="More about the service">
                {(close) => (
                  <MenuItem
                    disabled={busy}
                    onClick={() => {
                      close();
                      void put({ endpoint: { url: st.endpoint!.url, model: st.endpoint!.model, apiKey: null } });
                    }}
                  >
                    Remove the key
                  </MenuItem>
                )}
              </MoreMenu>
            )}
          </>
        }
      />
      <Dialog open={open} onClose={() => setOpen(false)} title="Speech recognition service" width={460}>
        <div className="space-y-3">
          <label className="block">
            <span className={field}>Address</span>
            <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.openai.com/v1" autoComplete="off" spellCheck={false} autoFocus />
          </label>
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
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={!url.trim() || busy} onClick={save}>
              {on ? 'Save' : 'Save and turn on'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
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
    <Group
      title="On this machine"
      hint={size(total)}
      actions={
        st.engine !== 'local' && (
          <MoreMenu label="More about what is downloaded">
            {(close) => (
              <MenuItem
                danger
                onClick={() => {
                  close();
                  void removeAll();
                }}
              >
                Remove all
              </MenuItem>
            )}
          </MoreMenu>
        )
      }
    >
      {confirmNode}
      {own && (
        <Row
          icon={<Cpu size={16} />}
          label={
            <span translate="no">
              whisper.cpp {own.version ?? ''} {own.source === 'built' ? (own.gpu ? `(built here for ${GPU_API[own.gpu]})` : '(built here)') : ''}
            </span>
          }
          hint={size(own.sizeBytes)}
        />
      )}
      {L.models.map((m) => (
        <Row
          key={`${m.size}${m.english}`}
          label={label(m)}
          hint={`${size(m.sizeBytes)}${inUse(m) ? ' · in use' : ''}`}
          control={
            <MoreMenu label={`More about the ${label(m)}`}>
              {(close) => (
                <MenuItem
                  danger
                  onClick={() => {
                    close();
                    void removeOne(m);
                  }}
                >
                  Remove
                </MenuItem>
              )}
            </MoreMenu>
          }
        />
      ))}
    </Group>
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
      <Group title="Read aloud">
        <EmptyRow>This browser cannot read text aloud.</EmptyRow>
      </Group>
    );
  const lang = speechLang(p.lang).toLowerCase().split('-')[0];
  // Voices for the language you speak first, then the rest.
  const sorted = [...voices].sort((a, b) => Number(b.lang.toLowerCase().startsWith(lang)) - Number(a.lang.toLowerCase().startsWith(lang)) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  const cur = voices.find((v) => v.voiceURI === p.voice);
  return (
    <Group title="Read aloud" info="The speaker on a reply reads it to you, leaving out its code. Each browser keeps its own voice and speed.">
      <Row
        label="Voice"
        hint={cur ? `${cur.lang}${cur.localService ? ' · on this device' : ' · online'}` : `The browser’s voice for ${languageName(speechLang(p.lang))}`}
        control={
          <Select
            label="The voice replies are read in"
            value={cur ? cur.voiceURI : ''}
            width={300}
            options={[
              { value: '', label: 'Automatic', hint: 'The browser’s voice for the language you speak' },
              ...sorted.map((v) => ({ value: v.voiceURI, label: <span translate="no">{v.name}</span>, hint: `${v.lang}${v.localService ? '' : ' · online'}` })),
            ]}
            onChange={(v) => p.set({ voice: v })}
          />
        }
      />
      <Row
        label="Speed"
        control={
          <div className="flex items-center gap-3">
            <input type="range" min={0.5} max={2} step={0.1} value={p.rate} onChange={(e) => p.set({ rate: Number(e.target.value) })} aria-label="Reading speed" className="w-40 accent-accent" />
            <span className="tnum w-9 text-right text-[13px] text-fg-2">{p.rate.toFixed(1)}×</span>
          </div>
        }
      />
      <Row
        label="Try it"
        hint="A sentence in the voice and speed above"
        control={
          <Button size="sm" variant="secondary" icon={playing ? undefined : <Play size={13} />} onClick={() => (playing ? stopReading() : readAloud('voice-sample', SAMPLE))}>
            {playing ? 'Stop' : 'Play a sample'}
          </Button>
        }
      />
    </Group>
  );
}
