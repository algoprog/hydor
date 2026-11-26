import { x } from './x';

/** Doc for sessionPath: braces } { in comments are ignored. */
export function sessionPath(key: string): string {
  const s = "}{"; // } trailing
  return `/s/${key}/${"}"}${`{${s}}`}`;
}

export function* gen(): Generator<number> {
  yield 1;
}

export async function multi(
  a: string,
  b: { x: number },
): Promise<void> {
  const re = /[}]\//g;
  const div = a / 2 / 3;
  await Promise.resolve(re);
}

// overloads share one extent
export function over(a: string): string;
export function over(a: number): number;
export function over(a: any): any {
  return a;
}

@Component({ selector: 'x' })
export class Widget<T> extends Base implements IFoo {
  /** the name */
  @Input() name = 'x}';
  private static readonly count: number = 0;
  #secret = 1;
  constructor(private readonly svc: Svc) { super(); }
  @HostListener('click')
  onClick(e: Event): void {
    const t = `}${e}{`;
  }
  get value(): number { return 1; }
  set value(v: number) { }
  method(a: string): void;
  method(a: number): void;
  method(a: any): void { }
  handler = (x: number) => {
    return { a: '}' };
  };
  static create(): Widget<any> { return new Widget(null as any); }
}

export abstract class AbstractThing {
  abstract run(): void;
  protected helper() { }
}

export interface IFoo<T = any> {
  id: string;
  run(a: number): void;
  readonly [key: string]: any;
}

export type Alias<T> = {
  a: T;
  b: Array<T>;
} | null;

export enum Color {
  Red = 'red',
  Green = 'green',
}

export const enum CE { A, B }

export namespace Outer.Inner {
  export const deep = 1;
  export function nsFn() { return 2; }
}

declare module 'ext' {
  export function declared(): void;
}

export const arrow = (a: number) => ({ a, b: '}' });
export const memo = React.memo((props: P) => {
  return null;
});
export const styledBox = styled.div`
  color: red; }
`;
export const obj = {
  method() { return 1; },
  prop: () => 2,
  fn: function () { return 3; },
  value: 4,
  nested: { deep() { return 5; } },
};
let counter = 0, other = 1;
var legacy = function () { };
const fnExpr = function named() { };
export default function defaultFn() { }
export { sessionPath as renamedPath };
export { Widget as Widget2 } from './widget';
export const klass = class Inner2 { m() {} };
function outer() {
  const local = 1;
  function inner() { return local; }
  return inner;
}
declare function ambient(a: string): void;
declare function ambient(a: number): void;
