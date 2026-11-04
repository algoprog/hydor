# WCAG 2.2, levels A and AA

Open this to name the criterion behind an issue in a report, or to see what a full AA check covers.
These are the 55 success criteria a site must meet for level AA (31 at A, 24 at AA; 4.1.1 Parsing
was removed in 2.2). The right column is what to look at, in short; the exact wording, exceptions and
techniques are in the W3C's "Understanding WCAG 2.2" pages, which a conformance claim must follow.

## Perceivable

| Criterion | Level | Check |
| --- | --- | --- |
| 1.1.1 Non-text Content | A | Images, icons and controls have text alternatives; decorative ones are hidden from screen readers |
| 1.2.1 Audio-only and Video-only (Prerecorded) | A | A transcript for audio; a transcript or audio track for silent video |
| 1.2.2 Captions (Prerecorded) | A | Recorded video with speech has captions |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | A | What is only shown in a video is described, or a text alternative is given |
| 1.2.4 Captions (Live) | AA | Live video with speech has captions |
| 1.2.5 Audio Description (Prerecorded) | AA | Recorded video has audio description where the picture carries information |
| 1.3.1 Info and Relationships | A | Headings, lists, tables, labels and groups are in the markup, not only in the look |
| 1.3.2 Meaningful Sequence | A | The reading order in the code makes sense |
| 1.3.3 Sensory Characteristics | A | Instructions do not rely on shape, place or sound alone ("the round button on the right") |
| 1.3.4 Orientation | AA | Works in portrait and landscape |
| 1.3.5 Identify Input Purpose | AA | `autocomplete` on fields asking for personal data |
| 1.4.1 Use of Color | A | Colour is never the only way information is shown |
| 1.4.2 Audio Control | A | Sound playing by itself for more than 3 seconds can be paused or turned down |
| 1.4.3 Contrast (Minimum) | AA | Text 4.5:1, large text 3:1 |
| 1.4.4 Resize Text | AA | Text at 200% loses nothing |
| 1.4.5 Images of Text | AA | Real text, not pictures of text (logos excepted) |
| 1.4.10 Reflow | AA | At 320 CSS pixels wide, no scrolling in two directions (tables, maps excepted) |
| 1.4.11 Non-text Contrast | AA | Control borders, icons, focus indicators and chart parts 3:1 |
| 1.4.12 Text Spacing | AA | Larger line, letter, word and paragraph spacing loses nothing |
| 1.4.13 Content on Hover or Focus | AA | Tooltips and pop-ups can be dismissed (Escape), hovered, and stay until dismissed |

## Operable

| Criterion | Level | Check |
| --- | --- | --- |
| 2.1.1 Keyboard | A | Everything works from the keyboard |
| 2.1.2 No Keyboard Trap | A | Focus can always leave what it entered |
| 2.1.4 Character Key Shortcuts | A | Single-key shortcuts can be turned off or changed, or work only on focus |
| 2.2.1 Timing Adjustable | A | Time limits can be turned off, adjusted or extended |
| 2.2.2 Pause, Stop, Hide | A | Moving, blinking or auto-updating content can be paused |
| 2.3.1 Three Flashes or Below Threshold | A | Nothing flashes more than three times a second |
| 2.4.1 Bypass Blocks | A | A skip link or landmarks to jump past repeated blocks |
| 2.4.2 Page Titled | A | Each page has a title that says what it is |
| 2.4.3 Focus Order | A | Focus moves in an order that keeps the meaning |
| 2.4.4 Link Purpose (In Context) | A | Each link's purpose is clear from its text or its context |
| 2.4.5 Multiple Ways | AA | More than one way to find a page (menu, search, site map) |
| 2.4.6 Headings and Labels | AA | Headings and labels describe their topic or purpose |
| 2.4.7 Focus Visible | AA | The focus is visible |
| 2.4.11 Focus Not Obscured (Minimum) | AA | The focused element is not entirely hidden by sticky bars or pop-ups |
| 2.5.1 Pointer Gestures | A | Multi-finger or path gestures have a single-pointer alternative |
| 2.5.2 Pointer Cancellation | A | Actions happen on release, and can be cancelled by moving away |
| 2.5.3 Label in Name | A | A control's name contains its visible label |
| 2.5.4 Motion Actuation | A | Shaking or tilting has a button alternative and can be turned off |
| 2.5.7 Dragging Movements | AA | Anything done by dragging can also be done without dragging |
| 2.5.8 Target Size (Minimum) | AA | Targets at least 24×24 CSS pixels, or with enough space around (inline links excepted) |

## Understandable

| Criterion | Level | Check |
| --- | --- | --- |
| 3.1.1 Language of Page | A | `<html lang>` is right |
| 3.1.2 Language of Parts | AA | Passages in another language carry their own `lang` |
| 3.2.1 On Focus | A | Focusing something does not change the context (no jumps, no submits) |
| 3.2.2 On Input | A | Changing a setting does not change the context unless people were told |
| 3.2.3 Consistent Navigation | AA | Menus repeated across pages stay in the same order |
| 3.2.4 Consistent Identification | AA | The same function has the same name everywhere |
| 3.2.6 Consistent Help | A | Help (contact, chat, FAQ) sits in the same place on each page that has it |
| 3.3.1 Error Identification | A | Errors are found and described in text |
| 3.3.2 Labels or Instructions | A | Fields have labels and the instructions people need |
| 3.3.3 Error Suggestion | AA | Errors suggest how to fix them, where known |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Orders, payments and legal steps can be checked, corrected or undone |
| 3.3.7 Redundant Entry | A | Information given earlier in a process is filled in or offered, not asked again |
| 3.3.8 Accessible Authentication (Minimum) | AA | Logging in needs no memory test or puzzle without an alternative; paste and password managers work |

## Robust

| Criterion | Level | Check |
| --- | --- | --- |
| 4.1.2 Name, Role, Value | A | Custom controls expose their name, role, state and value |
| 4.1.3 Status Messages | AA | Status messages are announced without moving focus |
