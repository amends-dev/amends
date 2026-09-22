# Drawer

A modal side drawer using a native `dialog`, with declarative content:

```tsx
import { Drawer } from "@amends/frontend/compositions/drawer";

<Drawer.Root>
  <Drawer.Trigger>Workspace details</Drawer.Trigger>
  <Drawer.Content>
    <Drawer.Header>
      <Drawer.Title>Workspace details</Drawer.Title>
      <Drawer.Close />
    </Drawer.Header>
    <Drawer.Body>
      <Drawer.Description>Review the workspace settings.</Drawer.Description>
      {/* Form or navigation content */}
    </Drawer.Body>
    <Drawer.Footer>{/* Actions */}</Drawer.Footer>
  </Drawer.Content>
</Drawer.Root>;
```

Root accepts `defaultOpen`, or controlled `open`/`onOpenChange`. `Drawer.useDrawer()` exposes
the open accessor and `close()` for custom actions. Trigger composes Button; Close composes
IconButton with a default close glyph and accessible name. Both preserve caller click
handlers and honor prevented default actions.

Use one Content per Root, and a Title or explicit accessible label. Description is optional.
Header/Body/Footer accept native div attributes and children. Content accepts native dialog
attributes except `id`/`open`, which Root owns. Title and Description register their IDs for
automatic associations. Root's optional `id` overrides the generated ID.

The drawer opens at the inline start edge (right in RTL), is at most 20rem wide, and leaves
2rem of backdrop at narrow widths. Header/Footer stay in place while Body scrolls. Provide
a scoped color theme on an ancestor and load fonts at the application entry point.

`showModal()` supplies top-layer placement and background inertness. Opening focuses Title
by default; `initialFocus()` can select another child. Closing restores the previously
focused element; `returnFocus()` can override it. Escape, Close, and a pointer click that
both starts and ends on the backdrop dismiss it. Preventing the corresponding native event
suppresses dismissal. Content stays mounted while closed, retaining local field state.

Enter/exit slides last 180ms. The closing dialog remains modal until its exit completes;
a fallback timer ensures cleanup when an animation does not finish. Reduced motion or
`animated={false}` skips animation. Root scrolling is locked while a frontend drawer is
open and released when the last one closes or unmounts. Motion and scrim values are local
styles, not new shared foundation catalogs.

Select and Tooltip use a private shared overlay host to keep their portals within the native
modal. Nested Select handles its own Escape before the drawer sees it. Applications should
use modal-aware primitives for other overlays too.

**Compositions / Drawer** provides closed, open, and state-preservation stories. DOM/portable
tests cover associations, closing, focus return, and retained drafts. Use a real browser for
top-layer behavior, inertness, native keyboard navigation, animation, and backdrop hit testing.
