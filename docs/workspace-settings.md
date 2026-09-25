# Workspace settings

Both apps own `/workspaces/:id/settings/{workspace,members,invites}`. The Settings
entry redirects to Workspace; `?member=:memberId` selects a member. Links preserve
browser/hash history. Apps compose shared pieces without styles.

- **Workspace:** rename, creation attribution, current owner, and confirmed ownership
  transfer. The three roles are Viewer, Administrator, and Owner. Transfer makes the
  former owner an Administrator; ordinary role editing never assigns Owner.
- **Members:** active/removed lists and responsive details. Backend flags control
  role editing and removal. The access summary includes separate assignments;
  changing a workspace role preserves those assignments. Removed members rejoin
  through a new invitation and receive a new membership.
- **Invites:** recipient identity, assignable role, seven-day expiry, history, and
  confirmed revocation. The recipient accepts from the workspace picker. Invitations
  are tied to the exact sign-in identity; there is no transferable code or email delivery.

## Boundaries and recovery

Core supplies settings/member-management reads and records `workspace.renamed`.
Rename requires `workspace.rename`, included in Owner bundle revision 2; loading an
older workspace upgrades its built-in bundles through the existing mechanism.
No SQL migration is needed. Both adapters update the directory name; pending
invitations include `workspaceName` when available.

Client owns typed requests and mounted intent state. Features connects them through
`Settings.Root` and named parts. UI supplies SegmentedControl, KeyValue, ListDetail, PageColumns,
ItemList rows/actions, and controlled name/invitation forms, using existing controls.
The segmented section picker sits below the shared page header. Small labeled
Divider rows identify lists and forms; the page title appears only in the header.
Workspace keeps name and ownership controls in the primary column and details in
the aside. Invites keeps history in the primary column and the new-invite form in
the aside. Both columns stack in that order on smaller screens. Pages and URL
construction remain in web/desktop; ThemeProvider owns themes.

Name edits carry the previously read name. Role changes carry the previous assignment
IDs; ownership transfer carries the previous Owner assignment ID. Stale writes fail
and require an explicit refresh/review. Refresh replaces form drafts with current data.
A completed mutation followed by a failed refresh retries the read, not the write.
Invitation retries retain the same key and expiry while mounted. After leaving or
reloading an interrupted invitation form, check history before creating another.
Unmounting or credential replacement cancels requests and ignores late responses;
a server commit may already have completed. Settings uses explicit refresh, not live updates.

UI stories cover shared presentation. Connected stories run against isolated HTTP
and PostgreSQL data; conformance tests cover rename permissions, stale writes,
rollback, directory updates, and replay on both adapters. App tests cover section
routes and persistent shell selection. Profile names/photos, mark customization,
recipient decline, and direct/scoped grant editing remain outside this slice.
