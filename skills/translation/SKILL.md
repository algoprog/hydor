---
name: translation
description: Use when translating a document, message, web page, app text or subtitles into another language, or checking a translation. Not for rewording a text in the same language (plain-language).
category: writing
triggers: [translate this, translate it, translate the, translate into, translate to, translation of, translated into, translated version, localis*, localiz*, into english]
---

# Translation

A good translation says what the original says, the way a native writer of the target language
would say it to the same kind of reader. Faithful in meaning and tone, natural in form, nothing added
and nothing lost. Settle the brief and the key terms first, translate, then check with fresh eyes,
and for text that matters, with a back-translation.

## 1. The brief

- **Languages, and which variety:** Brazilian or European Portuguese; Spain or Latin American
  Spanish; Simplified or Traditional Chinese; US or UK English; Swiss German (no ß). Ask when it is
  not clear from the reader.
- **Reader and purpose:** information, a legal or official text, marketing, an interface, subtitles,
  a personal letter. This decides how close to stay: legal and official text close to the source;
  slogans and adverts adapted so they work (transcreation), with the change explained.
- **Register:** formal or informal address (tu or vous, du or Sie, tú or usted, 你 or 您), and the
  politeness level in languages that mark it (Japanese, Korean).
- **Format to keep:** Markdown, HTML, a Word file, subtitle timings and line lengths, interface
  strings with length limits and placeholders.
- **What already exists:** a glossary, a style guide, earlier translations, the brand's official
  names in that language. Reuse them.

## 2. Prepare

- Read the whole text before translating a line. Know what it is about; look up terms of the field.
- **A glossary** for anything that recurs: key terms, product and feature names, job titles, fixed
  phrases, each with its chosen translation (or "keep as is"). Use it the same way everywhere. For
  a long or repeated job, keep it in a file next to the work; the format is in
  `references/locale-conventions.md`.
- **What stays as it is:** people's names, brand and product names (unless an official local name
  exists), code, commands, file paths, variables and placeholders (`{name}`, `%s`, `{{count}}`),
  web addresses, email addresses, and titles of works without an official translation (keep the
  original, with a translation in brackets the first time if it helps).
- **Ambiguities:** a "you" that may be one person or several, a gender the source does not give, an
  idiom, a pun, a cultural reference, a term with two meanings. Resolve each from context; where you
  cannot, choose, and list it in your notes.

## 3. Translate

- Translate meaning, sentence by sentence, not word by word. Rebuild sentences the way the target
  language builds them: word order, sentence length, what it leaves implicit.
- Keep the register and tone the same from start to end.
- **Idioms:** an equivalent idiom, or the plain meaning. **Puns and wordplay:** an equivalent if one
  exists; otherwise the meaning, with a note that the play on words is lost.
- **Cultural references:** keep them, explain briefly, or adapt (marketing), as the brief says.
- **Locale conventions** change with the language: number separators (1,234.56 or 1.234,56 or
  1 234,56), dates (05/04 is 5 April in most places and May 4 in the US), 12 or 24-hour time,
  currency symbol position (€12.50 or 12,50 €), quotation marks (« », „ “, 「」), the space before
  : ; ! ? in French. A table by language is in `references/locale-conventions.md`.
- **Amounts and units:** write them in the target format, but do not convert currencies or units
  unless asked; when it helps the reader, add the converted value in brackets.
- **Formatting:** keep headings, lists, emphasis, tables and links (translate the link text, keep the
  address). Leave code and placeholders untouched, and keep line breaks in interface strings and
  subtitles.
- **Length:** German and French often run 20 to 30% longer than English, Chinese and Japanese much
  shorter. Where space is limited (buttons, subtitles, slides), shorten without losing meaning and
  say where you did.

## 4. Check

1. **Side by side, sentence by sentence:** nothing missing, nothing added. Check every number, name,
   date and negation; a lost "not" is the most dangerous error a translation can make.
2. **The translation alone, as a native reader:** does it sound natural? Fix calques (source
   sentence shapes showing through) and false friends (actual and *actuel*, eventually and
   *eventualmente*, embarrassed and *embarazada*).
3. **Back-translation** for text with consequences (legal, medical, safety, contracts, public
   claims): translate the result back into the source language without looking at the original,
   then compare meanings. Every difference is a question to resolve. A child session or a second
   agent, given only the translation, does this most honestly.
4. **Consistency:** glossary terms used the same way throughout; the same register throughout.
5. **Format:** count the placeholders, tags and links in both versions; they must match.

## 5. Deliver

- The translation in the same format as the original: Markdown in the conversation, a document with
  `save_doc`, a Word file (the word-documents skill keeps the layout), subtitles with their timings.
- Then short notes: the variety and register chosen, ambiguities and how you resolved them, what was
  left untranslated and why, anything the reader should check (legal terms, a lost pun).
- For legal, medical, immigration or other official use, say plainly that this is not a certified
  translation: authorities often require a sworn or certified translator, and anything with legal
  consequences deserves a professional review.
- A long text: translate in sections, keep the glossary growing, and reread the joins between
  sections.

## Pitfalls

- Word-for-word translation: correct words in a foreign shape.
- Switching between formal and informal address halfway through.
- Translating names, code, placeholders or web addresses.
- "Improving" or shortening the source without saying so.
- Converting currencies and units nobody asked to convert.
- A lost negation or a changed number.
- Guessing at an ambiguity silently instead of flagging it.
