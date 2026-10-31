// Keeping a turn on track. Models without Claude Code's or Codex's training loop in the same ways: the
// same call again and again, step after failing step, a plan left half done, a "let me…" that never
// happens, changes declared done without the project's checks. Each is caught here: the model gets a
// short note at a threshold, and when notes do not help, the turn stops with a plain word to the user.

export interface PlanEntry {
  content: string;
  status: string;
}

/** Commands that check work: tests, type checks, linters, builds. */
const CHECK =
  /\b(test|tests|spec|pytest|jest|vitest|mocha|ava|tsc|typecheck|type-check|lint|eslint|biome|ruff|mypy|pyright|flake8|pylint|clippy|cargo\s+(test|check|build|clippy)|go\s+(test|build|vet)|make|ninja|ctest|gradle|gradlew|mvn|dotnet\s+(test|build)|deno\s+(test|check|lint)|bun\s+test|phpunit|rspec|rake|mix\s+test|swift\s+(build|test)|xcodebuild|build|check|verify|compile|py_compile|compileall|unittest|shellcheck)\b/;
/** Files whose change is worth a check (not notes, images or data). */
const CODE_FILE = /\.(c|cc|cpp|h|hpp|cs|go|rs|java|kt|kts|scala|swift|m|mm|py|pyi|rb|php|js|jsx|mjs|cjs|ts|tsx|vue|svelte|astro|lua|dart|ex|exs|erl|hs|clj|sh|bash|zsh|sql|json|ya?ml|toml|gradle|cmake|mk|proto|graphql|css|scss|less|html)$|(^|\/)(Makefile|Dockerfile|CMakeLists\.txt)$/i;
const INTENT = /(^|[.!?\n]\s*)(let me|i('|’)ll|i will|i am going to|i'm going to|i’m going to|now i('|’)ll|next,? i('|’)ll|first,? i('|’)ll)\s+(now\s+)?(check|look|read|run|create|write|update|fix|open|search|try|test|start|edit|implement|add|install|verify|fetch|find|examine|review|build|make|modify|change|inspect|investigate|explore|set up|go|continue|proceed|download|analy[sz]e|call|use|apply)\b[^\n]*$/i;

/** A call's identity: its tool and its arguments with keys in order. */
export function signature(name: string, args: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as any)[k])])) : v;
  return `${name}\u0000${JSON.stringify(sort(args))}`;
}

const mark = (s: string) => (s === 'completed' ? '[x]' : s === 'in_progress' ? '[>]' : '[ ]');
export const planText = (plan: PlanEntry[]) => plan.map((e) => `${mark(e.status)} ${e.content}`).join('\n');
export const openItems = (plan: PlanEntry[] | undefined) => (plan ?? []).filter((e) => e.status !== 'completed');

export class Guard {
  /** Why the turn should stop, said to the user. */
  stopped?: string;
  private counts = new Map<string, number>();
  /** Bumped by every change to files: the same call after a change is not a repeat. */
  private epoch = 0;
  private failing = 0;
  private steps: string[] = [];
  private sinceTodo = 0;
  private edited = new Set<string>();
  private nudged = new Set<string>();
  /** The plan was written in this turn: only then is it this turn's work to finish. */
  private planned = false;

  constructor(private o: { code: boolean; maxSteps: number; checks: string[]; planMode: boolean }) {}

  /** Before a call runs: a note to return instead of running it, when it repeats a call made with nothing changed since. */
  before(name: string, args: unknown): string | null {
    if (name === 'bash_output' || name === 'todo_write') return null;
    const sig = `${signature(name, args)}@${this.epoch}`;
    const n = (this.counts.get(sig) ?? 0) + 1;
    this.counts.set(sig, n);
    if (n >= 5) this.stopped = 'the model kept repeating the same step';
    if (n >= 3) return `Not run again: this is the same ${name} call as ${n - 1} times before, and nothing changed since, so its result would be the same as above. Use that result, try a different approach, or finish with what you have.`;
    return null;
  }

  /** After a call: what it did. `looks` says a command only looked around (it changed nothing). */
  after(name: string, args: any, ok: boolean, looks = false) {
    if (name === 'todo_write') {
      this.sinceTodo = 0;
      this.planned = true;
    }
    const writes = ok && ['write_file', 'edit_file', 'multi_edit', 'apply_patch'].includes(name);
    if (writes) {
      this.epoch++;
      const files = name === 'apply_patch' ? [...String(args.patch ?? '').matchAll(/^\*\*\* (?:Update|Add) File:\s*(.+)$/gm)].map((m) => m[1]) : [String(args.path ?? '')];
      for (const f of files) if (CODE_FILE.test(f.trim())) this.edited.add(f.trim());
    }
    if (name === 'bash') {
      // A command may change anything; a check counts as checking (passed or not, the model saw the result).
      if (!looks) this.epoch++;
      if (CHECK.test(String(args.command ?? ''))) this.edited.clear();
    }
  }

  /** After a step's calls: a reminder to add to the results, if one is due. */
  step(n: number, calls: { sig: string; ok: boolean }[], plan: PlanEntry[] | undefined): string {
    const notes: string[] = [];
    this.sinceTodo++;
    if (calls.length && calls.every((c) => !c.ok)) this.failing++;
    else this.failing = 0;
    if (this.failing === 4)
      notes.push('The last 4 steps all failed. Stop and rethink before the next call: read the errors again, check your assumptions (paths, names, arguments, the tool you picked), and try a different way, or tell the user what blocks you.');
    if (this.failing >= 8) this.stopped = 'eight steps in a row failed';
    // Going round in circles: the last steps repeat a pattern of two or three, with nothing changed.
    this.steps.push(`${this.epoch}|${calls.map((c) => c.sig).join('\n')}`);
    for (const period of [1, 2, 3]) {
      const s = this.steps;
      if (s.length < period * 3) continue;
      const tail = s.slice(-period * 3);
      if (tail.every((x, k) => x === tail[k % period]) && !this.nudged.has(`cycle${s.length >> 3}`)) {
        this.nudged.add(`cycle${s.length >> 3}`);
        notes.push('These last steps repeat the same calls in a circle without changing anything. Do something different: another tool or approach, or finish and report what you found.');
        break;
      }
    }
    const open = openItems(plan);
    if (this.planned && open.length && this.sinceTodo >= 10) {
      this.sinceTodo = 0;
      notes.push(`Your plan, as last written:\n${planText(plan!)}\nKeep it current with todo_write as items get done.`);
    }
    if (n === Math.floor(this.o.maxSteps * 0.75)) notes.push(`This turn has taken ${n} of its ${this.o.maxSteps} steps. Finish the most important part now, then report what is done and what is left.`);
    return notes.join('\n\n');
  }

  /**
   * The model answered without calling a tool: a note that sends it back to work when it is not really
   * done (each kind once per turn), or null to let the turn end.
   */
  finish(reply: string, plan: PlanEntry[] | undefined): string | null {
    const text = reply.trim();
    const asks = /\?\s*$/.test(text) || /\?\s*\n[^\n]{0,80}$/.test(text);
    const once = (k: string, note: string) => (this.nudged.has(k) ? null : (this.nudged.add(k), note));
    if (INTENT.test(text.slice(-300)) && !asks) {
      const n = once('intent', 'You said what you would do next, but did not do it: there was no tool call. Make the call now. If you are in fact done, or need the user, say that plainly instead.');
      if (n) return n;
    }
    if (this.o.planMode || asks) return null;
    const open = openItems(plan);
    if (this.planned && open.length) {
      const n = once('plan', `Your plan still has open items:\n${planText(plan!)}\nCarry on with them; if some are done or no longer needed, update the plan with todo_write; if you need the user, ask.`);
      if (n) return n;
    }
    if (this.o.code && this.edited.size) {
      const how = this.o.checks.length ? ` (${this.o.checks.slice(0, 4).join(', ')})` : '';
      const n = once('checks', `Before you finish: you changed ${[...this.edited].slice(0, 5).join(', ')} and have not run the project's checks${how} since. Run them, fix what fails, then reply. If the project has no checks, or they cannot run here, say so in your reply.`);
      if (n) return n;
    }
    return null;
  }
}
