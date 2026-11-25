# Hydor vs the ChatGPT and Claude apps

People switch from the ChatGPT and Claude apps to Hydor to keep the plans they already pay for, use more than one company's models, keep what those apps know about them, and have their work on their own computer. Both apps have grown a lot this year, and the table says what each does. Hydor's edge is the combination, and that it is yours. Checked 24 November 2026.

## At a glance

"ChatGPT" is OpenAI's app on the web, desktop (Mac and Windows) and phone, with Work and Codex inside it. "Claude" is Anthropic's app at claude.ai, in Claude Desktop and on the phone, with Cowork and Claude Code. Each cell says what the app does, from its own company's pages, or "—" where those pages describe nothing of the kind. Some features need a particular plan, country or beta; the notes say so where it matters.

| | Hydor | ChatGPT | Claude |
|---|---|---|---|
| **Your Claude and ChatGPT plans, in one app** | ✓ Claude Code on your Claude plan (Pro, Max or Team), Codex on your ChatGPT plan (Plus, Pro, Business or Enterprise) | — Your ChatGPT plan only; it also works in other apps that offer Sign in with ChatGPT [1] | — Your Claude plan only; nothing found on using a ChatGPT plan |
| **Any model, local ones too** | ✓ Hydor's own agent takes any model: OpenRouter, Ollama, vLLM, llama.cpp, or your Claude and ChatGPT plans' models | Partial: OpenAI's models in the apps; the Codex command-line program takes other providers, Ollama and LM Studio included [2][3] | — Anthropic's models only; its docs say Claude Code does not support non-Claude models through any gateway [4] |
| **One memory shared by every agent and model, which you read and edit** | ✓ Claude Code, Codex and every other agent read the same notes; you read, edit and undo each one | Partial: memory you can read and edit, shared with your dot; Codex on your computer keeps a separate store [5][6][7] | Partial: topics you can read and edit, shared with Cowork in the cloud; Claude Code keeps its own memory files [8][9] |
| **Bring in what the other app knows about you** | ✓ Reads the export ChatGPT or Claude emails you: custom instructions or memory, and what you wrote in your chats; you pick what to keep | Partial: imports Claude Code, Claude Cowork and Cursor setups, with Claude Code's project memories; nothing found for another chatbot's memory or chats [10] | Partial: imports memory from another assistant by pasting what it lists; conversations can't be imported [11][12] |
| **Works on your files and folders, on your own computer** | ✓ Agents work in your folders; sessions, notes and keys stay on your machine | ✓ The desktop app's Work and Codex use local files and folders with your permission; on the web and phone, Work runs in the cloud [13] | ✓ Claude Desktop's Cowork and Claude Code reach your folders; new Cowork tasks on Pro, Max and Ultra run in the cloud and reach them only while the desktop app is open [14][15][16] |
| **Apps, ready-made and your own, with views** | ✓ 45 ready-made apps (a trip plan, a product comparison, the weather…) and your own, made by describing the job; each answers in a view of its own | Partial: apps and plugins from other services; you describe a plugin to Plugin Creator, and developers build an app's interface with the Apps SDK [17][18] | Partial: you describe an artifact that calls Claude and share it by link; each person's own plan pays for their use [19] |
| **Answer cards: charts, maps, tables, quizzes** | ✓ 150 kinds; open one full screen, save it as a picture or pin it to a board an agent keeps current | ✓ Intelligent UI mixes text, visuals and interactive elements in replies [20] | Partial: custom visuals (beta) on web and desktop, not on the phone [21] |
| **Documents, slides and spreadsheets you edit** | ✓ Documents, slides, spreadsheets, LaTeX and diagrams you edit in the app; they open beside the conversation as they are written; export to Word, PowerPoint, Excel or PDF | Partial: Work makes documents, spreadsheets and slides; Space pages and Slides are editable, Sheets "coming soon" [22][23] | Partial: Docs, Slides and Design edit live in the app; Sheets is in beta on paid plans [19][24] |
| **Scheduled tasks and watchers** | ✓ Scheduled tasks, watchers (a new email, file or ticket), webhooks, and agents of your own, each within a monthly budget | ✓ Recurring, one-time and monitoring tasks, and event-triggered tasks on Plus and up; 3 active on Free, 15 on Pro [25] | ✓ Cowork's scheduled tasks run in the cloud; Claude Code's can start on GitHub events [26][27] |
| **Goals with checks the app runs** | ✓ You agree what "done" means; after each round the app runs the checks itself, keeps a round that got closer and undoes one that made things worse | Partial: `/goal` in Codex; the agent verifies its own progress against the criteria you write [28] | Partial: `/goal` in Claude Code; a model judges the conversation and "doesn't run commands or read files independently" [29] |
| **Word suggestions as you type, made on your computer** | ✓ The rest of the word in grey, and the next one; Tab takes it; a small model on your computer that learns how you write | Partial: Codex suggests a whole next message (beta, Pro only), not word by word [30] | — Nothing found in the apps; Claude Code suggests your next prompt [31] |
| **Experiments for ML research** | ✓ Runs that wait for a free GPU, live charts, sweeps and results tables for your paper | — Nothing found on its pages | Partial: Claude Science (beta) runs analysis on your computer and jobs on a Slurm cluster or Modal GPUs [32] |
| **A browser of its own that agents work in** | ✓ In the desktop apps: tabs, an ad blocker, translation and reader view, and agents that work in it while you watch | ✓ A built-in browser in the desktop app, a cloud browser in Work, and an extension for your own Chrome [33][34] | ✓ A built-in browser in Claude Desktop, and the Claude in Chrome extension [35][36] |
| **A phone app that follows your agents and asks for approval** | ✓ Approve or deny on the notification itself, in the same app | ✓ Start and follow work on a paired Mac or Windows computer, and approve actions, from the phone [37][20] | ✓ Follow and steer Cowork and Claude Code sessions from the phone, and get a notification when Claude needs your go-ahead [38][39] |
| **Pictures, video and music** | ✓ Made with models through OpenRouter, paid with your key; edits to your own pictures, videos and sounds | Partial: images on every plan; the Sora video app ended in April 2026; no music found [40][41] | — "Claude doesn't generate photos or illustrations"; no music found [42] |
| **Open source, self-hosted, no telemetry** | ✓ AGPL-3.0, on your computer, a server or Docker; no analytics, crash reports or account with us | Partial: the Codex command-line program is open source (Apache-2.0); the ChatGPT apps are hosted by OpenAI [43] | — Closed; Claude Code is "all rights reserved". An organisation can send Claude Desktop's model calls to its own cloud account [44][45] |
| **Your conversations stay yours** | ✓ They go only to the model you chose; **Confidential** sessions use only models on your computer | Partial: used to improve the models by default on Free, Go, Plus and Pro, off in Data controls; Temporary Chat [46] | Partial: the pricing page lists "Opt-out" for training, off in Settings → Privacy; incognito chats [47][48] |
| **What it costs** | Free; you pay for the AI you use: the plans you have, an API, or free models on your computer | Free; Go $8, Plus $20, Pro from $100 a month; Business $25 a seat; ads on Free and Go [49][50][51][52] | Free; Pro $20 a month ($17 billed annually), Max $100, Ultra $200; Team $25 a seat [48][53] |

## What ChatGPT and Claude do well

Hydor is not better at everything. These are real strengths, from their own pages.

- **Their own newest models, first.** ChatGPT put GPT-6.2 in its chat tab on 23 November 2026 [20]; Claude's newest model, Fable 5.2, came on 9 November [54]. Hydor runs those models too, through your plans, but each company's app gets its features first.
- **Work that goes on with your computer off.** ChatGPT's dots have a cloud computer of their own, and Codex Cloud keeps working while your laptop sleeps [7][13]. Claude's Cowork tasks run in Anthropic's cloud and its scheduled tasks need no device online [15][26]. Hydor runs where you installed it: a task needs that computer to be awake, or a server.
- **Computer use.** Both can operate your desktop apps once you allow it [55][56].
- **Teams.** Shared projects and real-time editing of pages and slides in ChatGPT [57][22]; shared workspaces and admin controls on Business, Team and Enterprise plans [51][53].
- **Small apps shared for free.** A Claude artifact that calls Claude costs its maker nothing: each person's own plan pays for their use [19].
- **Voice, images and a polished phone app.** ChatGPT makes pictures on every plan [40]; both have voice on the phone [58][59].
- **Research, projects and connectors.** Both do cited deep research and keep projects, and both connect to many services [60][61][17][62].

## Why people switch to Hydor

- **Both plans, and any model, in one app.** Claude Code and Codex are the official programs, signed in with your own plans, so there is nothing more to pay. Hydor's own agent adds any model, local ones too, and the work can hand over from one to another. Hydor runs Claude Code as Anthropic publishes it, unmodified, signed in with your own plan, which Anthropic's terms allow [44].
- **One memory that is yours.** Tell one agent and every agent knows. Notes are found by meaning, you can read, edit and undo each one, and they stay on your computer. **Bring in** reads the export either app emails you, so you don't start again.
- **Your computer, your files, your data.** Hydor runs on your Mac, Windows or Linux computer, or a server you own, with your folders, and your sessions, notes and keys stay there. It is open source, has no telemetry and no account with us.
- **A lot in one place.** Apps you make by describing them, answers as cards pinned to boards, documents beside the conversation, tasks and goals the app checks, word suggestions as you type, experiments for researchers, a browser of its own, and your phone. Several of these have a partial answer in the apps, in the table, and the combination, working on any agent and any model, is Hydor's.
- **A strong model leading cheaper helpers.** In Hydor's own benchmark of 58 coding tasks the team solved the most, 96.6%, for 18% less than the best tier alone [63]. This one is our own number; it says nothing about the other apps.

## What you give up

- **A cloud of its own.** Hydor is an app you run, not a service. There is no cloud computer working for you while your computer is off, unless you run Hydor on a server.
- **Team features.** It is made for you and your own machines, not for an organisation's admins.
- **Their newest features on day one.** Hydor runs the official Claude Code and Codex and other agents, so what they add arrives with them; features that live only in ChatGPT's or Claude's own apps do not.

## Switch in a few minutes

1. **Keep the plan you pay for.** [Install Hydor](../install.md) and sign in to Claude Code with your Claude plan and to Codex with your ChatGPT plan, under [Settings → Agents → Accounts](/settings?s=accounts), or use any model ([agents and models](../guide/16-agents-models.md)).
2. **Bring what it knows about you.** Ask for your data in ChatGPT (Settings → Data controls → Export data) or Claude (Settings → Privacy → Export data) [64][65], then open [Settings → Memory → Bring in](/settings?s=memory&find=Bring%20in%E2%80%A6) and add the .zip. Your custom instructions or memory, and what you wrote in your chats, become proposed notes, and you pick what to keep ([how it works](../guide/06-memory.md#bring-in-from-other-assistants)).
3. **Get everything else.** Start your next job in Hydor, and follow it from your phone.

## Sources

1. [Using your ChatGPT plan in other apps and sites](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites): Sign in with ChatGPT lets participating apps use your plan's allowance.
2. [Advanced Configuration | ChatGPT Learn](https://learn.chatgpt.com/docs/config-file/config-advanced): Codex takes other model providers and local models (Ollama, LM Studio).
3. [GPT-6 and other models in ChatGPT](https://help.openai.com/en/articles/20001354-gpt-6-and-other-models-in-chatgpt): The models in ChatGPT, and Intelligent UI.
4. [Other LLM gateways | Claude Code Docs](https://code.claude.com/docs/en/llm-gateway): Claude Code is not supported with non-Claude models through any gateway.
5. [Memory in ChatGPT](https://help.openai.com/en/articles/8590148-memory-in-chatgpt): Reading, editing and deleting memory; reference chat history.
6. [Memories | ChatGPT Learn](https://learn.chatgpt.com/docs/customization/memories): Local Codex clients use a separate local memory store.
7. [Getting started with your dot](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot): What a dot is, its memory, and which plans have it.
8. [Use Claude's chat search and memory to build on previous context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Reading and editing memory; project memory; shared with Cowork in the cloud.
9. [How Claude remembers your project | Claude Code Docs](https://code.claude.com/docs/en/memory): Claude Code keeps its own memory files.
10. [Import from another agent | ChatGPT Learn](https://learn.chatgpt.com/docs/import): The desktop app imports Claude Code, Claude Cowork and Cursor setups.
11. [Import and export your memory from Claude](https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude): Importing memory by pasting what another assistant lists; exporting by asking Claude.
12. [Get started with Claude](https://support.claude.com/en/articles/8114491-get-started-with-claude): Conversation history can't be imported from another AI provider.
13. [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex): Work and Codex in the desktop app, local files, cloud tasks.
14. [Get started with Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Local file access in Claude Desktop; sub-agents.
15. [Use Claude Cowork on web, desktop, and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile): Since 6 October 2026 new Cowork sessions on Pro, Max and Ultra run in the cloud.
16. [Claude Cowork and chat are one Claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): Local files, the built-in browser and computer use work only while Claude Desktop is open.
17. [Plugins in ChatGPT](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt): Plugins and apps; describing a plugin to Plugin Creator.
18. [Building with the Apps SDK](https://help.openai.com/en/articles/12515353-building-with-the-apps-sdk): Developers build the logic and interface of an app inside ChatGPT.
19. [What are artifacts and how do I use them?](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Artifacts, apps that call Claude, Docs, Slides, Design and Sheets, and their exports.
20. [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Dated entries: Intelligent UI (7 Oct 2026), interactive charts (8 Jun), Space for Plus (20 Nov), goal mode (21 May), Remote (25 Jun), GPT-6.2 (23 Nov).
21. [Custom visuals in chat and Cowork](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork): Diagrams, charts and interactive visuals in replies, on web and desktop.
22. [Getting started with Space in ChatGPT](https://help.openai.com/en/articles/20001549-getting-started-with-space-in-chatgpt): Pages and slides, co-editing, pages that update from connected apps.
23. [Creating and collaborating on slides in ChatGPT](https://help.openai.com/en/articles/20001605-creating-and-collaborating-on-slides-in-chatgpt): Editing and exporting slides.
24. [Get started with Claude Sheets](https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets): Claude Sheets (beta).
25. [Scheduled tasks in ChatGPT](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Recurring, one-time and monitoring tasks; limits by plan; event-triggered tasks.
26. [Schedule recurring tasks in Claude Cowork](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork): Scheduled tasks that run remotely.
27. [Automate work with scheduled tasks | Claude Code Docs](https://code.claude.com/docs/en/routines): Scheduled and GitHub-triggered runs of Claude Code in the cloud.
28. [Long-running work | ChatGPT Learn](https://learn.chatgpt.com/docs/long-running-work): Goal mode in Codex: the goal text is the completion criteria.
29. [Keep Claude working toward a goal | Claude Code Docs](https://code.claude.com/docs/en/goal): /goal: a model checks the condition after each turn; it doesn't run commands or read files itself.
30. [Composer predictions in Codex](https://help.openai.com/en/articles/20001601-composer-predictions-in-codex): A suggested next message in Codex; beta, Pro, not word by word.
31. [Interactive mode | Claude Code Docs](https://code.claude.com/docs/en/interactive-mode): Next-prompt suggestions in Claude Code.
32. [Claude Science overview](https://claude.com/docs/claude-science/overview): Claude Science (beta): analysis on your computer, jobs on Slurm or Modal.
33. [Browser | ChatGPT Learn](https://learn.chatgpt.com/docs/browser): The built-in browser in the desktop app.
34. [Using cloud browser in ChatGPT](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt): Work's browser on a cloud computer.
35. [Use the built-in browser in Claude Cowork](https://support.claude.com/en/articles/16607400-use-the-built-in-browser-in-claude-cowork): A browser inside Claude Desktop.
36. [Get started with Claude in Chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): The Chrome extension.
37. [Remote connections | ChatGPT Learn](https://learn.chatgpt.com/docs/remote-connections): Controlling a Mac or Windows host from the phone, with notifications.
38. [Assign tasks from anywhere in Claude Cowork](https://support.claude.com/en/articles/13947068-assign-tasks-from-anywhere-in-claude-cowork): Cowork from the phone, with notifications.
39. [Remote Control | Claude Code Docs](https://code.claude.com/docs/en/remote-control): Driving a session on your own computer from the phone.
40. [Images in ChatGPT](https://help.openai.com/en/articles/11084440-images-in-chatgpt): Image creation and editing on all plans.
41. [What to know about the Sora discontinuation](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation): The Sora app and web experience ended on 26 April 2026.
42. [Can Claude produce images?](https://support.claude.com/en/articles/9002504-can-claude-produce-images): Claude does not generate photos or illustrations.
43. [Open Source | ChatGPT Learn](https://learn.chatgpt.com/docs/open-source): The Codex CLI is Apache-2.0; the IDE extension and Codex Cloud are not open source.
44. [Legal and compliance | Claude Code Docs](https://code.claude.com/docs/en/legal-and-compliance): Claude Code is all rights reserved; what third parties may do with plan sign-ins.
45. [Claude Desktop on 3P | Overview](https://claude.com/docs/third-party/claude-desktop/overview): Organisations can send Claude Desktop's model calls to their own cloud account.
46. [Data controls in ChatGPT](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt): Training default and the switch to turn it off; Temporary Chat.
47. [Is my data used for model training?](https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training): When Anthropic uses chats to improve its models; incognito chats.
48. [Plans & pricing | Claude by Anthropic](https://claude.com/pricing): Free, Pro, Max and Ultra plans, and what each includes.
49. [Plans and Pricing | ChatGPT](https://chatgpt.com/pricing/): Free, Go ($8), Plus ($20) and Pro plans, and what each includes.
50. [About ChatGPT Pro tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers): Pro from $100 a month.
51. [ChatGPT Business overview](https://help.openai.com/en/articles/8792828-chatgpt-business-overview): Business seats at $25 a month ($20 billed annually).
52. [Ads in ChatGPT](https://help.openai.com/en/articles/20001047-ads-in-chatgpt): Ads on Free and Go; none on Plus, Pro, Business and Enterprise.
53. [What is the Team plan?](https://support.claude.com/en/articles/9266767-what-is-the-team-plan): Team seats at $25 a month ($20 billed annually).
54. [Introducing Claude Fable 5.2 and Claude Mythos 5.2](https://www.anthropic.com/claude-fable-and-mythos-5-2): Claude Fable 5.2, released on 9 November 2026.
55. [Computer Use | ChatGPT Learn](https://learn.chatgpt.com/docs/computer-use): Operating desktop apps on macOS and Windows with your approval.
56. [Let Claude use your computer in Cowork](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork): Computer use on Mac and Windows, with per-app permission.
57. [Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Shared projects, with up to 100 collaborators on Pro.
58. [ChatGPT Voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): Voice in ChatGPT.
59. [Use voice mode](https://support.claude.com/en/articles/11101966-use-voice-mode): Voice mode in Claude.
60. [Deep research in ChatGPT](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Cited reports from deep research.
61. [Use research on Claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Research on paid plans.
62. [Use interactive connectors in Claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude): Connectors that show live apps in the conversation.
63. [Tiers and the team](../plans/tiers-and-the-team.md): Hydor's own benchmark.
64. [Exporting your ChatGPT history and data](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data): What the data export holds.
65. [Export your Claude data](https://support.claude.com/en/articles/9450526-export-your-claude-data): What the export holds; it can't be imported into another account.

## How we compared

- Every claim about ChatGPT or Claude comes from OpenAI's or Anthropic's own pages (help centres, product pages, documentation and release notes), listed above, and was checked on 24 November 2026. "—" means those pages describe nothing of the kind, which is not proof that it does not exist.
- Both products change every few weeks, and some features differ by plan, country or beta. Where they disagree, the pages' dated entries are the ones we followed. If something here is out of date, [open an issue](https://github.com/algoprog/hydor/issues) and it will be corrected.
- The one number that is Hydor's own, the cost of a team of agents, is from our benchmark of 58 coding tasks, run by us.
- Hydor is not affiliated with Anthropic or OpenAI.

[Back to all comparisons](README.md)
