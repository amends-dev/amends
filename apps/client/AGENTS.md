# Shared client conventions

Read [README.md](README.md) before changing this package.

- Own headless session lifetime, typed API access, query state, and pure route helpers.
  Do not render pages, controls, error/loading views, styles, or a route tree here.
- Type what hooks return as the screens' own types, imported type-only from `@amends-dev/ui`, a
  development dependency. Add a client type only for what no screen shows, such as a controller,
  a draft, or a screen type without the hrefs a page adds. Import no UI code, icons, styling
  tools, a router, Storybook, or platform entry points. Web and desktop connect client hooks to
  UI screens and own application composition.
- Solid providers/hooks are state bindings, not presentation. They may provide context
  and own resource lifetime; callers choose markup, navigation, and recovery actions.
- Give each feature one folder: its `api.ts` holds the reads and operations over the HTTP
  contract, the only place besides `src/api/` that imports contract or gateway schemas, and the
  other files hold the hooks its screens connect to. Backend implementations and Tauri APIs stay
  outside client.
- Run writes through `useMutation` and await `run` in the action that starts it; a page whose
  changes count as done once their result shows runs them through `useChanges`. Do not check
  the session in hooks: signing in or out remounts everything under `ClientProvider`, which
  interrupts old requests and discards what they read. Do not handle `401` in operations: the
  API client signs out. Classify failures with typed contract errors (`workspaceFailure`,
  `Schema.is`), never by matching tag strings, and expose codes rather than reader-facing text.
- Use `@effect/vitest`, run tests on Bun, and follow the root Effect source rules.
  Test headless contracts here; each app tests its routing/UI integration, and UI owns
  presentation stories. Run root checks, relevant tests, and both app builds after changes.
