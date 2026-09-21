# Token sync — historical Foundations v2 handoff

The four files here are design-reference artifacts from an earlier UI structure.
They are not imported by the current application and are not replacement files
for `apps/ui`. The former `apps/ui/src/foundations/` directory and its contract
names no longer exist.

Use the [UI guide](../../apps/ui/README.md) for current imports, components, themes,
and validation. The corresponding implementation lives here:

| Historical artifact | Current source                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `color.ts`          | [Color tokens](../../apps/ui/src/tokens/color.ts) with Cotton, Soot, and inverse scopes.                                    |
| `tokens.css.ts`     | [CSS contract](../../apps/ui/src/styles/contract.css.ts) and [theme styles](../../apps/ui/src/styles/theme.css.ts).         |
| `elevation.ts`      | [Motion and shadow tokens](../../apps/ui/src/tokens/motion.ts) and [scale/focus tokens](../../apps/ui/src/tokens/scale.ts). |
| `stitch.ts`         | [Stitch styles](../../apps/ui/src/styles/stitch.css.ts) and stroke geometry in the scale tokens.                            |

The handoff proposed warm neutrals, a persimmon accent, flat page surfaces,
ink-colored focus and controls, and a 7px/6px decorative stitch. Current components
consume semantic `vars` roles; copying these legacy files would bypass that contract.

The former follow-up notes referenced a removed `divider.css.ts`, a dark theme
named `night`, and `elevation.raised`/`lifted` keys. They are not current repair
instructions. The active theme is named Soot, decorative seams come from the
shared stitch styles, and the current shadow roles belong to overlay/modal surfaces.
