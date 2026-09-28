# Connections

Both apps own `/workspaces/:id/connections`. `?tab=needs-setup` shows the connections that still
need setup, and `?connection=:connectionId` opens one beside the list. Tabs and rows are links,
so browser and hash history work. The screens follow the Lunacy "Connections" mocks.

- **The list:** each connection with its provider, its API URL or "Default API endpoint", its
  setup, and how it authenticates, with search. Configured means setup is complete; it never
  means the provider accepted the key, since nothing checks it until an agent's turn uses it. Needs setup
  names what is missing: required settings or the key. Unavailable is a connection whose provider
  this server no longer installs; it stays, with its saved settings and key, until someone
  removes it.
- **Adding** starts from the providers this server installed: Anthropic and OpenAI-compatible for
  model access, and Daytona, an account that environments run their sandboxes under. The provider's declaration decides the settings asked for and
  the ways of authenticating offered. Creating takes two steps. The first creates the connection
  without its key; the second saves the key against it. Finish later leaves the connection under
  Needs setup, and a failed key save retries only the key.
- **Details** show the provider and setup, then the name and the provider's settings as separate
  saves, and authentication. A saved key reads "API key saved" and is never shown again: it can
  only be replaced, which keeps the old key until the new one saves, or removed. A connection
  created without authentication has no key actions. The provider and way of authenticating are
  chosen once; changing them means a new connection.

Adding, editing, key actions, and removal show only to a reader who may do them: administrators
and the owner by default. Members see the list and details read-only. Removing a connection or
its key asks for confirmation, and each completed change confirms itself with a toast. On phones,
details and setup fill the screen.

## Boundaries and recovery

Core keeps connections and their keys; see [core's connections](../packages/core/README.md#connections).
The [HTTP contract](../packages/api-http/README.md#connections) serves the installed
implementations and the connections, and never returns a key. Client's `useConnections` shapes
them for the screens, keeps each draft with what it was made against, and reports failures as
codes by the change that failed; UI's [Connections screens](../apps/ui/README.md) word them. The
pages in web and desktop own the routes, the open connection, and which modal shows.

A rename carries the name the draft started from; one renamed elsewhere meanwhile conflicts, and
the reader refreshes, reviews, and saves again with their draft kept. A creation retried after a
lost response reuses its request key, so it is not created twice. A key typed into the dialog
stays in the client only until it saves or the dialog closes. A host without
`AMENDS_CREDENTIAL_KEY` keeps connections but refuses keys, which the key dialog reports as
credential storage being unavailable. The change feed refreshes the connections for every reader
on each `connection.*` commit and on access changes; see [live updates](live-updates.md).
