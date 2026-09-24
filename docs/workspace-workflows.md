# Workspace workflows

Workspace creation, membership, invitations, access, and ownership transfer, as the HTTP API
exposes them. The [HTTP contract](../packages/api-http/README.md) lists the endpoints, and the
[local host guide](../hosts/local/README.md) covers server setup and development authentication.
The examples assume the local host on port 8787 with its development bearer identities.

## Workspaces and members

`POST /workspaces` requires a JSON body with a non-empty, trimmed `name`. It creates
a workspace owned by the caller and returns `id`, `name`, `createdBy`, and
`ownerMemberId`. Missing, blank, or untrimmed names return HTTP 400 without creating
a workspace. Names are display labels; IDs remain the stable routing identity.

```bash
curl -X POST -H 'Authorization: Bearer alice' -H 'content-type: application/json' \
  -d '{"name":"Design studio"}' http://127.0.0.1:8787/workspaces
```

Creation and invitation issuance accept an `Idempotency-Key` header. Send a new key, such as a
UUID, for each workspace or invitation and the same one on every retry: the retry returns what the
first attempt created, even if its answer was lost, and the same key with a different body returns
422 `Request.Reused`. A retried workspace creation keeps its ID, derived from the creator and key.

`GET /me/workspaces` lists the caller's memberships, including ended ones, with each
workspace's active member count, and the caller's pending invitations. This is host routing
across workspaces, not a core operation.

`GET /workspaces/:id/members` lists the memberships the caller may read: a
workspace-scoped `member.read` grant sees everyone, active and removed, and an
exact grant sees that member. `GET …/members/:memberId` reads one.

`DELETE …/members/:memberId` removes a member and returns the record with status `removed`.
It requires `member.remove` on that member, at workspace or member scope; `member.read` is not
required. Humans and agents follow the same rules. An authorized non-owner may remove their own
membership. Administrators can remove ordinary Viewer-only or unassigned members, but only the
owner can remove another administrator or a member with additional access. Ownership alone does
not authorize removal, and the current owner cannot be removed even by an otherwise authorized
member: transfer ownership first.

Removal also, in the same commit and without further grants:

- revokes every pending invitation for that human in this workspace, including expired ones
  still recorded as pending; accepted receipts and other people's invitations are kept;
- ends every active group admission of that workspace member, recording `workspace-removed`
  with the removal as its cause; see [group departures](group-workflows.md#workspace-member-removal).

A failure rolls all of it back. Repeating a removal returns `MemberApplication.AlreadyRemoved`
without recording anything; the caller must still be active and authorized. Missing members
return `MemberApplication.NotFound`, only after authorization.

The removed membership and its assignments remain historical records that authorized readers can
inspect. Active-membership checks deny its later operations, including calls with an actor resolved
before removal. An old accepted invitation cannot restore access: rejoining creates a fresh member
ID with the new invitation's role, and inherits no group admissions.

## Invitations

`POST /workspaces/:id/invitations` issues an invitation to an address with an
ISO expiry in the future and a required built-in role:

```bash
curl -X POST -H 'Authorization: Bearer alice' -H 'content-type: application/json' \
  -d '{"recipientId":"bob","expiresAt":"<expiry-ISO>","roleId":"builtin:viewer"}' \
  http://127.0.0.1:8787/workspaces/<workspace-id>/invitations
curl -X POST -H 'Authorization: Bearer bob' http://127.0.0.1:8787/workspaces/<workspace-id>/invitations/<invitation-id>/accept
```

The response carries the invitation ID under `details.id` and the selected role
under `details.roleId`. Expiry must follow issuance; acceptance at the exact
deadline fails. Invitations require a role and always assign it at workspace scope.

Issuance and revocation require `invitation.manage` and `assignment.manage` on the
workspace. The shared delegation policy allows the owner to select Viewer or
Administrator, and other authorized administrators to select Viewer. Owner cannot
be granted through an invitation. `GET …/invitations` requires `invitation.manage`.

Only the named authenticated human can accept. Acceptance rechecks the original
inviter's active membership, permissions, and current authority to delegate the
referenced role, then commits membership, a role assignment, and acceptance together.
The role's current stored permissions apply; they are not copied into direct grants.
Invitations use stable human IDs; email delivery is outside this workflow.

Already-active members cannot be invited or accept a second invitation. Multiple
pending invitations may exist, but only one can establish an active membership.
Repeating acceptance of the same accepted invitation returns its recorded member
without granting again, even after expiry or loss of inviter authority. If that
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

The owner can manage Viewer and Administrator access. Other holders of the management
permission can manage only Viewer-only or unassigned recipients. Direct grants and
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
the three built-in roles, and the creator's Owner assignment. A repeated initialization
returns `WorkspaceInitialization.AlreadyInitialized` without changing ownership or access.
Creation attribution is kept separately from current ownership.

Authorization resolves stored grants: roles confer permissions only through the bundles they
store, and ownership supplies no implicit bypass. Each permission declares the lowest built-in
role whose bundle includes it; Administrator includes the Viewer permissions, and Owner all of
them. Role IDs are `builtin:viewer`, `builtin:administrator`, and `builtin:owner`.

Bundles are recorded with the workspace at the current bundle revision, and authorization and
replay use what is recorded. A change to the declarations raises the revision; when a host loads a
workspace recorded at an earlier one, it records the new bundles as role facts attributed to the
`builtin-roles` system, which open change feeds deliver like any role change. A host never reverts
a later revision, so hosts on different versions during a deployment agree. If the upgrade cannot
run, such as while another host writes, the workspace serves its recorded roles and a later load
finishes it. A permission the code does not declare, retired or added by a newer host's bundles,
grants nothing, leaving its holders' other grants intact, and roles that record it can still be
listed, assigned, and offered in invitations.

| Permission                     | Lowest role   | Target    | Authorizes                                                                        |
| ------------------------------ | ------------- | --------- | --------------------------------------------------------------------------------- |
| `member.read`                  | Viewer        | Member    | Reading memberships                                                               |
| `member.remove`                | Administrator | Member    | Removing a member                                                                 |
| `invitation.manage`            | Administrator | Workspace | Listing invitations; with `assignment.manage`, issuing and revoking them          |
| `assignment.read`              | Viewer        | Member    | Reading a member's access                                                         |
| `assignment.manage`            | Administrator | Workspace | Adding, replacing, and revoking roles, within delegation limits                   |
| `workspace.transfer-ownership` | Owner         | Workspace | Transferring ownership                                                            |
| `group.create`                 | Administrator | Workspace | [Creating a private team group](group-workflows.md#creating-a-group)              |
| `group.read`                   | Viewer        | Group     | [Reading a group you belong to](group-workflows.md#reading-groups)                |
| `group.follow`                 | Viewer        | Group     | [Following a group](group-workflows.md#following-a-group) for oneself             |
| `group.membership.manage`      | Administrator | Group     | Adding and removing members, and management reads                                 |
| `thread.start`                 | Viewer        | Group     | [Starting a thread](thread-workflows.md#starting-a-conversation)                  |
| `thread.read`                  | Viewer        | Thread    | [Reading a thread](thread-workflows.md#reading-conversations) and marking it read |
| `thread.publish`               | Viewer        | Thread    | [Replying](thread-workflows.md#replying-to-a-conversation) and typing             |
| `thread.follow`                | Viewer        | Thread    | Following a thread for oneself                                                    |
| `agent.use`                    | Viewer        | Member    | Mentioning an agent, starting a direct group with it, or making it follow a group |

Group and thread permissions also need current membership in the group; see each guide.
