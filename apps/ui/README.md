# Amends UI foundations

Shared visual foundations for Solid web applications. The package currently provides tokens,
themes, typography, global styles, fonts, stitch styles, and native Solid controls.

Run checks and component tests from the repository root:

```sh
bun run --filter @amends/ui typecheck
bun run --filter @amends/ui test
```

This is a source package, with no standalone application or specimen server. The
design references are in [`design-system`](../../design-system/). A consuming app
owns routing, appearance preferences, and component composition.

## Use in an application

The consuming Vite application needs `vite-plugin-solid` and
`@vanilla-extract/vite-plugin`, as configured in this package's `vite.config.ts`.
This workspace package exports TypeScript source; the consumer compiles its styles.

Import the global styles once at the application entry point. Font loading is a separate,
explicit import; these Latin font files are bundled locally, with no font CDN request.
Applications serving other writing systems must load the appropriate font coverage.

```ts
import "@amends/ui/fonts";
import "@amends/ui/styles";
```

Use the variable contract from a `.css.ts` module:

```ts
import { style } from "@vanilla-extract/css";
import { vars } from "@amends/ui/vars";

export const panel = style({
  background: vars.color.surface.panel,
  color: vars.color.text.primary,
  padding: vars.space[6],
  borderRadius: vars.radius.large,
});
```

Typography roles provide complete styles without choosing the HTML element:

```tsx
import { type } from "@amends/ui/typography";

export const Title = () => <h1 class={type.heading}>Your workspace</h1>;
```

## Theme scopes

Set `data-theme="cotton"` or `data-theme="soot"` on the document element or a subtree.
The default root theme is Cotton. Set `data-surface="inverse"` on dark navigation or
another intentionally dark surface. Inverse supplies a complete set of foreground,
background, focus, status, and shadow roles; it does not depend on the page theme.
If both attributes are on the same element, inverse wins. A descendant with its own
theme can start a new scope.

Every scope paints its canvas background and primary text and sets the browser's
`color-scheme`. The application owns preference persistence and system preference
listeners, and should resolve the initial preference before styles load.

Components should consume `vars`, not import Cotton or Soot values directly. Popovers
and other portaled content must stay within the intended theme scope or receive that
scope explicitly. Moving content to `body` loses a nested theme.

## Page patterns

Compose pages from these shared components so placement and responsive behavior stay
consistent. The consuming application supplies the mobile navigation button to `PageHeader`.

| Pattern           | Contract                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageHeader`      | Breadcrumbs on the first row at every width, with the menu button below 768px. Title on the left and at most two page actions on the right. Subtitle and status metadata below.        |
| `ContentToolbar`  | Filter pills in `filters`, aligned left. Content or grouping switches in `view`, aligned right. Each slot retains its alignment when the toolbar wraps.                                |
| `FormActions`     | After the editable content and change summary. Secondary cancel or discard precedes the primary create, save, or publish action; both align right and keep visible labels on mobile.   |
| `DetailLayout`    | Companion panels such as Thread/Details or Log/Execution. Show both when the component has at least 720px; otherwise use right-aligned tabs. Both panels stay mounted.                 |
| `MasterDetail`    | A list and its selected record. At less than 720px of available width, selecting a record opens its detail with a back control. Returning restores focus to the list trigger.          |
| `FormColumns`     | Related fields or static sections. Columns stack when their container is 560px or narrower; fields do not become tabs.                                                                 |
| `InspectorLayout` | Contextual content opened from the page. Dock a 400px inspector when at least 560px remains for the main content; otherwise use a modal drawer from the right, full width below 768px. |

`EntryShell` frames the screens before a workspace exists: sign-in, the picker,
and membership explanations. It shows the mark as a home link, the signed-in
address with sign-out when an account is supplied, a title and blurb, a reading
column of 420px or 560px, and a footer note. It has no rail. `CodeField` is a
one-time numeric code: one real input carries focus, keyboard entry, paste, and
autofill, while the boxes are presentation. The caller keeps the digits and
decides when the code is complete.

Header actions start a flow or operate on the current resource: New task, Select tasks,
Edit, and Stop session. Submission actions belong to `FormActions`, including Publish
version. Use breadcrumbs for ancestry instead of adding a duplicate back button in
the header. Each header action requires an icon and label; below 768px it becomes a
44px circular button while keeping its accessible name. Status text stays visible.

On the task list, Select tasks is the secondary header action beside New task. It
becomes Done in the same position while checkboxes are visible. The selection count
and bulk actions belong in the collection footer.

Use separate pills for collection filters. Session event categories use a segmented
switch in the full-width `DetailLayout` header, aligned right. A segmented control
used as a form field, such as priority or authority, stays with its field label; the
toolbar alignment rule applies to controls that switch displayed content.

Keep list rows inside their container; negative horizontal margins can create a
scrollbar in narrow companion panels. Settings invitations use an inline form beside
the history on wide screens and below it at narrow widths, with one create action.

Responsive layouts use the space available after navigation and inspectors. Keep
drafts, selected panels, and reading position when changing presentation. Companion
tabs transfer keyboard focus to the selected panel when both panels become visible;
collapsing preserves the panel containing focus. Session logs follow new entries only
while the reader is at the bottom.

Inspectors keep one body mounted while moving between docked and modal presentation.
They provide a visible close control, Escape dismissal, and focus restoration.
Their background matches the content canvas, with a subtle dashed seam where they meet the
content. Full-width mobile views omit the seam.
Conversation threads use `presentation="conversation"`: they dock beside the stream
when space permits and use the same end drawer as other inspectors at narrower widths,
covering the full screen on mobile. The thread and stream retain their drafts across
width changes. The thread owns its header and scroll areas inside `Dialog`'s fill layout;
the native modal keeps the page underneath out of keyboard navigation.

### Conversations and execution

Use `Message` for every author: user, agent, contact, or system. Its `kind` selects the
identity treatment; the body stays visible with the same typography and spacing. Channel direction,
delivery information, and workflow notes belong in its metadata and footer.

Messages, turn entries, and session log events use spacing instead of bottom divider lines.

Use `Composer` for every writable conversation. It has one outlined editor, a visible label,
a send action at the lower right, and context and errors underneath. The send action becomes a
circle on mobile while retaining its accessible name. Enter adds a line; Ctrl/Command+Enter
submits, except during text composition. Pending submissions lock editing without discarding
the draft or removing input focus. The caller owns submission state and clears the draft only
after success; errors remain associated with the input for retry.

Ordinary messages use the default "send message" action, including messages added to a running
turn. Explain the destination in the description. A task waiting for an answer uses a
right-aligned `SegmentedControl` in `modeSwitch` to choose Answer or Message; both modes retain
the same draft. Answering has an explicit "answer and continue work" action. Thread actions,
such as tracking or viewing a task, belong above the conversation, outside the composer.
Channel traces are read-only and do not show a composer.

For agent, channel, and task threads, the consuming application should combine
messages, thread membership and task workflow events, task creation cards, and turns in chronological
order, using journal sequence to break ties. A task card sits at creation and reflects the task's
current title, status, and owner. A turn entry represents its start; it is not repeated as a plain
start event. Channel delivery stays with its message. Events are separate timeline entries rather
than message footnotes or a separate related-tasks section.

Use `TurnSummary` for execution details, independently of the closing message. Number turns
chronologically within the thread, position them at their start time, and include working,
failed, cancelled, and silent turns. Its child factory mounts the session preview only while
expanded. Questions and answers remain messages; task actions stay with the task workflow.

Use `TaskReference` for a task linked from a conversation, a parent task, or a session origin.
It includes the title, status, and optional owner. Task lists with selection and row actions
continue to use their list presentation.

## Choose a role

| Family                        | Use                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `surface`                     | Canvas, panel, recessed content, muted grouping, modal scrim.                                   |
| `text`                        | Primary reading, supporting text, muted metadata, disabled text.                                |
| `line.subtle`, `line.seam`    | Decorative divisions. Do not use as the sole boundary identifying an input.                     |
| `line.control`, `line.strong` | Identifiable controls and stronger interactive boundaries.                                      |
| `action`                      | Ink fills, text on those fills, hover, pressed, selected, and disabled surfaces.                |
| `focus.ring`                  | Keyboard focus. A 2px outline with 2px offset, independent of shadow.                           |
| `brand`                       | Workspace marks and links. Use `brand.text` for links, not `brand.fill`.                        |
| `status`                      | Indicator, readable text, and soft notice surface. Always accompany colour with words or shape. |
| `selection`                   | Selected text and its background.                                                               |
| `shadow`                      | Overlay and modal surfaces. Page content stays flat.                                            |

Semantic status colours do not define task or session state. Those mappings belong to
the application. Pending means attention, not failure; held and review can share it.
Disabled text is intentionally subdued and excluded from the readable-text contrast
guarantee. Soft status backgrounds belong to notices, not every badge or row.

## Dimensions, type, and motion

Render display text through `Text` from `@amends/ui/components`. It defaults to a body
paragraph. `as` selects the semantic element and `variant` selects a complete visual
role; a small section heading can still be an `h2`. Native attributes and refs reach
that element, including label associations, timestamps, live regions, and focus.

```tsx
<Text as="h2" variant="panelTitle">Execution details</Text>
<Text tone="secondary">Review the changes before publishing.</Text>
<Text as="span" variant="caption" tone="muted">Updated just now</Text>
<Text>Publish <Text as="strong" variant="inherit">this version</Text>?</Text>
```

| Roles                                 | Use                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `display`                             | Large introductory or specimen text.                                      |
| `pageTitle`, `pageCodeTitle`          | Page headers; their compact sizes are part of the shared role.            |
| `heading`, `panelTitle`, `subheading` | Content, dialog, and companion-panel headings.                            |
| `title`, `titleSmall`                 | Sans-serif titles and form labels.                                        |
| `body`, `bodySmall`                   | Reading text and supporting descriptions.                                 |
| `label`                               | Short monospaced section labels; capitalization belongs to the component. |
| `mono`, `caption`, `quote`            | Technical text, metadata, and quotations.                                 |

Use `variant="inherit"` for inline fragments inside a component that already owns
typography, such as row metadata. `strong` and `em` retain emphasis. Use `tone` for
text color and `class` for layout. Avoid per-page font overrides. Components such as
`PageHeader`, `Section`, and `Field` choose their own roles for supplied text.

Use `Text` or a more specific UI component for paragraphs, headings, spans, and labels.
Structural containers,
decorative graphics, and the native controls inside UI primitives retain their HTML
elements. Strings passed to a button, field, or heading component need no extra wrapper.

`@amends/ui/tokens` exports dependency-free TypeScript data. Dimensions are numbers in
CSS pixels, durations are milliseconds, line heights are unitless, and letter spacing
is in em. Colour and shadow values use CSS strings; this is a web foundation, not a
native renderer abstraction.

The web contract converts spacing and control sizes to rem using a 16px basis. Typography
roles also use rem. Radius and stroke geometry stay in pixels. The spacing key denotes
four-point steps: `space[6]` is 24px, rendered as 1.5rem. Layout thresholds describe
available width; they do not identify phones or touch hardware. Consuming applications
can use `any-pointer: coarse` to enlarge controls to the shared touch target.

`seam` draws a precise 7px/6px decorative repeat. CSS dashed control borders use the
browser's dash distribution around corners; they do not promise that exact repeat.
`runningStitch` applies the shared SVG stroke and a two-repeat animation. Keep a static
state label beside it. Reduced-motion preferences disable animation and transitions;
component completion must never depend on an animation-end event.

## Validation

```sh
bun run check
bun run --filter @amends/ui test
bun run test
```

The contrast suite checks readable text at 4.5:1 and control/focus/status indicators at
3:1 on each supported surface, including composited notice backgrounds. It converts
the authored OKLCH colours to sRGB for comparison. These checks do not certify an
arbitrary composition or an entire application. Check keyboard behavior, zoom, overflow,
theme inheritance, and reduced motion in the rendered interface as components are added.

## Controls

Import `Button`, `IconButton`, `Field`, `TextField`, `TextArea`, and `Checkbox` from
`@amends/ui/components`. Native attributes, events, and refs reach their native control.

```tsx
<Field label="Task title" required description="Describe the outcome." error={error()}>
  <TextField name="title" value={title()} onInput={(event) => setTitle(event.currentTarget.value)} />
</Field>
<Button type="submit" pending={saving()}>Create task</Button>
<IconButton label="More actions" variant="ghost">{icon}</IconButton>
<Checkbox label="Notify me" name="notify" />
```

A `Field` holds one text control. It owns the control ID, label, description, error
association, and inherited required/disabled state. Error text sets `aria-invalid`;
the application chooses validation timing, announcements, and focus after submission.
Text controls can also be used alone with an explicit accessible label.

Buttons default to `type="button"`. Choose primary, secondary, or ghost emphasis,
neutral or danger tone, and compact, regular, or touch sizing. `pending` preserves
the name and keyboard focus while blocking activation and exposing `aria-busy`.
The application owns pending state and any completion announcement. `disabled` uses
the native disabled behavior. Icon buttons require a `label`; their graphic is decorative.

Checkboxes use native checked, required, submission, and reset behavior. `indeterminate`
represents partial selection; the browser clears it on user activation. The caller
computes it again when the underlying selection changes.

## Dialogs

`Dialog` is controlled by `open` and `onOpenChange`. Give it a title, optional short
`description`, body children, and `actions`. Keep it mounted inside the intended theme
scope. Native `showModal()` places it in the browser's top layer without a portal;
background content becomes inert and keyboard focus stays within the modal.

The heading receives initial focus unless `initialFocus` supplies a control. Escape
requests closure by default; backdrop dismissal is opt-in with `closeOnBackdrop`.
`dismissible={false}` blocks both. The application must provide a visible close action.
Closing restores the original trigger unless `returnFocus` supplies a different target,
such as the task heading when cancellation removes its trigger.
Open dialogs lock document scrolling, including when more than one dialog is open.

`ConfirmationDialog` supplies safe and confirming actions. It focuses the safe action
first, never dismisses on backdrop click, and blocks dismissal and repeat confirmation
while `pending`. `onConfirm` starts the application-owned command; the application
closes the dialog on success or supplies `error` on failure. Error text is announced.

## Menus and tooltips

`DropdownMenu` holds action items and separators. `Tooltip` provides supplemental text.
Both take a `trigger` render function: spread its supplied props onto the trigger so the
native element receives its events, ref, and ARIA associations. Menus use a button; a
tooltip may also describe a focusable span or an existing link.
An icon trigger still needs its own accessible label.

```tsx
<DropdownMenu trigger={(trigger) => <Button {...trigger}>Actions</Button>}>
  <DropdownMenuItem onSelect={markReady}>Mark ready</DropdownMenuItem>
  <DropdownMenuSeparator />
  <DropdownMenuItem tone="danger" onSelect={openConfirmation}>Cancel task</DropdownMenuItem>
</DropdownMenu>
<Tooltip content="Only this task is affected."
  trigger={(trigger) => <IconButton {...trigger} label="About task actions">?</IconButton>} />
```

Menus support arrow keys, Home/End, typeahead, Escape, outside dismissal, and disabled
items. Selection runs after the menu's focus cleanup, so an action can open a dialog
without competing focus restoration. Set menu `disabled` while its command is pending.
These are action menus; selection controls such as listboxes have a different contract.

Tooltips appear immediately on keyboard focus and after 500ms of hover. They remain
hoverable, close on Escape or activation, and contain text only. Essential instructions
must remain visible outside a tooltip, including for touch users.

Kobalte supplies the unstyled interaction and positioning primitives. The UI package
owns the public composition, styling, and theme-aware portal behavior. Portals mount
inside the trigger's native dialog when present, otherwise in the document body. They
copy the nearest Cotton, Soot, or inverse scope and follow attribute changes. Dialog
content scrolls independently so its overlay children can extend beyond the dialog edge.

## Account-panel building blocks

`Popover` supports mixed content with normal Tab navigation. It is controlled with
`open` and `onOpenChange`, has an accessible `label`, and uses the same trigger render
function as menus. Escape and outside interaction dismiss it; changing a nested
control keeps it open. It uses the shared portal scope and supports an explicit
`theme` for a panel opened from the inverse navigation rail.

`RadioCardGroup` provides a labeled fieldset of native radio inputs. Each option has a
value, label, optional decorative preview, and optional disabled state. The caller owns
`value` and `onChange`; an explicit `name` includes the selection in native form data.

Use `Identity` for a person, agent, contact, or system identity. It owns both the initials badge
and its visible name. All kinds are circular: users are filled, agents dashed, contacts outlined,
and system identities dotted with a muted fill. `kind` is required; never infer it from a name.
An unassigned task has no identity, so show plain “unassigned” text without a badge.

The default display includes the name. Use `size="compact"` for metadata and chips, `small`
for messages and people lists, and `medium` or `large` only where the surrounding layout needs it.
`compact` hides the visible name independently of size and supplies a name tooltip on hover and
keyboard focus. Its standalone trigger is a named, focusable image, not an action button.
When the badge belongs to an existing button or link, supply `trigger` so the tooltip uses that
control's events, ref, and focus. Keep the control's accessible action name.

```tsx
<Identity name="Jo Mercer" kind="user" />
<Identity name="Ada" kind="agent" size="compact" />
<Identity name="Priya Raman" kind="contact" compact />
```

`Message`, `TaskReference`, and `TurnSummary` use `Identity` internally. People rows, navigation,
and selection chips accept `identityKind` alongside their existing label/title, so callers do
not assemble a separate badge and duplicate name. Names within prose, breadcrumbs, and form
values remain text; standalone identity labels and metadata use the shared component.
Account details, theme persistence, and navigation callbacks belong to the consuming
application's `AccountPopover` composition.
