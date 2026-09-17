# Local host

This Bun host serves multiple workspace contexts using one SQLite database. The
current milestone provides workspace initialization, authorized membership reads,
and invitations with direct initial grants. It includes a local CLI and an
executable demonstration.

## Run

From the repository root:

```bash
bun install --frozen-lockfile
bun run start
```

The default demonstration creates two new workspaces, performs concurrent member
reads, checks workspace isolation, and lets Alice invite Bob with read access.
It checks recipient identity, limited access, and revocation, closes the database,
and opens it again to verify persisted membership and repeat acceptance. Each run creates another
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

## Invite and accept

Use the workspace ID returned by `create`. Supply an ISO timestamp in the future:

```bash
AMENDS_DATABASE=/tmp/amends.sqlite bun run hosts/local/src/index.ts invite <workspace-id> alice bob <expiry-ISO> member.read
AMENDS_DATABASE=/tmp/amends.sqlite bun run hosts/local/src/index.ts accept <workspace-id> bob <invitation-id>
AMENDS_DATABASE=/tmp/amends.sqlite bun run hosts/local/src/index.ts get <workspace-id> bob <owner-member-id>
```

`invite` returns the invitation ID under `details.id`. Its final argument is a
comma-separated permission list with workspace scope; it defaults to `member.read`.
Use `-` for no initial grants. The core API also accepts exact-target scopes.
Only registered permissions with compatible scopes in this workspace are accepted.
Expiry is required and must follow issuance; acceptance at the exact deadline fails.

The current active owner must hold `invitation.manage` on the workspace to issue
or revoke invitations. Ownership separately authorizes selecting initial grants;
holding `invitation.manage` alone does not let another member grant access. This
first policy lets the owner select valid direct grants independently of which
permissions they personally hold. Role assignments through invitations remain later work.

Only the named authenticated human can accept. Acceptance rechecks that the
original inviter is still the active owner and still has invitation permission,
then creates the membership and exact stored grants and consumes the invitation
in one commit. The recipient does not need an existing workspace actor. Invitations
use stable human IDs; email delivery and inviting an unregistered email address
are outside this local workflow.

Already-active members cannot be invited or accept a second invitation. Multiple
pending invitations may exist, but only one can establish an active membership.
Repeating acceptance of the same accepted invitation returns its recorded member
without granting again, even after expiry or loss of inviter authority. If that
membership was later removed, the receipt returns the removed record; it never
reactivates it. Rejoining requires a fresh invitation and membership.

Revoke a pending invitation with:

```bash
AMENDS_DATABASE=/tmp/amends.sqlite bun run hosts/local/src/index.ts revoke <workspace-id> alice <invitation-id>
```

Repeating revocation is harmless. Revocation cannot undo an accepted membership;
membership removal is the next application workflow. Expiry is checked against
the clock, so no background task is required to change expired rows.

Workspaces created before this feature have no invitation permission. Their active
owner can explicitly enable it once:

```bash
AMENDS_DATABASE=/tmp/amends.sqlite bun run hosts/local/src/index.ts enable-invites <workspace-id> alice
```

This publishes an assignment with a stable bootstrap ID. Repeating it preserves
existing assignments, including revoked ones. Startup never grants or restores
invitation access. SQL migration creates the invitation table, and the host catches
up the new projection before application operations run.

## Initialization

The host allocates the workspace ID and binds its storage views. Core initialization
then publishes five facts in one journal commit: workspace initialization, creator
membership, and three direct permission assignments. Projections persist the records
and their checkpoints in that same transaction.

The creator is a human and is recorded as the initial owner. Creation attribution
is retained separately from current ownership. The initial explicit permissions
are `member.read`, `member.remove`, and `invitation.manage` with workspace scope.
Ownership supplies no implicit permission bypass;
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
storage supports core projection replay. Before application operations run, the
host catches up registered projections. Replay uses recorded invitation outcomes
without rechecking current authority or expiry. Resetting read models remains an
explicit maintenance operation.

## Verify

```bash
bun run check
bun test packages/core/test hosts/local/test
```

Host tests use temporary SQLite files and cover isolation, concurrent initialization,
rollback, interruption, expired handles, role/assignment persistence, independent
connections, live tails, replay, uncertain commits, and reads from a fresh process.
Invitation tests additionally verify recipient binding, expiry at the deadline,
authority changes, revocation, duplicate acceptance, grant scope, atomic rollback,
legacy-workspace enablement, replay, and commands across separate processes.

Membership removal, ownership transfer, network login, external invitation delivery,
and cloud deployment adapters remain subsequent work. The membership workflow now
covers initialization, invitation, acceptance, and authorized reads.
