---
name: youtube-thumbnails
description: Use when making, judging or improving a YouTube thumbnail and the title that goes with it, checking how it reads at small sizes, or testing thumbnails with YouTube's Test & Compare. Not for other pictures (image-prompts).
category: creative
triggers: [youtube thumbnail*, thumbnail for my, thumbnail idea*, thumbnail design*, thumbnail text, title and thumbnail, thumbnail and title, youtube title*, test & compare, test and compare, clickbait thumbnail]
---

# YouTube thumbnails

The thumbnail and the title are one promise: together they tell the right viewer what the video
gives them, and the video keeps that promise in its first moments. Start from what the video really
delivers, make three clearly different ideas, give each one focal point that still reads at the size
of a fingernail, never fake proof, check it beside its title among real neighbouring videos, and
judge it later by watch time, not clicks alone. Prompts for the picture follow the image-prompts
skill.

## 1. Find the real promise

- Look at what there is: the video or its outline, script or transcript, the working title, the best
  moments with their times, frames and photos from the shoot. The media-tools plugin can take a frame
  at a given time; the transcribe plugin turns the speech into text.
- Write one sentence: "For [viewer], this video delivers [the payoff], shown by [the moment that
  proves it]." If what you have cannot fill it, ask for those three things; never invent stakes,
  results or scenes.
- Note who the viewer is and where they meet the video: the home feed, search, suggested beside
  another video, subscriptions, a TV.

## 2. Plan the title and the thumbnail together

- Each idea is a pair. The title says what the picture cannot; the picture shows what the title
  cannot: the result, the contrast, the feeling, the question. The picture never repeats the title.
- Words on the picture are optional: none, or one to four large ones that add something.
- The title is specific and true, under YouTube's 100 characters, with the words that matter early:
  narrow lists cut titles after two lines.

## 3. Three clearly different ideas

- Each tests a different idea, not a new font or colour: the result against the process; a person's
  reaction against the object itself; before and after against one striking image; a question
  against its answer.
- For each, write down: the one thing seen first; the question or feeling it should raise; the
  moment in the video that backs it; its title and any words on it; its risks (truth, rights,
  cropping, small size).
- For mechanisms, look at a handful of thumbnails on the same topic and the channel's own best ones
  (`web_search`, or YouTube itself): note what catches the eye (scale, contrast, an expression, a
  reveal, an odd angle). Borrow the mechanism; never the image, the layout, the branding or a face.
- Show the three as short descriptions with their titles (`show_html` cards the person can click) and
  let them choose before you make finished pictures.

## 4. Make it

- One focal point, large. Strong contrast in lightness, not only in colour, between it and the
  background; a simple background; a face, if there is one, close and large, with an expression
  that really happens in the video.
- Leave the bottom-right corner free (YouTube puts the video's length there) and keep important
  things away from the edges.
- Start from real material: a frame or a photo from the shoot that the person may use. A face is a
  real photo of that person, with their consent, never a likeness made with `generate_image`.
- With `generate_image`: 16:9; the subject and its action, the camera distance and angle, the light,
  the contrast, a plain area where words will go. To improve a real frame, give it in `images` and
  say exactly what changes ("brighten it and blur the background; keep the person and what they hold
  exactly as they are"). Never change what happened.
- Words: ask the model for one to three in quotes and check every letter at full size; or, for exact
  words in a chosen font, make the picture without them and set them over it in a page rendered to
  the file (the page and its commands: `references/make-the-file.md`).

## 5. The file

- 16:9, at least 1280×720. As of November 2026, YouTube's help page asks for as large as possible
  (3840×2160 recommended, at least 640 wide), JPG or PNG, under 2 MB when uploaded from the phone app
  and under 50 MB from a computer, and a verified account. Limits change: check
  https://support.google.com/youtube/answer/72431 before relying on them; do not quote them from memory.
- Larger than 1280×720 only when the picture itself is that sharp. In Test & Compare, if any variant
  is under 1280×720, all of them are shown at 854×480.
- Check the file before handing it over: `file thumb.jpg` shows its pixels, `wc -c < thumb.jpg` its
  size in bytes (commands for making and checking it in `references/make-the-file.md`).
- Shorts are 9:16 and get their thumbnail in YouTube Studio on a computer. A vertical video with a
  16:9 thumbnail gets an automatic 4:5 one on the phone's Home, Explore and Subscriptions.

## 6. Preview it beside its title, among its neighbours

- Fill in the page in `references/preview-page.md` and show it with `show_html`: each candidate (a
  320-pixel copy pasted in as base64) with its title, among four real videos on the same topic (found with `web_search`; their
  thumbnails load from YouTube by the video's id), at a computer's home feed (360 px), the up-next
  list beside a video (168 px) and a phone (a 360 px column), in YouTube's dark and light looks, with
  the length badge and titles cut to two lines as YouTube cuts them.
- With many candidates, save the same page as a file beside the thumbnails, with their file names in
  place of the base64, and look at it with `ui_screenshot` (phase `check`, viewport `both`).
- Ask the person, and someone who has not seen the video: What do you notice first? What does the
  video promise? Can you read the words? Does it stand out from its neighbours? Would the right
  viewer feel it is for them? Fix what fails and look again.

## 7. Keep it honest

- The video delivers what the pair promises, and early: many viewers leave when the first
  half-minute does not show it coming.
- No fake proof: no invented results, screenshots, quotes or headlines; no real person shown doing,
  saying or endorsing what they did not; no fake police, news or "breaking" looks; no arrows or
  circles around things that are not in the video.
- YouTube's spam rules forbid titles and thumbnails "maliciously misleading" viewers (their example: a
  title offering a full match for a video of a clip), and thumbnails with sexual, violent or hateful
  images can be removed and bring a strike.
- Only pictures, fonts and logos the person may use. Asked for a deceptive version, say why not and
  offer an honest one that is just as strong.

## 8. Test and learn

- **Test & Compare** in YouTube Studio, on a computer, with advanced features on: up to three
  thumbnails, titles, or title-and-thumbnail pairs, for long videos and live archives; not Shorts,
  scheduled live streams, Premieres until they end, or videos made for kids, for mature audiences,
  or private. It picks by watch-time share, not clicks, and reports a winner, "performed the same"
  or "inconclusive", usually within two weeks. Changing the title or thumbnail stops the test.
- Make variants that differ in one clear idea each, and write down what you expect before the result.
- "Performed the same" or "inconclusive" means no winner: keep the most accurate one and say so; do
  not crown one by its click-through rate.
- Without Test & Compare, a before-and-after change is an observation, not proof: audiences and
  traffic shift. More clicks with less watch time, or a weaker first half-minute, means the pair
  over-promises: fix the pair or the opening; do not make it more dramatic.
- Reading the numbers, and a log to keep: `references/testing.md`.

## Pitfalls

- A thumbnail that repeats the title.
- Clutter: arrows, badges, several faces, a sentence of text.
- Words too small, or under the length badge.
- Three variations that are really one idea.
- Judging it only at full size, or alone instead of among its neighbours.
- A promise the video does not keep; fake faces, quotes or results.
- Calling an inconclusive test a win; chasing clicks at the cost of watch time.
- Upload limits recalled from memory instead of checked.
