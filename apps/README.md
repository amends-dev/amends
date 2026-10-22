# Apps

The apps are what people see: the workspace app, the site at amends.dev, and their supporting
libraries. The workspace app signs people in through the [HTTP API](../packages/http/README.md)
and keeps open workspaces in sync. It includes conversations, tasks, agents, connections, channels,
and settings; its README describes the current contract and remaining work. These packages are
private to the repository.

| Package                          | What it is                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| [`app-v2`](app-v2/README.md)     | The workspace app on Foldkit Blocks, with browser replicas and pending local actions. |
| [`design`](design/README.md)     | The workspace app's look: Tailwind tokens and the renderers that carry them.          |
| [`markdown`](markdown/README.md) | Markdown tokens, mentions, and plain text shared by app data and design.              |
| [`ui`](ui/README.md)             | The design system: foundations, components, layout patterns, and every screen.        |
| [`site`](site/README.md)         | amends.dev: the product, the packages, and their docs, on Astro and Starlight.        |
| [`icons`](icons/README.md)       | The icons, drawn as data and generated as Solid components, SVGs, and paths.          |

## How they fit

UI draws: its screens take data and callbacks and render a pane or the navigation, and know nothing
of the API, the session, or routes. The site composes UI's site sections into static pages; it
defines no styles of its own. The workspace app draws with `design` instead: its views call
`design`'s renderers and carry no class, and `design` imports nothing of UI; it draws its icons from the
icons' path data, where UI draws the Solid components.

`markdown` parses text for both app data and design renderers. It depends on Marked and Effect,
with no browser APIs, styles, or UI framework, so search can read message text independently of
rendering.

`bun run check:packages` enforces these boundaries: UI depends on no router, Effect, or platform
package, and the icons' runtime depends on Solid alone.

## Development

From the repository root, after `bun install`, run each in its own terminal:

```sh
bun run --filter @amends-dev/ui dev            # the design system's workshop, http://127.0.0.1:6010/
bun run --filter @amends-dev/site dev          # the site, http://127.0.0.1:4400/
bun run --filter @amends-dev/app-v2 dev        # the workspace app, http://127.0.0.1:4410/
bun run --filter @amends-dev/design workshop   # the workspace app's renderers, http://127.0.0.1:4420/
```

The design system, the site, and the renderers' workshop need only Bun; the workspace app reaches the
[local host](../hosts/local/README.md), which it expects at its default port. `bun run test apps` runs every app's tests, and each package's README covers
its own checks.
