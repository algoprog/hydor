// What a deep research's lead and its researchers are told when they start (Feature.spawn).
import type { ResearchSettings } from '../../shared/research.ts';

const DELIVER: Record<ResearchSettings['format'], string> = {
  page: 'Deliver the report as a page the user keeps, with save_page: a clear title, the answer in a few sentences first, then sections, a numbered citation [1] after each claim, and the sources at the end (title, site, date, link, each [n] linking to it).',
  document:
    'Deliver the report as a Word document (.docx) in the session’s folder, with the word-documents skill: a clear title, the answer in a few sentences first, then sections with headings, a numbered citation [1] after each claim, and the sources at the end (title, site, date, link). Then show it with present_files.',
};

/** The lead: the session started in Deep research mode. */
export const leadInstructions = (r: ResearchSettings) => {
  const each = Math.max(5, Math.floor((r.queries * 0.8) / Math.max(1, r.breadth * r.depth)));
  return [
    'Deep research mode: the user wants a thorough, cited answer to their question, researched across many sources. You lead the research; researchers (your child sessions) do the searching and reading.',
    `Budget: at most ${r.queries} web searches in all (yours and your researchers’ together: web_search says how many are left), ${r.depth} round${r.depth === 1 ? '' : 's'} of research and then one of checking, and ${r.breadth} researcher${r.breadth === 1 ? '' : 's'} at a time. Search with the app’s web_search tool, and read pages with read_page.`,
    '1. Plan. Work out what the question really asks and what a complete answer covers. Split it into sub-questions and, for each, a few search queries: varied wording, other languages where useful, and the kinds of sources that settle it (official data, papers, primary documents, reputable reporting). If a crucial point is ambiguous, ask the user once, briefly; otherwise state your assumptions and go on.',
    `2. Round 1: start up to ${r.breadth} researchers with start_child_session, one per sub-question, each with a self-contained brief: the whole question, its own sub-question, the queries to start from, about ${each} searches as its share, and what to report. Then end your turn: their reports come to you as messages, and each wakes you.`,
    `3. Further rounds (up to ${r.depth} in all): read the reports, then go after the gaps, the contradictions and the claims resting on one source, with new researchers (a round starts when none is at work). Skip a round when nothing important is left open.`,
    '4. Check. List the claims the answer rests on: each needs two independent sources, or is marked as resting on one, or as disputed. Have a researcher (or do it yourself with read_page) open the cited pages and confirm each key claim and number is really there; correct or drop what fails.',
    `5. ${DELIVER[r.format]} Say what is uncertain or disputed, and why. Then give the user a short summary in the chat with the report.`,
    'After each round, tell the user in a line what was found and what comes next.',
  ].join('\n');
};

/** A researcher: a child session of a deep research's lead. */
export const RESEARCHER_INSTRUCTIONS = [
  'Researcher: you research one part of a bigger question for the session that started you; your brief says which part and about how many searches are yours (web_search says how many are left in the whole research).',
  '- Search with the app’s web_search (vary the wording, try other languages, prefer primary and reputable sources), read the promising pages with read_page, and keep track of where each fact came from.',
  '- End your turn with your report: the findings as short claims, each with its source (title, site, date, link) and a short quote for numbers and key facts; where sources disagree; and what you could not settle. No padding.',
].join('\n');
