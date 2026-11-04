---
name: social-media
description: Use when planning or writing posts for social media (LinkedIn, X, Instagram, Threads, Mastodon, Bluesky, Facebook, TikTok captions), adapting one message to several platforms, or making a content calendar.
category: writing
triggers: [social media, linkedin post, post on linkedin, instagram caption, instagram post, tweet*, content calendar, hashtag*, bluesky, mastodon, facebook post, social post*]
---

# Social media posts

A post has about a second to earn attention in a feed, then a few lines to be worth it. Know who it
is for and what you want them to do, lead with the hook, write for the platform's format, check it,
and leave the posting to the person.

## 1. The brief

- **Who posts:** a person, a shop, a company, a charity; their voice. Read a few of their past posts
  (and what did well, if they know) before writing, and match it.
- **Who reads:** who they are, what they care about, what they already know.
- **The one message** of this post, and **the one action** wanted: comment, click, sign up, buy,
  share, come along.
- **Platforms, timing and material:** photos, video, a link, a date, an offer.
- **Rules:** words the brand uses or avoids, claims it may not make, a sponsored post that needs
  marking as an advert.

## 2. Write it

- **The hook is the first line:** specific and concrete. A number, a surprising fact, a strong claim
  you can back up, a question the reader really has, the first line of a short story. Not "I'm
  excited to announce", "Big news!" or a line about the algorithm.
- **One idea per post.** Short lines and white space; concrete details over adjectives; the person's
  own voice, not a press release.
- **Shapes that work:** a story, then the lesson, then a question (LinkedIn); one claim and its proof
  (X, Bluesky); a picture that tells it and a caption that adds to it (Instagram); a plain update and
  an invitation (Facebook groups, local pages).
- **One call to action**, said plainly: "Book a table for Friday at the link." "Tell me what I've
  missed."
- **Hashtags sparingly:** a few specific ones that people in the field actually follow
  (#UXResearch, not #business), at the end, written in CamelCase so screen readers can say them.
  Mastodon is the exception: there, hashtags are how posts are found.
- **Emoji** only if the person's voice uses them; never as bullet points in every line.
- **Mentions** only of people and organisations involved, spelled as their handles are.
- Write two or three versions of the hook for the person to choose from.

Length limits, what shows before "more", picture sizes and each platform's habits are in
`references/platforms.md`. Limits change: check the platform's help when one matters.

## 3. Pictures and video

- A post with a good picture or a short video is seen more than one without. Native video and
  carousels (several pictures to swipe) often do well.
- Use the person's own photos when there are any; real beats generated for people, places and
  products. To make one, `generate_image` (see the image-prompts skill), in the platform's shape.
- Text on a picture: a few large words, readable on a phone.
- An infographic or a carousel that explains with facts follows the infographics skill; a YouTube
  thumbnail and its title, the youtube-thumbnails skill; the person's colours, fonts and voice, their
  brand kit (the brand-kit skill).
- **Alt text** for every picture: what it shows and why it is there, in a sentence or two. Captions
  on videos, since many people watch without sound.

## 4. One message, several platforms

Keep the message and change the form; never paste the same text everywhere.

| A café's new opening hours | Form |
| --- | --- |
| Instagram | a photo of the morning light at the counter; first line "We open at 7 now."; the hours; "Save this for your next early start" |
| Facebook (the local group or page) | a plain update with the hours, the address and a question: "What should we bake first thing?" |
| LinkedIn | only if there is a story for that audience: why the owner changed the hours for commuters |
| Mastodon or Bluesky | a short, friendly note with the hours, and alt text on the photo |

## 5. A content calendar

- **A rhythm the person can keep:** two good posts a week beat seven rushed ones.
- **Three to five themes** (pillars) to rotate, such as how-to, behind the scenes, customers' stories,
  news, opinion; mostly useful or interesting, the minority selling.
- **Dates that matter:** launches, events, holidays, the season of their trade.
- **Columns:** date, time, platform, theme, topic, hook, text, picture, link, call to action, status
  (idea, draft, approved, scheduled, posted), and results.
- Make it with `save_sheet` (they edit it and tick off status) or as a page with `save_page` with a
  week-by-week view. A weekly prompt is easy to add with `schedule_task`: "Every Monday at 9, draft
  this week's posts from the calendar for me to approve."

## 6. Check before it goes out

- Facts, numbers, names, dates and prices right; links work and go to the right page.
- Rights: pictures the person may use, permission from people shown, the advert marked as one.
- Read it out of context: could it hurt, mislead or land badly given today's news?
- Under the length limit, with line breaks in the right places and the hook inside what shows
  before "more".
- Alt text and captions done.
- Posting is the person's call. Hand over the text (and pictures) ready to paste; publish with a
  connected account only when they say so for this post.

## Pitfalls

- A first line that clears its throat ("So, I've been thinking…").
- The same text on every platform; a wall of hashtags.
- "Comment YES if you agree" and other bait that platforms push down.
- Claims that cannot be backed up; jumping on a sad or tense news story to sell something.
- Corporate or machine-sounding phrasing (the plain-language skill helps).
- Posting, or scheduling a post, without the person's go-ahead.
