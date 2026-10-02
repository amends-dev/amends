# Agents

Both apps own `/workspaces/:id/agents`, reached from the rail's Agents destination, whose sidebar
lists the agents; see the [workspace shell](workspace-shell.md). `/agents` is the list, with
`?tab=needs-setup` for the agents with a readiness issue; `/agents/:agentId` is an agent's page, and
`/agents/:agentId/configuration` its Configuration tab. `?add=agent`, from the sidebar's + or the
list's Add agent, opens Add agent over either. Tabs, rows, and sidebar items are links, so browser
and hash history work. The screens follow the Lunacy "Agents" mocks: v02 for the navigation and
the agent's page, v01 for adding and the connection detour, and "Status v01" for how state shows.

- **Status:** one patch over the avatar's corner says the agent's state wherever it shows: the
  Agents sidebar and list, its page's title, its profile card, and a one-to-one conversation's row
  under Direct messages. A filled square is ready, a triangle needs setup, and a square with a bar
  can't run, when the environment cannot run the model at all. The logo moves beside the name
  while a turn is queued or running. Hovering the patch shows the state and why; screen readers
  hear it after the name. Ready reflects the saved configuration; nothing calls the provider to
  decide it. A ready agent's pages show no status text.
- **The list:** each agent with its avatar and patch, its model (the connection and the model ID),
  its environment, and where it is at work, blank while idle. With room, model, environment, and
  activity are columns; in a narrow pane and on phones they sit under the name.
- **Readiness:** an agent that cannot run shows one notice at the top of its Overview, caution for
  setup and danger for what cannot run, listing each issue with what brings the first one back
  beside it: the model connection
  needs its key (Open connection, which opens it on the Connections page), the environment needs
  setup (Open environment), the connection or environment is gone (Choose connection, Choose
  environment), or the environment cannot run the model (the harness does not support the
  provider, or the saved reasoning level) with the way to change it.
- **Adding** takes a name and the workspace role: Member by default, and Administrator only for
  the owner, who alone may give it; an administrator sees Member fixed. Then the model connection
  (marked Needs API key when it has none), the model, where the suggestions are the
  provider's and any other ID can be entered, the environment, and the instructions. Each
  environment's mark shows whether it works for the chosen model, needs setup first, or can't run
  it, with the reason under the latter two;
  one that needs setup can be chosen, and the agent is created with its setup pending.
- **The connection detour:** Create model connection, in the connection list or on the empty page
  when no model connection exists, asks for a model provider, then the connection's name and
  settings, then its key. Saving the key, or finishing later, returns to the draft with the new
  connection chosen.
- **The agent's page:** Overview reads in one column: the readiness notice when one is needed, the
  name as its own save, the
  saved configuration with Edit configuration, then Details (its role, its turns in progress, and
  who created it) and Membership with Remove agent. Each turn in progress, such as "Working ·
  #general", opens its log in the side panel (`?log=:turnId`), where Back leads to its thread.
  Configuration holds the instructions, model connection, model, and environment, saved together
  from the bar under them. Reasoning shows only for a harness that takes levels; a saved level
  its harness no longer takes offers Use default reasoning. Remove agent shows to a reader who may
  remove it: configuring does not include removing, and only the owner removes an agent holding
  more than Member.

Adding and configuring show only to a reader who may do them, from `agent.create` and each agent's
`configurable`: administrators and the owner by default. Members see the same values without
inputs, and no save actions. Removing asks for confirmation, and each completed
change confirms itself with a toast. On phones, adding fills the screen.

## Boundaries and recovery

Core keeps agents; see [core's agents](../packages/core/README.md#agents). The
[HTTP contract](../packages/api-http/README.md#agents) serves them, their environment choices, and
the connection implementations' suggested models. Client's `useAgents` shapes them for the
screens, keeps each draft with what it was made against, checks environment choices as the draft
changes, and reports failures as codes by the change that failed, with what the host refused;
UI's [Agents screens](../apps/ui/README.md) word them with the mocks' exact copy. `useAgentList` gives the
sidebar the agents by name, sharing the page's read. The pages in web and desktop own the routes,
the open agent and its tab, which modal shows, and the detour through the Connections dialogs.

A draft survives the detour and errors. A rename carries the name it started from, and a rename
made elsewhere meanwhile conflicts until the reader refreshes. A creation retried after a lost
response reuses its request key. When the host refuses a connection or an environment no longer
available, the message sits beside that field, the choices reload, and the draft stays; an
Administrator role refused to someone other than the owner is worded at the role field. The change
feed refreshes agents on each `agent.*` commit and on membership, connection, environment, and
access changes; see [change feed](change-feed.md).
