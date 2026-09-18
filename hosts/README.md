# Application hosts

Each `hosts/<name>/` directory is a Bun workspace that runs the application in a
particular environment. Hosts compose shared packages and provide runtime layers,
storage, transports, and other platform adapters. They may use dependencies needed
by their runtime.

`local/` is the Bun host. Run it from the repository root with `bun run start`
or `bun run dev`. A future Cloudflare host belongs in `hosts/cloudflare/`.

Each host extends `../../tsconfig.base.json`, enables its own runtime types, and
provides a `typecheck` script. Shared packages cannot import hosts.

A host depends on the gateway, whose contracts it implements, and on the handler
packages it serves, such as `@amends/server-http`. It does not depend on protocol
contract packages such as `@amends/api-http`: those are for clients, and the
handler package owns their server-side pieces, including authentication. A host's
tests may take a contract package as a development dependency to act as a client.
