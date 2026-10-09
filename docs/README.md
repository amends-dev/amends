# Documentation

Use the implementation guides for current behavior and the design documents for
intended domain rules. A design marked “agreed” or “accepted” is not a claim that
every feature is implemented. [Known limitations](current-status.md) records the
remaining gaps with links to their owning code.

## Current implementation

| Guide                                                                | Scope                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [Repository README](../README.md)                                    | Setup, workspace layout, tooling, and dependency updates.                                                                       |
| [Workspace workflows](workspace-workflows.md)                        | Creation, membership, invitations, access, and ownership transfer.                                                              |
| [Group workflows](group-workflows.md)                                | Team groups: creation, public groups and joining, reads, membership, and following.                                             |
| [Thread workflows](thread-workflows.md)                              | Starts, replies, participation, reads, notifications, read state, and typing.                                                   |
| [Journal and logs](journal.md)                                       | Storage envelopes, publication, transactions, replay, and durable tails. Turn examples illustrate future consumers.             |
| [Testing](testing.md)                                                | Test commands, Effect test APIs, and database fixtures.                                                                         |
| [Publishing](publishing.md)                                          | Building a package's distribution, checking it as a consumer would use it, and publishing it to npm.                            |
| [Shared packages](../packages/README.md)                             | Package boundaries, names, and construction conventions.                                                                        |
| [Core](../packages/core/README.md)                                   | Implemented domains, operation boundaries, and public services.                                                                 |
| [Gateway](../packages/gateway/README.md)                             | Workspace boot, identity resolution, host contracts, and bus lifetime.                                                          |
| [HTTP contract](../packages/api-http/README.md)                      | Endpoint groups, wire formats, authentication, and SSE semantics.                                                               |
| [HTTP server](../packages/server-http/README.md)                     | Handler registration, request scopes, and authentication wiring.                                                                |
| [Adapters](../adapters/README.md)                                    | Store validation, construction, and migration conventions.                                                                      |
| [Storage conformance](../packages/storage-conformance/README.md)     | Test suites every storage adapter runs, and the harness an adapter supplies.                                                    |
| [Harness](../packages/harness/README.md)                             | The harness contract: an agent's sessions and turns in one stream format, and the bridge into sandboxes.                        |
| [Sandbox](../packages/sandbox/README.md)                             | The sandbox contract: Effect's file system and processes inside, ports, network, lifecycle, and the suites every provider runs. |
| [Connections](../packages/connection/README.md)                      | Integrations a host installs, the connections workspaces make to them, and the model catalog.                                   |
| [Toolkit](../packages/toolkit/README.md)                             | Tool sources, such as MCP servers and HTTP APIs, as one shape, and the toolkit built from them.                                 |
| [opencode harness](../adapters/harness-opencode/README.md)           | opencode as an agent for the harness contract, behind its bridge in a sandbox.                                                  |
| [Local sandboxes](../adapters/sandbox-local/README.md)               | Sandboxes as directories on this machine for the sandbox contract, for development and tests.                                   |
| [Daytona sandboxes](../adapters/sandbox-daytona/README.md)           | Sandboxes on Daytona for the sandbox contract, and running their tests with an API key.                                         |
| [Cluster](../packages/cluster/README.md)                             | Work outside requests on Effect Cluster: the turn job that runs agents' turns, job retries, and pruning.                        |
| [Memory storage](../adapters/storage-memory/README.md)               | The in-memory reference implementation of the storage contracts.                                                                |
| [PostgreSQL](../adapters/storage-postgresql/README.md)               | Schema, locking, composition, and database-specific testing.                                                                    |
| [Hosts](../hosts/README.md) / [local host](../hosts/local/README.md) | Runtime composition, configuration, startup, and development identity.                                                          |
| [Apps](../apps/README.md) / [web](../apps/web/README.md)             | Platform-owned routing and composition of client and UI.                                                                        |
| [Desktop](../apps/desktop/README.md)                                 | Tauri prerequisites, host connection, and native verification.                                                                  |
| [Client](../apps/client/README.md)                                   | Headless credential scopes, API/query state, view hooks, and route helpers.                                                     |
| [UI](../apps/ui/README.md)                                           | Pattern-based design system from the Lunacy mocks, with every app screen.                                                       |

The shared [icons guide](../apps/icons/README.md) covers current Solid imports, canonical
drawings, generation, and visual review in the UI workshop.

## Design and historical references

- [Feature development](feature-development.md) records the agreed workflow and
  connected-feature boundary. [Sign-in](sign-in-design.md) applies it to
  the first slice, including the UI pieces to introduce.
  [Workspace entry](workspace-entry.md) describes picker/creation ownership and recovery.
  [Workspace shell](workspace-shell.md) covers nested routes, account controls, and appearance.
  [Workspace settings](workspace-settings.md) covers workspace, member, and invitation management.
  [Connections](connections.md) covers connecting to a host's integrations and checking a
  connection.
  [Agents](agents.md) covers agents on connections: their harness, model, and sandbox, and
  why one can't run.
  [Turns](turns.md) covers agents' turns in threads, where agents are at work, and turn logs.
  [Change feed](change-feed.md) covers the client, invalidation, and reconnection.
- [Core model](core-model.md) is living design intent, not a description of the
  implementation; [known limitations](current-status.md) lists what is not built yet.
- [Design-system references](../design-system/) are product and visual mocks, not
  implemented API schemas. [Token sync](../design-system/sync/README.md) explains the
  historical handoff and points to the current token and style modules.
- [Vendored Effect](../repos/effect/LLMS.md) is read-only upstream reference material.
  Its documentation describes Effect, not the Amends application's capabilities.

## Contributor instructions

[Root AGENTS.md](../AGENTS.md) applies throughout the project. More specific guidance
lives in [packages](../packages/AGENTS.md), [core](../packages/core/AGENTS.md),
[UI](../apps/ui/AGENTS.md), [client](../apps/client/AGENTS.md),
[adapters](../adapters/AGENTS.md), and [hosts](../hosts/AGENTS.md). `CLAUDE.md` links to
the root guidance rather than maintaining a second copy.

When implementation changes, update the owning guide and any affected setup examples,
then revisit the limitations page. Validate commands against workspace scripts,
contracts against schemas and handlers, and guarantees against implementation and
tests. Check local links and anchors after moves. `bun run check` validates project
checks and formatting; it does not prove documentation accuracy or validate Markdown links.
