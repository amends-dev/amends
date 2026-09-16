# User-facing applications

Create user-facing workspace packages here, such as `apps/web/` or
`apps/desktop/`, when their frameworks and implementation are selected.

Apps may depend on shared packages via `workspace:*` and use UI or platform
dependencies appropriate to their target. Shared packages cannot import apps.

Each app needs its own `package.json`, a `typecheck` script, and a `tsconfig.json`
extending `../../tsconfig.base.json`. Enable browser, desktop, or framework types
in that app's configuration. Install dependencies from the repository root to
keep one lockfile.
