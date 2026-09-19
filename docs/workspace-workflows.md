# Workspace workflows

This guide describes the implemented workspace, membership, and invitation
workflows. For server setup and development authentication, see the
[local host guide](../hosts/local/README.md). The
[HTTP contract](../packages/api-http/README.md) defines the available endpoints;
[core design](./core-model.md) records the broader model and planned work.

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
Ownership alone does not authorize removal, and the current owner cannot be
removed even by an otherwise authorized member. Ownership transfer is a
separate, unimplemented workflow.

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
rejoining creates a fresh member ID with only the new invitation's grants.

## Invitations

`POST /workspaces/:id/invitations` issues an invitation to an address with an
ISO expiry in the future and a list of grants with workspace scope:

```bash
curl -X POST -H 'Authorization: Bearer alice' -H 'content-type: application/json' \
  -d '{"recipientId":"bob","expiresAt":"<expiry-ISO>","grants":[{"permission":"member.read","scope":{"_tag":"Workspace","workspaceId":"<workspace-id>"}}]}' \
  http://127.0.0.1:8787/workspaces/<workspace-id>/invitations
curl -X POST -H 'Authorization: Bearer bob' http://127.0.0.1:8787/workspaces/<workspace-id>/invitations/<invitation-id>/accept
```

The response carries the invitation ID under `details.id`. The core API also
accepts exact-target scopes. Only registered permissions with compatible scopes
in this workspace are accepted; anything else is `Gateway.InvalidInput`. Expiry
is required and must follow issuance; acceptance at the exact deadline fails.
`GET …/invitations` lists every invitation in the workspace for holders of
`invitation.manage`.

The current active owner must hold `invitation.manage` on the workspace to issue
or revoke invitations. Ownership separately authorizes selecting initial grants;
holding `invitation.manage` alone does not let another member grant access. This
first policy lets the owner select valid direct grants independently of which
permissions they personally hold. Role assignments through invitations remain
later work.

Only the named authenticated human can accept. Acceptance rechecks that the
original inviter is still the active owner and still has invitation permission,
then creates the membership and exact stored grants and consumes the invitation
in one commit. The recipient does not need an existing workspace actor.
Invitations use stable human IDs; email delivery and inviting an unregistered
email address are outside this local workflow.

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

| Role          | Stored permissions                                  |
| ------------- | --------------------------------------------------- |
| Viewer        | `member.read`                                       |
| Administrator | `member.read`, `member.remove`, `invitation.manage` |
| Owner         | `member.read`, `member.remove`, `invitation.manage` |

Administrator and Owner currently contain the same permission names because no
owner-tier actions have been implemented. Invitation issuance and revocation still
require current ownership in addition to `invitation.manage`. Role assignment APIs,
role-based invitations, delegated administration, and ownership transfer remain future work.

Role IDs are stable within each workspace: `builtin:viewer`, `builtin:administrator`,
and `builtin:owner`. These identities are reserved for built-in definitions. Tiers
construct permission bundles; they do not authorize requests or confer delegation
authority. The bundles are saved through role facts, so changing declarations affects
new workspaces only. Existing workspaces retain their recorded roles or direct grants;
updating them requires an explicit recorded policy change. Replay never regenerates
roles from current declarations.

Initialization requires an absent workspace record. A repeated call returns
`WorkspaceInitialization.AlreadyInitialized` without replacing ownership or
granting more access. A failed projection or checkpoint rolls back the entire
initialization. Concurrent initializers serialize or receive a storage conflict.
