# Amends UI v2

The pattern-based design system for web and desktop, built from the Lunacy mocks in
[`design-system/Amends Group Exploration.free`](../../design-system/). The mocks are the
reference: open the file in Lunacy and compare a screen with its story.

UI v2 replaces [`@amends/ui`](../ui/README.md) and [`@amends/features`](../features/README.md)
screen by screen. Screens here are presentation only: data arrives as props and actions leave as
callbacks. The connected logic that lives in features moves into
[client](../client/README.md) as hooks, and web and desktop join the two. Until a screen is
replaced, the apps keep using the existing packages.

## Structure

The design is six layout patterns built from a small set of components:

1. **Rail**: the leftmost column of global destinations.
2. **Sidebar**: the destination's items, such as Inbox, Triage, Tasks, groups, and direct messages.
3. **Main content**: a header, tabs, a scrolling body, and a bottom bar such as the composer.
   Header, tabs, and bottom bar stay in place while the body scrolls.
4. **Side panel**: further content beside the main content, such as an open thread.
5. **Modal**: the main-content structure in a dialog: header, tabs, body, and actions.
6. **Centered screen**: standalone screens such as sign-in and the workspace picker.

Source follows that order: `foundations` (color, type, space, elevation, theme), then components,
patterns, and screens as they are introduced.

## Foundations

- **Color** ([tokens](src/foundations/color/tokens.ts)): semantic roles for surfaces, text,
  borders, actions, the modal scrim, and eight avatar tones. Every value is the exact light or
  dark color the mocks use. The dark error colors are proposals; the mocks have no dark error
  state yet.
- **Typography** ([tokens](src/foundations/typography/tokens.ts)): Inter at 400, 500, and 600,
  in eight roles from `meta` (11/16) to `display` (28/36). The mocks' half-pixel sizes round to
  the nearest role. Import `@amends/ui-v2/foundations/typography/fonts` once at an app entry point.
- **Space** ([tokens](src/foundations/space/tokens.ts)): a 4px grid with 2, 6, and 10px half
  steps. Corners are square throughout; there is no radius scale.
- **Elevation** ([tokens](src/foundations/elevation/tokens.ts)): shadows for modals, popovers,
  and toasts only. Panels are flat and separated by dividers.
- **Theme** ([Theme](src/foundations/theme/theme.tsx)): `<Theme mode="light">` applies a mode's
  variables, Inter, and body text. A nested Theme starts its own scope. Styles read values from
  `vars` in `@amends/ui-v2/foundations/theme`. CSS variable names start with `amends-v2-`, so this
  package can load beside `@amends/ui`.

## Components

Small pieces the patterns share: `Logo` (the finalized mark; its patch lifts when the link or
button holding it is hovered), `IconButton` (32px or 24px compact), `Avatar` and `AvatarStack`
(square initials in eight tones), `Count` (badge or plain), and `Tabs` (links or buttons, one
scrolling row, underlined current tab). Below 64rem icon buttons, tabs, and navigation rows grow
to 44px touch targets.

## The shell

`Shell`, `Rail`, `Sidebar`, and `Pane` implement the first four patterns:

```tsx
<Shell.Root>
  <Shell.Navigation>
    <Rail.Root>…Rail.Brand, Rail.List of Rail.Item, Rail.Footer…</Rail.Root>
    <Sidebar.Root aria-label="Workspace">…Header, Body, Sections…</Sidebar.Root>
  </Shell.Navigation>
  <Shell.Main>
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkChannel} context="Mercier & Co">
          general
        </Pane.Title>
        <Pane.Actions>…</Pane.Actions>
        <Pane.Tabs>
          <Tabs.List aria-label="Group">…</Tabs.List>
        </Pane.Tabs>
      </Pane.Header>
      <Pane.Body>…</Pane.Body>
      <Pane.Footer>…composer…</Pane.Footer>
    </Pane.Root>
  </Shell.Main>
  <Show when={thread()}>
    <Shell.Aside aria-label="Composer paste crash" onClose={closeThread}>
      <Pane.Root variant="side">…Pane.Back, Pane.Title, Pane.Close, Pane.Subtitle…</Pane.Root>
    </Shell.Aside>
  </Show>
</Shell.Root>
```

A Pane's header, tabs, and footer stay in place while its body scrolls. Headers are 96px on
desktop and 104px on touch layouts, so the main and side panes line up. The layout follows the
viewport width ([layout tokens](src/foundations/layout/tokens.ts)):

| Width           | Navigation                                        | Side panel                                  |
| --------------- | ------------------------------------------------- | ------------------------------------------- |
| 80rem (1280px)+ | Rail and 264px sidebar                            | 440px, beside the main content in one card  |
| 64–80rem        | Rail and sidebar                                  | 440px, floating over a scrim                |
| 48–64rem        | Rail; the menu button opens the sidebar beside it | Floating                                    |
| below 48rem     | The menu button opens rail and sidebar together   | Full screen with Back; main keeps its state |

The drawer and a floating side panel behave as modal dialogs: they take focus, make the rest of
the shell inert, and close on Escape or a click on the scrim, returning focus. Following a link
in the drawer closes it. On phones the pane runs edge to edge and respects safe-area insets. The
desktop app's title bar is not modelled yet.

## Conversation components

`Message` shows an author's avatar beside the byline and text, with optional `Mention`,
`Reactions`, an agent's `Activity`, a `TaskReference`, and a `Replies` summary joined to the
avatar by a stitched elbow; `active` highlights the message whose thread is open. `Divider` is
the running stitch, optionally labelled ("Today", or "4 replies" leading). `TaskStatus` draws
triage, open, in-progress, and done. `Composer` is a form around an auto-growing field: Enter
sends, Shift+Enter starts a new line, and Send waits for non-blank text. The caller owns the
draft so it survives navigation. Phones use 16px message and field text so the page does not
zoom, and give reactions and the reply summary 44px targets.

## Screens

Screens take plain data and callbacks; web and desktop fill them from client hooks and own
routing. `WorkspaceNavigation` is the rail and the Home sidebar. `GroupPane` is a group's header
and tabs around the current tab, `GroupThreads` is its Threads tab (timeline and composer), and
`ThreadPane` is an open thread in the side panel. `Timeline` renders messages and dividers from
`TimelineEntry` data, and conversations read from the bottom: they open at the newest message
and follow new ones while the reader is at the end. **Screens / Group threads** composes them
with the Lunacy sample data; its Reply and Send stories run as tests.

The mocks draw different composer toolbars per size; the screens use Attach and Mention, which
the icon set covers, at every size.

## Run and verify

From the repository root:

```sh
bun run --filter @amends/ui-v2 dev
bun run test --project @amends/ui-v2
bun run --filter @amends/ui-v2 build
bun run check
```

Storybook serves at `http://127.0.0.1:6010` with hot reload on port 6011. The **Mode** toolbar
switches between light, dark, and both side by side.
