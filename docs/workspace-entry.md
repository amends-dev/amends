# Workspace entry

Sign in → `/workspaces` → choose a workspace, accept an invitation, or open
`/workspaces/new`. Creation asks for a workspace name and what people there will call the
creator, creates the caller's owned workspace, refresh## Composition

- Client reuses `GET /me/workspaces`. `useWorkspacePicker` shapes it into workspaces and
  invitations and accepts invitations; `useCreateWorkspace` owns one creation intent;
  `useWorkspaceAccess` explains an unavailable workspace. A refresh keeps validated pages
  mounted. Rejected credentials still clear the session.
- [UI](../apps/ui/README.md) owns the screens, drawn from the Lunacy mocks in
  `design-system/Amends Group Exploration.free`: `WorkspacePicker` with its Join dialog and
  toast, the `CreateWorkspace` modal, and the standalone screens. They take client's codes and
  states as props and own the wording.
- Web and desktop wire the two in their picker page and browser/hash routes, with no local
  styles. `/workspaces/new` renders the picker with the creation modal over it; closing the
  modal returns to `/workspaces`.

The picker shows active memberships with their active member count (humans and agents) and
owner status. Removed memberships are not selectable. Pending invitations show the workspace
name and when they expire. Accept invite opens "Join {workspace}", asking what people there
should call the reader, suggested from their email address; joining refreshes the directory,
closes the dialog, confirms with a toast, and moves focus to the new workspace. A failure stays
in the dialog with its reason; after joining, a failed refresh offers Try again, which only
refreshes. The picker has no manual refresh button; a failed background refresh keeps the
lists and offers `Try again`. Unknown or removed workspace URLs show `WorkspaceUnavailableScreen`
under the picker's account header: a pending invitation to that workspace points back to the
picker to accept it, an ended membership says so, and anything else reads as no access.
Active workspaces open the [workspace shell](workspace-shell.md). See
[workspace settings](workspace-settings.md) for issuance and recovery.

ee [workspace settings](workspace-settings.md) for issuance and recovery.

## Creation and recovery

Names are trimmed and validated using the backend schema. One mounted creation
intent keeps its idempotency key across retries of the same submitted name. A new
submitted name starts a new intent. Duplicate submissions are blocked while pending.
After a confirmed creation, a failed directory refresh retries only the read.
Unmounting or changing credentials cancels client work and ignores late completions;
it cannot undo a server commit. Retry keys are not persisted across closing the modal
or reloading; check the picker before starting another creation after an interruption.

UI stories cover the screens and their interactions over local state. Client tests cover
creation retries, refresh recovery, pending duplicates, unmounting, and accepting invitations
against a stubbed host. App tests cover browser/hash navigation, the creation route, and
recovery before entering the created workspace.

## Following slices

Recipient decline needs a backend contract; separate human/agent counts, general role labels,
and activity indicators need richer directory data. Remembering the last workspace and arrow-key
shortcuts are not implemented. Links use native Tab/Enter and modifier-key behavior.

A larger onboarding flow, setting up credentials, an agent, and a first task, remains
separate work. This creation form promises only the workspace it actually creates.

## Standalone states

Pages outside a workspace use UI's `StandaloneScreen`, the Centered pattern with the brand
at the start of the header and, when signed in, the address and Sign out at the end. Each state
is an EmptyState with one action:

| State                | Screen                  | Title                           | Action                          |
| -------------------- | ----------------------- | ------------------------------- | ------------------------------- |
| Checking the session | `CheckingSessionScreen` | Checking your session           | none; the status line announces |
| Host unreachable     | `HostUnavailableScreen` | Can’t reach your workspace host | Try again (retries the read)    |
| Unknown address      | `NotFoundScreen`        | Nothing at this address         | Your workspaces, or Sign in     |
| Crashed view         | `CrashedScreen`         | Something went wrong            | Reload                          |

The crashed view sits outside ClientProvider, so it shows no account. An unknown page inside a
workspace keeps the workspace layout, still in the previous UI, with Go to Inbox as the way back. Unavailable workspaces are described above.
