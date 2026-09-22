# Feature component conventions

Read [README.md](README.md) before changing this package.

- Keep runtime components in `src/<feature>` and export them through a domain subpath.
- Compose `@amends/ui`; receive presentation data and callbacks instead of importing
  the web app, HTTP clients, backend services, or Storybook into runtime source.
- Stories render the same exported components used by web. Keep fixtures and controls
  in `stories`, with meaningful pending, failure, empty, access, and responsive states.
- Components own local interactions. Web owns session/workspace scope, transport, and
  domain-error mapping. Remount on owning-identity changes and ignore disposed completions.
- Declare Vitest tests through `@effect/vitest`. Story play functions use `storybook/test`;
  portable-story tests run those functions through the existing Bun/Vitest runner.
- Check both Storybook and web production builds after changing tooling. The builder
  already loads `vite.config.ts`; do not duplicate Solid or vanilla-extract plugins.
