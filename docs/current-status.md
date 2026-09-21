# Current implementation and known limitations

This page records implementation gaps, not completed fixes. Keep each item aligned
with its owning code and guide when changing the behavior.

Workspace creation, membership, required-role invitations, assignment management,
and ownership transfer are implemented through core, the gateway, HTTP, and the
Solid web app. SQLite and PostgreSQL persist their journal and projections. See
[workspace workflows](workspace-workflows.md) for the available operations.
Core and both adapters implement [private group creation and membership lifecycle](group-workflows.md),
including permission-based addition/removal, self-leave, ordinary group reads, and management
inspection of known groups. DMs, public groups,
and group HTTP/UI workflows remain unimplemented.
[Starting a private-group thread](thread-workflows.md) with a human text message, initial
participation, timeline activity, and notifications is implemented in core and both adapters.
Authorized thread discovery, metadata, sequence-paginated timelines, and current-participant
summaries and human replies are also implemented. Replies admit their author and eligible mentions,
record the next timeline activity, and generate notifications atomically. Explicit self-follow/unfollow
is implemented, including quiet follow/ending activity and pending agent-input cleanup. Managing other
participants, muting, turns, agent execution, triage,
and channel delivery remain future work.
The [group and audience rules](core-model.md#agreed-groups-provide-a-shared-home-for-threads)
include implemented group-inherited read access. Standalone admission and general participation
management remain incomplete. Group departure ends its associated thread participations and
discards their pending agent input; workspace-member removal uses the same cleanup.
Thread starts, reads, replies, and follow/unfollow use the shared group-audience check.
Group and thread discovery and current-participant lists are unpaginated; timelines have
sequence-based pages. Separate reads and pages do not share a snapshot.

## Notification recipients and generation

The [notification schema](../packages/core/src/notification/notification.ts) supports
Human, Agent, Contact, and workspace-singleton Triage recipients, with `Pending` and
`Discarded { reason: "participation-ended" }` states. Both adapters store these variants and enforce source/recipient
uniqueness. The [application](../packages/core/src/notification/application.ts) exposes
only the acting human or agent's inbox, with active membership required. Contact
and Triage reads are available only through internal stores.

The [projection](../packages/core/src/notification/projection.ts) generates notifications from
the shared activity-recorded fact and its historical recipient selection, for every activity kind.
Follow and participation endings currently select no recipients. Ending activity settles pending
agent input before the same handler generates notifications for selected recipients. Participation
domain facts do not directly change notifications. Group and workspace departures record ending
activity for each affected thread through the same internal lifecycle service. General acknowledgment, recipient
processing, silent completion, and delivery remain unimplemented. Existing tests also seed
notifications for storage and inbox contracts. Quiet participation activity creates no notifications.
Turn/task activity kinds remain design intent.

## Live delivery and authorization

[WorkspaceEvents](../packages/gateway/src/workspace-events.ts) and
[CommittedEvents](../packages/core/src/journal/committed-events.ts) provide a
process-local bus. Confirmed commits publish after native COMMIT, with bounded
sliding buffers and lag detection. There is no durable publication outbox,
cross-process fan-out, or replay on the public SSE endpoint. A missed publication
or another process's commit can leave a connected client's view stale.

[ChangeFeedApplication.watch](../packages/core/src/change-feed/application.ts) checks
membership at subscription time and forwards supported workspace-management events.
Private group and thread facts are withheld, including message text, recipients, and provenance;
group-only commits produce no public change until audience-aware group delivery exists.
It does not filter fields or events by permission, or continuously recheck membership.
Removal therefore does not itself close an existing subscription. Reconnecting
checks access again, and Ready refreshes the browser's current view.

The journal's storage-backed `log.tail` can catch up from durable history. It is a
separate internal API and is not the transport used by the
[HTTP change feed](../packages/api-http/README.md#live-changes).

## Commit outcomes and PostgreSQL contention

Both transaction bindings ([SQLite](../adapters/storage-sqlite/src/binding.ts),
[PostgreSQL](../adapters/storage-postgresql/src/binding.ts)) return
`Store.CommitUncertain` for every failed COMMIT effect, even when a particular
database error could establish that nothing committed. This over-reports uncertainty.
The gateway exposes `Gateway.Uncertain` with the commit ID; there is no public
HTTP commit-reconciliation endpoint. Core and adapters do not retry transaction programs.
Keyed journal appends support reuse, but do not make entire HTTP operations idempotent.

PostgreSQL's [error mapping](../adapters/storage-postgresql/src/errors.ts) recognizes
`LockTimeoutError` and `SerializationError` as contention, but omits `DeadlockError`.
The [pinned driver](../repos/effect/packages/sql/pg/src/internal/sqlError.ts) classifies
SQLSTATE `40P01` separately as `DeadlockError`. It therefore follows a failure path
instead of the intended retryable conflict path; during COMMIT it falls under the
broad uncertain-outcome mapping above.

## PostgreSQL isolation

The [binding](../adapters/storage-postgresql/src/binding.ts) uses plain `BEGIN`,
then takes a transaction-scoped advisory lock for the workspace. It does not pin
the isolation level. The lock serializes cooperating writers, but the connection's
isolation default still determines snapshot behavior. The adapter's tests do not
establish correctness for arbitrary session/database isolation settings.
An explicit isolation choice and coverage for changed defaults remain outstanding.

## Fresh-clone SQLite startup

The [configuration](../hosts/local/src/config.ts) defaults to `./data/amends.sqlite`.
Root `bun run start` runs in `hosts/local`, and neither the host nor the SQLite
adapter creates the parent directory. Run `mkdir -p hosts/local/data` first, or
select an absolute `AMENDS_DATABASE` filename whose parent exists. The updated
[setup guide](../hosts/local/README.md#run) includes this workaround; automatic parent
creation is still absent.

## Edge resource controls

The [browser change consumer](../apps/web/src/api/changes.ts) retries transient
failures with jittered exponential delays capped at 30 seconds and stops on
unauthorized/not-member errors. However, [Stream.retry](../repos/effect/packages/effect/src/Stream.ts)
resets its schedule whenever a message arrives. Repeated Ready/disconnect cycles
can keep the delay near its initial 500ms and repeatedly invalidate mounted queries.
A stable-connection threshold, retry budget, and coverage for this repeated-cycle
case remain absent.

The [local server](../hosts/local/src/server.ts) configures the listener without an
application body-size limit or SSE connection/admission policy. Effect's
[MaxBodySize](../repos/effect/packages/effect/src/unstable/http/HttpIncomingMessage.ts)
defaults to undefined. Runtime defaults are not a documented, tested application
limit. Explicit body limits, oversized-request coverage, and server-side controls
for reconnect load remain outstanding.

## Payload-format compatibility

[Codec.makeForSchema](../packages/core/src/journal/codec.ts) persists payloads through
`SchemaBinary.toCodec` and copies output buffers. Existing tests cover round trips,
structured headers, and idempotency. They do not freeze representative payloads as
literal expected bytes and decode those fixtures independently of the current encoder.
There is no golden-bytes test for the persisted SchemaBinary format.

Add fixed fixtures before claiming byte compatibility across Effect or schema
changes. Keep dependency and vendored-source versions aligned, and follow the
[journal compatibility guidance](journal.md#reading-and-replay). Current development
schema changes still use fresh databases rather than upgrade migrations.
