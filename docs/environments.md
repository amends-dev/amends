# Environments

Both apps own `/workspaces/:id/environments`, reached from the rail's Environments destination,
whose sidebar lists the environments; see the [workspace shell](workspace-shell.md).
`/environments` is the list, with `?tab=needs-setup` for the environments with a readiness issue;
`/environments/:environmentId` is an environment's page, and `…/sandbox` its Sandbox tab.
`?add=environment`, from the sidebar's + or the list's Add environment, opens Add environment over
either. Tabs, rows, and sidebar items are links, so browser and hash history work. The screens
follow the Lunacy "Environments" mocks for the list, forms, and modals, and the navigation pattern
of the Agents v02 frames.

- **The list:** each environment with its harness, its sandbox or "No sandbox", and its setup:
  Ready, or its first issue with how many more follow. With room, harness and sandbox are columns;
  in a narrow pane and on phones they sit under the name. Ready reflects the saved setup;
  nothing starts a sandbox or contacts a provider to decide it.
- **Readiness issues:** the harness or the sandbox provider is no longer installed on this server
  (Refresh), the account connection is gone (Choose account, on the Sandbox tab), or the account
  still needs its key (Open connection, which opens it on the Connections page).
- **Adding** takes the basics first: a name, a harness, and No sandbox or one of the providers the
  server installed. Amends runs only in process, so no placement is offered; a harness that could
  run either way would offer In-process or Inside sandbox after the sandbox choice. An environment
  with a sandbox then takes its sandbox settings: its account when the provider runs under one, a
  snapshot when it takes one, non-secret variables, ordered setup commands, and retention.
- **The account detour:** a Daytona sandbox runs under a Daytona connection. The account field
  lists the reader's Daytona connections with their state, and Create connection opens the
  connection's own two steps, name and settings, then its key. Saving the key, or finishing later,
  returns to the environment's draft with the new account chosen; an account still needing its
  key can be saved, and the environment shows that it needs setup.
- **The environment's page:** Overview reads in one column: the readiness with its recovery, the
  name as its own save, the runtime, harness and sandbox and where the harness runs, fixed once
  created, then Details, where Created by shows who added it, or "Created with this workspace" for
  the in-process environment every workspace starts with, and Removal. Sandbox holds the sandbox
  settings, saved together from the bar under them; an environment without a sandbox has no
  Sandbox tab and cannot gain one. Open connection opens the account on the Connections
  destination.
- **Field rules:** variable names are letters, digits, and underscores, not starting with a digit,
  and not repeated; blank rows are left out. Up to 50 variables and 50 commands. Each command's menu
  moves it up or down or removes it. Commands run in order before the harness starts, including
  when a sandbox is reused. Stop and keep files stops the sandbox when a turn releases it; Destroy
  sandbox deletes it and its files.

Adding, editing, and removal show only to a reader who may do them, from `manageable` and
`environment.create`: administrators and the owner by default. Members see the same values
without inputs or save actions. Removing asks for confirmation, and each completed change confirms
itself with a toast. On phones, adding fills the screen.

## Boundaries and recovery

Core keeps environments; see [core's environments](../packages/core/README.md#environments). The
[HTTP contract](../packages/api-http/README.md#environments) serves them with the installed
harnesses and providers. Client's `useEnvironments` shapes them for the screens with the accounts
each provider can run under, keeps each draft with what it was made against, and reports failures
as codes by the change that failed, with what the host refused; UI's
[Environments screens](../apps/ui/README.md) word them with the mocks' exact copy. `useEnvironmentList` gives
the sidebar the environments by name, sharing the page's read. The pages in web and desktop own the
routes, the open environment and its tab, which modal shows, and the detour through the Connections
dialogs.

A draft survives the detour and errors. A rename carries the name it started from, and a rename
made elsewhere meanwhile conflicts until the reader refreshes. A creation retried after a lost
response reuses its request key. When the host refuses sandbox settings, such as an account no
longer available, the message sits beside the field it concerns and the draft stays. The change
feed refreshes environments on each `environment.*` commit, on connection changes, whose
readiness an account environment follows, and on access changes; see
[live updates](live-updates.md).
