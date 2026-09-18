# Local host

This Bun host runs the application on one machine: the HTTP API from
`@amends/server-http` over SQLite by default, or PostgreSQL when configured,
serving multiple workspaces to the web application. The current milestone provides
sign-in, workspace initialization, invitations with direct initial grants,
authorized membership reads and listing, and removal.

`LocalHost.layerSqlite(filename)` and `LocalHost.layerPostgres(url)` compose
`@amends/gateway` over the selected storage adapter's root `layer`. They provide
`Gateway.Service` and the workspace directory, using Bun cryptography internally.
Every request enters a workspace through the gateway and runs one core application
operation.

## Construction

`LocalSignIn.make(deliver?)` constructs sign-in over `Crypto.Crypto`; its default
delivery logs the code. Each acquisition owns a separate pending-code map.
`LocalSignIn.makeCredentials()` synchronously constructs the development
credential resolver. Both return gateway contract implementations, and neither
needs HTTP services. `LocalSignIn.layerCredentials` provides the resolver through
its constructor; `LocalSignIn.layer(deliver?)` provides both session services.

`LocalServer.layerRoutes` combines the API routes and documentation.
`LocalServer.layer(host, port)` supplies the session services and starts the Bun
HTTP server. These are layer compositions with no separate service constructor.
The entry point selects the storage implementation from Effect configuration
and launches the completed server layer.

## Run

From the repository root:

```bash
bun install --frozen-lockfile
bun run start
```

This listens on `http://127.0.0.1:8787` with the OpenAPI document at
`/openapi.json` and interactive documentation at `/docs`. The web development
server proxies `/api` here. `AMENDS_DATABASE` selects the SQLite file, by
default `./data/amends.sqlite` in the host directory; use an absolute path when
running from elsewhere. `AMENDS_PORT` changes the port, and `0` picks a free one.
`AMENDS_DATABASE_URL` selects PostgreSQL and takes precedence over the SQLite filename.
`bun run dev` restarts the server when its source changes.

## Authentication

Email sign-in is served for the web application: `POST /session/email` logs a
six-digit code where the server runs instead of sending mail, and
`POST /session/code` exchanges it within ten minutes for a session whose token
is the address itself. Development authentication then trusts any bearer token
as the human ID it asserts, so any address can act without going through
sign-in:

```bash
curl -X POST -H 'Authorization: Bearer alice' http://127.0.0.1:8787/workspaces
curl -H 'Authorization: Bearer alice' http://127.0.0.1:8787/workspaces/<workspace-id>/members/<member-id>
```

Nothing verifies that the person controls the address. Replace the development
sign-in and credential implementations in `LocalSignIn` before exposing this
server beyond the local machine. A network host must authenticate the caller and check
workspace-creation entitlement before entering the gateway.

Requests without a token receive 401. Non-members receive 403 with
`Gateway.NotMember`; core outcomes keep their tags, such as
`MemberApplication.NotFound` with 404. `Gateway.asMember` resolves the
identity's active membership in the selected workspace and supplies
`Actor.Service` to the core operation it runs. Core rechecks active membership
and permission within each operation's transaction.

## Workspaces and members

`POST /workspaces` creates a workspace owned by the caller and returns its `id`,
`createdBy`, and `ownerMemberId`. `GET /me/workspaces` lists the caller's
memberships, including ended ones, with each workspace's active member count,
and the caller's pending invitations. It reads the host's projection tables
across every workspace; this is host routing, not a core operation.

`GET /workspaces/:id/members` lists the memberships the caller may read: a
workspace-scoped `member.read` grant sees everyone, active and removed, and an
exact grant sees that member. `GET …/members/:memberId` reads one.

`DELETE …/members/:memberId` removes a member and returns the record with
status `removed`. Core requires `member.remove` on that member; `member.read`
is not required. Both workspace and exact-member grants work. Humans and agents
follow the same rules. An authorized non-owner may remove their own membership.
Ownership alone does not authorize removal, and the current owner cannot be
removed even by an otherwise authorized member. Ownership transfer is a
separate, unimplemented workflow.

Removal also revokes every pending invitation for that human in this workspace,
including expired invitations still recorded as pending. This is part of removal
and requires no additional `invitation.manage` grant. Accepted receipts and
invitations for other people or workspaces are preserved.

Authorization, the ownership check, the removal and invitation revocation facts,
projections, and checkpoints share one transaction. A failure rolls them back
together. Repeating a removal returns `MemberApplication.AlreadyRemoved` without
publishing another fact; the caller must still be active and authorized.
Missing members return `MemberApplication.NotFound` only after authorization.

The membership and its assignments remain historical records. Active-membership
checks deny subsequent operations, including calls with an actor resolved before
removal. Authorized readers can still inspect the removed record. Other workspace
memberships are unaffected. An old accepted invitation cannot restore access;
rejoining creates a fresh member ID with only the new invitation's grants.

## Invitations

`POST /workspaces/:id/invitations` issues an invitation to an address with an
ISO expiry in the future and a list of grants with workspace scope:

```bash
curl -X POST -H 'Authorization: Bearer alice' -H 'content-type: application/json' \
  -d '{"recipientId":"bob","expiresAt":"<expiry-ISO>","grants":[{"permission":"member.read","scope":{"_tag":"Workspace","workspaceId":"<workspace-id>"}}]}' \
  http://127.0.0.1:8787/workspaces/<workspace-id>/invitations
curl -X POST -H 'Authorization: Bearer bob' http://127.0.0.1:8787/workspaces/<workspace-id>/invitations/<invitation-id>/accept
```

The response carries the invitation ID under `details.id`. The core API also
accepts exact-target scopes. Only registered permissions with compatible scopes
in this workspace are accepted; anything else is `Gateway.InvalidInput`. Expiry
is required and must follow issuance; acceptance at the exact deadline fails.
`GET …/invitations` lists every invitation in the workspace for holders of
`invitation.manage`.

The current active owner must hold `invitation.manage` on the workspace to issue
or revoke invitations. Ownership separately authorizes selecting initial grants;
holding `invitation.manage` alone does not let another member grant access. This
first policy lets the owner select valid direct grants independently of which
permissions they personally hold. Role assignments through invitations remain
later work.

Only the named authenticated human can accept. Acceptance rechecks that the
original inviter is still the active owner and still has invitation permission,
then creates the membership and exact stored grants and consumes the invitation
in one commit. The recipient does not need an existing workspace actor.
Invitations use stable human IDs; email delivery and inviting an unregistered
email address are outside this local workflow.

Already-active members cannot be invited or accept a second invitation. Multiple
pending invitations may exist, but only one can establish an active membership.
Repeating acceptance of the same accepted invitation returns its recorded member
without granting again, even after expiry or loss of inviter authority. If that
membership was later removed, the receipt returns the removed record; it never
reactivates it. Rejoining requires a fresh invitation and membership.

`POST …/invitations/:invitationId/revoke` revokes a pending invitation.
Repeating revocation is harmless. Revocation cannot undo an accepted membership;
use member removal for that. Expiry is checked against the clock, so no
background task is required to change expired rows.

Workspaces created before this feature have no invitation permission. Their
active owner can enable it once with `POST …/invitations/enable`. This
publishes an assignment with a stable bootstrap ID. Repeating it preserves
existing assignments, including revoked ones. Startup never grants or restores
invitation access. SQL migration creates the invitation table, and the host
catches up the new projection before application operations run.

## Initialization

The host allocates the workspace ID and binds its storage views. Core initialization
then publishes five facts in one journal commit: workspace initialization, creator
membership, and three direct permission assignments. Projections persist the records
and their checkpoints in that same transaction.

The creator is a human and is recorded as the initial owner. Creation attribution
is retained separately from current ownership. The initial explicit permissions
are `member.read`, `member.remove`, and `invitation.manage` with workspace scope.
Ownership supplies no implicit permission bypass;
adding future permissions requires a deliberate bootstrap-policy update.

Initialization requires an absent workspace record. A repeated call returns
`WorkspaceInitialization.AlreadyInitialized` without replacing ownership or
granting more access. A failed projection or checkpoint rolls back the entire
initialization. Concurrent initializers serialize or receive a storage conflict.

## Workspace and transaction boundaries

`SqliteStorage.make` or `PostgresStorage.make` captures the adapter's database
service. Its `forWorkspace` operation constructs workspace-specific views over
that database; it creates no database or membership.
The host constructs core layers for each operation using those views. No actor
is cached, and no process or database connection is allocated per workspace.

Every table lookup includes `workspace_id`. Member IDs, role IDs, assignment IDs,
log IDs, and checkpoint keys are interpreted within that workspace. The core's
domain journal uses the local log ID `journal`. Another host implementing
core's `layer` must supply equally isolated storage views.

Native transactions reserve the Effect SQLite driver's connection and use
`BEGIN IMMEDIATE`. Journal writes, domain writes, and checkpoints share that
connection. The adapter rejects foreign and expired transaction handles. Nested
core commits join through the existing journal coordinator.

The SQLite busy timeout is zero to avoid blocking Bun's event loop while another
connection holds a transaction. Contention returns `JournalStore.Conflict`; the
host does not automatically retry application operations. SQLite serializes writes
across workspaces, so this host establishes correctness rather than a throughput
claim for large deployments.

Commit errors report an uncertain outcome as `Gateway.Uncertain` with the
workspace and commit IDs, so the caller can reconcile existing state before
trying again. Failed transaction cleanup fences
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

Host tests use temporary SQLite files. The HTTP tests run the real routes, gateway,
sign-in, directory, and storage behind a Bun test server through the generated
client, covering creation, denied reads, invitation, acceptance, removal, listing,
status codes, delivered and rejected codes, reused codes, and the directory
listing. Two tests spawn the real server entry point on an ephemeral port, twice
over one database, to check that a fresh process serves what the previous one
committed. The storage tests cover isolation, concurrent initialization,
rollback, interruption, expired handles, role/assignment persistence, independent
connections, live tails, replay, and uncertain commits. Invitation tests
additionally verify recipient binding, expiry at the deadline, authority changes,
revocation, duplicate acceptance, grant scope, atomic rollback, legacy-workspace
enablement, and replay.
Removal checks cover exact-target authority, owner protection, stale actors,
pending invitation revocation, transaction rollback, concurrent removal, replay,
and access denial after restart.

Constructor tests exercise direct sign-in and credential construction alongside
the combined layer. A test clock verifies the exact ten-minute expiry boundary;
separate acquisitions must keep their pending codes isolated.

The local membership story now covers sign-in, creation, invitation, acceptance,
authorized reads and listing, removal, and subsequent access denial, all over
HTTP. Ownership transfer, real authentication, external invitation delivery,
serving the built web application, and cloud deployment adapters remain
subsequent work.
