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
and rows; and the centered screen as the sign-in's two steps and as the workspace picker, each in a
frame of fixed height. The toggles, fields, and select take input. Open it to look at a
piece before a page composes it. It follows the browser's light or dark preference. A browser tab
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

Three utilities are the theme's own. `focus-ring` draws a 2px outline in `ink`, offset 2px outside
a control that has keyboard focus, and `focus-ring-inset` draws it inside, for full-width rows that
would clip an outer one. `chevron-down` draws the arrow of a select on the element it is on, which
must hold the select. The base styles set `html` to the sans font, `ink`, and `canvas`, and `body`
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
- `toggle(h, { id, label, isOn, onToggle })` is a switch with its label after it. The switch is
  named by its label.
- `choiceSelect(h, { id, label, choices, value, onChange })` is a select over `choices`, each a
  value and how the person reads it, in the input's look.
- `notice(h, message, options?)` renders an `Option<string>` as an alert in a tone, `"danger"` by
  default, `"caution"`, or `"success"`, and nothing when there is none.
- `sending(h, pending)` is " · Sending…" while an action is on its way, and nothing otherwise.

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

## Tests

`bun run test --project @amends-dev/design` runs the scene tests in happy-dom. They drive each
renderer family as a person does, through what the app's own tests query: a button by
`role("button", { name })`, a field by its label, an invalid field's `role("alert")`, `aria-invalid`,
and description, a switch by its label, a select's change, the centered screen's landmarks, a form
by its label, and a row by its title. They query no class.
