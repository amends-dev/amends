# Icon package conventions

Read [README.md](README.md) before editing this package.

- Edit canonical `drawings/*.icon.json`, then run `bun run --filter @amends-dev/icons generate`.
  Do not hand-edit `src/generated`, `src/index.ts`, `src/catalog.ts`, or `svg`.
- Keep runtime source independent of other Amends packages and of build tools. It may
  import Solid. Put searchable metadata in the separate catalog entry point.
- Add only needed drawings. Reuse existing constructions; preserve the Regen Icons
  license and provenance for adapted material. Unsupported language features must
  fail explicitly rather than be ignored.
- Test compiler contract changes and generated-output drift. Verify Solid reactivity,
  accessible naming, and consumer tree shaking when changing the rendering/export layer.
- Extend the UI package's Foundations / Icons stories for new rendering capabilities.
  Compare additions at actual sizes beside related glyphs in light and dark. Review
  affected controls in a real browser, including root-text scaling and relevant RTL.
- Run `bun run check`, `bun run test`, and `bun run --filter @amends-dev/ui build`.
