# Focus

A reusable focus indicator for native focusable elements inside a color theme. It matches
the legacy UI dimensions and colors (available in Git history), and the
[Foundations v2 reference](<../../../../../design-system/Amends Foundations v2.dc.html>).

| Export or role         | Value                   | Purpose                                 |
| ---------------------- | ----------------------- | --------------------------------------- |
| `focus.width`          | `2px`                   | Solid outline width                     |
| `focus.offset`         | `2px`                   | Gap between the element and outline     |
| `colorVars.focus.ring` | Cotton ink / Soot paper | Theme-aware outline color               |
| `focusVisible`         | Generated CSS class     | Applies the outline on `:focus-visible` |

```tsx
import { colorThemes } from "@amends/ui/foundations/color/styles";
import { focusVisible } from "@amends/ui/foundations/focus/styles";

<section class={colorThemes.cotton}>
  <button type="button" class={focusVisible}>
    Review proposal
  </button>
</section>;
```

The dimensions are plain CSS-ready values from `@amends/ui/foundations/focus`.
The class can also be composed into a vanilla-extract style with `style([focusVisible, …])`.
It owns only the focus outline. Consumers own semantics, disabled behavior, sizing, colors,
radius, and event handlers. Applying the class does not make a noninteractive element focusable.
The [Button primitive](../../primitives/button/README.md) composes this class with its other foundations.

## Visibility and layout

The browser decides when [`:focus-visible`](https://www.w3.org/TR/selectors-4/#the-focus-visible-pseudo)
matches. Keyboard navigation normally shows the indicator; clicking a button normally does
not. This is not a blanket “keyboard only” rule: text inputs, scripted focus, and user
preferences can also require a visible indicator. There are no key or pointer listeners,
forced focus, global selectors, or `outline: none` resets. Browser accessibility preferences
and forced-color adjustments remain enabled.

The outline takes no layout space. With these values its outer edge reaches 4px beyond the
element. Surrounding layouts must allow that space, avoid clipping it with overflow rules,
and keep it clear of neighboring content. Radius comes from the element being focused.
Both dimensions stay in CSS pixels when the root font size changes; browser zoom is separate.

The ring is supported on canvas and panel surfaces in the same theme. Its offset leaves
the surrounding surface visible between a filled control and its outline. Contrast tests
compare the ring with those surfaces against the 3:1 requirement for state indicators in
[WCAG 2.2 SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
Arbitrary colored backgrounds need their own review. These tests alone do not establish
whole-page accessibility, absence of occlusion, or native desktop compatibility.

## Storybook and verification

**Foundations / Focus** provides Comparison, Cotton, Soot, Nested Themes, and Enlarged Text.
Native square and pill buttons compose the production `focusVisible` class with the
reviewed Text, spacing, radius, and action colors. A disabled control between each pair
makes skipped tab stops visible. Their sizes and styling are workshop scaffolding.

Browser play checks verify the scoped ring color, contrast, and room for the outline inside
each surface and between specimens. They deliberately leave focus alone. Synthetic key
events do not establish the browser's input modality, and Happy DOM cannot verify the
painted outline. These play checks run in Storybook, not the portable-story test suite.
In forced-colors mode they check spacing only: author swatches are replaced by the user's
palette, so the actual system-colored outline needs keyboard review.

Review with real browser keyboard input:

1. Open the story in isolation, click the Cotton heading, and press Tab. Confirm the square
   sample gains a 2px solid ring with a 2px gap.
2. Tab through both surfaces and themes. The disabled controls must be skipped. Reverse
   through the enabled samples with Shift+Tab and confirm the previous ring disappears.
3. Check the focused outline color, width, offset, and `:focus-visible` match in computed
   styles. Compare dimensions and neighboring positions before and after focus.
4. Click an enabled sample to review the browser's pointer-focus behavior. Inspect square
   and pill outlines visually for shape, clipping, and overlap.
5. Repeat in nested scopes, at 320px, and in Enlarged Text. The enlarged story sets the root
   font size to `200%`, restores its previous value and priority on disposal, and is excluded
   from shared Docs canvases. Check restoration when navigating away.
6. Review the accessibility addon and browser forced-colors emulation. Native platform and
   other browser engines still need their own validation when applications consume this package.

Run `bun run check`, `bun run test`, and `bun run --filter @amends/ui build` before
browser review. The color test suite covers all four focus-ring/surface pairings with
opaque, in-gamut colors and unrounded contrast ratios.
