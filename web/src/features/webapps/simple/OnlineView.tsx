// "Put it online" with Technical details off: one screen for each step, each asking for one thing and checking it before
// the next. Drawn from what it is given (Online.tsx reads it and does what the buttons say), so a script can draw every
// screen and read every word.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, CircleAlert, Copy, ExternalLink, Globe, Home, Laptop, Link2 } from 'lucide-react';
import type { OnlineOffer, WebAppOnlineHelp } from '@shared/webapps';
import { tr } from '../../../i18n/runtime';
import { Button, cx, inputCls, Throbber } from '../../../components/ui';
import { CARD } from './HomeView';
import type { Group } from './plain';
import { cleanDomain, cleanServer, recordName, stepAt, type PathKind, type ScreenId } from './onlinePath';

type Provider = WebAppOnlineHelp['providers'][number];
type Registrar = WebAppOnlineHelp['registrars'][number];

export interface OnlineData {
  appName: string;
  busy?: boolean;
  /** One plain sentence on why the last try did not work. */
  problem?: string;
  /** Its technical words, shown with Technical details on only. */
  /** Why the internet is not for this app yet. */
  internetBlocked?: string;
  /** What a small server costs a month, from the catalog while it is fresh. */
  fromPrice?: string;
  providers: Provider[];
  registrars: Registrar[];
  provider?: Provider;
  registrar?: Registrar;
  /** A server added before, that can be used again. */
  servers?: { name: string; address: string }[];
  /** The line to paste on the server. */
  line?: string;
  /** The server is created with Hydor's text: nothing is compared. */
  textPath?: boolean;
  /** A server the person has already. */
  ownServer?: boolean;
  /** Where replacing a new server's identity stopped. */
  unsafe?: 'make' | 'swap' | 'again';
  /** That text. */
  block?: string;
  /** The address being waited for. */
  waitingFor?: string;
  /** The server's code to compare. */
  code?: string;
  serverAddress?: string;
  /** What is wrong with the server, plain. */
  serverProblems?: string[];
  domain?: string;
  testAddress?: string;
  /** Whether the web address leads to the server yet (null: not looked yet). */
  points?: boolean | null;
  /** The keys still to be given, by plain title. */
  keys?: string[];
  address?: string;
  groups?: Group[];
  /** The lines of the check that stop the launch, plain. */
  stops?: string[];
  failed?: { text: string; next: string };
  /** It runs only here. */
  here?: boolean;
  /** What people use is not the newest. */
  ahead?: boolean;
  canGoBack?: boolean;
}

export interface OnlineActions {
  back: () => void;
  leave: () => void;
  where: (w: 'here' | 'internet') => void;
  provider: (id: string) => void;
  useServer: (name: string) => void;
  created: () => void;
  pasted: () => void;
  copy: (text: string) => void;
  connect: (ssh: string) => void;
  match: () => void;
  noMatch: () => void;
  setup: () => void;
  web: (w: 'own' | 'get' | 'test') => void;
  registrar: (id: string) => void;
  domain: (d: string) => void;
  useAddress: () => void;
  addKeys: () => void;
  launch: () => void;
  fixFirst: () => void;
  anyway: () => void;
  fix: () => void;
  again: () => void;
  open: () => void;
  update: () => void;
  takeDown: () => void;
  goBack: () => void;
  askAccounts: () => void;
}

/** Why a new server was not taken, by where replacing its proof of who it is stopped. */
const UNSAFE = {
  make: 'The company knows what the text gave your server to prove who it is, so Hydor has the server make a new proof of its own. Your server did not make one.',
  swap: 'Your server made a new proof of who it is, but could not put it in place of the one in the text.',
  again: 'Your server changed its proof of who it is, but did not answer with the new one afterwards.',
};

/** What was chosen on the first screen, for the count of steps. */
const PathContext = createContext<PathKind>('rent');

function Frame({ at, title, line, children, onBack, footer }: { at: ScreenId; title: string; line?: ReactNode; children?: ReactNode; onBack?: () => void; footer?: ReactNode }) {
  const step = stepAt(at, useContext(PathContext));
  return (
    <div className="mx-auto max-w-[560px] px-4 py-4 sm:py-8" data-simple="online" data-screen={at}>
      <div className="mb-3 flex min-h-8 items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1 text-[13px] font-medium text-fg-2 hover:text-fg">
            <ArrowLeft size={15} />
            Back
          </button>
        )}
        <span className="flex-1" />
        {step && <span className="tnum text-[12.5px] text-fg-3">{tr(`Step ${step.n} of ${step.of}`)}</span>}
      </div>
      <h2 translate="no" className="text-[22px] leading-snug font-semibold tracking-tight text-balance">
        {title}
      </h2>
      {line && <div className="mt-2 text-[14px] leading-relaxed text-pretty text-fg-2">{line}</div>}
      {children && <div className="mt-5 space-y-3">{children}</div>}
      {footer && <div className="mt-6 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
    </div>
  );
}

const Problem = ({ text }: { text?: string }) =>
  text ? (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-warn/45 bg-warn/5 px-3 py-2.5 text-[13.5px] leading-snug">
      <CircleAlert size={15} className="mt-0.5 shrink-0 text-warn" />
      <span translate="no">{text}</span>
    </p>
  ) : null;

/** A thing to paste or compare: shown as it is, with its copy button. A script that reads the words leaves it out. */
function Verbatim({ text, onCopy }: { text: string; onCopy?: (t: string) => void }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-line-2 bg-bg-2 p-3" data-verbatim>
      <code translate="no" className="min-w-0 flex-1 text-[13px] leading-relaxed break-all">
        {text}
      </code>
      {onCopy && (
        <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={() => onCopy(text)}>
          Copy
        </Button>
      )}
    </div>
  );
}

/** The whole text for a new server: copied in one press, readable if they like. A script that reads the words leaves it out. */
function Block({ text, onCopy }: { text: string; onCopy: (t: string) => void }) {
  return (
    <div className="rounded-xl border border-line-2 bg-bg-2" data-verbatim>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-[12.5px] text-fg-3">Hydor’s text</span>
        <Button size="sm" variant="primary" icon={<Copy size={13} />} onClick={() => onCopy(text)}>
          Copy all of it
        </Button>
      </div>
      <pre translate="no" tabIndex={0} aria-label={tr('Hydor’s text')} className="max-h-28 overflow-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed text-fg-3">
        {text}
      </pre>
    </div>
  );
}

function Big({ icon, title, line, price, onClick, disabled, children }: { icon: ReactNode; title: string; line: string; price?: string; onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <div className={cx(CARD, 'transition-colors', !disabled && 'hover:border-line-2 hover:bg-bg-1')}>
      <button type="button" onClick={onClick} disabled={disabled} className="flex w-full items-start gap-3 text-left disabled:opacity-60">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{icon}</span>
        <span className="min-w-0 flex-1">
          <span translate="no" className="block text-[15px] font-semibold">
            {title}
          </span>
          <span translate="no" className="mt-0.5 block text-[13.5px] leading-snug text-fg-2">
            {line}
          </span>
          {price && (
            <span translate="no" className="mt-1.5 block text-[13px] font-medium text-fg">
              {price}
            </span>
          )}
        </span>
      </button>
      {children}
    </div>
  );
}

function Outside({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:underline">
      {children}
      <ExternalLink size={13} />
    </a>
  );
}

const priceOf = (o: OnlineOffer) => o.price ?? undefined;

function Field({ label, placeholder, button, busy, check, onSubmit }: { label: string; placeholder: string; button: string; busy?: boolean; check: (v: string) => string; onSubmit: (v: string) => void }) {
  const [value, setValue] = useState('');
  const good = check(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (good && !busy) onSubmit(good);
      }}
      className="space-y-3"
    >
      <label className="block">
        <span className="mb-1 block text-[13px] font-medium">{tr(label)}</span>
        <input className={cx(inputCls, 'text-[16px] sm:text-[14px]')} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoCapitalize="off" autoCorrect="off" spellCheck={false} translate="no" />
      </label>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!good || busy} icon={busy ? <Throbber size={13} /> : undefined}>
          {tr(button)}
        </Button>
      </div>
    </form>
  );
}

export function OnlineView(props: { screen: ScreenId; d: OnlineData; act: OnlineActions }) {
  const { d } = props;
  const kind: PathKind = d.ownServer ? 'own' : d.textPath && d.provider?.server?.text ? 'text' : 'rent';
  return (
    <PathContext.Provider value={kind}>
      <Screen {...props} />
    </PathContext.Provider>
  );
}

function Screen({ screen, d, act }: { screen: ScreenId; d: OnlineData; act: OnlineActions }) {
  const p = d.provider;
  const steps = p?.server;
  const name = p?.name ?? tr('your provider');
  const pasted = d.textPath ? steps?.text : undefined;
  switch (screen) {
    case 'blocked':
      return (
        <Frame at={screen} title={tr('It is not ready to go online yet')} line="Hydor cannot tell how to run it. The agent can put that right." onBack={act.leave} footer={<Button variant="primary" onClick={act.fix}>Ask the agent</Button>} />
      );
    case 'choose':
      return (
        <Frame at={screen} title={tr('Who should be able to use it?')} onBack={act.leave}>
          <Big icon={<Laptop size={18} />} title={tr('Only here')} line={tr('You use it here, on this computer. Nobody else can sign in to it. It is off when this computer is off.')} price={tr('Free. Ready in a moment.')} onClick={() => act.where('here')} />
          <Big icon={<Globe size={18} />} title={tr('On the internet')} line={tr('Anyone you give the address to can use it. It runs on a server you rent.')} price={d.fromPrice ? tr(`A server: ${d.fromPrice}. A web address of your own costs extra.`) : tr('A server you rent, paid monthly.')} onClick={() => act.where('internet')} disabled={!!d.internetBlocked} />
          {d.internetBlocked && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <p className="min-w-0 flex-1 basis-56 text-[13.5px] leading-snug text-fg-2" translate="no">
                {d.internetBlocked}
              </p>
              <Button size="sm" variant="secondary" onClick={act.askAccounts}>
                Ask the agent
              </Button>
            </div>
          )}
        </Frame>
      );
    case 'here':
      return (
        <Frame at={screen} title={tr('Put it online, only here')} line="You get a version to use, with its own saved information, separate from the one you keep changing. It takes a few minutes." onBack={act.back} footer={<Button variant="primary" disabled={d.busy} onClick={act.launch}>Put it online</Button>}>
          <Problem text={d.problem} />
        </Frame>
      );
    case 'provider':
      return (
        <Frame at={screen} title={tr('Choose where to rent a server')} line="A server is a computer that is always on. You pay the company monthly, and can stop at any time by deleting it." onBack={act.back}>
          {(d.servers ?? []).map((s) => (
            <Big key={s.name} icon={<Home size={18} />} title={tr('Your server from before')} line={s.address} onClick={() => act.useServer(s.name)} />
          ))}
          {d.providers.map((x, i) => (
            <Big key={x.id} icon={<Globe size={18} />} title={i === 0 && d.providers.length > 1 ? tr(`${x.name} (recommended)`) : x.name} line={x.why} price={priceOf(x)} onClick={() => act.provider(x.id)}>
              <div className="mt-2 pl-12">
                <Outside href={x.page}>{tr(`See ${x.name}’s prices`)}</Outside>
                {x.catch && (
                  <p translate="no" className="mt-1 text-[12.5px] leading-snug text-fg-3">
                    {x.catch}
                  </p>
                )}
              </div>
            </Big>
          ))}
          <Big icon={<Home size={18} />} title={tr('I already have a server')} line={tr('One you rent or run already. You paste a key there, compare a code, and Hydor sets it up.')} onClick={() => act.provider('own')} />
        </Frame>
      );
    case 'create': {
      const clicks = (
        <ol className="space-y-3">
          {(pasted?.clicks ?? steps?.clicks ?? [tr('Create a server with Ubuntu and at least 2 GB of memory.')]).map((c, i) => (
            <li key={c} className="flex gap-3">
              <span className="tnum grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{i + 1}</span>
              <span translate="no" className="text-[14px] leading-snug">
                {c}
              </span>
            </li>
          ))}
        </ol>
      );
      if (pasted)
        return (
          <Frame at={screen} title={tr(`Create a server at ${name}, with this text`)} line={tr(`${name} asks you to make an account and add a way to pay first.`)} onBack={act.back} footer={<Button variant="primary" disabled={!d.block} onClick={act.created}>I have created it</Button>}>
            {d.block ? <Block text={d.block} onCopy={act.copy} /> : d.problem ? null : <Throbber size={20} />}
            <p className="text-[13px] leading-relaxed text-fg-3">The text is for this one server. It holds what your server will show the first time to prove it is yours. As soon as it connects, Hydor has it make a new proof, so what the company keeps of the text is then of no use to anyone.</p>
            <Problem text={d.problem} />
            {clicks}
            <Outside href={steps!.open}>{tr(`Open ${name}`)}</Outside>
          </Frame>
        );
      return (
        <Frame at={screen} title={tr(`Create a server at ${name}`)} line={tr(`${name} asks you to make an account and add a way to pay first.`)} onBack={act.back} footer={<Button variant="primary" onClick={act.created}>I have done these</Button>}>
          {clicks}
          <Outside href={steps?.open ?? p?.page ?? ''}>{tr(`Open ${name}`)}</Outside>
          <p className="text-[13px] text-fg-3">Keep that page open: the next step is on it too.</p>
        </Frame>
      );
    }
    case 'paste':
      return (
        <Frame at={screen} title={steps ? tr(`Paste this into the box called “${steps.box}”`) : tr('Add this to your server')} line={steps ? <span translate="no">{steps.boxThen}</span> : 'Add it where your provider keeps the keys that may sign in to the server, usually called “SSH keys”.'} onBack={act.back} footer={<Button variant="primary" disabled={!d.line} onClick={act.pasted}>I have pasted it</Button>}>
          {d.line ? <Verbatim text={d.line} onCopy={act.copy} /> : <Throbber size={20} />}
          <Problem text={d.problem} />
          <p className="text-[13px] leading-relaxed text-fg-3">It lets Hydor, and only Hydor, sign in to that server. It is made for this and is safe to paste there.</p>
        </Frame>
      );
    case 'address':
      return (
        <Frame at={screen} title={tr('Paste your server’s address here')} line={steps ? <span translate="no">{steps.address}</span> : 'The four numbers your provider shows for the server, like 203.0.113.7.'} onBack={act.back}>
          <Problem text={d.problem} />
          <Field label="Your server’s address" placeholder="203.0.113.7" button="Connect" busy={d.busy} check={(v) => cleanServer(v, steps?.login ?? 'root')} onSubmit={act.connect} />
        </Frame>
      );
    case 'starting':
      return (
        <Frame at={screen} title={tr('Waiting for your server')} line="A new server takes a few minutes the first time: it is setting itself up. You may leave this page and come back." onBack={act.back}>
          <p role="status" className="flex items-center gap-2 text-[14px]">
            <Throbber size={15} />
            <span translate="no">{d.waitingFor}</span>
          </p>
          <Problem text={d.problem} />
          <p className="text-[13px] leading-relaxed text-fg-3">Nothing after ten minutes? Go back and check the address, or delete that server and create it again with the text.</p>
        </Frame>
      );
    case 'compare':
      return (
        <Frame
          at={screen}
          title={tr('Check it is your server')}
          line="This is the first time Hydor talks to your server. To be sure it is yours, compare this code with the one shown there."
          onBack={act.back}
          footer={
            <>
              <Button variant="secondary" disabled={d.busy || !d.code} onClick={act.noMatch}>
                They do not
              </Button>
              <Button variant="primary" disabled={d.busy || !d.code} icon={d.busy ? <Throbber size={13} /> : undefined} onClick={act.match}>
                They match
              </Button>
            </>
          }
        >
          <Problem text={d.problem} />
          {d.code ? <Verbatim text={d.code} /> : d.problem ? <Button variant="secondary" onClick={act.again}>Try again</Button> : <p className="flex items-center gap-2 text-[13.5px] text-fg-2"><Throbber size={14} />Connecting to it…</p>}
          <div className={CARD}>
            <p className="text-[13.5px] font-semibold">Where to see it</p>
            <p translate="no" className="mt-1 text-[13.5px] leading-relaxed text-fg-2">
              {steps?.compare ?? tr('In your provider’s page for the server, open its console and paste the line below. Compare the code it writes with the one here.')}
            </p>
            <div className="mt-2">
              <Verbatim text={steps?.compareLine ?? 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'} onCopy={act.copy} />
            </div>
          </div>
        </Frame>
      );
    case 'unsafe':
      return (
        <Frame at={screen} title={tr('Hydor could not make your server safe, so it has not taken it')} line={tr(UNSAFE[d.unsafe ?? 'make'])} onBack={act.back} footer={<Button variant="primary" disabled={d.busy} icon={d.busy ? <Throbber size={13} /> : undefined} onClick={act.again}>Try again</Button>}>
          <Problem text={d.problem} />
          <p className="text-[14px] leading-relaxed text-fg-2">If it fails again, delete that server and create it again with the text.</p>
        </Frame>
      );
    case 'mismatch':
      if (pasted)
        return (
          <Frame at={screen} title={tr('This is not the server you created with Hydor’s text')} line="What answers at that address does not show what the text gave your server, so Hydor sent it nothing." footer={<Button variant="primary" onClick={act.back}>Try the address again</Button>}>
            <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-fg-2">
              <li>Check that the address is the one of the server you just created.</li>
              <li translate="no">{tr(`If it is, delete that server and create it again, with the text pasted into “${pasted.box}”.`)}</li>
            </ul>
          </Frame>
        );
      return (
        <Frame at={screen} title={tr('Stop here: do not use this server')} line="The codes differ, so Hydor may not be talking to your server. Nothing was sent to it." footer={<Button variant="primary" onClick={act.back}>Start again</Button>}>
          <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-fg-2">
            <li>Check that the address you pasted is the one of your new server.</li>
            <li>Compare the code once more, letter by letter.</li>
            <li>If it still differs, delete that server and make a new one.</li>
          </ul>
        </Frame>
      );
    case 'setup':
      return (
        <Frame at={screen} title={tr('Hydor will set your server up')} line="It puts the program that runs your app on it, and turns on a guard that lets in only your visitors and Hydor. It takes a few minutes and changes nothing on this computer." onBack={act.back} footer={<Button variant="primary" disabled={d.busy} icon={d.busy ? <Throbber size={13} /> : undefined} onClick={act.setup}>{d.busy ? 'Setting it up…' : d.serverProblems?.length ? 'Try again' : 'Set it up'}</Button>}>
          <Problem text={d.problem} />
          {d.serverProblems?.map((x) => <Problem key={x} text={x} />)}
        </Frame>
      );
    case 'web':
      return (
        <Frame at={screen} title={tr('Choose its web address')} line="What people type to reach it." onBack={act.back}>
          <Big icon={<Link2 size={18} />} title={tr('I have one')} line={tr('A domain you bought already, like example.com.')} onClick={() => act.web('own')} />
          <Big icon={<Globe size={18} />} title={tr('Get one')} line={tr('Buy a domain. It is paid yearly.')} onClick={() => act.web('get')} />
          <Big icon={<Laptop size={18} />} title={tr('Use a test address for now')} line={tr('Free and ready at once, from the service sslip.io. Good for trying, not for keeping.')} onClick={() => act.web('test')} />
        </Frame>
      );
    case 'registrar':
      return (
        <Frame at={screen} title={tr('Get a web address')} line="Buy one from either, then come back here." onBack={act.back}>
          {d.registrars.map((x, i) => (
            <Big key={x.id} icon={<Globe size={18} />} title={i === 0 ? tr(`${x.name} (recommended)`) : x.name} line={x.why} price={priceOf(x)} onClick={() => act.registrar(x.id)}>
              <div className="mt-2 pl-12">
                <Outside href={x.page}>{tr(`Buy at ${x.name}`)}</Outside>
              </div>
            </Big>
          ))}
        </Frame>
      );
    case 'domain':
      return (
        <Frame at={screen} title={tr('Type your web address')} line="The domain you own, or a name under it like shop.example.com." onBack={act.back}>
          <Field label="Web address" placeholder="example.com" button="Continue" check={cleanDomain} onSubmit={act.domain} />
        </Frame>
      );
    case 'record': {
      const r = d.registrar?.record;
      const rows: [string, string][] = [
        [r?.type[0] ?? tr('Type'), r?.type[1] ?? 'A'],
        [r?.name ?? tr('Name'), recordName(d.domain ?? '', r?.apex ?? '@') || tr('leave it empty')],
        [r?.value ?? tr('Value'), d.serverAddress ?? ''],
      ];
      return (
        <Frame
          at={screen}
         
          title={tr('Add one record, so the address leads to your server')}
          line={<span translate="no">{r?.where ?? tr('Where you bought the address, find its records and add one.')}</span>}
          onBack={act.back}
          footer={
            <>
              {r && <Outside href={r.open}>{tr(`Open ${d.registrar!.name}`)}</Outside>}
              <span className="flex-1" />
              <Button variant="primary" disabled={!d.points} onClick={act.useAddress}>
                Continue
              </Button>
            </>
          }
        >
          {d.registrars.some((x) => x.record) && (
            <div className="flex flex-wrap items-center gap-1.5" data-bought>
              <span className="mr-1 text-[13px] text-fg-3">Where you bought it:</span>
              {d.registrars
                .filter((x) => x.record)
                .map((x) => (
                  <Button key={x.id} size="sm" variant={d.registrar?.id === x.id ? 'primary' : 'secondary'} aria-pressed={d.registrar?.id === x.id} onClick={() => act.registrar(x.id)}>
                    <span translate="no">{x.name}</span>
                  </Button>
                ))}
              <Button size="sm" variant={d.registrar ? 'secondary' : 'primary'} aria-pressed={!d.registrar} onClick={() => act.registrar('')}>
                Elsewhere
              </Button>
            </div>
          )}
          <dl className="divide-y divide-line rounded-xl border border-line-2 bg-bg-2" data-verbatim>
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <dt translate="no" className="w-28 shrink-0 text-[13px] text-fg-3">
                  {k}
                </dt>
                <dd translate="no" className="min-w-0 flex-1 font-mono text-[13.5px] break-all">
                  {v}
                </dd>
                <Button size="sm" variant="ghost" icon={<Copy size={13} />} aria-label={tr(`Copy ${k}`)} onClick={() => act.copy(v)}>
                  Copy
                </Button>
              </div>
            ))}
          </dl>
          {r && (
            <p translate="no" className="text-[13.5px] leading-snug text-fg-2">
              {r.then}
            </p>
          )}
          <p role="status" className="flex items-start gap-2 text-[13.5px] leading-snug" data-points={String(d.points)}>
            {d.points ? <Check size={15} className="mt-0.5 shrink-0 text-ok" /> : <Throbber size={14} />}
            <span translate="no">{d.points ? tr(`${d.domain ?? ''} leads to your server.`) : tr(`Waiting until ${d.domain ?? ''} leads to your server. It can take an hour: you may leave and come back.`)}</span>
          </p>
        </Frame>
      );
    }
    case 'keys':
      return (
        <Frame at={screen} title={d.keys && d.keys.length > 1 ? tr('Add its keys') : tr('Add its key')} line="It cannot work without these. What you paste goes into your encrypted vault." onBack={act.back} footer={<Button variant="primary" onClick={act.addKeys}>{d.keys && d.keys.length > 1 ? 'Add them' : 'Add it'}</Button>}>
          <ul className="space-y-1.5">
            {(d.keys ?? []).map((k) => (
              <li key={k} translate="no" className="text-[14px]">
                {k}
              </li>
            ))}
          </ul>
        </Frame>
      );
    case 'ready':
      return (
        <Frame at={screen} title={tr('Ready to put it online')} line="Hydor checks it first. If anything goes wrong, what people use now stays as it is." onBack={act.back} footer={<Button variant="primary" disabled={d.busy} icon={d.busy ? <Throbber size={13} /> : undefined} onClick={act.launch}>Put it online</Button>}>
          <dl className={cx(CARD, 'space-y-2 text-[14px]')}>
            <div className="flex flex-wrap gap-x-3">
              <dt className="w-24 shrink-0 text-fg-3">What</dt>
              <dd translate="no" className="min-w-0 flex-1 font-medium">
                {d.appName}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-3">
              <dt className="w-24 shrink-0 text-fg-3">Address</dt>
              <dd translate="no" className="min-w-0 flex-1 break-all">
                {d.address}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-3">
              <dt className="w-24 shrink-0 text-fg-3">Where</dt>
              <dd className="min-w-0 flex-1">
                Your server <span translate="no">{d.serverAddress}</span>
              </dd>
            </div>
          </dl>
          <Problem text={d.problem} />
        </Frame>
      );
    case 'going':
      return (
        <Frame at={screen} title={tr('Putting it online')} line="A few minutes. You can leave this page: it carries on." onBack={act.leave}>
          <ol className={cx(CARD, 'space-y-3')} data-groups>
            {(d.groups ?? []).map((g) => (
              <li key={g.id} className="flex items-center gap-3 text-[15px]" data-group={g.id} data-state={g.state}>
                <span className="grid size-5 place-items-center">
                  {g.state === 'running' ? <Throbber size={15} /> : g.state === 'passed' ? <Check size={17} className="text-ok" /> : g.state === 'failed' ? <CircleAlert size={17} className="text-err" /> : <span className="size-2 rounded-full bg-bg-3" />}
                </span>
                <span translate="no" className={cx(g.state === 'waiting' && 'text-fg-3', g.state === 'running' && 'font-medium')}>
                  {g.title}
                </span>
              </li>
            ))}
          </ol>
        </Frame>
      );
    case 'ask':
      return (
        <Frame
          at={screen}
          title={tr('Something should be fixed first')}
          line="The app’s own checks found this. Nothing has been sent yet."
          footer={
            <>
              <Button variant="ghost" onClick={act.anyway}>
                Put it online anyway
              </Button>
              <Button variant="primary" onClick={act.fixFirst}>
                Fix it first
              </Button>
            </>
          }
        >
          <ul className="space-y-2">
            {(d.stops ?? []).map((s) => (
              <li key={s}>
                <Problem text={s} />
              </li>
            ))}
          </ul>
        </Frame>
      );
    case 'failed':
      return (
        <Frame
          at={screen}
          title={tr('It did not go online')}
          line={<span translate="no">{`${d.failed?.text ?? ''} ${d.failed?.next ?? ''}`}</span>}
          onBack={act.back}
          footer={
            <>
              <Button variant="secondary" onClick={act.again}>
                Try again
              </Button>
              <Button variant="primary" onClick={act.fix}>
                Ask the agent to fix it
              </Button>
            </>
          }
        />
      );
    case 'done':
      return (
        <Frame at={screen} title={d.here ? tr('It is running here') : tr('It is online')} line={d.here ? 'Only you can open it, on this computer.' : undefined} onBack={act.leave} footer={<Button variant="primary" icon={<ExternalLink size={14} />} onClick={act.open}>Open</Button>}>
          {!d.here && d.address && <Verbatim text={d.address} onCopy={act.copy} />}
          {d.ahead && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/45 bg-warn/5 px-3 py-2.5">
              <p className="min-w-0 flex-1 basis-56 text-[13.5px] leading-snug">Your changes are not online yet.</p>
              <Button size="sm" variant="primary" onClick={act.update}>
                Put them online
              </Button>
            </div>
          )}
          <div className={CARD}>
            <p className="text-[13.5px] font-semibold">What happens by itself</p>
            <ul className="mt-1.5 space-y-1.5 text-[13.5px] leading-snug text-fg-2">
              <li>A copy of everything it keeps is made every night.</li>
              <li>Every week Hydor checks that it is up, and tells you only if something needs you.</li>
              {d.here && <li>It is off while this computer is off.</li>}
              {!d.here && <li>Your server is billed monthly until you delete it.</li>}
            </ul>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-fg-2">
            {d.canGoBack && (
              <button type="button" onClick={act.goBack} className="min-h-8 underline decoration-line-2 underline-offset-4 hover:text-fg">
                Go back to the version before
              </button>
            )}
            {d.here ? (
              <button type="button" onClick={() => act.where('internet')} className="min-h-8 underline decoration-line-2 underline-offset-4 hover:text-fg">
                Let others use it, on the internet
              </button>
            ) : (
              <button type="button" onClick={act.takeDown} className="min-h-8 underline decoration-line-2 underline-offset-4 hover:text-fg">
                Take it off the internet
              </button>
            )}
          </div>
        </Frame>
      );
    default:
      return null;
  }
}
