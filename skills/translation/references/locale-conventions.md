# Locale conventions, glossary and false friends

## Numbers, dates, money and quotation marks

The usual conventions. Style guides and organisations vary: when the client has a style guide, it
wins. "␣" marks a space (in French and some others, ideally a narrow no-break space, so the number or
mark never ends up alone at the start of a line).

| Locale | Number | Date | Time | Money | Quotation marks | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| English (US) | 1,234.56 | 11/3/2026 (month first) | 3:30 PM | $1,234.56 | “ ” ‘ ’ | Letter paper, inches, pounds, °F; the week starts on Sunday |
| English (UK) | 1,234.56 | 3/11/2026 (day first) | 15:30 or 3.30pm | £1,234.56 | ‘ ’ “ ” | Miles for roads, otherwise mostly metric |
| French (France) | 1␣234,56 | 03/11/2026 | 15 h 30 or 15:30 | 1␣234,56␣€ | « ␣ » | A space before ; : ! ? and % |
| German | 1.234,56 | 03.11.2026 | 15:30 Uhr | 1.234,56␣€ | „ “ | Nouns capitalised; Switzerland: ss for ß, « », 1’234.56 |
| Spanish (Spain) | 1.234,56 | 03/11/2026 | 15:30 | 1.234,56␣€ | « » “ ” | Opening ¿ and ¡ |
| Spanish (Mexico) | 1,234.56 | 03/11/2026 | 15:30 or 3:30 p. m. | $1,234.56 | “ ” | Opening ¿ and ¡ |
| Portuguese (Brazil) | 1.234,56 | 03/11/2026 | 15h30 or 15:30 | R$␣1.234,56 | “ ” | |
| Portuguese (Portugal) | 1␣234,56 | 03/11/2026 | 15:30 or 15h30 | 1␣234,56␣€ | « » | |
| Italian | 1.234,56 | 03/11/2026 | 15:30 | 1.234,56␣€ | « » “ ” | |
| Dutch | 1.234,56 | 3-11-2026 | 15:30 | €␣1.234,56 | “ ” ‘ ’ | |
| Polish | 1␣234,56 | 3.11.2026 | 15:30 | 1␣234,56␣zł | „ ” | |
| Swedish | 1␣234,56 | 2026-11-03 | 15:30 or 15.30 | 1␣234,56␣kr | ” ” | |
| Greek | 1.234,56 | 3/11/2026 | 3:30 μ.μ. or 15:30 | 1.234,56␣€ | « » | The question mark is ";" |
| Russian | 1␣234,56 | 03.11.2026 | 15:30 | 1␣234,56␣₽ | « » „ “ | |
| Turkish | 1.234,56 | 03.11.2026 | 15:30 | ₺1.234,56 | “ ” | Dotted İ i and dotless I ı: upper and lower case differ from English |
| Chinese (mainland, Simplified) | 1,234.56 | 2026年11月3日 | 15:30 | ¥1,234.56 | “ ” | Full-width punctuation (，。：！？); large numbers in 万 (10,000) and 亿 (100 million) |
| Chinese (Taiwan, Traditional) | 1,234.56 | 2026年11月3日 or 2026/11/3 | 下午3:30 or 15:30 | NT$1,234.56 | 「」『』 | Full-width punctuation; 萬 and 億 |
| Japanese | 1,234.56 | 2026年11月3日 or 2026/11/03 | 15:30 or 午後3時30分 | ¥1,234 (no decimals) | 「」『』 | Full-width 、。; 万 and 億 |
| Korean | 1,234.56 | 2026. 11. 3. | 오후 3:30 | ₩1,234 (no decimals) | “ ” | Spaces between words, unlike Chinese and Japanese; 만 and 억 |
| Arabic | ١٬٢٣٤٫٥٦ or 1,234.56 | 03/11/2026 | 3:30 م | 1,234.56␣ر.س. (varies by country) | « » “ ” | Right to left; ، and ؟; Eastern Arabic digits in some countries, Western in others |
| Hindi (India) | 12,34,567.89 | 03/11/2026 | 3:30 PM | ₹12,34,567.89 | “ ” | Lakh (1,00,000) and crore (1,00,00,000) grouping, also in Indian English |

Spanish, Portuguese and Polish often leave four-digit numbers ungrouped (1234,56) and group from five
digits (12.345,67); follow the text's own habit or the style guide.

Also by locale:

- **Names:** family name first in Chinese, Japanese, Korean and Hungarian. Keep the person's own
  order and spelling when they have a preferred one.
- **Addresses and phone numbers:** keep them as they are written for the country they belong to;
  they are not translated, only formatted for the post or the phone network of that country.
- **Paper and measures:** A4 almost everywhere, US Letter in the US and Canada. Metric almost
  everywhere; the US uses its customary units, the UK mixes (miles, pints, stones for body weight).
- **Week and calendar:** the week starts on Monday in most of Europe, on Sunday in the US; some
  countries use other calendars alongside the Gregorian one (the Hijri calendar, Japan's era years).

## A glossary

Keep it as a table in a file beside the work, or at the top of a long job. One row per term.

```markdown
| Source | Target | Notes | Example in context |
| --- | --- | --- | --- |
| dashboard | tableau de bord | noun, masculine; not "dashboard" | Ouvrez le tableau de bord. |
| sign in | se connecter | verb; the button says "Connexion" | Connectez-vous avec votre e-mail. |
| Naget Agent | Naget Agent | product name: never translated | |
| you | vous | formal throughout this client's texts | |
```

Do not translate: product and brand names, code, placeholders, file paths, web and email addresses.
List any others for the job under the table.

## False friends that cause real errors

| Pair | English word | Looks like | Actually means |
| --- | --- | --- | --- |
| English–Spanish | actual | *actual* | current |
| English–Spanish | embarrassed | *embarazada* | pregnant |
| English–Spanish | library | *librería* | bookshop |
| English–French | actually | *actuellement* | currently |
| English–French | eventually | *éventuellement* | possibly, if need be |
| English–French | to demand | *demander* | to ask |
| English–German | to become | *bekommen* | to get, to receive |
| English–German | gift | *Gift* | poison |
| English–German | chef | *Chef* | boss |
| English–Italian | parents | *parenti* | relatives |
| English–Italian | argument | *argomento* | topic |
| English–Portuguese | to pretend | *pretender* | to intend |
| English–Portuguese | exquisite | *esquisito* | strange |
| English–Dutch | eventually | *eventueel* | possibly |

## A back-translation, briefly

1. Translate the source into the target language.
2. Without looking at the source, translate that result back into the source language (ideally done
   by someone, or an agent, who has not seen the source).
3. Compare the back-translation with the source, sentence by sentence, for meaning, not wording.
4. Every difference in meaning is either an error in the translation or an ambiguity in the source:
   fix the first, flag the second.
