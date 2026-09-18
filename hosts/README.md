# Application hosts

Each `hosts/<name>/` directory is a Bun workspace that runs the application in a
particular environment. Hosts compose shared packages and provide runtime layers,
storage, transports, and other platform adapters. They may use dependencies needed
by their runtime.

`local/` is the Bun host. Run it from the repository root with `bun run start`
or `bun run dev`. It implements no storage itself: it composes the SQLite
adapter by default, or the PostgreSQL adapter when `AMENDS_DATABASE_URL` is
set, and provides development sign-in and credentials. A future Cloudflare host
belongs in `hosts/cloudflare/`.

Each host extends `../../tsconfig.base.json`, enables its own runtime types, and
provides a `typecheck` script. Shared packages cannot import hosts.

A host depends on the gateway, whose contracts it implements, and on the handler
packages it serves, such as `@amends/server-http`. It does not depend on protocol
contract packages such as `@amends/api-http`: those are for clients, and the
handler package owns their server-side pieces, including authentication. A host's
tests may take a contract package as a development dependency to act as a client.

## Constructors and layers

Use the [shared construction conventions](../packages/README.md#constructors-and-layers).
`make` constructs a host-owned implementation; `layer` provides it or composes
existing layers. Named layer exports start with `layer`, such as `layerSqlite`,
`layerPostgres`, and `layerRoutes`. Pure secondary constructors use descriptive
names such as `makeCredentials` and return the gateway contract's `Service.of(...)`.
Use `Layer.sync` for lazy synchronous construction and `Layer.effect` for effectful
construction. Constructors own defaults, state allocation, and initialization.

The local host has two implementations in `LocalSignIn`: `make(deliver?)`
constructs sign-in with fresh pending-code state, and `makeCredentials()`
constructs the development credential resolver. `layerCredentials` provides the
resolver; `layer(deliver?)` provides both services. Credential and code validation
happen during operations. Constructing either implementation issues no token or code.

`LocalHost` and `LocalServer` are composition modules, so they expose layers without
additional `make` wrappers. `LocalHost.layerSqlite` and `layerPostgres` compose the
gateway, directory, database adapter, and cryptography. `LocalServer.layerRoutes`
registers the API and documentation; `LocalServer.layer` adds sign-in, credentials,
and the Bun HTTP server. Database and server resources belong to the layer scope.

The entry point reads Effect `Config`, selects the host layer, and launches the
server through `BunRuntime.runMain`. Keep this execution boundary at the entry
point so importing a constructor or layer module does not launch the application.
Document constructor exports with `@category constructors` and layer exports
with `@category layers`.
