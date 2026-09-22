# Documentation

Use the implementation guides for current behavior and the design documents for
intended domain rules. A design marked “agreed” or “accepted” is not a claim that
every feature is implemented. [Known limitations](current-status.md) records the
remaining gaps with links to their owning code.

## Current implementation

| Guide                                                                                                   | Scope                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [Repository README](../README.md)                                                                       | Setup, workspace layout, tooling, and dependency updates.                                                           |
| [Workspace workflows](workspace-workflows.md)                                                           | Creation, membership, invitations, access, and ownership transfer.                                                  |
| [Group workflows](group-workflows.md)                                                                   | Private team creation, authorized reads, audience checks, membership lifecycle, and current limits.                 |
| [Thread workflows](thread-workflows.md)                                                                 | Private-group starts, reads, participation, notification sources, human acknowledgment, and replay.                 |
| [Journal and logs](journal.md)                                                                          | Storage envelopes, publication, transactions, replay, and durable tails. Turn examples illustrate future consumers. |
| [Testing](testing.md)                                                                                   | Test commands, Effect test APIs, and database fixtures.                                                             |
| [Shared packages](../packages/README.md)                                                                | Package boundaries, names, and construction conventions.                                                            |
| [Core](../packages/core/README.md)                                                                      | Implemented domains, operation boundaries, and public services.                                                     |
| [Gateway](../packages/gateway/README.md)                                                                | Workspace boot, identity resolution, host contracts, and bus lifetime.                                              |
| [HTTP contract](../packages/api-http/README.md)                                                         | Endpoint groups, wire formats, authentication, and SSE semantics.                                                   |
| [HTTP server](../packages/server-http/README.md)                                                        | Handler registration, request scopes, and authentication wiring.                                                    |
| [Adapters](../adapters/README.md)                                                                       | Store validation, construction, and migration conventions.                                                          |
| [SQLite](../adapters/storage-sqlite/README.md) / [PostgreSQL](../adapters/storage-postgresql/README.md) | Schema, locking, composition, and database-specific testing.                                                        |
| [Hosts](../hosts/README.md) / [local host](../hosts/local/README.md)                                    | Runtime composition, configuration, startup, and development identity.                                              |
| [Apps](../apps/README.md) / [web](../apps/web/README.md)                                                | Implemented clients, queries, sessions, and routes.                                                                 |
| [UI](../apps/ui/README.md)                                                                              | Component contracts, styles, accessibility, and composition patterns.                                               |
| [Design system](../apps/design-system/README.md)                                                        | Shared product components, Storybook states, portable interaction tests, and web integration.                       |
| [Frontend](../apps/frontend/README.md)                                                                  | Shared frontend workshop, color/typography/spacing foundations, Text primitive, and incremental development.        |

## Design and historical references

- [Core model](core-model.md) is living design intent. Workspace management is
  implemented, along with private team creation, authorized reads, and membership admission/departure in core; private-group opening messages also create participation, ordered activity, and notifications. Authorized thread reads, human replies, self-follow/unfollow, notification-source resolution, and human acknowledgment are implemented in core; other group workflows, turns, execution, triage,
  and channel delivery remain planned. Its opening status note links to current guides.
- [Effect capability map](effect-capability-map.md) records an earlier source review
  and architecture proposal. Its module inventory reflects the pinned source;
  proposed workflow, cluster, AI, and MCP choices are not implemented integrations.
- [Web architecture proposal](web-architecture-proposal.md) preserves accepted design
  rationale and findings from before the refactor. The web/UI READMEs own current
  interfaces; the proposed TurnLog backend and component remain future work.
- [Design-system references](../design-system/) are product and visual mocks, not
  implemented API schemas. [Token sync](../design-system/sync/README.md) explains the
  historical handoff and points to the current token and style modules.
- [Vendored Effect](../repos/effect/LLMS.md) is read-only upstream reference material.
  Its documentation describes Effect, not the Amends application's capabilities.

## Contributor instructions

[Root AGENTS.md](../AGENTS.md) applies throughout the project. More specific guidance
lives in [packages](../packages/AGENTS.md), [core](../packages/core/AGENTS.md), [design-system](../apps/design-system/AGENTS.md),
[frontend](../apps/frontend/AGENTS.md),
[adapters](../adapters/AGENTS.md), and [hosts](../hosts/AGENTS.md). `CLAUDE.md` links to
the root guidance rather than maintaining a second copy.

When implementation changes, update the owning guide and any affected setup examples,
then revisit the limitations page. Validate commands against workspace scripts,
contracts against schemas and handlers, and guarantees against implementation and
tests. Check local links and anchors after moves. `bun run check` validates project
checks and formatting; it does not prove documentation accuracy or validate Markdown links.
