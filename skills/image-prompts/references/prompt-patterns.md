# Prompt patterns and vocabulary

## Patterns for common jobs

Fill in the angle brackets; leave out what does not apply.

**Product shot**
> A studio photo of <product, with its colour and material> on <surface>, <angle: three-quarter view
> at eye level / from above>, <light: soft diffused light from the left, a gentle shadow>, <background:
> seamless light grey>. Sharp detail on <the part that matters>. <Aspect ratio>.

**Portrait of an invented person** (never a real one)
> A natural-light portrait of <age, look, clothing>, <expression>, <setting>, shot at eye level with
> an 85mm lens, shallow depth of field, <light>. <Mood>.

**Illustration for a story or a lesson**
> A <medium: watercolour / flat vector / gouache> illustration of <scene>, <who is doing what>,
> <composition>, <palette>, <mood>, for a children's book page, with simple shapes and no text.

**Poster or banner background** (the words are added later)
> <Scene> in the style of a <period> poster, bold simple shapes, <palette>, with a large empty area
> <where> for a headline. No text.

**Food**
> <Dish> on <plate or board>, <angle: overhead / 45 degrees>, <light: soft daylight from a window>,
> <props: linen, a fork, crumbs>, <palette>, appetising and natural, not glossy.

**Interior or architecture**
> A wide-angle photo of <room>, <style of the room>, <time of day and light>, <what is in it>,
> straight vertical lines, natural colours.

**Icon set** (one prompt per icon, the same style line every time)
> A simple icon of <object>, <style line: flat, two colours #1D4ED8 and #F2C14E, rounded 4px
> strokes, no shading>, centred on a <transparent / white> background, 1:1.

**Diagram-like picture** (keep exact labels out of the image; add them afterwards)
> An isometric illustration of <process or place>, clean flat shapes, <palette>, plenty of white
> space, no words.

## Vocabulary

**Shot size:** extreme close-up · close-up · medium shot · full-length · wide shot · aerial view.

**Angle:** eye level · low angle (subject looks powerful) · high angle · overhead or flat lay · three-
quarter view · profile · over the shoulder.

**Lens and focus:** 24mm wide (space, interiors) · 35mm (street, everyday) · 50mm (natural) · 85mm
(portraits, flattering) · macro (tiny details) · shallow depth of field (blurred background) · deep
focus (everything sharp).

**Light:** soft window light · golden hour · blue hour · overcast · harsh midday sun · backlit · rim
light · studio softbox · ring light · candlelight · neon · moonlight · fog.

**Photo looks:** documentary · editorial · product · lifestyle · film grain · long exposure ·
black and white · high key (bright, few shadows) · low key (dark, dramatic).

**Illustration looks:** flat vector · line art · watercolour · gouache · ink and wash · charcoal ·
pastel · papercut · linocut · risograph · pixel art · isometric · low-poly 3D · clay 3D · storybook.

**Period and design looks:** Art Nouveau · Art Deco · Bauhaus · mid-century modern · 1970s travel
poster · Swiss design · ukiyo-e woodblock (describe the qualities: flat colour, bold outlines).

**Mood words that steer:** serene · cosy · playful · whimsical · nostalgic · eerie · dramatic ·
clinical · luxurious · rugged.

## A character or style sheet

Paste it into every prompt of a series, unchanged.

```text
Character: Mila, a girl of about eight, light brown skin, short curly black hair, round red glasses,
a yellow raincoat with big buttons, red wellington boots.
Style: flat vector illustration, thick soft dark-blue outlines, no gradients, palette #F2C14E
(yellow), #2E4057 (navy), #E86A58 (coral), #F7F3E9 (cream background), gentle rounded shapes.
Format: 4:5, Mila always shown full-length, the same proportions in every picture.
```

## Edits, phrased so the model keeps the rest

- "Keep everything exactly as it is, except: …"
- "Change only the colour of the sofa to deep green; keep its shape, the room and the light."
- "Remove the bin on the right and fill the space with the brick wall that is already there."
- "Extend the picture to the left to make it 16:9, continuing the beach and the sky."
- "Make it look like late afternoon: warmer light from the right, longer shadows; nothing else
  changes."

## Video shots

**Camera:** static · slow push in · pull back · pan left or right · tilt up · orbit around the
subject · handheld · drone rising.

**Motion:** one main movement, said plainly: "steam rises from the cup", "she turns towards the
camera and smiles", "waves roll in and wash over the sand".

**Pattern:**
> <Shot size> of <subject> <doing one thing>, <setting>, <camera movement>, <light>, <style>.
> <Sound, if the model makes it: "the sound of rain on a tin roof">.

## A short log, to iterate without losing track

| Round | What changed | Result | Keep or undo |
| --- | --- | --- | --- |
| 1 | first prompt, 4 variations | number 3 closest; hands odd | keep 3 |
| 2 | "her hands hold the cup with both palms" | hands right; mug now blue | keep |
| 3 | "a cream ceramic mug" | right | done |
