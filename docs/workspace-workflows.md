# Workspace workflows

Workspace creation, membership, invitations, access, and ownership transfer, as the HTTP API
exposes them. The [HTTP contract](../packages/http/README.md) lists the endpoints, and the
[local host guide](../hosts/local/README.md) covers server setup and development authentication.
The examples assume the local host on port 8787 started with `AMENDS_SIGN_IN=development`, whose
bearer tokens are human IDs.

## Workspaces and members

`POST /workspaces` requires a JSON body with a `name` of 1 to 80 characters without surrounding space, control characters, direction overrides or isolates, or invisible spaces. It creates
a workspace owned by the caller and returns `id`, `name`, `createdBy`, and
`ownerMemberId`. Missing, blank, untrimmed, long, or hidden-character names return HTTP 400 without creating
a workspace. Names are display labels; IDs remain the stable routing identity. The required
`memberName` says what people in the workspace call the creator; see
[member names](#member-names).

```bash
curl -X POST -H 'Authorization: Bearer alice' -H 'content-type: application/json' \
  -d '{"name":"Design studio","memberName":"Alice Liddell"}' http://127.0.0.1:8787/workspaces
```

Creation and invitation issuance accept an `Idempotency-Key` header. Send a new key, such as a
UUID, for each workspace or invitation and the same one on every retry: the retry returns what the
first attempt created, even if its answer was lost. The key alone names the request, so reusing it
returns what it created whatever the body. A retried creation keeps its ID, derived from the
requester and key.

`GET /me/workspaces` lists the caller's memberships, including ended ones, with each
workspace's active member count, and the caller's pending invitations. This is host routing
across workspaces, not a core operation.

`GET /workspaces/:id/members` lists the memberships the caller may read: a
workspace-scoped `member.read` grant sees everyone, active and removed, and an
exact grant sees that member. `GET …/members/:memberId` reads one.

`DELETE …/members/:memberId` removes a member and returns the record with status `removed`.
It requires `member.remove` on that member, at workspace or member scope; `member.read` is not
required. Humans and agents follow the same rules. An authorized non-owner may remove their own
membership. Administrators can remove ordinary Member-only or unassigned members, but only the
owner can remove another administrator or a member with additional access. Ownership alone does
not authorize removal, and the current owner cannot be removed even by an otherwise authorized
member: transfer ownership first.

Removal also, in the same commit and without further grants:

- revokes every pending invitation for that human in this workspace, including expired ones
  still recorded as pending; accepted receipts and other people's invitations are kept;
- ends every active group admission of that workspace member, recording `workspace-removed`
  with the removal as its cause; see [group departures](group-workflows.md#workspace-member-removal).

A failure rolls all of it back. Repeating a removal returns `MemberService.AlreadyRemoved`
without recording anything; the caller must still be active and authorized. Missing members
return `CoreError.NotFound`, only after authorization.

The removed membership and its assignments remain historical records that authorized readers can
inspect. Active-membership checks deny its later operations, including calls with an actor resolved
before removal. An old accepted invitation cannot restore access: rejoining creates a fresh member
ID with the new invitation's role, and inherits no group admissions.

### Member names

Each workspace member has a `name`: what people in that workspace call them. It belongs to
the membership, not the identity, so the same person can go by different names in different
workspaces, and a rejoined membership is named again. Names chosen now are 1 to 80 characters without surrounding space, control characters, direction overrides or isolates, or invisible spaces, since each
can make one name read as another; invalid names return HTTP 400. Names recorded before stay
readable. Joiners stay allowed, for emoji and scripts that need them.

A member names themselves when creating the workspace (`memberName`), when accepting an
invitation (`name`), or later with `PUT /workspaces/:id/members/me/name`:

```bash
curl -X PUT -H 'Authorization: Bearer alice' -H 'content-type: application/json' \
  -d '{"name":"Alice"}' http://127.0.0.1:8787/workspaces/<workspace-id>/members/me/name
```

Renaming needs no permission beyond an active membership and changes only the caller's own name;
it returns their member record. The same name again records nothing. Each name is recorded as a
`workspace.member.added` or `workspace.member.renamed` fact, so replay restores it.

## Invitations

`POST /workspaces/:id/invitations` issues an invitation to an email address with an
ISO expiry in the future and a required built-in role. The host resolves the address to its
account, creating one with a new human ID the first time the address comes up, and the invitation
names that human ID as its `recipientId`; the person signing in with the address later signs in as
that account. With the local host's development tokens, the recipient's token is that human ID:

```bash
curl -X POST -H 'Authorization: Bearer alice' -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","expiresAt":"<expiry-ISO>","roleId":"builtin:member"}' \
  http://127.0.0.1:8787/workspaces/<workspace-id>/invitations
curl -X POST -H 'Authorization: Bearer <recipient-id>' -H 'content-type: application/json' \
  -d '{"name":"Bob Chen"}' \
  http://127.0.0.1:8787/workspaces/<workspace-id>/invitations/<invitation-id>/accept
```

Acceptance takes the new member's `name`. `GET /workspaces/:id/accounts` returns the addresses
behind the workspace's human members and invitations to whoever may list invitations, which is
how settings show them; nobody else in the workspace sees an address.

The response carries the invitation ID under `details.id` and the selected role
under `details.roleId`. Expiry must follow issuance; acceptance at the exact
deadline fails. Invitations require a role and always assign it at workspace scope.

Issuance and revocation require `invitation.manage` and `assignment.manage` on the
workspace. The shared delegation policy allows the owner to select Member or
Administrator, and other authorized administrators to select Member. Owner cannot
be granted through an invitation. `GET …/invitations` requires `invitation.manage`.

Only the named authenticated human can accept. Acceptance rechecks the original
inviter's active membership, permissions, and current authority to delegate the
referenced role, then commits membership, a role assignment, acceptance, and the new member's
admission to the workspace's [general group](group-workflows.md#the-general-group) together.
The role's current stored permissions apply; they are not copied into direct grants.
Invitations record human IDs, and no email is sent: the recipient finds the invitation after
signing in with the address.

Already-active members cannot be invited or accept a second invitation. Multiple
pending invitations may exist, but only one can establish an active membership.
Repeating acceptance of the same accepted invitation returns its recorded member
without granting again, even after expiry or loss of inviter authority, and ignores a name it
brings. If that
membership was later removed, the receipt returns the removed record; it never
reactivates it.

`POST …/invitations/:invitationId/revoke` revokes a pending invitation.
Repeating revocation is harmless. Revocation cannot undo an accepted membership;
use member removal for that. Expiry is checked against the clock, so no
background task changes expired rows.

## Assignments and delegation

`GET /workspaces/:workspaceId/roles` lists the stored built-in roles with an
`assignable` flag for the current actor. It requires active membership.
`GET …/members/:memberId/assignments` requires `assignment.read` on that member
and returns active assignments, role choices, and `canManage`. Removed memberships
remain readable but cannot receive or change assignments.

All assignment mutations require `assignment.manage` on the workspace:

- `POST …/assignments` accepts `{ memberId, roleId }` and adds a workspace role.
  Repeating the same active assignment returns it without recording anything.
- `DELETE …/members/:memberId/assignments/:assignmentId` revokes one assignment.
  Repeating revocation is harmless after current authorization and recipient checks.
- `PUT …/assignments` accepts `{ memberId, roleId, expectedAssignmentIds }`. The IDs
  must match all current workspace-scoped role assignments; a stale form receives
  HTTP 409. Revoking previous roles and assigning the replacement share one commit.
  Direct grants and exact-target assignments are preserved and displayed separately.

The owner can manage Member and Administrator access. Other holders of the management
permission can manage only Member-only or unassigned recipients. Direct grants and
unfamiliar roles require the owner. The Owner assignment and owner membership are
protected from these mutations, including attempts by the owner; ownership transfer
has its own operation. Clients should reread access after a stale-change error.

## Ownership transfer

`GET /workspaces/:workspaceId/ownership` requires active membership and returns
the workspace, current owner membership, current Owner assignment ID, `canTransfer`,
and eligible candidates. Only the current owner holding `workspace.transfer-ownership`
receives candidates: other active human members in that workspace. Agents and
removed members cannot become owners.

`POST …/ownership` accepts `{ memberId, expectedOwnerAssignmentId }`. The latter
must match the Owner assignment returned by the ownership read. If ownership moves
away and later returns to the same person, a new assignment ID still invalidates
their old form. Stale authority returns HTTP 409; a caller who has lost permission
or current ownership receives HTTP 403. Missing recipients return 404; the current
owner, removed members, and agents are rejected as recipients with 409.

The operation checks both current ownership and the transfer permission. In one
commit it revokes both members' built-in workspace roles, assigns Administrator to the
previous owner and Owner to the recipient, and updates `ownerMemberId`. Direct grants,
resource-scoped assignments, the workspace's name, and `createdBy` are unchanged. Core
requires one matching active human Owner assignment before and after the change.

## Initialization and permissions

Creating a workspace records, in one commit, its initialization, the creator's membership,
the three built-in roles, the creator's Owner assignment, and its
[general group](group-workflows.md#the-general-group) with the creator in it. A repeated initialization
returns `WorkspaceInitialization.AlreadyInitialized` without changing ownership or access.
Creation attribution is kept separately from current ownership.

Authorization resolves stored grants: roles confer permissions only through the bundles they
store, and ownership supplies no implicit bypass. Each permission declares the lowest built-in
role whose bundle includes it; Administrator includes the Member permissions, and Owner all of
them. Role IDs are `builtin:member`, `builtin:administrator`, and `builtin:owner`. No role
reaches a private or direct group from outside it: administrators and the owner see and manage
only the groups they belong to; see [who may do what](group-workflows.md#who-may-do-what).

Bundles are recorded with the workspace at the current bundle revision, and authorization and
replay use what is recorded. A change to the declarations raises the revision; when a host loads a
workspace recorded at an earlier one, it records the new bundles as role facts attributed to the
`builtin-roles` system, which open change feeds deliver like any role change. A host never reverts
a later revision, so hosts on different versions during a deployment agree. If the upgrade cannot
run, such as while another host writes, the workspace serves its recorded roles and a later load
finishes it. A permission the code does not declare, retired or added by a newer host's bundles,
grants nothing, leaving its holders' other grants intact, and roles that record it can still be
listed, assigned, and offered in invitations.

| Permission                     | Lowest role   | Target    | Authorizes                                                                                                     |
| ------------------------------ | ------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `member.read`                  | Member        | Member    | Reading memberships                                                                                            |
| `member.remove`                | Administrator | Member    | Removing a member                                                                                              |
| `invitation.manage`            | Administrator | Workspace | Listing invitations; with `assignment.manage`, issuing and revoking them                                       |
| `assignment.read`              | Member        | Member    | Reading a member's access                                                                                      |
| `assignment.manage`            | Administrator | Workspace | Adding, replacing, and revoking roles, within delegation limits                                                |
| `workspace.rename`             | Owner         | Workspace | Renaming workspace metadata                                                                                    |
| `workspace.transfer-ownership` | Owner         | Workspace | Transferring ownership                                                                                         |
| `group.create`                 | Member        | Workspace | [Creating a team group](group-workflows.md#creating-a-group), private or public                                |
| `group.read`                   | Member        | Group     | [Reading a group you belong to](group-workflows.md#reading-groups)                                             |
| `group.follow`                 | Member        | Group     | [Following a group](group-workflows.md#following-a-group) for oneself                                          |
| `group.rename`                 | Member        | Group     | [Renaming a team group](group-workflows.md#renaming-a-group) you belong to                                     |
| `group.moderate`               | Administrator | Group     | Removing people from a public group you belong to                                                              |
| `group.membership.manage`      | Member        | Group     | Adding people to a group you belong to; removing them from a private one                                       |
| `group.join`                   | Member        | Group     | [Finding and joining public groups](group-workflows.md#public-groups)                                          |
| `thread.start`                 | Member        | Group     | [Starting a thread](thread-workflows.md#starting-a-conversation)                                               |
| `thread.read`                  | Member        | Thread    | [Reading a thread](thread-workflows.md#reading-conversations) and marking it read                              |
| `thread.rename`                | Member        | Thread    | [Renaming a thread](thread-workflows.md#renaming-a-thread) of a group you belong to                            |
| `thread.publish`               | Member        | Thread    | [Replying](thread-workflows.md#replying-to-a-conversation), typing, and editing or deleting one's own messages |
| `thread.moderate`              | Administrator | Group     | [Deleting others' messages](thread-workflows.md#editing-and-deleting-a-message) in a group you belong to       |
| `thread.follow`                | Member        | Thread    | Following a thread for oneself                                                                                 |
| `task.create`                  | Member        | Group     | [Creating a task](thread-workflows.md#tasks), with its thread or in a conversation of a group you belong to    |
| `task.update`                  | Member        | Thread    | [Changing a task](thread-workflows.md#tasks): its status, assignee, or priority                                |
| `channel.create`               | Administrator | Workspace | [Creating a channel](thread-workflows.md#channels) over a connection you may use, into a group you belong to   |
| `channel.read`                 | Member        | Channel   | [Reading a channel](thread-workflows.md#channels)                                                              |
| `channel.manage`               | Administrator | Channel   | [Redirecting or removing a channel](thread-workflows.md#channels)                                              |
| `agent.use`                    | Member        | Member    | Mentioning an agent, creating a direct group with it, or making it follow a group                              |

Group and thread permissions also need current membership in the group; see each guide.

## Settings and names

`GET /workspaces/:id/settings` exposes workspace metadata, rename/invitation flags,
and assignable roles. `GET …/member-management` returns readable members with
access summaries and server-computed removal flags. Denied access summaries are null. The
listing decides every member from one resolution of the reader's grants and the same delegation
rule (`Delegation.recipientDenial`) that role changes and removals enforce.

`PUT …/name` accepts `{ name, expectedName }`, requires `workspace.rename`, and
records `workspace.renamed` with the old and new name. A different current name
returns 409 `WorkspaceSettingsService.Changed`; retrying an already-applied name succeeds
without another fact. This compares names, not a version: a rename away and back
is not detected. Creation attribution and ownership remain unchanged. The built-in
Owner bundle includes rename permission. The directory reads the updated
name. The change feed delivers `workspace.renamed` to every member. See the
[Settings UI guide](workspace-settings.md) for connected behavior.
