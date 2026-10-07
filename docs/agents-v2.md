# Agents v2

Agents v2 are a workspace's agents on [connections v2](connections-v2.md): each is a member that
works, as its instructions say, on a harness, a model, and, when it needs one, a sandbox, each
given by one of the workspace's connections, on which the host runs its turns
([known limitations](current-status.md)).

Both apps own `/workspaces/:id/agents-v2`, reached from the rail's Agents v2, whose sidebar lists
each agent by name with its status patch. `/agents-v2` is the list, with `?tab=needs-setup` for the
agents that can't run as they are set up; `/agents-v2/:agentId` is an agent's page. `?add=agent`,
from the sidebar's + or the list's Add agent, opens Add agent over either. The screens have no
Lunacy mocks of their own; they follow the Agents frames' navigation and the
[workspace shell](workspace-shell.md)'s pattern.

- **The list:** each agent with its avatar, its harness and the sandbox it works in, its model
  with the connection that gives it, and where it is at work, with search. One that can't run shows
  a patch on its avatar, "Needs setup", with why on hover; one at work shows its most pressing
  turn's state (Working, Stopping, or Queued) and where, such as "#general + 1 more", as does its
  patch in the sidebar.
- **Adding** takes a name, the role it starts with (Member by default; a role the reader can't give
  shows but can't be chosen), and its setup.
- **The setup** is the instructions; the harness, one of the connections that give harnesses, or
  Auto, for amends to choose one as the agent works; the model connection and the model, which the
  connection's list suggests and which may be any other when the connection takes models it doesn't
  list; the effort, from those the chosen model takes, or any for a model the connection doesn't
  list, and hidden for a listed model that takes none; and the sandbox, or none. A harness that works
  only in a sandbox asks for one before saving.
- **The agent's page** reads in one column: a notice listing why it can't run, as its readiness
  says (a connection removed, an integration this host no longer installs, a connection that no
  longer gives its part as the agent takes it, a harness without the sandbox it needs, or Auto with
  no harness to choose); its name as its own save; its setup, saved as a whole, with Discard
  changes; its details, with its current activity: each turn in progress with where it works,
  opening the turn's log beside its thread, or Idle; and removal. A connection the agent names that is removed or not installed
  stays chosen and shows as unavailable, with why, until the agent is set up on another.

An agent's name, role, and departure are its membership's: renaming it renames the member, its
role changes in Settings › Members, and removing it ends its membership. Adding and configuring
show only to a reader who may do them, from `agent-v2.create` and each agent's `configurable`:
administrators and the owner by default; members see the same values, read only. Removing
asks for confirmation, and each completed change confirms itself with a toast.

## Boundaries and recovery

Core keeps agents v2; see [core's agents v2](../packages/core/README.md#agents-v2). The
[HTTP contract](../packages/api-http/README.md#agents-v2) serves them, and the models each
connection offers. Client's `useAgentsV2` shapes them for the screens with the connections their
setups name, offers each part's connections with the models each offers, keeps each draft with what
it was made against, and reports failures by the change that failed: a connection the reader can't
use, at its part, or a setup that couldn't run, with its issues, each shown beside its field until a
field that may resolve it changes; UI's
[Agents v2 screens](../apps/ui/README.md#screens) word them. It gives where each agent is at work,
and its turns in progress (`turnsOf`), from the workspace's active turns, which `useTurnActivity`
follows as the sidebar's group marks do ([turns](turns.md)). `useAgentV2List` gives the sidebar the
agents by name, with where each is at work, sharing the page's read. The pages in web and desktop own the routes, the open
agent, and which modal shows.

A rename carries the name it started from; one renamed elsewhere meanwhile conflicts, and the reader
refreshes, reviews, and saves again with their draft kept. A creation retried after a lost response
reuses its request key, so it is not created twice. The change feed refreshes agents v2 on each
`agent-v2.*` commit and on membership, connection v2, and access changes; see
[change feed](change-feed.md).
