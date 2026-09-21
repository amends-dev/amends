# Group workflows

Core implements private team-group creation, member addition, removal, and self-leave over
SQLite and PostgreSQL. These operations are available through `GroupApplication.Service`
and `GroupMembershipApplication.Service` in a workspace context, including `Gateway.asMember`.
There is no group HTTP endpoint or web interface yet.
The [core model](core-model.md#agreed-groups-provide-a-shared-home-for-threads) describes the
broader design; DMs, public groups, and thread access remain future work.

## Permission and input

`GroupApplication.createPrivateTeam({ name, memberIds })` requires `group.create` on its
workspace. `GroupPermissions.Create` declares that permission. Its initial `administrator`
tier includes it in newly initialized Administrator and Owner bundles. Authorization checks
the member's current grants, not a role name. A custom role or direct grant can supply it;
an Owner or Administrator without it is denied. Existing stored roles are not automatically
updated when permission declarations change.

The name must be nonempty and trimmed. `memberIds` is an explicit list of distinct workspace
membership IDs, not human or agent identity IDs. Each must identify an active membership in
the same workspace. Both humans and agents are eligible. Adding an agent as a group member
does not invoke it or grant permission to use it for work.

The creator is included only when their membership ID appears in `memberIds`. An empty list
is valid; creator attribution does not establish a membership or special group ownership.
The creation permission covers the initial audience as part of this operation. Adding
members after creation uses a separate operation and permission.

## Adding a member

`GroupMembershipApplication.add({ groupId, memberId })` requires
`group.membership.manage` on the selected group. `GroupMembershipPermissions.Manage`
declares this permission, with an initial `administrator` tier for new built-in role
bundles. Any role or direct grant can supply it. An exact Group scope authorizes that
group only; a workspace scope covers groups in that workspace.

The caller needs active workspace membership and the management permission. They need
neither group membership nor a separate member-read permission. Group creation authority,
creator attribution, and belonging to the group do not grant management authority.
The group's creation workflow continues to require only `group.create` for its initial audience.

After authorization, the operation checks the group exists in the bound workspace and
`memberId` names an active human or agent workspace membership there. Missing and foreign
references produce the same not-found outcomes. It rejects an existing active admission
with `GroupMembershipApplication.AlreadyMember`, without publishing another fact.
The other public outcomes are `GroupNotFound`, `MemberNotFound`, and `InactiveMember`
in that namespace; the gateway preserves them.

A successful addition returns a fresh `GroupMembership.Record` and publishes the existing
`group.membership.added` fact with its own admission time and the current operation's
provenance. It preserves the group record and previous admissions. It neither invokes
an agent nor enrolls anyone in a thread. Repeating the request while the admission remains
active returns `AlreadyMember`; it does not create another admission or act as a request receipt.

Authorization, eligibility, the duplicate check, and publication share one commit and
honor staged changes in an outer transaction. Concurrent additions cannot create competing
active admissions: a later serialized request sees `AlreadyMember`, while storage contention
can return a conflict. The operation does not automatically retry the transaction.

## Removing a member or leaving

`GroupMembershipApplication.remove({ groupId, membershipId })` requires
`group.membership.manage` on that group. The caller need not belong to the group or hold
a separate read permission. `group.create`, creator attribution, and role names do not
authorize removal.

`GroupMembershipApplication.leave({ groupId, membershipId })` requires active workspace
membership and an admission belonging to the acting member. It needs no management or read
grant. Humans, agents, creators, and workspace owners follow the same rule; leaving a group
does not change workspace membership, ownership, or grants. The group may become empty.

Both operations target a specific admission ID and return its record with `status: "removed"`.
They preserve the original group, member, and admission time. Missing, foreign, and wrong-group
admission IDs return `GroupMembershipApplication.NotFound`. Self-leave also returns `NotFound`
for another member's admission, including one already ended. Managed removal checks group
existence after authorization and returns `GroupNotFound` when it is missing.

Repeating a departure of the same admission returns `AlreadyRemoved` without another fact.
Authorized addition after departure creates a fresh admission ID; neither an old removal nor
an old leave request can end it. Leaving does not grant authority to add oneself back.
The gateway preserves these public outcomes. Concurrent departures can produce only one
terminal change; the other operation sees `AlreadyRemoved` or a storage conflict.

Each departure publishes `group.membership.removed`, recording the admission, group, workspace
member, and reason (`removed`, `left`, or `workspace-removed`). The event's provenance records
who acted and when. The admission row retains its original fields with terminal status;
departure attribution and reason remain in the journal. Checks, publication, projection,
and checkpoint advancement share one commit and honor an enclosing transaction.

## Workspace-member removal

`MemberApplication.remove` ends all active group admissions for that exact workspace-member
ID in the same commit as workspace removal and pending human-invitation revocations.
The existing workspace-removal authority covers this cleanup; it requires no additional
group-management or invitation-management grants. Group departure facts use
`workspace-removed` and refer to the workspace-removal fact as their immediate cause.
Already ended admissions keep their original departure history, and other members and
workspaces are unchanged. Failure at any step rolls back the whole workflow.

Concurrent member addition and workspace removal use the same workspace transaction boundary.
An addition that commits first is included in cleanup; after removal, an addition is rejected
because its recipient is inactive. Storage contention can reject an attempt without applying it.
A later workspace readmission has a new member ID and inherits no prior group admissions.

## Atomic changes and recorded history

Authorization, input validation, membership checks, and publication run inside one journal
commit. An existing caller commit is honored, including its staged permission or membership
changes. Validation failures and later projection failures leave no partial group, admission,
journal entry, or checkpoint.

`group.created` records the group's ID, workspace, `Team` kind, `Private` visibility, name,
creator membership, and creation time. Each `group.membership.added` records a fresh admission
ID, group, workspace membership, admission time, and active status. Initial admissions refer
to the creation event as their cause and use the group's creation time. Later additions use
their own operation's provenance and admission time.

Group membership is distinct from workspace membership and thread participation. References
to workspace membership IDs prevent a later workspace readmission from silently inheriting
an old admission. Group readmission through `add` also uses a fresh admission ID.

Both projections preserve recorded IDs, timestamps, and attribution. Replay does not check
the original actor's current permissions or whether an originally admitted workspace member
is still active. Both adapters validate records before storage conversion and enforce one
active admission per group/workspace-member pair. Store reads are internal and honor the
current transaction; they are not authorized product read operations.

Creation, admission, and departure facts use their stable IDs as occurrence identities. Repeating those
facts with matching content reuses the original events. Calling `createPrivateTeam` again
generates new IDs and creates another group; the complete operation has no request-level
idempotency contract yet. An uncertain commit must be reconciled before another invocation.

## Integration and current limits

`@amends/core/group` exports the models, applications, facts, projections, permissions, and
store contracts. Core requires `GroupStore` and `GroupMembershipStore`; both adapters compose
them over the same workspace transaction. Authorization targets now include `Group`, and
both adapters preserve exact group scopes in grants. Target support alone does not implement
group reads or thread-audience authorization.

Private group, admission, and departure facts remain on the internal committed-event bus but are
withheld from the workspace-wide change feed. A commit containing only those facts emits
no public change; a mixed commit retains its other supported events in order. Group discovery
and live delivery will need their own audience-aware contract. Creation generates no
notifications because notifications originate from thread activity, which is not implemented.

DMs, public-group joining/discovery, thread creation, and group HTTP/UI workflows
remain separate implementation steps. See [known limitations](current-status.md).
Thread participation, notifications, and agent-turn cancellation are not implemented; this
membership lifecycle supplies the departure boundary those future workflows must honor.

Group creation introduced new storage baselines. Adding members reuses those tables and facts;
it adds `group.membership.manage` to newly initialized permission bundles. Existing stored
roles are not updated automatically. Development uses recreated databases after permission
changes; no migration or data reset is performed by this operation.
Departure reuses the existing admission status and tables and introduces no new permission.

## Verification

The group suites in both adapters cover custom-role and direct permission grants, permission
revocation, explicit human/agent audiences, invalid and foreign memberships, rollback after a
partial projection, outer transaction rollback, reopening, replay, and store constraints.
The membership suites also cover management scoped to one group, independence from creation
permission and group membership, duplicate requests, concurrent connections, current eligibility,
outer transaction changes, projection rollback, gateway error exposure, and later-admission replay.
Departure coverage includes grant-free self-leave, fresh readmission and stale requests,
workspace cleanup, causal attribution, rollback after partial cleanup, historical replay,
concurrent departure and admission/removal races, and conditional storage transitions.
Core tests cover schema boundaries, exact group scopes, and withholding private group facts
from the public change feed. Run `bun run check` and `bun run test` from the repository root.
