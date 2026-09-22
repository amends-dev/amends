# Avatar

A 28px identity mark matching the four Primitives v2 treatments. Root owns the kind
and accessible name; Fallback supplies initials or a text glyph declaratively.

```tsx
import { Avatar } from "@amends/ui/primitives/avatar";

<Avatar.Root kind="agent" aria-label="Ada, agent">
  <Avatar.Fallback>a</Avatar.Fallback>
</Avatar.Root>;
```

| Kind      | Treatment                                              |
| --------- | ------------------------------------------------------ |
| `human`   | Soft neutral circle with emphasized sans initials      |
| `agent`   | Transparent circle with a dashed ring and mono initial |
| `contact` | Soft neutral rounded square with sans initials         |
| `system`  | Contrasting ink circle with a mono glyph               |

Root requires `aria-label` or `aria-labelledby` and renders a noninteractive image role.
Use `decorative` when adjacent content or an enclosing control already supplies the
identity, including the kind when it matters. Decorative avatars have no image role and
are hidden from assistive technology. The type excludes tab stops; compose a Button,
IconButton, or link around an avatar for actions. That control owns its accessible name,
focus, and events. Tooltip can wrap the control for supplemental context.

Fallback accepts a string, preserving caller-supplied case and Unicode. Empty or blank
content becomes `?`. Supply one or two initials or a single glyph; longer strings are
contained within the mark. The full accessible name comes from Root. This slice covers
text fallbacks; image loading, name-to-initials derivation, and avatar stacks are not part
of the API. Names and metadata compose beside Avatar with the existing layout and Text
primitives; Avatar itself does not load or infer domain identity data.

The default footprint is 1.75rem square, with 11px fallback text (12px for system glyphs).
The contact's 7px corners scale with the root text size. Human initials use CSS weight 600
with the existing font setup; no additional font weights are bundled by this component.
The reviewed `avatar.human`, `avatar.contact`, and `avatar.system` surface/text pairs
cover Cotton and Soot. Agent rings use `line.control`, with `text.secondary` on the parent
canvas/panel. Neutral filled silhouettes are decorative; their names/kinds carry the
identity information. Filled text pairs are contrast-tested separately. Forced colors
retain circles, contact corners, the dashed agent ring, and the system's inverse treatment.

**Primitives / Avatar** covers both surfaces/themes, named and decorative usage, empty and
Unicode fallbacks, reactive kind/name changes, long adjacent names, enlarged text, RTL,
and an avatar inside a tooltip-bearing button. The reactive and button stories run in
the portable suite. DOM/type tests verify naming, native refs/classes, stable identity,
and keyboard ownership. **Foundations / Color / Avatar** displays the new token pairs.
Comparison also checks rendered geometry, the dashed agent ring, and text contrast in the
browser, including forced colors. Visual review checks font rendering, wrapping, and focus.
