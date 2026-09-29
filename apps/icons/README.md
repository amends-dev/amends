# Amends icons

`@amends/icons` provides shared Solid SVG components for apps and UI packages. It
has no runtime dependency beyond its Solid peer, no global styles, and no dependency
on UI packages, application contracts, or a host. Add `"@amends/icons": "workspace:*"`
to a consuming workspace's dependencies and run `bun install` at the root.

```tsx
import { IconMarkSearch, IconCircleCheck } from "@amends/icons";
import { IconMarkDone } from "@amends/icons/mark-done";

<button aria-label="Search workspace">
  <IconMarkSearch />
</button>;
<IconCircleCheck label="Completed" size="sm" />;
<IconMarkDone size={24} weight={1.75} />;
```

The 26 `mark-*` drawings reinterpret the named glyphs in the
[Primitives v2 Marks reference](<../../design-system/Amends Primitives v2.dc.html>) as
portable SVGs. They are the visual reference for frontend navigation and actions when
the reference names the control. The earlier 23 outline utility icons remain for
controls without a corresponding mark, including the mobile hamburger, sidebar toggles,
notifications, and delete. `IconBellFilled` is the bell's filled state, for following. `IconList`
opens a destination's full list from its sidebar section. `IconMarkMenu` is the reference's downward menu caret;
`IconMenu` remains the mobile hamburger. Named exports and individual subpaths both
point to generated Solid source.
Consumers must compile dependency TSX with their Solid plugin, as our Vite apps do.
The UI package draws every icon it shows from this package.

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

## Source and generation

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

From the repository root:

```sh
bun run --filter @amends/icons generate
bun run check:icons
bun run test --project @amends/icons
bun run --filter @amends/ui dev
```

The compiler validates the entire set before writing. Generation creates
`src/generated/*.tsx`, the named-export `src/index.ts`, metadata-only `src/catalog.ts`,
and `svg/*.svg`. Commit these alongside the canonical drawings. Do not hand-edit
generated outputs. Removing a drawing and regenerating removes its obsolete outputs;
references to the removed drawing fail validation. `check:icons` compares generated
bytes and detects extra output files without writing. It runs in `bun run check`
and the pre-commit hook.

The build tools run directly on Bun. The compiler has no geometry-library dependency;
the generator uses the root Oxfmt installation to produce deterministic formatted
source. Runtime components never import the generator or its dependencies.

## Drawing rules

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

## Catalog and review

```ts
import { iconCatalog, type IconName } from "@amends/icons/catalog";
```

Catalog records contain names, titles, categories, keywords, and component export
names. They do not import components. The component entry point does not import
catalog data; there is no global runtime icon registry. A Vite/Solid consumer test
checks that one named icon excludes unrelated geometry, and that catalog-only
consumers exclude Solid. Raw assets are available at `@amends/icons/svg/<name>.svg`;
copy them to a public location if needed. External images do not inherit the page's
text color; use Solid inline icons for themed UI.

Open **Foundations / Icons** in the UI Storybook to review the set in light and dark. Gallery
searches names, keywords, and categories across marks and utility icons. Sizes compares
representative glyphs at every supported weight and named size plus 32px. Accessible Names
demonstrates decorative and named transitions without replacing the SVG. Gallery search and
accessible names also run as portable stories.

Judge additions at their actual small sizes beside related icons and inside their
controls. Check gaps, balance, centering, disabled appearance, theme inheritance,
RTL where relevant, and enlarged root text. Numeric validation is not visual approval.

## Provenance and current scope

Drawings and rounded-corner construction are adapted from
[Regen Icons](https://github.com/kazdenc/regen-icons/tree/64c0e165c3ce6d5c9d7329acf5762306f86d6b1d)
under the included [MIT license](LICENSE). All 23 initial compiled paths were checked
against that revision's outline SVGs. The compiler is a smaller typed adaptation for
our current set, not a compatibility implementation of Regen's entire drawing language.
The 26 mark drawings were added from the Amends Primitives v2 reference's named glyphs;
`mark-settings` reuses the existing MIT-licensed gear construction. Their SVG paths are
our drawings, not embedded text glyphs, so they keep the package's theming, sizing, and
accessibility contract across platforms.

Intentional differences are Solid output, Bun execution, rem-based named sizes,
constant default stroke weight, separate metadata, and Storybook review. Tonal variants,
sprites, automatic optical-balance reports, transforms, and public npm publishing are not
implemented. Add them only with a concrete consumer and verification.
