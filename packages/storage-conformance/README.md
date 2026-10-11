# @amends-dev/storage-conformance

Test suites for the gateway's storage and signal hub contracts, which every storage adapter runs
against itself. Behavior core relies on is specified once here and checked on each adapter, so an
adapter for another database passes the same tests as those in this repository. Among the rules: a
store keeps its workspace's data its own, refusing any record that names another workspace, and core
relies on that rather than checking each record again.

The [memory adapter](../../adapters/storage-memory/README.md) runs the suites as the reference
implementation, and the [PostgreSQL adapter](../../adapters/storage-postgresql/README.md) runs them
over a real database. The package depends on Effect, `@effect/vitest`, core, the gateway, and the
harness, connection, and channel contracts. It has no runtime of its own: the adapter's harness
supplies cryptography and the storage under test. It is internal to this repository and not
published to npm.

## Running the suites

An adapter supplies a `Harness`, by convention in its `test/harness.ts`:

- `name` names the adapter in suite titles.
- `available` set to `false` skips every suite, as the PostgreSQL adapter does without a server.
- `crypto` is the hosts' cryptography layer.
- `withStorage` runs one test over fresh, empty storage and releases it when the test ends.

`withStorage` gives the test a `Storage`:

- `connect(options?)` opens another host over the same storage, with its own connection or pool,
  closed with the test's scope: its storage, directory, accounts, and signal hub. `failFast` asks
  for prompt contention where the adapter would otherwise wait.
- `discardProjections` removes every projected record, live projection version, and checkpoint,
  keeping logs and read state, as rebuilding projections does before replay. No storage contract
  performs this.
- `footprint` counts every stored record, so a test can show that a rolled-back write left none.

Each adapter test file registers one suite, such as `Suites.transactions(harness)`. Tests of how one
adapter stores data, such as SQL columns, query plans, and driver failure injection, stay in that
adapter's own files beside the registration. The package also exports `Operations`, a driver that
enters a workspace through the gateway and runs one core operation as a protocol handler does, and
`Support`, the identities and fixtures the suites share.

## Suites

| Suite                 | Covers                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `journal`             | Appends seen across hosts, log heads, isolation of identical log IDs, projections going live and rebuilding, and commits refused meanwhile. |
| `transactions`        | Competing initialization, rollback without leftovers, interruption, foreign and expired handles, and contention from another host.          |
| `changeFeed`          | Commits from another host, resuming from a cursor on another host, and thread activity reaching only the group's readers.                   |
| `signals`             | Delivery between hosts in order, only to subscribers present and in their workspace, and the audiences of typing and read state.            |
| `sessionLogs`         | Appends only after the latest position, one of two concurrent writers winning, entries read back, appends kept through rollback, wakeups.   |
| `standaloneAppends`   | Appends outside a transaction while another host holds the workspace, positions from several hosts, and keys across both kinds of append.   |
| `idempotency`         | Keyed appends across reopening, content validation, rollback, byte ownership, concurrent attempts, and more keys than one statement binds.  |
| `factMetadata`        | Fact headers across reopening, filtered and paged fact and subject reads, and retries that compare metadata.                                |
| `provenance`          | Attribution of bootstrap, invitations, acceptance, and removal.                                                                             |
| `reads`               | Workspace reads and change-feed opening while another host holds the writer.                                                                |
| `contracts`           | Direct store calls: validation without partial writes, one active membership per identity, IDs never reused, and the live projections.      |
| `authorization`       | Stored role edits and assignment revocations as authorization reads them.                                                                   |
| `builtinRoles`        | Bundles recorded at creation and upgraded once, never reverted, upgraded by competing hosts and in the background, and replayed.            |
| `assignments`         | Assigning, changing, and revoking access, delegation limits, competing changes, and rollback.                                               |
| `ownership`           | Transfer authority and recipients, competing transfers, rollback, and replay.                                                               |
| `invitations`         | Acceptance, repeated and competing acceptance, revocation, and stored settlement.                                                           |
| `invitationPolicy`    | Recipient and workspace binding, expiry, delegated roles, and rechecks at acceptance.                                                       |
| `invitationReplay`    | Rollback of acceptance and removal, and replay of invitation records.                                                                       |
| `workspaceSettings`   | Renaming once against stale values and through replay, member actions under the delegation policy, and bounded member reads.                |
| `gateway`             | Workspace creation and isolation, membership, cold boot, the directory, background runs, and recovery after another host's rebuild.         |
| `requests`            | Request keys: a retried creation returns what its first attempt created, after a rollback, concurrently, and from another host.             |
| `groups`              | Team and direct group creation, permissions, storage constraints, replay, and latest activity that only moves forward.                      |
| `groupMemberships`    | Admission, public listing and joining, departure authority, workspace removal, concurrent changes, rollback, and replay.                    |
| `groupReads`          | Audience and permission separation, no grant reaching a private or direct group from outside, rosters, and paging.                          |
| `groupFollows`        | Following for oneself and for agents, joining later threads, ending with the admission, and storage constraints.                            |
| `threads`             | Starts and renames: records, participation, activity, rollback, replay, and the direct store's rules.                                       |
| `threadStarts`        | Starts, replies, and timeline pages making the same store reads at any group size.                                                          |
| `threadParticipation` | Following and unfollowing, quiet activity, stale and group departures, fixed direct threads, settlement, and replay.                        |
| `threadReads`         | Discovery, metadata, timeline and participant pages under current access, and an activity kind defined outside core.                        |
| `threadReplies`       | Replies: admission, recipients, concurrent sequencing, rollback, and replay.                                                                |
| `tasks`               | Creating a task with its thread or in one, its changes and whom they reach, and the task store.                                             |
| `notifications`       | Recipient isolation, paging, a thread's notifications by position, settlement, inboxes by membership, and batches past statement limits.    |
| `notificationSources` | The source each inbox item shows, under current access, without writing.                                                                    |
| `notificationSeen`    | Private `Seen`: ownership, no journal writes, repeats, concurrency, lost access, departures racing it, and rebuilds.                        |
| `readState`           | Thread and group lists with unread state, read state that only moves forward, and settling the inbox on reading.                            |
| `connections`         | Integrations listed, connections created with keys and refused, checks, renames, removal with the key, request keys, readiness, replay.     |
| `agents`              | Creating, reading, and refusing agents, configuring and renaming, request keys, readiness as connections change, and `Auto` agents.         |
| `turns`               | Accepting work into turns, prompts, runs cut short, closing with the answer and session, logs, stopping, failing, retrying, and leaving.    |
| `channels`            | Conversations received into bound threads, echoes and rejected requests, replies delivered and their edits, and managing channels.          |
| `workspaceIsolation`  | Every store refusing a record that names another workspace, and keeping none of it.                                                         |
| `accounts`            | One account per address, however typed and from any host, concurrent first requests sharing one, and accounts read back by ID.              |

## Development

The suites run where adapters register them, so run them through an adapter:

```sh
bun run test adapters/storage-memory
bun run test --project postgresql adapters/storage-postgresql
```

Behavior core relies on belongs in a suite here, not in one adapter's tests. A new store or rule
adds its suite to `src/suites.ts` and a registration file to each adapter. See
[testing](../../docs/testing.md).
