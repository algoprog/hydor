---
name: image-prompts
description: Use when making or changing pictures with generate_image (or short videos with generate_video), such as an illustration, a scene, a poster, a logo idea, a product shot or a character, or editing someone's picture.
category: creative
triggers: [generate an image, make an image, create an image, make a picture, create a picture, draw me, an illustration, a logo for, image prompt, edit this photo, make a video, generate a video]
---

# Image prompts

An image model draws what the words make likely, so say what you want concretely: the subject first,
then the setting, composition, light, style and mood, with any text spelled out exactly. Look at what
comes back, change one thing at a time, and keep what works.

## 1. The brief

- **Where it will be used:** a post, a slide, a website banner, a printed poster, an app icon, a
  book page. That sets the shape (aspect ratio), the resolution, and whether text or a transparent
  background is needed.
- **What it must show,** and what it must not.
- **Style to match:** a photo or picture the person likes, their brand colours, earlier images in
  the same series.
- **Limits:** no likeness of a real person without their consent; no logos, characters or trademarks
  they do not own; nothing made to deceive (a fake event, a fake document).
- `generate_image` shows the person a short form with the model's settings (shape, resolution,
  quality, how many) and the price before anything is made. Give only the settings they asked for and
  leave the rest to the form; set `ask: false` only when they said to go ahead without it.

## 2. Write the prompt

In order of importance, in plain sentences (two to five), not a pile of keywords:

1. **Subject:** who or what, how many, what they look like and are doing. "A ginger cat in a knitted
   blue scarf, curled on a windowsill", not "a cat".
2. **Setting:** the place, time of day, weather, season; or a plain or blurred background.
3. **Composition:** close-up, medium or wide shot; eye level, low angle or from above; where the
   subject sits in the frame; empty space left for text ("plenty of empty sky at the top").
4. **Light:** soft window light, golden hour, overcast, studio softbox, neon, candlelight.
5. **Style and medium:** a photo (documentary, editorial, product), or an illustration (flat
   vector, watercolour, ink, gouache, 3D render, isometric, papercut, linocut), or a period look (Art
   Deco poster, 1970s travel poster). Describe qualities rather than naming a living artist.
6. **Colours:** a palette in words or hex codes ("muted sage, cream and one terracotta accent").
7. **Mood:** calm, playful, dramatic, cosy, clinical.

Say what you want rather than what you do not: "an empty beach" works better than "a beach with no
people" (many models draw what is named). A lens, angle and lighting vocabulary, and patterns for
common jobs, are in `references/prompt-patterns.md`.

> A flat-lay photo of a breakfast table seen from directly above: a white bowl of yoghurt with
> blueberries, a linen napkin, a glass of orange juice. Soft morning light from the left, gentle
> shadows, muted pastel colours. Empty space across the top third for a headline.

## 3. Shape and size

| Use | Aspect ratio |
| --- | --- |
| Square post, profile picture, icon | 1:1 |
| Instagram feed | 4:5 (3:4 when the model lacks it) |
| Stories, Reels, phone wallpaper | 9:16 |
| Slides, video thumbnail, website banner | 16:9 |
| Printed photo or poster | 2:3 or 3:4 |
| Wide banner | 21:9 |

Draft at 1K; make the final at 2K or 4K where the model offers it (sharper, slower, dearer). Print
needs about 300 pixels per inch: an A4 poster wants roughly 2480×3508, more than most models make,
so plan to upscale or keep text and logos out of the generated part.

## 4. Text in pictures

- Put the exact words in quotes, and say where and how: `the words "Spring Fair" in bold white
  sans-serif letters across the top`. One to six words work best.
- Check every letter of the result: models misspell, double letters and invent words.
- For anything with more text (a flyer, an infographic, a menu), make the picture without text and
  set the words in a layout tool: slides (`save_slides`), a page, or a document.
- A logo from an image model is a sketch of an idea. A real logo is redrawn as a vector, and its
  name is checked against trademarks.

## 5. Consistency across a series

- Write a fixed description once (a character sheet or a style line) and paste it word for word into
  every prompt; change only the scene. "Mila: a girl of about eight, short curly black hair, round
  glasses, yellow raincoat, red wellies. Flat vector illustration, thick soft outlines, palette
  #F2C14E, #2E4057, #E86A58 on cream."
- Give the best earlier picture as a reference (its path in `images`, for models that take
  pictures): "the same girl as in the picture, now feeding ducks at a pond".
- Keep the same model, shape and settings for the whole series.
- Keep the description and the chosen picture's path in a file next to the work, so later sessions
  can continue the series.

## 6. Editing a picture someone has

- Give its path in `images` and say exactly what changes and what stays: "Keep the person, their pose
  and the lighting exactly as they are; replace the background with a plain light-grey studio
  wall."
- One change per round; name the area plainly ("the sign above the door"), since there is no mask.
- To combine pictures, say which element comes from which: "the dog from the first picture on the
  sofa from the second".
- Edit only pictures the person has the right to change. No removing watermarks, and no edits that
  put a real person somewhere they were not, or make them say or do something they did not.

## 7. Look, then change one thing

- Open the result yourself (`generate_image` says where it saved it) and check it against the brief:
  hands and faces, the spelling of any text, the number of things asked for, shadows and reflections
  that make sense, nothing cut off at the edges, nothing in it that was not asked for.
- For a first round, suggest two to four variations at a modest quality (the person picks these on
  the tool's form), then refine the closest one.
- Turn vague feedback into concrete changes: "more modern" → "flat colours, a sans-serif headline,
  more empty space"; "warmer" → "golden-hour light, orange and cream tones".
- Change one thing per round and note what each change did. Tell the person what you checked and what
  is still not right.

## 8. Video with `generate_video`

- Far dearer than a picture (cents to dollars a second) and slower (minutes). Get a still right
  first with `generate_image`, then animate it, giving it as `first_frame`.
- Describe one shot: the scene, the one main movement, the camera (still, slow push in, pan left,
  handheld), the style and light; any sound or spoken words word for word, if the model makes sound.
  Four to eight seconds is plenty for most uses.
- Keep the movement simple. A longer piece is several short clips, each starting from the last
  one's final frame or from the same reference pictures.
- If it is still being made when the call returns, call again with its `job` to wait; nothing more is
  spent.

## Pitfalls

- A vague prompt: "a nice picture of a city".
- Several changes at once between rounds, so nobody knows which one helped.
- Long text inside the picture, and its spelling trusted without reading it.
- Naming what must not appear, which tends to make it appear.
- Real people's likenesses, other people's characters and logos, living artists' names.
- A video made before the still was right.
- Handing over a picture you have not looked at.
