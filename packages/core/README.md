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

| Domain          | Ownership                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `workspace`     | Workspace metadata and initialization, with `member/`, `invitation/`, `ownership/`, and `settings/` features.    |
| `authorization` | Access evaluation and permission concepts, with `role/` and `assignment/` features.                              |
| `identity`      | Human, agent, and contact references, with human/agent actors and membership.                                    |
| `journal`       | Shared log, transaction, fact, codec, and projection machinery.                                                  |
| `notification`  | Notification records, inbox/source reads, acknowledgment, activity-driven generation, and departure settlement.  |
| `thread`        | Private-group starts, human replies, authorized reads, participation, timeline activity, and projection storage. |
| `agent`         | Agents' configuration: instructions, model access, and environment, over an agent's workspace membership.        |
| `turn`          | Agents' attempts on threads: accepting work, each attempt's log, execution steps, and cancellation.              |
| `group`         | Team creation, public discovery and joining, authorized reads, audience policy, membership, and storage.         |
| `change-feed`   | Live workspace changes for consumers that refresh their current view.                                            |
| `signal`        | Ephemeral signals, such as typing and read-state changes, for connected readers; never stored.                   |
| `request`       | Request keys, so a creating operation's retry returns what its first attempt created.                            |
| `background`    | Processes the domains run outside requests, the wakes commits ask for, and the runs hosts perform.               |
| `text`          | Rules for text people enter: what storage keeps as given, and what a name may hold. Internal to core.            |

Permission, grant, requirement, scope, and target remain focused modules within
authorization. Future features such as thread and task belong beside these
domains; workspace scoping alone does not make a feature part of workspace
management.

`@amends/core/notification` holds the `Notification.Record` model, the `NotificationStore`
contract, `NotificationApplication`, and the projection that generates notifications. A record
references a source log entry and a Human, Agent, Contact, or Triage recipient (one Triage
recipient per workspace, `{ _tag: "Triage" }`), and is `Pending`, `Discarded` when its agent
participation ends or its person leaves the source's group, `Acknowledged` once a human saw it, or `Informational` from the start when
its activity asks an agent for no work, as another agent's message does. Each activity recipient
records `requestsWork`. A human or agent recipient names the
membership notified as well as the identity (`Notification.ofMember`), so an inbox belongs to one
membership: someone who rejoins under a new member ID starts with an empty one.
`NotificationApplication` serves the acting member's own inbox (`get`, `list`, `listPending`, and
`inbox`, newest first with each source they can still read), `resolveSource`, and human
`acknowledge`; contact and triage inboxes are read only through the
store. `NotificationProjection`
generates notifications from each recorded thread activity's recipients, and settles pending agent
input when a participation ends, from the activity and its own notifications alone. A human's `Seen` is private state the store keeps outside the
journal. Internal `NotificationSource` resolves a notification's recorded activity for
`resolveSource`. Notifications never create turns, accept their input, or execute work. See
[reading the inbox](../../docs/thread-workflows.md#reading-the-inbox),
[resolving a notification source](../../docs/thread-workflows.md#resolving-a-notification-source),
and [acknowledging a notification](../../docs/thread-workflows.md#acknowledging-a-notification).

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
`MemberApplication`. Keep the named domain model file instead of collecting
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

## Groups

`@amends/core/group` holds team and direct groups, their admissions, and follows.
`GroupApplication` creates teams, private or public, and reads groups (`listMine`, `listPublic`,
`get`);
`GroupMembershipApplication` adds, removes, and lets members join public groups and leave team
groups, and reads rosters;
`GroupFollowApplication` follows and unfollows. `GroupStore`, `GroupMembershipStore`, and
`GroupFollowStore` are required host bindings. A direct group has a fixed set of two or more
members in `Group.directMembers` order, identified by `Group.directKey` and found in any order
through `GroupStore.findDirect`; internal `DirectGroups.establish` finds or creates one for
`ThreadApplication.startDirect`.

Internal `GroupAudience.require` checks current workspace and group membership, with no action
permission and no management bypass; each application checks its own action grant alongside it,
inside its commit for writes. `GroupMembershipDeparture` records a group departure as one fact;
projections end the member's follow of the group and every thread participation held through the
admission together, without thread activity. Workspace-member removal uses it for every admission. See
[group workflows](../../docs/group-workflows.md).

## Connections

`@amends/core/connection` holds workspace connections: access to an external system through an
implementation the host installed, described by the [connection contract](../connection/README.md).
`ConnectionApplication` lists and reads the connections the actor may read, and creates, renames,
configures, sets and clears the credential of, and removes them; `implementations` lists the
declarations this host installed, which every member may see. Reads return `Connection.View`:
the record without its credential, whether one is set, whether this host installed the
implementation, its capabilities, readiness for each capability, and `manageable`, whether the
actor holds `connection.manage` on it. Readiness is `Ready`, or
`Incomplete` with the required settings and credential it lacks; it is computed on read, from the
record and the host's `ConnectionCatalog`.

`connection.create` works on the workspace; `connection.read`, `connection.manage`, and
`connection.use` on each connection, a `Connection` target, so one can be shared narrowly. Members
read and use connections; administrators and the owner also create and manage them. Configuring an
agent checks `connection.use` on its model connection. A connection someone may not read is
`NotFound` to them.

Creating validates the implementation (`UnknownImplementation`), its settings against the
declaration (`InvalidSettings`), and the authentication method (`UnsupportedAuthentication`), and
takes no secret, since a request receipt records its input in the journal. `setCredential` takes
the secret, as `Connection.Secret`, redacted: it stores the secret in `ConnectionCredentialStore`
and records only its reference, deleting a replaced one, in the same commit. Removal deletes the
credential and keeps the record for history. No fact, change-feed event, or read carries a secret,
and replay restores references, not secrets.

`ConnectionStore` is a projection store; `ConnectionCredentialStore` holds secrets outside the
journal and its read models, writes within commits, and reports `Unavailable` on a host that keeps
none, which operations surface as `CredentialsUnavailable`. Both are required host bindings, and
`ConnectionCatalog.Service` is supplied by the gateway from the host's registered declarations.

## Environments

`@amends/core/environment` holds workspace environments: where and how agents run, as a harness and
an optional sandbox, described by the [harness](../harness/README.md#declarations) and
[sandbox](../sandbox/README.md#declarations) declarations a host installs in its
`EnvironmentCatalog`. A sandbox names its provider, where the harness runs (`in-process`, where the
sandbox is only where its tools act, or `in-sandbox`), the account connection it runs under when
its provider has one, a template, non-secret variables, setup commands run in order, and a
retention, `stop` or `destroy`. Model access, instructions, and toolkits belong to agents, and
credentials to connections.

`EnvironmentApplication` lists the installed `implementations`, which every member may see, and
lists, reads, creates, renames, configures, and removes environments. Creating checks the harness
(`UnknownHarness`), that it can run where asked (`UnsupportedPlacement`), the provider
(`UnknownSandboxProvider`), and the sandbox settings (`InvalidSandbox`, with issue codes): an
account connection exactly when the provider runs under one, which the actor may read and use and
which declares the sandbox capability for this provider, and a template only when the provider
takes one. The harness, provider, and placement are fixed once created; `configure` replaces the
rest of the sandbox settings. Reads return `Environment.View` with `manageable` and readiness,
`Ready` or `Incomplete` with issue codes, from the catalog and the account connection's own
readiness; nothing contacts the provider.

Every workspace starts with `Environment.InProcessId`, amends's own harness in process without a
sandbox, recorded at initialization with no creator. It is an ordinary environment afterwards.
`environment.create` works on the workspace, and `environment.read`, `environment.manage`, and
`environment.use` on each environment, an `Environment` target; members read and use environments,
and administrators and the owner also create and manage them, raising the built-in roles to
revision 3. Configuring an agent checks `environment.use` on the environment it starts in.

`EnvironmentCompatibility.check(environment, harness, selection)` is the one answer to whether an
environment can run a model selection: the environment must be ready, the connection must provide
model inference and be ready, a harness that speaks provider interfaces must speak the
connection's, and a requested reasoning level must be one the harness takes. It does not check the
model against those a connection suggests. Agent setup and environment choices call it; turn setup
and transfers are meant to share it.

## Agents

`@amends/core/agent` holds agents' configuration. An agent is a workspace member whose identity is
`Identity.MemberReference` `Agent`: its membership holds its name, status, roles, and group
admissions, as any member's does, and `Agent.Record` holds what makes it behave, its instructions,
its model access (a connection, a model identifier, and a reasoning level or null), and the
environment it starts in. Credentials stay with the connection, and where and how it runs with the
environment.

`AgentApplication.create` adds the membership with its name, a workspace-scoped assignment of the
initial role, admission to the general group, and the agent's record, in one commit. It requires
`agent.create` on the workspace, and the role goes through `Delegation.requireGrant`, so only the
owner gives an agent Administrator and nobody gives it Owner. The actor must be able to read and
use the connection and the environment (`ConnectionUnavailable`, `EnvironmentUnavailable`), and
`EnvironmentCompatibility.check` must pass except for setup still pending: an environment or
connection that is not yet ready is saved and shows as the agent's readiness, while one without
model inference, a harness that does not speak the connection's interface, or a reasoning level it
does not take is refused (`Incompatible`, with the reasons). `configure` replaces the instructions,
model access, and environment under the same checks, `rename` renames the membership with the
name it expects (`Changed`), and `remove` removes the membership through `MemberApplication.remove`,
with its delegation rules; the record remains for history. `environmentChoices` answers the check
for each environment the actor may read and use, for choosing where an agent starts.

Reads return `Agent.View`: the record with its membership's name, the workspace role it holds when
the reader may read its access, `configurable`, `removable` (configuring it and removing members,
within the delegation rules), and `usable` for the reader, and readiness, `Ready` or `Incomplete` with issues: the environment or connection is
gone, or a compatibility reason. Readiness is computed whoever reads it, from the stores and the
host's catalogs. An agent whose membership ended is `NotFound`. `agent.create` works on the
workspace; `agent.read`, `agent.configure`, and `agent.use` on the agent's membership, a `Member`
target. Members read and use agents, and administrators and the owner also create and configure
them, raising the built-in roles to revision 4. Nothing checks `agent.use` outside thread
recipients and cancelling a turn; see [turns](#turns) for how agents take work.

## Turns

`@amends/core/turn` holds agents' attempts on threads. A `Turn.Record` is one agent's attempt on
one thread: `queued` until execution takes it, `running`, `cancelling` once asked to stop, then
`completed`, `failed`, or `cancelled`, never reopening. An agent has at most one active turn per
thread, which the stores enforce. Its input is tracked by timeline position: after
`inputAfterSequence` is the attempt's to handle, and through `acceptedThroughSequence` it has
accepted; how far the harness has taken that input in is its agent's log's to say. It records where
its entries begin in its agent's log for the thread (`logAfter`) and the latest checkpoint there
when it was created (`historyFrom`), both fixed at creation since the log reads only forward from
a position, the turn it retries (`retryOf`), the model access and environment it ran with when
execution starts, the replies it published, and why it failed or was asked to stop. While a turn
works, its row changes only with its status and the input it accepts; its progress lives in the
log.

Agents handle their own notifications as people do theirs. `TurnAcceptance`, the `turn.accept`
background process, acts as each agent: its pending work notifications on a thread join the
active turn there, or start a new one, and the same commit settles them as `Acknowledged` with
outcome `Accepted` and the turn's ID. Work waits while a turn there is still stopping, while the
active turn belongs to a participation that ended, so an agent that left and came back is not
handed work by the turn being stopped as departed, and while the agent cannot open the thread.
A new turn's input starts where the agent's latest turn in the same participation stopped taking
input in, as that turn's entries say, so what a cancelled or
failed turn accepted but never took in is the next turn's to handle; its entries follow what the
agent's log holds when it is created, and its history starts from that log's latest checkpoint:
the latest turn's own, or the one that turn started from. It wakes on activity that requests an agent's
work and on turns ending. Each run reads every active agent's pending work a page at a time,
passing over work that must wait, and accepts work for at most a hundred threads before asking to
run again; a run that finds only waiting work ends idle, so it never runs again at once without
progress. A second process, `turn.stop-departed`, stops the turns of agents whose participation
ended: a queued one at once, a running one by asking. It wakes on participation and group
departures and checks each agent's own active turns, including agents no longer members.

Each agent has one log for each participation in a thread, apart from the journal, `TurnLog`,
and every entry names the turn that wrote it: its `Started` with the selection and the agent's
instructions it keeps, each `Attempt` at a harness session or a summary, the input execution
`Submitted` as a batch with the position it covers, each `Harness` event (a response block by
block, its finish, tool starts and results), each `Environment` event such as becoming ready,
`Interrupted` stops with their reason and problem, input `Requested` of a turn itself such as a
retry, the thread's `History` before the first turn, `Checkpoint`s that replace what came before
them, and its `Ended` with the outcome, the replies, and why it failed or was stopped
([core model](../../docs/core-model.md#agreed-an-agents-memory-in-a-thread-is-one-log-of-its-turns)).
Only one turn writes there at a time, so a turn's entries sit together after its `logAfter`, read
by `TurnLog.entriesOf`. `TurnLog.reader` is the one reading of a turn's entries, taking them as they
come, and `TurnLog.read` reads them at once: its harness events, how far input is taken in, its
transcript and the view it leaves, the replies it owes, input asked of it, the items its readers
see, what it started with, how it ended, its latest checkpoint's position, and its attempts since it
last got further (a response finished, a tool call completed, or a checkpoint), with the latest
interruption and whether the last attempt died without recording one, and how often its context
proved full since its last finished response, as its harness reported or its provider refused,
and whether a checkpoint is owed for it. `TurnLog.context` reads the
log for a turn from its latest checkpoint: earlier turns as the view each left, without reasoning,
followed by a note from `TurnLog.noteAuthor` when a turn that started failed or was stopped by
request, then the turn's own work. The log has begun once a turn recorded the thread's history,
started, or recorded a checkpoint; a turn that ended before it started does not begin it. `TurnExecution` is what a
host's runner drives, each step its own commit attributed to the turn's agent: `start` a queued
turn with its selection and the agent's instructions now, which for a participation's first turn
records the thread's history in the log first, record each `attempt`, a `checkpoint`, `submitted`
batches, whose first record stands and is what execution hands the harness, and what the
environment and harness `report`, where input the harness says it took in must be a batch as
recorded, and `close` it. Closing requires
all accepted input taken in and no work still waiting for the agent on the thread, both checked in
the closing commit; otherwise it reports `InputPending`. It then publishes every answer the turn
owes, in order, each as the agent's own message to the thread's current participants, verbatim,
naming the turn that posted it (`turnId` on the message):
each finished response with text and no tool calls that more input followed, and the last. It
checks the agent may still open and post in the thread, and records completion with the messages.
A turn can complete without a reply. `fail` and `stopped` end a turn and publish nothing. Every way
a turn ends, including a queued turn stopped by a reader or because its agent left, goes through
`TurnEnding`, which in the ending commit publishes the turn's fact, records `turn.ended` in its
thread's timeline, and appends `Ended` to its agent's log. `prepare` assembles what a run needs from
the stores: the agent's instructions and the model access and environment the turn started with
or, before it starts, the agent's current ones, the connection's settings and key, the history and
transcript read from the log, input asked of the turn and the thread's accepted input not yet taken
in, all of it however long the backlog, the turn's own entries, and its attempts since it last got
further. Before the first turn of a participation starts, its history is every thread message
before its input (the agent's own as responses), which starting records in the log in entries of a
bounded size. A message longer than 40,000 characters is given in pieces. `prepare` also gives the
waiting input piece by piece with where each came from, the size of the input asked of the turn,
and what a provider last measured since the latest checkpoint, so the runner, which knows the
model, can tell with `TurnLog.compaction` whether a checkpoint must come first: in tokens against a
budget, the newest exchanges within what it keeps, cut at an input or a response and never between
two pieces of one waiting message, with the turn's own input kept verbatim when the cut falls
inside its work, and everything kept without reasoning. The runner records it with a summary of
the rest before working; `checkpoint` records it in the log, from which the turn's and the next
turn's history start, and when the summary covered waiting input, the position it reaches, which
counts that input as taken in. It reports instead that the turn finished, is stopping, or can't run, as
when its connection has no key. `get` reads the turn, for a run to watch. `draft` shows the turn's
readers more of a response before it completes, as a `TurnDraft` signal.

`TurnApplication.watchLog` follows a turn's log for a reader who may read its thread, as a stream
of `Turn.LogMessage`s. It tails the agent's log with `Log.tail`, from the turn's `logAfter`, taking
the turn's entries into one `TurnLog.reader` until its `Ended` entry or another turn's, the reading
`log` returns: `Opened` carries the items as they stand, `Changed` the items each new batch adds or
changes, by index, and `Ended` follows the turn's end, which its log records in the commit that
ends it, after everything it wrote. It passes on the turn's `TurnDraft` signals as `Drafted`, first
what the response being written holds so far: a draft carries only what follows the text before
it, so `TurnDrafts` holds each turn's drafts in memory as they reach the process, forgetting a
turn's ten minutes after its last, and a reader who starts following mid-response begins with
them. The drafts subscription registers before the turn and its log are read, so nothing published
in between is missed. Each batch checks that the reader still may read the thread, and so does
each commit that changes the reader's groups or grants, or a role's permissions, which it follows
through `ChangeFeedSource` as the change feed does; its subscription registers before the turn is
read too. Drafts are not checked one by one: following ends once the commit that took the
reader's access is delivered, so a reader who lost it sees at most the drafts sent while that
delivery was on its way. A stream that cannot go on fails with `Turn.LogUnavailable`.

A turn's changes also show in its thread's timeline, recorded as thread activity in the commits
that make them (the `TurnActivity` kinds, which `TurnActivityRecorder` records): `turn.created` where the agent took on the work, or where a retry
asked again (naming the turn it retries), `turn.started`, `turn.stopping` once a working turn is
asked to stop or its agent stops taking part, and `turn.ended` with its outcome, the replies it
posted, and why it failed or was stopped. Each carries what its item shows, so `TurnTimeline`
resolves it without reading anything more. It informs no one and is not new activity; the replies
are. A client folds a turn's items into one row at its `turn.created` position.

The commit that creates or retries a turn asks `TurnDispatch` to run it, through a journal
reaction to `TurnFacts.Created` and `TurnFacts.Retried`, so the request commits or rolls back with
the turn. The gateway binds
`TurnDispatch` to its host's `WorkspaceTurns`; [execution](../execution/README.md) runs harnesses
and environments. [Message to reply](../../docs/agent-message-flow.md) follows the whole path,
from a person's message through the wake, acceptance, and dispatch to the reply.

`TurnApplication` lets a reader who may read a thread `get` and `listByThread` its turns, as
`Turn.View`s: the record, with whether the reader may stop it (`stoppable`) or retry it
(`retryable`) now. Every turn read requires what the thread's timeline does: the group's audience
and `thread.read` on the thread. A thread outside the reader's audience is `ThreadNotFound`, and
one they may not read is `Authorization.Denied`. `listActive` gives the workspace's active turns
in threads the reader may read, among at most `limit` active turns, and
`log` a turn with its log as its readers see it (`Turn.LogView`): each batch of input taken in,
each response's text from its text blocks completed so far, with the blocks it holds and whether
the turn owes it as a reply, and interruptions, with when each was recorded, never reasoning or a
harness's own data. When they may also direct
its agent (`agent.use`), `cancel` stops an active turn: a queued turn at once, a running one once
execution confirms it. `retry` runs a failed or stopped turn again as a new queued turn, recorded
as `TurnFacts.Retried`, for the same agent, participation, and input, continuing after the turn it
retries in the agent's log: its input starts after what that turn took in, its history from the
latest checkpoint there, with who asked recorded as its new input, and it runs with the agent's
current configuration. Only the agent's latest turn on
the thread can be retried, while no other is active and the agent still takes part there;
otherwise it is `NotRetryable` with the reason (`active`, `completed`, `superseded`, or
`departed`). A retry is created after the turn it retries, even on a clock that has not moved, and
takes its ID from the turn it retries, so repeating it returns the turn it created. Turn facts reach the thread's
readers through the change feed; the timeline shows an agent's reply as its message, and no turn
activity of its own yet.

## Read state

`@amends/core/attention` holds private read state: `ReadStateApplication.markThreadRead` and
`markGroupRead`, over the required `ReadStateStore` binding, which is kept outside the journal.
The thread and group projections keep each thread's and group's latest message from recorded
thread activity, through `ThreadStore.recordLatest` and `GroupStore.recordLatest`, and notifications from thread activity carry their thread and
sequence, so reading a thread settles exactly its notifications. See
[marking conversations read](../../docs/thread-workflows.md#marking-conversations-read).

## Identity and target boundaries

`Identity.Reference` identifies a Human, Agent, or Contact. `Identity.MemberReference`
is the Human/Agent subset used by members, actors, credential resolution, and the
gateway. External authors use `Performer.Reference.Identity` with a Contact;
`Performer.Reference.Member` always carries a member identity. Attribution does
not grant authority, and a contact identity does not select an external reply destination.

`Target.Reference` supports Workspace, Member, Group, and Thread. Group targets carry
`workspaceId` and `Group.Id`; thread targets carry `workspaceId` and `ThreadId.Id`, exported from
`@amends/core/thread`. Exact target scopes compare the workspace, kind, and ID; a workspace scope
covers targets in that workspace. Group and thread actions also require current group membership,
following the [thread access rule](../../docs/core-model.md#agreed-thread-access-combines-audience-and-action-permissions);
every thread belongs to one group.

## Threads

`@amends/core/thread` holds threads, participations, messages, and their timeline activity, with
four store contracts. Its operations are `ThreadApplication` (`startInGroup`, `startDirect`, `get`,
`listInGroup`, `listOpenings`, `readTimeline`, `listParticipants`), `ThreadMessageApplication.publish`, and
`ThreadParticipationApplication` (`follow`, `unfollow`). A participant is a member, a contact, or
triage: member participation references the exact group admission, while contacts and triage take
part without group access. A message author is a member or a contact.

Internal services carry the shared work inside the caller's commit and publication context, with
no action checks of their own; they are excluded from `Core.Operations`:

| Service                        | Role                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `ThreadStart`                  | The one start every workflow uses: creates the thread, admits its starters, records the first message |
| `ThreadMessagePublication`     | Publishes a message with its admissions, activity, and recipients                                     |
| `ThreadParticipationAdmission` | Finds eligible members and current participants, and admits new ones                                  |
| `ThreadParticipationDeparture` | Ends a participation with its activity when its member unfollows the thread                           |
| `ThreadActivityPublisher`      | Publishes one activity of any kind: position, admissions, the domain's step, and recording            |
| `ThreadActivityRecording`      | Assigns the next timeline position and records `ThreadActivityFacts.Recorded`                         |
| `ThreadAccess`                 | Checks current group access to a thread, shared by reads and writes                                   |
| `ThreadActivityReading`        | Resolves timeline subjects under access, for timeline pages and notification sources                  |
| `ThreadActivityResolvers`      | Routes each activity kind to the resolver its domain registers                                        |

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

A domain publishes activity through `ThreadActivityPublisher.publish`, in its operation's commit.
The publisher takes the thread's next position, failing with `PositionChanged` when an
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

Thread, group, notification, turn, workspace, authorization, attention, and signal services trust what storage returns: the adapters decode each record and scope it
to its workspace, and the storage conformance suites check that. So these services use stored
records as they come, without decoding or cross-checking them again, and a record core itself wrote
that is missing is a defect rather than a typed error. Storage failures still reach callers as they
are.

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
names and scopes, and application services enforce ownership and delegation rules.
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
`Delegation` still loads the roles that record it. Bundle revision 1 is the current bundles:
Member takes part in conversations and creates, renames, joins, and manages the groups it belongs
to; Administrator adds people management, invitations, role changes, and `group.moderate` for
public groups; Owner adds workspace rename and ownership transfer. No role reaches a group from
outside it, which group operations enforce by requiring membership as well as the grant. `AssignmentApplication` provides listing, assignment,
revocation, and atomic workspace-role replacement, and `permissions`: the declared workspace-target
permissions the acting member's current grants cover, which needs active membership only, so
clients can offer just the actions the member may take. `Delegation` supplies the shared
rules used by assignments, invitations, and member removal. Role definition editing
and custom roles remain separate work. See [workspace workflows](../../docs/workspace-workflows.md#initialization-and-permissions)
for the implemented bundles and current invitation restrictions.

`OwnershipApplication` coordinates ownership and assignments in one commit. It
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
`ChangeFeedApplication.watch(options?)`. The feed reads the workspace journal, so it
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
`Notification.generated` exactly as the projection stores it, so it equals what the inbox
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
`ThreadRead`, `GroupCaughtUp`, `NotificationsSeen`, or `TurnDraft`.
`Signal.reachOf` gives each its audience, as a fact declares one: typing and a turn's drafts reach
the thread's group with `thread.read` for the thread, and
the three read-state signals reach only the member whose private state changed, so their other
sessions stay current without the journal. `Signal.inChangeFeed` leaves a turn's drafts out of the
change feed: they reach only readers following the turn's log.

`Signals.Service` is the workspace's delivery, a required host binding: `publish` offers a signal
to the subscribers present at that moment, in every process over the same storage, and
`subscribe` returns those published from then until its scope closes. Delivery is best effort.
Publishing never fails the operation that publishes, and a subscriber that falls behind, or whose
process loses its connection to the others, misses signals rather than delaying anyone.

`SignalApplication.typing(threadId)` tells the thread's readers that the acting member is
composing there until `until`, six seconds later (`SignalApplication.typingFor`). It requires
current group access and `thread.publish`, as posting does, and returns `ThreadNotFound` for
missing and inaccessible threads alike. Repeats from the same member in the same thread within two
seconds are dropped by the process that receives them, so a client may call it on each keystroke;
clients hide their own member's typing. `ReadStateApplication` and
`NotificationApplication.acknowledge` publish the read-state signals after their writes.

## Background work

`@amends/core/background` holds work the domains do outside any request, within one workspace.
A domain defines a process beside its facts with `BackgroundProcess.make(name, { wakesOn, run })`
and registers it in `Core.processes`, as the turn domain registers `turn.accept`.

- `name` is dotted and owned by the domain, such as `notification.settle`.
- `run` finds what is outstanding from stored records, so a run after a restart is an ordinary
  run, handles a bounded batch in commits of its own, and returns an outcome: `Idle` when nothing
  remains, `Continue` when more is outstanding now, or `At` with when it is next due. A run can be
  interrupted and repeated, so each commit rechecks what it acts on and is safe to redo.
- `wakesOn` lists the facts whose publication asks for it to run, built with
  `BackgroundProcess.on(fact, when?)`, which can accept only some payloads.

A commit that publishes such a fact asks for the process to run through `BackgroundWakes.Service`,
once per process per commit, in that same commit: the request is stored with the commit and
discarded if it rolls back, and a request that cannot be stored fails the commit. This is a
journal [reaction](../../docs/journal.md#reactions), so neither replay nor a retried publication
that returns its original event asks again. `BackgroundWakes.Service` is a required host binding,
bound to the workspace, which delivers each request to whichever process runs the workspace's
background work.

`BackgroundRuns.Service` is how that process runs one: `run(name)` runs a registered process once,
attributed to it as a `System` performer named after it, and returns its outcome. An unregistered
name fails with `BackgroundRuns.Unknown`, a process's own failure with `BackgroundRuns.Failure`,
and two processes sharing a name stop the workspace's core from starting. It is part of `Core.layer`
but not of `Core.Operations`, since no actor runs it. The gateway runs it for hosts through
[`runBackground`](../gateway/README.md#background-work-on-effect-cluster).

## Module dependencies and exports

Models and ID modules are independent of application services, projections, and
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
import { Member, MemberApplication } from "@amends/core/workspace";
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
| `Interface`          | The contract implemented by a context service: `MemberApplication.Interface`, `MemberStore.Interface`.                                                                          |

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
[`KeyValueStore`](../../repos/effect/packages/effect/src/unstable/persistence/KeyValueStore.ts).

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

| Implementation            | Constructor                             | Layer provides                           |
| ------------------------- | --------------------------------------- | ---------------------------------------- |
| Transaction               | `Transaction.make()`                    | `Transaction.Service`                    |
| Log                       | `Log.make()`                            | `Log.Service` and `Transaction.Service`  |
| Journal                   | `Journal.make(options)`                 | `Journal.Service`                        |
| Change-feed follower      | `ChangeFeedSource.make(options?)`       | `ChangeFeedSource.Service`               |
| Permission catalog        | `PermissionCatalog.make(definitions)`   | `PermissionCatalog.Service`              |
| Grant resolver            | `GrantResolver.make()`                  | `GrantResolver.Service`                  |
| Authorization             | `Authorization.make()`                  | `Authorization.Service`                  |
| Member operations         | `MemberApplication.make()`              | `MemberApplication.Service`              |
| Thread operations         | `ThreadApplication.make()`              | `ThreadApplication.Service`              |
| Thread participation      | `ThreadParticipationApplication.make()` | `ThreadParticipationApplication.Service` |
| Human message publication | `ThreadMessageApplication.make()`       | `ThreadMessageApplication.Service`       |
| Notification reads        | `NotificationApplication.make()`        | `NotificationApplication.Service`        |
| Team creation and reads   | `GroupApplication.make()`               | `GroupApplication.Service`               |
| Group membership          | `GroupMembershipApplication.make()`     | `GroupMembershipApplication.Service`     |
| Group following           | `GroupFollowApplication.make()`         | `GroupFollowApplication.Service`         |
| Read state                | `ReadStateApplication.make()`           | `ReadStateApplication.Service`           |
| Group audience policy     | `GroupAudience.make()`                  | `GroupAudience.Service`                  |
| Assignment operations     | `AssignmentApplication.make()`          | `AssignmentApplication.Service`          |
| Delegation policy         | `Delegation.make()`                     | `Delegation.Service`                     |
| Invitation operations     | `InvitationApplication.make()`          | `InvitationApplication.Service`          |
| Ownership operations      | `OwnershipApplication.make()`           | `OwnershipApplication.Service`           |
| Change feed               | `ChangeFeedApplication.make()`          | `ChangeFeedApplication.Service`          |
| Typing signals            | `SignalApplication.make()`              | `SignalApplication.Service`              |

The store modules and `Checkpoint` declare contracts implemented by adapters.
`Signals.Service` is a host contract too, bound to one workspace like the stores.
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
requirements and `Operations` from the application services it exposes.

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
