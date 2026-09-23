# Storage conformance

Test suites for the gateway's storage contracts, run by every storage adapter against
itself. Behavior that core relies on is specified once here and checked on each adapter,
so an adapter for another database passes the same tests as the ones in this repository.
The [memory adapter](../../adapters/storage-memory/README.md) runs them as the reference
implementation, with no query language behind it.

The package depends on Effect, `@effect/vitest`, core, and the gateway. It has no runtime of
its own: the adapter's harness supplies cryptography and the storage under test.

## Running the suites

An adapter supplies a `Harness`, conventionally in `test/harness.ts`:

| Member        | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `name`        | Names the adapter in suite titles.                                          |
| `available`   | `false` skips every suite, as PostgreSQL does without a server.             |
| `crypto`      | The hosts' cryptography layer.                                              |
| `withStorage` | Runs one test over fresh, empty storage and releases it when the test ends. |

`withStorage` passes the test a `Storage`:

| Member               | Meaning                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect(options?)`  | Opens another host over the same storage, with its own connection or pool, closed with the test's scope. `failFast` asks for prompt contention where the adapter would otherwise wait. |
| `discardProjections` | Removes every projected record and checkpoint, keeping logs and read state, as rebuilding projections does before replay. No storage contract performs this.                           |
| `footprint`          | Counts every stored record, so a test can show that a rolled-back write left none.                                                                                                     |

Each adapter test file registers one suite, for example
`Suites.transactions(harness)`. Tests of how one adapter stores data, such as SQL columns,
query plans, and driver failure injection, stay in that adapter's own files beside the
registration.

## Suites

| Suite               | Covers                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journal`           | Live appends observed across hosts, workspace isolation of identical log IDs, and replay after discarding projections.                                           |
| `transactions`      | Competing initialization, rollback of a failed checkpoint without leftover records, interruption, foreign and expired handles, and contention from another host. |
| `commitPublication` | Publication to the host's event bus after durable writes, and commit observers.                                                                                  |
| `idempotency`       | Keyed appends across reopening, content validation, rollback of receipts, returned byte ownership, and concurrent attempts from two hosts.                       |
| `factMetadata`      | Fact headers across reopening, filtered and paged fact and subject reads, and retries that compare metadata.                                                     |
| `provenance`        | Attribution of bootstrap, invitations, acceptance, and removal.                                                                                                  |
| `reads`             | Workspace reads and change-feed opening while another host holds the writer.                                                                                     |
| `contracts`         | Direct store calls: validation and rejection without partial writes, one active membership per identity, and IDs never reused.                                   |
| `authorization`     | Stored role edits and assignment revocations as authorization reads them.                                                                                        |
| `assignments`       | Assigning, changing, and revoking access, delegation limits, competing changes, and rollback.                                                                    |
| `ownership`         | Transfer authority and recipients, competing transfers, rollback, and replay.                                                                                    |
| `invitations`       | Acceptance, repeat and competing acceptance, revocation, and stored settlement.                                                                                  |
| `invitationPolicy`  | Recipient and workspace binding, expiry, delegated roles, and rechecks at acceptance.                                                                            |
| `invitationReplay`  | Rollback of acceptance and removal, and replay of invitation records.                                                                                            |
| `gateway`           | Workspace creation and isolation, the membership workflow, cold boot, and the directory.                                                                         |

Group, thread, notification, and read-state tests still live in each SQL adapter and move here
in later changes.

`Support` holds the fixtures the suites share: identities, bound stores by name, a fixed
clock, and cores, hosts, and gateways over a harness's storage. `Operations` runs single application operations through a
gateway, the way a protocol handler does.
