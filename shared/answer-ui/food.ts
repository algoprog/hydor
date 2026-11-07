// Answer UIs for food and fitness: recipes, nutrition labels, meal plans, workouts.
import type { AnswerUiSpec } from './types.ts';

export const FOOD: AnswerUiSpec[] = [
  {
    id: 'recipe',
    title: 'Recipe',
    group: 'food',
    use: 'A recipe to cook from: ingredients that scale with the servings, tick-off steps with timers, tips and nutrition.',
    keywords: 'recipe cook cooking dish ingredients method bake meal how to make food servings',
    shape: `{
  title: string
  image?: image
  description?: md
  servings?: number                       // the amounts scale when the user changes it
  time?: { prep?: string, cook?: string, total?: string }   // "15 min"
  difficulty?: "easy" | "medium" | "hard"
  tags?: string[]
  ingredients: (Ingredient | { group: string, items: Ingredient[] })[]
  steps: (md | { text: md, timer?: number, image?: image })[]   // timer: minutes, a countdown the user starts
  tips?: md[]
  nutrition?: { calories?: number, protein?: string, carbs?: string, fat?: string, fiber?: string }   // per serving
  source?: { name: string, url?: url }
}
Ingredient = { item: string, amount?: number, unit?: string, note?: string }   // amount as a number (0.5, not "1/2")`,
    example: {
      title: 'Shakshuka',
      image: 'https://www.themediterraneandish.com/wp-content/uploads/2026/05/TMD-Shakshuka-Leads-04.jpg',
      description: 'Eggs poached in a spiced tomato and pepper sauce: one pan, half an hour, good at any meal.',
      servings: 4,
      time: { prep: '10 min', cook: '25 min', total: '35 min' },
      difficulty: 'easy',
      tags: ['Vegetarian', 'One pan', 'Gluten-free'],
      ingredients: [
        { group: 'Sauce', items: [
          { item: 'olive oil', amount: 3, unit: 'tbsp' },
          { item: 'onion', amount: 1, note: 'diced' },
          { item: 'red bell peppers', amount: 2, note: 'sliced' },
          { item: 'garlic cloves', amount: 3, note: 'minced' },
          { item: 'ground cumin', amount: 1, unit: 'tsp' },
          { item: 'sweet paprika', amount: 1.5, unit: 'tsp' },
          { item: 'crushed tomatoes', amount: 800, unit: 'g' },
        ] },
        { group: 'To finish', items: [
          { item: 'eggs', amount: 6 },
          { item: 'feta', amount: 60, unit: 'g', note: 'crumbled' },
          { item: 'parsley or cilantro', note: 'a handful, chopped' },
        ] },
      ],
      steps: [
        { text: 'Warm the oil in a large skillet over medium heat; cook the onion and peppers until soft.', timer: 8 },
        'Stir in the garlic, cumin and paprika for a minute, until fragrant.',
        { text: 'Add the tomatoes, season with salt and pepper, and simmer until slightly thickened.', timer: 10 },
        { text: 'Make six wells in the sauce, crack an egg into each, cover and cook until the whites set.', timer: 6 },
        'Scatter the feta and herbs over it and serve from the pan with bread.',
      ],
      tips: ['Take it off the heat while the yolks still wobble: they keep cooking in the hot pan.', 'A spoon of harissa in the sauce makes it smoky and hot.'],
      nutrition: { calories: 290, protein: '15 g', carbs: '18 g', fat: '18 g', fiber: '5 g' },
    },
  },
  {
    id: 'nutrition',
    title: 'Nutrition facts',
    group: 'food',
    use: 'A nutrition facts label for a food or dish: serving, calories, each nutrient with its share of the daily value, and where the calories come from.',
    keywords: 'nutrition facts label calories macros protein fat carbs sugar sodium fiber vitamins daily value healthy',
    shape: `{
  name?: string                // the food
  serving?: string             // "1 medium (57 g)"
  calories: number
  nutrients: {
    name: string               // "Total fat", "Saturated fat", "Sodium", "Vitamin D"
    amount: number | string
    unit?: string              // "g", "mg", "mcg"
    dv?: number                // % of the daily value
    indent?: boolean           // a part of the one above (saturated fat under total fat)
  }[]                          // in label order: fats, cholesterol, sodium, carbohydrates, protein, then vitamins and minerals
  note?: md
}`,
    example: {
      name: 'Butter croissant',
      serving: '1 medium (57 g)',
      calories: 231,
      nutrients: [
        { name: 'Total fat', amount: 12, unit: 'g', dv: 15 },
        { name: 'Saturated fat', amount: 6.6, unit: 'g', dv: 33, indent: true },
        { name: 'Trans fat', amount: 0.4, unit: 'g', indent: true },
        { name: 'Cholesterol', amount: 38, unit: 'mg', dv: 13 },
        { name: 'Sodium', amount: 424, unit: 'mg', dv: 18 },
        { name: 'Total carbohydrate', amount: 26, unit: 'g', dv: 9 },
        { name: 'Dietary fiber', amount: 1.5, unit: 'g', dv: 5, indent: true },
        { name: 'Total sugars', amount: 6.4, unit: 'g', indent: true },
        { name: 'Protein', amount: 4.7, unit: 'g' },
        { name: 'Calcium', amount: 21, unit: 'mg', dv: 2 },
        { name: 'Iron', amount: 1.2, unit: 'mg', dv: 6 },
        { name: 'Potassium', amount: 67, unit: 'mg', dv: 2 },
      ],
      note: 'Values from USDA FoodData Central. One croissant holds a third of a day’s saturated fat.',
    },
  },
  {
    id: 'meal-plan',
    title: 'Meal plan',
    group: 'food',
    use: 'The week’s meals as a grid (a day at a time when narrow) with calories per meal and day, and a shopping list to tick off.',
    keywords: 'meal plan weekly menu meal-prep diet breakfast lunch dinner what to eat shopping list groceries calories',
    shape: `{
  title?: string
  days: {
    day: string                // "Mon", or a date
    meals: { meal: string, name: string, kcal?: number, note?: string, image?: image }[]   // meal: "Breakfast"
  }[]
  shopping?: { group?: string, items: string[] }[]   // group: "Produce"; items: "Lemons, 6"
}`,
    example: {
      title: 'A Mediterranean week',
      days: [
        { day: 'Mon', meals: [{ meal: 'Breakfast', name: 'Greek yogurt with honey and walnuts', kcal: 380 }, { meal: 'Lunch', name: 'Lentil soup with feta and bread', kcal: 560 }, { meal: 'Dinner', name: 'Baked sea bream with lemon potatoes', kcal: 720 }] },
        { day: 'Tue', meals: [{ meal: 'Breakfast', name: 'Overnight oats with apple and cinnamon', kcal: 400 }, { meal: 'Lunch', name: 'Chickpea salad with cucumber and parsley', kcal: 520 }, { meal: 'Dinner', name: 'Chicken souvlaki with tzatziki and pita', kcal: 780, note: 'Make extra for Wednesday' }] },
        { day: 'Wed', meals: [{ meal: 'Breakfast', name: 'Spinach and feta omelette', kcal: 390 }, { meal: 'Lunch', name: 'Souvlaki wrap with the leftovers', kcal: 600 }, { meal: 'Dinner', name: 'Tomatoes stuffed with rice and herbs', kcal: 650 }] },
        { day: 'Thu', meals: [{ meal: 'Breakfast', name: 'Yogurt with figs and oats', kcal: 360 }, { meal: 'Lunch', name: 'Greek salad with wholegrain bread', kcal: 540 }, { meal: 'Dinner', name: 'Shrimp saganaki with orzo', kcal: 740 }] },
        { day: 'Fri', meals: [{ meal: 'Breakfast', name: 'Toast with tahini and banana', kcal: 420 }, { meal: 'Lunch', name: 'White bean soup', kcal: 560 }, { meal: 'Dinner', name: 'Homemade vegetable pizza', kcal: 820 }] },
        { day: 'Sat', meals: [{ meal: 'Breakfast', name: 'Shakshuka with bread', kcal: 450 }, { meal: 'Lunch', name: 'Halloumi and roast vegetable bowl', kcal: 610 }, { meal: 'Dinner', name: 'Moussaka with green salad', kcal: 800 }] },
        { day: 'Sun', meals: [{ meal: 'Breakfast', name: 'Pancakes with berries and yogurt', kcal: 480 }, { meal: 'Lunch', name: 'Roast chicken with potatoes and greens', kcal: 750 }, { meal: 'Dinner', name: 'Tomato and bean soup', kcal: 420, note: 'Cook a double batch for Monday' }] },
      ],
      shopping: [
        { group: 'Produce', items: ['Tomatoes, 2 kg', 'Cucumbers, 3', 'Lemons, 6', 'Spinach, 300 g', 'Potatoes, 1.5 kg', 'Parsley and dill'] },
        { group: 'Dairy and eggs', items: ['Greek yogurt, 1 kg', 'Feta, 400 g', 'Halloumi, 250 g', 'Eggs, 12'] },
        { group: 'Fish and meat', items: ['Sea bream, 2 whole', 'Chicken thighs, 800 g', 'Shrimp, 400 g', 'Whole chicken, 1.6 kg'] },
        { group: 'Pantry', items: ['Red lentils, 500 g', 'White beans, 500 g', 'Chickpeas, 2 cans', 'Orzo, 500 g', 'Wholegrain pita', 'Tahini'] },
      ],
    },
  },
  {
    id: 'workout',
    title: 'Workout',
    group: 'food',
    use: 'A workout to follow: sets, reps and weights to tick off as you go, countdowns for timed moves and rests, a warm-up and a cool-down.',
    keywords: 'workout exercise routine training gym fitness strength sets reps circuit hiit interval timer rest home',
    shape: `{
  title: string
  duration?: string            // "40 min"
  level?: string               // "Beginner"
  warmup?: md
  exercises: {
    name: string
    sets?: number              // 1 unless set
    reps?: string              // "10", "8–12", "10 each side"
    time?: number              // seconds, for a timed move (a plank): each set is a countdown
    rest?: number              // seconds between sets: a countdown starts when a set is ticked
    weight?: string            // "12 kg"
    note?: md
    image?: image
    video?: url
  }[]
  cooldown?: md
}`,
    example: {
      title: 'Full-body strength with dumbbells',
      duration: '40 min',
      level: 'Beginner',
      warmup: 'Five minutes: march on the spot, circle your arms, then 10 bodyweight squats and 10 hip hinges.',
      exercises: [
        { name: 'Goblet squat', sets: 3, reps: '10', weight: '12 kg', rest: 90, note: 'Hold the dumbbell at your chest and sit back until your thighs are level with the floor.' },
        { name: 'Push-up', sets: 3, reps: '8–12', rest: 60, note: 'On your knees, or hands on a bench, until full ones feel easy.' },
        { name: 'Romanian deadlift', sets: 3, reps: '10', weight: '2 × 10 kg', rest: 90, note: 'Soft knees and a flat back: push your hips back until you feel your hamstrings.' },
        { name: 'One-arm row', sets: 3, reps: '10 each side', weight: '12 kg', rest: 60 },
        { name: 'Plank', sets: 3, time: 40, rest: 30, note: 'A straight line from head to heels; squeeze your glutes.' },
        { name: 'Glute bridge', sets: 2, reps: '15', rest: 45 },
      ],
      cooldown: 'Five minutes of easy stretches, 30 seconds each: hamstrings, quads, chest and hips.',
    },
  },
];
