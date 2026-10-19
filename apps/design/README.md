# @amends-dev/design

The look of [`app-v2`](../app-v2/README.md): the tokens as a Tailwind v4 theme, and renderers,
functions that take the caller's `h` builder and a config and return `Html` carrying the Tailwind
classes. Block and page views call the renderers and never carry a class themselves. `h.Class`
appears in this package alone, so a headless build of the Blocks is this package with its classes
emptied. The package is internal to this repository and not published to npm.

It is built from the Lunacy mocks in
[`design-system/Amends Group Exploration.free`](../../design-system/), as [`ui`](../ui/README.md)
is, and imports nothing of `ui`. The design is flat and quiet: no rounded corners, 1px dividers
between panel regions, shadows on floating layers only, one saturated color for status marks, and
the rest shades of gray.

## The workshop

```sh
bun run --filter @amends-dev/design workshop   # http://127.0.0.1:4420/
```

A small Foldkit app in `workshop/` that shows every renderer in every state under a heading each:
buttons by variant, disabled, large, and wide, with the link in a sentence; a field empty, with a
placeholder, filled, and invalid; a hint; a textarea; the toggle on and off; a select; the notice
tones; `sending`; a form with its inline text and a value with its link; the directory's section
and rows; the centered screen as the sign-in's two steps and as the workspace picker; the toast
alone, with a detail, and as a stack of two, each in a frame of its own; the shell twice, with
and without its side pane, each in a frame of fixed height, its groups and direct messages
through `sidebarSections`, the first with the open thread as a plain row under its group and the
second with its notices; and the icons by size, as the shell draws them, and with a label. The toggles, fields, and select take input, and so do the
shell's rail and tabs, whose current item follows a click. The shell's side pane sits beside the
main pane from a window of 80rem; narrow the window to between 64rem and 80rem to see it float over
a scrim. Open it to look at a piece before a page composes it. It follows the browser's light or dark preference. A browser tab
that is hidden never renders a frame, and Foldkit renders on frames, so look at it in a visible
tab. `bun run --filter @amends-dev/design build` bundles it, which CI builds too.

## Using it in an app

An app depends on `@amends-dev/design` with `workspace:*`, adds `tailwindcss` and
`@tailwindcss/vite` to its dev dependencies, and puts `tailwindcss()` among its Vite plugins. Its
stylesheet imports the theme, and its `index.html` links that stylesheet:

```css
@import "@amends-dev/design/styles.css";
```

The theme scans this package's sources for classes itself, so an app adds no `@source`. A view
imports a renderer by module, such as `@amends-dev/design/control` or `@amends-dev/design/form`, and
passes it the builder it was given.

## Tokens

`src/styles.css` holds the whole theme. Each role is a custom property `--amends-<role>` with its
light value on `:root` and its dark value under `prefers-color-scheme: dark`, and an `@theme inline`
block gives each a Tailwind name, so a utility exists for every role. The block clears Tailwind's
defaults for colors, fonts, type sizes, shadows, radii, and breakpoints, so a class outside the
design, such as `bg-red-500` or `rounded-md`, does not exist. Spacing is Tailwind's 4px grid.

| Family      | Names                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces    | `canvas`, `panel`, `raised`, `popover`, `field`, `search`, `hover`, `active`, `selected`, `rail-selected`, `subtle`, `mention`, as `bg-*`                                  |
| Text        | `ink`, `ink-secondary`, `ink-muted`, `ink-disabled`, `agent`, `on-action`, as `text-*`                                                                                     |
| Borders     | `divider`, `outline`, `outline-strong`, `outline-selected`, `outline-danger`, `stitch`, as `border-*`                                                                      |
| Actions     | `action`, `action-secondary`, `indicator`                                                                                                                                  |
| Status      | `success`, `caution`, and `danger`, each as `-mark`, `-text`, `-surface`, and `-border`; `scrim` and `scrim-strong`                                                        |
| Avatars     | `avatar-<tone>-bg` and `avatar-<tone>-fg` for `neutral`, `sand`, `lilac`, `clay`, `olive`, `slate`, `sage`, and `ink`                                                      |
| Shadows     | `shadow-modal`, `shadow-popover`, `shadow-toast`                                                                                                                           |
| Fonts       | `font-sans`, Figtree at 400, 500, and 600, and `font-mono`, Geist Mono, both from Fontsource                                                                               |
| Text scale  | `text-meta` 11/16, `hint` 12/18, `control` 13/20, `item` 14/21, `body` 15/23, `body-touch` 16/24, `title-touch` 17/24, `title` 18/27, `heading` 20/28, and `display` 28/36 |
| Breakpoints | `tablet` 48rem, `desktop` 64rem, `split` 80rem                                                                                                                             |

Below the desktop breakpoint is touch: controls grow to 44px, written `max-desktop:`. Below the
tablet breakpoint is a phone, where inputs use 16px text so the browser does not zoom the page,
written `max-tablet:`.

Four utilities are the theme's own. `focus-ring` draws a 2px outline in `ink`, offset 2px outside
a control that has keyboard focus, and `focus-ring-inset` draws it inside, for full-width rows that
would clip an outer one. `indicator-bar` draws the 2px, 20px-tall bar that marks the current rail
destination and sidebar row, at the inline start of an element that is `relative`; a variant such as
`aria-[current=page]:indicator-bar` shows it on the current one only. `chevron-down` draws the arrow
of a select on the element it is on, which must hold the select. The base styles set `html` to the sans font, `ink`, and `canvas`, and `body`
to the `body` size with no margin; the size is on `body` because on `html` it would make a rem 15px
instead of the 16px the scale is written in.

## Renderers

A renderer takes `h` first, then its config, then anything optional, and returns `Html`. Each is
generic over the builder's `<Message, Requirements>`, so it renders in any Block's frame. A variant
is an option with a default, never a second function. No amends domain type appears here: a choice
is `readonly [value, label]`.

Accessibility belongs to the headless components under them and survives the styling: every
control keeps its label association, role, `aria-invalid`, and keyboard behavior.

### `@amends-dev/design/control`

- `button(h, label, onClick, options?)` sends `onClick`. `options.variant` is `"secondary"` (the
  default, a bordered button), `"primary"` (filled, for the action a form exists for), `"quiet"`
  (text only, for a row's actions such as Remove and Cancel), or `"link"` (underlined text in `ink`,
  at the size of the line around it with no padding or border, for a link in a sentence such as
  Change email). `options.size` is `"large"` for the 44px, item-size button of a centered screen; a
  link ignores it. `options.wide` fills the container, and `options.isDisabled` marks it
  `aria-disabled` and sends nothing. A button is 36px tall, a quiet one 32px, and every one but a
  link 44px on touch.
- `submit(h, label, options?)` is a button of `type="submit"`, primary unless `options.variant`
  says otherwise.
- `field(h, { id, label, type, value, onInput, placeholder?, isAutofocus? }, error)` is a label
  over a 42px bordered input with the error, an `Option<string>`, below it as a `notice` that
  describes the input. A field with an error is `aria-invalid` with a danger border. The
  `placeholder` shows an example of what to enter while it is empty. It takes focus as it shows
  unless `isAutofocus` is `false`.
- `hint(h, text)` is a line of quiet text, at hint size in `ink-muted`, for what to know about the
  control next to it.
- `textarea(h, { id, label, value, onInput, rows? })` is the input's look over `rows` lines, three
  unless given.
- `iconButton(h, { icon, label, onClick }, options?)` is a quiet square button of one icon, named by
  `label`, which is all it says to assistive technology: the icon is hidden. It is 32px, and 44px on
  touch; `options.size` is `"compact"` for the 24px button along a list's heading.
- `toggle(h, { id, label, isOn, onToggle })` is a switch with its label after it. The switch is
  named by its label.
- `choiceSelect(h, { id, label, choices, value, onChange })` is a select over `choices`, each a
  value and how the person reads it, in the input's look.
- `notice(h, message, options?)` renders an `Option<string>` as an alert in a tone, `"danger"` by
  default, `"caution"`, or `"success"`, and nothing when there is none.
- `sending(h, pending)` is " · Sending…" while an action is on its way, and nothing otherwise.

### `@amends-dev/design/icon`

- `icon(h, name, options?)` draws one of [`icons`](../icons/README.md)'s drawings by name, an
  `IconName`, as an `svg` from its path data under that package's rendering contract: a 24-unit
  viewBox, strokes of width 2 with round caps and joins in `currentColor`, so the icon takes the
  color of the text around it, and a fill too for `bell-filled`. `options.size` is `"xs"`, `"sm"`,
  `"md"` (the default), or `"lg"`, at 0.75, 1, 1.25, and 1.5rem, which scale with the reader's text
  size. An icon is decorative and `aria-hidden`; an `options.label` makes it an image named by that
  label, with a `title`, for one that stands alone with no text beside it.

### `@amends-dev/design/centered`

The sixth layout pattern, for screens outside a workspace such as sign-in and the workspace picker.

- `centered(h, { brand, actions?, width, children })` frames one card on the canvas, `100dvh` tall
  with an 8px gutter, and edge to edge on phones. Its header holds the `brand` on the left and
  `actions` on the right. The body is a column: `width: "form"` centers a 420px column vertically,
  and `"directory"` starts an 800px column near the top. An ancestor that sets
  `--amends-screen-height` shows the card at that height instead of the viewport's, as the
  workshop does to show both widths on one page.
- `heading(h, text)` is the screen's `h1`, at display size, with 12px below it for what follows.
- `copy(h, text)` is a line of secondary text under the heading.

### `@amends-dev/design/form`

What a form screen is made of beside its controls.

- `form(h, { onSubmit, label? }, children)` is the `form` element sending `onSubmit`, its children
  in a column with a 16px gap, 36px below the text above it. A `label` becomes its `aria-label`,
  which makes it a form landmark.
- `inline(h, children)` is a row of text and links with a 4px gap, at hint size in `ink-secondary`,
  such as "Need a new code?" beside its Send again link. A child is an `Html` or a string.
- `valueWithAction(h, value, action)` is what the person entered, in `ink`, with the link that
  changes it at the right, such as an email and Change email.

### `@amends-dev/design/directory`

What a directory screen lists.

- `section(h, { label, count? })` is the label as an `h2`, the count in a 20px `subtle` badge, and a
  dashed line in `stitch` running to the right edge, 36px below what is above it.
- `row(h, { mark, title, meta?, action?, onClick })` is one button the width of its container, at
  least 76px tall: a 40px square mark holding the `mark` letter on `avatar-neutral`, the `title` at
  body size over the `meta` at hint size in `ink-secondary`, and the `action` at the right in
  `ink-secondary`. The row is `hover` on hover. The button is named by the title and described by
  the meta through `aria-description`, and the mark and the action are hidden from assistive
  technology. A page lists rows as `li` items of a `ul`.

### `@amends-dev/design/shell`

The frame of the first four layout patterns, which the modules below fill.

- `shell(h, { rail, sidebar, main, aside?, notices? })` puts the `rail` on the canvas, then one
  `panel` card holding the `sidebar`, a divider, the `main` pane, and, when there is an `aside`, the
  side pane at 440px. Each is what its module renders. The `notices`, a `toastStack`, come last in
  the frame, over the card and the scrim. The frame is as tall as the viewport (`100dvh`, or
  `--amends-screen-height` where an ancestor sets it, as the workshop does), with an 8px gutter
  around the card. From 80rem the aside sits beside the main pane, a divider between them; from
  64rem to there it floats over the right of the card with `shadow-popover`, above a `scrim` over
  the rest of the shell. The floating pane does not trap focus, and Escape and a click on the scrim
  close nothing: the pane's own close button is the way out. Below 64rem the shell is not designed
  yet: it keeps the rail and sidebar in place, with no drawer, no touch sizes for the sidebar's rows,
  and no full-screen pane, and the row overflows the window, scrolling sideways.

### `@amends-dev/design/rail`

- `rail(h, { brand, items, footer, account? })` is the column of global destinations, a `nav` named
  Destinations, 52px wide. The `brand` is `{ letter, label, onClick? }`, a mark with a short line
  under it that is a button named by `label` when it has an `onClick` and an image otherwise. Each
  of `items` and `footer`, the second at the bottom, is `{ icon, label, isCurrent, onClick }`: a
  40px button of the icon alone, named by `label`. The current one is `aria-current="true"`, filled
  `rail-selected`, with the `indicator-bar` at its left edge. The optional `account` is
  `{ letter, label, onClick }`, a 24px `avatar-neutral` square in a button, last of all.

### `@amends-dev/design/sidebar`

- `sidebar(h, { label, header, children, footer? })` is a `nav` named by `label`, 264px on `panel`:
  the `header` above the `children`, which scroll, and the `footer` below them.
- `sidebarHeader(h, { mark, name, actions?, search? })` is the 96px header, as tall as a pane's, with
  a line under it: a 24px `avatar-neutral` square holding the `mark` letter, the workspace's `name`
  at body size in medium weight, `actions` at the right such as an `iconButton` that opens the
  workspace menu, and, when there is a `search`, `{ label, shortcut?, onClick }`, a full-width button
  in `search` under them, named by `label`, with the `shortcut` shown at its end and hidden from
  assistive technology.
- `sidebarSection(h, { label?, actions?, children })` is a group of items. A `label` is an `h2` in
  `meta` size, uppercase, in `ink-muted`, with icon-only `actions` at its right, such as compact
  `iconButton`s; a group without one is the list alone, as a sidebar's first is. Sections sit 22px
  apart. `children` are `sidebarItem`s or a `sidebarEmpty`.
- `sidebarItem(h, { icon?, mark?, label, count?, isCurrent, onClick, children? })` is a 38px row,
  one button: an `icon`, or a `mark` letter on a 20px `avatar-neutral` square for a person, then the
  `label` in `ink-secondary` and a `count` in a badge at the end. The button is named by the label
  and described by the count. The current row is `aria-current="page"`, filled `selected`, in `ink`
  and medium weight, with the `indicator-bar`. `children` are `{ icon?, label, isCurrent, onClick? }`
  rows under it at hint size, 32px, indented and joined to it by a dashed connector in `stitch`,
  such as a group's open thread. A row with an `onClick` is a button; one without is a plain row, a
  `span` with the same look and no hover, pointer, or focus ring, that says where the person is, and
  is `aria-current="page"` while it is current.
- `sidebarSections(h, children)` is the column of `sidebarSection`s a Block renders for the sidebar,
  with 22px between them, the gap the sidebar's own body puts between its sections, so a Block's
  sections lie among the sidebar's own. `children` may also hold what comes with them, such as a
  notice above them or a form below.
- `sidebarEmpty(h, text)` is a quiet line for a section with no items, in the items' place.
- `sidebarFooter(h, children)` is the strip at the bottom of the sidebar, under a line.

### `@amends-dev/design/pane`

The third and fourth layout patterns share one structure.

- `pane(h, { variant, label?, header, body, footer? })` is a column of a header, a `body` that
  scrolls, and a `footer` that stays in place. The `"main"` variant is the page's `main` landmark,
  its title an `h1` at title size; the `"side"` variant is an `aside` named by `label`, its title an
  `h2` at body size, in medium weight. A `label` names the main landmark too.
- The `header` is `{ title, icon?, mark?, context?, leading?, actions?, tabs?, subtitle? }`, 96px
  tall on desktop so the main pane's, the side pane's, and the sidebar's line up: a 60px row, then
  the `tabs` or a `subtitle`. In the row, `leading` is a control such as the button that opens the
  sidebar, then the title with an `icon` or a `mark` letter before it and `context` after it in
  `ink-secondary`, and `actions` at the right. The line under the header is drawn inside it, so the
  current tab's bar sits over the line. A `subtitle` shows only when there are no `tabs`.
- `paneTabs(h, { label, tabs })` is a `tablist` named by `label` of `{ label, count?, isCurrent,
onClick }` tabs: buttons that are `aria-selected`, the current one in `ink` and medium weight with
  a 2px `indicator` bar under it. The tab is named by its label and described by its `count`, which
  shows in a badge after it. Tabs are all in the tab order; arrow keys do not move between them.
- `paneColumn(h, children)` is the one column of a page about one item: 680px at most, its sections
  40px apart, with nothing beside it.
- `paneClose(h, onClick)` is the side pane's close button, an `iconButton` named Close, for the
  header's `actions`.

### `@amends-dev/design/toast`

What floats over the shell's corner, for something that went wrong and the one thing to do about it.

- `toastStack(h, children)` is the column of toasts pinned to the bottom end corner of the shell's
  frame, 16px from each edge and 25rem wide at most, with 8px between them, above the panes and the
  scrim. It is an `aria-live="polite"` region, there before the first toast so each is announced as it
  arrives. `children` are `toast`s, or a `notice`. The frame it sits in must be `relative`, as the
  shell's is.
- `toast(h, { text, detail?, action: { label, onClick } })` is a `role="alert"` card, `raised` with
  a border and `shadow-toast`: the `text` at body size, the `detail` under it at hint size in
  `ink-secondary`, clamped to three lines, such as the words an action carried, and at the right the
  `action` as a quiet `button`, such as Dismiss.

## Tests

`bun run test --project @amends-dev/design` runs the scene tests in happy-dom. They drive each
renderer family as a person does, through what the app's own tests query: a button by
`role("button", { name })`, a field by its label, an invalid field's `role("alert")`, `aria-invalid`,
and description, a switch by its label, a select's change, the centered screen's landmarks, a form
by its label, and a row by its title; an icon by `role("img", { name })` when it has a label and as
`aria-hidden` when it has none; a rail destination by `role("button", { name })` with
`aria-current`; a sidebar item by its name with `aria-current` and its count, the row under it as a
button or as a plain row, and the sections of `sidebarSections` among the sidebar's own; a tab by
`role("tab")` with `aria-selected`; a toast by `role("alert")` with its text, detail, and button, in
the stack's live region; and the shell's landmarks by role and name: `navigation` for the rail and
the sidebar, `main`, and `complementary`, with its notices. They query no class.
