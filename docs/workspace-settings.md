# Workspace settings

Both apps own `/workspaces/:id/settings/{workspace,members}`, the two sections the rail's Settings
lists in its sidebar, each its own page; see the [workspace shell](workspace-shell.md). The
Settings entry redirects to Workspace; `?member=:memberId` opens a member beside Members. Sidebar
items and member rows are links, so browser and hash history work. The screens follow the Lunacy
"Workspace settings" mocks, with each section's page in one column.

- **Workspace:** rename, then details: the workspace ID with Copy ID, and who created it; then the
  current owner and ownership transfer. The three roles are Member, Administrator, and Owner. Transfer
  makes the former owner an Administrator; ordinary role editing never offers Owner.
- **Members:** the roster with search and an Active/Removed filter, each member's workspace role
  and status, then pending invitations. Pending invitations have their own count and
  become members only once accepted. A member opens in the
  side panel with their role, their access, and removal. Changing the workspace role keeps any
  separate assignments. Removed members rejoin through a new invitation and a new membership.
- **Invitations** are modals reached from Members: Invite people issues one for a sign-in email
  and an assignable role, valid for seven days, which appears in that identity's workspace
  picker. No email or transferable link is sent. View history lists every invitation as
  Pending, Accepted, Expired, or Revoked; only pending ones can be revoked.

Rename, invite, role editing, removal, and transfer show only where the reader is allowed.
Transfer, removal, and revoking use confirmation modals, and each completed change confirms
itself with a toast. On phones, Members lists people with their role and shows invitations as
one card that opens the history; member details, invite, and history fill the screen.

## Boundaries and recovery

Core supplies settings/member-management reads and records `workspace.renamed`.
Rename requires `workspace.rename`, included in Owner bundle revision 2; loading an
older workspace upgrades its built-in bundles through the existing mechanism.
No SQL migration is needed. Both adapters update the directory name; pending
invitations include `workspaceName` when available.

Client's `useWorkspaceSettings` reads one tab: settings and ownership for Workspace, plus the
roster and invitations for Members. It shapes them for the screens, keeps each draft with what it
was made against, and reports failures as codes by the change that failed; UI's
[settings screens](../apps/ui/README.md) word them. The pages in web and desktop own routes,
the open member, and which modal shows.

Name edits carry the name the draft started from. Role changes carry the assignment IDs the
choice started from; ownership transfer carries the Owner assignment ID read when the dialog
opened. Stale writes fail and require an explicit refresh: a conflict, lost permission, or
missing target holds further changes until the reader refreshes. The draft stays through the
refresh and is then made against the values the reader reviewed, so saving again applies it. A
host failure or invalid input leaves the values current, so the same change can be sent again at
once. A completed change whose result could not be read back retries the read, not the write, and
confirms once the read succeeds; the invite modal offers Refresh rather than another invitation.
Invitation retries reuse the same key and expiry while mounted. After leaving or reloading an
interrupted invitation, check the history before creating another. Unmounting or credential
replacement cancels requests and ignores late responses; a server commit may already have
completed.

Tabs stay current through the workspace change feed, which the app mounts around the workspace
layout: changes made elsewhere refresh the affected reads without replacing drafts. Rows are
keyed by ID, so refreshes keep focus and open dialogs. See [change feed](change-feed.md).

The UI workshop plays the settings flows over a local fixture. Client tests cover the hook's
shaping, stale drafts, invitation retries, and refresh recovery over a scripted transport; app
tests cover the routes, inviting, and removing. Conformance tests cover rename permissions, stale
writes, rollback, directory updates, and replay on both adapters. Members are listed by the name
they chose, with the identity they sign in as in their details. Profile photos, mark
customization, recipient decline, and direct/scoped grant editing remain outside this slice.
