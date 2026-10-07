# Application hosts

Each `hosts/<name>/` directory is a Bun workspace that runs the application in a
particular environment. Hosts compose shared packages and provide runtime layers,
storage, transports, and other platform adapters. They may use dependencies needed
by their runtime.

`local/` is the Bun host. Run it from the repository root with `bun run start`
or `bun run dev`. It implements no storage itself: it composes the PostgreSQL
adapter over the database at `AMENDS_DATABASE_URL` and provides development sign-in
and credentials. A future Cloudflare host belongs in `hosts/cloudflare/`.

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
existing layers. Named layer exports start with `layer`, such as `layerRoutes`.
Each implementation owns its `make` constructor and returns the gateway contract's
`Service.of(...)`.
Use `Layer.sync` for lazy synchronous construction and `Layer.effect` for effectful
construction. Constructors own defaults, state allocation, and initialization.

Group related implementations in a capability directory when they need several
modules. The local host's `authentication/` contains `DevelopmentSignIn`,
`DevelopmentSessionTokens`, and their composition, `DevelopmentAuthentication`.
The names describe the development trust model; another host can supply different
implementations of the same gateway contracts.

`DevelopmentSignIn.make(deliver?)` constructs sign-in with fresh pending-code
state; `DevelopmentSessionTokens.make()` constructs the token resolver.
Their respective `layer` exports delegate to those constructors.
`DevelopmentAuthentication.layer(deliver?)` composes both services. Token
and code validation happen during operations. Construction issues no token or code.

`LocalHost` and `LocalServer` are composition modules, so they expose layers without
additional `make` wrappers. `LocalHost.layer` composes the gateway, directory,
PostgreSQL adapter, cryptography, and jobs on an Effect Cluster runner over the
adapter's pool. The gateway owns prepared workspace runtimes in its host
scope. Each runtime boots lazily, replays, and stays prepared while in use and for an idle
period afterwards; requests resolve identity and open operation scopes over the prepared
services.
`LocalServer.layerRoutes`
registers the API and documentation; `LocalServer.layer` adds sign-in, credentials,
and the Bun HTTP server. `LocalHost.HostLayer` names the layer supplied to the
server. Database and server resources belong to the layer scope.

`LocalConfig.load()` reads and validates Effect configuration before resource
acquisition. `src/index.ts` selects the host layer and launches the server through
`BunRuntime.runMain`. Keep execution at that entry point so importing configuration,
constructor, or layer modules does not read settings or launch the application.
Document constructor exports with `@category constructors` and layer exports
with `@category layers`.

## Tests and configuration

Test configuration defaults, invalid values, and backend selection without opening
resources. The local host accepts port `0` for an ephemeral listener. Missing
settings may use defaults; explicitly empty settings must not silently select a
different database. Keep credentials redacted in configuration errors.

Mutable delivery state belongs to each HTTP fixture. Subprocess fixtures own
temporary storage and an ephemeral port, remove inherited database selection,
and disable environment-file loading. Drain stdout and stderr concurrently, bound
startup, and terminate the child even when startup or the test callback fails.
The [local host guide](./local/README.md) describes its configuration and verification.
