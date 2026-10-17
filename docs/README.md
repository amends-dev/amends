# Documentation

Use the implementation guides for current behavior and the design documents for
intended domain rules. A design marked “agreed” or “accepted” is not a claim that
every feature is implemented. [Known limitations](current-status.md) records the
remaining gaps with links to their owning code.

## Current implementation

| Guide                                                                | Scope                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [Repository README](../README.md)                                    | What amends is, its published packages, running it locally, and the repository's layout.                                        |
| [Contributing](../CONTRIBUTING.md)                                   | Setting up, the checks every change passes, making a change, adding an integration, and updating Effect.                        |
| [Security policy](../SECURITY.md)                                    | Reporting a vulnerability, supported versions, and what is not a vulnerability by design.                                       |
| [Workspace workflows](workspace-workflows.md)                        | Creation, membership, invitations, access, and ownership transfer.                                                              |
| [Group workflows](group-workflows.md)                                | Team groups: creation, public groups and joining, reads, membership, and following.                                             |
| [Thread workflows](thread-workflows.md)                              | Starts, replies, tasks, channels, participation, reads, notifications, read state, and typing.                                  |
| [Journal and logs](journal.md)                                       | Storage envelopes, publication, transactions, replay, and durable tails. Turn examples illustrate future consumers.             |
| [Testing](testing.md)                                                | Test commands, Effect test APIs, and database fixtures.                                                                         |
| [Publishing](publishing.md)                                          | Building a package's distribution, checking it as a consumer would use it, and publishing it to npm.                            |
| [Shared packages](../packages/README.md)                             | Package boundaries, names, and construction conventions.                                                                        |
| [Core](../packages/core/README.md)                                   | Implemented domains, operation boundaries, and public services.                                                                 |
| [Gateway](../packages/gateway/README.md)                             | Workspace boot, identity resolution, host contracts, and bus lifetime.                                                          |
| [HTTP](../packages/http/README.md)                                   | Endpoint groups, wire formats, authentication, SSE semantics, and handler registration.                                         |
| [Adapters](../adapters/README.md)                                    | Store validation, construction, and migration conventions.                                                                      |
| [Storage conformance](../packages/gateway/README.md#conformance)     | Test suites every storage adapter runs, and the fixture an adapter supplies.                                                    |
| [Harness](../packages/harness/README.md)                             | The harness contract: an agent's sessions and turns in one stream format, and the bridge into sandboxes.                        |
| [Sandbox](../packages/sandbox/README.md)                             | The sandbox contract: Effect's file system and processes inside, ports, network, lifecycle, and the suites every provider runs. |
| [Channel](../packages/channel/README.md)                             | The channel transport contract: receiving what an external system sends and replying in its conversations.                      |
| [Connections](../packages/connection/README.md)                      | Integrations a host installs, the connections workspaces make to them, and the model catalog.                                   |
| [Toolkit](../packages/toolkit/README.md)                             | Tool sources, such as MCP servers and HTTP APIs, as one shape, and the toolkit built from them.                                 |
| [opencode harness](../adapters/harness-opencode/README.md)           | opencode as an agent for the harness contract, behind its bridge in a sandbox, on opencode 1 or opencode 2.                     |
| [Codex harness](../adapters/harness-codex/README.md)                 | Codex app-server behind the harness bridge, supported models, and session behavior.                                             |
| [Claude harness](../adapters/harness-claude/README.md)               | Claude Agent SDK behind the harness bridge, supported models, and session behavior.                                             |
| [amends agent](../adapters/harness-amends/README.md)                 | An agent in the host's own process for the harness contract, over an Effect AI language model.                                  |
| [Local sandboxes](../adapters/sandbox-local/README.md)               | Sandboxes as directories on this machine for the sandbox contract, for development and tests.                                   |
| [Daytona sandboxes](../adapters/sandbox-daytona/README.md)           | Sandboxes on Daytona for the sandbox contract, and running their tests with an API key.                                         |
| [E2B sandboxes](../adapters/sandbox-e2b/README.md)                   | E2B lifecycle, naming, files, processes, and provider tests.                                                                    |
| [Vercel sandboxes](../adapters/sandbox-vercel/README.md)             | Vercel lifecycle, files, processes, and provider tests.                                                                         |
| [Cluster](../packages/cluster/README.md)                             | Work outside requests on Effect Cluster: the turn job that runs agents' turns, job retries, and pruning.                        |
| [Memory storage](../packages/core/README.md#memory)                  | The in-memory reference implementation of the storage contracts, in core and the gateway.                                       |
| [PostgreSQL](../adapters/storage-postgresql/README.md)               | Schema, locking, composition, and database-specific testing.                                                                    |
| [Hosts](../hosts/README.md) / [local host](../hosts/local/README.md) | Runtime composition, configuration, startup, and development identity.                                                          |
| [Apps](../apps/README.md) / [web](../apps/web/README.md)             | Platform-owned routing and composition of client and UI.                                                                        |
| [Desktop](../apps/desktop/README.md)                                 | Tauri prerequisites, host connection, and native verification.                                                                  |
| [Client](../apps/client/README.md)                                   | Headless credential scopes, API/query state, view hooks, and route helpers.                                                     |
| [UI](../apps/ui/README.md)                                           | Pattern-based design system from the Lunacy mocks, with every app screen.                                                       |
| [Site](../apps/site/README.md)                                       | amends.dev on Astro and Starlight, with docs generated from the packages' READMEs and sources.                                  |

The shared [icons guide](../apps/icons/README.md) covers current Solid imports, canonical
drawings, generation, and visual review in the UI workshop.

## Design and historical references

- [Feature development](feature-development.md) records the agreed workflow and
  connected-feature boundary. [Sign-in](sign-in-design.md) covers accounts, sessions, email
  sign-in, and the designed identity providers, and records the first slice.
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
  [Threads](threads.md) fixes the thread model that conversations, tasks, and channel
  conversations share: the thread record, messages and their editing, tasks and channel
  bindings as rows on threads, and what changes to implement it.
- [Design-system references](../design-system/) are the Lunacy files the UI is built from:
  product and visual mocks, not implemented API schemas.
- [Vendored Effect](../repos/effect/LLMS.md) is read-only upstream reference material.
  Its documentation describes Effect, not the Amends application's capabilities.

## Contributor instructions

Start with [contributing](../CONTRIBUTING.md). [Root AGENTS.md](../AGENTS.md) applies throughout the project. More specific guidance
lives in [packages](../packages/AGENTS.md), [core](../packages/core/AGENTS.md),
[UI](../apps/ui/AGENTS.md), [client](../apps/client/AGENTS.md),
[adapters](../adapters/AGENTS.md), and [hosts](../hosts/AGENTS.md). `CLAUDE.md` links to
the root guidance rather than maintaining a second copy.

When implementation changes, update the owning guide and any affected setup examples,
then revisit the limitations page. Validate commands against workspace scripts,
contracts against schemas and handlers, and guarantees against implementation and
tests. Check local links and anchors after moves. `bun run check` validates project
checks and formatting; it does not prove documentation accuracy or validate Markdown links.
