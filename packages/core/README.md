# Core

`@amends/core` implements one workspace's journal, authorization, and application
operations. Hosts supply storage and cryptography; the gateway supplies the actor
for each protected operation. The root `layer`
composes the workspace services.

## Features and ownership

A feature owns a coherent domain concept, its rules, and its lifecycle. Keep the
models, operations, facts, projection, permissions, and storage contract that
evolve together in one feature directory. Add files when those responsibilities
exist; a small feature does not need an empty version of every module.

The current domains contain these features:

| Domain          | Ownership                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `workspace`     | Workspace metadata and initialization, with `member/`, `invitation/`, `ownership/`, and `settings/` features.           |
| `authorization` | Access evaluation and permission concepts, with `role/` and `assignment/` features.                                     |
| `identity`      | Human, agent, and contact references, with human/agent actors and membership.                                           |
| `journal`       | Shared log, transaction, fact, codec, and projection machinery.                                                         |
| `notification`  | Notification records, the inbox, marking them seen, activity-driven generation, and departure settlement.               |
| `thread`        | Private-group starts, human replies, authorized reads, participation, timeline activity, and projection storage.        |
| `agent`         | Agents: instructions, harness, model, and sandbox over connections, as a workspace membership, and what a turn runs on. |
| `connection`    | Workspaces' connections to the integrations a host installs, with their settings and keys.                              |
| `turn`          | Agents' turns in threads: accepting work, each participation's session and session log, execution steps, and stopping.  |
| `group`         | Team creation, public discovery and joining, authorized reads, audience policy, membership, and storage.                |
| `change-feed`   | Live workspace changes for consumers that refresh their current view.                                                   |
| `signal`        | Ephemeral signals, such as typing and read-state changes, for connected readers; never stored.                          |
| `request`       | Request keys, so a creating operation's retry returns what its first attempt created.                                   |
| `text`          | Rules for text people enter: what storage keeps as given, and what a name may hold. Internal to core.                   |

Permission, grant, requirement, scope, and target remain focused modules within
authorization. Future features such as thread and task belong beside these
domains; workspace scoping alone does not make a feature part of workspace
management.

`@amends/core/notification` holds the `Notification.Record` model, the `NotificationStore`
contract, `NotificationService`, and the projection that generates notifications. A record
references a source log entry and a Human, Agent, Contact, or Triage recipient (one Triage
recipient per workspace, `{ _tag: "Triage" }`), and is `Pending`, `Discarded` when its agent
participation ends or its person leaves the source's group, `Seen` once a human saw it, `Accepted` once an agent took it into a turn, or `Informational` from the start when
its activity asks an agent for no work, as another agent's message does. Each activity recipient
records `requestsWork`. A human or agent recipient names the
membership notified as well as the identity (`Notification.ofMember`), so an inbox belongs to one
membership: someone who rejoins under a new member ID starts with an empty one.
`NotificationService` serves the acting member's own `inbox`, newest first with each source they
can still read, its `countPending`, and a person's `markSeen` and `markSeenThrough`; contact and
triage inboxes are read only through the store. `NotificationProjection`
generates notifications from each recorded thread activity's recipients, and settles pending agent
input when a participation ends, from the activity and its own notifications alone. A human's `Seen` is private state the store keeps outside the
journal, and its stored state says `Seen`. `inbox` reads a notification's recorded activity as its
timeline shows it, under the recipient's current access. Notifications never create turns, accept their input, or execute work. See
[reading the inbox](../../docs/thread-workflows.md#reading-the-inbox),
and [marking a notification seen](../../docs/thread-workflows.md#marking-a-notification-seen).

Membership demonstrates the feature layout:

```text
src/workspace/member/
  id.ts
  member.ts
  application.ts
  store.ts
  facts.ts
  projection.ts
  permissions.ts
```

| Module           | Responsibility                                                                       |
| ---------------- | ------------------------------------------------------------------------------------ |
| `<feature>.ts`   | Domain schemas, value types, and pure domain functions.                              |
| `id.ts`          | An ID-only dependency when references between models would otherwise create a cycle. |
| `application.ts` | Authorized operations and transactional workflow coordination.                       |
| `errors.ts`      | Outcomes a caller can act on, as schemas only; the application re-exports them.      |
| `store.ts`       | The persistence contract implemented by adapters.                                    |
| `facts.ts`       | Versioned declarations of recorded domain changes.                                   |
| `projection.ts`  | Replay those facts into the store; export the projection as `definition`.            |
| `permissions.ts` | Permissions owned by this feature.                                                   |

Workspace initialization lives in `workspace/initialization.ts`. Its facts and
projection have the same separate modules as other features. Invitation facts
are `InvitationFacts`; their projection is `InvitationProjection.definition`.

Use short filenames within feature directories and descriptive module namespaces:
`member/store.ts` exports `MemberStore`, and `member/application.ts` exports
`MemberService`. Keep the named domain model file instead of collecting
unrelated types in a general `schema.ts` or `types.ts` file.

Core tests follow the domain and feature directories under `test/`. Tests that
cover several authorization features live at `test/authorization/`; shared
in-memory storage support remains in `test/memory-store.ts`.

## Read and write boundaries

Read operations check the current actor's membership and permissions, then query
the stores without opening a journal commit or acquiring the workspace writer
lock. This includes membership, invitation, role, assignment, ownership, and
notification reads, and opening the change feed. Authorization, grant resolution,
and delegation helpers can all run without `Store.Transaction`.

Reads intentionally allow concurrent changes between permission checks and data
queries. Multiple queries do not promise one shared snapshot, and a revocation
does not cancel an already-authorized read. A read that needs a consistent snapshot
must request that guarantee explicitly rather than changing the default for all reads.

Write operations run their authorization checks, validation, journal publications,
and projections inside one `journal.commit`. Policy checks performed earlier to
build a read screen do not authorize a later write. Stores still require a valid
workspace transaction for every mutation. A read invoked inside an existing commit
uses that transaction and sees its staged changes without opening another one.

Core trusts what storage returns: the adapters decode each record and scope it to its workspace,
and the storage conformance suites check that. Operations use stored records as they come, without
decoding or cross-checking them again, and a record core itself wrote that is missing is a defect
rather than a typed error. Storage failures still reach callers as they are. Core validates what
crosses into it instead: callers' input, an actor or target from another workspace, and what a
turn's runner or harness reports.

A host binds the journal store to one workspace, and that binding is the only place a service
learns which workspace it serves: services that need the workspace ID read it from `Store.Service`.
Projection stores and signals are bound the same way and carry no ID of their own. Agent and turn
job requests name their workspace, taken from the fact that asks for them, since the host runs
every workspace's jobs.

## Groups

`@amends/core/group` holds team and direct groups, their admissions, and follows.
`GroupService` creates teams, private or public, and reads groups (`listMine`, `listPublic`,
`get`);
`GroupMembershipService` adds, removes, and lets members join public groups and leave team
groups, and reads rosters;
`GroupFollowService` follows and unfollows. `GroupStore`, `GroupMembershipStore`, and
`GroupFollowStore` are required host bindings. A direct group has a fixed set of two or more
members in `Group.directMembers` order, identified by `Group.directKey` and found in any order
through `GroupStore.findDirect`; `GroupCommand.establishDirect` finds or creates one for
`ThreadService.startDirect`.

Groups share their internal reads and writes as one `GroupQuery` and one `GroupCommand`, excluded
from `Core.Operations` like thread's. `GroupQuery.requireAudience` checks current workspace and
group membership, with no action permission and no management bypass; each service checks its
own action grant alongside it, inside its commit for writes. `GroupCommand.admitMember` publishes an
admission, for team creation, direct groups, adding, and joining alike.
`GroupCommand.removeMembership` records a group departure as one fact; projections end the
member's follow of the group and every thread participation held through the admission together,
without thread activity. Workspace-member removal uses it for every admission. See
[group workflows](../../docs/group-workflows.md).

## Connections

`@amends/core/connection` holds a workspace's connections, each its link to one integration its
host installs, as [connection](../connection/README.md) declares integrations. `ConnectionService` lists the
host's `integrations`, each as `Connection.IntegrationView` (its auth methods, what it gives,
whether the agent of its harnesses `requiresSandbox`, and the form of its settings), which every
member may see; lists and reads the connections the actor may read, as `Connection.View`, and the
`models` each offers an agent, as `Connection.Models` (the catalog's models its integration
lists, and whether it offers others by any id); and creates, renames, configures, replaces the key
of, checks, and removes them. A view is the record without its key, `manageable`, and its readiness: `Ready`,
`Invalid` with the integration's description when it no longer takes the connection's settings or
auth method, or `Uninstalled` when the host no longer installs it.

Creating takes the key with the connection, when it authenticates with one and only then, and the
integration validates its settings and auth method first (`UnknownIntegration`,
`InvalidConnection`). The key goes to `ConnectionCredentialStore`, one credential for each
connection, in the commit that records the connection; replacing it overwrites it, and removal
deletes it and keeps the record, so a retried create finds the connection and answers `NotFound`.
No fact, change-feed event, or view carries a key. `check` reads the key and asks the integration
to check the connection with its system, returning `Health`; it holds no commit open while the
system answers.

`connection.create` works on the workspace; `connection.read`, `connection.manage`, and
`connection.use` on each connection, a `Connection` target. Members read and use connections;
administrators and the owner create and manage them, and checking is managing, since it sends the
key. Using a connection is giving it to what runs on it, as to an agent. `ConnectionStore` is a
projection store and `ConnectionCredentialStore` keeps credentials outside the journal, reporting
`Unavailable` on a host that keeps none (`CredentialsUnavailable`); both are host bindings. The
gateway supplies the host's integrations as `Integrations`.

## Agents

`@amends/core/agent` holds a workspace's agents. An agent is a workspace member that works: `Agent.Record` keeps its
instructions; its `harness`, the harnesses of one of the workspace's connections or `Auto`, for
amends to choose among them; its `model`, one a connection offers, by id, with an `effort`; and its
`sandbox`, the sandboxes of a connection, or none. Its name, role, and departure are its
membership's. `AgentFacts.Created` records an agent in the commit that adds its membership, and
`Configured` replaces how it is set up as a whole; `AgentProjection` keeps them in
`AgentStore`, a projection store.

`AgentService` lists and reads the agents the actor may read, as `Agent.View`, and creates,
configures, and renames them. Creating adds the agent's membership with `MemberCommand.add`, with a
role the actor must be able to grant. Its role is then changed, and it is removed, as any member's
is, by `AssignmentService` and `MemberService`. Creating and configuring refuse a connection the
actor may not read and use, or that is not active (`ConnectionUnavailable`, naming the part), and a
setup that cannot run (`Incomplete`), except that an agent on `Auto` may wait for a connection that
gives a harness. A view carries the agent's readiness, as `AgentReadiness` finds it against the
workspace's connections and the host's integrations whoever reads it: `Ready`, or `Incomplete` with
issues naming the part whose connection was `Removed`, whose integration is `Uninstalled`, or that
does not give the part as the agent takes it (`Invalid`, as the integration describes it, such as a
model it no longer offers); `SandboxRequired` when its harness's agent works only in a sandbox and it
has none; and `NoHarness` when, on `Auto`, no connection gives a harness it can run on.

`AgentQuery` is what turns read of the agent they run, trusting their caller. `select` gives the
`Agent.Selection` a turn runs on: the agent's model and sandbox, and its harness, which on `Auto`
is that of the agent's last turn in the conversation while it can still run on it, and otherwise
the oldest connection whose harness it can run on. `buildRunnable` gives the agent ready to run on
a selection, as data (`AgentQuery.Runnable`): its instructions now, and the connections of the
selection's harness, model, and sandbox, if it has one, each with the key it holds, beside the model
as its integration's endpoint takes it. Whoever runs the agent builds its harness and sandbox from
these with the integrations its host installs, so core runs nothing of an agent. Both fail with
`Incomplete` when the agent cannot run, and `buildRunnable` also when a connection of the selection
no longer gives its part or has no key.

`agent.create` works on the workspace; `agent.read` and `agent.configure` on the agent's
membership, a `Member` target. Members read agents; administrators and the owner create and
configure them. `agent.use`, which `AgentPermissions.Use` declares, keeps the name it had
before agents, since it means the same: directing an agent, as asking it for work in a thread,
and stopping or retrying its [turns](#turns), requires.

## Turns

`@amends/core/turn` holds agents' turns in threads. A `Turn.Record` is one harness turn of one
agent in one thread: `queued` until its job starts it, `running`, `cancelling` once asked to stop,
then `completed`, `failed`, or `cancelled`, never reopening. An agent has at most one active turn
per thread, which the stores enforce, and work that arrives while it is active waits for the next.
A turn records the participation it works for, the timeline position through which it accepted
work (`acceptedThroughSequence`), where its entries begin in the participation's session log
(`logAfter`, the log's latest position when the turn was created, kept out of `Turn.View`), the
turn it retries and who asked (`retry`), the `Agent.Selection` it started on, the reply it
posted, and why it failed or was asked to stop.

Agents handle their own notifications as people do theirs. Each agent in each thread has a turn
[job](#jobs), which runs the agent and writes the participation's session log. What it asks of the
workspace is `TurnExecution`: commands and queries over data, which hold nothing in memory, so a
job could call them from another process. Each change is its own commit, attributed to the agent:

- `accept` gives the agent's active turn in the thread or, while it has none, accepts its pending
  work notifications there into a new turn, settling them as `Accepted` with the turn's ID; none
  while no work waits. Work waits while the agent cannot open the thread.
- `start` readies the turn. A turn asked to stop, or whose participation ended, ends as it stands,
  and so does one with nothing to say. Otherwise the turn starts on what
  [`AgentQuery`](#agents) selects, kept when it runs again, and fails with the reason when the
  agent cannot run on it. `start` answers `Idle`, or `Ready` with the turn, the agent's `Runnable`,
  its prompt and how many messages it tells, and what the participation's session resumes from
  (`SessionStateStore.Resume`), or none when it starts anew. The prompt (`TurnPrompt.promptOf`) is
  the others' messages since the agent was last prompted there, through what the turn accepted,
  each named by its author, and, for a retry, who asked. A running turn, as a run cut short leaves
  it, is ready again as it was.
- `joinedConversation` is the conversation the agent joined: the thread's messages before it took
  part (`TurnPrompt.conversationOf`: others' as the user's, each named, the agent's own as its
  answers), which a new session log starts with.
- `showDraft` shows readers more of the step being written, as a `TurnDraft` signal.
- `close` posts the reply its job gives, the text of the turn's last step
  (`SessionLog.answerOf`), as the agent's own message to the thread's current participants, naming
  the turn (`turnId` on the message), saves what the session resumes from, and completes the turn,
  in one commit. A reply of only space posts nothing, and one the agent may no longer post, as it
  can no longer open or post in the thread, fails the turn. A turn asked to stop meanwhile stops
  instead.
- `fail` and `confirmStopped` end a turn and post nothing.

Each of these keeps what a session the turn started resumes from in `SessionStateStore`: per
participation, the harness's agent that ran it last and what that agent returned of its own, how
far the agent has been prompted, and the selection its last turn ran on, so the agent's next turn in
the thread resumes on the same harness. The conversation is not there: the session log holds it. Every way a
turn ends, including a queued turn stopped by a reader, goes through `TurnCommand.endTurn`, which
in the ending commit publishes the turn's fact and records `turn.ended` in its thread's timeline.

Each participation has a session log, the record of the agent's conversation in the thread, apart
from the journal and every commit, so a host may keep it in a store of its own
(`SessionLogStore`: `head`, `append` after the position the writer read to, which a log past it
refuses with `Conflict`, `read` past a position, and `waitForAppend`). Its entries
(`SessionLog.Entry`) are `Joined`, the conversation the agent joined, and, each naming its turn,
`Prompted` with the prompt's texts and how many messages it took in, each `Step`, and
`Interrupted` when a run stopped short and ran again. The turn's job writes them: what was joined
when the log is new, the prompt once the turn is ready, and each step it finishes, its parts added
up (`StreamPart.Step`). `SessionLog.historyOf` rebuilds the
conversation the harness resumes with: what was joined, then each turn's prompt and the steps of
its latest run, each as `Session.messagesOfStep` records it. How a turn ended is its record's to
say, not the log's: what the log holds of a turn is written before the commit that ends it.
`SessionLog.reader` reads a turn's entries as the items readers see (`Turn.LogItem`): the prompt,
each step that wrote text, verbatim, which is the reply once the turn posts it, and interruptions,
never reasoning or tool calls.

`TurnService.watchLog` follows a turn's entries in its session log for a reader who may read its
thread, as a stream of `Turn.LogMessage`s. It reads the log from the turn's `logAfter`, taking the
turn's entries into one `SessionLog.reader`, and waits for each append: `Opened` carries the items
as they stand, `Changed` the items each append adds or changes, by index, and `Ended` follows the
commit that ends the turn, which it follows through `ChangeFeedSource`, once it has read the rest
of the log and marked the reply the turn's record names. It passes on the turn's `TurnDraft`
signals as `Drafted`. Drafts are not kept: a draft continues its part at an offset, so a reader who
starts following mid-step sees the step from the next draft that starts at its part's beginning, or
once the step is logged. The drafts and commits subscriptions register before the turn and its
log are read, so nothing published in between is missed. Each append checks that the reader still
may read the thread, and so does each commit that changes the reader's groups or grants, or a
role's permissions. Drafts are not checked one by one: following ends once the commit that took
the reader's access is delivered, so a reader who lost it sees at most the drafts sent while that
delivery was on its way. A stream that cannot go on fails with `Turn.LogUnavailable`.

A turn's changes also show in its thread's timeline, recorded as thread activity in the commits
that make them (the `TurnActivity` kinds, which `TurnCommand.recordActivity` records):
`turn.created` where the agent took on the work, or where a retry asked again (naming the turn it
retries), `turn.started`, `turn.stopping` once a running turn is asked to stop, and `turn.ended`
with its outcome, the reply it posted, and why it failed or was stopped. Each carries what its
item shows, so `TurnTimeline` resolves it without reading anything more. It informs no one and is
not new activity; the replies are. A client folds a turn's items into one row at its
`turn.created` position.

`TurnService` lets a reader who may read a thread `get` its turns, as `Turn.View`s: the record,
with whether the reader may stop it (`stoppable`) or retry it (`retryable`) now. Every turn read
requires what the thread's timeline does: the group's audience and `thread.read` on the thread. A
turn in a thread outside the reader's audience is `NotFound`, and one in a thread they may not
read is `Authorization.Denied`. `listActive` gives the workspace's active turns in threads the
reader may read, among at most `limit` active turns. When they may also direct its agent
(`agent.use`), `cancel` stops an active turn: a queued turn at once, a running one once its job
confirms it. `retry` runs a failed or stopped turn again as a new queued turn, recorded as
`TurnFacts.Retried`, for the same agent, participation, and accepted work, prompted again from
where the agent was last prompted, with who asked, on the agent's setup as selected then. Only
the agent's latest turn on the thread can be retried, while no other is active and the agent still
takes part there; otherwise it is `NotRetryable` with the reason (`active`, `completed`,
`superseded`, or `departed`). A retry is created after the turn it retries, even on a clock that
has not moved, and takes its ID from the turn it retries, so repeating it returns the turn it
created. Turn facts reach the thread's readers through the change feed; the timeline shows an
agent's reply as its message.

## Read state

`@amends/core/read-state` holds private read state: `ReadStateService.markThreadRead` and
`markGroupRead`, over the required `ReadStateStore` binding, which is kept outside the journal.
Its internal `ReadStateCommand.markThreadRead` marks the reader's notifications from the thread
seen and advances their position; marking a thread read, starting one, and replying all use it, so
an author has read what they posted. It is one part of the
[attention model](../../docs/core-model.md#agreed-attention-is-directed-followed-or-ambient): what
makes ambient activity visible.
The thread and group projections keep each thread's and group's latest message from recorded
thread activity, through `ThreadStore.recordLatest` and `GroupStore.recordLatest`, and notifications from thread activity carry their thread and
sequence, so reading a thread settles exactly its notifications. See
[marking conversations read](../../docs/thread-workflows.md#marking-conversations-read).

## Identity and target boundaries

`Identity.Reference` identifies a Human, Agent, or Contact. `Identity.MemberReference`
is the Human/Agent subset used by members, actors, session token resolution, and the
gateway. External authors use `Performer.Reference.Identity` with a Contact;
`Performer.Reference.Member` always carries a member identity. Attribution does
not grant authority, and a contact identity does not select an external reply destination.

`Target.Reference` supports Workspace, Member, Group, Thread, and Connection. Group targets carry
`workspaceId` and `Group.Id`; thread targets carry `workspaceId` and `ThreadId.Id`, exported from
`@amends/core/thread`. Exact target scopes compare the workspace, kind, and ID; a workspace scope
covers targets in that workspace. Group and thread actions also require current group membership,
following the [thread access rule](../../docs/core-model.md#agreed-thread-access-combines-audience-and-action-permissions);
every thread belongs to one group.

## Threads

`@amends/core/thread` holds threads, participations, messages, and their timeline activity, with
four store contracts. Its operations are `ThreadService` (`startInGroup`, `startDirect`, `get`,
`listInGroup`, `listOpenings`, `readTimeline`, `listParticipants`), `ThreadMessageService.publish`, and
`ThreadParticipationService` (`follow`, `unfollow`). A participant is a member, a contact, or
triage: member participation references the exact group admission, while contacts and triage take
part without group access. A message author is a member or a contact.

Two internal services carry the work operations share, with no action checks of their own; they
are excluded from `Core.Operations`. `ThreadQuery` holds the reads and `ThreadCommand` the writes,
which run inside the caller's commit and publication context. A command may read through
`ThreadQuery`; a query never writes.

| Method                                                                    | Role                                                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ThreadQuery.requireAccess`                                               | Checks current group access to a thread, shared by reads and writes                                   |
| `ThreadQuery.eligibleMembers`                                             | The members with a current group admission and active membership, of those asked about                |
| `ThreadQuery.currentParticipants`, `pageParticipants`, `findParticipants` | Current participants: all of them, a page, or the given ones                                          |
| `ThreadQuery.readTimeline`, `readTimelineItem`                            | Resolve timeline subjects under access, for timeline pages and notification sources                   |
| `ThreadCommand.create`                                                    | The one start every workflow uses: creates the thread, admits its starters, records the first message |
| `ThreadCommand.publishMessage`                                            | Publishes a message with its admissions, activity, and recipients                                     |
| `ThreadCommand.publishActivity`                                           | Publishes one activity of any kind: position, admissions, the domain's step, and recording            |

`ThreadActivityResolvers` routes each activity kind to the resolver its domain registers.

Every activity kind uses `ThreadActivityFacts.Recorded`, carrying an activity and its selected
recipients; the activity, thread, group, and notification projections each consume that one
envelope into their own store. Domain facts own state, and activity owns timeline position.

### Activity kinds

An activity has one shape for every kind, `ThreadActivity.Record`: its position, a dotted `kind`
such as `message.published`, its `subject`, an `occurrence` key, `newActivity`, and the kind's
`details` in encoded JSON. Storage, facts, and the change feed carry that shape, so a new kind
changes none of them and needs no migration. The domain that owns a kind defines it next to its
facts with `ThreadActivityKind.make(name, { details, subject, occurrence?, newActivity })`:
`ThreadMessageActivity.Published`, `ThreadParticipationActivity.Followed` and `Ended`, and
`TurnActivity.Created`, `Started`, `Stopping`, and `Ended`.

- `details` is the kind's schema, encoded to JSON when recorded and decoded when read.
- `subject` names what the activity is about, derived from its details.
- `occurrence` gives the parts that make it unique; by default its subject, so each subject has
  at most one activity of the kind. Returning `null` makes the kind repeatable.
- `newActivity` says whether it becomes its thread's and group's latest activity for readers;
  messages do, and participation changes are quiet.

`ThreadActivityKind.prepare` derives those fields from the details, and `ThreadActivityKind.decode`
reads an activity back as its kind, rejecting one whose derived fields disagree.

A domain publishes activity through `ThreadCommand.publishActivity`, in its operation's commit.
It takes the thread's next position, failing with `PositionChanged` when an
`expectedSequence` is given and activity took that position first. It admits the participants the
operation asks for, then runs the domain's step, which publishes the domain fact and returns the
kind, details, and recipients. The activity is recorded at that position, caused by that fact.

A kind appears in timelines through a resolver its domain registers:
`ThreadMessageTimeline.resolver`, `ThreadParticipationTimeline.resolver`, and
`TurnTimeline.resolver`. Each loads what its
kinds reference in one batch per page and returns typed items; each timeline module adds its item
type to `ThreadActivityKind.Item` by module augmentation. `src/core.ts` registers the resolvers, and
`ThreadTimeline.Item` is the closed schema of every item, for protocols that encode timelines; a new
kind adds its resolver to the first and its item schema to the second. Reading a kind without a
resolver is a defect, `ThreadActivityResolvers.Unknown`.

Starts and replies read only the admissions and participations of those they name, through
`GroupMembershipStore.findActiveMany` and `ThreadParticipationStore.findActive`; a reply without
mentions pages the thread's active participants, the people it notifies. The stores'
whole-history `listByGroup` and `listByThread` remain for inspection, and no operation uses them.
See [thread workflows](../../docs/thread-workflows.md).

## Request keys

`@amends/core/request` holds `Request.Key`, the `Request.Options` creating operations accept,
`Request.derivedId`, which derives an ID from parts naming an operation, its requester, and a key,
and `Request.idFor`, a new ID without a key or a derived one with it. Each creating operation names
what it creates that way, so a retry runs the operation's checks, finds the record by its ID, and
returns it instead of creating another. The key alone names the request: a retry gets what the key
created whatever it asks for. A turn retry derives its turn's ID from the turn it retries and
takes no key. See [retrying safely](../../docs/thread-workflows.md#retrying-safely).

## Permission declarations and built-in roles

Declare a permission beside its owning feature and register it in `core.ts`.
Every declaration must explicitly choose `builtinTier`: `member`, `administrator`,
or `owner`. Permission groups supply a name prefix and default target kind, but
never a default tier:

```ts
import { Permission } from "@amends/core/authorization";

const member = Permission.makeGroup("member", { targetKind: "Member" });
const Read = member.make("read", { builtinTier: "member" });
const Remove = member.make("remove", { builtinTier: "administrator" });
```

`PermissionCatalog` validates and freezes the registered definitions. Its
`definitions` array supplies `BuiltinRoles.make`, which constructs cumulative
Member, Administrator, and Owner records for one workspace. Workspace initialization
records all three roles and one workspace-scoped Owner assignment for its creator.
The reserved role IDs are stable within each workspace; display names are labels.

Tiers only construct these default bundles. Authorization checks stored permission
names and scopes, and services enforce ownership and delegation rules.
`Permission.Reference` retains only the name and target kind used by requirements,
preserving the HTTP error contract without exposing bundle-construction metadata.

Neither authorization nor replay regenerates a workspace's roles; they use the recorded
facts. Each workspace records the bundle revision its built-in roles hold. To change the
declarations, raise `BuiltinRoles.revision` and add the new revision's bundles to the test that
pins them. `BuiltinRoleUpgrade.upgrade` brings a workspace at an earlier revision to the host's,
in one commit attributed to the `builtin-roles` system: it creates a missing built-in role and
records the names and permissions that differ, then the revision. It leaves a workspace at the
same or a later revision alone, so an older host never reverts it. The gateway runs it when it
boots a workspace. A recorded permission the catalog does not declare, retired or added by a newer
host, grants nothing, since no requirement can name it, and its holder's other grants stand;
`Delegation` still loads the roles that record it. Bundle revision 7 is the current bundles:
Member takes part in conversations, creates, renames, joins, and manages the groups it belongs to,
directs agents, reads agents and connections, and uses connections; Administrator adds people
management, invitations, role changes, `group.moderate` for public groups, and creating and
configuring agents and connections; Owner adds workspace rename and ownership transfer. No role reaches a group from
outside it, which group operations enforce by requiring membership as well as the grant. `AssignmentService` provides listing, assignment,
revocation, and atomic workspace-role replacement, and `permissions`: the declared workspace-target
permissions the acting member's current grants cover, which needs active membership only, so
clients can offer just the actions the member may take. `Delegation` supplies the shared
rules used by assignments, invitations, and member removal. `AssignmentCommand.assignRole` and
`revokeAssignment` record a workspace role's assignment and its end, for assignment changes,
ownership transfer, accepted invitations, new agents, and workspace creation alike.
`MemberCommand.add` adds a member as accepting an invitation does: the membership, its role across
the workspace, and its admission to the general group, which every member joins. Role definition editing
and custom roles remain separate work. See [workspace workflows](../../docs/workspace-workflows.md#initialization-and-permissions)
for the implemented bundles and current invitation restrictions.

`OwnershipService` coordinates ownership and assignments in one commit. It
requires the current owner and `OwnershipPermissions.Transfer`, validates another
active human recipient, and uses the current Owner assignment ID as the expected
authority for a transfer. The former owner becomes an Administrator. `WorkspaceStore`
applies the recorded change only if the previous owner matches, preserving all other
metadata. The ownership fact is projected alongside the recorded assignment changes;
replay does not reauthorize the former owner.

## Publication and the storage envelope

Every `Journal.publish(fact, payload)` reads `Publication.Service` at invocation:
workspace, performer, immediate cause, correlation ID, and occurrence time.
`Publication.withActor` establishes root context when absent and reuses it in nested
operations. `Publication.make` supports explicit context for authenticated identities
before membership and system performers. `Publication.withCause` continues an event's
causal chain while retaining the current performer; `withPerformer` and `withOccurredAt`
scope overrides to one effect or block. See the
[publication pattern](../../docs/journal.md#event-provenance) for attribution rules,
validation, and examples. Events use `Event.Type<F>` with required provenance throughout storage, replay,
and delivery. `Event.Record` describes the decoded event shape with an unknown payload;
each fact's schema supplies its specific payload type.

Facts can declare `occurrence: (payload) => [stableId]` to make publication
idempotent automatically. The journal namespaces the tuple by fact name and scopes
it to the workspace/log. A declaration can return `null` for repeatable payloads.
Explicit `idempotencyKey` options remain available for facts without a derived key
and for execution-log appends; they cannot override a declared occurrence.
Matching retries return the original event or append slice without rerunning
projections. Conflicting content fails. `getAppend`
on log readers supports transactional lookup by key, and `Fact.makeOccurrenceKey`
derives the lookup key from a payload. See
[idempotent publication](../../docs/journal.md#idempotent-publication-and-append)
for payload matching, expected-position precedence, and composing larger operations.

The storage envelope separates `Event.Header` (subject, name, version, provenance) from
encoded domain payload bytes. `Store.Content` represents append content and
`Store.Entry` adds the log entry metadata. Journal entries use `Event.storageCodec`;
ordinary execution logs use the default payload codec and have no fact header. An execution-log
append outside a commit goes through `Store.append`, a commit of its own that waits only for
the log's other writers, never for the workspace's write order; see
[commits and positions](../../docs/journal.md#commits-and-positions).
Both adapters persist fact subjects, names, and versions as columns, with separate
name and subject indexes. Read matching history with
`journal.read({ subject?, name?, version?, after?, limit })`: supply a subject, a
name, or both; version requires a name. Reads use a
`{ position, index }` cursor and `Event.decode(fact, entry)` for payload decoding.
The existing journal log reader and projection replay retain complete-batch reads.

## Change feed

`@amends/core/change-feed` exports the `ChangeFeed` schemas and
`ChangeFeedService.watch(options?)`. The feed reads the workspace journal, so it
carries every commit to the journal from any host or process over the same storage,
including commits whose acknowledgment was lost. Nothing is published from the
commit path.

`ChangeFeedSource` shares one follower of the journal per workspace runtime. It starts
with the runtime's first subscriber, at the journal's head, and stops when the last
subscriber leaves. It decodes each commit once through the registry in
`src/change-feed/events.ts`, then buffers it for every subscriber; waiting for the next
commit uses `Store.waitForAppend`, whatever the storage. A subscriber registers with
the follower before reading the journal, so no commit falls between the two. A
subscriber that falls behind its buffer (256 commits by default) reads the commits it
lost from the journal instead of failing. When reading the journal fails, the follower logs it
and follows again from the last commit it delivered, backing off up to five seconds, so its
subscribers wait rather than disconnect. A commit it cannot read, holding a fact in a version this
host does not know or with a payload its schema rejects, is logged and ends each subscription so
the consumer refreshes, and the follower goes on past it: reading it again would fail the same
way.

`watch` checks active membership, then emits `Ready { workspaceId, cursor, reset }`
followed by `Committed { workspaceId, cursor, commitId, events }` for each later commit
that carries an event the reader may see. A cursor is opaque and resumes after the
commit that carried it. Given `after`, the feed replays the commits after it, up to 500,
with `reset: false`; without one, with a cursor past the head, with one further behind,
or with one before a commit this host cannot read, `Ready` has `reset: true` at the head and
the consumer must refresh its view.
`Ready`'s cursor is null only for an empty journal.

A reader sees an event when they hold a scope in its fact's
[audience](../../docs/journal.md#fact-audiences) (the workspace, their membership or
identity, or a group they belong to) and any read permission the registry names for it, the
permission the matching read requires: `invitation.manage` for invitations, `member.read` and
`assignment.read` on the member for membership and access changes, `group.read` for group facts,
and `thread.read` for thread facts. A registration can name the member a fact concerns, who sees it
without the permission: their own membership, access, and accepted invitation. Their active
membership, group admissions, and grants are read after the subscription registers and reads
the head, so a change that commits while it opens is either already in what they read or
delivered afterwards. They are reloaded before filtering a commit that changes them, so a
commit that admits the reader delivers what it admits. The commit that removes the
reader from the workspace is delivered, then the stream ends. Registry views give
some facts their public shape: activity omits its notification recipients, and
participation omits routing identities and admissions. Facts outside the registry,
such as test facts, are internal. A core test checks that the registry holds every fact that
declares an audience, at each version, and no other, so a new fact meant for readers cannot be
left out. A registered name recorded in a version this host does not
know, written by a newer host or no longer registered, can be neither shown nor filtered: the
commit holding it reaches no reader, and ends every subscription with `ChangeFeed.Unavailable`,
so reconnecting from the last cursor resets. The follower logs it and continues.

Recorded thread activity also carries the notifications its projection creates. Each
recipient's arrives in the same `Committed` message's `notifications`, derived with
`Notification.fromActivity` exactly as the projection stores it, so it equals what the inbox
lists; human and agent recipients receive their own, whether or not they may read the thread,
and nobody else sees them. A commit with no visible events and no notifications for the reader
sends nothing, so a reader's cursor only advances with commits it sees.

The same stream carries `Signal { workspaceId, signal }` messages between commits, for the
[signals](#signals) the reader may see, filtered by the same scopes and grants as events and
reloaded by the same commits. The subscription registers for signals before `Ready`, so it misses
none published after that. Signals have no cursor and are never replayed; a consumer that
reconnects refreshes read state along with the rest of its view. The HTTP contract reuses these
message schemas. Frontend query dependencies belong in the client.

## Signals

`@amends/core/signal` holds what is happening now and is never stored: `Signal.Value` is `Typing`,
`ThreadRead`, `GroupRead`, `NotificationsSeen`, or `TurnDraft`.
`Signal.changeFeedReachOf` gives each its audience on the change feed, as a fact declares one:
typing reaches the thread's group with `thread.read` for the thread, and the three read-state
signals reach only the member whose private state changed, so their other sessions stay current
without the journal. A turn's drafts reach nobody there: only readers following the turn's log,
which checks their access itself.

`SignalHub.Service` is the workspace's delivery, which storage binds with the stores: `publish`
offers a signal to the subscribers present at that moment, in every process over the same storage,
and `subscribe` returns those published from then until its scope closes. Delivery is best effort.
Publishing never fails the operation that publishes, and a subscriber that falls behind, or whose
process loses its connection to the others, misses signals rather than delaying anyone.
`SignalHub.makeLocal` is one process's hub for every workspace, which storage adapters bind to each
workspace and relay between processes where several share their storage.

`ThreadMessageService.typing(threadId)` tells the thread's readers that the acting member is
composing there for the next six seconds. It requires current group access and `thread.publish`,
as publishing does, and returns `NotFound` for missing and inaccessible threads alike. Repeats from
the same member in the same thread within two seconds are dropped by the process that receives
them, so a client may call it on each keystroke; clients hide their own member's typing.
`ReadStateService` and `NotificationService.markSeen` and `markSeenThrough` publish the read-state
signals after their writes; the reader's sessions, the one that wrote included, refresh from them.

## Jobs

A job is work a commit asks for that runs outside any request. Core declares which facts request
which job, as journal [reactions](../../docs/journal.md#reactions), in the commit that publishes the
fact: the request is stored with the commit and discarded if it rolls back, a request that cannot
be stored fails the commit, and neither replay nor a retried publication that returns its
original event asks again. Each request names the workspace of the fact that asked for it, and an
agent's job names the agent by its membership.

- A **turn job** (`TurnJobs`), one for each agent in each thread, runs the agent's work there,
  one [turn](#turns) at a time, asking the workspace through `TurnExecution`, and stops its turn
  when asked. Activity
  that asks the agent for work, and a turn's end or retry, request a run; a request to stop a
  turn, and the end of the agent's participation in the thread or its leaving the thread's group,
  request a stop.

`TurnJobs.Service` is a host service, shared by every workspace, which delivers each request to
whatever runs turn jobs; `TurnJobs.layerNoRunner` accepts requests and runs nothing. What the job
calls, `TurnExecution`, is part of `Core.layer`, and `Core.JobServices` names it with the
`SessionLogStore` the job writes, apart from `Core.Operations`, since no actor calls them: they act
as the agent. A host's jobs reach them through the gateway's `inWorkspace`.
[Cluster](../cluster/README.md)'s `TurnJob` runs turn jobs, as the local host does.

## Module dependencies and exports

Models and ID modules are independent of services, projections, and
storage implementations. Facts depend on models and the fact declaration API.
Projections depend on facts, store contracts, and projection machinery; they
replay recorded outcomes without re-evaluating current authority or time.
Application modules coordinate authorization, stores, and journal publication.

A workflow may reference another feature's models, facts, or store contracts
when it owns their coordination. For example, removing a member revokes pending
invitations and ends active group admissions in the same commit. Keep that workflow in the responsible application
module and preserve its authorization and transaction boundaries.

Inside core, import the owning leaf module directly. Each leaf establishes its
canonical ES module namespace with a self-export, and public barrels relay those
names. Avoid importing an aggregate barrel from an internal module.

```ts
// Inside the member feature:
import { MemberStore } from "./store.ts";

// From another package:
import { Member, MemberService } from "@amends/core/workspace";
```

The domain `index.ts` files define the public package surface. A feature folder
does not automatically need its own barrel or package subpath. File moves retain
the existing `@amends/core/workspace` and `@amends/core/authorization` imports.

Workspace and member IDs live in small leaf modules and remain available as
`Workspace.Id` and `Member.Id`. Use these ID leaves to avoid model dependency
cycles. Reserve `Schema.suspend` for schemas that need deferred construction,
such as genuinely recursive data.

## Schema and type names

Name an exported schema for its domain meaning and role. Read names with their
module qualifier: `Member.Record`, `Identity.Reference`, and
`Permission.Definition`. Ordinary records use `Schema.Struct` and a same-name
interface; unions and scalar schemas use a same-name type. Keep `Id` capitalization
consistent across modules. Typed errors retain tagged error schemas.

| Name                 | Meaning and examples                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Record`             | A complete domain record with its identity and recorded fields: `Member.Record`, `Invitation.Record`, `Event.Record`. Adapter-specific database row shapes stay in adapters.    |
| `Value`              | The primary value object in a focused module: `Actor.Value`, `Grant.Value`, `Requirement.Value`, `Scope.Value`. Prefer a more specific noun when it clarifies the value's role. |
| `Reference`          | Enough information to identify an entity or target: `Identity.Reference`, `Target.Reference`.                                                                                   |
| `Definition`         | A declaration: `Permission.Definition`, `Fact.Definition`, `Projection.Definition`.                                                                                             |
| `<Operation>Input`   | Data supplied to a specific operation: `Invitation.IssueInput`, `Store.AppendInput`.                                                                                            |
| `<Operation>Options` | Parameters controlling an operation: `Store.ReadOptions`, `Store.AppendOptions`.                                                                                                |
| `State`              | A lifecycle variant with associated data: `Invitation.State`.                                                                                                                   |
| `Status`             | A simple lifecycle label: `Member.Status`, `Assignment.Status`.                                                                                                                 |
| `Interface`          | The contract implemented by a context service: `MemberService.Interface`, `MemberStore.Interface`.                                                                              |

Supporting types name their actual role. `Invitation.Issuance` is the immutable
issuance record retained through acceptance or revocation. `Event.Envelope`
contains a fact's subject, name, version, encoded payload, and provenance; `Fact.Payload<F>` is the
decoded domain payload. `Log.Entry<A>` carries a decoded payload and entry
metadata. `Codec.PayloadCodec<S>` handles a payload schema, while
`Codec.FactCodec<F>` pairs that codec with its fact definition. `Codec.EntryCodec<S>`
maps a log's values to structured `Store.Content`; the journal uses it to persist
the envelope header separately rather than wrapping everything in binary.

`Log.Handle.getEntry(entryId)` and the journal's read-only `log.getEntry` resolve an optional
decoded entry directly within the bound workspace and log. They validate entry identity and
decode through the log's codec, honor an enclosing transaction, and perform no writes.
Application readers remain responsible for authorization.

Inline payload structs can stay inside their fact declarations. Obtain their
types through `Fact.Payload<typeof MemberFacts.Added>` rather than adding a
second exported schema name without a separate use case.

Every fact declares `subject: (payload) => Subject.make(kind, id)`, a pure function
of its validated decoded payload. Use the affected entity: workspace, member,
invitation, role, or assignment. Subjects use `kind:id` with a lowercase namespace
containing letters, digits, and hyphens and a nonempty ID. They identify an entity,
not a unique occurrence or an authorization target. Publication persists the
subject, retries compare it, and replay decoding verifies it against the payload.

Put natural occurrence identity in that same declaration, using a pure function
of the decoded payload. Use stable record IDs for creation and terminal facts;
repeatable changes need a request or occurrence ID, not just the affected record's
ID. `occurrence` returns a nonempty array of nonblank strings or `null`. The journal
validates these parts and derives an unambiguous key without the schema version.
Keep identity rules stable across retries. During local development, reset data
when changing an identity rule. Facts registered under the
same name/version must share their payload schema, subject function, and occurrence function.

Schemas used as public HTTP models carry stable identifiers for generated API
documentation: `Workspace`, `WorkspaceMember`, `WorkspaceInvitation`,
`WorkspaceInvitationIssueInput`, and `WorkspaceInvitationIssuance`. Add identifiers
when a schema needs a named public representation or other tooling consumes it;
module-local helper schemas do not need identifiers by default.

HTTP status-specific schema variants are named in the HTTP contract:
`CreatedWorkspace` and `IssuedWorkspaceInvitation` describe the 201 responses.
Explicit variant names avoid generated numeric suffixes while keeping HTTP
annotations out of core's models.

Source names and serialized names are separate contracts. Preserve fact names,
versions, brands, error tags, service keys, projection keys, and encoded fields
during organizational changes. In particular, `Invitation.Record.details` still
holds `Invitation.Issuance`; changing its TypeScript name does not rename the
persisted or HTTP field. During local development, update schemas in place at version 1 and reset
development data. Keep one current database baseline; do not add upgrade migrations,
backfills, or legacy decoding paths.

## Constructors and layers

Follow Effect's public library pattern: construction and service provision are
separate APIs that share one implementation. The matching upstream examples are
[`PgClient`](../../repos/effect/packages/sql/pg/src/PgClient.ts),
[`MssqlClient`](../../repos/effect/packages/sql/mssql/src/MssqlClient.ts), and
[`KeyValueStore`](../../repos/effect/packages/effect/src/persistence/KeyValueStore.ts).

| API                                                    | Meaning                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `make(...)`                                            | Construct the module's primary value or service implementation.                  |
| `makeRunner(...)`, `makeGroup(...)`, `makeSchema(...)` | Construct a named supporting value.                                              |
| `makeForSchema(...)`                                   | Construct a codec from a schema instead of a fact definition.                    |
| `Service`                                              | Identify a service in Effect's context.                                          |
| `Service.of(value)`                                    | Type-check an existing implementation; no initialization or provision.           |
| `layer` / `layer(options)`                             | Provide services by delegating to their constructors and composing dependencies. |

Every service implementation in `src` exports `make` and `layer`. A constructor
remains a supported public API even when the layer is its only current consumer.
Pure constructors return values directly. Effectful constructors return lazy
Effects with their acquisition failures and dependencies represented in the type.

Core's service constructors use `Effect.fn("Module.make")`, including those with
no arguments. Their state and dependency acquisition belong inside the Effect:
evaluating the same construction Effect twice creates two implementations.
Return `Service.of(...)` from service constructors. Use `Effect.fn` for named
operations and `Effect.gen` for inline composition; an Effect that reads, writes,
decodes, or authorizes keeps its operation name.

Construction owns initialization and validation. A layer delegates to that
construction path and may supply implementation dependencies. Use
`Layer.provide` to keep those dependencies internal and `Layer.provideMerge` when
consumers also need them. Reuse a layer value within a composition to share its
acquisition. A constructor does not cache its result by itself.

For example, callers can construct logs with an explicit transaction coordinator:

```ts
import { Log, Transaction } from "@amends/core/journal";
import { Effect } from "effect";

const makeLogs = Effect.gen(function* () {
  const transaction = yield* Transaction.make();
  return yield* Log.make().pipe(Effect.provideService(Transaction.Service, transaction));
});
```

This still requires host storage; the coordinator takes its workspace from `Store.Service`.
`Log.layer` supplies the coordinator and exposes both services so the journal and
log operations share the same commit ownership.
`Layer.build` materializes a layer into a scoped context; reserve `build` for that
meaning rather than using it as a synonym for a constructor.

## Service boundaries

| Implementation            | Constructor                           | Layer provides                          |
| ------------------------- | ------------------------------------- | --------------------------------------- |
| Transaction               | `Transaction.make()`                  | `Transaction.Service`                   |
| Log                       | `Log.make()`                          | `Log.Service` and `Transaction.Service` |
| Journal                   | `Journal.make(options)`               | `Journal.Service`                       |
| Change-feed follower      | `ChangeFeedSource.make(options?)`     | `ChangeFeedSource.Service`              |
| Permission catalog        | `PermissionCatalog.make(definitions)` | `PermissionCatalog.Service`             |
| Grant resolver            | `GrantResolver.make()`                | `GrantResolver.Service`                 |
| Authorization             | `Authorization.make()`                | `Authorization.Service`                 |
| Member operations         | `MemberService.make()`                | `MemberService.Service`                 |
| Thread operations         | `ThreadService.make()`                | `ThreadService.Service`                 |
| Thread participation      | `ThreadParticipationService.make()`   | `ThreadParticipationService.Service`    |
| Human message publication | `ThreadMessageService.make()`         | `ThreadMessageService.Service`          |
| Notification reads        | `NotificationService.make()`          | `NotificationService.Service`           |
| Team creation and reads   | `GroupService.make()`                 | `GroupService.Service`                  |
| Group membership          | `GroupMembershipService.make()`       | `GroupMembershipService.Service`        |
| Group following           | `GroupFollowService.make()`           | `GroupFollowService.Service`            |
| Read state                | `ReadStateService.make()`             | `ReadStateService.Service`              |
| Group internal reads      | `GroupQuery.make()`                   | `GroupQuery.Service`                    |
| Assignment operations     | `AssignmentService.make()`            | `AssignmentService.Service`             |
| Delegation policy         | `Delegation.make()`                   | `Delegation.Service`                    |
| Invitation operations     | `InvitationService.make()`            | `InvitationService.Service`             |
| Ownership operations      | `OwnershipService.make()`             | `OwnershipService.Service`              |
| Change feed               | `ChangeFeedService.make()`            | `ChangeFeedService.Service`             |

The store modules and `Checkpoint` declare contracts implemented by adapters.
`SignalHub.Service` is a storage contract too, bound to one workspace like the stores.
`Actor.Service`, `Publication.Service`, and `Store.Transaction` identify invocation
context supplied by trusted ingress, application operations, and storage. These contracts have no default implementation or
pass-through `make`/`layer` wrappers in core. Private transaction tags coordinate
operations and are not public construction APIs.

Constructors capture stable workspace dependencies. Actor identity and the active
transaction are resolved during each operation. Projection runners capture their
declared dependencies while preserving invocation-time transaction and scope.
If a constructor acquires resources, retain `Scope` in its Effect requirements
and use those resources within that scope; the corresponding layer owns cleanup.

The root `core.ts` is a composition of these layers, with no separate service
implementation to construct. `HostServices` remains derived from its input
requirements and `Operations` from the services it exposes.

## Other construction APIs

`Fact.make`, `Permission.make`, `Grant.make`, `Requirement.make`, and
`Projection.make` construct declarations or validated values. A projection
definition gains subscriptions through `.on(...)`; `Projection.makeRunner`
constructs its executable runner. `Codec.make` constructs a fact codec and
`Codec.makeForSchema` constructs a payload codec. `Event.makeSchema` and
`Grant.makeSchema` construct schemas. Schema-owned constructors such as
`Member.Id.make` and `Actor.Value.make` retain Effect's own naming.

Service methods retain their domain verbs: `open`, `publish`, `resolve`, `require`,
`issue`, and `accept`. Workspace initialization is an operation that persists
facts, rather than service construction, so it remains `initialize`.

Document public constructors with `@category constructors` and layer exports
with `@category layers`. Add `layerConfig`, `layerFrom`, or other variants only
when the module has the corresponding configuration or acquisition use case.

Run `bun run check` from the repository root after changes, and `bun run test`
after behavior changes. Construction tests should exercise transaction ownership,
rollback, dependency capture, or lifetime guarantees rather than just object shape.
