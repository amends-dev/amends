# Typography

Three visual styles, using the legacy UI typography (available in Git history)
as the baseline. Values are unchanged; sizes are expressed directly in `rem` and tracking
in `em` so the definitions can also be consumed as CSS.

| Role      | Family           | Size                              | Weight | Line height | Letter spacing |
| --------- | ---------------- | --------------------------------- | ------ | ----------- | -------------- |
| `body`    | IBM Plex Sans    | `0.9375rem` (15px at a 16px root) | 400    | 1.6         | `0em`          |
| `heading` | Instrument Serif | `1.875rem` (30px at a 16px root)  | 400    | 1.1         | `-0.015em`     |
| `mono`    | IBM Plex Mono    | `0.8125rem` (13px at a 16px root) | 400    | 1.5         | `0em`          |

All three styles are normal, not italic. This slice loads only the Latin subset at weight
400 for each family. Additional roles, weights, italics, and language subsets remain future
additions. The sans, serif, and mono stacks include system fallbacks for unavailable fonts
and glyphs not covered by the selected subset.

## Consume

Pure definitions are available without loading CSS or font files:

```ts
import { fontFamilies, typography, type TypographyRole } from "@amends/ui/foundations/typography";
```

Load the fonts explicitly at the application entry point, then apply a visual style to a
native element:

```tsx
import "@amends/ui/foundations/typography/fonts";
import { typographyStyles } from "@amends/ui/foundations/typography/styles";

<section>
  <h2 class={typographyStyles.heading}>A place for every conversation</h2>
  <p class={typographyStyles.body}>Keep the context close.</p>
  <span class={typographyStyles.mono}>thread_01 · queued</span>
</section>;
```

The styles set family, size, weight, style, line height, and letter spacing. They do not
set color, margins, wrapping, truncation, or HTML heading levels. Consumers select semantic
elements and compose the existing color foundation. The [Text primitive](../../primitives/text/README.md)
combines these styles with the color tones and native-element selection.

Fontsource packages supply local WOFF2 assets with WOFF fallbacks and `font-display: swap`.
The font entry is marked as a package side effect so production builds retain it. Importing
the font entry declares faces; it does not change document typography. The styles require
vanilla-extract's build integration, already configured in the UI workspace.

## Storybook and verification

**Foundations / Typography** includes Comparison, Cotton, Soot, Narrow, and Enlarged Text.
Each role appears in primary and secondary text. Samples include paragraphs, multiword
headings, and a long identifier. Narrow constrains the specimen to 320px. Specimen layout
uses local spacing and `overflow-wrap: anywhere`; that wrapping policy is not part of the
typography exports.

Enlarged Text sets the preview document's root font size to `200%`, exercising real `rem`
scaling. It restores the previous inline value and priority when disposed. It is excluded
from the shared Docs page using `!autodocs` because the document-level setting would affect
other specimens. It remains available as a standalone story in the sidebar. This scenario
checks enlarged text; it does not simulate browser zoom.

Each story's browser `play` checks:

- Load the three matching font faces through `document.fonts.load`, assert nonempty loaded
  results, and check their availability. A CSS family name alone does not prove font loading.
- Compare actual computed families, weights, sizes, line heights, and tracking with the
  exported definitions, using the current root size.
- Check that the sample elements fit their containers without clipping or horizontal overflow.

These checks require a real browser's font loader and layout engine. They run in Storybook's
Interactions panel, not the repository's Happy DOM portable-story tests. The regular Bun
suite continues to cover the existing UI tests. Build with
`bun run --filter @amends/ui build`, inspect all five stories in the browser, and check
the accessibility panel. Also verify that leaving Enlarged Text restores normal sizing and
that a fresh page with font requests blocked remains readable through the fallback stacks.

For font loading behavior see [FontFaceSet.load](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load).
The selected files follow [Fontsource's individual-subset imports](https://fontsource.org/docs/getting-started/subsets).
