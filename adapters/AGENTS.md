# Adapter conventions

Read [README.md](./README.md) before changing adapters. Keep one focused module
per store and consistent row, column, domain-record, and transaction names.
Validate decoded records and edited fields against core schemas before storage
conversion. Rejected writes are conflicts; malformed stored rows and infrastructure
errors are failures. Preserve transaction guards and validate before any SQL write
or conversion that drops domain information. Put behavior every adapter must share in
the `@amends/storage-conformance` suites, which each adapter runs through its harness.
Keep only what one adapter stores or fails differently in its own tests, beside the suite
registrations. Change the memory adapter with
any contract change: it is the reference implementation.
Applied migrations, serialized fields, and service keys remain stable through
source reorganizations. Keep bindings and raw table schemas internal.

Keep initialization in `make` and have `layer` delegate to it. Database constructors
prepare a supplied SQL client; database layers acquire the driver and own its scope.
Workspace bindings and stores share that database and resolve active transactions
per operation. Keep the PostgreSQL and memory construction boundaries aligned.
