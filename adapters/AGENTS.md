# Adapter conventions

Read [README.md](./README.md) before changing adapters. Keep one focused module
per store and consistent row, column, domain-record, and transaction names.
A driver is given checked input: core's store contracts decode every input and refuse
foreign records before calling it, so a driver keeps only what storage keeps. Refused
writes are conflicts; malformed stored rows and infrastructure errors are failures.
Preserve transaction guards. Put behavior every adapter must share in
the gateway's conformance suites, which each adapter runs through its fixture.
Keep only what one adapter stores or fails differently in its own tests. Change the memory implementation in core and
the gateway with any contract change: it is the reference implementation.
Applied migrations, serialized fields, and service keys remain stable through
source reorganizations. Keep bindings and raw table schemas internal.

Keep initialization in `make` and have `layer` delegate to it. Database constructors
prepare a supplied SQL client; database layers acquire the driver and own its scope.
Workspace bindings and stores share that database and resolve active transactions
per operation. Keep the PostgreSQL and memory construction boundaries aligned.
