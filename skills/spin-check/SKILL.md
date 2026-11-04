---
name: spin-check
description: Use when asked if a message is true, misleading or a scam (an ad, a viral post, a news claim, a pitch, a health, money or political claim, an offer too good to be true), or to fact-check it. Not for open research questions (research).
category: research
triggers: [fact-check*, fact check*, is this true, is this misleading, too good to be true, a scam, scammer*, is this legit*, phish*, debunk*, fake news, misinformation]
---

# Spin check

A persuasive message (an ad, a viral post, a pitch, a headline) can be true word for word and still
leave people believing something false. Split it into claims, check each against the source that can
settle it, find out what others say about the messenger instead of trusting its own pages, and give
each claim a verdict. Aim for a calibrated judgement, not reflexive distrust: a missing source is a
gap, not proof of a lie.

## 1. Get the message and what it wants

- Get the exact message: pasted text, a screenshot, a link (`read_page`), a PDF (`read_document`).
  Keep its exact words, who posted it, where and when.
- Say what it wants people to do: believe, buy, sign up, share, vote, pay, click, hand over details.
- Set the effort by what is at stake:

| Stakes | Do at least | Stop when |
| --- | --- | --- |
| Low: curiosity, a chat | Check the main claim at the source that can settle it | That source settles it, or you can say why it cannot |
| Medium: a purchase, a decision at work, sharing with many people | Trace the main claims to a primary source, plus one independent check | They agree, or you can say why they differ |
| High: a payment or transfer, a health choice, a legal step, passwords or account access, an accusation, anything hard to undo | Keep the evidence; confirm through a channel you find yourself; advise waiting until confirmed | It is confirmed, or the advice is "do not act yet" and who to ask |

- If the message asks for money, personal details, a code, remote access or a click, also follow
  `references/scams.md`. Never click its links, call its numbers, reply or pay to test it.

## 2. Split it into checkable claims

- One numbered line per claim; a single sentence often holds several. Keep the few that carry the
  message and skip the trimmings.
- Say what kind each one is:
  - **Fact:** checkable now or in records.
  - **Prediction:** judge its assumptions and how often such things happen.
  - **Cause** ("X caused Y", "this works"): needs more than a before-and-after or a story.
  - **Opinion:** not true or false, but the facts it leans on are.
  - **Motive** ("they want to…"): rarely settled by the message; do not guess.
- For each fact, prediction or cause, write: what it literally says; what a reasonable reader takes
  from it; the missing context that could change that (compared with what, out of how many, over what
  period, who qualifies, the typical result); the source that could settle it; what would show it wrong.
  The table in step 5 has the questions for common wording ("up to", "studies show", "act now").

## 3. Trace each claim to where it started

- Read laterally: leave the message's own site and search what others say about whoever is behind it
  (the name with "review", "scam", "owner", "funding", "criticism"). Its design, logos, credentials,
  testimonials and About page prove nothing.
- Find the origin of each claim: the study, the dataset, the record, the full speech, the first post.
  Ten articles repeating one press release are one source.
- **Quotes:** find the full original (the video, the transcript) and read what comes before and after.
- **Photos and videos:** look for the earliest copy (a reverse image search with Google Lens, TinEye or
  Bing; a search for the scene, the place and the date). Old pictures often come back as new ones.
- When you cannot trace something, say its origin is unknown and judge the claim as stated. Do not call
  a screenshot, quote or video fake from memory, or because a first search found nothing.
- Follow the research skill for the searching (`web_search`, `read_page`; any search tool works the
  same way).

## 4. Check it against the source that can settle it

| A claim about | Settle it with | Not with |
| --- | --- | --- |
| A study's result | The full paper and its data (the papers skill helps) | The abstract, a press release, an article about it |
| Health | Health authorities (the WHO, national health services and agencies), systematic reviews such as Cochrane's | Testimonials, a seller's page |
| A law, a rule, a benefit, a fine | The law itself, the regulator, official guidance, court records | A commentator's summary, a firm's marketing |
| A company, an investment, money | Filings, audited accounts, the financial regulator's register | A press release, an affiliate review |
| A product or an offer | The full terms and conditions, independent tests and reviews | The ad, a demo, testimonials |
| A public statistic | The statistics office's own table and its method | An infographic or a chart without its data |
| A news event | The primary record (official statements, documents) and outlets that reported it independently | One post or screenshot |

- Note for each check: the address, the date you read it, and whether it supports, contradicts or
  does not settle the claim.
- Before saying an official record does not exist, search the publisher's own site (`web_search` with
  `sites` set to its domain and the exact name or phrase). A guessed address or one failed search
  proves nothing.
- For numbers from tables, charts or PDFs, check which label each number belongs to in the original:
  copied text can shift columns.
- When the claimant controls the source, write "the company says", not "it is so".
- A message without sources is a finding about the message. It does not make the claim false: if you
  found the settling source yourself, judge by that.

## 5. Name the techniques, then look past them

Say which techniques the message uses and what each invites people to conclude. A technique is a
reason to check, never a verdict: the question is always what evidence would settle the claim.

| Technique | Sounds like | Ask |
| --- | --- | --- |
| Urgency or scarcity | "Act now", "only 3 left", "ends tonight" | What gets worse if you wait a day to check? |
| Authority | "Experts agree", "doctors recommend", a lab coat | Which experts, in which field, based on what? Independent? |
| Social proof | "Trusted by thousands", testimonials, before-and-after photos | Real, independent, typical? Paid for? |
| Repetition | "Everyone is saying", "shared a million times" | How many independent origins? |
| Evidence theatre | "Studies show", "clinically proven", graphs | Which study: who, how many, compared with what, how big an effect? |
| Hedge words | "Up to", "as low as", "from", "may help" | Under what conditions, how often, and what is actually promised? |
| Impressive numbers | "50% more", "doubles the risk", "97% agree" | Compared with what, out of how many, over what period? The absolute numbers? |
| A story as proof | "Since I started X, Y went away" | What else could explain it? Was anything compared? |
| Strong emotion | Fear, anger, disgust, flattery | What concrete claim is left without the emotion? |
| False choice | "Either this or disaster" | Which options or trade-offs were left out? |
| A flood of contradictory stories | Many versions at once, "just asking questions" | Does it explain anything, or only make everything feel uncertain? |

## 6. Look for the best evidence against

- Search for the strongest credible case against the message's conclusion: primary data, independent
  studies, official records, careful critiques, not just someone who disagrees. Try the claim with
  "fact check", "debunked", "criticism" or "study". Fact-checkers (Full Fact, AFP Fact Check, Reuters,
  PolitiFact, Snopes, national ones) are sources too: read their evidence, not only their label.
- When sources conflict, say why (different people, periods, measures, definitions, or who paid);
  do not force a yes or a no.
- Revisit every verdict after this pass.

## 7. A verdict for each claim

| Verdict | When |
| --- | --- |
| **Supported** | Direct, credible evidence supports the claim as stated |
| **False** | Direct, credible evidence contradicts it |
| **Misleading** | The words may be true, but what is left out or implied would lead a reasonable person to a wrong conclusion that matters |
| **Complicated** | The evidence is mixed or conditional, or answers a narrower question than the message suggests; say why |
| **Unsupported** | Checkable, but no adequate evidence is given or can be found |
| **Unknown** | The evidence that would decide it is not available (not public, not yet known, out of reach) |

- "False" needs evidence against the claim, not just a missing source.
- A key factual claim gets Supported, False or Misleading only after you have checked the source that
  can settle it; until then it is Unsupported, Unknown or Complicated, with the gap named.
- Then one verdict for the whole message, usually that of the claim it rests on.

## 8. Report, bottom line first

1. **Bottom line:** the overall verdict in one sentence, why, and what it means for what the person
   was about to do.
2. **Claim by claim:** a table with the claim, its verdict, the evidence (link and the date you read
   it) and what is still missing.
3. **How the message steers:** each technique and the conclusion it invites, without guessing motives.
4. **Next step:** the smallest check that would settle what remains (the bank on the number on the
   card, the regulator's register, the official statement when it comes).

- Keep it short: in the conversation, or `save_doc` when they want to keep or share it.
- When they will pass it on: lead with what is true, mention the false claim once with why it
  misleads, then repeat what is true.
- For health, legal or money decisions, the check says what the evidence shows; the decision belongs
  with a doctor, pharmacist, lawyer or regulated adviser.

## Pitfalls

- Calling a claim false because the message gave no source (that is Unsupported).
- Counting reposts, copies or one outlet's sister sites as confirmation.
- Trusting or dismissing a source for its look, its About page or the reviews on its own site.
- Checking a neighbouring claim: the study exists, but it shows something narrower.
- Relative numbers without absolute ones: "halves the risk" may mean 2 in 10,000 becoming 1.
- Judging by who said it (their politics, tone, confidence, body language) or guessing at motives.
- Passing on a fact-checker's, a helper's or another agent's verdict without opening its source.
- Collecting more sources after a claim is settled, or sounding sure when the evidence is not.
