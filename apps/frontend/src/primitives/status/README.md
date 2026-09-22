# Status

An unfilled dot and visible monospace label, matching the status treatment in Primitives v2.
The consuming feature maps its domain state to a semantic tone and readable wording.

```tsx
import { Status } from "@amends/frontend/primitives/status";

<Status.Root tone="pending">
  <Status.Indicator />
  <Status.Label>Review</Status.Label>
</Status.Root>;

<Status.Root tone="idle">
  <Status.Indicator appearance="hollow" />
  <Status.Label muted>Cancelled</Status.Label>
</Status.Root>;
```

Root accepts the existing `idle`, `running`, `pending`, `warning`, `success`, and `danger`
tones. Tone colors the indicator; label text stays neutral and readable. `muted` selects
secondary text, as in the cancelled reference. Indicator is solid by default; `hollow`
uses a transparent center with a dashed ring. A visible Label is expected in every Root,
so color or shape never carries the state alone. Indicator is decorative, nonfocusable,
and cannot contain children. Label accepts text, including reactive strings.

The mock's nine states are examples in Storybook, not a public enum. Open, triage, and
ready share idle; working uses running; review/held use pending; succeeded/failed use
success/danger; cancelled uses idle with a hollow indicator and muted label. Warning
is available for caution. Ready uses the reviewed idle indicator instead of the mock's
faint seam color. The hollow ring keeps the same footprint as the solid dot when state
changes. Status does not add a filled badge, clickable chip, or animated loading behavior.

Root is a plain span with no automatic role or live region. Native `role`, `aria-live`,
and `aria-atomic` attributes are forwarded when a feature intentionally announces changes.
The Explicit Announcement story demonstrates this opt-in. Updating a tone or label
preserves mounted elements and does not move focus.

The label is 12px mono, the dot is 7px, and their gap uses spacing step 2. Dimensions scale
with root text size. Long text wraps and the indicator aligns with the first line. Both
themes use existing `status.*.indicator`, `text.primary`, and `text.secondary` tokens on
canvas/panel. Forced colors use system colors and preserve the hollow ring; visible words
retain the distinction when status hues are replaced.

**Primitives / Status** covers all reference states, both surfaces/themes, warning, long
labels, enlarged text, RTL, reactive presentation, and explicit announcements. The reactive
story runs in the portable suite. DOM/type tests keep static statuses quiet and indicators
decorative, preserve element identity, and verify caller-owned announcements. The
Comparison story checks rendered indicator/text contrast and the hollow ring in the browser,
including forced colors. Visual review checks wrapping and first-line dot alignment.
