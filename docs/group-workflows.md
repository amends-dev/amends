# Group workflows

Private team groups: creating them, reading them, managing their members, and following them.
The operations are `GroupApplication`, `GroupMembershipApplication`, and `GroupFollowApplication`
in a workspace context, such as `Gateway.asMember`. The gateway preserves the outcomes named below
and maps malformed input to `Gateway.InvalidInput`. Direct groups (DMs and group DMs) start with
their first thread; see [starting a direct group](thread-workflows.md#starting-a-direct-group).
The [core model](core-model.md#agreed-groups-provide-a-shared-home-for-threads) describes the
broader design, and the [HTTP contract](../packages/api-http/README.md#conversations) exposes these
operations, except the management reads `getForManagement` and `listCurrentForManagement`.

## Creating a group

`GroupApplication.createPrivateTeam({ name, memberIds })` requires `group.create` on the
workspace. The name must be nonempty and trimmed. `memberIds` is an explicit list of distinct
workspace membership IDs, each an active membership in the same workspace; humans and agents are
both eligible. Adding an agent does not invoke it or grant permission to use it.

The creator is admitted only when their membership ID is listed, and the list may be empty;
creator attribution establishes no membership or group ownership. The creation permission covers
the initial audience; later additions need their own permission. The apps always list the
creator, and offer creation only to members whose workspace permissions, read through
`AssignmentApplication.permissions`, include `group.create`.

## Renaming a group

`GroupApplication.rename({ groupId, name, expectedName })` requires `group.rename` on the group, in the
Administrator and Owner bundles since bundle revision 3; an exact Group scope covers that group
only. It needs no membership of the group. After that check, a missing or foreign group is
`GroupApplication.NotFound`, and a direct group, named by its members, is
`GroupApplication.NotRenamable`. The name follows creation's rule: nonempty and trimmed. Renaming
records `group.renamed` with the new name and returns the group; the same name again records
nothing. Otherwise `expectedName`, the name the renamer last saw, must still be the group's name:
one renamed meanwhile is `GroupApplication.Changed`, so a rename is never silently replaced, and
nothing is recorded. Members read
the new name through their groups list, and the change feed delivers the fact to the group's
readers. Each listed group says whether the reader may rename it (`renamable`), from the same grant
resolution as reading it.

## Reading groups

Ordinary reads require active workspace membership, an active admission to the group, and
`group.read` on it. Neither a grant alone nor membership alone suffices: creator attribution,
workspace ownership, and management grants do not make the caller part of the audience.

| Operation                                                                         | Result and authority                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GroupApplication.listMine({ limit, after? })`                                    | A page of `Group.ListItem` values for the caller's current readable groups, ordered by group ID, with latest activity, caught-up time, `newActivity`, `following`, and `pending`. Unreadable and unjoined groups are omitted. |
| `GroupApplication.get(groupId)`                                                   | Group metadata, requiring audience membership and `group.read`.                                                                                                                                                               |
| `GroupMembershipApplication.listCurrent(groupId, { limit, after? })`              | A page of current admissions under the same read policy, ordered by admission ID.                                                                                                                                             |
| `GroupApplication.getForManagement(groupId)`                                      | Metadata for a known group, requiring `group.membership.manage` on it.                                                                                                                                                        |
| `GroupMembershipApplication.listCurrentForManagement(groupId, { limit, after? })` | A page of the current roster for a known group under that management permission.                                                                                                                                              |

Group lists and rosters take an exclusive `after` ID cursor and a `limit`, and keep reading until
the page is full: groups outside the caller's `group.read` grants, and admissions whose workspace
member left, are skipped. A group has `newActivity` when its latest message came after the caller
last caught up with it through `ReadStateApplication.markGroupRead`, or after they joined when they
never have. `pending` counts the caller's pending notifications from the group's threads: the
activity addressed to them, as a sidebar badge shows it. Reading a thread settles its notifications
and so lowers the count. `manageable` holds for a team group where the caller has
`group.membership.manage`, from the same grant resolution, so clients offer adding and removing
members only there; direct groups are never manageable. The change feed delivers new
notifications to their recipient, and
[signals](../packages/core/README.md#signals) carry the reader's read-state changes to their other
sessions, so a client can keep both current.

Management reads require neither group membership nor `group.read`. They expose only the group
record and current admissions needed to manage it; they do not join the caller, grant conversation
access, or list private groups workspace-wide. Creation permission grants no management inspection.

A roster returns `GroupMembership.Record` values: admission IDs, workspace-member references,
and admission times, for active admissions whose workspace member is still active. It needs no
`member.read` grant and returns no member profiles, identities, or ended admissions.

Missing, foreign, and outside-audience groups share `GroupApplication.NotFound` for `get`;
ordinary roster reads use `GroupMembershipApplication.GroupNotFound`. A current member without the
action grant receives `Authorization.Denied`. Management reads check their grant before reporting
whether a known group exists. Storage and consistency failures are not hidden as empty lists or
missing groups. Reads follow core's [read boundaries](../packages/core/README.md#read-and-write-boundaries).

## Adding a member

`GroupMembershipApplication.add({ groupId, memberId })` requires `group.membership.manage` on the
group. An exact Group scope authorizes that group only; a workspace scope covers every group in it.
The caller needs neither group membership nor a member-read grant, and group creation authority,
creator attribution, or belonging to the group grants no management authority.

The group must exist in the workspace, and `memberId` must name an active human or agent
membership there; missing and foreign references share the not-found outcomes. An existing active
admission returns `GroupMembershipApplication.AlreadyMember` without recording anything. The other
outcomes are `GroupNotFound`, `MemberNotFound`, and `InactiveMember`.

A successful addition returns a fresh `GroupMembership.Record` with its own admission time. It
neither invokes an agent nor enrolls anyone in an existing thread. Concurrent additions cannot
create competing active admissions: the later one sees `AlreadyMember` or a storage conflict,
without an automatic retry.

## Removing a member or leaving

`GroupMembershipApplication.remove({ groupId, membershipId })` requires `group.membership.manage`
on the group. The caller need not belong to it; `group.create`, creator attribution, and role
names do not authorize removal.

`GroupMembershipApplication.leave({ groupId, membershipId })` requires active workspace membership
and an admission belonging to the acting member, with no management or read grant. Humans, agents,
creators, and workspace owners follow the same rule. Leaving does not change workspace membership,
ownership, or grants, and the group may become empty.

Both address a specific admission and return it with `status: "removed"`, keeping its group,
member, and admission time. Missing, foreign, and wrong-group admission IDs return
`GroupMembershipApplication.NotFound`; leaving also returns `NotFound` for another member's
admission. Managed removal returns `GroupNotFound` for a missing group, after authorization.
Repeating a departure returns `AlreadyRemoved`. Adding the member again creates a fresh admission,
which no earlier removal or leave request can end. Leaving grants no authority to add oneself back.

Direct groups have fixed membership: adding to, removing from, or leaving one returns
`GroupMembershipApplication.FixedMembership`. Including someone else needs another direct group.

A departure records its reason, `removed`, `left`, or `workspace-removed`, and ends the member's
participation in the group's threads, discarding their pending agent input; see
[departure and pending input](thread-workflows.md#departure-and-pending-input).

## Workspace-member removal

`MemberApplication.remove` ends all active group admissions of that workspace member in the same
commit as the workspace removal and its invitation revocations, under the removal's authority
alone. Each departure records `workspace-removed` and refers to the workspace removal as its
cause. Ended admissions keep their history. An addition committed before the removal is included
in its cleanup; one after it is rejected because the member is inactive. Rejoining the workspace
creates a new member ID with no group admissions.

## Following a group

`GroupFollowApplication.follow({ groupId, memberId })` makes a team-group member follow the group:
each thread started there afterwards admits them from its first message, so the thread's
unmentioned activity notifies them. Existing threads are not joined. `unfollow` with the same input
stops joining future threads and leaves current thread participation unchanged. Both return no
value, and repeating either records nothing.

The actor must be a current member of the group; otherwise, as for a missing group, the result is
`GroupFollowApplication.GroupNotFound`. Members follow for themselves under `group.follow`, and
unfollowing oneself needs no grant. Another member can be made to follow or unfollow only when it
is an agent in the group and the actor holds `agent.use` for it: a person returns `AgentRequired`,
and a member outside the group or inactive returns `MemberUnavailable`. Posting in the group then
reaches the agent without the poster's `agent.use`, as the [attention
model](core-model.md#agreed-attention-is-directed-followed-or-ambient) agrees. Direct groups return
`NotFollowable`: all their members already take part in every thread.

A follow belongs to the member's admission: leaving the group or the workspace ends it, so
rejoining starts with no follow.

## Recorded history

Group creation, admissions, departures, and follows are journal facts, recorded with their
operation's checks in one commit; a failure leaves nothing behind. Each admission has its own ID,
so readmission never revives an old one, and replay applies the recorded history without
rechecking anyone's current permissions or membership. Recording the same fact again reuses the
original, but calling `createPrivateTeam` again creates another group unless both calls pass the
same `{ requestKey }`: then the retry returns the first group, and the same key with a different
input returns `Request.Reused`; see [retrying safely](thread-workflows.md#retrying-safely).

Group, admission, and departure facts reach the group's members with `group.read` over the
[change feed](../packages/core/README.md#change-feed); admissions and departures also reach the
member concerned, and follows only the follower. Group creation generates no notifications.
