# Application hosts

Each `hosts/<name>/` directory is a Bun workspace that runs the application in a
particular environment. Hosts compose shared packages and provide runtime layers,
storage, transports, and other platform adapters. They may use dependencies needed
by their runtime.

`local/` is the Bun host. Run it from the repository root with `bun run start`
or `bun run dev`. A future Cloudflare host belongs in `hosts/cloudflare/`.

Each host extends `../../tsconfig.base.json`, enables its own runtime types, and
provides a `typecheck` script. Shared packages cannot import hosts.
