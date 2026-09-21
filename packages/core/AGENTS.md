# Core conventions

Read [README.md](./README.md) before changing core. It defines feature ownership,
module dependencies, schema names, and construction conventions.

- Group each feature's model, operations, store contract, facts, projection, and
  permissions in its own directory. Add only the modules the feature needs.
- Keep models independent of application services and projections. Separate fact
  declarations from projection handlers and application workflows.
- Import owning leaf modules inside core. Public domain barrels relay canonical
  module namespaces; internal modules do not import through those barrels.
- Use ID-only leaf modules when references between models would create a cycle.
- Follow the documented meanings of `Record`, `Value`, `Reference`, `Definition`,
  operation inputs/options, `State`, `Status`, and service `Interface`.
- Preserve serialized contracts and service keys when moving or renaming source.
- Keep tests grouped by domain and feature under `test/`.
- Read operations authorize and query current state without opening a transaction.
  Read-only policy helpers must not require `Store.Transaction`. An existing caller
  transaction is honored. Write operations must authorize and mutate inside the
  same journal commit; use explicit snapshots only for reads that require them.
- Keep `make` as the public construction path and have `layer` delegate to it.
  Preserve the distinction between stable construction dependencies and actor,
  transaction, and scope requirements supplied during operations.
