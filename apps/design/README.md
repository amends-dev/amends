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
placeholder, filled, invalid, and with a hint under it; a hint; a textarea; a grid of selects, side
by side and wrapping in a narrow column; a select with its label hidden, in a row beside a name; a
field with its label hidden, in a section that names it; the toggle on and off; a select; the notice
tones, and a notice over a button in a column; `sending`; a form with its inline text and a value with its link, and setting rows with an
action, with a select, with a label alone, and wrapping in a narrow column; the
directory's section and rows; the centered screen as the
sign-in's two steps and as the workspace picker; the toast alone, with a detail, and as a stack of
two, each in a frame of its own; the modal, opened by a button, as a form with a context, a field
that takes the initial focus, a toggle, and a footer of Cancel and a primary button, and as a wide
one with tabs and a description; the marks by size; what a pane says about one thing, as a detail
list, the four badge tones, entries with and without marks, with trailing badges, and with children,
a log short and long, a pane's sections as a task to change, a task to read, and the turns, and a
pane's section that is one form; a
conversation's messages as a list with a current row whose text opens the thread, with a note,
actions, and meta, with a context line under the author and a quiet action, with a form in place of
the text, and set apart by dividers, centered and at the start; a pane's empty state with a title
and a line of copy under a header with an action, and with a title alone, each in a frame of its
own; the composer empty and filled; the shell twice, with and without its side pane, each in a
frame of fixed height, its groups, one of them still on its way, and direct messages through
`sidebarSections`, its threads,
replies, and composers made of `message`, `divider`, and `composer`, the first with the open thread
as a plain row under its group and the second with its notices; and the icons by size, as the shell
draws them, and with a label. The toggles, fields, composers, and select take input, and the modals
open and close. So do the shell's rail and tabs, whose current item follows a click, and the list of
threads, whose current row follows a click. The shell's side pane sits beside the main pane from a window of 80rem; narrow
the window to between 64rem and 80rem to see it float over a scrim, and below 48rem to see it fill the
frame. The frames pass the shell the viewport `Split`, whatever the window's width, so the rail and the
sidebar are always in place, and no menu, so the navigation drawer, a dialog over the whole window, is
for the app to show. Open it to look at a piece
before a page composes it. It follows the browser's light or dark preference. A browser tab that is
hidden never renders a frame, and Foldkit renders on frames, so look at it in a visible tab. `bun
run --filter @amends-dev/design build` bundles it, which CI builds too.

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

Below the desktop breakpoint is touch: controls and the rows of the sidebar grow to 44px, and
headers to 104px, written `max-desktop:`. Below the
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

## The viewport

CSS follows the window's width by itself, but a view that renders different markup at different
widths, such as the shell holding the sidebar in place or in a dialog, has to know it, so an app
keeps it in its model. `@amends-dev/design/viewport` is what both sides share, and the only module
here that is not a renderer:

- `Viewport` is `"Phone"` below 48rem, `"Tablet"` from 48rem, `"Desktop"` from 64rem, and `"Split"`
  from 80rem, the cuts of the theme's breakpoints. It is a schema, so a model or a message holds it.
- `viewportQueries` are the media queries that cut it, `tablet`, `desktop`, and `split`, as
  `(min-width: 48rem)`, `(min-width: 64rem)`, and `(min-width: 80rem)`. They are the rems of the
  `--breakpoint-*` properties in `styles.css`, and the two must agree: change one, change the other.
  An app asks `window.matchMedia` each query at startup, for its flags, and follows them with
  `Dom.streamFromMediaQuery`, for a subscription.
- `viewportOf({ isTablet, isDesktop, isSplit })` is the decision: the widest breakpoint whose query
  matches.

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
- `buttonWith(h, attributes, label, options?)` is the look of `button` over `attributes` that already
  give it its behavior, such as the `closeButton` group a headless dialog publishes, which is also
  what says whether it is disabled, so it takes no `isDisabled`.
- `field(h, config, error)` is a label over a 42px bordered input with the error, an
  `Option<string>`, below it as a `notice` that describes the input. The `config` is
  `{ id, label, type, value, onInput, placeholder?, hint?, isAutofocus?, isLabelHidden?, attributes? }`.
  A field with an error is `aria-invalid` with a danger border. The `placeholder` shows an example
  of what to enter while it is empty. The `hint` is a line of what to know about the input, in the
  look of `hint`, 8px under it as the label is above it; it describes the input while there is no
  error. It takes focus as it shows unless `isAutofocus` is `false`. With `isLabelHidden` the label
  is not shown above the input and still names it, for a field in a section that already has that
  name as its title, such as the one that renames the workspace. The `attributes` are a group a headless component publishes,
  `PublishedAttributes`, that go onto the input, such as a dialog's `initialFocus`, which a field in
  a dialog takes with `isAutofocus` off.
- `hint(h, text)` is a line of quiet text, at hint size in `ink-muted`, for what to know about the
  control next to it.
- `textarea(h, { id, label, value, onInput, rows?, attributes? })` is the input's look over `rows`
  lines, three unless given, with the `attributes` on the box as a field has them.
- `iconButton(h, { icon, label, onClick }, options?)` is a quiet square button of one icon, named by
  `label`, which is all it says to assistive technology: the icon is hidden, and the label is text
  that is not shown, not an `aria-label`, so a button named Reply does not answer a lookup of the
  textarea labelled Reply. It is 32px, and 44px on touch; `options.size` is `"compact"` for the 24px
  button along a list's heading, which is 44px on touch too.
- `iconSubmit(h, { icon, label }, options?)` is that button as a `type="submit"` that sends its form,
  such as the composer's send button.
- `iconButtonWith(h, attributes, { icon, label }, options?)` is that button over `attributes` that
  already give it its behavior, as `buttonWith` is for `button`.
- `buttonRow(h, children)` is a row of controls with an 8px gap, wrapping onto a new line when they do
  not fit, such as a thread's Follow and Rename or a form's Save and Cancel.
- `column(h, children)` is a few pieces that belong together inside a section, one under another and
  12px apart, such as a notice over the button that answers it, or over a Try again row.
- `fieldGrid(h, children)` is fields side by side in columns at least 9rem wide, 12px apart, wrapping
  onto new rows when they do not fit, such as a task's Status, Priority, and Assignee.
- `toggle(h, { id, label, isOn, onToggle })` is a switch with its label after it. The switch is
  named by its label. On touch the switch and its label are each a 44px target.
- `choiceSelect(h, { id, label, choices, value, onChange, attributes? }, options?)` is a select over
  `choices`, each a value and how the person reads it, in the input's look, with the `attributes` on
  the select as a field has them. With `options.isLabelHidden` the label is not shown above the
  select and still names it, for a select in a row that says what it is for, such as a member's role
  beside their name.
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

### `@amends-dev/design/mark`

- `mark(h, { text, size? })` is the square that stands for a person, a workspace, or an agent: the
  `text` letters in capitals on `avatar-neutral`. `size` is `"xs"` (20px, 9px text, as a sidebar row
  shows a person), `"sm"` (the default, 24px, `meta` text, as the sidebar's header and a pane's title
  show it), or `"md"` (32px, `hint` text, as a message shows its author). A mark is `aria-hidden`: the
  name it abbreviates is always beside it. `sidebarHeader`, `sidebarItem`, `pane`, and `message` draw
  their marks with it.

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

- `form(h, { onSubmit, label?, variant? }, children)` is the `form` element sending `onSubmit`, its
  children in a column with a 16px gap. A `label` becomes its `aria-label`, which makes it a form
  landmark. `variant` is `"screen"` (the default), 36px below the text above it, or `"pane"`, with no
  space above it, for a form inside a pane or a message, such as renaming a thread.
- `inline(h, children)` is a row of text and links with a 4px gap, at hint size in `ink-secondary`,
  such as "Need a new code?" beside its Send again link. A child is an `Html` or a string.
- `valueWithAction(h, value, action)` is what the person entered, in `ink`, with the link that
  changes it at the right, such as an email and Change email.
- `settingRow(h, { label, copy?, action? })` is one setting as a row, as the group settings mock shows
  its membership: the `label` at item size in medium weight in `ink` over the `copy` at hint size in
  `ink-secondary`, and the `action`, any control, at the right. When they do not fit side by side,
  because the text would be narrower than 12rem, the action wraps to a line of its own, at the start.

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

- `shell(h, { viewport, rail, sidebar, main, aside?, notices?, menu? })` puts the `rail` on the
  canvas, then one `panel` card holding the `sidebar`, a divider, the `main` pane, and, when there is
  an `aside`, the side pane at 440px. Each is what its module renders. The `notices`, a `toastStack`,
  come last in the frame, over the card and the scrim. The frame is as tall as the viewport (`100dvh`,
  or `--amends-screen-height` where an ancestor sets it, as the workshop does), with an 8px gutter
  around the card. The `viewport` is the window's width, a `Viewport` that the app keeps in its model
  (see [the viewport](#the-viewport)), and the layout follows it:

  | Viewport  | Width       | Navigation                                                      | Side pane                                                      |
  | --------- | ----------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
  | `Split`   | 80rem+      | Rail and sidebar in place                                       | Beside the main pane, a divider between them                   |
  | `Desktop` | 64 to 80rem | Rail and sidebar in place                                       | Floating over the right of the card, over a scrim              |
  | `Tablet`  | 48 to 64rem | The rail stays; the menu button opens the sidebar in a dialog   | Floating, as above                                             |
  | `Phone`   | below 48rem | The menu button opens the rail and sidebar together in a dialog | Full screen over the main pane, which keeps its state under it |

  The floating pane has `shadow-popover` over a `scrim` that covers the rest of the shell, and the
  pane's own close button is the way out of it. Below 48rem the frame has no gutter and no gap, so the
  card is edge to edge, and its padding is the screen's safe-area insets (an app gets them with
  `viewport-fit=cover` in its viewport meta); the side pane has no shadow or scrim, and `paneBack`
  shows in its header in place of `paneClose`. Below 64rem the controls and pane headers have their
  touch sizes (44px, and 104px for a header).

  The viewport decides what is rendered, not what CSS hides: at `Desktop` and `Split` the sidebar is
  in the card, and below them it is in the drawer instead, never in both; at `Phone` the rail is in
  the drawer too, and the frame holds neither. The controls, rows, and headers keep their touch sizes
  in CSS, from `max-desktop:`, and so does the room a pane's header leaves for the menu button.

  The `menu` is `{ onOpen, dialog }`. Where the frame lacks the sidebar, the shell draws the menu
  button, an `iconButton` named Menu that sends `onOpen`, at the top start of the card over the main
  pane's header, and the drawer by `menu.dialog`: the page lends the shell its bound dialog's view,
  `(toView) => h.block(MenuBinding.embedView({ slotId, model, viewInputs: { toView } }))`, and the
  shell decides what the dialog holds. That is a `ModalRender`, the `RenderInfo` of `@foldkit/ui`'s
  headless dialog, from `modal.ts`, which the shell imports from there. While the dialog is visible
  it is a `dialog` element, transparent and unpadded, with a backdrop over the whole window in
  `scrim` and a panel at the start of the window, `shadow-modal` on `panel`: an `sr-only` `h2`
  named Navigation, which names the dialog, then the rail at `Phone`, then the sidebar, which keeps
  its own 264px. At `Tablet` the panel sits beside the rail, which stays in the frame. Below 48rem
  its padding is the screen's safe-area insets. It slides in from the start, a 150ms transition of
  `translate` from `starting:` styles, mirrored in right-to-left and off for reduced motion; closing
  is instant, since the dialog is not animated.

  The dialog is the framework's, so the drawer gets what a dialog gets: focus is trapped in it and
  returns to where it was when it closes, the rest of the window is inert, Escape closes it, and
  so does a click on the backdrop. The page closes it itself when a destination is picked, and when
  the window grows to `Desktop`. Without a `menu` there is no button and no dialog at any viewport, as
  in the workshop's frames, and below `Desktop` the sidebar is simply absent. The workshop's frames
  pass `viewport: "Split"`, so they show the rail and the sidebar in place, and no drawer: it is a
  window-level overlay, so look at it in the app, narrowing the browser window. The floating and
  full-screen layouts of the side pane are CSS from the window's width and do not yet trap focus or
  make the rest of the window inert; that is the next step.

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
- `sidebarHeader(h, { mark, name, actions?, search? })` is the 96px header, 104px on touch, as tall as
  a pane's, with
  a line under it: a 24px `mark` holding the `mark` letters, the workspace's `name`
  at body size in medium weight, `actions` at the right such as an `iconButton` that opens the
  workspace menu, and, when there is a `search`, `{ label, shortcut?, onClick }`, a full-width button
  in `search` under them, named by `label`, with the `shortcut` shown at its end and hidden from
  assistive technology.
- `sidebarSection(h, { label?, actions?, children })` is a group of items. A `label` is an `h2` in
  `meta` size, uppercase, in `ink-muted`, with icon-only `actions` at its right, such as compact
  `iconButton`s; on touch the heading is 44px tall, as they are. A group without a label is the list
  alone, as a sidebar's first is. Sections sit 22px apart. `children` are `sidebarItem`s or a
  `sidebarEmpty`.
- `sidebarItem(h, { icon?, mark?, label, count?, isPending?, isCurrent, onClick, children? })` is a
  38px row, 44px on touch, one button: an `icon`, or a `mark` letter on a 20px `mark` square for a
  person, then the `label` in `ink-secondary` and a `count` in a badge at the end. A row that
  `isPending`, as a group still being created is, says "Sending…" at its end at `meta` size in
  `ink-muted` in the count's place; a pending row has no count. The button is named by the label
  and described by what is at its end, the count or "Sending…". The current row is `aria-current="page"`, filled `selected`, in `ink`
  and medium weight, with the `indicator-bar`. `children` are `{ icon?, label, isCurrent, onClick? }`
  rows under it at hint size, 32px, 44px on touch, indented and joined to it by a dashed connector in `stitch`,
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
  tall, and 104px below 64rem, so the main pane's, the side pane's, and the sidebar's line up: a 60px
  row, then the `tabs` or a `subtitle`. In the row, `leading` is a control that brings its own
  spacing, such as `paneBack`, then the title with an `icon` or a `mark` letter before it and
  `context` after it in `ink-secondary`, and `actions` at the right. The main pane's row starts 40px
  further in below 64rem, for the shell's menu button over it; its tabs and subtitle keep the pane's
  gutter, and the side pane's row is not moved. The line under the header is drawn inside it, so the
  current tab's bar sits over the line. A `subtitle` shows only when there are no `tabs`.
- `paneTabs(h, { label, tabs })` is a `tablist` named by `label` of `{ label, count?, isCurrent,
onClick }` tabs: buttons that are `aria-selected`, the current one in `ink` and medium weight with
  a 2px `indicator` bar under it. The tab is named by its label and described by its `count`, which
  shows in a badge after it. Tabs are all in the tab order; arrow keys do not move between them.
- `paneEmpty(h, { icon, title, copy? })` is what a pane's body says when it has nothing to list, a
  centered column 64px under the header and 20rem wide at most: a 40px square on `subtle` holding the
  `icon` at `md` in `ink-secondary`, the `title` as an `h2` at item size in medium weight, under the
  pane's `h1`, and the `copy` under it at hint size in `ink-muted`. The icon is hidden from assistive
  technology.
- `paneColumn(h, children)` is the one column of a page about one item: 680px at most, its sections
  40px apart, with nothing beside it.
- `paneSection(h, { title, trailing?, children })` is a section of that column, a `section` named by
  its title: the title as an `h3` at item size in medium weight, with the `trailing` pieces after it on
  the same line, such as `sending` or a `badge`, then the `children` in a column 12px apart.
- `paneForm(h, { title, onSubmit }, children)` is a section of that column that is one form, named
  and titled alike: a `paneSection` of the `title` holding a `pane` `form` of the same name that
  sends `onSubmit`, with the `children`, its fields and buttons, in the form's column. The section
  is a region and the form a landmark, both found by the `title`.
- `paneClose(h, onClick)` is the side pane's close button, an `iconButton` named Close, for the
  header's `actions`. It shows from 48rem; below that the side pane is full screen and has `paneBack`.
- `paneBack(h, onClick)` is the side pane's Back button, an `iconButton` named Back, for the header's
  `leading`, pulled to the pane's edge. It shows below 48rem only. Page code gives the two the same
  message, so each way out of the side pane does the same.

### `@amends-dev/design/details`

What a pane says about one thing.

- `detailList(h, items)` is a definition list of `{ label, value }` items, the `value` text or any
  `Html`: two columns, each `label` at hint size in `ink-muted` at least 5rem wide before its value at
  item size in `ink`, rows 8px apart.
- `badge(h, { label, tone? })` is a small inline mark of how something stands, 20px tall, at `meta`
  size in medium weight. `tone` is `"neutral"` (the default) on `subtle`, or `"success"`, `"caution"`,
  or `"danger"` on its own surface and text with a 1px border.
- `entryList(h, { label, children })` is a `ul` named by `label`, a column with no list style, of
  `entry`s. It is for lists of people or agents' work, such as a thread's turns, and of people, such as
  a workspace's members and the invitations waiting.
- `entry(h, { key, mark?, title, trailing?, children? })` is one item of it, keyed by `key`: the `mark`
  letters, the `sm` mark, at the start when it has them, then a column of the `title` at item size in
  medium weight with the `trailing` pieces after it, wrapping onto a new line when they do not fit,
  such as a `badge`, a `hint`, or `sending`, and under it the `children`, 8px apart, such as a failure,
  a `buttonRow`, and a `log`. A row has 8px above and below.
- `log(h, { label, items })` is an `ol` named by `label` on `subtle`, one `items` line each in the mono
  font at hint size, wrapping long lines. It is 15rem tall at most and scrolls past that, and takes
  keyboard focus so a keyboard can scroll it.

### `@amends-dev/design/message`

What a conversation is made of.

- `messageList(h, { label, children })` is an `ol` named by `label`, a column with no list style, of
  `message`s and `divider`s.
- `message(h, config)` is one row of it, keyed by `config.key`: the author's `mark` letters at 32px,
  then a column of the author line, the context, the text, and the meta row. The author line is the
  `author` at item size in medium weight, the `time` after it at `meta` size in `ink-muted`, already
  formatted, and a `note` after that as ` · ${note}`, such as "edited" or "Sending…"; `actions` are
  quiet buttons at its end, such as Edit and Delete. The `context` is a line under it at `meta` size in
  `ink-muted`, saying where the message comes from, such as a notification's thread and group. The
  `text` is at body size; with `onOpen` it is a button named by the
  text that sends `onOpen`, aligned to the start, underlined on hover, for a message that is the start
  of a thread, and `body` takes its place, such as the form that edits it. `meta` is a row of quiet
  facts under the text at hint size, such as "2 new" and a task's status. `isCurrent` fills the row
  with `selected`, draws the `indicator-bar` at its start as the sidebar's current row has, and makes it
  `aria-current="true"`. A row has 10px of space above and below and reaches 12px into the pane's
  gutter, so the fill of the current row reaches past the text.
- `divider(h, label, options?)` is an item of the list with a dashed `stitch` rule and the `label` in
  capitals at `meta` size in `ink-muted`: `options.align` is `"center"` (the default), the label between
  two rules, as a day sets apart the messages after it, or `"start"`, the label before one rule that
  runs on, as "4 replies" sets apart the replies to the opening message. The rules are hidden from
  assistive technology; the label is read as an item of the list.

### `@amends-dev/design/composer`

- `composer(h, { id, label, placeholder, value, onInput, onSubmit, submitLabel })` is where the person
  writes a message: a form named by `label` (through `aria-labelledby`, so a lookup by `label` finds
  the textarea and not the form), a box with a border that darkens while the person writes in it,
  holding a textarea for `id` and, under it, the send button at the end. The textarea has the
  `label` for assistive technology and does not show it, shows the `placeholder` while it is empty, has
  no border of its own, and grows with what is typed between 2.5rem and 15rem. The button is an
  `iconSubmit` named `submitLabel` showing the `mark-send` icon; it submits the form, which sends
  `onSubmit`. Enter adds a line.

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

### `@amends-dev/design/modal`

What takes the person's whole attention until they finish or cancel, such as a form to start a team
or a group's settings. It is the look of `@foldkit/ui`'s headless dialog, so the framework keeps
the `dialog` element, the focus inside it, Escape, the click on the scrim, and the labels.

- `modal(h, render, config)` renders `render`, the `RenderInfo` the dialog's view publishes: nothing
  but the `dialog` element while the dialog is not visible, and a panel over a scrim while it is.
  The `config` is:
  - `title`, which heads the panel and names the dialog, as an `h2` at title size in medium weight,
    and the optional `context` after it in `ink-secondary`, such as `# general`. They sit in a header
    60px tall under `px-6` with a line under it, and at its end is a Close button, an icon button of
    `mark-close`. The optional `tabs`, a `paneTabs`, sit under that row inside the header, as a
    pane's do.
  - `body`, which scrolls, in a column 16px apart. The optional `description` is its first line, at
    hint size in `ink-secondary`, and describes the dialog to assistive technology, so the Block
    passes `hasDescription: true` to the dialog's view when it gives one.
  - `footer` and `cancelLabel`, which are both optional, and make a footer under a line when either
    is given. Its buttons sit at the end 8px apart: a quiet Cancel that closes the dialog when there
    is a `cancelLabel`, then the `footer`'s controls, the one the modal exists for last, such as a
    `submit`.
  - `onSubmit`, which makes the panel a form that sends it, so a `submit` in the footer sends it.
    Close and Cancel are `type="button"`, so they close without sending it. Without `onSubmit` the
    panel is a `div`.
  - `width`, `"form"` (the default) for a panel 26rem wide, or `"wide"` for 32rem. A panel is
    never wider than the window less a 1rem gutter on each side, nor taller than the window less
    4rem. It is `raised` with `shadow-modal` and no rounding, over a `scrim-strong` scrim.

A Block uses it in four steps:

- It binds `DialogBlock` from `@foldkit/ui/dialog` as a child, with an `id` for the dialog through
  `init`.
- Its update opens and closes the dialog with the Binding's `requestOpen()` and `requestClose()`,
  and folds the dialog's `Closed` out message into whatever the modal was for, such as dropping the
  form's content.
- Its view embeds the dialog after its other markup, with
  `toView: (render) => modal(h, render, config)`.
- The control that should take focus when the dialog opens gets `render.initialFocus` through its
  `attributes`, and a `field` there is given `isAutofocus: false`, since the dialog moves the focus
  itself.

The groups Block's form for a new team does all four.

## Tests

`bun run test --project @amends-dev/design` runs the scene tests in happy-dom. They drive each
renderer family as a person does, through what the app's own tests query: a button by
`role("button", { name })`, a field by its label, an invalid field's `role("alert")`,
`aria-invalid`, and description, a switch by its label, a select's change, also when its label is
hidden, a setting row's label, copy, and action, the centered screen's
landmarks, a form by its label, with the pane variant of a form the same; a row by its title; an
icon by `role("img", { name })` when it has a label and as `aria-hidden` when it has none; a rail
destination by `role("button", { name })` with `aria-current`; a sidebar item by its name with
`aria-current` and its count, the row under it as a button or as a plain row, and the sections of
`sidebarSections` among the sidebar's own; a tab by `role("tab")` with `aria-selected`; a pane's
section by `role("region")` and its `h3`, its trailing pieces and children; a pane's empty state by
its `h2` under the pane's `h1`, its copy, and its icon as `aria-hidden`; a detail list's labels
and values, a value that is a button; a badge by its label; an entry list by `role("list")`, an
entry by its title, its mark hidden from assistive technology, its trailing pieces and its children,
and a log by `role("list")` with a line for each item; a grid's fields found by their labels; a
toast by `role("alert")` with its text, detail, and button, in the stack's live region; a modal by its
title as a level 2 heading, which names the dialog once a real `DialogBlock` has opened it, its
context, description, tabs, and footer, the control given `initialFocus` by its marker, and Close and
Cancel by closing the dialog without sending the form; a message by
its text button, `aria-current`, its note, context, actions, meta, and body, and a divider by its label in
the list; a composer by its form, the textarea found by the same label, the placeholder, and the
send button; a mark as `aria-hidden`; and the shell's landmarks by role and name: `navigation` for
the rail and the sidebar, `main`, and `complementary`, with its notices, and by viewport: the sidebar
in place at `Desktop` and `Split` with no Menu button, and at `Tablet` and `Phone` a Menu button, the
sidebar, and at `Phone` the rail, inside the dialog named Navigation once it is visible and nowhere
before. They query no class. The viewport's decision, `viewportOf`, is a plain test.
