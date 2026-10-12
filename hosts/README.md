# Hosts

A host runs amends in one environment. It composes the shared packages with the adapters it
chooses, implements the gateway's contracts that belong to its environment, such as sign-in, and
serves the protocols clients speak. It may install whatever its runtime needs; shared packages
never depend on a host.

[`local`](local/README.md) is the only host so far: it serves the HTTP API on Bun over the
PostgreSQL adapter, with email sign-in, development sign-in for tests, and credentials. Run it from
the repository root with
`bun run start`, or `bun run dev` to restart it as its source changes.

## What a host depends on

A host depends on the [gateway](../packages/gateway/README.md), whose contracts it implements, and
on the protocol packages it serves, such as `@amends-dev/http`, whose handlers own the protocol's
server side, authentication included. A host's tests act as a client through the same package's
contract.

Each host extends `../../tsconfig.base.json`, enables its own runtime's types, and has a
`typecheck` script.

## Construction

Hosts follow the [shared construction conventions](../packages/README.md#constructors-and-layers):
`make` constructs an implementation and returns the gateway contract's `Service.of(...)`, and
`layer` provides it. Related implementations share a directory: the local host's `authentication/`
holds `DevelopmentSignIn`, `DevelopmentSessionTokens`, and `DevelopmentAuthentication`, which
composes them, beside `EmailAuthentication`, which composes the gateway's email sign-in with the
host's email sender and code key. Their names say whom they trust, so another host supplies its own
implementations of the same contracts.

Modules that only compose expose layers alone. The local host's `LocalHost.layer` composes the
gateway, the storage adapter, the integrations, and the jobs, and `LocalServer.layer` adds the
authentication the configuration chooses and the HTTP server. `LocalConfig.load()` reads and validates the configuration
before anything is acquired, and `src/index.ts` alone launches the server, so importing any other
module reads no setting and starts nothing.

## Testing

Test a host's configuration, its defaults, invalid values, and what it selects, without opening
resources. A setting left out may take a default, but one set empty must not silently select
another database, and configuration errors keep credentials redacted.

A test that starts the host as a subprocess owns its temporary storage and a free port, clears any
inherited database setting, and turns off environment-file loading. It drains standard output and
error together, bounds startup, and stops the process even when startup or the test fails. The
[local host guide](local/README.md) describes verifying a running host.
