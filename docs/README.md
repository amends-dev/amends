# Documentation

Use the implementation guides for current behavior and the design documents for
intended domain rules. A design marked “agreed” or “accepted” is not a claim that
every feature is implemented. [Known limitations](current-status.md) records the
remaining gaps with links to their owning code.

## Current implementation

| Guide                                                                              | Scope                                                                                                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [Repository README](../README.md)                                                  | Setup, workspace layout, tooling, and dependency updates.                                                           |
| [Workspace workflows](workspace-workflows.md)                                      | Creation, membership, invitations, access, and ownership transfer.                                                  |
| [Group workflows](group-workflows.md)                                              | Team groups: creation, public groups and joining, reads, membership, and following.                                 |
| [Thread workflows](thread-workflows.md)                                            | Starts, replies, participation, reads, notifications, read state, and typing.                                       |
| [Journal and logs](journal.md)                                                     | Storage envelopes, publication, transactions, replay, and durable tails. Turn examples illustrate future consumers. |
| [Testing](testing.md)                                                              | Test commands, Effect test APIs, and database fixtures.                                                             |
| [Shared packages](../packages/README.md)                                           | Package boundaries, names, and construction conventions.                                                            |
| [Core](../packages/core/README.md)                                                 | Implemented domains, operation boundaries, and public services.                                                     |
| [Gateway](../packages/gateway/README.md)                                           | Workspace boot, identity resolution, host contracts, and bus lifetime.                                              |
| [HTTP contract](../packages/api-http/README.md)                                    | Endpoint groups, wire formats, authentication, and SSE semantics.                                                   |
| [HTTP server](../packages/server-http/README.md)                                   | Handler registration, request scopes, and authentication wiring.                                                    |
| [Adapters](../adapters/README.md)                                                  | Store validation, construction, and migration conventions.                                                          |
| [Storage conformance](../packages/storage-conformance/README.md)                   | Test suites every storage adapter runs, and the harness an adapter supplies.                                        |
| [Harness](../packages/harness/README.md)                                           | The harness contract: sessions, and the events and transcript every harness records.                                |
| [Amends harness](../packages/harness-amends/README.md)                             | Amends's own harness: an in-process agent loop over Effect AI.                                                      |
| [Connection](../packages/connection/README.md)                                     | The connection implementation contract: declarations for a host's catalog, and model inference.                     |
| [Anthropic connection](../adapters/connection-anthropic/README.md)                 | Anthropic model connections over Effect AI.                                                                         |
| [OpenAI-compatible connection](../adapters/connection-openai-compatible/README.md) | Chat-completions model connections, such as OpenAI, OpenRouter, or a local server.                                  |
| [Environment](../packages/environment/README.md)                                   | Spawning a harness with a sandbox, acquisition outcomes, snapshots, and release.                                    |
| [Execution](../packages/execution/README.md)                                       | Running agents' turns: sessions, input, closing with the reply, stops, retries, and Cluster entities.               |
| [Sandbox](../packages/sandbox/README.md)                                           | The sandbox provider contract: acquisition, commands, processes, ports, files, and snapshots.                       |
| [Sandbox conformance](../packages/sandbox-conformance/README.md)                   | Test suites every sandbox provider runs, and the harness a provider supplies.                                       |
| [Local sandbox](../adapters/sandbox-local/README.md)                               | Sandboxes as directories on this machine, the reference provider.                                                   |
| [Daytona sandbox](../adapters/sandbox-daytona/README.md)                           | Sandboxes on Daytona, and running its suites with an API key.                                                       |
| [Memory storage](../adapters/storage-memory/README.md)                             | The in-memory reference implementation of the storage contracts.                                                    |
| [PostgreSQL](../adapters/storage-postgresql/README.md)                             | Schema, locking, composition, and database-specific testing.                                                        |
| [Hosts](../hosts/README.md) / [local host](../hosts/local/README.md)               | Runtime composition, configuration, startup, and development identity.                                              |
| [Apps](../apps/README.md) / [web](../apps/web/README.md)                           | Platform-owned routing and composition of client and UI.                                                            |
| [Desktop](../apps/desktop/README.md)                                               | Tauri prerequisites, host connection, and native verification.                                                      |
| [Client](../apps/client/README.md)                                                 | Headless credential scopes, API/query state, view hooks, and route helpers.                                         |
| [UI](../apps/ui/README.md)                                                         | Pattern-based design system from the Lunacy mocks, with every app screen.                                           |

The shared [icons guide](../apps/icons/README.md) covers current Solid imports, canonical
drawings, generation, and visual review in the UI workshop.

## Design and historical references

- [Feature development](feature-development.md) records the agreed workflow and
  connected-feature boundary. [Sign-in](sign-in-design.md) applies it to
  the first slice, including the UI pieces to introduce.
  [Workspace entry](workspace-entry.md) describes picker/creation ownership and recovery.
  [Workspace shell](workspace-shell.md) covers nested routes, account controls, and appearance.
  [Workspace settings](workspace-settings.md) covers workspace, member, and invitation management.
  [Connections](connections.md) covers adding connections, their keys, and their setup states.
  [Environments](environments.md) covers adding environments, their sandbox settings, and the
  account detour.
  [Agents](agents.md) covers adding and configuring agents, fitting environments, and the
  model-connection detour.
  [Live updates](live-updates.md) covers the change-feed client, invalidation, and reconnection.
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
