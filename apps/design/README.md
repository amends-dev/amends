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
buttons by variant, disabled, large, and wide, with the link in a sentence, and icon buttons, regular and compact, and as a switch, off and pressed; a field empty, with a
placeholder, filled, invalid, and with a hint under it; a hint; a textarea; a grid of selects, side
by side and wrapping in a narrow column; a select with its label hidden, in a row beside a name; a
field with its label hidden, in a section that names it; the toggle on and off; a select; the notice
tones, and a notice over a button in a column; `sending`; a form with its inline text and a value with its link, and setting rows with an
action, with a select, with a label alone, and wrapping in a narrow column; the
directory's section and rows, and a table of three groups' rows with cells, under the line that says
what it holds and the labels of its columns, and a row with cells and no action; the centered screen as the
sign-in's two steps and as the workspace picker, each with its pieces in `screenContent` as the app's
pages return them; the toast alone, with a detail, and as a stack of
two, each in a frame of its own; the modal, opened by a button, as a form with a context, a field
that takes the initial focus, a toggle, and a footer of Cancel and a primary button, and as a wide
one with tabs and a description; the marks by size, and the cluster of two, three, and seven; what a pane says about one thing, as a detail
list, the four badge tones, entries with and without marks, with trailing badges, and with children,
entries that are buttons, the second of them active, a log short and long, a pane's sections as a task to change, a task to read, and the turns, and a
pane's section that is one form; a
conversation's messages as a list with a current row whose text opens the thread, with a note,
actions, and meta, with the replies under a row as one reply, three people, and more people than the
line shows, with a mention in the text as a chip, in plain text, in a row that opens a thread, and in
the current row, with a form in place of the text, and set apart by dividers, centered and at the
start, and notifications under the days Today and Yesterday, unread with a dot and a quiet action and
read; a pane's empty state with a title
and a line of copy under a header with an action, and with a title alone, each in a frame of its
own; a pane's column keeping its measure around a form and, wide, spanning the pane around a table of
groups, each in a frame wider than the measure; the composer empty, filled, and with its list of members to mention open on the second; the shell twice, with and without its side pane, each in a
frame of fixed height, its groups, one of them still on its way, and direct messages through
`sidebarSections`, its threads,
replies, and composers made of `message`, `divider`, and `composer`, the first with the open thread
as a plain row under its group and the second with its notices; and the icons by size, as the shell
draws them, and with a label. The toggles, fields, composers, and select take input, and the modals
open and close. So do the shell's rail and tabs, whose current item follows a click, and the list of
threads, whose current row follows a click. The frames pass the shell the viewport `Split`, whatever
the window's width, so the rail, the sidebar, and the side pane are always in place, and no menu and a
side pane whose dialog shows nothing, since the navigation drawer and the side pane's dialog are over
the whole window and are for the app to show. A frame makes itself the containing block of the
notices, which are fixed to a window's corner, with `contain: layout`. Open it to look at a piece
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
  name as its title, such as the one that renames the workspace. The `attributes` go onto the input:
  a group a headless component publishes, `PublishedAttributes`, such as a dialog's `initialFocus`,
  which a field in a dialog takes with `isAutofocus` off, and the caller's own, such as `answerKeys`
  and an `aria-activedescendant`, for a field above a list its keys walk (`ControlAttributes`).
- `answerKeys(h, onKeyDown)` is the attribute for a text control above a list that its keys walk, such
  as a search field above its results: `onKeyDown(key)` says what a key sends, or nothing to leave the
  key to the browser, and a key it answers does not do what the browser does for it, such as moving the
  caret or adding a line. A key pressed with Shift, Control, Alt, or Meta is left to the browser. The
  composer's list of members is answered the same way.
- `hint(h, text)` is a line of quiet text, at hint size in `ink-muted`, for what to know about the
  control next to it.
- `textarea(h, { id, label, value, onInput, rows?, attributes? })` is the input's look over `rows`
  lines, three unless given, with the `attributes` on the box as a field has them.
- `iconButton(h, { icon, label, onClick }, options?)` is a quiet square button of one icon, named by
  `label`, which is all it says to assistive technology: the icon is hidden, and the label is text
  that is not shown, not an `aria-label`, so a button named Reply does not answer a lookup of the
  textarea labelled Reply. It is 32px, and 44px on touch; `options.size` is `"compact"` for the 24px
  button along a list's heading, which is 44px on touch too. `options.isPressed` makes it a switch: it
  says `aria-pressed`, and shows it as `ink` while it is on. The caller draws the icon for the state, such
  as `bell` and `bell-filled`, and a button given no `isPressed` says nothing of the kind.
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
  shows a person and a reply line those who replied), `"sm"` (the default, 24px, `meta` text, as the sidebar's header and a pane's title
  show it), or `"md"` (32px, `hint` text, as a message shows its author). A mark is `aria-hidden`: the
  name it abbreviates is always beside it. `sidebarHeader`, `sidebarItem`, `pane`, `message`, and
  `replyLine` draw their marks with it.
- `markCluster(h, { marks, label, onClick })` is a button named `label` that gathers the people a group
  has: a bordered box, 1px in `outline` with 2px of padding, holding the first three `marks` as `xs` marks
  2px apart, and, beyond three, "+4" for four more in `ink-secondary` at `meta` size. It is `hover` on
  hover and 44px tall on touch. The marks and the count are hidden from assistive technology, as a mark is,
  so the `label` says how many people it stands for, such as "7 members".

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
- `screenContent(h, children)` is the pieces of a screen's body as one node, for a view that must return
  one, such as a page. It is `display: contents`, so they lie in the card's column as if it were not
  there, each spacing itself as `heading` and `copy` do. Use it, not `column`, whose gap would add to
  theirs.

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
- `summary(h, { copy, count })` is a line at hint size in `ink-muted` that says what a list holds,
  the `copy`, with the `count`, such as "4 groups", at its end.
- `columns(h, { label, cells })` is the labels of a table's columns over its rows, hidden from
  assistive technology, since each row describes itself: the `label` over the mark and the title,
  filling the width, then one of the `cells` over each cell column, 8rem wide, at meta size in
  `ink-muted` and upper case, over a dashed `stitch` rule. Its end leaves 6rem bare, where a row with
  cells keeps its action, so the labels stay over their cells.
- `row(h, { mark, title, meta?, cells?, cellsText?, action?, onClick })` is one button the width of
  its container, at least 76px tall: a 40px square mark holding the `mark` letter on
  `avatar-neutral`, the `title` at body size over the `meta` at hint size in `ink-secondary`, and the
  `action` at the right in `ink-secondary`. The row is `hover` on hover. The button is named by the
  title and described by the meta through `aria-description`, and the mark and the action are hidden
  from assistive technology. The `cells`, such as a `badge` and a count, each lie in an 8rem column
  between the title and the action, at hint size in `ink-secondary`, under the labels `columns`
  gives them, and are hidden like the mark; `cellsText`, what they say in words, such as "Public ·
  12 members", describes the button after the meta. A row with cells keeps 6rem at its end for its
  action, right-aligned, whether it has one or not. A page lists rows as `li` items of a `ul`.

### `@amends-dev/design/shell`

The frame of the first four layout patterns, which the modules below fill.

- `shell(h, { viewport, rail, sidebar, main, aside?, notices?, menu?, dialogs? })` puts the `rail` on the
  canvas, then one `panel` card holding the `sidebar`, a divider, the `main` pane, and, when there is
  an `aside`, its `view`, the side pane, at 440px at `Split`. Each is what its module renders. The
  `notices`, a `toastStack`, are pinned to the window's bottom end corner, last in the frame or, while
  a dialog is open, inside it. The frame is as tall as the viewport (`100dvh`, or
  `--amends-screen-height` where an ancestor sets it, as the workshop does), with an 8px gutter around
  the card. The `viewport` is the window's width, a `Viewport` that the app keeps in its model (see
  [the viewport](#the-viewport)), and the layout follows it:

  | Viewport  | Width       | Navigation                                                      | Side pane                                                                            |
  | --------- | ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
  | `Split`   | 80rem+      | Rail and sidebar in place                                       | Beside the main pane, a divider between them                                         |
  | `Desktop` | 64 to 80rem | Rail and sidebar in place                                       | In a dialog, floating at the end of the window, over a scrim                         |
  | `Tablet`  | 48 to 64rem | The rail stays; the menu button opens the sidebar in a dialog   | In a dialog, floating, as above                                                      |
  | `Phone`   | below 48rem | The menu button opens the rail and sidebar together in a dialog | In a dialog that fills the window over the main pane, which keeps its state under it |

  The floating pane is inset from the window's top, bottom, and end by the frame's 8px gutter, 27.5rem
  wide at most, with `shadow-popover`, over a `scrim` that covers the window. Below 48rem the frame
  has no gutter and no gap, so the card is edge to edge, and its padding is the screen's safe-area
  insets (an app gets them with `viewport-fit=cover` in its viewport meta); the side pane's dialog
  fills the window with the same insets as its padding, with no shadow and a backdrop that shows
  nothing, and `paneBack` shows in the pane's header in place of `paneClose`. Those two are CSS from
  48rem (`pane.ts`), since a view of the pane does not know the viewport. Below 64rem the controls and
  pane headers have their touch sizes (44px, and 104px for a header).

  The viewport decides what is rendered, not what CSS hides: at `Desktop` and `Split` the sidebar is
  in the card, and below them it is in the drawer instead, never in both; at `Phone` the rail is in
  the drawer too, and the frame holds neither. The side pane is beside the main pane at `Split` and
  in its dialog at every other viewport, never in both. The controls, rows, and headers keep their
  touch sizes in CSS, from `max-desktop:`, and so does the room a pane's header leaves for the menu
  button.

  The `menu` is `{ onOpen, isOpen, dialog }`. Where the frame lacks the sidebar, the shell draws the
  menu button, an `iconButton` named Menu that sends `onOpen`, at the top start of the card over the
  main pane's header, and the drawer by `menu.dialog`: the page lends the shell its bound dialog's
  view, `(toView) => h.block(MenuBinding.embedView({ slotId, model, viewInputs: { toView } }))`, and
  the shell decides what the dialog holds, `isOpen` being the dialog's. That is a `ModalRender`, the
  `RenderInfo` of `@foldkit/ui`'s headless dialog, from `modal.ts`, which the shell imports from
  there. While the dialog is visible it is a `dialog` element, transparent and unpadded, with a
  backdrop over the whole window in `scrim` and a panel at the start of the window, `shadow-modal` on
  `panel`: an `sr-only` `h2` named Navigation, which names the dialog, then the rail at `Phone`, then
  the sidebar, which keeps its own 264px. At `Tablet` the panel sits beside the rail, which stays in
  the frame. Below 48rem its padding is the screen's safe-area insets. It slides in from the start, a
  150ms transition of `translate` from `starting:` styles, mirrored in right-to-left and off for
  reduced motion; closing is instant, since the dialog is not animated.

  The `aside` is `{ view, isOpen, dialog }`, lent the same way from the page's own bound dialog. At
  `Split` the shell puts `aside.view` in the card and never calls `aside.dialog`. At every other
  viewport it calls it, and while the dialog is visible it is a `dialog` element like the drawer's,
  with a backdrop, and a panel holding an `sr-only` `h2` named Thread, which names the dialog, then
  `aside.view`. The look is by viewport: floating at `Desktop` and `Tablet`, filling the window at
  `Phone`.

  The dialogs are the framework's, so each gets what a dialog gets: focus is trapped in it and
  returns to where it was when it closes, the rest of the window is inert, Escape closes it, and
  so does a click on the backdrop. The page closes the drawer itself when a destination is picked, and
  when the window grows to `Desktop`; it opens and closes the side pane's dialog as the thread opens
  and closes, and as the window crosses 80rem. Without a `menu` there is no button and no drawer at
  any viewport, as in the workshop's frames, and below `Desktop` the sidebar is simply absent.

  The rest of the window is inert while a dialog is open, so a toast could not be read or dismissed
  behind it. The `notices` are inside whichever dialog is open, after its panel, above the backdrop
  and in the focus trap, and last in the frame when neither is. Nothing else about the notices
  differs: the stack is fixed, so it is in the same corner of the window in both places. The shell
  decides from the `isOpen` of the two dialogs, which it reads from the page and not from the
  render it hands the dialog's view, because it builds the frame outside that render.

  The `dialogs` are dialogs of the page's own that are not the shell's, such as a search or a form
  in a modal: each is the view of a `DialogBlock` the page binds, embedded with its own `toView`,
  which renders its `dialog` element with nothing in it while it is closed. The shell renders them
  last in the frame, after the notices and so over the drawer and the side pane, at every viewport.
  A dialog the framework opens has to be in the document, and a page that embedded one in the
  sidebar or in a main pane would have none to open whenever the sidebar is in the drawer and shut,
  or the pane is not the one shown. The notices do not move into these dialogs: the rest of the
  window is inert while one is open, so a toast that arrives waits in the frame until it closes.

  The workshop's frames pass `viewport: "Split"` and a side pane whose `dialog` renders nothing, so
  they show the rail, the sidebar, and the side pane in place, and no dialog: both are window-level
  overlays, so look at them in the app, resizing the browser window.

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
- `paneColumn(h, children, options?)` is the one column of a pane's body, its sections 40px apart, with
  nothing beside it. By default it keeps a measure of 42.5rem (`max-w-170`), the right width for what
  is read and filled in: a page about one item, such as the settings, and a connection's form.
  `options.isWide` drops the measure, so the column spans the pane, which is right for a list or a
  table: the group's threads, the groups to browse, the inbox's rows, and the tasks' table, whose
  three cells would be squeezed inside the measure until their titles truncate. The side panes keep
  the measure.
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
  a `buttonRow`, and a `log`. A row has 8px above and below. Given `onClick`, the whole entry is one
  button that sends it, with `key` as its id so that a field can name it as its active descendant,
  filled `hover` on hover and 12px in from the list's edge, and it has no `children`, since a button
  holds no buttons. The button is named by what is in it, its title and its trailing pieces. With
  `isActive` it is filled `selected` and is `aria-current="true"`: the entry the person has reached with
  the arrow keys of the field above the list, whose focus stays in the field, and would open with Enter.
  (`aria-selected` is not for a button, so the entry says it is current, as the sidebar's and a
  message's current rows do.)
- `log(h, { label, items })` is an `ol` named by `label` on `subtle`, one `items` line each in the mono
  font at hint size, wrapping long lines. It is 15rem tall at most and scrolls past that, and takes
  keyboard focus so a keyboard can scroll it.

### `@amends-dev/design/message`

What a conversation is made of.

- `messageList(h, { label, children })` is an `ol` named by `label`, a column with no list style, of
  `message`s, `notification`s, and `divider`s.
- `message(h, config)` is one row of it, keyed by `config.key`: the author's `mark` letters at 32px,
  then a column of the author line, the text, and the meta row. The author line is the
  `author` at item size in medium weight, the `time` after it at `meta` size in `ink-muted`, already
  formatted, and a `note` after that as ` · ${note}`, such as "edited" or "Sending…"; `actions` are
  quiet buttons at its end, such as Edit and Delete. The `text` is at body size, a string or `TextRun`s (below); with `onOpen` it is a button named by the
  text that sends `onOpen`, aligned to the start, underlined on hover, for a message that is the start
  of a thread, and `body` takes its place, such as the form that edits it. `meta` is a row of quiet
  facts under the text at hint size, such as a `replyLine`, "2 new", and a task's status. `isCurrent` fills the row
  with `selected`, draws the `indicator-bar` at its start as the sidebar's current row has, and makes it
  `aria-current="true"`. A row has 10px of space above and below and reaches 12px into the pane's
  gutter, so the fill of the current row reaches past the text.
- `notification(h, config)` is a row of the same list for a notification, keyed by `config.key` and set
  like `message`: the `mark` letters at 32px, then a column of a first line, the place, and the text.
  The first line is the `author` at item size in medium weight, then the `activity` after it in the
  same size, weight, and `ink`, such as "Sara" and "mentioned you", and at its end the `actions`, quiet
  buttons such as Mark seen, then the `age`, already formatted, such as "2m ago" or "Yesterday", at
  `meta` size in `ink-muted`. While `isUnread`, a round 6px dot of `ink`, hidden from assistive
  technology, comes before the age, and an `sr-only` "Unread" takes its place for it, so the row is
  read as unread;
  a row that is not unread has its `text` in `ink-secondary`, quieter than the first line. The
  `place` is a line under it at `meta` size in `ink-muted`, saying where the notification comes from,
  such as "#general" or "Caleb · Direct message", and shows only when given. The `text` is at body size,
  a string or `TextRun`s (below); with `onOpen` it is a button that sends `onOpen`, aligned to the start,
  underlined on hover, and it is named by the author and the activity together, "Sara mentioned you", by
  an `aria-label`, with the text's words as its `aria-description`: the first line is where the row says
  what it is, and the text is what it says. The row has `message`'s spacing and reach into the pane's
  gutter, and no current state.
- `TextRun` is `{ text, isMention? }`, one run of the `text` of a `message` or a `notification`, which
  takes a string or the runs in order. A run is its `text` as it stands; a run with `isMention` is a
  chip: a `span` on `mention`, with 4px of space each side and medium weight, in the ink of the row's
  text, with square corners like every surface here, inline with the words around it, which gain no
  space. The chip is a surface of its own, so it shows in the current row, whose fill is `selected`.
  A text of runs reads as the runs' texts joined, "@Jamie can you check the composer fix": the
  paragraph's text, a button's name when it has no other, and a notification's `aria-description`. A
  caller gives runs for the words it has already shaped, such as a mention's current name; the design
  knows nothing of mentions beyond how a run shows.
- `replyLine(h, { marks, label })` is what the first message of a thread shows in its `meta`, under its
  text: a short tree line that hangs from the row's mark, 12px by 12px with a border at its start and
  its bottom in `outline`, then the `marks`, the letters of those who replied, as `xs` marks overlapping
  by 4px, the first on top so that its letters stay whole, each with a 1px `outline` ring so that the
  ones that overlap stay apart, up to three and then "+N" for the rest, then the `label`, such as
  "4 replies", at `meta` size in `ink-muted`. The tree line, the marks, and the "+N" are hidden from
  assistive technology, since the label says what the line is.
- `divider(h, label, options?)` is an item of the list with a dashed `stitch` rule and the `label` in
  capitals at `meta` size in `ink-muted`: `options.align` is `"center"` (the default), the label between
  two rules, as a day sets apart the messages after it, or `"start"`, the label before one rule that
  runs on, as "4 replies" sets apart the replies to the opening message. The rules are hidden from
  assistive technology; the label is read as an item of the list.

### `@amends-dev/design/composer`

- `composer(h, { id, label, placeholder, value, onInput, onSubmit, submitLabel, suggestions? })` is where the person
  writes a message: a form named by `label` (through `aria-labelledby`, so a lookup by `label` finds
  the textarea and not the form), a box with a border that darkens while the person writes in it,
  holding a textarea for `id` and, under it, the send button at the end. The textarea has the
  `label` for assistive technology and does not show it, shows the `placeholder` while it is empty, has
  no border of its own, and grows with what is typed between 2.5rem and 15rem. The button is an
  `iconSubmit` named `submitLabel` showing the `mark-send` icon; it submits the form, which sends
  `onSubmit`. Enter adds a line.
- `suggestions`, `{ id, items, onKeyDown }`, opens a list of members to mention over the box while
  the caller gives it. The list is a `listbox` named "Members to mention" with the `id` given, above
  the box (the form is `relative`; the list is `absolute`, 4px over it, 16rem wide at most, on
  `raised` with `shadow-popover` and a border), and holds a row for each of `items`, in order, which
  the caller keeps to six: an `option` of the member's `mark` (`xs`) and `name` at the control text
  size, `aria-selected` and on `selected` when its `isActive`, and sending its `onPick` when it is
  clicked, after which the textarea has the focus again. The textarea says that it completes from the
  list, with `aria-autocomplete="list"`, `aria-controls` the list's `id`, `aria-expanded="true"`, and
  `aria-activedescendant` the active option's id (the list's `id`, a hyphen, and the item's `id`). The
  box keeps the focus while the list is open, and a key pressed in it asks `onKeyDown(key)`: a
  message it answers is sent, and the browser's action for that key, adding a line or moving the
  focus on, does not happen; no answer leaves the key to the browser, as does any key pressed with
  Shift, Control, Alt, or Meta. The caller decides what the keys do, such as moving the active row,
  picking it, or dismissing the list. Without `suggestions` none of this is drawn, and the textarea
  carries none of those attributes or a key handler. The builder has no handler that prevents the
  default action of a mouse press, so a click keeps the focus by returning it to the textarea after
  the row took it, not by never taking it.

### `@amends-dev/design/toast`

What floats over the shell's corner, for something that went wrong and the one thing to do about it.

- `toastStack(h, children)` is the column of toasts pinned to the bottom end corner of the window,
  16px from each edge and 25rem wide at most, with 8px between them, above the panes and the scrim.
  It is `fixed`, so it stays in that corner wherever it renders, in the shell's frame or inside an
  open dialog, as the shell places it. A frame that shows it apart from a window, as the workshop's
  do, contains it with `contain: layout`. It is an `aria-live="polite"` region, there before the
  first toast so each is announced as it arrives. `children` are `toast`s, or a `notice`.
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
`aria-invalid`, and description, a switch by its label, an icon button's `aria-pressed` while it is given `isPressed` and none otherwise, a select's change, also when its label is
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
an entry given a message as the button that holds them, with its key as its id and `aria-current` while
it is active and not otherwise, a field's keys that `answerKeys` answers, handled, and the others, and
those with a modifier, left to the browser, and a log by `role("list")` with a line for each item; a grid's fields found by their labels; a
toast by `role("alert")` with its text, detail, and button, in the stack's live region; a modal by its
title as a level 2 heading, which names the dialog once a real `DialogBlock` has opened it, its
context, description, tabs, and footer, the control given `initialFocus` by its marker, and Close and
Cancel by closing the dialog without sending the form; a message by
its text button, `aria-current`, its note, actions, meta, and body, a mention in its text by the
chip that holds it and a button by the words joined, a notification by its
text button named by its author and activity and described by its text, its place, age, and actions,
and an unread one by its dot, hidden from assistive technology, and its "Unread", a reply line by its
label, its marks, and the count of the rest, the line and the marks hidden from assistive technology,
and a divider by its label in the list; a composer by its form, the textarea found by the same label, the placeholder, and the
send button, and its list of members by the listbox named for it, its options with the active one selected, the
textarea's `aria-autocomplete`, `aria-controls`, `aria-expanded`, and `aria-activedescendant`, a click that picks a
row, and the keys the caller answers, handled, and the others, and those with a modifier, left to the browser; a mark as `aria-hidden`; a mark cluster by its label as a button that sends its message, with its first three marks and the count of the rest hidden from assistive technology; and the shell's landmarks by role and name: `navigation` for
the rail and the sidebar, `main`, and `complementary`, with its notices, and by viewport: the sidebar
in place at `Desktop` and `Split` with no Menu button, and at `Tablet` and `Phone` a Menu button, the
sidebar, and at `Phone` the rail, inside the dialog named Navigation once it is visible and nowhere
before; the side pane in place at `Split` and otherwise inside the dialog named Thread once it is
visible and nowhere before; the notices' live region once, inside the dialog that is visible and
in the frame otherwise; and the dialogs it is lent, in the frame at every viewport and last, after the
drawer's and the side pane's, empty while closed, with the notices left in the frame while one is
open. They query no class. The viewport's decision, `viewportOf`, is a plain test.
