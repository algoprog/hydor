# Platforms, sizes and a calendar

Limits and habits as they stood in 2026. Platforms change them often: when a number matters (a
caption that must fit, a picture that must not be cropped), check the platform's own help pages.

## By platform

| Platform | Length | What shows before "more" | Pictures and video | Hashtags | Links | What works |
| --- | --- | --- | --- | --- | --- | --- |
| LinkedIn | 3,000 characters | about two or three lines (roughly 200 characters on a computer, fewer on a phone) | 1200×627 landscape, 1080×1080 square, 1080×1350 portrait; PDF carousels; short video | 0 to 3, at the end | many report less reach for posts with outside links; some put the link in the first comment | a work story with a lesson, specific numbers, an honest opinion, a question at the end |
| X | 280 characters (much longer for paying accounts); threads for more | everything up to the limit | up to 4 pictures; 16:9 (1600×900) shows uncropped | 0 to 2 | shown as a card | one sharp point with proof; a thread whose every post stands alone |
| Instagram | 2,200 characters | about 125 characters | feed 1080×1350 (4:5) or 1080×1440 (3:4, the profile grid's shape), 1080×1080 square; Stories and Reels 1080×1920 (9:16); carousels | 3 to 5 specific ones; more no longer helps | not clickable in captions: "link in bio", or a link sticker in Stories | the picture is the post; a caption that adds something; carousels people save |
| Threads | 500 characters | everything | pictures and short video | one topic tag | clickable | conversational, quick replies |
| Facebook | very long allowed | about three lines | 1200×630 for link previews; 1080×1350 portrait | 0 to 2 | fine | community, local news, events, groups; short posts and questions |
| Mastodon | 500 characters on most servers (some allow more) | everything | up to 4 pictures; alt text is expected | the main way posts are found: CamelCase | fine | plain, friendly, no hard sell; content warnings (CW) for spoilers and heavy topics |
| Bluesky | 300 characters | everything | up to 4 pictures, alt text | few, less central than on Mastodon | shown as a card | conversational, like early Twitter |
| TikTok | caption up to 4,000 characters | a line or two | 1080×1920 vertical video | 3 to 5 | in the profile | a hook in the first one or two seconds, words on screen, trends used with care |
| YouTube Shorts | title and description | the title | 1080×1920 vertical, up to 3 minutes | a few | in the description | a clear promise in the first seconds |

## Alt text

- Say what the picture shows and why it is there, in one or two sentences: "Our head baker lifting a
  tray of cinnamon buns out of the oven at 6 a.m."
- Text inside the picture goes into the alt text word for word.
- Not "image of" or "photo of" (screen readers say that already), and not a list of keywords.

## Accessibility in the text

- Hashtags in CamelCase (#SmallBusinessSaturday), so screen readers read the words.
- No "fancy fonts" made of maths symbols: screen readers spell them out letter by letter, or skip them.
- Emoji at the end of a line rather than in the middle of words; a screen reader reads each one's name.

## A content calendar

Columns for the sheet (`save_sheet`):

| Date | Time | Platform | Theme | Topic | Hook | Text | Picture | Link | Call to action | Status | Results |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-10 | 08:00 | Instagram | Behind the scenes | The 6 a.m. bake | "This is what 6 a.m. smells like." | … | buns-tray.jpg | | Save for later | Draft | |
| 2026-11-12 | 12:30 | LinkedIn | Lessons | Why we open earlier | "We lost 40 customers a week before 8 a.m." | … | | menu page | Ask: what would you change? | Idea | |
| 2026-11-14 | 18:00 | Facebook | Community | Saturday market stall | "Find us at the Saturday market from 9." | … | stall.jpg | | Come and say hello | Approved | |

Status runs Idea → Draft → Approved → Scheduled → Posted. Results: what the platform's own statistics
show after a week (saves, comments, clicks), so the next month can lean on what worked.

Themes to rotate, for example: how-to and tips; behind the scenes; customers' stories (with their
permission); news and launches; opinion. Most posts useful or interesting, a minority asking for the
sale.

## A weekly drafting run

With `schedule_task`, for example every Monday at 09:00:

> Read my content calendar (the spreadsheet titled "Content calendar" in my Library; get_page lists
> them). For each post this week with status Idea or Draft, write the post for its platform, with
> two versions of the hook and alt text for any picture, following the voice of my last approved
> posts. Put the drafts in the Text column and set the status to Draft. Do not post or schedule
> anything. Finish with a one-line summary of what is ready for me to approve.
