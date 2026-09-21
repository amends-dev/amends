# Thread workflows

Core and both storage adapters implement starting a thread with a human-authored text
message in an existing private team group. Call `ThreadApplication.startInGroup` through
`Gateway.asMember` or a trusted workspace context. Thread reads, replies, HTTP/UI, DMs,
standalone threads, attachments, and agent execution remain separate implementation steps.

## Starting a conversation

```ts
import { Group } from "@amends/core/group";
import { ThreadApplication } from "@amends/core/thread";
import { Effect } from "effect";

const start = (groupId: Group.Id) =>
  Effect.gen(function* () {
    const threads = yield* ThreadApplication.Service;
    return yield* threads.startInGroup({
      groupId,
      text: "Here's the proposal",
      mentions: [],
    });
  });
```

The result contains `thread`, `message`, and `activity`. Internal participation identity snapshots
are not returned; participant browsing will require an authorized thread read operation. The operation accepts
non-whitespace text and preserves it verbatim, including indentation and newlines. `mentions`
is an explicit array of distinct workspace-member IDs. An empty array means broadcast;
text such as `@Reviewer` does not itself create structured addressing.

Authorization and validation run in the same journal commit as creation and publication:

- The caller must have active workspace and group membership and `thread.start` on that Group.
- Each selected agent requires `agent.use` on that agent's workspace-member target, whether
  selected through broadcast or an explicit mention. Narrowed messages need no authority over
  unselected agents. Missing authority rejects the whole operation; recipients are not silently dropped.
- Mentioned members must currently belong to this group and have active workspace membership.
  A mention cannot admit an outsider to the group. Missing, foreign, inactive, and outside-group
  mention targets return `ThreadApplication.ParticipantUnavailable`.
- This first publication workflow accepts human authors. An agent caller receives
  `ThreadApplication.HumanAuthorRequired`; assistant publication from a producing turn is future work.

`ThreadPermissions.Start` and `AgentPermissions.Use` declare these permissions. Both have a
Viewer default tier, so newly initialized Viewer, Administrator, and Owner bundles include them.
Stored grants govern authorization; role names confer no authority. Existing role records are
not updated automatically. Starting needs no additional `group.read`, `group.create`, or
membership-management grant. Missing and inaccessible groups share `ThreadApplication.GroupNotFound`.
The gateway preserves these outcomes and maps malformed input to `Gateway.InvalidInput`.

## Initial participation and recipient selection

| Opening message      | Initial participants                                              | Notification recipients               |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| No explicit mentions | All current active group members, including the author and agents | All those participants                |
| Explicit mentions    | The author plus the mentioned eligible members                    | The explicitly mentioned participants |

An author mentioned explicitly appears only once. There is no implicit sender exclusion:
broadcast includes the author; a narrowed message not mentioning its author does not notify them.
Participation and notification selection are separate recorded decisions. Other group members
remain in the inherited access audience when mentions narrow participation, but thread read
operations are not implemented yet.

A later group addition does not enroll that member in existing threads or create retroactive
notifications. Future unmentioned replies will address that thread's current participants,
without enrolling the whole group again. Following, replies, and later mentions are future workflows.

Broadcast agent notifications represent input for recipient evaluation. The agreed design allows
an agent to ask a question, perform work, reply, or finish silently after evaluating relevance.
An explicit mention makes the request direct; it does not require a meaningless visible response.
Ordinary assistant replies remain informational to other agents; explicit work requests can
ask them to act. These handling rules remain design intent: this slice creates durable pending
notifications and launches no turns, models, harnesses, or background recipient processors.

## Recorded changes and replay

The workflow records, in order, a thread, its initial participations, a user message, and one
`MessagePublished` activity at sequence 1. The timeline has an increasing sequence per thread;
storage rejects gaps, duplicate positions, and activities whose message belongs to another thread.
A timeline record references the message without duplicating its text. Internal stores preserve
workspace-qualified relationships and immutable IDs. The PostgreSQL adapter stores record fields
in relational columns, including a text array for mention IDs; SQLite uses validated JSON records
with indexed identity and relationship columns.

`ThreadCreation` is an internal service for authorized workflows to reuse. It validates domain
references and requires an existing transaction and publication context. It is excluded from
`Core.Operations` and performs no additional member-level permission check. There is no public
empty-thread operation. The complete start workflow owns participation and initial publication.

Thread creation, participation admissions, message publication, timeline activity, notification
inserts, and checkpoints commit together. Any failure rolls back all of them. An enclosing caller
transaction is honored, including staged permission or admission changes. Concurrent starts and
departures share the workspace transaction boundary. Storage contention can reject an attempt;
operations do not retry automatically.

Creation provides the causal parent of participation and message facts; the message fact causes
its timeline activity. Activity facts record the chosen participation IDs and recipient identities.
Notification generation uses that recorded selection, the activity event as its source, and a
stable ID derived from the source event and participation. It does not recompute recipients from
today's group or current grants. Replay preserves timestamps, provenance, sequence, recipients,
and subsequent departure outcomes even after permissions and membership change.

Facts use their stable record IDs as occurrence identities. Matching republication reuses the
recorded occurrence, but calling `startInGroup` again generates a new thread. There is no
request-level idempotency receipt yet; reconcile an uncertain commit before invoking it again.

## Departure and pending input

Each participation references the exact group admission that established it. A recorded group
departure ends participations tied to that admission, preserving their original identity and
joining position. Workspace-member removal already records departures of all active group
admissions, so the same cleanup applies. Rejoining uses a fresh admission and does not reactivate
old participation or old work.

Pending agent notifications from the ended participation become
`Discarded { reason: "participation-ended" }`. Their source, recipient, participation ID, and
recorded time remain intact. Human notification history is retained. Cleanup shares the
removal transaction; failure restores membership, participation, and pending input together.
Actual turn cancellation will be added with turn execution; there are no running turns yet.

## Privacy and current limits

Thread creation, participation, message, and activity facts are withheld from the workspace-wide
change feed, including text, recipient selection, and provenance. Mixed commits retain only their
other supported public events. A thread-only commit therefore provides no inbox refresh signal
through that feed. Audience-aware thread subscriptions and live notification delivery remain work.
Notifications expose source references, not continuing authority to read the source conversation.

The public surface currently contains only `startInGroup`. Internal store reads are not authorized
thread APIs. Thread browsing and source resolution, replies, participation management, general
acknowledgment, silent agent completion, turn execution, task activity, DMs, and standalone threads
remain unimplemented. The [core model](core-model.md) describes the broader intent.

This change updates both development schema baselines. Recreate disposable development databases
before using it; no upgrade chain or automatic data reset is provided. New permission bundles also
apply only to fresh workspace initialization unless stored roles are explicitly updated.

## Verification

The mirrored adapter suites cover broadcast and mention routing, agent-use authority, custom
scopes, inaccessible references, validation without partial writes, notification and checkpoint
failures, outer transactions, concurrent departure, readmission, reopening, replay, and direct
store constraints. Core tests verify withholding private thread facts from the public change feed.
Run `bun run check` and `bun run test` from the repository root.
