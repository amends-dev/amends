# Connections v2

Connections v2 are a workspace's links to the integrations its host installs: model providers,
tool sources, sandbox providers, and harnesses, as [connection-v2](../packages/connection-v2/README.md)
declares them. [Agents v2](agents-v2.md) name them for their harness, model, and sandbox.

Both apps own `/workspaces/:id/connections-v2`, reached from the rail's Connections v2, whose
sidebar lists Models, Tools, Sandboxes, and Harnesses: each connection under what its integration
gives. `/connections-v2` is the list, with `?tab=models`, `tools`, `sandboxes`, or `harnesses` for
one kind, as each sidebar section's title and Browse open it; `/connections-v2/:connectionId` is a
connection's page. `?add=` opens Add connection over either: `connection` for any integration,
from the list's Add connection, or a kind, from that section's +, offering only its integrations.
The screens have no Lunacy mocks; they follow the Connections ones and the navigation pattern of
the [workspace shell](workspace-shell.md).

- **The list:** each connection with its integration, what it gives, and how it authenticates, with
  search. One whose integration refuses its setup is marked as needing setup, with why on hover.
  One whose integration this host no longer installs is marked unavailable, "Integration not
  installed"; it gives nothing the host knows of, so it shows in the list only, never in the
  sidebar, and its page lists its saved settings and offers only removal.
- **Adding** starts from the integrations this host installs, searched by name, since a host may
  install a hundred model providers. The integration's settings form, an MCP elicitation form
  schema, decides the fields asked for (text, numbers, yes or no, or options) and what each
  refuses; its ways of authenticating decide whether a key is asked for. The name, settings, and
  key are created together in one request, and creating opens the connection's page and checks it.
- **The connection's page** reads in one column: a notice when the integration refuses its setup,
  with what the integration said, or is not installed; Check, which asks the connection's system
  whether it works as set up and says what it found (Working, Key refused, Settings don’t work, or
  Couldn’t reach it); the name and the settings as separate saves; how it authenticates, with
  Replace key for one that takes a key; Details (the integration with its documentation, what it
  gives, and who created it); and Removal. A key is never shown again: it can only be replaced. A
  check stores nothing; its result stays while the page is open.

Adding, editing, checking, and removal show only to a reader who may do them: administrators and
the owner by default. Members see the list and each page read-only. Removing a connection asks for
confirmation, and each completed change confirms itself with a toast.

## Boundaries and recovery

Core keeps connections v2 and their keys apart; see
[core's connections v2](../packages/core/README.md#connections-v2). The
[HTTP contract](../packages/api-http/README.md#connections-v2) serves the installed integrations
and the connections, and never returns a key. Client's `useConnectionsV2` turns each integration's
settings form into the screens' fields and their text back into settings, keeps each draft with
what it was made against, runs checks beside changes, and reports failures by the change that
failed; UI's [Connections v2 screens](../apps/ui/README.md#screens) word them.
`useConnectionV2List` gives the sidebar each connection by what it gives, sharing the page's reads.
The pages in web and desktop own the routes, the open connection, and which modal shows.

A rename carries the name the draft started from; one renamed elsewhere meanwhile conflicts, and
the reader refreshes, reviews, and saves again with their draft kept. A creation retried after a
lost response reuses its request key, so it is not created twice; changing the key makes it a new
request. A key typed into a dialog stays in the client only until it saves or the dialog closes. A
host without `AMENDS_CREDENTIAL_KEY` refuses a connection that takes a key, keeping the draft, and
keeps those that take none. The change feed refreshes connections v2 for every reader on each
`connection-v2.*` commit but a replaced key, and on access changes; see
[change feed](change-feed.md).
