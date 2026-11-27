---
title: Dynamic UIs: answers you can use, not just read
description: Hydor's agents answer with 150 ready-made cards, charts, maps and small tools that draw themselves as the reply arrives. What they are, how an agent picks one, what you can do in them, and what else a session shows you while an agent works.
date: 2026-11-25
tags: Product, Design
cover: /img/blog/dynamic-uis/cover.webp
coverAlt: A stream of glowing turquoise water pours across a dark mirror floor and fills clear glass shapes standing on it: the bars of a chart, a map pin, a ring and a small grid, each holding the water at its own level.
og: /img/blog/dynamic-uis/og.jpg
order: 1
---

Ask a chatbot which robot vacuum to buy, and you get an essay. The answer is in there somewhere: a price in the second paragraph, the battery life in the fourth, the one it recommends at the end. But what you asked for was never an essay. It was a table, a few numbers and a decision.

Most questions are like that. A trip is a map and a list of days. A recipe is amounts, and steps with times. Revising for an exam is questions to answer, not a summary to read. Chat gives all of them the same shape, a column of text, because text is what a model writes.

Hydor's agents answer in the shape the answer has. When part of an answer is something to look at, compare, choose from, follow, try or practise, the agent shows that part in a small interface made for it: a comparison with the best value in each row marked, a map with numbered pins, a recipe whose amounts follow the servings, practice problems you answer in place. The app calls them answer UIs, and there are 150 of them. They draw themselves while the reply is still arriving, and most of them do something when you touch them.

This post shows how they work and what they change, then walks through the rest of what a session shows you. Every picture and clip in it is the app itself, in its dark theme: a demo copy with a made-up person's sessions, and the examples from the app's own gallery.

## One question, two answers

Here is the robot vacuum question, answered twice with the same facts. Once in plain text, which is what you get when your guidelines ask for it. Once the usual way.

<!-- figure: versus -->

Nothing was added to the second answer. What changed is how much work it leaves to you. In the plain one, you read every cell of the table to find the best in each row. In the card, the best values are marked and the pick has its own column. Further down the reply, below what the figure shows, the same thing happens twice more: the four numbers that matter become tiles large enough to read at a glance, and the running costs, a paragraph with nine dollar amounts in it, become three bars.

Notice what did not turn into a card: the first sentence, which says which one to buy and why. Agents are told to keep the reasoning, the advice and the caveats in their own words, and to leave conversation, short answers and code changes as text. A card is for the part of an answer you would otherwise have to rebuild in your head.

## How a card gets into a reply

The agent does not write a web page. It writes the name of a UI and the data to fill it, as a short block in its reply:

````text
```ui comparison
{"title": "Robot vacuums under $500",
 "items": [{"name": "Roomi S5", "subtitle": "Self-emptying", "badge": "Pick"}, …],
 "rows": [{"label": "Price", "values": [429, 349, 499], "prefix": "$", "best": "low"}, …],
 "winner": 0}
```
````

The app does the rest. It already knows how a comparison is drawn, so the block only has to say what is being compared. And it draws as the reply comes in: the card appears as soon as its first values do and fills in as the rest arrives, so you are reading today's forecast while the agent is still writing the end of the week.

<!-- figure: stream -->

Ready-made UIs filled with data, rather than a model writing a new interface each time, buy three things:

- **Speed.** The data for a card is small. The examples in the app's own gallery have a median of about 1,200 characters, a few seconds of writing. A page of HTML, styles and scripts for the same card would be several times that, and you would wait for all of it.
- **The same look every time.** A comparison is the same comparison whether Claude Code, Codex or a model on your own computer wrote its data. It follows the app's theme, light or dark, and it fits a phone. You learn where things are once.
- **Nothing the model wrote has to run.** A card is the app's own code drawing data. The block is read, never executed.

There are too many UIs to describe to an agent up front: the list alone would take room in its context that your work needs. So the agent looks them up. In one call it names the ones it already knows and describes the other parts of its answer in a few words, such as "places to eat on a map" or "a packing list", and gets back the few that fit, each with the data it takes and an example. The lookup searches by words and by meaning and merges the two rankings, the same hybrid search that [finds your memory notes](/blog/how-hydor-remembers#how-notes-are-found).

## 150 of them, for most kinds of question

<div class="stats"><div class="stat"><b data-count-to="150">150</b><span>answer UIs</span></div><div class="stat"><b data-count-to="15">15</b><span>groups, from recipes to code</span></div><div class="stat"><b data-count-to="1">1</b><span>lookup to find the ones that fit</span></div></div>

They cover summaries, comparing and deciding, shopping, places and travel, food and fitness, time and plans, work and business, numbers and charts, money, learning, science and the sky, media and events, people and sports, writing, and code. Here are five of them, each with the kind of request that brings it up:

<!-- figure: kinds -->

One answer can hold several, one for each of its parts: a trip's itinerary, its weather and a packing list. You can also ask for one in plain words: "compare them in a table", "put them on a map", "quiz me on it", "mark up my essay with what to fix".

Whatever a card names that you may want to open, such as a place, a product, a paper or a book, links to its own page, with a small ↗ beside it so that it reads as a link on a phone too.

## Cards you use

A table in a chat is finished the moment it is written. To see it sorted another way you ask again, wait again, and pay for the tokens again. A card keeps working after it arrives.

<!-- figure: use -->

Sort and filter a table. Switch a chart to its numbers. Tick off a checklist, start a recipe's timers, flip flashcards. Drag the weights of a decision and watch the ranking change, or move the sliders of a plot until the curve fits. None of this goes back to the model. It happens in the page, at once, and what you ticked or answered is still there when you come back to the conversation on that device.

Some cards answer the agent for you. Pick an option and **Send my choice** sends it as your next message, as if you had typed it. A quiz sends your score, practice problems send your results, and **Follow-ups** at the end of an answer are the likely next questions, as buttons.

A few go further than you might expect of a card:

- **Practice problems** check what you type on the spot (a number within a tolerance, words without minding capitals), give hints one at a time, then show the worked solution.
- **A code playground** runs JavaScript, Python or a small web page in place, sealed off from the app. **Send my code** hands your version to the agent.
- **A program run step by step** shows the line it is on, its variables and what it has printed so far, and can ask you to predict the output first.
- **A fact check** goes through claims one by one, each with a verdict, the evidence for and against, and its sources.
- **Annotated text** marks up your own writing: tap a passage for its note and the change it suggests, then switch between the original and the corrected text.

## Cards that read your data

A card does not have to hold its numbers. A table, a chart, key figures, a ranking, a histogram or values on a map can read them from one of your [spreadsheets](/docs/library#spreadsheets), or from a CSV or JSON file in the conversation's folder, and add up, group, filter and sort them itself. The agent writes where the data is and what to show of it, not the numbers, so nothing is typed out again on the way.

A line under such a card says where its numbers came from and when they were read. **Read again** reads them once more, and when you save the spreadsheet, the card redraws.

## Keep the ones that matter

Point at a card, or reach it with the keyboard, and a small bar shows at its corner: **Show the data**, **Copy as text** and **Full screen**. Under its **…**, **Save as picture** gives you a PNG of the card for a slide or a message, and **Pin to a board** keeps a copy on a [board](/docs/library#boards) of your own, beside other cards.

![A board called The shop this week: four tiles with the week's revenue, orders, conversion and returns, a chart of sales by day pinned from a session, and a weather forecast. Two of the cards say when they were last updated and what that cost.](/img/app-boards.webp "A board of cards pinned from replies. The numbers and the forecast keep themselves up to date.")

A pinned card can keep itself current. **Keep it up to date…** has an agent ask the card's question again every hour, every day or every week, after telling you about what a refresh costs, so the week's numbers or the forecast are fresh whenever you look. And under a reply that showed cards, **Do this again…** turns the turn into an [app](/docs/apps) whose answer is those cards, or into a scheduled task.

Because the app draws the cards, they fit whatever screen they are on, a phone included:

<!-- figure: phone -->

## When no card fits

Not every idea has a ready-made UI, and not every one should. Agents also write maths that is drawn as in a textbook, and diagrams (flowcharts, sequences, timelines, mind maps) in the app's colours. When an idea needs something of its own, they write a small figure or tool that runs inside the reply: a chart, a calculator, a simulation with sliders. That one is a page the model wrote, so it runs sealed off from the app and from your files.

![A reply explaining how BM25 scores a document: the formula drawn as in a textbook, a flowchart of a search pipeline from the query to the top ten, and a small figure with a slider under it.](/img/blog/dynamic-uis/more-maths.webp "A formula, a diagram and a small live figure in one reply. The slider moves the curve.")

## The rest of the session

Answers are half of a session. The other half is the work, and you can follow it as it happens.

<!-- figure: session -->

The same care goes into reading what an agent made:

<!-- figure: more -->

- **Documents open beside the conversation.** When a turn makes or changes one document, such as a report, a spreadsheet or a page, it opens next to the conversation on a wide screen while it is being written. Close it, and it stays closed until the agent writes it again.
- **Zoom belongs to the conversation.** <kbd>Ctrl</kbd> with <kbd>+</kbd> and <kbd>−</kbd> (<kbd>⌘</kbd> on a Mac), or a pinch on the trackpad, makes the text, code, cards and pictures bigger or smaller, from 67% to 200%, while the sidebar and the message box stay as they are.
- **Tables, code and diagrams open full screen**, where they zoom too, and a drag moves you about.
- **Every change is a diff.** Under a reply, the files the turn changed are listed with the lines added and removed. Click one to read exactly what changed.

## Try it

Every answer UI is in the app with an example. Press <kbd>Ctrl</kbd> <kbd>K</kbd> and type **Answer UIs**: each one has a play button that shows it arriving as a reply would bring it, and a button for the data behind it.

Then just ask. You do not need to name a card. Ask the question, and the answer takes its shape. If you would rather have plain text, say so in your message, or once in your [guidelines](/docs/guidelines), and every agent follows it.

[The sessions guide](/docs/sessions#answer-uis-cards-charts-and-maps-in-replies) has everything a card can do, and [Meet Hydor](/blog/meet-hydor) is the place to start if you are new here. Hydor is named after water, which takes the shape of whatever holds it. An answer should do the same.
