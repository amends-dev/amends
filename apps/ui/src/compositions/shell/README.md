# Shell

A declarative application frame for the shared web and desktop frontend. The shell owns
the sidebar, header, main scrolling area, and optional footer. Page content uses the existing
Container, Row, Column, and Grid primitives, with `Shell.Content` for a fluid page or named width
and optional vertical centering inside Main. Theme and body typography come from
an enclosing [ThemeProvider](../../foundations/theme/README.md); Shell inherits them.

```tsx
import { Shell } from "@amends/ui/compositions/shell";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Container } from "@amends/ui/primitives/layout";
import { ThemeProvider } from "@amends/ui/foundations/theme";

<ThemeProvider theme="cotton">
  <Shell.Root>
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
  </Shell.Root>
</ThemeProvider>;
```

Slots accept children and native attributes; there are no navigation-item, sidebar, header,
or content props. Load typography fonts at the application entry point. The sidebar uses Soot
even when the main content uses Cotton, following the Shell v2 reference. The reference's
inspector is not included in this slice.

## Responsive behavior

`SidebarUtility` is an optional direct child of Sidebar alongside Header, Content,
and Footer. It holds one mounted control beside the expanded header and below the
collapsed footer. The shared grid owns placement; app code supplies ordinary children.
The same utility moves with the sidebar into its mobile drawer.

`Inspector` is an optional sibling after Body. Compose its content as children and
control `open`/`onOpenChange` from the owning page. At 1280px and wider it reserves
400px beside the content. Below 1280px the same mounted content moves into a modal
sheet at the inline end; on phones the sheet fills the width. The page supplies a
visible close action. Its `title` names the aside and modal, and `returnFocus` can
point to the page's opener.

- At 64rem and wider, the sidebar is 16rem wide; optional manual collapse leaves a 3.75rem icon rail.
  `defaultCollapsed` initializes the preference. `collapsed` with `onCollapsedChange`
  lets an application own or persist it. The shell itself stores nothing between mounts.
- From 48rem to below 64rem, a persistent 3.75rem rail accompanies the content.
  Its toggle opens the full navigation in a modal Drawer. Below 48rem, the rail
  leaves and a phone header toggle opens the drawer. The drawer has no close icon
  or bottom navigation; backdrop, Escape, and destination links dismiss it. Returning to desktop closes the
  drawer and restores the desktop preference. RTL reverses the sidebar and drawer.
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

For a form, onboarding step, empty state, or status message:

```tsx
<ThemeProvider theme="cotton">
  <Shell.Root>
    <Shell.Body scroll="page">
      <Shell.Header>
        <Text as="span" variant="heading">
          amends
        </Text>
      </Shell.Header>
      <Shell.Main>
        <Shell.Content width="narrow" centered>
          {content}
        </Shell.Content>
      </Shell.Main>
      <Shell.Footer>
        <Text variant="mono">Optional footer content</Text>
      </Shell.Footer>
    </Shell.Body>
  </Shell.Root>
</ThemeProvider>
```

Content composes Container: `standard` (default) uses its 67.5rem outer limit;
`medium` uses 37rem, leaving 35rem for a readable list;
`narrow` uses 28.25rem, leaving a 26.25rem column after the existing 1rem gutters.
The default `fluid` width fills workspace content with 30px gutters, or 18px on
phones, aligned with `Header workspace`. Use `Main workspace` to keep the body
directly below that header. Other named widths remain centered for standalone
pages. Without `centered`, content starts at the top. Centering uses free space only:
long content starts at the top. `Body scroll="page"` keeps header, main, and footer
in one scrollable flow, so tall chrome cannot crowd out the content at enlarged
text sizes. The default `scroll="regions"` retains the existing independent Main
scrolling and fixed header/footer behavior. Theme, scrolling mode, width, and
centering updates keep children mounted. Content does not add a landmark or own
page headings, branding, forms, routes, or feature state.

This extends the existing frame for a general content-layout need. Sign-in needs
no separate page shell or invented brand badge; application pages compose these
parts and reviewed Text, rather than defining their own styles.

The shell provides a skip link, generated main target, labelled toggle, current-link initial
focus in the mobile drawer, Escape/backdrop dismissal, and focus return. The native
modal makes the background inert; Drawer handles reduced motion and scroll-lock cleanup.

Navigation uses real anchors. Ordinary link activation dismisses the mobile drawer; modified,
download, new-window, or prevented clicks do not. A router that prevents default should call
`Shell.useShell().closeNavigation()` after committing its route. That hook also exposes
`mobile`, `collapsed`, and `drawerOpen` accessors and `toggleNavigation()`. Within Root,
`Shell.useSidebar()` exposes the effective `compact` accessor and `closeNavigation()` for
custom sidebar content. Application routes, authorization, workspace data, and persistence
remain application responsibilities.

## Review

Navigation toggles use the shared `@amends/icons` menu and sidebar drawings. Sidebar
glyphs retain the shell's RTL mirroring; the mobile menu is direction-neutral.

**Compositions / Shell** includes responsive, desktop, collapsed, Soot, mobile closed/open,
long-navigation, RTL, enlarged-text, and no-sidebar stories. Separate interaction stories
exercise desktop state preservation and mobile navigation. The sample cards, draft form,
and sidebar fields are review fixtures, not product features.

DOM tests verify instance preservation and independent desktop/mobile state. Portable stories
cover desktop interaction; mobile interaction requires the browser viewport preset. Browser
review checks the native modal, nested Select, focus, viewport transitions, scroll regions,
themes, and geometry. **Compositions / Shell / Content** adds narrow, short-window,
enlarged-text, RTL, and both-theme geometry checks, including both overflow edges.
**Compositions / Shell / Workspace layout** shows the shared header and navigation
at desktop, laptop, tablet, and phone widths, plus the optional inspector inline
and in sheets. [PageHeader](../page-header/README.md)
supplies the repeated heading parts; app-owned segmented page navigation sits below it.
Tauri integration and other browser engines remain future validation.
