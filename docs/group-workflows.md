# Group workflows

Team groups: creating them, reading them, finding and joining public ones, managing their members,
and following them.
The operations are `GroupApplication`, `GroupMembershipApplication`, and `GroupFollowApplication`
in a workspace context, such as `Gateway.asMember`. The gateway preserves the outcomes named below
and maps malformed input to `Gateway.InvalidInput`. Direct groups (DMs and group DMs) start with
their first thread; see [starting a direct group](thread-workflows.md#starting-a-direct-group).
The [core model](core-model.md#agreed-groups-provide-a-shared-home-for-threads) describes the
broader design, and the [HTTP contract](../packages/api-http/README.md#conversations) exposes these
operations.

## Who may do what

A group belongs to its members. Workspace roles grant no authority over a group from outside it:
no grant, and neither administrators nor the owner, can see a private group or a direct group they
are not in, read it, rename it, add themselves or anyone else to it, or inspect its roster. To
anyone outside, such a group answers as missing. The built-in roles hold these group permissions:

| Action             | Private team group          | Public team group                           | Direct group |
| ------------------ | --------------------------- | ------------------------------------------- | ------------ |
| Create             | any member (`group.create`) | any member (`group.create`)                 | any member   |
| See that it exists | its members                 | everyone who may join (`group.join`)        | its members  |
| Read its threads   | its members                 | its members; join to read                   | its members  |
| Join               | no one; members add people  | anyone who may join                         | no one       |
| Add people         | its members                 | its members                                 | no one       |
| Rename             | its members                 | its members                                 | not named    |
| Remove others      | its members                 | its members who moderate (`group.moderate`) | no one       |
| Leave              | anyone in it                | anyone in it, except the general group      | cannot       |

Every built-in role holds `group.create`, `group.read`, `group.follow`, `group.rename`,
`group.membership.manage`, and `group.join`; Administrator and Owner also hold `group.moderate`.
An administrator moderates a public group from inside it, joining it first.

## The general group

Every workspace starts with a general group: a public team group named `general`, created with the
workspace under the fixed ID `general` (`Group.GeneralId`), holding the creator. Every member,
person or agent, joins it as they join the workspace, in the same commit: today that is each person
who accepts an invitation, since agents join through no workflow yet, and the workflow that adds
them must admit them too. Nobody leaves it or is removed from it: leaving it, or removing anyone
from it, is `GroupMembershipApplication.GeneralMembership`, whatever the actor's authority. Leaving
the workspace ends the admission, as it ends any other. It can be renamed, like any team group,
and groups are never deleted. A workspace created before general groups existed has none, and its
new members join nothing.

## Creating a group

`GroupApplication.createTeam({ name, memberIds, visibility? })` requires `group.create` on the
workspace. `visibility` is `Private` (the default) or `Public`; see
[public groups](#public-groups). It is chosen at creation and does not change. The name must be 1 to 80 characters without surrounding space, control characters, direction overrides or isolates, or invisible spaces; names recorded before
this rule stay as they are. `memberIds` is an explicit list of distinct
workspace membership IDs, each an active membership in the same workspace; humans and agents are
both eligible. Adding an agent does not invoke it or grant permission to use it.

The creator is admitted only when their membership ID is listed, and the list may be empty;
creator attribution establishes no membership or group ownership. The creation permission covers
the initial audience; later additions are the group's members' to make. The apps always list the
creator, and offer creation to members whose workspace permissions, read through
`AssignmentApplication.permissions`, include `group.create`, which every built-in role does.

## Renaming a group

`GroupApplication.rename({ groupId, name, expectedName })` requires `group.rename` on the group,
which every built-in role holds, and membership of the group. To anyone outside it, the group is
`GroupApplication.NotFound`, as a missing or foreign one is, and a direct group, named by its
members, is `GroupApplication.NotRenamable`. The name follows creation's rule, while `expectedName` may be any recorded name. Renaming
records `group.renamed` with the new name and returns the group; the same name again records
nothing. Otherwise `expectedName`, the name the renamer last saw, must still be the group's name:
one renamed meanwhile is `GroupApplication.Changed`, so a rename is never silently replaced, and
nothing is recorded. Members read
the new name through their groups list, and the change feed delivers the fact to the group's
readers. Each listed group says whether the reader may rename it (`renamable`), from the same grant
resolution as reading it.

## Public groups

A public team group can be found and joined by anyone in the workspace who holds `group.join` on
it, which every built-in role holds. Its threads still belong to its members alone:
joining is what grants access, under the same read rules as any group, and a non-member reads
nothing of its conversations.

`GroupApplication.listPublic({ limit, after? })` returns a page of `Group.PublicItem` values, in
group-ID order, for the public groups the caller may join: each group's record, how many active
members it has (`members`), and whether the caller is one (`joined`). It needs no `group.read` and
no admission, reads a fixed number of times per page, and keeps reading until the page is full when
grants skip groups. Private and direct groups are never listed.

`GroupMembershipApplication.join(groupId)` requires `group.join` on the group, then admits the
caller, recording `group.membership.added` attributed to them, like an addition. Private, direct,
and missing groups are `GroupMembershipApplication.GroupNotFound`, so joining discloses nothing
about them. Joining a group the caller already belongs to returns their admission and records
nothing. Leaving, removal, following, and renaming work as for any team group.

A public group's `group.created` fact reaches the whole workspace as well as its members, so a
list of public groups can take new ones live. Renames and membership changes reach members only,
so a non-member's list shows them when it next reads.

## Reading groups

Ordinary reads require active workspace membership, an active admission to the group, and
`group.read` on it. Neither a grant alone nor membership alone suffices: creator attribution,
workspace ownership, and management grants do not make the caller part of the audience.

| Operation                                                            | Result and authority                                                                                                                                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GroupApplication.listMine({ limit, after? })`                       | A page of `Group.ListItem` values for the caller's current readable groups, ordered by group ID, with latest activity, caught-up time, `newActivity`, `following`, and `pending`. Unreadable and unjoined groups are omitted. |
| `GroupApplication.get(groupId)`                                      | Group metadata, requiring audience membership and `group.read`.                                                                                                                                                               |
| `GroupMembershipApplication.listCurrent(groupId, { limit, after? })` | A page of current admissions under the same read policy, ordered by admission ID.                                                                                                                                             |

Group lists and rosters take an exclusive `after` ID cursor and a `limit`, and keep reading until
the page is full: groups outside the caller's `group.read` grants, and admissions whose workspace
member left, are skipped. A group has `newActivity` when its latest message came after the caller
last caught up with it through `ReadStateApplication.markGroupRead`, or after they joined when they
never have. `pending` counts the caller's pending notifications from the group's threads: the
activity addressed to them, as a sidebar badge shows it. Reading a thread settles its notifications
and so lowers the count. `manageable` holds for a team group where the caller has
`group.membership.manage`, from the same grant resolution, so clients offer adding people there;
`membersRemovable` holds where they may also remove others: a private group they may manage, or a
public one they moderate. Direct groups are never manageable. The change feed delivers new
notifications to their recipient, and
[signals](../packages/core/README.md#signals) carry the reader's read-state changes to their other
sessions, so a client can keep both current.

A roster returns `GroupMembership.Record` values: admission IDs, workspace-member references,
and admission times, for active admissions whose workspace member is still active. It needs no
`member.read` grant and returns no member profiles, identities, or ended admissions.

Missing, foreign, and outside-audience groups share `GroupApplication.NotFound` for `get`;
ordinary roster reads use `GroupMembershipApplication.GroupNotFound`. A current member without the
action grant receives `Authorization.Denied`. No read reaches a group from outside it. Storage and
consistency failures are not hidden as empty lists or
missing groups. Reads follow core's [read boundaries](../packages/core/README.md#read-and-write-boundaries).

## Adding a member

`GroupMembershipApplication.add({ groupId, memberId })` requires `group.membership.manage` on the
group, which every built-in role holds, and membership of the group: to anyone outside it, the
group is `GroupNotFound`. An exact Group scope authorizes that group only; a workspace scope covers
every group the caller belongs to. No member-read grant is needed, and group creation authority or
creator attribution grants no management authority.

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
on the group and membership of it; to anyone outside it, the group is `GroupNotFound`. Any member
may remove others from a private group. Removing someone else from a public group also requires
`group.moderate`, which administrators and the owner hold; removing oneself needs no more than
leaving does. `group.create`, creator attribution, and role names do not authorize removal.

`GroupMembershipApplication.leave({ groupId, membershipId })` requires active workspace membership
and an admission belonging to the acting member, with no management or read grant. Humans, agents,
creators, and workspace owners follow the same rule. Leaving does not change workspace membership,
ownership, or grants, and the group may become empty. A person who leaves or is removed no longer
waits on the group's notifications: their pending ones from it are settled as `access-lost`; see
[departure and pending input](thread-workflows.md#departure-and-pending-input).

Both address a specific admission and return it with `status: "removed"`, keeping its group,
member, and admission time. Missing, foreign, and wrong-group admission IDs return
`GroupMembershipApplication.NotFound`; leaving also returns `NotFound` for another member's
admission. Managed removal returns `GroupNotFound` for a missing group, or one the caller is not
in, after authorization.
Repeating a departure returns `AlreadyRemoved`. Adding the member again creates a fresh admission,
which no earlier removal or leave request can end. Leaving grants no authority to add oneself back.

Direct groups have fixed membership: adding to, removing from, or leaving one returns
`GroupMembershipApplication.FixedMembership`. Including someone else needs another direct group.
Everyone stays in the [general group](#the-general-group): leaving it, or removing anyone from
it, returns `GroupMembershipApplication.GeneralMembership`.

A departure records its reason, `removed`, `left`, or `workspace-removed`, as one fact however much
the member took part. It ends their follow of the group and their participation in all of its
threads together, without recording anything in the threads, and settles what they had pending
from it; see [departure and pending input](thread-workflows.md#departure-and-pending-input).

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
original, but calling `createTeam` again creates another group unless both calls pass the
same `{ requestKey }`: then the retry returns the first group, and the same key with a different
input returns `Request.Reused`; see [retrying safely](thread-workflows.md#retrying-safely).

Group, admission, and departure facts reach the group's members with `group.read` over the
[change feed](../packages/core/README.md#change-feed); admissions and departures also reach the
member concerned, and follows only the follower. Group creation generates no notifications.
