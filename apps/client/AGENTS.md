# Shared client conventions

Read [README.md](README.md) before changing this package.

- Own shared routing, session lifetime, API access, and application composition here.
  Web and desktop supply the router, endpoint, and persistence configuration.
- Consume UI through declared `@amends/frontend` exports. Frontend must not import
  this package or depend on its runtime, API contracts, sessions, or routing.
- Keep HTTP contract and gateway schema imports in `src/api/`. Other client modules
  use named API modules. Backend implementations and Tauri APIs stay outside client.
- Scope request state and atom registries to credentials. Replacing credentials must
  cancel old work and discard its data; stale completions cannot replace a newer session.
- Keep application stories and transport/store fixtures local to this package and
  outside its exports. Use its workshop for client integration; frontend owns UI stories.
- Use `@effect/vitest`, run tests on Bun, and follow the root Effect source rules.
  After changes run root checks, client tests, both app builds, and relevant workshop builds.
