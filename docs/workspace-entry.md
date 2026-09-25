# Workspace entry

Sign in → `/workspaces` → choose a workspace or open `/workspaces/new`.
Creation asks for one name, creates the caller's owned workspace, refreshes the
directory, and replaces the creation route with `/workspaces/:id`.

## Composition

- Client reuses `GET /me/workspaces` and owns `useCreateWorkspace`. A refresh keeps
  validated pages mounted. Rejected credentials still clear the session.
- UI owns `WorkspaceMark`, declarative `ItemList` parts, and `CreateWorkspaceForm`.
  Memberships use the same flat, seam-separated rows as the workspace rosters;
  the new-workspace action keeps a separate dashed outline. Shell's medium width fits the picker;
  its narrow width fits creation. Theme remains inherited from ThemeProvider.
- Features connects `WorkspacePicker.Root` with `Summary`, `List`, `Invitations`, `Empty`, and
  `Status`; `CreateWorkspace.Root` with `Form` and `Result`. URLs and the
  `onCreated(workspaceId)` navigation callback belong to the app.
- Web and desktop own both pages and their browser/hash routes, with no local styles.

The picker shows active memberships, total active members (humans and agents), and
owner status. Removed memberships are not selectable. Unknown or removed workspace
URLs show the unavailable page: the picker's account header over a centered explanation from
`WorkspaceUnavailable` (`@amends/features/workspaces`), following the Sign in reference's
ended-membership state. A pending invitation to that workspace reads as "Invitation waiting",
an ended membership as "No longer a member", and anything else as "No access", each in a
[Notice](../apps/ui/src/compositions/notice/README.md) with a button back to the picker.
Active workspaces open the
[workspace shell](workspace-shell.md). Pending invitations show their workspace name
and recipient, with acceptance that refreshes the directory before showing the membership.
The picker has no manual refresh button; failed directory reads offer `Try again`.
See [workspace settings](workspace-settings.md) for issuance and recovery.

## Creation and recovery

Names are trimmed and validated using the backend schema. One mounted creation
intent keeps its idempotency key across retries of the same submitted name. A new
submitted name starts a new intent. Duplicate submissions are blocked while pending.
After a confirmed creation, a failed directory refresh retries only the read.
Unmounting or changing credentials cancels client work and ignores late completions;
it cannot undo a server commit. Retry keys are not persisted across leaving the form
or reloading; check the picker before starting another creation after an interruption.

UI stories cover presentation and interactions. Connected stories use isolated real
HTTP/PostgreSQL scenarios for populated/empty lists, creation, a lost response,
refresh recovery, pending duplicates, and unmounting. App tests cover browser/hash
navigation and recovery before entering the created workspace.

## Following slices

The [picker reference](<../design-system/Amends Screen · Sign in.dc.html>) also shows
invitations and activity. Recipient decline needs a backend contract;
separate human/agent counts, general role labels, and activity indicators
need richer directory data. Remembering the last workspace and arrow-key shortcuts
are not implemented. Links use native Tab/Enter and modifier-key behavior.

The [first-run reference](<../design-system/Amends Screen · First run.dc.html>) is a
larger onboarding flow. Environment, credentials, agent, and first-task setup remain
separate work. This creation form promises only the workspace it actually creates.

## Standalone states

Pages outside a workspace share one frame in each app, matching the picker: `amends` at the
start of the header, the signed-in address and Sign out at the end, and centered content. The
states follow the Component Inventory's EmptyState (a drawing, a serif line, a sentence, one
action), where failure reads through the drawing, never red:

| State                | Drawing        | Title                           | Action                          |
| -------------------- | -------------- | ------------------------------- | ------------------------------- |
| Checking the session | none           | Checking your session           | none; the status line announces |
| Host unreachable     | `Disconnected` | Can’t reach your workspace host | Try again (retries the read)    |
| Unknown address      | `Bare`         | Nothing at this address         | Your workspaces, or Sign in     |
| Crashed view         | `Snapped`      | Something went wrong            | Reload                          |

The crashed view sits outside ClientProvider, so it shows no account. An unknown page inside a
workspace keeps the workspace layout and shows the same `Bare` state with a way back to the
workspace home. Unavailable workspaces use the Sign in reference's Notice, described above.
