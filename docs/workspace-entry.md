# Workspace entry

Sign in → `/workspaces` → choose a workspace or open `/workspaces/new`.
Creation asks for one name, creates the caller's owned workspace, refreshes the
directory, and replaces the creation route with `/workspaces/:id`.

## Composition

- Client reuses `GET /me/workspaces` and owns `useCreateWorkspace`. A refresh keeps
  validated pages mounted. Rejected credentials still clear the session.
- UI owns `WorkspaceMark`, declarative `ItemList` parts, and `CreateWorkspaceForm`.
  They use reviewed tokens and controls. Shell's medium width fits the picker;
  its narrow width fits creation. Theme remains inherited from ThemeProvider.
- Features connects `WorkspacePicker.Root` with `Summary`, `List`, `Empty`, and
  `Status`; `CreateWorkspace.Root` with `Form` and `Result`. URLs and the
  `onCreated(workspaceId)` navigation callback belong to the app.
- Web and desktop own both pages and their browser/hash routes, with no local styles.

The picker shows active memberships, total active members (humans and agents), and
owner status. Removed memberships are not selectable. Unknown or removed workspace
URLs reach the existing unavailable-access presentation. Active workspaces open the
[workspace shell](workspace-shell.md). Pending invitations are
counted but have no actions in this slice.

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
invitations and activity. Invitation display names and recipient decline need backend
contracts; separate human/agent counts, general role labels, and activity indicators
need richer directory data. Remembering the last workspace and arrow-key shortcuts
are not implemented. Links use native Tab/Enter and modifier-key behavior.

The [first-run reference](<../design-system/Amends Screen · First run.dc.html>) is a
larger onboarding flow. Environment, credentials, agent, and first-task setup remain
separate work. This creation form promises only the workspace it actually creates.
