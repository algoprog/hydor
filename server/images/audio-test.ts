// Script tests for audio through OpenRouter: its models as the app reads them (music and voices, how each is sold,
// what each takes), the requests (the speech API's, and a chat's that streams), the stream read in the shapes
// providers send it, raw sound made a WAV, what a generation costs, the settings and models routes, generate_audio
// from the form to the file (music, a sound, a voice, a voice from samples, a conversation, a model that cannot do
// what is asked), and the Library keeping a sound (its length and shape, its words, its title written from words
// alone, never by listening). OpenRouter is a stand-in (fetch); ffmpeg, when it is here, makes the test sounds.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/images/audio-test.ts
//   DATA_DIR=/tmp/hydor-test-audio node dist/dev/audio-test.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { hasFfmpeg, peaksOf } from '../media/frames.ts';
import { media } from '../media/index.ts';
import { loadConfig, saveConfig } from '../models/config.ts';
import {
  audioCost,
  audioModel,
  buildChatAudioRequest,
  buildSpeechRequest,
  cleanLyrics,
  defaultVoice,
  describedInput,
  estimateSeconds,
  joinBase64,
  musicPrompt,
  newTake,
  pcmToWav,
  placeholderProblem,
  readSse,
  sniffAudio,
  songPrice,
  takeChunk,
  voiceLabel,
  wavSeconds,
} from './audio.ts';
import { images } from './index.ts';
import { audioAnswers, audioForm, audioPriceLine } from './settings.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-audio-test-')));
// No key to start with, whatever an earlier run left in the scratch folder.
{
  const c = loadConfig();
  delete c.openrouter.apiKey;
  saveConfig(c);
}
const ff = await hasFfmpeg();
if (!ff) console.log('(no ffmpeg here: lengths, shapes and the voice samples’ conversion are not tested)');

// A second of a 440 Hz tone, 16-bit mono at 24 kHz: what a voice model sends raw.
const PCM = Buffer.alloc(48_000);
for (let i = 0; i < 24_000; i++) PCM.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 24_000) * 12_000), i * 2);
// An MP3: two seconds of a tone with ffmpeg, else a tag and some bytes that read as one.
const mp3File = path.join(tmp, 'tone.mp3');
if (ff) execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-c:a', 'libmp3lame', '-b:a', '64k', mp3File]);
else fs.writeFileSync(mp3File, Buffer.concat([Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1'), Buffer.alloc(4000, 0x55)]));
const MP3 = fs.readFileSync(mp3File);

// ---- a stand-in for OpenRouter ---------------------------------------------------------------------------

const SPEECH = [
  {
    id: 'bytedance-seed/seed-audio-1-0',
    name: 'ByteDance Seed: Seed Audio 1.0',
    created: 1790372476,
    description: "Seed Audio 1.0 is ByteDance Seed's non-streaming audio generation model. It produces speech and other audio from a natural-language text prompt that can describe the desired voice, tone, and sound...",
    architecture: { input_modalities: ['text'], output_modalities: ['speech'] },
    pricing: { prompt: '0', completion: '0.0025' },
    supported_voices: null,
    endpoints: ['/api/v1/audio/speech'],
  },
  { id: 'elevenlabs/eleven-v3', name: 'ElevenLabs: Eleven v3', created: 1791386272, description: 'Eleven v3 is a text-to-speech model from ElevenLabs.', pricing: { prompt: '0.00008', completion: '0' }, supported_voices: ['george', 'sarah', 'adam'] },
  {
    id: 'google/gemini-3.8-flash-tts',
    name: 'Google: Gemini 3.8 Flash TTS',
    created: 1790200266,
    description: 'Gemini 3.8 Flash TTS is a text-to-speech model from Google.',
    pricing: { prompt: '0.0000005', completion: '0.000009' },
    supported_voices: ['Zephyr', 'Puck', 'Kore'],
  },
  { id: 'minimax/speech-2.8-turbo', name: 'MiniMax: Speech 2.8 Turbo', created: 1784164000, pricing: { prompt: '0.00006', completion: '0' }, supported_voices: ['English_expressive_narrator', 'English_radiant_girl'] },
  { id: 'fish-audio/s1', name: 'Fish Audio: S1', created: 1785353734, pricing: { prompt: '0.000015', completion: '0' }, supported_voices: null },
  { id: 'heygen/heygen-voice-1-turbo:free', name: 'HeyGen: HeyGen Voice Turbo (free)', created: 1793030422, pricing: { prompt: '0', completion: '0' }, supported_voices: ['nadine', 'bram'] },
  { id: 'microsoft/mai-voice-2.1', name: 'Microsoft AI: MAI-Voice-2.1', created: 1790870467, pricing: { prompt: '0.000022', completion: '0' }, supported_voices: ['cs-CZ-Grant:MAI-Voice-2.1', 'en-US-Harper:MAI-Voice-2.1'] },
];
const CHAT = [
  {
    id: 'google/lyria-3-pro-preview',
    name: 'Google: Lyria 3 Pro Preview',
    created: 1774907286,
    description: "Full-length songs are priced at $0.08 per song. Lyria 3 is Google's family of music generation models, available through the Gemini API.",
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text', 'audio'] },
    pricing: { prompt: '0', completion: '0' },
  },
  { id: 'google/lyria-3-clip-preview', name: 'Google: Lyria 3 Clip Preview', created: 1774907255, description: '30 second duration clips are priced at $0.04 per clip. Lyria 3 is…', pricing: { prompt: '0', completion: '0' } },
  { id: 'openai/gpt-audio-mini', name: 'OpenAI: GPT Audio Mini', created: 1768859419, description: 'A cost-efficient version of GPT Audio.', pricing: { prompt: '0.0000006', completion: '0.0000024', audio: '0.0000006', audio_output: '0.0000024' } },
];
const CATALOG = [
  { id: 'google/gemini-3.5-flash-lite', name: 'Google: Gemini 3.5 Flash Lite', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, pricing: { prompt: '0.0000001', completion: '0.0000004' }, supported_parameters: [] },
];
const CLONES: Record<string, [boolean, boolean]> = { 'bytedance-seed/seed-audio-1-0': [true, true] };

const LYRICS = '[0.0:3.7] Warm bread fresh from the oven,\n[3.8:7.4] A little piece of heaven!';
const sse = (events: unknown[]) => `: OPENROUTER PROCESSING\n\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}data: [DONE]\n\n`;
/** A song as Lyria streams it: the lyrics first, then the sound in one piece, then the cost. */
const lyriaStream = () =>
  sse([
    { id: 'gen-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: LYRICS, role: 'assistant' } }] },
    { id: 'gen-1', choices: [{ index: 0, delta: { content: '', role: 'assistant', audio: { data: MP3.toString('base64') } } }] },
    { id: 'gen-1', choices: [{ index: 0, delta: { content: '', role: 'assistant' }, finish_reason: 'stop' }], usage: { prompt_tokens: 27, completion_tokens: 88, cost: 0.04 } },
  ]);
/** A voice as gpt-audio might stream it: the sound as plain strings, cut anywhere, with its transcript. */
const voiceStream = () => {
  const b64 = MP3.toString('base64');
  const cut = [b64.slice(0, 7), b64.slice(7, 1001), b64.slice(1001)];
  return sse([
    { choices: [{ index: 0, delta: { role: 'assistant', audio: { transcript: 'Welcome' } } }] },
    ...cut.map((c) => ({ choices: [{ index: 0, delta: { audio: c } }] })),
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { cost: 0.0004 } },
  ]);
};
let captionReply = '{"title": "Warm bread jingle", "description": "A cheerful ukulele jingle about fresh bread from a corner bakery."}';

const calls: { path: string; body?: any; auth?: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://openrouter.ai/')) return realFetch(input, init);
  const u = new URL(url);
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  const p = u.pathname.replace(/^\/api\/v1/, '');
  calls.push({ path: p + u.search, body, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
  const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
  if (p === '/models') {
    const o = u.searchParams.get('output_modalities');
    return json({ data: o === 'speech' ? SPEECH : o === 'audio' ? CHAT : CATALOG });
  }
  const ep = /^\/models\/(.+)\/endpoints$/.exec(p);
  if (ep) {
    const id = decodeURIComponent(ep[1]);
    const [cloning, multi] = CLONES[id] ?? [false, false];
    return json({ data: { id, endpoints: [{ name: id, supports_voice_cloning: cloning, supports_multiple_audio_references: multi }] } });
  }
  if (p === '/audio/speech') {
    // Gemini and MAI (here) answer only raw sound: an MP3 asked of them is refused.
    if (/^(google|microsoft)\//.test(body.model) && body.response_format === 'mp3') return json({ error: { message: 'response_format "mp3" is not supported for this model; use "pcm"' } }, 400);
    if (body.response_format === 'pcm') return new Response(PCM, { headers: { 'content-type': 'audio/pcm' } });
    return new Response(MP3, { headers: { 'content-type': 'audio/mpeg', 'x-generation-id': 'gen-tts-1' } });
  }
  if (p === '/chat/completions') {
    if (/lyria/.test(body.model)) return new Response(lyriaStream(), { headers: { 'content-type': 'text/event-stream' } });
    if (/gpt-audio/.test(body.model)) return new Response(voiceStream(), { headers: { 'content-type': 'text/event-stream' } });
    const text = sse([{ choices: [{ index: 0, delta: { content: captionReply } }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { cost: 0.0001 } }]);
    return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
  }
  return json({ error: { message: `No route ${p}` } }, 404);
}) as typeof fetch;

// ---- the app around it --------------------------------------------------------------------------------------

const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const events: { t: string; id?: string; data?: any }[] = [];
const cards: any[] = [];
let answer: (card: any) => { decision: string; form?: Record<string, string> } | null = (card) => ({ decision: 'accept', form: Object.fromEntries(card.form.fields.map((f: any) => [f.id, f.default ?? ''])) });
const adapter = {
  ask: async (card: any, o: { check?: (a: any) => string | null }) => {
    cards.push(card);
    const a = answer(card);
    if (a && o.check?.(a)) throw new Error(`The form refused the answer: ${o.check(a)}`);
    return a;
  },
};
let present = true;
const deps = {
  app,
  db,
  sessions: { adapterByRun: () => (present ? adapter : null) },
  models: { agentModels: () => [], ensure: async () => null },
  broadcast: (e: { t: string }) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://hydor.example',
} as unknown as Deps;
images.routes!(deps);
media.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:a1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tool = () => images.tools!(ctx).find((t) => t.name === 'generate_audio');
const run = async (args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> => {
  try {
    const r = await tool()!.run(args, ctx);
    return typeof r === 'string' ? { text: r } : r;
  } catch (e) {
    return { text: String((e as Error).message), isError: true };
  }
};
const req = (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
const until = async (cond: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  return cond();
};
const lastBody = (p: string) => calls.filter((c) => c.path === p).pop()?.body;
const accept =
  (pick: Record<string, string> = {}) =>
  (card: any) => ({ decision: 'accept', form: { ...Object.fromEntries(card.form.fields.map((f: any) => [f.id, f.default ?? ''])), ...pick } });

// ---- the models as the app reads them -------------------------------------------------------------------------

{
  const [seed, eleven, gemini, minimax, s1, heygen, mai] = SPEECH.map((m) => audioModel(m, 'speech'));
  const [pro, clip, gpt] = CHAT.map((m) => audioModel(m, 'chat'));
  ok(seed.kind === 'speech' && seed.via === 'speech' && seed.prompted && !seed.voices && seed.perSecond === 0.0025 && seed.maxSeconds === 120, `Seed Audio takes a description, by the second: ${JSON.stringify(seed)}`);
  ok(Math.abs(seed.perMinute! - 0.15) < 1e-9 && seed.formats.join() === 'mp3,wav', 'a minute of it, and its files');
  ok(eleven.perChar === 0.00008 && eleven.voices?.length === 3 && !eleven.prompted && !eleven.instructions && !eleven.multiSpeaker && Math.abs(eleven.perMinute! - 0.072) < 1e-9, 'ElevenLabs reads words, by the character');
  ok(gemini.perToken?.input === 0.0000005 && gemini.perToken.output === 0.000009 && gemini.instructions && gemini.multiSpeaker && gemini.formats.join() === 'wav', 'Gemini TTS: by the token, directions, conversations, raw sound only');
  ok(minimax.formats.join() === 'mp3' && s1.instructions && !s1.multiSpeaker, 'MiniMax makes MP3 only; Fish Audio S1 takes directions but one speaker');
  ok(heygen.free && heygen.perMinute === 0 && heygen.formats.join() === 'wav', 'a free voice');
  ok(mai.label === 'MAI-Voice-2.1' && mai.org === 'Microsoft AI' && mai.created === 1790870467000, 'its name, maker and date');
  ok(pro.kind === 'music' && pro.via === 'chat' && pro.perSong === 0.08 && pro.maxSeconds === 180 && !pro.voices, `Lyria 3 Pro: a song, priced in its words: ${JSON.stringify(pro)}`);
  ok(clip.perSong === 0.04 && clip.maxSeconds === 30, 'Lyria 3 Clip: 30 seconds a clip');
  ok(gpt.kind === 'speech' && gpt.via === 'chat' && gpt.voices?.includes('alloy') && gpt.instructions && gpt.perToken?.output === 0.0000024, 'gpt-audio speaks, through a chat, by the token');
  ok(songPrice('Full-length songs are priced at $0.08 per song.') === 0.08 && songPrice('30 second clips are priced at $0.04 per clip') === 0.04 && songPrice('No price here') === undefined, 'a price from the words');
  ok(
    defaultVoice(['cs-CZ-Grant:MAI-Voice-2.1', 'en-US-Harper:MAI-Voice-2.1']) === 'en-US-Harper:MAI-Voice-2.1' && defaultVoice(['en_paul_sad', 'en_paul_neutral']) === 'en_paul_neutral' && defaultVoice(['george', 'sarah']) === 'george',
    'an English voice first, a neutral one before a sad one',
  );
  ok(voiceLabel('en-US-Harper:MAI-Voice-2.1') === 'Harper (en-US)' && voiceLabel('English_radiant_girl') === 'English radiant girl' && voiceLabel('george') === 'George', 'how voices read');

  // What it costs.
  const sound = { kind: 'sound' as const, prompt: 'Rain on a tin roof' };
  ok(Math.abs(audioCost(seed, sound)! - 0.025) < 1e-9 && Math.abs(audioCost(seed, { ...sound, seconds: 4 })! - 0.01) < 1e-9 && Math.abs(audioCost(seed, sound, 3)! - 0.0075) < 1e-9, 'a sound: ten seconds unless said, or as long as it came out');
  ok(estimateSeconds(seed, { ...sound, seconds: 500 }) === 120, 'no longer than the model makes');
  const words = 'x'.repeat(900);
  ok(Math.abs(audioCost(eleven, { kind: 'speech', prompt: words })! - 0.072) < 1e-9, 'speech by the character');
  ok(Math.abs(audioCost(seed, { kind: 'speech', prompt: words })! - 0.15) < 1e-9, 'speech by the second: 15 characters a second');
  ok(audioCost(gemini, { kind: 'speech', prompt: words })! > 0.01 && audioCost(gemini, { kind: 'speech', prompt: words })! < 0.02, 'speech by the token');
  ok(audioCost(pro, { kind: 'music', prompt: 'x' }) === 0.08 && audioCost(heygen, { kind: 'speech', prompt: words }) === 0, 'a song; nothing');

  // The form and the line above it.
  const f = audioForm(pro, 'music', { format: 'mp3', instrumental: false }, undefined, {});
  ok(f.instrumental.type === 'boolean' && f.seconds.maximum === 180 && f.format.oneOf.map((x: any) => x.title).join() === 'MP3, smaller,WAV, uncompressed', `a song's form: ${Object.keys(f).join()}`);
  ok(!('seconds' in audioForm(clip, 'music', {}, undefined, {})), 'no length for a clip of a set length');
  ok(audioForm(seed, 'sound', { seconds: 10 }).seconds.default === 10 && !('voice' in audioForm(seed, 'speech', {})), 'a sound’s length; no voice list for a model that takes a description');
  const mf = audioForm(mai, 'speech', { voice: 'en-US-Harper:MAI-Voice-2.1' });
  ok(mf.voice.oneOf.some((x: any) => x.title === 'Harper (en-US)' && x.const === 'en-US-Harper:MAI-Voice-2.1') && mf.voice.default === 'en-US-Harper:MAI-Voice-2.1', 'the voices, by name');
  ok(audioAnswers({ instrumental: true }, { seconds: 90, instrumental: false }, { seconds: {} }).seconds === undefined, 'a length emptied on the form is left to the model');
  ok(audioPriceLine(pro, pro.id) === '**Lyria 3 Pro Preview** (Google), through OpenRouter: $0.08 a song.' && /a clip of 30 seconds/.test(audioPriceLine(clip, clip.id)), 'a song’s price');
  ok(
    audioPriceLine(seed, seed.id, undefined, 0.025) === '**Seed Audio 1.0** (ByteDance Seed), through OpenRouter: $0.0025 a second of sound. With the settings below, about $0.025.',
    `by the second: ${audioPriceLine(seed, seed.id, undefined, 0.025)}`,
  );
  ok(/\$0\.08 for 1,000 characters/.test(audioPriceLine(eleven, eleven.id)) && /about \$0\.014 a minute of speech/.test(audioPriceLine(gemini, gemini.id)) && /free/.test(audioPriceLine(heygen, heygen.id)), 'by the character, by the minute, free');
}

// ---- what a model is asked ------------------------------------------------------------------------------------

{
  const sr = buildSpeechRequest({ model: 'm', input: 'Hi', format: 'mp3', voice: 'george', samples: [{ name: 'a.wav', mime: 'audio/wav', data: Buffer.from('RIFF') }] });
  ok(
    sr.response_format === 'mp3' && sr.voice === 'george' && (sr.input_references as any)[0].input_audio.data === `data:audio/wav;base64,${Buffer.from('RIFF').toString('base64')}` && !('instructions' in sr),
    'the speech API’s request, a sample as a data URL',
  );
  const cr = buildChatAudioRequest({ model: 'google/lyria-3-clip-preview', prompt: 'A jingle', format: 'mp3' });
  ok(cr.stream === true && (cr.modalities as string[]).join() === 'text,audio' && JSON.stringify(cr.audio) === '{"format":"mp3"}' && (cr.messages as any[]).length === 1, 'a chat asking for sound, streamed');
  ok((buildChatAudioRequest({ model: 'o', prompt: 'Hi', system: 'Read it', voice: 'alloy', format: 'wav' }).messages as any[])[0].role === 'system', 'a voice is told first to read');

  ok(
    musicPrompt({ prompt: 'A dreamy indie pop song', lyrics: '[Verse]\nHello', seconds: 120 }) === 'A dreamy indie pop song\n\nMake it about 2 minutes long.\n\nUse the following lyrics:\n[Verse]\nHello',
    'a song: its length, then its lyrics after a line that says so',
  );
  ok(musicPrompt({ prompt: 'A 90-second lo-fi beat', instrumental: true, seconds: 60, lyrics: 'x' }) === 'A 90-second lo-fi beat\n\nInstrumental only, no vocals.', 'a length already given; no singing, no lyrics');
  ok(describedInput({ kind: 'speech', prompt: 'Welcome to the bakery.', instructions: 'A warm, elderly man, slowly.' }) === 'A warm, elderly man, slowly: "Welcome to the bakery."', 'speech described: who, how, then the words in quotes');
  ok(describedInput({ kind: 'speech', prompt: 'Welcome.', samples: 1 }) === '@Audio1: "Welcome."' && describedInput({ kind: 'speech', prompt: 'Welcome.' }) === 'Welcome.', 'a sample’s voice; the words alone');
  ok(describedInput({ kind: 'speech', prompt: 'A narrator: "Hello." Rain outside.', instructions: 'calm' }) === 'calm. A narrator: "Hello." Rain outside.', 'a whole description kept');
  ok(
    describedInput({
      kind: 'speech',
      prompt: 'Light wind throughout.',
      turns: [
        { text: 'Did you see that?', voice: '@Audio1', instructions: 'nervously' },
        { text: 'See what?', voice: 'An old man' },
      ],
    }) === '@Audio1 says nervously: "Did you see that?"\nAn old man says: "See what?"\nLight wind throughout.',
    'a conversation, a line a turn',
  );
  ok(
    describedInput({ kind: 'sound', prompt: 'Heavy rain on a tin roof', seconds: 30 }) === 'Heavy rain on a tin roof. About 30 seconds long.' &&
      describedInput({ kind: 'sound', prompt: 'A 5 second door creak', seconds: 30 }) === 'A 5 second door creak',
    'a sound’s length, unless it says one',
  );
  ok(
    placeholderProblem('@Audio1 hi @Audio2 yo', 2) === null &&
      /@Audio2 is not named/.test(placeholderProblem('@Audio1 hi', 2) ?? '') &&
      /@Audio3 names a voice sample that was not given/.test(placeholderProblem('@Audio3 hi', 2) ?? '') &&
      /none was given/.test(placeholderProblem('@Audio1', 0) ?? ''),
    'voice samples named as Seed Audio needs them',
  );
}

// ---- the sound that comes back ---------------------------------------------------------------------------------

{
  const wav = pcmToWav(PCM, 24_000, 1);
  ok(sniffAudio(wav) === 'wav' && wav.length === PCM.length + 44 && wav.readUInt32LE(24) === 24_000 && Math.abs(wavSeconds(wav)! - 1) < 1e-9, 'raw sound made a WAV, a second long');
  ok(wavSeconds(pcmToWav(PCM.subarray(0, 4801), 48_000, 2))! < 0.026, 'an odd byte left out');
  ok(sniffAudio(MP3) === 'mp3' && sniffAudio(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0])) === 'mp3', 'MP3: a tag, or a frame');
  ok(sniffAudio(Buffer.from([0xff, 0xf1, 0x50, 0x80, 0, 0, 0, 0, 0, 0, 0, 0])) === null, 'AAC’s frames are not MP3');
  ok(
    sniffAudio(Buffer.from('OggS\u0000\u0002\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1')) === 'ogg' &&
      sniffAudio(Buffer.from('fLaC\u0000\u0000\u0000"\u0000\u0000\u0000\u0000', 'latin1')) === 'flac' &&
      sniffAudio(Buffer.from('\u0000\u0000\u0000\u0018ftypM4A ', 'latin1')) === 'm4a',
    'Ogg, FLAC, M4A',
  );
  ok(sniffAudio(PCM) === null, 'raw sound is none of them');

  const b64 = MP3.toString('base64');
  ok(joinBase64([b64.slice(0, 5), b64.slice(5, 999), b64.slice(999)]).equals(MP3), 'base64 cut anywhere, joined first');
  const parts = [MP3.subarray(0, 1000), MP3.subarray(1000, 2001), MP3.subarray(2001)].map((x) => x.toString('base64'));
  ok(parts.slice(0, -1).some((x) => x.endsWith('=')) && joinBase64(parts).equals(MP3), 'base64 padded piece by piece, each read alone');
  ok(joinBase64([`data:audio/mpeg;base64,${b64}`]).equals(MP3), 'a data URL');

  // The shapes a stream's pieces come in.
  const acc = newTake();
  takeChunk({ choices: [{ delta: { content: 'La la', role: 'assistant' } }] }, acc);
  takeChunk({ choices: [{ delta: { audio: { data: 'AAAA', transcript: 'Hel' } } }] }, acc);
  takeChunk({ choices: [{ delta: { audio: 'BBBB' } }] }, acc);
  takeChunk(
    {
      choices: [
        {
          delta: {
            content: [
              { type: 'output_audio', audio: { data: 'CCCC', transcript: 'lo' } },
              { type: 'text', text: '!' },
            ],
          },
        },
      ],
    },
    acc,
  );
  takeChunk(
    {
      choices: [
        {
          delta: {
            content: [
              { type: 'audio', data: 'DDDD' },
              { type: 'input_audio', input_audio: { data: 'EEEE', format: 'mp3' } },
            ],
          },
        },
      ],
    },
    acc,
  );
  takeChunk({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { cost: 0.04 } }, acc);
  ok(acc.chunks.join() === 'AAAA,BBBB,CCCC,DDDD,EEEE' && acc.transcript === 'Hello' && acc.text === 'La la!' && acc.cost === 0.04 && !acc.error, `every shape: ${JSON.stringify(acc)}`);
  const bad = newTake();
  takeChunk({ error: { message: 'Provider returned error' } }, bad);
  ok(bad.error === 'Provider returned error', 'an error in the stream');

  // A stream read as it comes, a line cut across pieces.
  const text = lyriaStream();
  const pieces = async function* () {
    for (let i = 0; i < text.length; i += 777) yield new TextEncoder().encode(text.slice(i, i + 777));
  };
  const got = newTake();
  let n = 0;
  await readSse(pieces(), (j) => {
    n++;
    takeChunk(j, got);
  });
  ok(n === 3 && joinBase64(got.chunks).equals(MP3) && got.text === LYRICS && got.cost === 0.04, `Lyria’s stream, as it came live: ${n} events`);
  ok(cleanLyrics(LYRICS) === 'Warm bread fresh from the oven,\nA little piece of heaven!' && cleanLyrics('[Chorus]\nLa la') === '[Chorus]\nLa la', 'lyrics without their times, their tags kept');
  if (ff) {
    const raw = Buffer.alloc(8000);
    for (let i = 0; i < 4000; i++) raw.writeInt16LE(i < 2000 ? 0 : 8000, i * 2);
    const p = peaksOf(raw, 4)!;
    ok(p.join() === '0,0,1,1', `a sound’s shape: ${p}`);
  }
}

// ---- the settings and the models ---------------------------------------------------------------------------

{
  const s = (await req('GET', '/api/audio/settings')).json();
  ok(
    s.enabled === true && s.music === '' && s.speech === '' && s.usingMusic === 'google/lyria-3-pro-preview' && s.usingSpeech === 'bytedance-seed/seed-audio-1-0' && s.keySet === false,
    `the app's choices: ${JSON.stringify({ ...s, musicInfo: !!s.musicInfo, speechInfo: !!s.speechInfo })}`,
  );
  ok(s.musicInfo?.perSong === 0.08 && s.speechInfo?.cloning === true && s.speechInfo.maxSamples === 3, 'with what they are, Seed Audio copying voices from up to 3 samples');
  const music = (await req('GET', '/api/audio/models?kind=music&sort=price')).json().models;
  ok(music.map((m: any) => m.id).join() === 'google/lyria-3-clip-preview,google/lyria-3-pro-preview', `music, cheapest first: ${music.map((m: any) => m.id)}`);
  const voices = (await req('GET', '/api/audio/models?kind=speech&sort=price')).json().models;
  ok(voices.length === 8 && voices[0].id === 'heygen/heygen-voice-1-turbo:free' && voices.every((m: any) => m.kind === 'speech') && voices.some((m: any) => m.id === 'openai/gpt-audio-mini'), 'voices, the free one first, gpt-audio among them');
  ok(voices.find((m: any) => m.id === 'elevenlabs/eleven-v3').cloning === false && voices.find((m: any) => m.id === 'bytedance-seed/seed-audio-1-0').cloning === true, 'which copy voices, from their endpoints');
  const newest = (await req('GET', '/api/audio/models?kind=speech')).json().models;
  ok(newest[0].id === 'heygen/heygen-voice-1-turbo:free' && newest[1].id === 'elevenlabs/eleven-v3', 'newest first');
  ok(
    (await req('GET', '/api/audio/models?q=eleven'))
      .json()
      .models.map((m: any) => m.id)
      .join() === 'elevenlabs/eleven-v3',
    'found by words',
  );
  const put = (await req('PUT', '/api/audio/settings', { music: 'google/lyria-3-clip-preview', speech: 'bad model!' })).json();
  ok(put.music === 'google/lyria-3-clip-preview' && put.usingMusic === 'google/lyria-3-clip-preview' && put.speech === '', 'a music model picked; a bad id left out');
  ok((await req('PUT', '/api/audio/settings', { enabled: false })).json().enabled === false && !tool(), 'turned off: agents have no tool');
  const back = (await req('PUT', '/api/audio/settings', { enabled: true, music: '' })).json();
  ok(back.enabled && back.usingMusic === 'google/lyria-3-pro-preview' && !!tool(), 'on again, the app’s choice again');
}

// ---- generate_audio ------------------------------------------------------------------------------------

{
  const none = await run({ kind: 'music', prompt: 'A jingle' });
  ok(none.isError && /no OpenRouter key/.test(none.text), 'no key: says where to add one');
  const c = loadConfig();
  c.openrouter.apiKey = 'sk-or-test';
  saveConfig(c);
  ok((await run({ kind: 'noise', prompt: 'x' })).isError && (await run({ kind: 'sound' })).isError, 'a kind it does not make; nothing described');

  // A song: the form, its price, what is sent, what is saved.
  cards.length = 0;
  calls.length = 0;
  answer = accept({ instrumental: 'No', seconds: '' });
  const song = await run({ kind: 'music', prompt: 'A cheerful ukulele jingle about fresh bread', lyrics: '[Chorus]\nWarm bread fresh from the oven' });
  ok(!song.isError && /^Made a song with google\/lyria-3-pro-preview \(\$0\.04\):/.test(song.text), `a song: ${song.text.split('\n')[0]}`);
  ok(
    cards.length === 1 && cards[0].title === 'Your music' && /Lyria 3 Pro Preview\*\* \(Google\), through OpenRouter: \$0\.08 a song/.test(cards[0].detail) && cards[0].form.fields.map((f: any) => f.id).join() === 'instrumental,seconds,format',
    `its form: ${cards[0]?.detail}`,
  );
  const sent = lastBody('/chat/completions');
  ok(
    sent?.model === 'google/lyria-3-pro-preview' && sent.stream === true && sent.audio.format === 'mp3' && /Use the following lyrics:\n\[Chorus\]\nWarm bread/.test(sent.messages[0].content) && !/Make it about/.test(sent.messages[0].content),
    'what Lyria is asked: no length, the lyrics',
  );
  const file = /^(\/\S+\.mp3) \(/m.exec(song.text)?.[1];
  ok(file && fs.existsSync(file) && file.startsWith(path.join(tmp, 'audio')) && fs.readFileSync(file).equals(MP3), `saved in the session’s audio folder: ${file}`);
  if (ff) ok(/\.mp3 \(2(\.\d)? s, \d+ KB\)/.test(song.text), `its length and size: ${song.text.split('\n')[1]}`);
  ok(/\nLyrics:\nWarm bread fresh from the oven,\nA little piece of heaven!$/.test(song.text) && /cannot listen/.test(song.text), 'the lyrics, without their times');

  // The same model again: no form, the settings kept; a piece without singing; never over a file.
  cards.length = 0;
  const piece = await run({ kind: 'music', prompt: 'A cheerful ukulele jingle about fresh bread', instrumental: true, duration: 45 });
  ok(!piece.isError && !cards.length && /^Made a piece of music with google\/lyria-3-pro-preview \(\$0\.04\), instrumental:/.test(piece.text), `no form the second time: ${piece.text.split('\n')[0]}`);
  ok(/Make it about 45 seconds long\.\n\nInstrumental only, no vocals\./.test(lastBody('/chat/completions').messages[0].content), 'its length and no singing, asked for');
  ok(/a-cheerful-ukulele-jingle-about-fresh-bread-2\.mp3/.test(piece.text), 'a second file beside the first');

  // A sound with Seed Audio: its length on the form, paid by the second.
  cards.length = 0;
  answer = accept({ seconds: '5' });
  const rain = await run({ kind: 'sound', prompt: 'Heavy rain on a tin roof, distant thunder, no voices', name: 'Rain' });
  ok(!rain.isError && /^Made a sound with bytedance-seed\/seed-audio-1-0 \(about \$0\.0\d+\):/.test(rain.text), `a sound: ${rain.text.split('\n')[0]}`);
  ok(cards[0]?.title === 'Your sound' && /\$0\.0025 a second of sound\. With the settings below, about \$0\.025\./.test(cards[0].detail) && cards[0].form.fields.find((f: any) => f.id === 'seconds')?.default === '10', `its form: ${cards[0]?.detail}`);
  const rs = lastBody('/audio/speech');
  ok(rs.model === 'bytedance-seed/seed-audio-1-0' && rs.input === 'Heavy rain on a tin roof, distant thunder, no voices. About 5 seconds long.' && rs.response_format === 'mp3' && !('voice' in rs), `what Seed Audio is asked: ${JSON.stringify(rs)}`);
  ok(/\/audio\/rain\.mp3 \(/.test(rain.text), 'named as asked');

  // Speech with Seed Audio: who, how, then the words; the settings kept from the sound.
  cards.length = 0;
  const hello = await run({ kind: 'speech', prompt: 'Welcome to the corner bakery.', instructions: 'A warm, elderly British man, slowly' });
  ok(!hello.isError && !cards.length && /^Made a voice-over with bytedance-seed\/seed-audio-1-0/.test(hello.text), `speech: ${hello.text.split('\n')[0]}`);
  ok(lastBody('/audio/speech').input === 'A warm, elderly British man, slowly: "Welcome to the corner bakery."', 'described as Seed Audio reads it');

  // A voice from samples: converted, sent, named.
  const sampleA = path.join(tmp, 'ada.wav');
  fs.writeFileSync(sampleA, pcmToWav(PCM));
  const sampleB = path.join(tmp, 'bob.m4a');
  if (ff) execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=40', '-c:a', 'aac', sampleB]);
  const both = ff ? [sampleA, sampleB] : [sampleA, sampleA];
  const unnamed = await run({ kind: 'speech', prompt: '@Audio1 Welcome back to the show.', voice_samples: both, ask: false });
  ok(unnamed.isError && /@Audio2 is not named/.test(unnamed.text), 'two samples, one not named');
  const duo = await run({
    kind: 'speech',
    prompt: 'A small studio.',
    turns: [
      { text: 'Welcome back to the show.', voice: '@Audio1' },
      { text: 'Thanks for having me.', voice: '@Audio2', instructions: 'cheerfully' },
    ],
    voice_samples: both,
    ask: false,
  });
  const ds = lastBody('/audio/speech');
  ok(!duo.isError && ds.input_references?.length === 2 && ds.input_references.every((r: any) => r.type === 'input_audio' && /^data:audio\/(wav|mpeg);base64,/.test(r.input_audio.data)), `two samples sent: ${duo.text.split('\n')[0]}`);
  ok(
    ds.input === '@Audio1 says: "Welcome back to the show."\n@Audio2 says cheerfully: "Thanks for having me."\nA small studio.' && /in the voice of ada\.wav/.test(duo.text) && /^Made a conversation/.test(duo.text),
    `the conversation as Seed Audio reads it: ${ds.input}`,
  );
  if (ff) {
    const second = Buffer.from(ds.input_references[1].input_audio.data.split(',')[1], 'base64');
    ok(sniffAudio(second) === 'wav' && Math.abs(wavSeconds(second)! - 30) < 0.1 && second.readUInt32LE(24) === 24_000, 'an M4A sample, its first 30 seconds as 24 kHz WAV');
  }
  ok((await run({ kind: 'speech', prompt: 'Hi', voice_samples: [path.join(tmp, 'nothing.wav')], ask: false })).isError, 'a sample that is not there');
  ok(/at most 3/.test((await run({ kind: 'speech', prompt: 'Hi', voice_samples: [sampleA, sampleA, sampleA, sampleA], ask: false })).text), 'four samples');
  ok(/for speech/.test((await run({ kind: 'music', prompt: 'A song', voice_samples: [sampleA] })).text), 'samples are for speech');

  // A model that reads words aloud: its voices by id, in any case; directions only where it takes them.
  const wrong = await run({ kind: 'speech', prompt: 'Hello there.', model: 'elevenlabs/eleven-v3', voice: 'Bob', ask: false });
  ok(wrong.isError && /has no voice “Bob”: give one of george, sarah, adam/.test(wrong.text), `a voice it does not have: ${wrong.text}`);
  const george = await run({ kind: 'speech', prompt: 'Hello there.', model: 'elevenlabs/eleven-v3', voice: 'George', instructions: 'cheerful', ask: false });
  const gs = lastBody('/audio/speech');
  ok(!george.isError && gs.voice === 'george' && gs.input === 'Hello there.' && !('instructions' in gs) && /\(about \$0\.00096\), voice george:/.test(george.text), `ElevenLabs asked by its voice: ${george.text.split('\n')[0]}`);
  const fish = await run({ kind: 'speech', prompt: 'Hello.', model: 'fish-audio/s1', voice: 'my-fish-voice', instructions: 'whispering', ask: false });
  const fb = lastBody('/audio/speech');
  ok(!fish.isError && fb.voice === 'my-fish-voice' && fb.instructions === 'whispering', `a voice the model does not list goes as given, and Fish takes directions: ${JSON.stringify(fb)}`);
  const sounds = await run({ kind: 'sound', prompt: 'A door creaks', model: 'elevenlabs/eleven-v3', ask: false });
  ok(sounds.isError && /only reads words aloud: leave model out/.test(sounds.text), 'a sound from a model that only reads, by name');

  // Gemini: raw sound only, a conversation in turns, made a WAV.
  const talk = await run({
    kind: 'speech',
    model: 'google/gemini-3.8-flash-tts',
    turns: [
      { text: 'How is it going?', voice: 'kore' },
      { text: 'Not bad!', voice: 'Puck', instructions: 'tired' },
    ],
    instructions: 'cheerful',
    ask: false,
  });
  const ts = lastBody('/audio/speech');
  ok(
    !talk.isError && ts.response_format === 'pcm' && Array.isArray(ts.input) && ts.input[0].voice === 'Kore' && ts.input[1].instructions === 'tired' && ts.instructions === 'cheerful' && ts.voice === 'Zephyr',
    `a conversation for Gemini: ${JSON.stringify(ts)}`,
  );
  const wavFile = /^(\/\S+\.wav) \(1 s, /m.exec(talk.text)?.[1];
  ok(wavFile && sniffAudio(fs.readFileSync(wavFile)) === 'wav' && /^Made a conversation with google\/gemini-3\.8-flash-tts/.test(talk.text), `its raw sound saved as a second of WAV: ${talk.text.split('\n')[1]}`);
  ok(/voices one speaker at a time/.test((await run({ kind: 'speech', model: 'elevenlabs/eleven-v3', turns: [{ text: 'Hi' }], ask: false })).text), 'a conversation for a model of one voice');
  // MAI here refuses MP3: asked again for raw sound.
  const mai = await run({ kind: 'speech', prompt: 'Bonjour.', model: 'microsoft/mai-voice-2.1', ask: false });
  ok(
    !mai.isError &&
      calls
        .filter((x) => x.path === '/audio/speech')
        .slice(-2)
        .map((x) => x.body.response_format)
        .join() === 'mp3,pcm' &&
      /\.wav \(/.test(mai.text) &&
      lastBody('/audio/speech').voice === 'en-US-Harper:MAI-Voice-2.1',
    'MP3 refused: asked again for raw sound, in an English voice',
  );

  // gpt-audio: told to read, its sound as plain strings.
  const gpt = await run({ kind: 'speech', prompt: 'Welcome aboard.', model: 'openai/gpt-audio-mini', instructions: 'like a pilot', ask: false });
  const gb = lastBody('/chat/completions');
  ok(
    !gpt.isError && gb.messages[0].role === 'system' && /exactly as it is written/.test(gb.messages[0].content) && /like a pilot/.test(gb.messages[0].content) && gb.messages[1].content === 'Welcome aboard.' && gb.audio.voice === 'alloy',
    `gpt-audio: ${JSON.stringify(gb.messages[0])}`,
  );
  ok(/^Made a voice-over with openai\/gpt-audio-mini \(\$0\.0004\), voice alloy:/.test(gpt.text) && fs.readFileSync(/^(\/\S+\.mp3) /m.exec(gpt.text)![1]).equals(MP3), 'its sound joined from the stream’s pieces');

  // The voice model picked cannot make sounds: the app's choice that can makes it, and says so.
  await req('PUT', '/api/audio/settings', { speech: 'elevenlabs/eleven-v3' });
  cards.length = 0;
  answer = accept();
  const door = await run({ kind: 'sound', prompt: 'A door creaks open slowly' });
  ok(!door.isError && /with bytedance-seed\/seed-audio-1-0/.test(door.text) && /Eleven v3 cannot make this, so Seed Audio 1\.0 made it\./.test(door.text), `a sound by the model that can: ${door.text}`);
  const voiceOver = await run({ kind: 'speech', prompt: 'Good morning.', ask: false });
  ok(/^Made a voice-over with elevenlabs\/eleven-v3/.test(voiceOver.text) && lastBody('/audio/speech').voice === 'george', 'speech by the one picked, in its first voice');
  await req('PUT', '/api/audio/settings', { speech: '' });

  // Closing the form makes nothing; nobody there makes it with the defaults.
  cards.length = 0;
  calls.length = 0;
  answer = () => ({ decision: 'decline' });
  const closed = await run({ kind: 'music', prompt: 'A lullaby', model: 'google/lyria-3-clip-preview' });
  ok(!closed.isError && /closed the form: no music was made/.test(closed.text) && !calls.some((x) => x.path === '/chat/completions'), 'closed: nothing made, nothing asked');
  present = false;
  cards.length = 0;
  const alone = await run({ kind: 'music', prompt: 'A lullaby', model: 'google/lyria-3-clip-preview' });
  ok(!alone.isError && !cards.length && /^Made a song with google\/lyria-3-clip-preview/.test(alone.text), 'nobody to answer: made with the defaults');
  present = true;
  answer = accept();
  ok(/no audio model nobody\/nothing/.test((await run({ kind: 'music', prompt: 'x', model: 'nobody/nothing' })).text), 'a model OpenRouter does not have');
  ok(/makes at most 2 minutes at once/.test((await run({ kind: 'sound', prompt: 'Wind', duration: 300, ask: false })).text), 'longer than the model makes');
}

// ---- the Library keeps a sound ---------------------------------------------------------------------------------

{
  const song = fs.readdirSync(path.join(tmp, 'audio')).find((f) => f.endsWith('.mp3') && f.startsWith('a-cheerful'))!;
  const file = path.join(tmp, 'audio', song);
  events.length = 0;
  calls.length = 0;
  const kept = await req('POST', '/api/media', { path: file, prompt: 'A cheerful ukulele jingle about fresh bread', model: 'google/lyria-3-pro-preview', lyrics: 'Warm bread fresh from the oven,\nA little piece of heaven!', sessionKey: 'claude:a1' });
  const item = kept.json().item;
  ok(
    kept.statusCode === 200 && item.kind === 'audio' && item.mime === 'audio/mpeg' && item.lyrics.startsWith('Warm bread') && item.title === 'A cheerful ukulele jingle about fresh bread',
    `kept as a sound: ${JSON.stringify({ ...item, peaks: item.peaks?.length })}`,
  );
  if (ff) ok(Math.round(item.duration) === 2 && item.peaks?.length === 64 && item.peaks.every((x: number) => x >= 0 && x <= 1) && Math.max(...item.peaks) === 1, 'its length and its shape');
  ok(await until(() => events.some((e) => e.id === 'media' && e.data.item?.caption === 'done')), 'its title and description are written');
  const done = (await req('GET', `/api/media/${item.id}`)).json().item;
  ok(done.title === 'Warm bread jingle' && /ukulele/.test(done.description), `written: ${done.title}`);
  const asked = lastBody('/chat/completions');
  const said = JSON.stringify(asked?.messages ?? []);
  ok(asked && !/image_url|input_audio|base64/.test(said) && /cannot hear it/.test(said) && /Its words, sung or spoken/.test(said) && /lyria-3-pro-preview/.test(said), 'written from words alone: nothing sent to listen to');
  ok((await req('GET', `/api/media/${item.id}/still`)).statusCode === 404, 'a sound has no still');
  const part = await req('GET', `/api/media/${item.id}/file`, undefined, { range: 'bytes=0-9' });
  ok(part.statusCode === 206 && part.headers['content-type'] === 'audio/mpeg' && part.rawPayload.length === 10, 'played in parts');

  // Without a model to write them: from the prompt.
  await req('PUT', '/api/media/settings', { captions: { provider: 'ollama' } });
  events.length = 0;
  const wav = path.join(
    tmp,
    'audio',
    fs.readdirSync(path.join(tmp, 'audio')).find((f) => f.endsWith('.wav'))!,
  );
  const v2 = (await req('POST', '/api/media', { path: wav, prompt: 'How is it going? Not bad!' })).json().item;
  ok(v2.kind === 'audio' && v2.mime === 'audio/wav', 'a WAV kept');
  ok(await until(() => events.some((e) => e.id === 'media' && e.data.item?.caption === 'failed')), 'no model: from its words');
  ok((await req('GET', `/api/media/${v2.id}`)).json().item.title === 'How is it going', 'its title from what it was made from');
  ok((await req('POST', '/api/media', { path: path.join(tmp, 'test.db') })).statusCode === 400, 'only pictures, videos and sounds');
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
