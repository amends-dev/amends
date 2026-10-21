# @amends-dev/icons

The icons the amends apps draw: Solid SVG components generated from canonical drawings, with their
raw SVGs, their path data, and a separate metadata catalog. The [UI package](../ui/README.md) draws
every icon it shows from the components, and the [design package](../design/README.md) draws the
workspace app's icons from the path data. The package has no runtime dependency beyond its Solid
peer, no global styles, and no dependency on UI, application contracts, or a host.

The package is internal to this repository and not published to npm. A workspace uses it by adding
`"@amends-dev/icons": "workspace:*"` to its dependencies and running `bun install` at the root.

```tsx
import { IconMarkSearch, IconCircleCheck } from "@amends-dev/icons"
import { IconMarkDone } from "@amends-dev/icons/mark-done"

;<button aria-label="Search workspace">
  <IconMarkSearch />
</button>
;<IconCircleCheck label="Completed" size="sm" />
;<IconMarkDone size={24} weight={1.75} />
```

The `mark-*` drawings are amends's own marks, drawn as portable SVGs, and are the reference for navigation and actions wherever it names the control. Their paths
are drawings, not embedded text glyphs, so they keep the package's theming, sizing, and
accessibility across platforms. Outline utility icons cover controls without a mark, such as the
mobile hamburger (`IconMenu`), the sidebar toggles, notifications, and delete. `IconBellFilled` is
the bell's filled state, for following; `IconList` opens a destination's full list from its sidebar
section; and `IconMarkMenu` is the reference's downward menu caret. The composer's formatting
controls use nine drawings, `bold`, `italic`, `strikethrough`, `link`, `list-ordered`, `quote`,
`code`, `code-block`, and `type`, which shows or hides them; its bulleted list reuses `list`.

Named exports and individual subpaths both point to generated Solid source, so a consumer compiles
the package's TSX with its Solid plugin, as the apps' Vite builds do.

## Rendering contract

Icons use a 24-unit viewBox, round caps and joins, and `currentColor`. Set color on
the parent or through a consumer class/style. The default stroke weight is 2 at
every size; `weight` also accepts 1.5 and 1.75.

| Size           | Dimension  | At a 16px root      |
| -------------- | ---------- | ------------------- |
| `xs`           | 0.75rem    | 12px                |
| `sm`           | 1rem       | 16px                |
| `md` (default) | 1.25rem    | 20px                |
| `lg`           | 1.5rem     | 24px                |
| number         | CSS pixels | Explicit fixed size |

Named sizes scale with root text, including the default 1.25rem IconButton glyph.
Use positive numeric sizes for deliberately fixed artwork. Native SVG props such
as refs, classes, classList, style, and descriptions are forwarded. Reactive size,
weight, label, class, and style changes preserve the SVG element.

Icons are decorative and `aria-hidden` by default. A nonblank `label` makes an icon
an image with a uniquely referenced SVG title. An icon-only button owns the action
name; leave its child icon decorative. Icons do not introduce a tab stop. Geometry,
paint defaults, sizing attributes, and naming semantics are owned by the component.
Directional mirroring belongs to the consumer: Shell mirrors sidebar glyphs in RTL;
the package does not mirror every icon. Animation and reduced-motion behavior also
belong to the consuming control.

## Catalog and raw SVGs

```ts
import { iconCatalog, type IconName } from "@amends-dev/icons/catalog"
```

Catalog records contain names, titles, categories, keywords, and component export
names. They do not import components. The component entry point does not import
catalog data; there is no global runtime icon registry. A Vite/Solid consumer test
checks that one named icon excludes unrelated geometry, and that catalog-only
consumers exclude Solid. Raw assets are available at `@amends-dev/icons/svg/<name>.svg`;
copy them to a public location if needed. External images do not inherit the page's
text color; use Solid inline icons for themed UI.

## Path data

```ts
import { filledIconNames, iconPaths, type IconName } from "@amends-dev/icons/paths"
```

`iconPaths` maps each icon name to its path data, the same string as in the raw SVG, for a view
that draws an icon without Solid, such as a Foldkit renderer. It draws the path under the rendering
contract above: a 24-unit viewBox, `currentColor` strokes of width 2 with round caps and joins, and
no fill. The names in `filledIconNames`, `bell-filled`, also fill their path with `currentColor`.
The module imports nothing, so a consumer's bundle holds only the paths it names.

## Adding an icon

`drawings/<name>.icon.json` is canonical. Each file contains a shape-based kebab-case
name, a title, nonempty category/keyword lists, and a small list of drawing primitives.
Search existing names and meanings before drawing another icon.

```json
{
  "name": "circle-check",
  "title": "Success",
  "categories": ["status"],
  "keywords": ["success", "complete", "verified"],
  "shapes": [
    { "use": "circle-frame" },
    {
      "polyline": [
        [7.5, 12],
        [10.5, 15],
        [16.5, 9]
      ]
    }
  ]
}
```

`bun run --filter @amends-dev/icons generate` validates the entire set before writing, then
creates `src/generated/*.tsx`, the named-export `src/index.ts`, metadata-only `src/catalog.ts`,
the path data in `src/paths.ts`, and `svg/*.svg`. Commit these alongside the canonical drawings. Do not hand-edit
generated outputs. Removing a drawing and regenerating removes its obsolete outputs;
references to the removed drawing fail validation. `check:icons` compares generated
bytes and detects extra output files without writing. It runs in `bun run check`
and the pre-commit hook.

The build tools run directly on Bun. The compiler has no geometry-library dependency;
the generator uses the root Oxfmt installation to produce deterministic formatted
source. Runtime components never import the generator or its dependencies.

### Drawing rules

The numeric contract lives in [scripts/compiler.ts](scripts/compiler.ts). Canvas is
24 by 24; coordinates stay between 2 and 22 on integer or half-unit grid positions.
Stroke centers may reach the safe-area boundary. Distinct overlapping parallel
horizontal/vertical strokes must be at least 3 units apart, including reused shapes
and closed-polyline closing edges. Curves and diagonals require visual spacing review.

A drawing with `"fill": true` paints the areas its shapes enclose as well as its strokes, for
an active state such as `bell-filled`. Each open shape fills as if closed by a straight line, so
build a filled state from the outline drawing and add closed shapes, such as a rect, where the
outline leaves an area open.

Supported primitives are `line`, straight-point `polyline`, `rect`, `circle`, `arc`,
`dot`, and `use`. Polylines get geometric rounded corners, default radius 2, capped
at 40% of the shorter adjacent segment. Set `corner` between 0 and 4 in half-unit
steps; use 1 for small direction marks. Rectangles default to radius 2, or 1 when
their shorter side is below 8. Arcs run clockwise between distinct angles in multiples
of 45 with a sweep below 360 degrees. Use `circle` for a complete circle.

`use` inlines another drawing without transforms. Unknown fields, unsupported
primitives/modifiers, malformed metadata, invalid coordinates/radii, duplicate names,
missing references, and cycles fail explicitly. There is no raw path escape hatch.
Extend the typed language and its validation only when a new needed drawing requires it.

### Review

Open **Foundations / Icons** in the UI Storybook to review the set in light and dark. Gallery
searches names, keywords, and categories across marks and utility icons. Sizes compares
representative glyphs at every supported weight and named size plus 32px. Accessible Names
demonstrates decorative and named transitions without replacing the SVG. Gallery search and
accessible names also run as portable stories.

Judge additions at their actual small sizes beside related icons and inside their
controls. Check gaps, balance, centering, disabled appearance, theme inheritance,
RTL where relevant, and enlarged root text. Numeric validation is not visual approval.

## Scope

The compiler supports only what the current set draws, not a general drawing language. Tonal
variants, sprites, automatic optical-balance reports, transforms, and publishing to npm are not
implemented. Add them only with a concrete consumer and verification.

## Development

From the repository root:

```sh
bun run --filter @amends-dev/icons generate
bun run check:icons
bun run test --project @amends-dev/icons
bun run --filter @amends-dev/ui dev
```

`generate` writes the generated files, `check:icons` verifies them without writing, and the tests
cover the compiler's validation, the components' naming and reactivity, what consumer bundles
include, and that the path data matches the raw SVGs. The last command opens the UI workshop for review.
