# Rewrites: examples, word swaps, tells, and the readability formulas

## Before and after, move by move

**Lead with what matters**
- Before: "Following a review of your application and the documents you provided, and in line with our
  eligibility criteria, we are pleased to inform you that your application has been approved."
- After: "Your application is approved. We checked it and your documents against our rules, and you
  qualify."

**Name who does what**
- Before: "Payment must be received within 30 days of the invoice date."
- After: "You must pay within 30 days of the invoice date." ("Must" stays "must".)

**Talk to the reader**
- Before: "Applicants are required to provide proof of address."
- After: "You must send us proof of your address."

**One idea per sentence**
- Before (53 words): "The new system, which was introduced in March following a lengthy consultation
  with staff and which replaces the paper forms that were previously used for all leave requests, allows
  employees to submit requests online, although requests for more than ten days still need to be
  approved by a manager before they are confirmed."
- After: "Since March, you can ask for leave online. The new system replaces the paper forms and was
  agreed with staff. Requests for more than ten days still need a manager's approval before they are
  confirmed."

**Jargon**
- Before: "Your claim has been escalated to Tier 2 for adjudication."
- After: "We've passed your claim to a senior assessor (our 'Tier 2' team), who will decide on it." The
  term stays, explained once, because the reader will see it on later letters.

**Concrete, with facts you have**
- Before: "We will respond in due course."
- After: "We will reply within [to check: how many working days?]." Never invent the date to make the
  sentence concrete; ask for it.

**Positive**
- Before: "Do not fail to keep your receipt." After: "Keep your receipt."
- Before: "This is not an uncommon problem." After: "This is a common problem."

**Cut what says nothing**
- Before: "It is important to note that the office will be closed on Monday." After: "The office is
  closed on Monday."
- Before: "We would like to take this opportunity to thank you for your patience." After: "Thank you
  for waiting."

## Word swaps

| Instead of | Try |
| --- | --- |
| accordingly, consequently | so |
| additional | more, extra |
| advise (to tell) | tell |
| approximately | about |
| assist, facilitate | help |
| at this point in time | now |
| commence, initiate | start |
| comply with | follow, keep to |
| demonstrate | show |
| due to the fact that | because |
| endeavour | try |
| ensure | make sure |
| expedite | speed up |
| in accordance with | under, as … says |
| in order to | to |
| in the event that | if |
| in relation to, with regard to, regarding | about |
| indicate | show, say |
| notwithstanding | despite, even if |
| obtain | get |
| prior to | before |
| provide | give, send |
| purchase | buy |
| remuneration | pay |
| request (to ask for) | ask for |
| require | need |
| reside | live |
| subsequently | later, then |
| sufficient | enough |
| terminate | end, stop |
| utilise | use |

A swap is right only when the plain word means the same thing in context. In a contract, "terminate"
may be a defined term: leave it.

## Tells of corporate and machine-written text

**Openers and closers:** Great question! · Certainly! · In today's fast-paced world · In an
ever-evolving landscape · Let's dive in · It's worth noting that · In conclusion · Ultimately · I hope
this helps · Feel free to reach out.

**Verbs:** delve · leverage · harness · unlock · unleash · empower · elevate · foster · streamline ·
spearhead · underscore · navigate (not a route) · embark · revolutionise · reach out (for "contact") ·
circle back · touch base.

**Adjectives and nouns:** robust · seamless · cutting-edge · state-of-the-art · pivotal · crucial ·
vital · vibrant · comprehensive · holistic · myriad · plethora · transformative · game-changing ·
best-in-class · world-class · tapestry · realm · journey (not a trip) · landscape (not land) ·
synergy · bandwidth (for "time") · learnings · deliverables · solutions (for "products").

**Shapes:**
- "It's not just X, it's Y." / "Not only X but also Y" used for emphasis rather than meaning.
- Everything in threes: three adjectives, three examples, three-part sentences.
- "Whether you're a beginner or an expert, …"
- A rhetorical question the text answers itself: "The result? A 20% gain."
- Every paragraph closing with a one-line moral.
- Long dashes strung through sentences instead of full stops and commas.
- Stacked hedges: "may potentially", "could possibly help to".
- Paragraphs all the same length, sentences all the same rhythm.
- Bold on a phrase in every paragraph; emoji as bullet points.

The fix is nearly always the same: say the specific thing. "Our robust, seamless solution empowers
teams" → "The app keeps working when the connection drops, and nobody has to install anything."
If you cannot name the specific thing, the sentence had nothing in it: cut it.

## Readability formulas (English)

- **Flesch reading ease** = 206.835 − 1.015 × (words ÷ sentences) − 84.6 × (syllables ÷ words).
  Higher is easier: 60 to 70 is plain English, 30 and below is hard going.
- **Flesch-Kincaid grade** = 0.39 × (words ÷ sentences) + 11.8 × (syllables ÷ words) − 15.59. About
  the US school grade that can read it: 6 to 8 for the general public.

A quick estimate in Python (the `textstat` package, if it is installed, counts syllables more
carefully; neither is exact):

```python
import re

def readability(text):
    sentences = max(1, len(re.findall(r"[.!?]+(?=\s|$)", text)))
    words = re.findall(r"[A-Za-z][A-Za-z'-]*", text)

    def syllables(word):
        w = word.lower().strip("'-")
        n = len(re.findall(r"[aeiouy]+", w))
        if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1:
            n -= 1  # a silent final e
        return max(1, n)

    n_words = max(1, len(words))
    wps = n_words / sentences
    spw = sum(syllables(w) for w in words) / n_words
    return {
        "words per sentence": round(wps, 1),
        "reading ease": round(206.835 - 1.015 * wps - 84.6 * spw, 1),
        "grade": round(0.39 * wps + 11.8 * spw - 15.59, 1),
    }
```

Other languages have their own formulas (Fernández Huerta for Spanish, Amstad for German); without
them, use average sentence length and how everyday the words are.
