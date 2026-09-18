# Core construction conventions

Read [README.md](./README.md) before changing core constructors or service wiring.
Its constructor and layer conventions apply to this package. Keep `make` as the
public construction path and have the corresponding `layer` delegate to it.
Preserve the distinction between stable construction dependencies and actor,
transaction, and scope requirements supplied during operations.
