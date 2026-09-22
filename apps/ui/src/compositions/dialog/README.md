# Dialog

A centered native modal matching the Primitives v2 confirmation. Content is composed
through children; open state, dismissal, and native attributes are behavioral props.

```tsx
import { Dialog } from "@amends/ui/compositions/dialog";

<Dialog.Root>
  <Dialog.Trigger>Review changes</Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Keep these changes?</Dialog.Title>
      <Dialog.Description>Your original is retained in history.</Dialog.Description>
    </Dialog.Header>
    <Dialog.Body>{/* Form or other content */}</Dialog.Body>
    <Dialog.Footer>
      <Dialog.Close>Keep changes</Dialog.Close>
      <Dialog.Close variant="secondary">Go back</Dialog.Close>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>;
```

`Root` supports uncontrolled `defaultOpen` or controlled `open`/`onOpenChange`.
`Content` stays mounted while closed, so fields retain drafts. `Title` and
`Description` provide its accessible name and description. Provide one title, or an
explicit accessible name on Content. Complex content can omit Description and use Body.
`Header`, `Body`, and `Footer` are optional layout parts; Body owns scrolling for long content.
Content itself scrolls if enlarged headings or actions cannot fit the available height.

The browser provides modal inertness and focus containment through `showModal()`.
The shared private modal implementation also powers Drawer: Escape/backdrop dismissal,
heading-first focus, focus return, interrupted exit animations, and reduced motion.
Use `initialFocus` for a specific safe action and `returnFocus` when the original trigger
may disappear. `dismissible={false}` gates Escape and backdrop; the caller must separately
disable explicit close actions while busy. `animated={false}` removes entry/exit delay.
Handlers can prevent default to cancel trigger, close, or native cancel behavior.

`Close` composes Button, including tone, variant, pending, and native attributes.
For asynchronous work, use an ordinary Button and close the controlled Root only after
success, or use `Dialog.useDialog().close()`. A form can live in Body with a submit Button
in Footer referencing its form ID. Errors and network work belong to the consuming feature.
Select and Tooltip portals inherit the modal host, preserving theme and interaction.

The mock's 440px width, 22px corners, serif title, spacing, scrim, and shadow are
component styles expressed in rem where text scaling matters. The panel and Buttons use
the reviewed palette and controls; the mock's slightly different off-white and small
button sizing are intentionally not duplicated. These values do not expand the generic
radius scale. Cotton, Soot, form recovery, and long-content stories cover the composition.

DOM/portable-story tests cover associations, controlled state, cancellation, retained drafts,
pending/error recovery, and focus return. Browser review is required for actual modal
inertness, Tab containment, Escape/backdrop behavior, nested popups, and responsive geometry.
