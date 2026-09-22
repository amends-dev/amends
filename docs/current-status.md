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

## Design-system coverage

The new [frontend workshop](../apps/frontend/README.md) contains four surface/text color
roles for Cotton and Soot, scoped theme styles, and specimens for their supported pairings
and nested scopes. Six neutral filled-action color roles add default, hover, pressed,
and disabled specimens on both surfaces; enabled label contrast has automated checks.
Control-border colors and translucent hover/pressed backgrounds have scoped specimens and
contrast checks after compositing. The tinted specimens pair primary text with the strong border.
Semantic status roles now include success, warning, pending, danger, idle, and running, with
separate text and indicator colors; the colored roles also have soft tints. Warning and
pending share amber but remain distinct meanings. Validation colors alias danger values.
All tokens are tested for sRGB gamut, with WCAG 2.2 AA contrast targets for supported text
and indicator pairings, including composited backgrounds. Status specimens include visible
labels and shapes. Decorative `line.seam` dividers are separated from control borders in
Shell, Navigation, and Drawer. These checks do not establish whole-app WCAG conformance.
The focus foundation adds a themed 2px outline with 2px offset, applied through a reusable
`:focus-visible` class. Storybook provides native controls for real keyboard review and
browser checks of ring colors and clearance. The Button primitive provides primary filled,
secondary outlined, and ghost actions in one regular size, native disabled/form behavior, and portable
interaction stories. Controlled pending blocks repeated activation while preserving focus and layout,
with a running stitch and reduced-motion treatment. Danger tone supports all three variants
through a tested `action.danger` palette, with dedicated hover/pressed fills and tinted states.
Disabled appearance and focus remain shared across tones. Additional sizes remain
unimplemented in frontend. IconButton provides named square actions using Button's variants and tones;
Tooltip supplies supplemental hover/focus text as a compact dark monospace label matching
the Primitives v2 reference. Its dedicated surface/foreground pair stays dark/light in both
themes, with top-start placement, viewport wrapping, and forced-colors treatment.
Body, heading, and mono typography styles include their normal-weight
Latin fonts and browser checks for font loading, sizing, and wrapping. The first Text
primitive composes those foundations with semantic element selection and native attributes.
It also supports success, warning, danger, and pending text tones; announcements and visible
status wording remain caller-owned.
Spacing steps 0–6 are available as quarter-rem values, with browser-measured scale, padding,
and gap specimens at normal and enlarged root text sizes.
Square, medium (10px), and pill radius values have browser-verified corner specimens across sizes and themes.
The Input primitive supports native text/email/password/search/tel/URL entry with read-only,
disabled, and caller-controlled invalid states. `line.invalid` supplies the reviewed invalid
border. The Field composition provides a label, required marker, help, and error text with explicit
reactive association props; form state and validation timing stay with the consuming feature.
`text.invalid` adds a verified error-text role. Textarea, grouped controls, and specialized
input types remain future pieces. The visible Radio primitive supports native selection and
form semantics; RadioGroup composes it into controlled plain/card choices with native grouping, required/disabled
behavior, and associated help/errors. Extra layouts, previews, and option metadata remain deferred. Checkbox (including mixed),
binary Switch, and styled single-choice Select primitives are available. Select uses Kobalte
for its listbox behavior with a themed popup and native form-value bridge. Searchable
comboboxes, grouped options, multi-select, and higher-level settings compositions remain future work.
Container, Row, Column, Grid, and GridItem provide token-based spacing, centered width limits,
wrapping groups, and equal-width grids that respond to their own container. Full-row items,
nested layouts, RTL, and enlarged-text specimens are available. Numeric column spans,
asymmetric grids, and responsive prop objects remain outside this initial layout slice.
Declarative Navigation, Drawer, and Shell compositions add native destination links, a
desktop expanded sidebar/icon rail, and mobile modal navigation. The sidebar remains mounted
through viewport changes, preserving drafts and selection. Desktop collapse preference is
independent of mobile open state. Native dialog behavior, modal-aware Select/Tooltip portals,
focus return, reduced motion, and independent sidebar/main scroll regions are available.
Routing, preference persistence, application integration, and Tauri validation remain pending.
Other foundations, additional font weights/subsets, and other production components remain
unimplemented in frontend.
Each needed piece is introduced and verified separately, with Storybook coverage at every
layer. Existing packages stay in place; web and Tauri integration remain pending.

The [Storybook workshop](../apps/design-system/README.md) runs independently of web and the
backend. The invitation form is the first extracted feature; production web imports the same
component used by its state and interaction stories. Representative UI foundations are also
included. Other existing features have not been migrated, and the workshop does not yet cover
every UI component. Portable interaction tests run in the current Bun/Vitest suite; the browser
has an accessibility addon, but automated screenshot-baseline testing is not implemented.

## Notification recipients and generation

The [notification schema](../packages/core/src/notification/notification.ts) supports
Human, Agent, Contact, and workspace-singleton Triage recipients, with `Pending`,
`Discarded { reason: "participation-ended" }`, and `Acknowledged` states. The implemented
acknowledgment outcome is human `Seen`, with an `acknowledgedAt` timestamp.
Both adapters store these variants and enforce source/recipient
uniqueness. The [application](../packages/core/src/notification/application.ts) exposes
only the acting human or agent's inbox, with active membership required. Contact
and Triage reads are available only through internal stores.

`NotificationApplication.resolveSource` resolves an owned notification to its typed thread
timeline item through core and the gateway. It requires current group access and `thread.read`,
even for historical notifications. Unfollowing alone preserves source access; reading discarded
agent input does not revive it. Unsupported or inaccessible sources return `SourceUnavailable`.
Both adapters implement direct journal-entry lookup. Source resolution has no HTTP route or
client integration yet. See [source resolution](thread-workflows.md#resolving-a-notification-source).

The [projection](../packages/core/src/notification/projection.ts) generates notifications from
the shared activity-recorded fact and its historical recipient selection, for every activity kind.
Follow and participation endings currently select no recipients. Ending activity settles pending
agent input before the same handler generates notifications for selected recipients. Participation
domain facts do not directly change notifications. Group and workspace departures record ending
activity for each affected thread through the same internal lifecycle service. Human acknowledgment
is implemented through core and the gateway using notification-owned acknowledgment facts. The shared
internal service records outcomes within the caller's transaction; future turn workflows own turn
creation, input acceptance, and execution. Agent/contact/triage handling, silent completion, and
delivery remain unimplemented. Acknowledgment HTTP/UI actions are also pending; see
[human acknowledgment](thread-workflows.md#acknowledging-a-notification). Existing tests also seed
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
Private group, thread, and notification acknowledgment facts are withheld, including message text, recipients, and provenance;
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
