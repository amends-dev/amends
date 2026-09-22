# Text

A Solid primitive composed from the reviewed color and typography foundations. It renders
one native element, with no extra wrapper. Existing `apps/ui` components are not imported.

```tsx
import { Text } from "@amends/frontend/primitives/text";

<Text>Ordinary content.</Text>;
<Text as="h2" variant="heading">
  Group activity
</Text>;
<Text as="code" variant="mono" tone="secondary">
  thread_123
</Text>;
```

## Contract

| Prop      | Values                            | Default   |
| --------- | --------------------------------- | --------- |
| `as`      | `p`, `span`, `h1`–`h6`, `code`    | `p`       |
| `variant` | `body`, `heading`, `mono`         | `body`    |
| `tone`    | `inherit`, `primary`, `secondary` | `inherit` |

`as` determines semantics independently of appearance. A heading variant on a paragraph
does not create a semantic heading. A code element still needs `variant="mono"` to select
that visual style. Only these elements and the reviewed styles/tones are part of this slice.

Text has zero margins. It inherits color by default, including a secondary color supplied
by a parent. Explicit primary/secondary tones use the active color theme's variables.
Typography defaults to body rather than inheriting the parent's typography. Surrounding
layouts own spacing and long-word wrapping; Text does not truncate or add word-breaking rules.

Native attributes, event handlers, inline styles, children, and refs reach the selected
element. The public generic types select native attributes and the ref element from `as`.
The component's `as`, `variant`, and `tone` props are consumed and do not become DOM attributes.

`class` and truthy `classList` entries are merged with the component classes into one reactive
class value. This keeps enabled classes present when a variant or custom class changes.
Falsy entries add no class; they do not remove classes supplied separately through `class`
or the component's foundation styles. Normal CSS cascade rules apply to custom styles.

Changing appearance, content, or native attributes updates the existing element and preserves
focus. Changing `as` creates the requested element and invokes the ref for that new node.

## Fonts and themes

Load fonts at the consuming application's entry and select a theme on an ancestor:

```tsx
import "@amends/frontend/foundations/typography/fonts";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import { Text } from "@amends/frontend/primitives/text";

<main class={colorThemes.cotton}>
  <Text as="h1" variant="heading">
    Workspace
  </Text>
  <Text tone="secondary">Keep the context close.</Text>
</main>;
```

Text does not load font files, select a document theme, or apply global resets. See the
[color](../../foundations/color/README.md) and [typography](../../foundations/typography/README.md)
contracts. Its runtime imports only Solid and these foundations; it has no application data
or transport dependencies.

## Verification

**Primitives / Text** includes Comparison, Playground, Inline and Headings, Inheritance,
Narrow, and Reactive Props. Comparison shows all three variants and tones in both themes.
Playground controls expose the native element, style, tone, content, and theme. The inheritance
story puts default text inside a secondary-colored panel and demonstrates an explicit primary
override. Narrow uses a 320px container with a container-owned long-word wrapping rule.

DOM tests check native elements, attributes, refs, events, inline nesting, reactive updates,
focus preservation, class merging, and element replacement. Type-check examples reject
unsupported tags, variants, tones, and invalid native attributes/ref types. The Reactive Props
story runs the same interaction scenario in the browser and through the Bun/Vitest portable
story runner. Browser review checks actual font/color styles, zero margins, inline/block
behavior, accessibility, and narrow layouts; Happy DOM does not establish visual fidelity.

Run `bun run --filter @amends/frontend test`, `bun run check`, and
`bun run --filter @amends/frontend build`, then review the stories in the browser.
