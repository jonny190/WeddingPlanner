# The guest invitation page

This is what a guest sees when they follow the link in their email: `/rsvp/<token>`, built
from `frontend/src/modules/rsvp/`. The notes here cover how the page is put together and how
the envelope animation works, for whoever changes it next.

## One letter, on parchment

Everything the guest reads is one sheet of aged paper, `.rsvp-sheet`, written in the manner
of a formal letter: a crest with the couple's initials, their names set in capitals, the
date, then "Dear Jo," and paragraphs that say when and where, the designed card as the
printed invitation, the couple's sign-off in a hand-written script with their names printed
beneath, a P.S. with calendar links, and a reply slip along the bottom with tick boxes and
lines to write on. When an event has a menu, the letter says so and the slip asks the guest
to pick a dish for every course, and again for anyone they bring (see `guides/menus.md`).

The paper is the first card's background colour, aged towards parchment. It carries the
creases and wrinkles of a sheet that was crumpled and smoothed out again (an SVG `feTurbulence`
relief lit with `feDiffuseLighting`, blended over the paper colour with `background-blend-mode`,
on both the letter and the envelope), rough deckled edges (an SVG mask whose outline is pushed
about by noise), and grain, mottling, a few stains, darkened edges and the two creases of a
letter that came folded in three (all drawn by the sheet's `::after`). Because a mask would cut
off a shadow drawn on the sheet, its shadow is a `drop-shadow` filter on the wrapper
(`.reveal-sheet`), which follows the rough edge. The card's thin frame runs around the whole sheet, and the card art sits
straight on the paper without its own background or frame. The ink colours and the
typefaces (Cinzel for the crest and headings, EB Garamond for the body, Pinyon Script for
the hand-written parts) are variables on the sheet. The colours come in from the card design
in `RsvpPage.tsx` (`--letter-paper`, `--letter-frame`, `--c-accent`).

If a guest has not been sent anything yet, the page shows a greeting and a short note instead,
with no envelope.

## The envelope

`EnvelopeReveal.tsx` (in `frontend/src/components/envelope/`, shared with the invitation
builder's preview) wraps the sheet. Its colours, the initials on the wax, the stamp, the prompt
and whether it plays at all come from the design's `envelope` settings, set on the Envelope tab
of the invitation builder; colours left unset follow the card. The first time a guest opens the page in a browser
session, the sheet arrives inside a sealed envelope of heavy parchment. The letter inside the
envelope is the real content, scaled down, not a stand-in, so the words that rise out of the
pocket are the words the guest then reads. While it is inside, the sheet is `inert` and
hidden from assistive technology; only the envelope's own buttons are reachable.

The stages, driven by a small state machine and timed to match `envelope.css`:

1. `addressed`: the envelope lands on the page address-up. The guest's name, the occasion and
   the date are written on it in green ink, with a stamp of the couple's initials and a
   postmark. After a moment it turns itself over (or sooner, if tapped).
2. `sealed`: the seal side. The wax seal breathes (its colour drifts slowly) and a gleam
   travels across it. Under a pointer it warms and glows; pressed, it brightens.
3. `opening`: the wax flashes and cracks in two along a jagged line, the halves falling
   away; the flap swings back on its top edge, showing its lining past the half-way point;
   then the letter rises out of the pocket.
4. `open`: the page takes the letter back into normal flow. The component measures where the
   letter was and where it now is, and plays the difference as one transform animation (a
   FLIP), while the envelope drops away.
5. `done`: only the letter is left. The envelope elements are no longer rendered.

The turn-over is two quarter-turns: the address side swings to edge-on and vanishes, then the
seal side (the back, the letter and the front, wrapped together in `.env-scene`) swings in from
edge-on. Nothing relies on back faces being hidden, because browsers are inconsistent about
that once an element's children carry transforms of their own.

Everything is sized from the envelope's own width using container query units, so the same
choreography fits a phone and a desktop without separate breakpoints. The wax takes the
card's accent colour and the envelope paper a deeper shade of the card's paper.

With `prefers-reduced-motion` set, or on a second visit in the same session, the letter is
simply shown.

## Things to keep in mind

- The seal is drawn twice, each copy clipped to one side of the crack. Whole, the two edges
  meet exactly; if you change one polygon, change the other to match.
- The colour transitions rely on `@property` for `--wax`. Browsers without it still show the
  colours, just without the smooth change.
- The letter's typefaces come from the bundled card fonts (`designer/webfonts.ts`), which load
  as soon as a card is on the page. Until they arrive the fallbacks show.
- The e2e suite drives this page in `e2e/tests/invitations-rsvp.spec.ts` (breaking the seal,
  reading the card, replying) and `csp.spec.ts` (fonts loading under the content security
  policy). Keep the button labels "Turn the envelope over" and "Open the invitation" and the
  hint "Break the seal to open", or update those tests.
