# Local host

This Bun host serves multiple workspace contexts using one SQLite database. The
current milestone provides workspace initialization and authorized membership
reads. It includes a local CLI and an executable demonstration.

## Run

From the repository root:

```bash
bun install --frozen-lockfile
bun run start
```

The default demonstration creates two new workspaces, performs concurrent member
reads, checks that one workspace's owner cannot access the other, closes the
database, and opens it again to verify persisted access. Each run creates another
pair; it does not reset existing data. With this command the default database is
`hosts/local/amends.sqlite`.

For individual operations, use an absolute database path so commands from
different directories address the same file:

```bash
AMENDS_DATABASE=/tmp/amends.sqlite bun run hosts/local/src/index.ts create alice
AMENDS_DATABASE=/tmp/amends.sqlite bun run hosts/local/src/index.ts get <workspace-id> alice <member-id>
```

`create` prints the workspace's `id`, `createdBy`, and `ownerMemberId`. Use that
owner member ID for the first read. `get` prints the membership record. A read
using a human identity without membership in that workspace fails.

The CLI treats the supplied human identity as a trusted local operator assertion.
It is not a public authentication endpoint. A network host must authenticate the
caller and check workspace-creation entitlement before invoking these methods.
`LocalHost.getMember` accepts a trusted human or agent identity, resolves its
membership in the selected workspace, and supplies `Actor.Service` for that call.
Core rechecks active membership and permission within the read transaction.

## Initialization

The host allocates the workspace ID and binds its storage views. Core initialization
then publishes four facts in one journal commit: workspace initialization, creator
membership, and two direct permission assignments. Projections persist the records
and their checkpoints in that same transaction.

The creator is a human and is recorded as the initial owner. Creation attribution
is retained separately from current ownership. The initial explicit permissions
are `member.read` and `member.remove` with workspace scope, covering the membership
permissions currently defined. Ownership supplies no implicit permission bypass;
adding future permissions requires a deliberate bootstrap-policy update. The
`member.remove` application operation is not implemented in this milestone.

Initialization requires an absent workspace record. A repeated call returns
`WorkspaceInitialization.AlreadyInitialized` without replacing ownership or
granting more access. A failed projection or checkpoint rolls back the entire
initialization. Concurrent initializers serialize or receive a storage conflict.

## Workspace and transaction boundaries

`Storage.make` binds one SQL client. Its `forWorkspace` operation constructs
workspace-specific views over that client; it creates no database or membership.
The host constructs core layers for each operation using those views. No actor
is cached, and no process or database connection is allocated per workspace.

Every table lookup includes `workspace_id`. Member IDs, role IDs, assignment IDs,
log IDs, and checkpoint keys are interpreted within that workspace. The core's
domain journal uses the local log ID `journal`. Another host implementing
`WorkspaceCore.layer` must supply equally isolated storage views.

Native transactions reserve the Effect SQLite driver's connection and use
`BEGIN IMMEDIATE`. Journal writes, domain writes, and checkpoints share that
connection. The adapter rejects foreign and expired transaction handles. Nested
core commits join through the existing journal coordinator.

The SQLite busy timeout is zero to avoid blocking Bun's event loop while another
connection holds a transaction. Contention returns `JournalStore.Conflict`; the
host does not automatically retry application operations. SQLite serializes writes
across workspaces, so this host establishes correctness rather than a throughput
claim for large deployments.

Commit errors report an uncertain outcome. Workspace creation adds the allocated
workspace ID to the commit ID in `LocalHost.CreationUncertain`, so the caller can
reconcile existing state before trying again. Failed transaction cleanup fences
the affected host storage instance until it is reopened.

Live tails poll committed database state every 50 ms while waiting. This observes
independent connections and processes; interruption cancels the wait. The same
storage supports core projection replay. Replay rebuilds read models from facts;
resetting read models is an explicit maintenance operation, not host startup behavior.

## Verify

```bash
bun run check
bun test packages/core/test hosts/local/test
```

Host tests use temporary SQLite files and cover isolation, concurrent initialization,
rollback, interruption, expired handles, role/assignment persistence, independent
connections, live tails, replay, uncertain commits, and reads from a fresh process.

Invitations, acceptance, membership removal, ownership transfer, network login,
and cloud deployment adapters remain subsequent work. The complete membership
workflow remains the feature goal; this milestone establishes its host and
initialization path.
