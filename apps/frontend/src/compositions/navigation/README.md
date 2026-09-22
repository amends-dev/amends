# Navigation

Compound navigation with native anchors and declarative child slots:

```tsx
import { Navigation } from "@amends/frontend/compositions/navigation";
import { Divider } from "@amends/frontend/primitives/divider";
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { IconPlus } from "@amends/icons";

<Navigation.Root aria-label="Workspace">
  <Navigation.Section>
    <Navigation.SectionHeader>
      <Navigation.SectionLabel>Workspace</Navigation.SectionLabel>
      <Divider.Line />
      <Navigation.SectionActions>
        <IconButton aria-label="Create group" variant="ghost">
          <IconPlus />
        </IconButton>
      </Navigation.SectionActions>
    </Navigation.SectionHeader>
    <Navigation.Link href="/threads" aria-current="page">
      <Navigation.Icon>
        <span>◎</span>
      </Navigation.Icon>
      <Navigation.Label>Threads</Navigation.Label>
      <Navigation.Count aria-label="3 unread">3</Navigation.Count>
    </Navigation.Link>
  </Navigation.Section>
</Navigation.Root>;
```

Root is a named `nav`; Section is a group associated with its optional heading. Link requires
`href`, accepts native anchor events/attributes except the MIME `type` attribute, and keeps
native new-tab, modifier, and download behavior. Routing and `aria-current` are caller-owned.
Use links for destinations; actions should use Button or IconButton separately.

Label accepts a text string, including a reactive expression. Icon is decorative and accepts
the caller's glyph as children. Count is optional; use a meaningful accessible label when its
number needs context. Do not nest interactive content inside a Link.

Root inherits compact presentation and mobile dismissal from Shell. Its optional `compact`
prop supports standalone usage and review. Compact links keep their accessible names and
element identity while hiding label/count visually. Focus and hover show the label in a
Tooltip; Escape dismisses it. Provide icons for every compact link. Sections retain their
accessible names while their headings are visually hidden.

SectionHeader composes Divider.Root; SectionLabel composes Divider.Label as an h2 and
registers the section's accessible name. Add Divider.Line explicitly between the label
and optional SectionActions. The line now sits beside the heading, matching the mock;
Section no longer draws a separate border above it. A standalone SectionLabel still
names its section but does not add a line automatically.

SectionActions accepts Button/IconButton children and remains mounted when compact,
but is hidden from display and keyboard navigation. If focus was inside that slot when
navigation collapses, it moves to the section's first link, falling back to the navigation's
first link. Expanding does not move focus back. A caller's explicit `hidden` value still
applies after expansion. In the rail, SectionHeader becomes a centered 1.75rem seam;
the section heading remains available to assistive technology. Put trailing controls in
SectionActions so they receive this behavior.

Links have a 2.75rem minimum target. The current page uses primary text, a reviewed hover
fill, and a leading marker. Geometry, colors, focus, and spacing use the reviewed foundations.
Root needs a theme ancestor; Shell supplies Soot for its sidebar. This implementation uses
child slots instead of the old UI navigation's item-content props and render callbacks.

Ordinary unmodified link clicks dismiss an inherited mobile drawer after event propagation.
Prevented clicks, downloads, and non-self targets do not. A router adapter that prevents
default must close navigation after successful routing through the Shell hook.

**Compositions / Navigation** compares both themes in expanded/rail presentations and tests
switching without replacing links or actions. DOM tests cover accessible names, reactive labels, and
native/canceled click behavior. Browser review covers focus, tooltip placement, current-page
appearance, action focus recovery, and keyboard navigation.
