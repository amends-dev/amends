# Drawing

Stroke drawings from the Illustration reference's running-stitch direction, at 150px wide.

```tsx
import { Drawing } from "@amends/ui/primitives/drawing";

<Drawing.Snapped />;
<Drawing.Disconnected label="A thread unravelling off the edge" />;
```

| Drawing        | Shows                                          | Use for                     |
| -------------- | ---------------------------------------------- | --------------------------- |
| `Disconnected` | A thread unravelling and trailing off the edge | A lost or unreachable host  |
| `Snapped`      | A thread snapped in two, both ends frayed      | A failure                   |
| `Bare`         | A grid of stitch marks with a bare patch       | Nothing here, or no results |

Each drawing uses the reference's two weights and its ink/cloth colors: `text.primary` for
the thread, `line.control` for cloth marks and frayed ends, and `text.secondary` for the
unravelling stretch. A theme change is therefore a token swap. Failure reads through shape,
never through the danger color. In forced colors every stroke uses the system text color.

Drawings are decorative by default (`aria-hidden`), because the state beside them names it.
Pass `label` when a drawing carries meaning on its own; it then becomes `role="img"` with that
name. Native SVG props and refs are forwarded; the view box is fixed. The reference's stitch
animation is not included. The remaining reference drawings arrive as states need them.

**Primitives / Drawing** shows each drawing on canvas and panel in both themes, and with
enlarged text.
