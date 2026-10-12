# Core conventions

Read [README.md](./README.md) before changing core. It defines feature ownership,
module dependencies, schema names, and construction conventions.

- Group each feature's model, operations, store contract, facts, projection, and
  permissions in its own directory. Add only the modules the feature needs.
- One module per namespace, named after it (`ThreadStore.ts` exports `ThreadStore`), flat
  in the feature directory, with helpers no consumer imports in `internal/`; a header and
  `@since` on every module and `@category` and `@since` on every export, as
  [threads](../../docs/threads.md#code-conventions) states.
- Keep models independent of services and projections. Separate fact
  declarations from projection handlers and application workflows.
- Import owning leaf modules inside core, with `import * as`; no module re-exports itself.
  Public domain barrels relay module namespaces with `export * as`; internal modules do not
  import through those barrels.
- Use ID-only leaf modules when references between models would create a cycle.
- Name a module's main type after the module (`Member.Member`), and follow the documented
  meanings of `Reference`, `Definition`, operation inputs/options, `State`, `Status`, and a
  service's shape, `Foo["Service"]`.
- Preserve serialized contracts, such as fact names and error tags, when moving or renaming
  source. A service key names its module, `@amends-dev/core/thread/ThreadStore`, and moves with it.
- Keep tests grouped by domain and feature under `test/`.
- Read operations authorize and query current state without opening a transaction.
  Read-only policy helpers must not require `Store.Transaction`. An existing caller
  transaction is honored. Write operations must authorize and mutate inside the
  same journal commit; use explicit snapshots only for reads that require them.
- Keep `make` as the public construction path and have `layer` delegate to it.
  Preserve the distinction between stable construction dependencies and actor,
  transaction, and scope requirements supplied during operations.
