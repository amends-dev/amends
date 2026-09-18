# Adapter construction conventions

Read [README.md](./README.md) before changing constructors or service wiring.
Keep initialization in `make` and have `layer` delegate to it. Database constructors
prepare a supplied SQL client; database layers acquire the driver and own its scope.
Workspace bindings and stores share that database and resolve active transactions
per operation. Keep the SQLite and PostgreSQL construction boundaries aligned.
