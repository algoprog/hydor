// Script test for what the choice cards decide (chooseLogic.ts): the answer a card sends, when it can be sent, pictures by the page's
// look, what a finished card shows, and how the tools' output is read. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/webapps/chooseLogic-test.ts && DATA_DIR=<scratch> node dist/dev/chooseLogic-test.js
import assert from "node:assert/strict";
import type { ChooseDesign, WebAppChoose } from "@shared/webapps";
import { askTake, buildMessage, designPictures, designsAnswer, draftAnswer, draftFromAnswer, draftValid, httpsLink, initialDraft, oneAnswer, parseChooseOutput, parseWebSketch, pictureUrl } from "./chooseLogic";

const design = (id: string, more: Partial<ChooseDesign> = {}): ChooseDesign => ({ id, name: id, line: "A look.", page: `design/${id}.html`, pictures: { desktop: `${id}-d`, phone: `${id}-p` }, ...more });
const designs: WebAppChoose = { id: "c1", app: "a", shape: "designs", stage: "design", title: "How should it look?", designs: [design("calm", { light: { desktop: "calm-ld" } }), design("bold"), design("warm")] };

// Designs: pick one; something to take from another is asked once one is picked.
assert.equal(draftValid(designs, initialDraft(designs)), false);
assert.equal(draftValid(designs, { ...initialDraft(designs), pick: "bold" }), true);
assert.equal(draftValid(designs, { ...initialDraft(designs), pick: "gone" }), false);
assert.equal(askTake(designs.designs, "bold"), true);
assert.equal(askTake(designs.designs, ""), false);
assert.deepEqual(draftAnswer(designs, { pick: "bold", take: " the type of calm ", other: "" }), { shape: "designs", pick: "bold", take: "the type of calm" });
assert.deepEqual(designsAnswer("calm"), { shape: "designs", pick: "calm" });
assert.deepEqual(draftFromAnswer(designs, { shape: "designs", pick: "warm", take: "x" }), { pick: "warm", take: "x", other: "" });
assert.deepEqual(draftFromAnswer(designs, undefined), initialDraft(designs));

// The pictures of the page's look: the light ones where there are some, else the dark ones, piece by piece.
assert.deepEqual(designPictures(designs.designs![0], false), { desktop: "calm-d", phone: "calm-p" });
assert.deepEqual(designPictures(designs.designs![0], true), { desktop: "calm-ld", phone: "calm-p" });
assert.equal(pictureUrl("a b", "p1"), "/api/webapps/a%20b/pictures/p1");

// One of a few: an option, or their own words when the card allows them.
const one: WebAppChoose = { id: "c2", app: "a", shape: "one", stage: "brief", title: "Who?", options: [{ id: "x", title: "X" }, { id: "y", title: "Y" }], other: true };
assert.equal(draftValid(one, initialDraft(one)), false);
assert.equal(draftValid(one, { pick: "", take: "", other: " me " }), true);
assert.equal(draftValid({ ...one, other: false }, { pick: "", take: "", other: "me" }), false);
assert.deepEqual(oneAnswer("x", "me"), { shape: "one", pick: "x" });
assert.deepEqual(draftAnswer(one, { pick: "", take: "", other: "me" }), { shape: "one", other: "me" });
assert.deepEqual(draftAnswer({ ...one, other: false }, { pick: "", take: "", other: "me" }), { shape: "one" });

assert.equal(httpsLink("https://example.com/a"), "https://example.com/a");
assert.equal(httpsLink("javascript:alert(1)"), null);
assert.equal(httpsLink("http://example.com"), null);

// The tools' output: what webapp_choose returns, and a web app's sketch.
assert.equal(parseChooseOutput("The card was withdrawn."), null);
assert.deepEqual(parseChooseOutput(JSON.stringify({ choice: "c1", app: "a", status: "answered", answer: { shape: "designs", pick: "calm" } })), { choice: "c1", app: "a", status: "answered", answer: { shape: "designs", pick: "calm" } });
assert.equal(parseWebSketch("{}"), null);
assert.equal(parseWebSketch(JSON.stringify({ sketch: { kind: "agent", name: "x" } })), null);
const sk = parseWebSketch(JSON.stringify({ sketch: { kind: "web", name: "Plant list", keeps: [{ title: "Plants", who: "Only you" }, { who: "x" }] }, questions: [1, 2, 3, 4] }))!;
assert.deepEqual([sk.sketch.name, sk.sketch.does, sk.sketch.keeps.map((k) => k.title), sk.sketch.who, sk.questions!.length], ["Plant list", [], ["Plants"], "", 3]);
assert.equal(buildMessage("Build it.", [{ ask: "Who?" }, { ask: "Where?" }], { 1: "Here" }), "Build it.\n- Where? Here");

console.log("ok - the choice cards: designs, one of a few, pictures, the tools' output");
