// Script tests for the models and efforts an ACP agent offers: Grok Build's shapes (a model's own reasoning efforts, and the
// session's thought-level option). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/acp-models-test.ts && DATA_DIR=/tmp/hydor-test-acp-models node dist/dev/acp-models-test.js
import assert from 'node:assert/strict';
import { acpModelOptions, thoughtOption } from './acp.ts';

const effort = (id: string, def = false) => ({ id, value: id, label: id[0].toUpperCase() + id.slice(1), default: def });
const MODELS = {
  currentModelId: 'grok-4.6',
  availableModels: [
    { modelId: 'grok-4.6', name: 'Grok 4.6', description: 'The newest', _meta: { reasoningEfforts: ['xhigh', 'high', 'medium', 'low'].map((e) => effort(e, e === 'high')), reasoningEffort: 'high' } },
    { modelId: 'grok-4.5', name: 'Grok 4.5', description: 'Fast', _meta: { reasoningEfforts: ['high', 'medium', 'low'].map((e) => effort(e, e === 'high')), reasoningEffort: 'high' } },
  ],
};
const CONFIG = [
  { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'grok-4.6', options: [{ value: 'grok-4.6', name: 'Grok 4.6' }] },
  {
    id: 'reasoning_effort',
    name: 'Reasoning effort',
    category: 'thought_level',
    type: 'select',
    currentValue: 'high',
    options: ['xhigh', 'high', 'medium', 'low'].map((v) => ({ value: v, name: v })),
  },
];

// The thought-level option: its id, the values, the one set.
assert.deepEqual(thoughtOption(CONFIG), { id: 'reasoning_effort', options: ['xhigh', 'high', 'medium', 'low'], current: 'high' });
// Found by its category when its id is another, and by its id when it has no category.
assert.deepEqual(thoughtOption([{ id: 'think', category: 'thought_level', options: [{ value: 'a' }, { value: 'b' }] }]), { id: 'think', options: ['a', 'b'], current: undefined });
assert.equal(thoughtOption([{ id: 'reasoning_effort', options: [{ value: 'low' }] }])?.id, 'reasoning_effort');
// Grouped options are flattened.
assert.deepEqual(thoughtOption([{ id: 'x', category: 'thought_level', currentValue: 'b', options: [{ group: 'g', options: [{ value: 'a' }, { value: 'b' }] }] }]), {
  id: 'x',
  options: ['a', 'b'],
  current: 'b',
});
// No such option, or none to choose from.
assert.equal(thoughtOption(CONFIG.slice(0, 1)), null);
assert.equal(thoughtOption(undefined), null);
assert.equal(thoughtOption('nope'), null);
assert.equal(thoughtOption([{ id: 'reasoning_effort', options: [] }]), null);

// Each model takes its own efforts, with its default; the current one is marked.
const thought = thoughtOption(CONFIG);
const models = acpModelOptions(MODELS, thought);
assert.equal(models.length, 2);
assert.deepEqual(models[0], { value: 'grok-4.6', label: 'Grok 4.6', description: 'The newest', efforts: ['xhigh', 'high', 'medium', 'low'], defaultEffort: 'high', isDefault: true });
assert.deepEqual(models[1].efforts, ['high', 'medium', 'low'], 'Grok 4.5 has no xhigh');
assert.equal(models[1].defaultEffort, 'high');
assert.equal(models[1].isDefault, undefined);
// The model's own list wins over the session's option, and the same models without the option still have their efforts.
assert.deepEqual(acpModelOptions(MODELS, { options: ['low'], current: 'low' })[0].efforts, ['xhigh', 'high', 'medium', 'low']);
assert.deepEqual(acpModelOptions(MODELS)[1].efforts, ['high', 'medium', 'low']);
// The default is the `reasoningEffort` the model names when none of its efforts is marked.
const unmarked = {
  ...MODELS,
  availableModels: [
    {
      modelId: 'm',
      name: 'M',
      _meta: {
        reasoningEfforts: [
          { id: 'low', value: 'low' },
          { id: 'high', value: 'high' },
        ],
        reasoningEffort: 'low',
      },
    },
  ],
};
assert.equal(acpModelOptions(unmarked)[0].defaultEffort, 'low');

// A model with no list of its own takes the session's thought levels (any model of an agent that has one option).
const plain = { currentModelId: 'a', availableModels: [{ modelId: 'a', name: 'A' }, { modelId: 'b' }] };
const shared = acpModelOptions(plain, thought);
assert.deepEqual(
  shared.map((m) => m.efforts),
  [thought!.options, thought!.options],
);
assert.equal(shared[0].defaultEffort, 'high');
assert.equal(shared[1].label, 'b', 'the id when there is no name');
// No efforts anywhere (Custom, Gemini CLI): an empty list and no default.
const none = acpModelOptions(plain, null);
assert.deepEqual(
  none.map((m) => m.efforts),
  [[], []],
);
assert.equal(none[0].defaultEffort, undefined);
// Nothing offered.
assert.deepEqual(acpModelOptions(undefined), []);
assert.deepEqual(acpModelOptions({ availableModels: [{ name: 'no id' }] }), []);

console.log('acp models: ok');
