// What each tip says (shared/tips.ts lists them and where the guide says more). A tip is about the part of the
// app marked data-tip="<id>", seen for the first time: say what it is and what it is for, in a sentence or two,
// with the app's own words for its buttons. Translated by the dictionaries like the rest of the app.
import type { TipId } from '@shared/tips';
import { MOD } from '../../lib/format';

export const TIP_TEXT: Record<TipId, { title: string; body: string }> = {
  search: {
    title: 'Search everything',
    body: `This box finds your sessions. ${MOD}K, or Search among the tools, opens the search box, which finds the rest too: files, settings, apps, notes and answers in the guide.`,
  },
  inbox: {
    title: 'Everything waiting on you',
    body: 'The inbox gathers approvals, questions and forms from every session and machine. Answer them right there, without opening each session.',
  },
  'session-menu': {
    title: 'More for this session',
    body: 'Fork it, continue in another agent, set a goal, share a read-only link, snooze, pin or archive it, and more.',
  },
  details: {
    title: 'What the session did',
    body: 'Details lists every file it changed with the diff, every command it ran with the output, and its model, tokens and cost.',
  },
  queue: {
    title: 'Messages waiting their turn',
    body: 'They go out one at a time as each turn ends. Drag one to change the order, edit it, or send it now, into the turn that is running.',
  },
  limit: {
    title: 'When a usage limit stops a session',
    body: 'Resume at reset continues it by itself once the limit resets. Settings → General can do that for every session.',
  },
  'memory-note': {
    title: 'What the agent remembered',
    body: 'Agents keep notes for later sessions as they work. Open this to see what changed in this turn, and correct or undo it.',
  },
  sources: {
    title: 'Where the answer came from',
    body: 'Sources lists the pages this reply cites. The small site names in its text link to them too.',
  },
  'files-made': {
    title: 'Files the agent made',
    body: 'Open one in the app to read or change it, or download it.',
  },
  page: {
    title: 'A page from the agent',
    body: 'Agents can answer with a page: a report, a chart, a small tool. Keep puts it in your Library, where you can change it and open it on your phone.',
  },
  browser: {
    title: 'The agent’s browser',
    body: 'Watch it work, live. Take over to sign in, solve a check or pay yourself; the agent carries on after.',
  },
  skill: {
    title: 'A skill to keep',
    body: 'The agent offers to keep how it did this, for every agent to follow next time. Nothing is saved until you approve, and you can edit it first.',
  },
  goal: {
    title: 'A goal for the session',
    body: 'The agent keeps working, turn after turn, until the goal holds. Pause or clear it here.',
  },
  children: {
    title: 'A child session',
    body: 'Another session handed this part of its work over. It runs alongside, and its replies go back to the session that started it.',
  },
  research: {
    title: 'Deep research',
    body: 'Researchers search and read in rounds, side by side, and hand back one report with its sources.',
  },
  budget: {
    title: 'A spending cap',
    body: 'What this session and its child sessions spent, at API prices. At the cap the agent stops until you raise it.',
  },
  context: {
    title: 'How full the context is',
    body: 'How much of the model’s context the conversation fills. Click it to compact the conversation into a summary and free room.',
  },
  pane: {
    title: 'The result, and the work behind it',
    body: 'An app’s run opens on its result. Conversation shows the agent’s work, where you can ask for changes.',
  },
  groups: {
    title: 'Sessions by project',
    body: 'Sessions in the same project or folder gather under its name. Click the heading to fold the group; its pen starts a new session there.',
  },
  dictate: {
    title: 'Dictate',
    body: 'Speak your message instead of typing it.',
  },
  handsfree: {
    title: 'Hands-free',
    body: 'Talk to the app and hear what it did: start a session, ask how your sessions are doing, approve or stop the work, out loud.',
  },
  machines: {
    title: 'Your other machines',
    body: 'Switch to another computer that runs the app to work with its sessions, files and terminals from here.',
  },
  files: {
    title: 'The files on this computer',
    body: `Browse, upload and edit them, Word, Excel and LaTeX files too. ${MOD}P finds a file by name from any page.`,
  },
  git: {
    title: 'Git',
    body: 'The repositories your sessions work in: commit, pull and push, branches, stashes and history.',
  },
  terminal: {
    title: 'Terminals that keep running',
    body: 'They go on when you leave the page or reload. Ctrl+` opens them in a panel under any page.',
  },
  preview: {
    title: 'Preview',
    body: 'Look at the web apps running on this computer from any device, your phone too.',
  },
  review: {
    title: 'Review a branch',
    body: 'Everything the session’s branch changed since it left its base. Tick Viewed on each file as you go.',
  },
  library: {
    title: 'Your Library',
    body: 'Pages, slides, documents, pictures and videos agents made for you to keep, each project’s together, and the sites you published.',
  },
  apps: {
    title: 'Apps',
    body: 'Small tools that find things out and show them clearly. Open one here, or just ask for what it does in any chat.',
  },
  spaces: {
    title: 'Projects',
    body: 'A project keeps a project together: its sessions, folder, documents, memory and the guidelines its agents follow.',
  },
  knowledge: {
    title: 'Shared knowledge',
    body: 'Add documents and folders once, and every session can search them and cite the file and page it read.',
  },
  usage: {
    title: 'Usage',
    body: 'How much of each plan is used and when it resets. Activity shows what agents did over time, and Arena compares models.',
  },
  ask: {
    title: 'Ask about the app',
    body: 'Type a question: an agent answers from this guide, and can change a setting or set something up for you once you confirm.',
  },
  tasks: {
    title: 'Work that starts by itself',
    body: 'A scheduled task starts an agent at a time you set, on a webhook, or when something changes. Any agent can set one up for you too.',
  },
  memory: {
    title: 'What agents remember',
    body: 'The notes agents keep about you and your projects. Correct one, add your own, or turn memory off.',
  },
  guidelines: {
    title: 'Guidelines for every agent',
    body: 'Write once how you like to work, and every agent here follows it. A project, or a single session, can have its own.',
  },
  assistants: {
    title: 'Your agents',
    body: 'Agents a session works as, such as Researcher, Writer or Coder, and your own: where and when each works, what it thinks with, and whom it asks. They are on the Agents page.',
  },
  connections: {
    title: 'Connect your services',
    body: 'Connect Gmail, GitHub, Notion and more once, and every agent can work with them. Keys go in a vault agents use without seeing.',
  },
  skills: {
    title: 'Every skill in one place',
    body: 'Methods agents load when a task calls for one: those that come with the app, yours, your plugins’ and the agents’ own. Switch any off, or write your own.',
  },
};
