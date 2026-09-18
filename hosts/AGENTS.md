# Host construction conventions

Read [README.md](./README.md) before changing host constructors or runtime wiring.
Keep host-owned implementations behind `make` constructors and have layers delegate
to them. Use `layer` and `layer...` names for exported runtime compositions. Hosts
compose storage adapters and protocol handlers; they do not implement storage or
import protocol contracts in production code. Verify changed wiring with the
repository checks, tests, and the temporary-port startup procedure in the root guidance.
