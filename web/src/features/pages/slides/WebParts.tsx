// The side panel's sections for the web format's parts, and for code (in both formats): a code part's language, its
// code (in the app's code editor), its colours, line numbers and the lines lit up; custom code's page (HTML, CSS and
// JavaScript), run in place, the ready-made ones to start from, an agent to write it, whether it takes clicks, its
// picture; a web page's address; a quiz's question, choices (the right ones marked, each with what is said when it is
// picked) and what is said after, its look; the quiz score's words; 3D's model (a GLB file) or shape, its colour,
// material, light and background, how it turns and where it is seen from. For every part of a web deck, what it does
// when the pointer is on it.
import { useState } from 'react';
import { Check, Circle, ImagePlus, Play, Plus, Sparkles, Square, Upload, X } from 'lucide-react';
import {
  FONTS,
  HOVERS,
  LIGHTS_3D,
  MATERIALS_3D,
  SHAPES_3D,
  type CodeEl,
  type El,
  type EmbedEl,
  type Hover,
  type HtmlEl,
  type Light3d,
  type Material3d,
  type QuizChoice,
  type QuizEl,
  type Scene3dEl,
  type ScoreEl,
  type Shape3d,
  type TextFx,
  type Theme,
} from '@shared/slides';
import { Button, cx, Switch } from '../../../components/ui';
import { Choice, Select } from '../studio/fields';
import { CodeField, fileFor } from './CodeField';
import { ColorButton, Field, NumInput, Section, Tool } from './controls';
import { CODE_LANGS, embedAddress } from './ops';
import { STARTERS } from './starters';

type Set = (patch: Partial<El>, key?: string) => void;

const field = 'h-8 w-full min-w-0 rounded-lg border border-line bg-bg-1 px-2 text-[12.5px] outline-none focus:border-accent/60';
const area = 'w-full min-w-0 resize-none rounded-lg border border-line bg-bg-1 px-2 py-1.5 text-[12.5px] outline-none focus:border-accent/60';
const note = 'text-[11.5px] leading-snug text-fg-3';

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
      <span className="min-w-0 flex-1">{label}</span>
      <Switch label={label} on={on} onChange={onChange} />
    </label>
  );
}

const fontOptions = (theme: Theme) => [{ value: '', label: `Body (${theme.font})` }, { value: 'head', label: `Headings (${theme.headFont})` }, ...FONTS.map((f) => ({ value: f.name, label: f.name }))];

// ---- code -----------------------------------------------------------------------------------------------------

const LANGS: { value: string; label: string }[] = [...Object.entries(CODE_LANGS).map(([value, label]) => ({ value, label })), { value: '', label: 'Plain text' }];

export function CodeLook({ el, set }: { el: CodeEl; set: Set }) {
  return (
    <Section title="Code">
      <Field label="Language">
        <Select value={el.lang ?? ''} onChange={(lang) => set({ lang: lang || undefined } as Partial<El>)} options={LANGS} title="Language" />
      </Field>
      <CodeField key={`${el.id}:${el.lang ?? ''}`} value={el.code} onChange={(code) => set({ code } as Partial<El>, 'code')} file={fileFor(el.lang)} label="The code" className="h-[200px]" />
      <Field label="Colours">
        <Choice
          value={el.look ?? 'dark'}
          onChange={(look) => set({ look } as Partial<El>)}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'deck', label: 'The deck’s', title: 'The deck’s own colours' },
          ]}
        />
      </Field>
      <Field label="Size">
        <NumInput label="Size" value={el.size} onChange={(size) => set({ size } as Partial<El>, 'size')} min={8} max={80} step={1} buttons />
      </Field>
      <Toggle label="Line numbers" on={!!el.lineNumbers} onChange={(v) => set({ lineNumbers: v || undefined } as Partial<El>)} />
      <Field label="Lines lit up">
        <input
          value={el.highlight ?? ''}
          onChange={(e) => set({ highlight: e.target.value.replace(/[^\d,-]/g, '').slice(0, 80) || undefined } as Partial<El>, 'highlight')}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="2-4,7"
          aria-label="Lines lit up"
          className={field}
        />
      </Field>
      <p className={note}>They stand out, the rest dimmed: a range (2-4) or single lines, with commas between.</p>
      <Field label="Corners">
        <NumInput label="Corner radius" value={el.radius ?? 0} onChange={(radius) => set({ radius: radius || undefined } as Partial<El>, 'radius')} min={0} max={400} unit="px" />
      </Field>
    </Section>
  );
}

// ---- a picture for a live part ----------------------------------------------------------------------------------

/** The picture a live part shows where it cannot run (PowerPoint, paper, the editor until it runs). */
function PosterField({ el, set, pickPicture }: { el: HtmlEl | EmbedEl | Scene3dEl; set: Set; pickPicture: () => Promise<{ src: string } | null> }) {
  return (
    <Field label="Its picture" top>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            icon={<ImagePlus size={14} />}
            onClick={async () => {
              const p = await pickPicture();
              if (p) set({ poster: p.src } as Partial<El>);
            }}
          >
            {el.poster ? 'Another picture' : 'A picture'}
          </Button>
          {el.poster && (
            <Button size="sm" variant="ghost" onClick={() => set({ poster: undefined } as Partial<El>)}>
              No picture
            </Button>
          )}
        </div>
        <p className={note}>Shown where it can’t run (in PowerPoint, on paper) and until it starts.</p>
      </div>
    </Field>
  );
}

// ---- custom code ------------------------------------------------------------------------------------------------

export function HtmlLook({
  el,
  set,
  running,
  onRun,
  onAsk,
  pickPicture,
}: {
  el: HtmlEl;
  set: Set;
  running: boolean;
  onRun: (id: string | null) => void;
  /** An agent asked to write it (its words lead the request). */
  onAsk?: () => void;
  pickPicture: () => Promise<{ src: string } | null>;
}) {
  return (
    <Section
      title="Custom code"
      aside={
        <Button size="sm" variant={running ? 'secondary' : 'primary'} icon={running ? <Square size={12} /> : <Play size={13} />} onClick={() => onRun(running ? null : el.id)} className="h-7">
          {running ? 'Stop' : 'Run'}
        </Button>
      }
    >
      <p className={note}>A little web page of its own: HTML, with its CSS and JavaScript, run in a frame that reaches nothing else. The deck’s colours and fonts are its CSS variables (--n-accent, --n-fg, --n-font…).</p>
      <CodeField key={el.id} value={el.html} onChange={(html) => set({ html } as Partial<El>, 'html')} file="part.html" label="Its HTML, CSS and JavaScript" className="h-[240px]" />
      <Field label="Ready-made">
        <Select
          value=""
          title="Start from a ready-made one"
          onChange={(id) => {
            const st = STARTERS.find((x) => x.id === id);
            if (st) set({ html: st.html, interactive: st.interactive || undefined } as Partial<El>);
          }}
          options={[{ value: '', label: 'Start from one' }, ...STARTERS.map((x) => ({ value: x.id, label: x.label }))]}
        />
      </Field>
      {onAsk && (
        <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} className="w-full justify-center" onClick={onAsk}>
          Ask an agent to write it
        </Button>
      )}
      <Toggle label="Takes clicks in the slideshow" on={!!el.interactive} onChange={(v) => set({ interactive: v || undefined } as Partial<El>)} />
      <p className={note}>{el.interactive ? 'Clicks and keys go to it in the slideshow, so a click on it does not go to the next slide.' : 'A click on it goes on to what is next, as on the rest of the slide.'}</p>
      <PosterField el={el} set={set} pickPicture={pickPicture} />
    </Section>
  );
}

// ---- a web page ---------------------------------------------------------------------------------------------------

export function EmbedLook({ el, set, pickPicture }: { el: EmbedEl; set: Set; pickPicture: () => Promise<{ src: string } | null> }) {
  const [url, setUrl] = useState(el.url);
  const bad = !!url.trim() && !embedAddress(url);
  return (
    <Section title="Web page">
      <input
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          const u = embedAddress(e.target.value);
          if (u && u !== el.url) set({ url: u } as Partial<El>, 'url');
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label="The page’s address"
        placeholder="https://…"
        translate="no"
        className={cx(field, bad && 'border-err')}
      />
      {bad && <p className="text-[11.5px] text-err">A web address that starts with https://.</p>}
      <p className={note}>Only sites that let others show them in a frame appear. It runs in the slideshow; here, press Run.</p>
      <Toggle label="Takes clicks in the slideshow" on={!!el.interactive} onChange={(v) => set({ interactive: v || undefined } as Partial<El>)} />
      <Field label="Corners">
        <NumInput label="Corner radius" value={el.radius ?? 0} onChange={(radius) => set({ radius: radius || undefined } as Partial<El>, 'radius')} min={0} max={400} unit="px" />
      </Field>
      <PosterField el={el} set={set} pickPicture={pickPicture} />
    </Section>
  );
}

// ---- a quiz ---------------------------------------------------------------------------------------------------------

/** A choice as it is kept: no empty reason, no "not right". */
const tidy = (c: QuizChoice): QuizChoice => ({ text: c.text, ...(c.correct ? { correct: true } : {}), ...(c.why ? { why: c.why } : {}) });

export function QuizLook({ el, theme, set }: { el: QuizEl; theme: Theme; set: Set }) {
  const right = el.choices.filter((c) => c.correct).length;
  const setChoices = (choices: QuizChoice[], key?: string) => set({ choices: choices.map(tidy) } as Partial<El>, key);
  const mark = (i: number) =>
    setChoices(
      el.choices.map((c, k) => {
        // One right answer: marking another moves the mark; several: each is marked on its own.
        if (el.multi) return k === i ? { ...c, correct: !c.correct } : c;
        return { ...c, correct: k === i ? !c.correct : false };
      }),
    );
  return (
    <>
      <Section title="Quiz">
        <Field label="Question" top>
          <textarea value={el.question} onChange={(e) => set({ question: e.target.value.slice(0, 1000) } as Partial<El>, 'question')} onKeyDown={(e) => e.stopPropagation()} rows={2} aria-label="The question" className={area} />
        </Field>
        <div className="space-y-1.5">
          {el.choices.map((c, i) => (
            <div key={i} className={cx('space-y-1 rounded-lg border p-1.5', c.correct ? 'border-ok/50 bg-ok/5' : 'border-line')}>
              <div className="flex items-center gap-1">
                <Tool label={c.correct ? 'A right answer: click to unmark it' : 'Mark it as right'} on={!!c.correct} onClick={() => mark(i)} className={cx('h-7 min-w-7', c.correct && 'bg-ok/15 text-ok hover:bg-ok/15 hover:text-ok')}>
                  {c.correct ? <Check size={14} strokeWidth={2.75} /> : <Circle size={14} />}
                </Tool>
                <input
                  value={c.text}
                  onChange={(e) => setChoices(el.choices.map((x, k) => (k === i ? { ...x, text: e.target.value.slice(0, 300) } : x)), `choice:${i}`)}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label={`Choice ${i + 1}`}
                  className={cx(field, 'h-7')}
                />
                <Tool label="Remove this choice" disabled={el.choices.length <= 2} onClick={() => setChoices(el.choices.filter((_, k) => k !== i))} className="h-7 min-w-7">
                  <X size={13} />
                </Tool>
              </div>
              <input
                value={c.why ?? ''}
                onChange={(e) => setChoices(el.choices.map((x, k) => (k === i ? { ...x, why: e.target.value.slice(0, 500) } : x)), `why:${i}`)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Said when it is picked"
                aria-label={`What is said when choice ${i + 1} is picked`}
                className={cx(field, 'h-7 text-[12px]')}
              />
            </div>
          ))}
          {el.choices.length < 8 && (
            <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setChoices([...el.choices, { text: `Choice ${el.choices.length + 1}` }])}>
              A choice
            </Button>
          )}
        </div>
        <Toggle
          label="Several are right"
          on={!!el.multi}
          onChange={(multi) => {
            // Back to one right answer: the first one marked stays.
            const first = el.choices.findIndex((c) => c.correct);
            set({ multi: multi || undefined, ...(multi ? {} : { choices: el.choices.map((c, k) => tidy({ ...c, correct: k === first })) }) } as Partial<El>);
          }}
        />
        <p className={note}>{!right ? 'No choice is marked right: it is a poll. What people pick shows, and nothing is scored.' : el.multi ? 'People pick every right one, then Check.' : 'Right or wrong shows as soon as one is picked.'}</p>
        <Field label="After it" top>
          <textarea
            value={el.explain ?? ''}
            onChange={(e) => set({ explain: e.target.value.slice(0, 1000) || undefined } as Partial<El>, 'explain')}
            onKeyDown={(e) => e.stopPropagation()}
            rows={2}
            placeholder="Said once it is answered, whatever was picked"
            aria-label="What is said once it is answered"
            className={area}
          />
        </Field>
      </Section>
      <Section title="Its look">
        <Field label="Choices">
          <Choice
            value={el.layout ?? 'list'}
            onChange={(layout) => set({ layout: layout === 'list' ? undefined : layout } as Partial<El>)}
            options={[
              { value: 'list', label: 'In a column' },
              { value: 'grid', label: 'Two by two' },
            ]}
          />
        </Field>
        <Field label="Font">
          <Select value={el.font ?? ''} onChange={(v) => set({ font: v || undefined } as Partial<El>)} options={fontOptions(theme)} title="Font" />
        </Field>
        <Field label="Size">
          <NumInput label="Size" value={el.size} onChange={(size) => set({ size } as Partial<El>, 'size')} min={10} max={120} step={2} buttons />
          <ColorButton value={el.color} theme={theme} onChange={(color) => set({ color } as Partial<El>)} label="Colour" />
        </Field>
        <Field label="Choices’ fill">
          <ColorButton value={el.fill} theme={theme} none="The theme’s" onChange={(fill) => set({ fill } as Partial<El>)} label="The choices’ fill" />
        </Field>
      </Section>
    </>
  );
}

// ---- the quiz score ----------------------------------------------------------------------------------------------

export function ScoreLook({ el, theme, set }: { el: ScoreEl; theme: Theme; set: Set }) {
  return (
    <Section title="Quiz score">
      <input
        value={el.text ?? ''}
        onChange={(e) => set({ text: e.target.value.slice(0, 300) || undefined } as Partial<El>, 'text')}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="You got {right} of {total}"
        aria-label="Its words"
        className={field}
      />
      <p className={note}>{'{right}, {total} and {percent} become the score so far, from the deck’s quizzes answered in the slideshow.'}</p>
      <Field label="Font">
        <Select value={el.font ?? ''} onChange={(v) => set({ font: v || undefined } as Partial<El>)} options={fontOptions(theme)} title="Font" />
      </Field>
      <Field label="Size">
        <NumInput label="Size" value={el.size} onChange={(size) => set({ size } as Partial<El>, 'size')} min={8} max={300} step={2} buttons />
        <ColorButton value={el.color} theme={theme} onChange={(color) => set({ color } as Partial<El>)} label="Colour" />
      </Field>
      <Field label="Line up">
        <Choice
          value={el.align ?? 'center'}
          onChange={(align) => set({ align } as Partial<El>)}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Centre' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </Field>
      <Toggle label="Bold" on={!!el.bold} onChange={(bold) => set({ bold: bold || undefined } as Partial<El>)} />
    </Section>
  );
}

// ---- 3D -------------------------------------------------------------------------------------------------------------

const SHAPE_3D: Record<Shape3d, string> = { cube: 'Cube', sphere: 'Ball', torus: 'Ring', knot: 'Knot', cone: 'Cone', cylinder: 'Cylinder', icosahedron: 'Gem', text: 'Words' };
const MATERIAL: Record<Material3d, string> = { matte: 'Matte', glossy: 'Glossy', metal: 'Metal', glass: 'Glass', wire: 'Wireframe', toon: 'Cartoon' };
const LIGHT: Record<Light3d, string> = { studio: 'Studio lights', soft: 'Soft light', dramatic: 'Dramatic light', neon: 'Neon lights' };

export function Scene3dLook({
  el,
  theme,
  set,
  pickModel,
  pickPicture,
}: {
  el: Scene3dEl;
  theme: Theme;
  set: Set;
  /** A 3D model from this device (.glb, or .gltf with its files), kept by the app: its source. */
  pickModel: () => Promise<string | null>;
  pickPicture: () => Promise<{ src: string } | null>;
}) {
  const [busy, setBusy] = useState(false);
  const model = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const src = await pickModel();
      // A model shows in its own materials and colours until one is picked.
      if (src) set({ model: src, material: undefined } as Partial<El>);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Section title="3D">
        <Field label="It shows">
          <Choice
            value={el.model ? 'model' : 'shape'}
            onChange={(v) => (v === 'model' ? void model() : set({ model: undefined, shape: el.shape ?? 'cube' } as Partial<El>))}
            options={[
              { value: 'shape', label: 'A shape' },
              { value: 'model', label: 'A model' },
            ]}
          />
        </Field>
        {el.model ? (
          <div className="space-y-1.5">
            <p className={note}>A 3D model, kept with the deck.</p>
            <Button size="sm" variant="secondary" icon={<Upload size={14} />} disabled={busy} onClick={() => void model()}>
              {busy ? 'Adding the model…' : 'Another model'}
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-1">
              {SHAPES_3D.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set({ shape: k } as Partial<El>)}
                  className={cx('h-8 truncate rounded-lg border px-1 text-[12px] transition-colors', (el.shape ?? 'cube') === k ? 'border-accent/60 bg-accent-soft text-fg' : 'border-line text-fg-2 hover:border-line-2 hover:bg-bg-1')}
                >
                  {SHAPE_3D[k]}
                </button>
              ))}
            </div>
            {el.shape === 'text' && (
              <Field label="Its words">
                <input value={el.text ?? ''} onChange={(e) => set({ text: e.target.value.slice(0, 40) || undefined } as Partial<El>, 'text3d')} onKeyDown={(e) => e.stopPropagation()} placeholder="Hello" aria-label="Its words" className={field} />
              </Field>
            )}
            <p className={note}>Or a model of your own, from a 3D app or a site of free models: a .glb file, or a .gltf picked together with its files.</p>
          </>
        )}
        <Field label="Material">
          <Select
            value={el.material ?? (el.model ? '' : 'glossy')}
            onChange={(material) => set({ material: (material || undefined) as Material3d | undefined } as Partial<El>)}
            options={[...(el.model ? [{ value: '', label: 'Its own' }] : []), ...MATERIALS_3D.map((m) => ({ value: m, label: MATERIAL[m] }))]}
            title="Material"
          />
        </Field>
        {(!el.model || el.material) && (
          <Field label="Colour">
            <ColorButton value={el.color ?? 'accent'} theme={theme} onChange={(color) => set({ color: color ?? 'accent' } as Partial<El>)} label="Colour" />
            {el.model && <span className={note}>The whole model, in this material.</span>}
          </Field>
        )}
        <Field label="Lighting">
          <Select value={el.light ?? 'studio'} onChange={(light) => set({ light: light as Light3d } as Partial<El>)} options={LIGHTS_3D.map((m) => ({ value: m, label: LIGHT[m] }))} title="Lighting" />
        </Field>
        <Field label="Behind it">
          <ColorButton value={el.bg} theme={theme} none="See-through" onChange={(bg) => set({ bg } as Partial<El>)} label="The colour behind it" />
        </Field>
      </Section>
      <Section title="Turning">
        <Field label="By itself">
          <NumInput label="Degrees a second (0: still; below 0: the other way)" value={el.spin ?? 0} onChange={(spin) => set({ spin: spin || undefined } as Partial<El>, 'spin')} min={-360} max={360} step={5} unit="°/s" />
        </Field>
        <Toggle label="Viewers can turn and zoom it" on={!!el.orbit} onChange={(orbit) => set({ orbit: orbit || undefined } as Partial<El>)} />
        <Field label="Seen from">
          <NumInput label="Around it (degrees)" value={el.turn ?? 0} onChange={(turn) => set({ turn: turn || undefined } as Partial<El>, 'turn')} min={-180} max={180} step={5} unit="°" />
          <NumInput label="From above (degrees)" value={el.tilt ?? 0} onChange={(tilt) => set({ tilt: tilt || undefined } as Partial<El>, 'tilt')} min={-89} max={89} step={5} unit="°" />
        </Field>
        <Field label="How near">
          <NumInput label="How near (1 fits it to the box)" value={el.zoom ?? 1} onChange={(zoom) => set({ zoom: zoom === 1 ? undefined : zoom } as Partial<El>, 'zoom')} min={0.2} max={5} step={0.1} unit="×" />
        </Field>
        <PosterField el={el} set={set} pickPicture={pickPicture} />
      </Section>
    </>
  );
}

// ---- every part: the pointer; words: their shine --------------------------------------------------------------------

const HOVER: Record<Hover, string> = { lift: 'It rises', grow: 'It grows', glow: 'It glows', tilt: 'It tilts towards it' };

export function HoverField({ el, set }: { el: El; set: Set }) {
  return (
    <Section title="When the pointer is on it">
      <Select value={el.hover ?? ''} onChange={(v) => set({ hover: (v || undefined) as Hover | undefined })} options={[{ value: '', label: 'Nothing happens' }, ...HOVERS.map((h) => ({ value: h, label: HOVER[h] }))]} title="When the pointer is on it" />
      <p className={note}>In the slideshow.</p>
    </Section>
  );
}

export const TEXT_FX_NAMES: Record<TextFx, string> = { gradient: 'Colour gradient', glow: 'Glow', outline: 'Outlined letters', neon: 'Neon', shadow: 'Long shadow' };
