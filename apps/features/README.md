# Connected features

`@amends/features` connects the independent client and UI packages. Components
own presentation mappings, while client owns operations/state and UI owns forms.
Routes, page layouts, navigation, API URL, and persistence remain caller-owned.

This package is being retired. Its logic moves into client hooks, and web and desktop
wire those hooks to the presentational [ui-v2](../ui-v2/README.md) screens directly. Sign-in and
workspace entry have moved: the apps pair `useSignIn`, `useWorkspacePicker`,
`useCreateWorkspace`, and `useWorkspaceAccess` with the ui-v2 sign-in, workspace, and standalone
screens. See [workspace entry](../../docs/workspace-entry.md).

## Workshop

```sh
bun run --filter @amends/features dev
bun run test --project @amends/features
bun run --filter @amends/features build
```

Storybook runs at `http://127.0.0.1:6008` (HMR 6009). The launcher also starts a
loopback-only development host. PostgreSQL must be locally installed, or
`AMENDS_POSTGRES_URL` must name a server allowed to create temporary databases.
It never uses `AMENDS_DATABASE_URL` or loads environment files for the host.

Each story gets a fresh database, development authentication, and memory session.
The production components call the real HTTP routes and gateway; fixtures create data
through HTTP and sign in through the normal development flow. Portable tests run those
same stories; browser review covers the actual proxy and DOM. The settings stories that
end with a recipient joining use a workshop-only view over `useWorkspacePicker`.

Server fixtures live in `hosts/local/workshop`, browser fixtures in `workshop`,
and neither is exported to consumers. HTTP cancellation cannot promise server-side
rollback. Normal unmount deletes the scenario; stopping the launcher releases remaining
databases and its temporary cluster. A crashed tab may retain a scenario until shutdown;
the host limits active scenarios to twelve. A static Storybook build needs this
backend/proxy to run live stories.

## Settings

`@amends/features/settings` exports Root and Feedback, WorkspaceName, WorkspaceDetails,
OwnershipTransfer, MemberList, MemberDetail, InviteForm, and InvitationHistory.
Compose the required parts under `Root workspaceId={id} section="workspace"` (or
`members` / `invites`). The app supplies member URLs and selected identity; features
owns no routes or styles. See [workspace settings](../../docs/workspace-settings.md)
for permissions, conflict handling, invitation retry, and workshop coverage.

Mount Root under the app's `WorkspaceFeedProvider` to keep sections current. Lists key their
rows by ID, and name and role editors keep a draft's starting value, so live refreshes keep
focus, dialogs, and drafts, and a stale draft conflicts on save. Live stories rename or invite
through another member's credential and wait for the change without refreshing; `ResumeAfterDrop`
uses the workshop's `drop-changes` control, and `RefreshRecovery` uses `break-directory` and
`restore-directory`, because background refreshes also read the directory.

The workspace navigation, groups, threads, direct messages, the Inbox, the account menu, and live
status moved to client hooks and UI v2 screens; see [workspace shell](../../docs/workspace-shell.md).
Only Settings remains here.
