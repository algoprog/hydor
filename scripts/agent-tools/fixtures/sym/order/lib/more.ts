export class Holder {
  target(): number {
    return 1;
  }
}

export function wrapper() {
  function target() {
    return 2;
  }
  return target;
}
