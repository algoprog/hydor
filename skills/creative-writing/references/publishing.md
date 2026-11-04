# Publishing

Open this when the writer is ready to send work out or to publish it: query letters, synopses,
proposals, finding agents and presses, submissions, self-publishing and the traps. Rules and rates
change: check agents', publishers' and stores' current pages (`web_search`, `read_page`) before
relying on them, and quote what you found with its date.

## Which road

| The work | Usual road |
| --- | --- |
| A novel (any genre, adult or children's) | Finish and revise the whole book, then query literary agents; agents sell to publishers |
| Memoir | Usually like a novel (a finished manuscript); some agents take a proposal from writers with a large audience |
| Other nonfiction | Sold on a proposal and sample chapters before the book is written |
| A picture book | The whole text, queried like a novel; illustrations only if the writer is also the illustrator |
| Short stories, poems | Literary magazines and anthologies first; collections to small presses and contests |
| A screenplay | Contests, fellowships, managers; production companies rarely read unsolicited scripts |
| Any book, under the writer's control | Self-publishing (below) |

Small and independent presses often take submissions without an agent: their guidelines say so.

## The query letter (fiction and memoir)

About 250 to 400 words, in the body of an email or the agent's online form, following that agent's
guidelines to the letter (what to paste: the query, a synopsis, the first pages or chapters).

1. **Greeting** with the agent's name, spelled right: "Dear Priya Shah,".
2. **Why this agent** (optional, one line): a book they represent, something on their wish list.
3. **The pitch** (150 to 250 words): who the main character is, what they want, what stands in the
   way, what they must choose or risk. The hook comes first. Do not reveal the ending (the synopsis
   does that), list every subplot, ask rhetorical questions, or praise the book.
4. **The book:** title, genre and readership, word count rounded to the thousand, one or two
   comparable titles from the last few years.
5. **About the writer** (two or three sentences): publications, relevant expertise or experience.
   No credits yet is fine: say nothing rather than apologise.
6. **Thanks**, and what is included.

The pitch paragraph, for example: "Mara Penhale has kept the light at Gull Point since her father's
boat vanished. When the harbour board votes to shut the lighthouse, she has one winter to prove
the light still saves lives, and to find out why the board's chairman is so eager to see it dark.
But the closer she gets to the truth about that night, the clearer it becomes that her father was
not lost at sea. He was leaving."

Nonfiction queries pitch the proposal: the idea and why now, who will buy it, why this writer
(their expertise and the audience they already reach), and the proposal attached as the agent asks.

## The synopsis

The whole story, ending included, so an agent can see it holds together. Usually one page single
spaced (about 500 words), sometimes two: present tense, third person, the main plot and the main
character's change, three to five named characters (names in capitals the first time is a common
convention), no teasers, no dialogue, no praise. Write it from the finished book; if it will not
come, the story's shape may need work.

## The nonfiction book proposal

Usually 20 to 60 pages, in this order: an overview (the hook, what the book is, why now); the
readers (specific, with evidence that they buy such books); comparable titles (three to six recent
ones and how this differs); the writer's platform (the audience already reached: newsletter,
following, talks, press, credentials, with numbers); marketing (what the writer will actually do);
a chapter-by-chapter outline (a paragraph or two each); one to three sample chapters; length and
delivery date.

## Finding agents and presses

- Start from books like theirs: the acknowledgements thank agents and editors.
- Agency websites for current guidelines and who is open to queries; databases such as QueryTracker;
  agents' wish lists (#MSWL); deal reports (Publishers Marketplace, paid).
- Check each one: real sales to publishers the writer has heard of, membership of the Association of
  American Literary Agents (US) or the Association of Authors' Agents (UK), no fees.
- Query in batches of five to ten. Most replies take weeks or months, and many agents do not reply to
  a "no". If a batch brings no requests, rework the query; if requests bring no offers, rework the
  opening chapters.
- Querying several agents at once is normal. With an offer of representation, tell every agent
  still reading, and give them a week or two to respond.

## A submissions tracker

Offer a page kept in their Library with `save_page`: one row per submission, with columns for the
project, agent or magazine, what was sent (query, partial, full), date sent, their reply time,
status (sent, request, rejection, offer, withdrawn), a follow-up date and notes; a count of what is
out and what is overdue at the top. If they want, `schedule_task` reminds them when follow-ups fall
due. Rejections are normal: most queries get them, and each one tells them where the book went,
nothing about their worth.

## Traps

Money flows to the writer, not from them. Be direct about these:

- **Agents who charge** reading fees, evaluation fees or "marketing" fees, or who make an offer
  conditional on paying for an edit from a service they name. Reputable agents earn a commission
  (usually 15%, and up to 20% on translation and film deals) only when they sell the book.
- **Vanity presses** that charge thousands to publish and call it "partnership", "hybrid" or
  "co-publishing", with little selection, poor distribution and claims on the writer's rights.
  Some hybrid publishers are fair; check them against the Independent Book Publishers Association's
  criteria and Writer Beware.
- **Impersonators** posing as well-known agents, publishers, Hollywood scouts or "book marketing"
  firms, usually by unsolicited email or message, ending in a fee.
- **Contests** with high fees, unnamed judges, or terms that take rights to the entries. (Modest
  entry fees are normal for poetry and literary contests; rights grabs are not.)
- Before anyone is paid, search the name with "Writer Beware" (`web_search`).

## Contracts and rights

- Writers own the copyright from the moment they write; there is no need to register anything
  before querying, and agents do not steal ideas.
- Traditional deals: an advance paid in parts (signing, delivery, publication), earned back from
  royalties before more is paid. Ebook royalties from large publishers are commonly 25% of what the
  publisher receives; print royalties a smaller share of the cover price.
- Watch for: rights for the whole copyright term with no way to get them back if the book goes out
  of print, wide options on future books, non-compete clauses, rights the publisher will not use.
- A contract is read by the agent, or, without one, by someone who knows publishing contracts: the
  Society of Authors (UK) and the Authors Guild (US) review members' contracts. You explain what a
  clause means in general; you do not give legal advice on it.

## Self-publishing

The writer becomes the publisher and keeps the rights and most of each sale, and pays for
everything that makes the book good.

1. **Editing:** at least a copy edit and a proofread; a developmental edit for a first novel.
2. **Cover:** made for the genre (look at the bestsellers in its category) and readable as a
   thumbnail; by a designer, or made here with `generate_image` (follow image-prompts) if they accept
   the limits.
3. **The files:** an EPUB for the ebook stores (the ebooks skill makes and checks one when the
   Ebooks plugin is on); a print-ready PDF with the right trim size and bleed for print on demand.
4. **Metadata:** title, subtitle, series, a description that sells (hook, stakes, comparable
   feeling), categories and keywords readers search for.
5. **ISBN:** optional for ebooks at most stores; a print book needs one (the store's free one
   makes the store the listed publisher; their own ISBN keeps their imprint).
6. **Where:** Amazon KDP (with or without KDP Select, which requires the ebook be sold only on
   Amazon for 90-day terms), Apple Books, Kobo, Google Play Books, Barnes & Noble, directly or
   through an aggregator such as Draft2Digital; print through KDP Print or IngramSpark (bookshops and
   libraries order from Ingram).
7. **Price and launch:** compare prices in the category; a mailing list, advance reader copies for
   early reviews, and the next book matter more than ads at first.

Show honest sums with the store's current rates. For example, an ebook at £3.99 on Amazon's 70%
royalty earns about £2.75 a copy after a small delivery charge; 500 copies a year is about £1,400,
before the cost of editing and the cover. Most books sell modestly; series and backlists build income
over years.

## AI and honesty

Many magazines and publishers refuse work written by AI, and publishing contracts ask writers to
promise the work is their own. Amazon KDP asks whether a book contains AI-generated text, images or
translations. Help in ways that keep the writing theirs (questions, plans, notes, examples they
rewrite), and say plainly which parts you drafted, so they can answer these questions truthfully.
