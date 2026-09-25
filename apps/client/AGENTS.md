# Shared client conventions

Read [README.md](README.md) before changing this package.

- Own headless session lifetime, typed API access, query state, and pure route helpers.
  Do not render pages, controls, error/loading views, styles, or a route tree here.
- Client and UI are independent peers. Do not depend on or import `@amends/ui`,
  icons, styling tools, a router, Storybook, or platform entry points in any dependency
  section. Features connects client and UI; web and desktop own application composition.
- Solid providers/hooks are state bindings, not presentation. They may provide context
  and own resource lifetime; callers choose markup, navigation, and recovery actions.
- Keep HTTP contract and gateway schema imports in `src/api/`. Other client modules
  use named API modules. Backend implementations and Tauri APIs stay outside client.
- Scope request state and atom registries to credentials. Replacing credentials must
  cancel old work and discard its data; stale completions cannot replace a newer session.
- Use `@effect/vitest`, run tests on Bun, and follow the root Effect source rules.
  Test headless contracts here; each app tests its routing/UI integration, and UI owns
  presentation stories. Run root checks, relevant tests, and both app builds after changes.
