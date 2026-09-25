# Empty state

The Component Inventory's house state: a drawing, a serif line, a sentence, and one action.

```tsx
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Drawing } from "@amends/ui/primitives/drawing";

<EmptyState.Root>
  <Drawing.Snapped />
  <EmptyState.Text>
    <EmptyState.Title>The run failed</EmptyState.Title>
    <EmptyState.Description>The session log is kept.</EmptyState.Description>
  </EmptyState.Text>
  <EmptyState.Actions>
    <Button>Try again</Button>
  </EmptyState.Actions>
</EmptyState.Root>;
```

The same parts form the Inventory's ErrorState (failed run, lost connection, permission
refused): choose a failure drawing, and never red. Title is an `h2` unless `as` places it
elsewhere in the page outline. Actions holds one primary action, plus a secondary one when
the reference pairs them. Omit any part a state does not need.

Dimensions follow Primitives v2, "Drawings, in place": centered content with 18px between
drawing, text, and actions, a 23px serif title, 13.5px secondary description, 300px reading
width, and 9px between wrapped actions. `size="page"` is for a state that is a page's whole
content: its title takes the `heading` style (30px) shared by standalone page titles, its
description the `body` size, with 24px between parts and a 420px reading width. The composition adds no panel, padding, or page width;
pages center it in Shell content, and a region may place it on a panel. Root has no role, so
a caller announcing a change marks the part that changes, such as the description.

**Compositions / EmptyState** covers the reference failure and an empty result on panel in
both themes, the page size on canvas, narrow and RTL layouts, enlarged text, and a reactive recovery whose announced
description and focused action survive updates; that story runs as a portable test.
