# Workspace workflows

This guide describes the implemented workspace, membership, and invitation
workflows. For server setup and development authentication, see the
[local host guide](../hosts/local/README.md). The
[HTTP contract](../packages/api-http/README.md) defines the available endpoints;
[core design](./core-model.md) records the broader model and planned work.
See [known limitations](./current-status.md) for storage outcomes and live-update
constraints that affect these workflows.

The examples assume the local host is running on port 8787 and use its
development bearer identities.

## Workspaces and members

`POST /workspaces` requires a JSON body with a non-empty, trimmed `name`. It creates
a workspace owned by the caller and returns `id`, `name`, `createdBy`, and
`ownerMemberId`. Missing, blank, or untrimmed names return HTTP 400 without creating
a workspace. Names are display labels; IDs remain the stable routing identity.

```bash
curl -X POST -H 'Authorization: Bearer alice' -H 'content-type: application/json' \
  -d '{"name":"Design studio"}' http://127.0.0.1:8787/workspaces
```

The web picker opens a name form when you click **New workspace**. Submitting
**Create workspace** trims the name and opens the new workspace after creation.
Cancelling creates nothing. The name appears in the picker, sidebar, and settings.

`GET /me/workspaces` lists the caller's
memberships, including ended ones, with each workspace's active member count,
and the caller's pending invitations. It reads the host's projection tables
across every workspace; this is host routing, not a core operation.

`GET /workspaces/:id/members` lists the memberships the caller may read: a
workspace-scoped `member.read` grant sees everyone, active and removed, and an
exact grant sees that member. `GET …/members/:memberId` reads one.

`DELETE …/members/:memberId` removes a member and returns the record with
status `removed`. Core requires `member.remove` on that member; `member.read`
is not required. Both workspace and exact-member grants work. Humans and agents
follow the same rules. An authorized non-owner may remove their own membership.
Administrators can remove ordinary Viewer-only or unassigned members, but only the
owner can remove another administrator or a member with additional access. An authorized
non-owner can still leave. Ownership alone does not authorize removal, and the current owner cannot be
removed even by an otherwise authorized member. Use the ownership transfer
workflow before removing the former owner.

Removal also revokes every pending invitation for that human in this workspace,
including expired invitations still recorded as pending. This is part of removal
and requires no additional `invitation.manage` grant. Accepted receipts and
invitations for other people or workspaces are preserved.

Authorization, the ownership check, the removal and invitation revocation facts,
projections, and checkpoints share one transaction. A failure rolls them back
together. Repeating a removal returns `MemberApplication.AlreadyRemoved` without
publishing another fact; the caller must still be active and authorized.
Missing members return `MemberApplication.NotFound` only after authorization.

The membership and its assignments remain historical records. Active-membership
checks deny subsequent operations, including calls with an actor resolved before
removal. Authorized readers can still inspect the removed record. Other workspace
memberships are unaffected. An old accepted invitation cannot restore access;
rejoining creates a fresh member ID with the new invitation's role.

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
There is no direct-grant or optional-role invitation path.

Issuance and revocation require `invitation.manage` and `assignment.manage` on the
workspace. The shared delegation policy allows the owner to select Viewer or
Administrator, and other authorized administrators to select Viewer. Owner cannot
be granted through an invitation. `GET …/invitations` requires `invitation.manage`.

Only the named authenticated human can accept. Acceptance rechecks the original
inviter's active membership, permissions, and current authority to delegate the
referenced role. It commits membership, a role assignment, and acceptance together.
The role's current stored permissions apply; they are not copied into direct grants.
Invitations use stable human IDs; email delivery and unregistered email addresses
remain outside this local workflow.

Already-active members cannot be invited or accept a second invitation. Multiple
pending invitations may exist, but only one can establish an active membership.
Repeating acceptance of the same accepted invitation returns its recorded member
without granting again, even after expiry or loss of inviter authority. If that
membership was later removed, the receipt returns the removed record; it never
reactivates it. Rejoining requires a fresh invitation and membership.

`POST …/invitations/:invitationId/revoke` revokes a pending invitation.
Repeating revocation is harmless. Revocation cannot undo an accepted membership;
use member removal for that. Expiry is checked against the clock, so no
background task is required to change expired rows.

## Assignments and delegation

`GET /workspaces/:workspaceId/roles` lists the stored built-in roles with an
`assignable` flag for the current actor. It requires active membership.
`GET …/members/:memberId/assignments` requires `assignment.read` on that member
and returns active assignments, role choices, and `canManage`. Removed memberships
remain readable but cannot receive or change assignments.

All assignment mutations require `assignment.manage` on the workspace:

- `POST …/assignments` accepts `{ memberId, roleId }` and adds a workspace role.
  Repeating the same active assignment returns it without another journal fact.
- `DELETE …/members/:memberId/assignments/:assignmentId` revokes one assignment.
  Repeating revocation is harmless after current authorization and recipient checks.
- `PUT …/assignments` accepts `{ memberId, roleId, expectedAssignmentIds }`. The IDs
  must match all current workspace-scoped role assignments. A stale form receives
  HTTP 409. Revoking previous roles and assigning the replacement share one commit.
  Direct grants and exact-target assignments are preserved and displayed separately.

The owner can manage Viewer and Administrator access. Other holders of management
permission can manage only Viewer-only or unassigned recipients. Direct grants and
unfamiliar roles require the owner. The Owner assignment and owner membership are
protected from these mutations, including attempts by the owner. Ownership transfer
has its own operation. Custom-role management remains unimplemented.

The web member details show actual assignments with revoke and change-role controls
when permitted. Refresh access after a stale-change error before submitting again.
Invitation forms offer role choices from the same backend policy.

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
journal commit it revokes both members' built-in workspace roles, assigns
Administrator to the previous owner and Owner to the recipient, and updates
`ownerMemberId`. Direct grants and assignments scoped to specific resources remain
unchanged. The workspace's name and `createdBy` remain unchanged. Core requires one
matching active human Owner assignment before and after the change. Failures roll
back metadata, assignments, facts, and checkpoints together.

Workspace settings provide candidate selection and a review dialog naming the new
owner and explaining the previous owner's Administrator access. Success refreshes
ownership, the workspace directory, and role choices. After a stale-form error,
cancel the dialog and refresh ownership before reviewing another transfer.

The ownership fact and metadata projection remain at version 1. Storage updates
the existing owner field, so this workflow needs no database schema migration.
Existing role bundles are not regenerated; use a fresh development workspace to
receive the new owner-tier permission. During development, recreate the database
when permission declarations change rather than synchronizing stored role bundles.

## Initialization

The host allocates the workspace ID and binds its storage views. Core initialization
then publishes six facts in one journal commit: workspace initialization, creator
membership, three built-in roles, and one Owner role assignment. Projections persist
the records and their checkpoints in that same transaction.

The creator is a human and is recorded as the initial owner. Creation attribution
is retained separately from current ownership. The creator receives Owner at workspace
scope. Authorization resolves that assignment's stored role permissions; ownership
supplies no implicit permission bypass.

Each registered permission declares a required `builtinTier`. Viewer includes
`viewer` permissions, Administrator also includes `administrator` permissions,
and Owner includes all three tiers, including `owner`. The current bundles are:

| Role          | Stored permissions                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Viewer        | `member.read`, `assignment.read`                                                                                            |
| Administrator | `member.read`, `member.remove`, `invitation.manage`, `assignment.read`, `assignment.manage`                                 |
| Owner         | `member.read`, `member.remove`, `invitation.manage`, `assignment.read`, `assignment.manage`, `workspace.transfer-ownership` |

Ownership transfer is the first owner-tier permission. Delegation separately reserves
administrator management for the current owner.

Role IDs are stable within each workspace: `builtin:viewer`, `builtin:administrator`,
and `builtin:owner`. These identities are reserved for built-in definitions. Tiers
construct permission bundles; they do not authorize requests or confer delegation
authority. The bundles are saved through role facts, so changing declarations affects
new workspaces only. Existing workspaces retain their recorded roles or direct grants;
development uses fresh data when definitions change. Replay never regenerates roles
from current declarations.

Initialization requires an absent workspace record. A repeated call returns
`WorkspaceInitialization.AlreadyInitialized` without replacing ownership or
granting more access. A failed projection or checkpoint rolls back the entire
initialization. Concurrent initializers serialize or receive a storage conflict.

## Development data

The required-role invitation schema replaces the earlier direct-grant model. This
development change requires fresh SQLite and PostgreSQL development data. It does
not translate old invitation grants into roles or reset databases on startup.
Fact and projection versions remain at 1 during development; versioned compatibility
will be introduced when production data needs to be preserved.
Permission additions and tier changes also use fresh development data. Recreate the
development database and initialize workspaces from the current catalog; a workflow
to synchronize existing role bundles is not required in this phase.
