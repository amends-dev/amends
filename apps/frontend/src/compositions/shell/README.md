# Shell

A declarative application frame for the shared web and desktop frontend. The shell owns
the sidebar, header, main scrolling area, and optional footer. Page content uses the existing
Container, Row, Column, and Grid primitives.

```tsx
import { Shell } from "@amends/frontend/compositions/shell";
import { Navigation } from "@amends/frontend/compositions/navigation";
import { Container } from "@amends/frontend/primitives/layout";
import { colorThemes } from "@amends/frontend/foundations/color/styles";

<Shell.Root class={colorThemes.cotton}>
  <Shell.Sidebar>
    <Shell.SidebarHeader>
      <Shell.SidebarLabel>Acme workspace</Shell.SidebarLabel>
    </Shell.SidebarHeader>
    <Shell.SidebarContent>
      <Navigation.Root aria-label="Workspace">
        <Navigation.Link href="/threads" aria-current="page">
          <Navigation.Icon>
            <span>◎</span>
          </Navigation.Icon>
          <Navigation.Label>Threads</Navigation.Label>
          <Navigation.Count aria-label="3 unread">3</Navigation.Count>
        </Navigation.Link>
      </Navigation.Root>
    </Shell.SidebarContent>
    <Shell.SidebarFooter>
      <Shell.SidebarLabel>Acme account</Shell.SidebarLabel>
    </Shell.SidebarFooter>
  </Shell.Sidebar>
  <Shell.Body>
    <Shell.Header>
      <Shell.NavigationToggle />
      <h1>Threads</h1>
    </Shell.Header>
    <Shell.Main>
      <Container>Page content</Container>
    </Shell.Main>
  </Shell.Body>
</Shell.Root>;
```

Slots accept children and native attributes; there are no navigation-item, sidebar, header,
or content props. Load typography fonts at the application entry point. The sidebar uses Soot
even when the main content uses Cotton, following the Shell v2 reference. The reference's
inspector and mobile bottom bar are not included in this slice.

## Responsive behavior

- At 48rem and wider, the sidebar is 16rem wide; collapse leaves a 3.75rem icon rail.
  `defaultCollapsed` initializes the preference. `collapsed` with `onCollapsedChange`
  lets an application own or persist it. The shell itself stores nothing between mounts.
- Below 48rem, the same toggle becomes a hamburger and opens a modal Drawer from the
  inline start edge. Returning to desktop closes the drawer and restores the desktop
  preference. RTL puts the sidebar and drawer on the right.
- One sidebar content tree moves between its desktop dock and the drawer. Inputs, selection,
  and component instances survive mode changes. Open Select/Tooltip overlays dismiss when
  their host changes; subsequent overlays mount in the current host and retain the theme.
- Navigation labels remain accessible in the rail, with focus/hover tooltips. Use
  `SidebarLabel` for noninteractive text and `SidebarExpanded` for optional controls that
  should disappear from the rail. The latter keeps children mounted but hidden and inert.
  Every collapsed navigation link needs an icon. Avoid hiding interactive content with
  `SidebarLabel`.

The default frame fills `100dvh`; its native `style`/`class` may size an embedded frame.
SidebarContent and Main scroll independently while their headers and footers stay in place.
There is one Sidebar and one Main per Root. Body/Header/Main/Footer also work without a
Sidebar; NavigationToggle then renders nothing. Supply a short Header or a responsive
layout so it leaves room for Main at narrow sizes and enlarged text.

## Interaction and application ownership

The shell provides a skip link, generated main target, labelled toggle, current-link initial
focus in the mobile drawer, Escape/backdrop/close dismissal, and focus return. The native
modal makes the background inert; Drawer handles reduced motion and scroll-lock cleanup.

Navigation uses real anchors. Ordinary link activation dismisses the mobile drawer; modified,
download, new-window, or prevented clicks do not. A router that prevents default should call
`Shell.useShell().closeNavigation()` after committing its route. That hook also exposes
`mobile`, `collapsed`, and `drawerOpen` accessors and `toggleNavigation()`. Within Root,
`Shell.useSidebar()` exposes the effective `compact` accessor and `closeNavigation()` for
custom sidebar content. Application routes, authorization, workspace data, and persistence
remain application responsibilities.

## Review

**Compositions / Shell** includes responsive, desktop, collapsed, Soot, mobile closed/open,
long-navigation, RTL, enlarged-text, and no-sidebar stories. Separate interaction stories
exercise desktop state preservation and mobile navigation. The sample cards, draft form,
and sidebar fields are review fixtures, not product features.

DOM tests verify instance preservation and independent desktop/mobile state. Portable stories
cover desktop interaction; mobile interaction requires the browser viewport preset. Browser
review checks the native modal, nested Select, focus, viewport transitions, scroll regions,
themes, and geometry. Tauri integration and other browser engines remain future validation.
