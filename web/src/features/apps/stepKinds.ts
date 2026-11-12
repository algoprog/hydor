// Each kind of step's colour and icon: the graph's nodes, the list of steps beside an app's form, and an agent's card
// that asks to run an app. Kept apart from the graph editor so a page showing only these does not load the editor.
import { AppWindow, Bot, Columns2, CodeXml, Database, MessageCircleQuestion, Repeat, Sigma, Sparkles, Split, Wrench } from 'lucide-react';
import type { StepKind } from '@shared/app-manifest';

/** Each kind's colour: the node's stripe and the wires of the values it gives. */
export const KIND_COLOR: Record<StepKind, string> = {
  agent: '#8b5cf6',
  model: '#3b82f6',
  tool: '#f59e0b',
  decide: '#94a3b8',
  repeat: '#14b8a6',
  parallel: '#6366f1',
  app: '#06b6d4',
  data: '#22c55e',
  ask: '#f97316',
  code: '#ec4899',
  value: '#84cc16',
};
export const ICON: Record<StepKind, typeof Bot> = { agent: Bot, model: Sparkles, tool: Wrench, decide: Split, repeat: Repeat, parallel: Columns2, app: AppWindow, data: Database, ask: MessageCircleQuestion, code: CodeXml, value: Sigma };
