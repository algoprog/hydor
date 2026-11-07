// Every answer UI's view, by its name (shared/answer-ui has what each takes): what AnswerUi.tsx draws a ```ui block with.
import type { AnswerUiView } from './kit';
import { CODE_UIS } from './uis/code';
import { COMPARE_UIS } from './uis/compare';
import { DATA_UIS } from './uis/data';
import { FOOD_UIS } from './uis/food';
import { LEARN_UIS } from './uis/learn';
import { MEDIA_UIS } from './uis/media';
import { MONEY_UIS } from './uis/money';
import { PEOPLE_UIS } from './uis/people';
import { PLANS_UIS } from './uis/plans';
import { SCIENCE_UIS } from './uis/science';
import { SHOPPING_UIS } from './uis/shopping';
import { SUMMARY_UIS } from './uis/summary';
import { TRAVEL_UIS } from './uis/travel';
import { WORK_UIS } from './uis/work';
import { WRITING_UIS } from './uis/writing';

export const UIS: Record<string, AnswerUiView> = {
  ...SUMMARY_UIS,
  ...COMPARE_UIS,
  ...SHOPPING_UIS,
  ...TRAVEL_UIS,
  ...FOOD_UIS,
  ...PLANS_UIS,
  ...WORK_UIS,
  ...DATA_UIS,
  ...MONEY_UIS,
  ...LEARN_UIS,
  ...SCIENCE_UIS,
  ...MEDIA_UIS,
  ...PEOPLE_UIS,
  ...WRITING_UIS,
  ...CODE_UIS,
};
