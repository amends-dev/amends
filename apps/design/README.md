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
buttons by variant, disabled, large, and wide, with the link in a sentence, and a link to another page, and a link in the look of a button to the page's own address, and with an icon before the label, and icon buttons, regular and compact, and as a switch, off and pressed; a field empty, with a
placeholder, filled, invalid, disabled, and with a hint under it; a hint; a textarea, and with a hint, refused, and
disabled; a grid of selects, side
by side and wrapping in a narrow column; a select with its label hidden, in a row beside a name; a
field with its label hidden, in a section that names it; the toggle on and off, and disabled; a select, and with
descriptions and a choice that can't be chosen and a hint, refused, and disabled; the notice
tones, a boxed note in each of its three tones, and a notice over a button in a column; `sending`; a form with its inline text and a value with its link, and setting rows with an
action, with a select, with a label alone, and wrapping in a narrow column; the
directory's section and rows, a row with cells and no action, a table of agents with their status patches and cells of two lines, a table of connections with a drawing on each mark and the authentication as a cell, a table of members with 32px marks in rows 56px tall, the second the member open beside the list, an agent's lilac mark, and the role and status as cells, a section with an action after its line over two rows with a quiet button, each on a drawing of a mail, the history of invitations as rows of an address over what it gives with the status in words and a quiet Revoke on the pending ones, and a section of two rows with a button
named for their workspaces, with a footnote after them, and a table of three groups' rows
with cells, under the line that says what it holds and the labels of its columns, wide and beside it
folded, in a frame 360px wide; the centered screen as the
sign-in's two steps and as the workspace picker five times, each with its pieces in `screenContent` as the app's
pages return them: with workspaces and invitations, whose heading has a Create workspace action on its line; with invitations only and the footnote after them; with nothing yet, whose empty state has the Create workspace button in place of the heading's; with a reload that failed, an alert and a quiet Try again over the list it kept; with the session being checked, whose working mark is the screen's `h1`; with the host not reached, whose message is the screen's `h1`; with nothing at the address, with something that went wrong, and with a workspace closed to the person, each a message that is the screen's `h1`, all with the person's address and a Sign out in the header but the one after something went wrong, which is outside the session, with the brand alone in the header and Reload a link to the page itself; the toast alone, with a detail, as a confirmation, and as a stack of
two, each in a frame of its own; the modal, opened by a button, as a form with a context, a field
that takes the initial focus, a toggle, and a footer of Cancel and a primary button, as a confirmation with
Cancel at the start of the footer and the primary button at its end, as a wide one with tabs and a description whose
Members tab has an action at the start of its footer and Done at its end, and as a search over rows of integrations that run to the panel's edges; the logo at five sizes, decorative and labelled, in each of its four motions, in a link and a button that lift its patch when hovered, and on the canvas the rail draws it on; the nine state arts, each drawn and moving; the loading line and the rows that stand in for a list that is being read, at the three sizes of mark and in a pane under its header and tabs; the code input typed into, empty, part filled, complete, refused, and disabled; the menu as a choice, the status filter that says Status while every status is chosen, a sort, and the member filter, each opening a list with the current choice checked, the assignee filter whose choices are Anyone, Unassigned, and each person with a 22px mark before their name, and as groups behind the account's mark, with a header, a labelled group of checked choices, actions, and the line between them; a pane's toolbar over a list that scrolls, the search and the status filter at its start, a sort and New task at its end, then the line that says what the list holds and its column labels, and the same wrapped in a frame 360px wide; a badge with a motion for each way something is under way; the marks by size, 20px to 40px with the 22px mark of a choice and the 28px mark of an account among them, each status at every size, the lilac tone, a drawing in place of letters, a status mark alone and the working logo, and the cluster of two, three, and seven; the tooltip in each tone, with a detail and with the title alone, over a control that Tab reaches, in a frame that scrolls with the mark at its top edge, and below its mark; what a pane says about one thing, as a detail
list, a person by their mark at two sizes and in the agent's tone, the four badge tones, entries with and without marks, with trailing badges, and with children,
entries that are buttons, the second of them active, a log short and long, a pane's sections as a task to change, a task to read, and the turns, and a
pane's section that is one form; a
conversation's messages as a list with a current row whose text opens the thread, with a note,
actions, and meta, with the replies under a row as one reply, three people, and more people than the
line shows, with a mention in the text as a chip, in plain text, in a row that opens a thread, and in
the current row, with a form in place of the text, and set apart by dividers, centered and at the
start, and notifications under the days Today and Yesterday, unread with a dot and read, with the notification whose thread is open as the current row among them, and a list ended by a centered quiet Show older; a pane's empty state with a title
and a line of copy under a header with an action, with an action of its own under the copy, with a title alone, with its mark working, and for a failure with Try again, each in a frame of its
own; a pane's column keeping its measure around a form and, wide, spanning the pane around a table of
groups, each in a frame wider than the measure; the composer empty, filled, and with its list of members to mention open on the second; the shell twice, with and without its side pane, each in a
frame of fixed height, its groups, one of them still on its way, and direct messages through
`sidebarSections`, its threads,
replies, and composers made of `message`, `divider`, and `composer`, the first with the open thread
as a plain row under its group and the second with its notices; the shell four more times with the rail on a destination of its own: Agents, with the sidebar's title current, each agent's status and the logo at those at work, and the list in the main pane, again with an agent open, whose page is the main pane: its mark and status in the header, a boxed note of why it can't run, a name form, and its setup, details, and removal set apart by a stitch, Connections, with a section for each capability, and Settings, on Members: a search and a menu of Active or Removed members in a toolbar over a table of members, with the pending invitations under it, and a member's details as the side pane, whose Back is named for where it goes back to; and the icons by size, as the shell
draws them, and with a label. The toggles, fields, composers, and select take input, and the modals
open and close, as do the menus, whose choices are kept. The first shell's rail has the account menu that opens, and the other shells draw its button closed, since a menu's Block owns the ids of its button and its list. So do the shell's rail and tabs, whose current item follows a click, and the list of
threads, whose current row follows a click. The frames pass the shell the viewport `Split`, whatever
the window's width, so the rail, the sidebar, and the side pane are always in place, and no menu and a
side pane whose dialog shows nothing, since the navigation drawer and the side pane's dialog are over
the whole window and are for the app to show. A frame makes itself the containing block of the
notices, which are fixed to a window's corner, with `contain: layout`. Open it to look at a piece
before a page composes it. It follows the browser's light or dark preference. A browser tab that is
hidden never renders a frame, and Foldkit renders on frames, so look at it in a visible tab. The
folded table's frame is an `iframe` of the workshop itself, opened with `?frame=directory-table` to
show the table alone, since a table folds by the width of the window, which a `div` 360px wide does
not change. The toolbar's wrapped frame is an `iframe` the same way, opened with `?frame=pane-toolbar`, since a toolbar wraps by the width of the window. `bun run --filter @amends-dev/design build` bundles it, which CI builds too.

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
block gives each a Tailwind name, so a utility exists for every role.

The person's own choice of Appearance wins over the browser's: an app sets `data-theme` on the root element to
`light` or `dark`, and removes it for System. The dark values are under `:root[data-theme="dark"]` as well, and the
media query keeps them from `:root:not([data-theme="light"])`, so light needs no block of its own. `theme.test.ts`
checks that the two dark blocks give the same values. The block clears Tailwind's
defaults for colors, fonts, type sizes, shadows, radii, and breakpoints, so a class outside the
design, such as `bg-red-500` or `rounded-md`, does not exist. Spacing is Tailwind's 4px grid.

| Family      | Names                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces    | `canvas`, `panel`, `raised`, `popover`, `field`, `search`, `hover`, `active`, `selected`, `rail-selected`, `subtle`, `mention`, as `bg-*`                                  |
| Text        | `ink`, `ink-secondary`, `ink-muted`, `ink-disabled`, `agent`, `on-action`, as `text-*`                                                                                     |
| Borders     | `divider`, `outline`, `outline-strong`, `outline-selected`, `outline-danger`, `stitch`, as `border-*`                                                                      |
| Actions     | `action`, `action-secondary`, `indicator`                                                                                                                                  |
| Status      | `success`, `caution`, and `danger`, each as `-mark`, `-text`, `-surface`, and `-border`; `status-knockout`; `scrim` and `scrim-strong`                                     |
| Avatars     | `avatar-<tone>-bg` and `avatar-<tone>-fg` for `neutral`, `sand`, `lilac`, `clay`, `olive`, `slate`, `sage`, and `ink`                                                      |
| Shadows     | `shadow-modal`, `shadow-popover`, `shadow-toast`                                                                                                                           |
| Fonts       | `font-sans`, Figtree at 400, 500, and 600, and `font-mono`, Geist Mono, both from Fontsource                                                                               |
| Text scale  | `text-meta` 11/16, `hint` 12/18, `control` 13/20, `item` 14/21, `body` 15/23, `body-touch` 16/24, `title-touch` 17/24, `title` 18/27, `heading` 20/28, and `display` 28/36 |
| Breakpoints | `tablet` 48rem, `desktop` 64rem, `split` 80rem                                                                                                                             |

The status tones hold the values of Lunacy's "Status colors", light and dark, as `@amends-dev/ui`'s tokens
do, and a status mark is the only saturated color; the offline mark draws `ink-muted` as a ring. `status-knockout`
is the surface a status mark is cut out of: it is the panel's by default, and a row that is hovered or current
sets `--amends-status-knockout` to its own fill, so the notch matches the row.

Motion is in `src/motion.css`, which `styles.css` imports. It holds the keyframes and the `@utility` blocks of the
logo and the state art (`logo-*`, `art-*`) and of the loading rows (`loading-pulse`). Each utility that animates
or transitions stills itself under `prefers-reduced-motion: reduce`, inside the utility, so that nothing can outrank
it; a drawing that moves rests in a pose that still says what it is. `motion.test.ts` checks that every
`logo-`, `art-`, and `loading-` class a renderer names has a utility, that every animation names a keyframes rule,
and that every one of them is stilled under reduced motion.

Below the desktop breakpoint is touch: controls and the rows of the sidebar grow to 44px, and
headers to 104px, written `max-desktop:`. Below the
tablet breakpoint is a phone, where inputs use 16px text so the browser does not zoom the page,
written `max-tablet:`.

Seven utilities are the theme's own. `focus-ring` draws a 2px outline in `ink`, offset 2px outside
a control that has keyboard focus, and `focus-ring-inset` draws it inside, for full-width rows that
would clip an outer one. `indicator-bar` draws the 2px, 20px-tall bar that marks the current rail
destination and sidebar row, at the inline start of an element that is `relative`; a variant such as
`aria-[current=page]:indicator-bar` shows it on the current one only. `chevron-down` draws the arrow
of a select on the element it is on, which must hold the select. `tooltip-anchor`, `tooltip-above`, and
`tooltip-below` are the tooltip's: the first names its trigger as the anchor of its own popover, so that
tooltips do not borrow each other's, and the others put the popover 6px above or below it, centered on it. Where the
browser places by anchor (`position-area`) the popover is `fixed` to the window, so a list that scrolls or clips around
the trigger does not cut it off; elsewhere it is `absolute` against the trigger, and a clipping ancestor cuts it off.
`theme.test.ts` checks that each is written. The base styles set `html` to the sans font, `ink`, and `canvas`, and `body`
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
  `aria-disabled` and sends nothing. `options.icon` draws an icon before the label, at `sm`, 8px from
  it, in the label's color; the label still names the button, and the icon is hidden from assistive
  technology. `options.name` is what assistive technology calls the button when its label alone does not tell
  it from the buttons around it, such as "Revoke invitation for casey@mercier.example" for "Revoke"; it begins
  with the label. The actions that create something use `mark-new`, which the reference's buttons use,
  not `plus`, which is smaller and lighter and has no mark's weight. `options.hasChevron` draws a chevron after the
  label and tightens the padding, for a button that opens a menu. A button is 36px tall, a quiet
  one 32px, and every one but a link 44px on touch. A secondary button with an open menu has a stronger border and a
  quiet one the `subtle` fill, by `aria-expanded`.
- `buttonClass(look?)` and `buttonContent(h, label, look?)` are what a button is made of, its classes and its
  icon, label, and chevron, for a control that is a button element of its own, such as a menu's trigger, which
  `buttonWith` draws from them too.
- `submit(h, label, options?)` is a button of `type="submit"`, primary unless `options.variant`
  says otherwise.
- `buttonWith(h, attributes, label, options?)` is the look of `button` over `attributes` that already
  give it its behavior, such as the `closeButton` group a headless dialog publishes, which is also
  what says whether it is disabled, so it takes no `isDisabled`.
- `field(h, config, error)` is a label over a 42px bordered input with the error, an
  `Option<string>`, below it as a `notice` that describes the input. The `config` is
  `{ id, label, type, value, onInput, placeholder?, hint?, isAutofocus?, isDisabled?, isLabelHidden?, attributes? }`.
  A field with an error is `aria-invalid` with a danger border. A field that `isDisabled` shows its value
  and takes none, for a page the person may read and may not change. The `placeholder` shows an example
  of what to enter while it is empty. The `hint` is a line of what to know about the input, in the
  look of `hint`, 8px under it as the label is above it; it describes the input while there is no
  error. It takes focus as it shows unless `isAutofocus` is `false`. With `isLabelHidden` the label
  is not shown above the input and still names it, for a field in a section that already has that
  name as its title, such as the one that renames the workspace. The `attributes` go onto the input:
  a group a headless component publishes, `PublishedAttributes`, such as a dialog's `initialFocus`,
  which a field in a dialog takes with `isAutofocus` off, and the caller's own, such as `answerKeys`
  and an `aria-activedescendant`, for a field above a list its keys walk, or a mount its Block registers,
  such as one that selects the field's text when it takes focus (`ControlAttributes`).
- `searchField(h, { id, label, placeholder, value, onInput })` is the quiet search over a list, for a toolbar: a filled
  box, 36px tall and 44px on touch, with a magnifier at its start, 20rem wide at most, giving way before it wraps, and on
  a phone a line of its own. The `label` names it for assistive technology and is not shown, the `placeholder` says
  what it finds, and it never takes focus as it shows. The bordered `field` of type `search` is for a form.
- `answerKeys(h, onKeyDown)` is the attribute for a text control above a list that its keys walk, such
  as a search field above its results: `onKeyDown(key)` says what a key sends, or nothing to leave the
  key to the browser, and a key it answers does not do what the browser does for it, such as moving the
  caret or adding a line. A key pressed with Shift, Control, Alt, or Meta is left to the browser. The
  composer's list of members is answered the same way.
- `hint(h, text)` is a line of quiet text, at hint size in `ink-muted`, for what to know about the
  control next to it.
- `textarea(h, { id, label, value, onInput, rows?, hint?, error?, isDisabled?, attributes? })` is the input's
  look over `rows` lines, three unless given, with the `hint` under it, `error` (an `Option<string>`) as the
  alert that describes it first, and the `attributes` on the box, as a field has them.
- `codeInput(h, { id, label, value, hint?, onInput, onComplete?, isAutofocus?, isDisabled? }, error)` is a labelled
  six-digit code in one native input, drawn as six cells of 56px, 12px apart (8px on phones) across the column. The
  input lies over the cells, transparent, so typing, pasting, deleting, and the platform's one-time-code
  autofill work as in a text field (`inputmode="numeric"`, `autocomplete="one-time-code"`). What `onInput` is given
  is digits only, at most six; the caller keeps it and the field shows it. The cell the next digit goes into is
  outlined while the input has focus, and an `error` (an `Option<string>`) outlines every cell in the danger
  color and describes the input, as `field`'s does, with the `hint`. When the sixth digit is in, `onComplete`
  is sent with the code in place of `onInput`, so the caller can verify at once. The cells are hidden from assistive
  technology, which reads the input and its label.
- `loadingLine(h, text)` is a quiet line of what a pane or a page is waiting for, such as "Loading your inbox…", in
  a live region, a `status`, so that it is announced. A list that is being read shows `loadingRows` instead.
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
- `link(h, { label, href })` is a link to a page elsewhere, such as an integration's documentation: underlined text in
  `ink` at the size of the line around it, the look of a `link` button, that opens in a new tab and sends the page it was
  opened from nothing (`rel="noreferrer"`). A button that does something in the app is a `button`; this goes to another
  address.
- `linkButton(h, { label, href }, look?)` is a link in the look of a button, `look` being the `variant`, `size`, `wide`,
  `icon`, and `hasChevron` of `buttonClass`, for a control that goes to a page and sends no message. The address of the
  page itself, `href: ""`, loads it again, which is how a screen that has no messages left reloads: the crash screen's
  Reload is `linkButton(h, { label: "Reload", href: "" }, { variant: "primary" })`. It opens in the same tab and is a
  link to assistive technology, which Enter follows.
- `buttonRow(h, children, options?)` is a row of controls with an 8px gap, wrapping onto a new line when
  they do not fit, such as a thread's Follow and Rename or a form's Save and Cancel. With `isCentered`
  the controls are in the middle of the row's width, for the quiet button that ends a list, such as
  Show older under the inbox.
- `column(h, children)` is a few pieces that belong together inside a section, one under another and
  12px apart, such as a notice over the button that answers it, or over a Try again row.
- `fieldGrid(h, children)` is fields side by side in columns at least 9rem wide, 12px apart, wrapping
  onto new rows when they do not fit, such as a task's Status, Priority, and Assignee.
- `toggle(h, { id, label, isOn, onToggle, isDisabled? })` is a switch with its label after it. The switch is
  named by its label. On touch the switch and its label are each a 44px target. A switch that `isDisabled` shows how
  it is set, in half strength with its label quiet, and takes no click or key, for a page the person may read and may
  not change; it is `aria-disabled` and stays in the tab order.
- `choiceSelect(h, { id, label, choices, value, onChange, hint?, error?, isDisabled?, attributes? }, options?)`
  is a select over `choices`, each a value and how the person reads it, in the input's look, with the
  `hint` under it, `error` as the alert that describes it first, and the `attributes` on the select, as a
  field has them. A choice may have a third part, `{ description?, isDisabled? }`: a native select shows
  only text, so the description reads after the label as "Auto · amends chooses a harness as the agent
  works", and a choice that `isDisabled` is listed and can't be chosen, for the one an agent names that is
  gone. With `options.isLabelHidden` the label is not shown above the select and still names it, for a
  select in a row that says what it is for, such as a member's role beside their name.
- `notice(h, message, options?)` renders an `Option<string>` as an alert in a tone, `"danger"` by
  default, `"caution"`, or `"success"`, and nothing when there is none.
- `noticeBox(h, { title, lines, tone? })` is a note boxed in its tone, `"caution"` (the default), `"danger"`, or
  `"success"`, for a page or a form as a whole and not for a field: the tone's status shape (a triangle, a square
  with a bar, or a filled square), the `title` in medium weight, and a quiet line under it for each of `lines`, why. It
  is a `note` named by its title and not an alert, since it is there when the page opens, such as the reasons an
  agent can't run; a caller puts one it adds after the page opened, such as what a check found, in a `status` region
  of its own.
- `sending(h, pending)` is " · Sending…" while an action is on its way, and nothing otherwise.

### `@amends-dev/design/logo`

- `logo(h, { size?, label?, motion? })` is the amends mark: a square, a patch over its corner, and four stitches
  across the seam, drawn on a 64-unit grid in the color of the text around it, with the patch and the stitches
  cut out of the surface behind it, `status-knockout`. `size` is a CSS length, `1.25rem` unless given, which
  scales with the reader's text size. The mark is decorative and `aria-hidden`; a `label` makes it an image
  named by that label, for one that stands alone, such as the rail's brand when it is not a button. Inside a link
  or a button its patch lifts a little when hovered, and a stitch grows. A `motion` loops: `"sew-on"` drops the
  patch on and pops the stitches in, for a launch; `"thread"` draws each stitch through in turn, quiet enough to
  idle, for what waits; `"tug"` wobbles the patch from its corner, for what is stopping; and `"working"` lights
  the stitches while the patch breathes, for what is waited on. A motion is still when the reader prefers less
  motion, and the mark is then the mark.
- `stitchPaths` are the four stitches, which the state art draws too, and `logoMotions` and `LogoMotion` the motions.

### `@amends-dev/design/stateArt`

- `stateArt(h, kind)` draws what a list, a page, or a screen says when it has nothing to show or something went
  wrong, as an `svg` 4.5rem tall that is `aria-hidden`, since the words beside it say it. The drawings are made of the
  logo's pieces, empty states as outlines waiting to be filled and errors as stitches that came undone, and each
  moves in its own way, still under reduced motion. `kind` is a `StateArtKind`, listed in `stateArtKinds`:
  `"sew-in"` a new piece sewn in beside empty outlines, for a first thing to make; `"reach"` a thread reaching for an empty
  outline, for nothing connected yet; `"fill"` an outline filling in, for a place waiting for its first thing;
  `"caret"` a stitch blinking on a seam, for nothing said yet; `"rest"` the mark breathing, for nothing left to do;
  `"came-apart"` the patch swinging loose, for something that failed; `"lost-thread"` the thread between two
  pieces snapping back, for something out of reach; `"nothing-here"` a scan across an empty hole, for something
  that isn't there; and `"held-back"` the patch straining at its stitches, for access the reader lacks. It is
  the `art` of `paneEmpty`, which a view uses rather than calling this itself.

### `@amends-dev/design/icon`

- `icon(h, name, options?)` draws one of [`icons`](../icons/README.md)'s drawings by name, an
  `IconName`, as an `svg` from its path data under that package's rendering contract: a 24-unit
  viewBox, strokes of width 2 with round caps and joins in `currentColor`, so the icon takes the
  color of the text around it, and a fill too for `bell-filled`. `options.size` is `"xs"`, `"sm"`,
  `"md"` (the default), or `"lg"`, at 0.75, 1, 1.25, and 1.5rem, which scale with the reader's text
  size. An icon is decorative and `aria-hidden`; an `options.label` makes it an image named by that
  label, with a `title`, for one that stands alone with no text beside it.

### `@amends-dev/design/mark`

- `mark(h, { text | icon, size?, tone?, status? })` is the square that stands for a person, a workspace, an agent, or
  a connection: the `text` letters in capitals, or, for a thing that has no name to abbreviate, an `icon` drawn at the
  size that fits the square (`xs`, `xs`, `sm`, `sm`, `sm`, and `md` for the sizes below), on the ground of its `tone`, `"neutral"`
  (the default, `avatar-neutral`) or `"lilac"` (`avatar-lilac`, which is an agent's). `size` is `"xs"` (20px, 9px text, as a reply line shows those who
  replied), `"choice"` (22px, 10px text, as `@amends-dev/ui` draws a person beside a choice, in a menu of people), `"sm"` (the default, 24px, `meta` text, as the sidebar's header and a sidebar row show it, and a pane's title),
  `"account"` (28px, 13px text, as `@amends-dev/ui` draws the signed-in address in a centered screen's header),
  `"md"` (32px, `hint` text, as a message shows its author and an agent's row in a list), or `"lg"` (40px, `item` text, as a
  directory row shows it). A mark is `aria-hidden`: the name it abbreviates is always beside it. `sidebarHeader`,
  `sidebarItem`, `row`, `pane`, `message`, and `replyLine` draw their marks with it.
  - A mark with a `status`, `{ kind, label, detail? }`, has a patch over its bottom end corner. The patch overhangs the
    corner by 2px, in a notch 2px wider all round that is cut from the surface behind it, `status-knockout`. Its
    shape carries the state, so it reads without color: `"available"` (online, or at work) a filled square in
    `success-mark`; `"offline"` a square drawn as a 1.5px ring in `ink-muted` over the knockout; `"attention"` (needs
    setup) a triangle in `caution-mark`, as `@amends-dev/ui` draws it, a little wider than tall; `"blocked"` (can't run,
    unavailable) a square in `danger-mark` with a 1.5px bar of the knockout across its middle, inset 20% each side. The
    patch is 8px on a 24px mark, 9px on 28 and 32, and 10px on 40, as the mocks and `@amends-dev/ui` size it, and 7px on
    20px and 22px, the least `@amends-dev/ui` draws. The mark's `title` is the status's `label`, with the `detail` after a colon
    when there is one, which the browser shows on hover; a tooltip is for later. A mark stays hidden from assistive
    technology, since it knows only the letters: the row that holds it is named by the name and then the status's label,
    "Atlas, Needs setup".
- `statusMark(h, status)` is a status's shape alone, 9px, with the same `title` and hidden from assistive technology, for the
  end of a row whose item has no mark of its own, such as a connection.
- `activityMark(h)` is the logo at 1rem in its `working` motion, which a row shows at its end while the thing it
  stands for is at work, in the color of the text around it and hidden from assistive technology.
- `markCluster(h, { marks, label, onClick })` is a button named `label` that gathers the people a group
  has: a bordered box, 1px in `outline` with 2px of padding, holding the first three `marks` as `xs` marks
  2px apart, and, beyond three, "+4" for four more in `ink-secondary` at `meta` size. It is `hover` on
  hover and 44px tall on touch. The marks and the count are hidden from assistive technology, as a mark is,
  so the `label` says how many people it stands for, such as "7 members".

### `@amends-dev/design/centered`

The sixth layout pattern, for screens outside a workspace such as sign-in and the workspace picker.

- `centered(h, { actions?, width, children })` frames one card on the canvas, `100dvh` tall
  with an 8px gutter, and edge to edge on phones. Its header holds the brand on the left, the logo at 40px
  beside "amends", and `actions` on the right. The body is a column: `width: "form"` centers a 420px column vertically,
  and `"directory"` starts an 800px column near the top. An ancestor that sets
  `--amends-screen-height` shows the card at that height instead of the viewport's, as the
  workshop does to show both widths on one page.
- `centeredAccount(h, identity)` is who is signed in, for the header's `actions` beside a Sign out button: the first
  letter of the `identity`, such as the address they signed in with, in a 28px mark, then the identity in
  quiet text, which gives way to the mark below 48rem. The mark is hidden from assistive technology, since the
  identity is beside it.
- `heading(h, text, options?)` is the screen's `h1`, at display size, with 12px below it for what
  follows. An `options.action`, such as a `button` that creates what the screen lists, shares the
  title's line: the title takes the line's width and the action lies at its end, in line with the
  middle of the title and 16px from it, and the 12px below belong to the line. A title wraps within
  the room the action leaves it.
- `copy(h, text)` is a line of secondary text under the heading.
- `screenContent(h, children)` is the pieces of a screen's body as one node, for a view that must return
  one, such as a page. It is `display: contents`, so they lie in the card's column as if it were not
  there, each spacing itself as `heading` and `copy` do. Use it, not `column`, whose gap would add to
  theirs.
- What a screen says when it has nothing to show is the pane module's `paneEmpty`: a state art, a title, a
  line, and an action under it, 64px under what is above it. Under the screen's `heading` it is an `h2`,
  as a list that is empty says; when the message is all the screen has, such as the host not being
  reached, it takes `level: 1` and is the screen's `h1`, with no `heading` of its own. The screen after an unexpected
  error is outside the session, so it has no `actions` in its header, and its Reload is a `linkButton` to the page's own
  address, since the framework's crash view has no messages to send.

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

- `loadingRows(h, { label, count?, markSize? })` is what a list shows while it is read for the first time: `count` rows,
  three unless given, in the shape of a `row` of the same `markSize` (`"lg"` unless given, or `"md"` for a list of
  agents), a square of `subtle` where the mark goes and two bars where the title and the meta go, slowly dimming and
  brightening, and still under reduced motion. The rows are hidden from assistive technology; the `label`, such as
  "Loading agents…", is a `status` that only it can read. The caller shows them in place of the list, and the heading and
  the tabs stay where they are.
- `section(h, { label, count?, action? })` is the label as an `h2`, the count in a 20px `subtle` badge, and a
  dashed line in `stitch` running to the right edge, 36px below what is above it. An `action`, such as a quiet
  View history, comes after the line, at the end.
- `summary(h, { copy, count })` is a line at hint size in `ink-muted` that says what a list holds,
  the `copy`, with the `count`, such as "4 groups", at its end.
- `columns(h, { label, cells })` is the labels of a table's columns over its rows, hidden from
  assistive technology, since each row describes itself: the `label` over the mark and the title,
  filling the width, then one of the `cells` over each cell column, 8rem wide, at meta size in
  `ink-muted` and upper case, over a dashed `stitch` rule. Its end leaves 6rem bare, where a row with
  cells keeps its action, so the labels stay over their cells. From 48rem to 64rem the columns are
  6rem wide and the bare end 5rem, as a row's are. Below 48rem the labels are not shown, since a
  row's cells fold under its title and no column is left to label.
- `footnote(h, text)` is a quiet line after a list, 24px under it, at control size in `ink-secondary`, that
  says what else the person can do, such as "Accept an invitation above, or create your own workspace."
- `row(h, { id?, mark, markSize?, isCompact?, status?, title, meta?, cells?, cellsText?, action?, isCurrent?, onClick })` is
  one button the width of its container, at least 76px tall: a square mark holding the `mark` letters, `{ text, tone? }`,
  or its drawing, `{ icon, tone? }`, as a connection's is, 40px (`markSize` `"lg"`, the default), 32px (`"md"`, as a
  list of agents draws it), or 24px (`"sm"`, which makes the row 56px tall), on `avatar-neutral` unless given the `lilac`
  tone, the `title` at body size over the `meta` at hint size in `ink-secondary`, and the `action` at the right in
  `ink-secondary`. A row that `isCompact` is 56px tall whatever its mark's size, as a table of people is with a 32px
  mark; the folded cells still start under the title of the mark's size. The row is `hover` on hover. A `status` is the patch on the mark, cut
  out of the row's own fill, which a hovered row gives `status-knockout`. The button is named by the title and, with a
  status, its label after it, "Atlas, Needs setup", and described by the meta through `aria-description`, and the mark
  and the action are hidden from assistive technology. The `cells`, such as a `badge` and a count, each lie in an 8rem column
  between the title and the action, at hint size in `ink-secondary`, under the labels `columns`
  gives them, and are hidden like the mark; `cellsText`, what they say in words, such as "Public ·
  12 members", describes the button after the meta. A row with cells keeps 6rem at its end for its
  action, right-aligned, whether it has one or not. An `id` is the button's own, for the app to move focus to
  a row, such as the one for a workspace the person has just joined. A row that `isCurrent` is the one whose details are open beside the list: it is filled `selected` with the
  2px bar at its start, and the button is `aria-current="true"`. A page lists rows as `li` items of a `ul`.
  - From 48rem to 64rem (`max-desktop:`) the cell columns are 6rem wide and the room for the action
    5rem, so a title keeps its room beside three cells, and `columns` follows with the same widths.
  - Below 48rem (`max-tablet:`) a row with cells folds, in CSS alone and from the same markup: the
    mark, the title, and the meta stay the first line, and the cells wrap under them as a line of
    their own, 8px apart, in their order, each only as wide as it is, or as the line if it is wider,
    with an ellipsis, starting under the title. The action is not shown, and neither are the labels
    of `columns`. The cells lie in one element that is `display: contents` from 48rem, so each is a
    column of the row there, and below it takes the whole width of its line (`basis-full`), which is
    what breaks the row after the title. A row without cells does not fold and keeps its action.
    `cellsText` is unchanged, so the folded row is described as it is wide. The folded cells start under a 24px
    mark's title, 40px in, as under a 32px mark's, 48px in, and a 40px one's, 56px in.
- `cellWithDetail(h, { value, detail? })` is a cell of two lines for a row: the `value` at control size in `ink`
  over the `detail` at hint size in `ink-secondary`, such as an agent's harness over its sandbox. Both end in an
  ellipsis. Below 48rem, where the cells fold under the title, the detail is not shown, so the folded line reads
  as the values alone.
- `activityCell(h, { state, place? })` is a cell of the same two lines for what is at work: the logo's mark and the
  `state`, "Working", over the `place`, "#design". A row that is idle leaves its cell empty and the column keeps
  its place.
- `rowWithButton(h, { mark, markSize?, title, meta?, action, actionName, variant?, isDisabled?, onClick })` is a row for a thing the
  person answers and does not open, such as an invitation, so it is not a button itself: the same
  height, mark (letters or an icon, at the sizes `row` has), and title over meta as `row`, and at the end a
  `secondary` `button` labelled `action`, or a `quiet` one with `variant`, as a pending invitation's Revoke is,
  that sends `onClick`, which is disabled with `isDisabled`, as a pending invitation's Revoke is while the
  invitation is itself on its way. The row has no `hover` and no pointer, since it is not what is pressed. The
  button is named by `actionName`, which begins with the `action`, such as "Accept invite to
  Northstar Studio", so that the buttons of several rows are told apart; the mark is hidden from
  assistive technology, and the title and meta are read as text. It is a renderer beside `row`, and
  not an option of it, because the two are not the same element: a `row` is one button whose parts
  describe it, and this is a line of text with one control. A page lists these as `li` items of a `ul`.
- `historyRow(h, { title, detail, status, action? })` is a row of a history, which is read and not opened, such as an
  invitation among every one there has been, and has no mark: a grid of the `title` at item size in medium weight, over
  the `detail` at hint size in `ink-secondary`, a 5.5rem column for the `status` in words, and a 4.75rem one for the
  `action`, `{ label, name, isDisabled?, onClick }`, a `quiet` button level with the detail and at the end of the row,
  named by `name`, which begins with the label, such as "Revoke invitation for casey@mercier.example", so that the
  buttons of several rows are told apart. Below 48rem the action moves under the status. A row with no `action` leaves
  its column bare. A page lists these as `li` items of a `ul`.

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
  in its dialog at every other viewport, never in both. `isAsideInDialog(viewport)` is that decision
  for a page that opens the dialog and closes what it shows when the dialog closes: true everywhere
  but `Split`. The controls, rows, and headers keep their touch sizes in CSS, from `max-desktop:`, and
  so does the room a pane's header leaves for the menu button.

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

  The `aside` is `{ label, view, isOpen, dialog }`, lent the same way from the page's own bound dialog. At
  `Split` the shell puts `aside.view` in the card and never calls `aside.dialog`. At every other
  viewport it calls it, and while the dialog is visible it is a `dialog` element like the drawer's,
  with a backdrop, and a panel holding an `sr-only` `h2` named by the `label`, "Thread" or "Member details",
  which names the dialog, then `aside.view`. The look is by viewport: floating at `Desktop` and `Tablet`, filling the window at
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

- `rail(h, { brand, items, search?, footer, account? })` is the column of global destinations, a `nav` named
  Destinations, 52px wide. The `brand` is `{ label, onClick? }`, the logo over the seam, cut out of the canvas the
  rail lies on, that is a button named by `label` when it has an `onClick`, whose patch lifts when hovered, and an
  image of that name otherwise. Each
  of `items` and `footer`, the second at the bottom, is `{ icon, label, isCurrent, onClick }`: a
  40px button of the icon alone, named by `label`. The current one is `aria-current="true"`, filled
  `rail-selected`, with the `indicator-bar` at its left edge. The optional `search`, `{ label, onClick }`, is
  the way to search, which is not a destination: a `mark-search` button last among the `items`, at the same
  spacing as they are, as the mock draws it, and never current. The optional `account`, last of all
  under the `footer`, is a `railAccount`.
- `railAccount(h, { name, initials, header?, groups, embed })` is the person at the foot of the rail: their `initials` in a
  `mark`, in a 40px target like the destinations, on a button named "Account: {name}", which opens a `menu` of the
  `header` and `groups` to the right of the rail, with its end at the button's (`right-end`).

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
- `sidebarSection(h, { label?, onTitleClick?, isTitleCurrent?, actions?, children })` is a group of items. A `label` is an `h2` in
  `meta` size, uppercase, in `ink-muted`, with icon-only `actions` at its right, such as compact
  `iconButton`s; on touch the heading is 44px tall, as they are. With an `onTitleClick` the title is a button, inside the
  heading, that opens the full list of what the section holds, and it covers the whole heading but the actions; while that
  list shows, `isTitleCurrent`, the button is `aria-current="page"` in `ink` and the heading is filled `selected` with the
  `indicator-bar`, as a current row is. A group without a label is the list alone, as a sidebar's first is. Sections sit 22px
  apart. `children` are `sidebarItem`s or a `sidebarEmpty`; a section with none at all, as one still loading has, is its
  heading and actions alone, with no list.
- `sidebarItem(h, { icon?, mark?, status?, label, count?, activity?, isPending?, isCurrent, onClick, children? })` is a
  38px row, 44px on touch, one button: an `icon`, or a `mark`, `{ text, tone? }`, on a 24px square for a
  person or an agent, then the `label` in `ink-secondary` and a `count` in a badge at the end. A `status` is how the item
  stands: the patch on its mark, cut out of the row's own fill, so that `status-knockout` is `hover`'s while the row is hovered
  and `selected`'s while it is current, or, for an item with an `icon` or no mark, the status's shape alone, 9px, at the
  row's end before the count. An `activity`, such as "Working in #design", is what an agent at work is doing: the row shows
  the logo's mark at its end, in `ink-secondary`, and the words only name it. A row that
  `isPending`, as a group still being created is, says "Sending…" at its end at `meta` size in
  `ink-muted` in place of those and the count; a pending row has no count, activity, or status shape. The button is named by
  the label and then the status's label, "Atlas, Needs setup", or, with no status, the activity's words, "Atlas, Working in
  #design", and described by the count or "Sending…". The current row is `aria-current="page"`, filled `selected`, in `ink`
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

- `pane(h, { variant, label?, header, toolbar?, body, footer? })` is a column of a header, a `body` that
  scrolls, and a `footer` that stays in place. The `toolbar`, for a list, is what stays under the header while the body
  scrolls: a `paneToolbar`, then, over a list, the `summary` line and the `columns`. The body then starts flush under it,
  with no padding above, so the first row is the one under the column labels. The `"main"` variant is the page's `main` landmark,
  its title an `h1` at title size; the `"side"` variant is an `aside` named by `label`, its title an
  `h2` at body size, in medium weight. A `label` names the main landmark too.
- The `header` is `{ title, icon?, mark?, status?, context?, phoneContext?, leading?, actions?, tabs?, subtitle? }`,
  96px tall, and 104px below 64rem, so the main pane's, the side pane's, and the sidebar's line up: a 60px
  row, then the `tabs` or a `subtitle`. In the row, `leading` is a control that brings its own
  spacing, such as `paneBack`, then the title with an `icon` or a `mark` before it and
  `context` after it in `ink-secondary`, and `actions` at the right. The `mark` is a `mark`'s letters and
  tone, `{ text, tone? }`, the 24px square for a person or an agent that a page about one shows in place of
  an icon, and its `status` is the patch on it, as a sidebar row's is, which an `sr-only` word after the
  title says too. The `phoneContext` is a quiet line under the title below 48rem only, such as the
  workspace's name, which a phone's row has no room for beside the title; from 48rem it is not shown, and a
  title with one stacks over it there. The main pane's row starts 40px
  further in below 64rem, for the shell's menu button over it; its tabs and subtitle keep the pane's
  gutter, and the side pane's row is not moved. The line under the header is drawn inside it, so the
  current tab's bar sits over the line. A `subtitle` shows only when there are no `tabs`.
- `paneToolbar(h, { start, end? })` is the row at the top of a `toolbar`: the `start` controls, a `searchField` and the
  menus that narrow the list, then, at the end, the actions on it, such as a sort and a `button` that adds to it. It is one
  row where the search gives way first; below 48rem it wraps, the search a line of its own and the actions at the start
  of the line under the filters.
- `paneToolbarStack(h, children)` holds the pieces of a `toolbar` as one element, 12px apart as the toolbar keeps them,
  for a Block whose view is given one element to return and draws the toolbar of a pane that another draws.
- `paneTabs(h, { label, tabs })` is a `tablist` named by `label` of `{ label, count?, isCurrent,
onClick }` tabs: buttons that are `aria-selected`, the current one in `ink` and medium weight with
  a 2px `indicator` bar under it. The tab is named by its label and described by its `count`, which
  shows in a badge after it. Tabs are all in the tab order; arrow keys do not move between them.
- `paneEmpty(h, { art, title, copy?, action?, level? })` is what a pane's body says when it has nothing to
  list, a centered column 64px under the header and 20rem wide at most: the `art`, a `StateArtKind` drawn by
  `stateArt` in `ink`, or `"working"`, the logo at 3.5rem in its working motion, for what is waited on, then the
  `title` as an `h2` at item size in medium weight, under the
  pane's `h1`, and the `copy` under it at hint size in `ink-muted`, then the `action`, such as the `button` that
  does what the copy says, 12px below. The art is hidden from assistive technology; the column of a working one is
  a live region, a `status`, so that its title is announced. A centered screen uses it
  too, for what it has nothing to show of (see `centered`); with `level: 1` the title is an `h1`, for a screen
  whose message is all it has.
- `paneColumn(h, children, options?)` is the one column of a pane's body, its sections 40px apart, with
  nothing beside it. By default it keeps a measure of 42.5rem (`max-w-170`), the right width for what
  is read and filled in: a page about one item, such as the settings, and a connection's form.
  `options.isWide` drops the measure, so the column spans the pane, which is right for a list or a
  table: the group's threads, the groups to browse, the inbox's rows, and the tasks' table, whose
  three cells would be squeezed inside the measure until their titles truncate. The side panes keep
  the measure.
- `paneSection(h, { title, trailing?, hasStitch?, children })` is a section of that column, a `section` named by
  its title: the title as an `h3` at item size in medium weight, with the `trailing` pieces after it on
  the same line, such as `sending` or a `badge`, then the `children` in a column 12px apart. With
  `hasStitch` the heading is a line of its own, 32px tall, with a dashed `stitch` rule running from the
  title to the pane's edge, hidden from assistive technology, as the sections of a page about one item
  are set apart.
- `paneForm(h, { title, onSubmit, hasStitch? }, children)` is a section of that column that is one form, named
  and titled alike: a `paneSection` of the `title` holding a `pane` `form` of the same name that
  sends `onSubmit`, with the `children`, its fields and buttons, in the form's column. The section
  is a region and the form a landmark, both found by the `title`. It takes the section's `hasStitch`.
- `paneClose(h, onClick)` is the side pane's close button, an `iconButton` named Close, for the
  header's `actions`. It shows from 48rem; below that the side pane is full screen and has `paneBack`.
- `paneBack(h, onClick, label?)` is the side pane's Back button, an `iconButton` named Back, or by `label` for where
  it goes back to, such as "Back to Members", for the header's `leading`, pulled to the pane's edge. It shows below 48rem only. Page code gives the two the same
  message, so each way out of the side pane does the same.

### `@amends-dev/design/details`

What a pane says about one thing.

- `detailList(h, items)` is a definition list of `{ label, value }` items, the `value` text or any
  `Html`: two columns, each `label` at hint size in `ink-muted` at least 5rem wide before its value at
  item size in `ink`, rows 8px apart.
- `person(h, { mark, markSize?, name, detail? })` is one person or agent alone, not in a list: their `mark`, 40px
  unless `markSize` says otherwise, beside the `name` at item size in medium weight over the `detail` at hint
  size in `ink-secondary`, such as "Workspace owner" or "Person · Active". The mark is hidden from assistive
  technology; the name and the detail are read as text.
- `badge(h, { label, tone?, motion? })` is a small inline mark of how something stands, 20px tall, at `meta`
  size in medium weight. `tone` is `"neutral"` (the default) on `subtle`, or `"success"`, `"caution"`,
  or `"danger"` on its own surface and text with a 1px border. A `motion`, one of the logo's, puts the logo at
  0.875rem before the label, moving and cut out of the badge's own surface, for what is under way: `"thread"` while
  it waits, `"working"` while it runs, `"tug"` while it stops. The logo is hidden from assistive technology, since
  the label says it.
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
  same size, weight, and `ink`, such as "Sara" and "mentioned you", and at its end the `age`, already
  formatted, such as "2m ago" or "Yesterday", at `meta` size in `ink-muted`. While `isUnread`, a round 6px dot of `ink`, hidden from assistive
  technology, comes before the age, and an `sr-only` "Unread" takes its place for it, so the row is
  read as unread;
  a row that is not unread has its `text` in `ink-secondary`, quieter than the first line. The
  `place` is a line under it at `meta` size in `ink-muted`, saying where the notification comes from,
  such as "#general" or "Caleb · Direct message", and shows only when given. The `text` is at body size,
  a string or `TextRun`s (below); with `onOpen` it is a button that sends `onOpen`, aligned to the start,
  underlined on hover, and it is named by the author and the activity together, "Sara mentioned you", by
  an `aria-label`, with the text's words as its `aria-description`: the first line is where the row says
  what it is, and the text is what it says. The row has `message`'s spacing and reach into the pane's
  gutter. `isCurrent`, for the notification whose thread is open, fills it with `selected`, draws the
  `indicator-bar` at its start, and makes it `aria-current="true"`, as `message`'s current row is.
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

What floats over a window's corner, for something that went wrong or something the person did, and the
one thing to do about it.

- `toastStack(h, children)` is the column of toasts pinned to the bottom end corner of the window,
  16px from each edge and 25rem wide at most, with 8px between them, above the panes and the scrim.
  It is `fixed`, so it stays in that corner wherever it renders, in the shell's frame or inside an
  open dialog, as the shell places it, or in a centered screen, which has no shell. A frame that shows it apart from a window, as the workshop's
  do, contains it with `contain: layout`. It is an `aria-live="polite"` region, there before the
  first toast so each is announced as it arrives. `children` are `toast`s, or a `notice`.
- `toast(h, { text, detail?, role?, action: { label, onClick } })` is a `role="alert"` card, `raised` with
  a border and `shadow-toast`: the `text` at body size, the `detail` under it at hint size in
  `ink-secondary`, clamped to three lines, such as the words an action carried, and at the right the
  `action` as a quiet `button`, such as Dismiss. A confirmation of what the person did, such as "Joined
  Northstar Studio", is `role: "status"`, which the stack's live region announces without interrupting
  them, and an alert is for what went wrong. The app takes a toast away, when the person dismisses it or
  after a while; the card has no timer of its own.

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
  - `footer`, `cancelLabel`, and `leading`, which are all optional, and make a footer under a line when any is
    given. Its buttons sit at the end 8px apart: a quiet Cancel that closes the dialog when there is a
    `cancelLabel`, then the `footer`'s controls, the one the modal exists for last, such as a `submit`. The `leading`
    controls, such as Back to the step before or an action that opens another dialog, sit at the start, apart from the
    rest, and `isCancelLeading` puts the Cancel there too, ahead of them, as a confirmation does with the primary
    action alone at the end.
  - `onSubmit`, which makes the panel a form that sends it, so a `submit` in the footer sends it.
    Close and Cancel are `type="button"`, so they close without sending it. Without `onSubmit` the
    panel is a `div`.
  - `width`, `"form"` (the default) for a panel 26rem wide, or `"wide"` for 32rem. A panel is
    never wider than the window less a 1rem gutter on each side, nor taller than the window less
    4rem. It is `raised` with `shadow-modal` and no rounding, over a `scrim-strong` scrim.
- `modalList(h, label, rows)` is for a modal that is a choice among things, such as the integrations
  a connection can go through. It lists the `rows`, each a `row` of `directory` with no cells, as a
  list named `label`, and it runs to the edges of the panel: it cancels the body's `px-6` on both
  sides and its bottom padding, so a row's hover fills the panel's width and the list ends at the
  footer's line, with a line over it. Whatever comes before it in the body, such as a search `field`,
  keeps the body's padding and its 16px gap.

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

### `@amends-dev/design/tooltip`

The words over a mark whose meaning has no room beside it, as `@amends-dev/ui`'s Tooltip is, made of CSS with no
Foldkit Block: the popover's showing is the pointer's or the focus's, not the app's state, and a Block bound under a page
costs the app's types.

- `tooltip(h, { title, detail?, tone?, placement?, children })` wraps `children` in a trigger and gives them a popover:
  the `title`, such as "Needs setup", in medium weight, with the `detail`, why, in a sentence under it in `ink-secondary`,
  on a `popover` card with a border and `shadow-popover`, 280px wide at most. A `tone`, `"success"`, `"caution"`, or
  `"danger"`, colors the title as a status; without one it is `ink`. The popover shows after the pointer has rested on
  the trigger for 300ms, and also at once while a control inside the trigger has keyboard focus (`:focus-visible`, so
  a click does not show it), and it is gone at once when the pointer or the focus leaves. It sits above the trigger,
  6px from it and centered on it, or with `placement: "below"` under it, for a trigger with no room above, such as the
  mark in a pane's header at the top of the window. The popover takes no pointer events, as in `@amends-dev/ui`, so it
  cannot be hovered or dismissed without moving away, and it flips to neither side by itself: the caller chooses.
- The trigger is a `span`, `inline-flex` and `flex-none`, so it can sit inside a link and holds the layout of what it
  wraps, and it is the `tooltip-anchor` of its popover (see the theme's utilities).
- The popover is `aria-hidden`: hover reaches no one who is not using a pointer, so the words must reach assistive
  technology another way, as they do for a mark, whose row is named by its name and then the status's label, and for a
  control inside the trigger, which has its own label. No `title` attribute is set, which a browser would show a second
  time.

### `@amends-dev/design/menu`

What opens from a button to choose among things: a filter above a list, a sort, the account at the foot of the rail. It
is the look of `@foldkit/ui`'s headless menu, so the framework keeps the button's keys, the list's arrow keys, Home and
End, typeahead by label, Enter, Escape, a click outside, and the focus that returns to the button.

- `menu(h, { trigger, placement?, header?, groups, embed })` builds the headless menu's view inputs and hands them to
  `embed`, which embeds the Block the page bound. The `trigger` is the button: by default a `choice`, `{ text, name? }`,
  a secondary button of the current choice's `text` with a chevron, or `{ variant: "plain", name, content }`, a button
  with no look of its own around its `content`, such as a mark. The `name` is what assistive technology calls the button
  when its text says too little, such as "Sort: Latest activity", and a plain button must have one. The `placement` is
  where the list opens from its button, `bottom-start` unless given, as `@foldkit/ui` names it: the rail's account is
  `right-end`, and a filter at the end of a toolbar `bottom-end`. The `groups` are `{ label?, choices }`, each choice
  `{ value, label, mark?, isChecked? }`, separated by a line: a choice's `mark`, a `MarkContent`, is drawn at 22px before
  its label, hidden from assistive technology, for a person; a group's `label` is a heading above it, a choice with an
  `isChecked` is one of a group of which one is current, with a check mark while it is `true`, and a choice without one
  is an action. The `header`, `{ title, detail? }`, is a title over a detail above the first group, with a line under it,
  as the account's name is over its sign-in address. A choice's `value` is what the Block reports, and each choice of a
  menu has one of its own.
- `choiceMenu(h, { choices, value, text?, name?, placement?, embed })` is the toolbar's replacement for a select: a menu of
  one group of `choices`, each `[value, label]` or `[value, label, mark]`, with `value` checked and its label on the
  button, or `text` when given, such as "Status" while every status is chosen. A choice with a `mark` is a person: the
  assignee filter lists Anyone and Unassigned, which have none, and then each person with theirs.

A Block uses it in three steps:

- It creates the menu's Block once at module scope, `Menu.create<Value>()` from `@foldkit/ui/menu`, with the choices'
  values for `Value`, and binds it as a child, with an `id` for the menu through `init`. A Block's ids are for one place,
  so a menu is rendered once, and a place that shows two has two bindings.
- Its binding's out message fold answers `Selected({ value })` with what the choice was for, and `Closed` with nothing.
- Its view calls `menu` or `choiceMenu` with `embed: (viewInputs) => h.block(Binding.embedView({ slotId, model:
model.menu, viewInputs }))`.

The list is drawn in the document's portal root, outside the Block that renders it, 6px from its button and 8px from the
window's edges, flipping to the other side when it does not fit, over a transparent backdrop that closes it. It is 12rem
wide at least and `popover` on a border, with `shadow-popover`; an item is 32px tall, 44px on touch, filled `subtle` while
it is active, and a checked choice has its check at the end and says "(selected)" to assistive technology, since a
headless menu's item is a `menuitem`, which has no checked state. The Block's trigger is `aria-haspopup="menu"` and
`aria-expanded`, and its list is a `menu` labelled by the trigger.

## Tests

`bun run test --project @amends-dev/design` runs the scene tests in happy-dom. They drive each
renderer family as a person does, through what the app's own tests query: a button by
`role("button", { name })`, a field by its label, an invalid field's `role("alert")`,
`aria-invalid`, and description, a switch by its label, a disabled one by its `aria-disabled`, an icon button's `aria-pressed` while it is given `isPressed` and none otherwise, a select's change, a choice's description after its label and a choice that can't be chosen as a disabled option, a link by `role("link", { name })` with its address, its new tab, and its `noreferrer`, a hint and a refusal that describe a select or a textarea as they do a field, a disabled field, textarea, and select, a boxed note by `role("note", { name })` with a line for each reason, in each of its three tones, also when its label is
hidden, a setting row's label, copy, and action, a button's icon, hidden from assistive technology, the centered screen's
landmarks, a heading's action on its line, a form by its label, with the pane variant of a form the same; a row by its title and the `id` on its button, a compact row's 24px mark, its height, also with a 32px mark, its folded cells' indent, and `aria-current` while its details are open, a section's action, a row with a quiet button and an icon for its mark, a history row by its title, detail, and status as text, its quiet button named for what it acts on, disabled or absent, and its action moved under the status below 48rem, and a footnote by its text; an
icon by `role("img", { name })` when it has a label and as `aria-hidden` when it has none; the logo the same, with a
class for each motion and none without one; each state art drawn, hidden from assistive technology, and moving in
the part its kind moves; the code input's six cells, the digits it keeps, its completion at the sixth, its
outlined cell and its refusal, and its loading line as a `status`; a list that is loading by its `status` line and
its rows hidden from assistive technology; a rail
destination by `role("button", { name })` with `aria-current`, and the search beside them, which is never current and
sends what it is given, and the account at its foot, a button named for the person that opens a menu to the right with their
name over their address, Appearance, and the rest, whose choice it reports, and that closes on Escape with the focus on its
button; a menu by its trigger's `aria-haspopup` and `aria-expanded`, its list as a `menu` of `menuitem`s, the current one
checked and named "(selected)", a choice that closes it and is reported, the arrow keys and Home and End and Enter and typeahead,
Escape, a click on the backdrop, and the button pressed again, which each close it with the focus back on the button, its
placement as the anchor its Mount is given, a header with a line under it, a heading over a group, the line between groups,
and a plain button holding its content; a pane's toolbar by its search found by its label, its menus and its actions at the
end, kept out of the body that scrolls, which starts flush under it, and a pane without one with its usual padding; the quiet
search by its hidden label, its placeholder and its magnifier, hidden from assistive technology; the theme's two dark
blocks, which give the same values, by `theme.test.ts`; a sidebar item by its name, which has the status's word after the label, with
`aria-current` and its count, the row under it as a button or as a plain row, the working logo at the end of a row at
work, the shape of a status at the end of a row with no mark, and the sections of
`sidebarSections` among the sidebar's own, a section's title as a button inside its heading, current or not; a tab by `role("tab")` with `aria-selected`; a pane's
section by `role("region")` and its `h3`, its trailing pieces and children, and its stitch, hidden from assistive technology, when it has one; a pane header's mark in its tone with its status as the patch, its hover text, and an `sr-only` word, and its phone-only line under the title; a pane's empty state by
its `h2` under the pane's `h1`, or its `h1` with `level` 1, its copy, its action, and its art as `aria-hidden`, with a working one in a live region; a detail list's labels
and values, a value that is a button, a person's mark in its size and tone, hidden from assistive technology, and its name and detail; a badge by its label, and the logo in its motion; an entry list by `role("list")`, an
entry by its title, its mark hidden from assistive technology, its trailing pieces and its children,
an entry given a message as the button that holds them, with its key as its id and `aria-current` while
it is active and not otherwise, a field's keys that `answerKeys` answers, handled, and the others, and
those with a modifier, left to the browser, and a log by `role("list")` with a line for each item; a grid's fields found by their labels; a
toast by `role("alert")`, or `role("status")` for a confirmation, with its text, detail, and button, in the stack's live region; a modal by its
title as a level 2 heading, which names the dialog once a real `DialogBlock` has opened it, its
context, description, tabs, and footer, the buttons of the footer in the order they sit, the leading ones and a
Cancel told to lead at the start and the rest at the end, the control given `initialFocus` by its marker, and Close and
Cancel by closing the dialog without sending the form, and a list of rows by its label, a row each
with its meta as its description, the side and bottom padding it cancels, and the message a row sends; a message by
its text button, `aria-current`, its note, actions, meta, and body, a mention in its text by the
chip that holds it and a button by the words joined, a notification by its
text button named by its author and activity and described by its text, its place and age,
and an unread one by its dot, hidden from assistive technology, and its "Unread", a reply line by its
label, its marks, and the count of the rest, the line and the marks hidden from assistive technology,
and a divider by its label in the list; a composer by its form, the textarea found by the same label, the placeholder, and the
send button, and its list of members by the listbox named for it, its options with the active one selected, the
textarea's `aria-autocomplete`, `aria-controls`, `aria-expanded`, and `aria-activedescendant`, a click that picks a
row, and the keys the caller answers, handled, and the others, and those with a modifier, left to the browser; a mark as `aria-hidden`, with the patch of every status at every size, its sizes, shape, and color, and its hover text, and with a drawing in place of letters, fitted to its square; a row's status in its name and on its mark, and its two-line cells; a mark cluster by its label as a button that sends its message, with its first three marks and the count of the rest hidden from assistive technology; and the shell's landmarks by role and name: `navigation` for
the rail and the sidebar, `main`, and `complementary`, with its notices, and by viewport: the sidebar
in place at `Desktop` and `Split` with no Menu button, and at `Tablet` and `Phone` a Menu button, the
sidebar, and at `Phone` the rail, inside the dialog named Navigation once it is visible and nowhere
before; the side pane in place at `Split` and otherwise inside the dialog named Thread, or by the label it is given, once it is
visible and nowhere before, which `isAsideInDialog` agrees with at every viewport; the notices' live region once, inside the dialog that is visible and
in the frame otherwise; and the dialogs it is lent, in the frame at every viewport and last, after the
drawer's and the side pane's, empty while closed, with the notices left in the frame while one is
open. They query a class only where a layout is what is under test, such as the classes that fold a
directory row below 48rem and size its columns by breakpoint, since happy-dom applies no CSS. The
viewport's decision, `viewportOf`, is a plain test.
