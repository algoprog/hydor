// A function's inputs as labels and values for the card that asks before it changes something (fn-facts.ts): the label is the property's
// title or its name made readable, values are words, a long one is marked to be folded, an empty one is left out, and the input as it was sent
// comes along.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/webapps/fn-facts-test.ts
//   DATA_DIR=/tmp/hydor-webapps-data-x node dist/dev/fn-facts-test.js
import assert from "node:assert/strict";
import { inputFacts, rawInput, readable, valueText } from "./fn-facts.ts";

let passed = 0;
const step = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

step("names become words", () => {
  assert.equal(readable("note_text"), "Note text");
  assert.equal(readable("noteText"), "Note text");
  assert.equal(readable("due-date"), "Due date");
  assert.equal(readable("customerID"), "Customer id");
  assert.equal(readable("text"), "Text");
  assert.equal(readable("___"), "___");
});

step("values are words: yes and no, numbers, lists of plain values joined, anything else compact", () => {
  assert.equal(valueText(true), "yes");
  assert.equal(valueText(false), "no");
  assert.equal(valueText(12), "12");
  assert.equal(valueText(["a", "b", 3]), "a, b, 3");
  assert.equal(valueText({ a: 1 }), '{"a":1}');
  assert.equal(valueText([{ a: 1 }]), '[{"a":1}]');
});

step("each input is a label and a value, in the schema's order, with its title when it has one", () => {
  const schema = { type: "object", properties: { text: { type: "string" }, dueDate: { type: "string", title: "Due on" }, done: { type: "boolean" } } };
  assert.deepEqual(inputFacts(schema, { done: false, text: "Call Sam", dueDate: "2026-12-01" }), [
    { label: "Text", value: "Call Sam" },
    { label: "Due on", value: "2026-12-01" },
    { label: "Done", value: "no" },
  ]);
});

step("what the schema does not name is shown too, after; empty values are left out", () => {
  const f = inputFacts({ type: "object", properties: { a: { type: "string" } } }, { extra_one: 1, a: "x", b: "", c: null, d: [], e: undefined });
  assert.deepEqual(f, [{ label: "A", value: "x" }, { label: "Extra one", value: "1" }]);
  assert.deepEqual(inputFacts(undefined, { x: "y" }), [{ label: "X", value: "y" }]);
  assert.deepEqual(inputFacts({}, {}), []);
  assert.deepEqual(inputFacts({}, null), []);
  assert.deepEqual(inputFacts({}, [1, 2]), []);
});

step("a long value is cut and marked to be folded; one on several lines too", () => {
  const long = "word ".repeat(100).trim();
  const [a] = inputFacts({}, { text: long });
  assert.equal(a.long, true);
  assert.equal(a.value, long, "kept whole up to a limit");
  const [b] = inputFacts({}, { text: "x".repeat(5000) });
  assert.ok(b.value.length <= 1200 && b.value.endsWith("…"));
  const [c] = inputFacts({}, { text: "one\ntwo" });
  assert.equal(c.long, true);
  const [d] = inputFacts({}, { text: "short" });
  assert.equal(d.long, undefined);
});

step("at most twelve, and a last line says how many more", () => {
  const input = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`f${i}`, i + 1]));
  const f = inputFacts({}, input);
  assert.equal(f.length, 13);
  assert.deepEqual(f[12], { label: "", value: "…and 3 more" });
});

step("the input as it was sent is kept, cut when very long", () => {
  assert.equal(rawInput({ a: 1 }), '{\n  "a": 1\n}');
  assert.ok(rawInput({ t: "x".repeat(9000) }).length <= 3000);
  assert.equal(rawInput(undefined), "");
});

console.log(`${passed} checks passed`);
