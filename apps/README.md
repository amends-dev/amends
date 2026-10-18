# Apps

The apps are what people see: the workspace app, the site at amends.dev, built from the design
system, and the libraries it draws with. The workspace app is being built: it signs people in and
keeps each workspace they open in sync, with its groups, threads, and replies; the rest of a
workspace is still worked in through the [HTTP API](../packages/http/README.md). None of these is published to npm.

| Package                      | What it is                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------ |
| [`app-v2`](app-v2/README.md) | The workspace app, on Foldkit: groups, threads, and replies, kept in sync.     |
| [`ui`](ui/README.md)         | The design system: foundations, components, layout patterns, and every screen. |
| [`site`](site/README.md)     | amends.dev: the product, the packages, and their docs, on Astro and Starlight. |
| [`icons`](icons/README.md)   | The icons, drawn as data and generated as Solid components and SVGs.           |

## How they fit

UI draws: its screens take data and callbacks and render a pane or the navigation, and know nothing
of the API, the session, or routes. The site composes UI's site sections into static pages; it
defines no styles of its own. The [workspace shell](../docs/workspace-shell.md) describes the
navigation every workspace screen shares.

`bun run check:packages` enforces these boundaries: UI depends on no router, Effect, or platform
package, and the icons' runtime depends on Solid alone.

## Development

From the repository root, after `bun install`, run each in its own terminal:

```sh
bun run --filter @amends-dev/ui dev        # the design system's workshop, http://127.0.0.1:6010/
bun run --filter @amends-dev/site dev      # the site, http://127.0.0.1:4400/
bun run --filter @amends-dev/app-v2 dev    # the workspace app, http://127.0.0.1:4410/
```

The design system and the site need only Bun; the workspace app reaches the
[local host](../hosts/local/README.md), which it expects at its default port. `bun run test apps` runs every app's tests, and each package's README covers
its own checks.
