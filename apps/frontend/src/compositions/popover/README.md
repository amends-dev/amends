# Popover

A click-open, nonmodal dialog anchored to its trigger. It carries caller-supplied content;
the Ada identity card in the Primitives v2 mock is a reference composition, not built-in
popover data.

```tsx
import { Popover } from "@amends/frontend/compositions/popover";
import { Button } from "@amends/frontend/primitives/button";

<Popover.Root>
  <Popover.Trigger as={Button} variant="secondary">
    Agent details
  </Popover.Trigger>
  <Popover.Content>
    <Popover.Title>Ada</Popover.Title>
    <Popover.Description>Busy · 2 of 3 sessions.</Popover.Description>
    <Popover.Close variant="ghost">Done</Popover.Close>
  </Popover.Content>
</Popover.Root>;
```

`Root` accepts controlled `open`/`onOpenChange`, uncontrolled `defaultOpen`, and placement.
The default placement is `bottom-start` with an 8px gutter. `Trigger` renders as the supplied
Button or IconButton, or as a native button, producing one interactive element. Content should
have a `Title` or an explicit `aria-label`; `Description` adds accessible supporting text.
Other children, including controls, are composed directly. Content actions stay open unless
they use `Close` or the caller changes the open state. `Close` is a Button and honors a
prevented click, as Dialog.Close does.

Kobalte owns the trigger's expanded/dialog associations, focus, Escape and outside dismissal,
and collision-aware positioning. This is nonmodal: Tab can move through the panel and on to
the page. Escape and an explicit Close restore focus to the trigger; an outside click leaves
focus on the clicked control. Portaled content inherits theme variables and direction from
the trigger and mounts within the current native Dialog or Drawer, where a body portal would
be behind the modal top layer. The panel is keyboard focusable so a constrained, scrollable
popover remains reachable inside a modal. Changing the overlay host closes an open popover.

The Primitives v2 reference has a 262px overall panel at the default text size, 16px padding,
12px corners, an 8px gap, and the same soft shadow as Select. Content uses the reviewed
`surface.panel`, `text.primary`, and `text.secondary` roles for Cotton and Soot. The mock's
slightly lighter panel color is adapted to the established token. No arrow or border is shown;
forced colors add a visible system border. Width and height are constrained by the viewport,
and all dimensions scale with the root text size.

**Compositions / Popover** has Reference, Open, Default Open, Soot, Interaction, Controlled, Icon Trigger,
Nested Dialog, Nested Drawer, Near Edge, RTL, Long Content, and Enlarged Text stories. Interaction and
controlled/modal-host stories run in the portable frontend test suite. Browser review checks
actual panel dimensions and color, focus/dismissal, edge flipping, narrow and enlarged text,
forced colors, and accessibility. The reference story uses Avatar, Title, a role label, and
Description as ordinary children.
