# Adapters

Each `adapters/<name>/` directory is a Bun workspace that implements gateway
contracts over one external system, such as a database. Adapters consume shared
packages and may install the dependencies their system needs, which is why they
live outside `packages/`. Hosts compose them; shared packages never depend on them.

`storage-sqlite/` implements the gateway's workspace storage and workspace
directory contracts over one SQLite file; it is the local host's default.
`storage-postgresql/` implements the same contracts over PostgreSQL, with Drizzle
over the Effect PostgreSQL client and one column per record field. Each README
covers running and testing. Both adapters share one shape: one module per store
over a workspace binding that owns the transaction boundary, merged into the
storage contract at the edge.

Each adapter extends `../../tsconfig.base.json`, enables its own runtime types, and
provides a `typecheck` script.
