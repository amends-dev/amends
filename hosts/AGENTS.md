# Host construction conventions

Read [README.md](./README.md) before changing host constructors or runtime wiring.
Keep host-owned implementations behind `make` constructors and have layers delegate
to them. Group related implementations by capability, and name development-only
implementations explicitly. Use `layer` and `layer...` names for exported runtime compositions. Hosts
compose storage adapters and protocol handlers; they do not implement storage or
import protocol contracts in production code. Keep configuration validation
separate from resource acquisition, and application execution in `src/index.ts`.
Importing other host modules must not launch the application. Each test fixture
owns its mutable state; subprocess fixtures must select temporary storage without
inheriting database settings or loading environment files, drain both output
streams, and bound startup and termination. Verify changed wiring with the
repository checks, tests, and the temporary-port startup procedure in the root guidance.
