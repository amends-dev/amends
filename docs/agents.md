# Agents

Both apps own `/workspaces/:id/agents`, reached from the rail's Agents destination.
`?tab=needs-setup` shows the agents with a readiness issue, and `?agent=:agentId` opens one beside
the list. Tabs and rows are links, so browser and hash history work. The screens follow the Lunacy
"Agents" mocks.

- **The list:** each agent with a one-letter avatar, its model (the connection and the model ID),
  its environment, and its setup: Ready, Needs setup, or Can't run when the environment cannot
  run the model at all. With room, model and environment are columns; beside an open agent and on
  phones they sit under the name. Ready reflects the saved configuration; nothing calls the
  provider to decide it.
- **Readiness:** each issue is listed with what brings the first one back: the model connection
  needs its key (Open connection, which opens it on the Connections page), the environment needs
  setup (Open environment), the connection or environment is gone (Choose connection, Choose
  environment), or the environment cannot run the model (the harness does not support the
  provider, or the saved reasoning level) with the way to change it.
- **Adding** takes a name and the workspace role: Member by default, and Administrator only for
  the owner, who alone may give it; an administrator sees Member fixed. Then the model connection
  (with its state, Configured or Needs API key), the model, where the suggestions are the
  provider's and any other ID can be entered, the environment, and the instructions. Each
  environment shows whether it works for the chosen model, needs setup first, or can't run it;
  one that needs setup can be chosen, and the agent is created with its setup pending.
- **The connection detour:** Create model connection, in the connection list or on the empty page
  when no model connection exists, asks for a model provider, then the connection's name and
  settings, then its key. Saving the key, or finishing later, returns to the draft with the new
  connection chosen.
- **Details:** Overview shows the readiness, the name as its own save, the saved configuration,
  and who created the agent. Configuration holds the instructions, model connection, model, and
  environment, saved together. Reasoning shows only for a harness that takes levels; a saved level
  its harness no longer takes offers Use default reasoning. Remove agent shows to a reader who may
  remove it: configuring does not include removing, and only the owner removes an agent holding
  more than Member.

Adding and configuring show only to a reader who may do them, from `agent.create` and each agent's
`configurable`: administrators and the owner by default. Members see the same values without
inputs, and Close in place of the save actions. Removing asks for confirmation, and each completed
change confirms itself with a toast. On phones, details and adding fill the screen.

## Boundaries and recovery

Core keeps agents; see [core's agents](../packages/core/README.md#agents). The
[HTTP contract](../packages/api-http/README.md#agents) serves them, their environment choices, and
the connection implementations' suggested models. Client's `useAgents` shapes them for the
screens, keeps each draft with what it was made against, checks environment choices as the draft
changes, and reports failures as codes by the change that failed, with what the host refused;
UI's [Agents screens](../apps/ui/README.md) word them with the mocks' exact copy. The pages in web
and desktop own the routes, the open agent and its tab, which modal shows, and the detour through
the Connections dialogs.

A draft survives the detour and errors. A rename carries the name it started from, and a rename
made elsewhere meanwhile conflicts until the reader refreshes. A creation retried after a lost
response reuses its request key. When the host refuses a connection or an environment no longer
available, the message sits beside that field, the choices reload, and the draft stays; an
Administrator role refused to someone other than the owner is worded at the role field. The change
feed refreshes agents on each `agent.*` commit and on membership, connection, environment, and
access changes; see [live updates](live-updates.md).
