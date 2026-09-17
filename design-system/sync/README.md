# Token sync — Foundations v2

Four files, to replace their counterparts in `apps/ui/src/foundations/`. The
theme-contract shape is preserved, so nothing that reads `color.*` or
`elevation.*` needs to change to compile.

| file            | what changed                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `color.ts`      | every value. Neutrals move from blue hue 264-266 to warm 84-92; the accent becomes persimmon at hue 42. Two keys added. |
| `tokens.css.ts` | three keys added to the contract: `surface.rail`, `ink.onFill`, `border.strong`.                                        |
| `elevation.ts`  | `raised` and `lifted` become `none`; `ring` drops from 3px brand to 2px ink.                                            |
| `stitch.ts`     | dash 6/5 to 7/6, `base` 2 to 1.7, `heavy` 3 to 2.4, plus two derived pattern strings.                                   |

`space.ts` and `type.ts` are unchanged — the 4pt scale, the radius set and the
type scale were all already right.

## What this does to existing components, without touching them

- **Anything with a shadow in the page body goes flat.** `surface.css.ts`
  (`raised`/`lifted` variants), `task-card`, `message`, `button` hover and
  `shell` all read `elevation.raised`; all of them stop casting. Menus,
  tooltips and dialogs keep theirs through `overlay` and `modal`.
- **Focus becomes ink.** `brand.focus` is no longer the accent, so a focus ring
  is legible on the rail as well as on paper.
- **Selected-control borders stop being brand-hued.** `brand.light` is read as a
  line colour by `choice`, `chip`, `button` and `avatar`; it resolves to an
  ink-tinted neutral, because persimmon is scoped out of the shell.
- **Running stops being a colour.** `status.thinkingSolid` becomes ink at
  secondary weight. The travelling dash carries the meaning instead.

## Three follow-ups this does not do

1. **`divider.css.ts` hardcodes the old dash.** Line 69 has
   `repeating-linear-gradient(0deg, … 0 5px, transparent 5px 9px)` — a 5/4
   pattern that predates the token and now disagrees with every other seam.
   Replace with `dashStops` from `stitch.ts`:

   ```ts
   backgroundImage: \`repeating-linear-gradient(0deg, \${color.border.seam} \${dashStops})\`
   ```

2. **The dark theme is still exported as `night`.** The design system calls it
   Soot, and the mode variant in `theme.css.ts` is user-facing. Renaming is
   cosmetic and rippling, so the values changed and the name did not. Worth doing
   in its own pass.

3. **`raised` and `lifted` should eventually go.** They resolve to `none` now,
   which is the decision, but a token named `raised` that raises nothing is a
   trap for the next person. Removing them means editing the five files listed
   above and the two contract keys.
