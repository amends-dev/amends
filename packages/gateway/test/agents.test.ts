import { Agent, AgentPermissions, AgentService, AgentStore } from "@amends-dev/core/agent";
import {
  Assignment,
  AssignmentFacts,
  AssignmentPermissions,
  BuiltinRoles,
  Grant,
} from "@amends-dev/core/authorization";
import { Connection, ConnectionPermissions, ConnectionService } from "@amends-dev/core/connection";
import { Group } from "@amends-dev/core/group";
import type { Actor, Identity } from "@amends-dev/core/identity";
import { Journal, Publication } from "@amends-dev/core/journal";
import { Request } from "@amends-dev/core/request";
import { Member, type Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Option, Redacted } from "effect";
import { withStorage } from "./fixture.ts";
import * as Operations from "./operations.ts";
import * as Support from "./support.ts";
import {
  alice,
  bob,
  boundTo,
  future,
  goodKey,
  installed,
  journalLog,
  request,
  testIntegrations,
  testProvenance,
  type Bound,
} from "./support.ts";
import { CoreError } from "@amends-dev/core/error";

const as = <A, E>(
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  use: (agentService: AgentService.AgentService["Service"]) => Effect.Effect<A, E, Actor.Actor>,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    gateway.asMember(workspaceId, identity, Effect.flatMap(AgentService.AgentService, use)),
  );

/** A connection alice creates in the workspace. */
const connect = (workspaceId: Workspace.Id, input: Connection.CreateInput) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    gateway.asMember(
      workspaceId,
      alice,
      Effect.flatMap(ConnectionService.ConnectionService, (connectionService) =>
        connectionService.create(input),
      ),
    ),
  );

/** A connection alice removes from the workspace. */
const disconnect = (workspaceId: Workspace.Id, connectionId: Connection.Id) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    gateway.asMember(
      workspaceId,
      alice,
      Effect.flatMap(ConnectionService.ConnectionService, (connectionService) =>
        connectionService.remove(connectionId),
      ),
    ),
  );

/**
 * A workspace owned by alice, in which bob is an ordinary member, with a connection for each part
 * of an agent: models, sandboxes, a harness whose agent works only in a sandbox, one whose agent
 * works in the host's process, and tools, which give an agent no part.
 */
const workspaceWithConnections = Effect.gen(function* () {
  const workspace = yield* Operations.createWorkspace(alice.id);
  const invitation = yield* Operations.invite(workspace.id, alice, request(yield* future));
  const bobMember = yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
  const connections = {
    models: yield* connect(workspace.id, {
      integration: "test-models",
      name: "Models",
      settings: { endpoint: "https://models.example" },
      auth: "apiKey",
      apiKey: Redacted.make(goodKey),
    }),
    sandboxes: yield* connect(workspace.id, {
      integration: "test-sandboxes",
      name: "Sandboxes",
      settings: {},
      auth: "none",
    }),
    boxed: yield* connect(workspace.id, {
      integration: "test-harness",
      name: "Boxed harness",
      settings: {},
      auth: "none",
    }),
    inProcess: yield* connect(workspace.id, {
      integration: "test-in-process",
      name: "In-process harness",
      settings: {},
      auth: "none",
    }),
    tools: yield* connect(workspace.id, {
      integration: "test-tools",
      name: "Tools",
      settings: {},
      auth: "none",
    }),
  };
  return { workspace, bobMemberId: bobMember.id, connections };
});

type Connections = Effect.Success<typeof workspaceWithConnections>["connections"];

/** An agent that reviews in a sandbox, on the boxed harness and the test model. */
const reviewer = (connections: Connections): Agent.CreateInput => ({
  name: "Reviewer",
  roleId: BuiltinRoles.MemberId,
  instructions: "Review each change.",
  harness: { _tag: "Connection", connectionId: connections.boxed.id },
  model: { connectionId: connections.models.id, id: "test-model", effort: "high" },
  sandbox: { connectionId: connections.sandboxes.id },
});

/** An agent that plans in the host's process, on the in-process harness and the test model. */
const planning = (connections: Connections): Agent.CreateInput => ({
  name: "Planner",
  roleId: BuiltinRoles.MemberId,
  instructions: "Plan each change.",
  harness: { _tag: "Connection", connectionId: connections.inProcess.id },
  model: { connectionId: connections.models.id, id: "test-model" },
  sandbox: null,
});

/** Agents by id, as a test compares stored ones, which storage keeps in no particular order. */
const byId = (left: Agent.Agent, right: Agent.Agent) => (left.id < right.id ? -1 : 1);
const storedAgents = (bound: Bound) =>
  Effect.map(bound.agents.list, (records) => records.toSorted(byId));

/** A new agent like `input`, with `changes`. */
const changed = (
  input: Agent.CreateInput,
  changes: Partial<Agent.CreateInput>,
): Agent.CreateInput => Object.assign({}, input, changes);

/** How an agent created from `input` is set up, to configure it as `input` says. */
const configurationOf = (agentId: Agent.Id, input: Agent.CreateInput) => ({
  agentId,
  instructions: input.instructions,
  harness: input.harness,
  model: input.model,
  sandbox: input.sandbox,
});

/** An operation a test runs as some member, whatever it answers. */
type Operation = (
  agentService: AgentService.AgentService["Service"],
) => Effect.Effect<unknown, unknown, Actor.Actor>;

const { core, gateway, runGateway } = Support;
let directGrants = 0;
/** Give the member each of `grants` directly, which no operation does. */
const grant = (bound: Bound, memberId: Member.Id, grants: ReadonlyArray<Grant.Grant>) =>
  Effect.flatMap(Journal.Journal, (journal) =>
    journal.commit(
      Effect.forEach(
        grants,
        (value) =>
          journal.publish(AssignmentFacts.Created, {
            assignmentId: Assignment.Id.make(`direct-${(directGrants += 1)}`),
            workspaceId: bound.store.workspaceId,
            memberId,
            source: { _tag: "Direct", grant: value },
          }),
        { discard: true },
      ),
    ),
  ).pipe(
    Effect.provideService(Publication.Publication, testProvenance(bound.store.workspaceId)),
    Effect.provide(core(bound)),
  );
/** Take every role the member has away, as alice. */
const revokeRoles = (bound: Bound, memberId: Member.Id) =>
  Effect.flatMap(bound.assignments.listActiveByMember(memberId), (assignments) =>
    Effect.forEach(
      assignments,
      (assignment) =>
        Operations.revokeAssignment(bound.store.workspaceId, alice, memberId, assignment.id),
      { discard: true },
    ),
  );
describe("agents", () => {
  it.effect(
    "creates an agent as a member, which members read and only administrators configure",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, bobMemberId, connections } = yield* workspaceWithConnections;
            const bound = yield* boundTo(workspace.id);
            const created = yield* as(workspace.id, alice, (agentService) =>
              agentService.create(reviewer(connections)),
            );
            expect(created).toMatchObject({
              name: "Reviewer",
              instructions: "Review each change.",
              harness: { _tag: "Connection", connectionId: connections.boxed.id },
              model: { connectionId: connections.models.id, id: "test-model", effort: "high" },
              sandbox: { connectionId: connections.sandboxes.id },
              readiness: { _tag: "Ready" },
              configurable: true,
              createdBy: workspace.ownerMemberId,
            });
            expect(yield* as(workspace.id, alice, (agentService) => agentService.list)).toEqual([
              created,
            ]);
            expect(yield* bound.agents.get(created.id)).toEqual(
              Option.some({
                id: created.id,
                workspaceId: workspace.id,
                memberId: created.memberId,
                instructions: created.instructions,
                harness: created.harness,
                model: created.model,
                sandbox: created.sandbox,
                createdBy: created.createdBy,
                createdAt: created.createdAt,
              }),
            );

            // The agent joins as a member does: named, with its role, and in the general group.
            expect(Option.getOrThrow(yield* bound.members.get(created.memberId))).toMatchObject({
              identity: { _tag: "Agent", id: created.id },
              name: "Reviewer",
              status: "active",
            });
            expect(yield* bound.assignments.listActiveByMember(created.memberId)).toMatchObject([
              { source: { _tag: "Role", roleId: BuiltinRoles.MemberId } },
            ]);
            expect(
              (yield* bound.groupMemberships.listByGroup(Group.GeneralId)).filter(
                (record) => record.memberId === created.memberId,
              ),
            ).toMatchObject([{ status: "active" }]);

            // A member reads the same agent, told they may not configure it.
            const read = Object.assign({}, created, { configurable: false });
            expect(yield* as(workspace.id, bob, (agentService) => agentService.list)).toEqual([
              read,
            ]);
            expect(
              yield* as(workspace.id, bob, (agentService) => agentService.get(created.id)),
            ).toEqual(read);
            const operations: ReadonlyArray<Operation> = [
              (agentService) => agentService.create(reviewer(connections)),
              (agentService) =>
                agentService.configure(configurationOf(created.id, reviewer(connections))),
              (agentService) =>
                agentService.rename({
                  agentId: created.id,
                  name: "Mine",
                  expectedName: "Reviewer",
                }),
            ];
            for (const denied of operations)
              expect(yield* Effect.flip(as(workspace.id, bob, denied))).toMatchObject({
                _tag: "CoreError.Denied",
                reason: { _tag: "NotGranted" },
              });
            // An agent starts with a role its creator may grant, which the owner's never is.
            expect(
              yield* Effect.flip(
                as(workspace.id, alice, (agentService) =>
                  agentService.create(
                    changed(reviewer(connections), { roleId: BuiltinRoles.OwnerId }),
                  ),
                ),
              ),
            ).toMatchObject({ _tag: "CoreError.Conflict", reason: { _tag: "OwnerProtected" } });

            // Without a role, a member reads no agents, and each is missing to them.
            yield* revokeRoles(bound, bobMemberId);
            expect(yield* as(workspace.id, bob, (agentService) => agentService.list)).toEqual([]);
            const hidden: ReadonlyArray<Operation> = [
              (agentService) => agentService.get(created.id),
              (agentService) =>
                agentService.configure(configurationOf(created.id, reviewer(connections))),
              (agentService) =>
                agentService.rename({
                  agentId: created.id,
                  name: "Mine",
                  expectedName: "Reviewer",
                }),
            ];
            for (const missing of hidden)
              expect(yield* Effect.flip(as(workspace.id, bob, missing))).toEqual(
                new CoreError.NotFound({ resource: "Agent", id: created.id }),
              );
          }),
        ),
      ),
    60_000,
  );

  it.effect(
    "refuses a setup naming a connection it cannot use, or that cannot run, and creates nothing",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, connections } = yield* workspaceWithConnections;
            const bound = yield* boundTo(workspace.id);
            yield* disconnect(workspace.id, connections.inProcess.id);
            const before = yield* bound.store.read(journalLog, { limit: 200 });
            const input = reviewer(connections);
            const refused = (refusedInput: Agent.CreateInput) =>
              Effect.flip(
                as(workspace.id, alice, (agentService) => agentService.create(refusedInput)),
              );

            const missing = Connection.Id.make("missing");
            expect(
              yield* refused(
                changed(input, { model: { connectionId: missing, id: "test-model" } }),
              ),
            ).toEqual(
              new AgentService.ConnectionUnavailable({ part: "model", connectionId: missing }),
            );
            expect(
              yield* refused(
                changed(input, {
                  harness: { _tag: "Connection", connectionId: connections.inProcess.id },
                }),
              ),
            ).toEqual(
              new AgentService.ConnectionUnavailable({
                part: "harness",
                connectionId: connections.inProcess.id,
              }),
            );
            expect(yield* refused(changed(input, { sandbox: null }))).toEqual(
              new AgentService.Incomplete({ issues: [{ _tag: "SandboxRequired" }] }),
            );
            expect(
              yield* refused(
                changed(input, {
                  harness: { _tag: "Connection", connectionId: connections.models.id },
                  model: { connectionId: connections.tools.id, id: "test-model" },
                  sandbox: { connectionId: connections.boxed.id },
                }),
              ),
            ).toEqual(
              new AgentService.Incomplete({
                issues: [
                  {
                    _tag: "Invalid",
                    part: "harness",
                    description: "Test models gives no harnesses",
                  },
                  { _tag: "Invalid", part: "model", description: "Test tools gives no models" },
                  {
                    _tag: "Invalid",
                    part: "sandbox",
                    description: "Test harness gives no sandboxes",
                  },
                ],
              }),
            );
            expect(
              yield* refused(
                changed(input, {
                  model: { connectionId: connections.models.id, id: "test-model", effort: "max" },
                }),
              ),
            ).toEqual(
              new AgentService.Incomplete({
                issues: [
                  {
                    _tag: "Invalid",
                    part: "model",
                    description: "Test model takes no effort max",
                  },
                ],
              }),
            );
            // Instructions with surrounding space are not a request at all.
            expect(
              yield* refused(changed(input, { instructions: " Review each change. " })),
            ).toMatchObject({ _tag: "GatewayErrors.InvalidInput" });

            expect(yield* bound.store.read(journalLog, { limit: 200 })).toEqual(before);
            expect(yield* bound.agents.list).toEqual([]);
          }),
        ),
      ),
    60_000,
  );

  it.effect(
    "gives an agent only connections the actor may read and use, each checked",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, bobMemberId, connections } = yield* workspaceWithConnections;
            const bound = yield* boundTo(workspace.id);
            yield* revokeRoles(bound, bobMemberId);
            const inWorkspace = { _tag: "Workspace", workspaceId: workspace.id } as const;
            const onConnection = (connectionId: Connection.Id) =>
              ({
                _tag: "Target",
                target: { _tag: "Connection", workspaceId: workspace.id, connectionId },
              }) as const;
            const create = as(workspace.id, bob, (agentService) =>
              agentService.create(reviewer(connections)),
            );
            // Bob may grant roles, and read and use the harness only, but not create agents.
            yield* grant(bound, bobMemberId, [
              Grant.make(AssignmentPermissions.Manage, inWorkspace),
              Grant.make(ConnectionPermissions.Read, onConnection(connections.boxed.id)),
              Grant.make(ConnectionPermissions.Use, onConnection(connections.boxed.id)),
              Grant.make(ConnectionPermissions.Read, onConnection(connections.models.id)),
              Grant.make(ConnectionPermissions.Use, onConnection(connections.sandboxes.id)),
            ]);
            expect(yield* Effect.flip(create)).toMatchObject({
              _tag: "CoreError.Denied",
              reason: { _tag: "NotGranted" },
            });
            yield* grant(bound, bobMemberId, [Grant.make(AgentPermissions.Create, inWorkspace)]);
            expect(yield* Effect.flip(create)).toEqual(
              new AgentService.ConnectionUnavailable({
                part: "model",
                connectionId: connections.models.id,
              }),
            );
            yield* grant(bound, bobMemberId, [
              Grant.make(ConnectionPermissions.Use, onConnection(connections.models.id)),
            ]);
            expect(yield* Effect.flip(create)).toEqual(
              new AgentService.ConnectionUnavailable({
                part: "sandbox",
                connectionId: connections.sandboxes.id,
              }),
            );
            expect(yield* bound.agents.list).toEqual([]);

            yield* grant(bound, bobMemberId, [
              Grant.make(ConnectionPermissions.Read, onConnection(connections.sandboxes.id)),
            ]);
            expect(yield* create).toMatchObject({
              readiness: { _tag: "Ready" },
              configurable: false,
              createdBy: bobMemberId,
            });
          }),
        ),
      ),
    60_000,
  );

  it.effect("stores an agent once, for one membership, and changes only a stored one", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const { workspace, connections } = yield* workspaceWithConnections;
          const bound = yield* boundTo(workspace.id);
          const created = yield* as(workspace.id, alice, (agentService) =>
            agentService.create(reviewer(connections)),
          );
          const planner = yield* as(workspace.id, alice, (agentService) =>
            agentService.create(planning(connections)),
          );
          const stored = Option.getOrThrow(yield* bound.agents.get(created.id));
          const storedPlanner = Option.getOrThrow(yield* bound.agents.get(planner.id));
          const writes = [
            bound.agents.insert(stored),
            bound.agents.insert(Agent.change(stored, { id: Agent.Id.make("second") })),
            bound.agents.update(Agent.change(stored, { memberId: planner.memberId })),
            bound.agents.update(
              Agent.change(stored, {
                id: Agent.Id.make("missing"),
                memberId: Member.Id.make("missing-member"),
              }),
            ),
          ];
          for (const write of writes)
            expect(yield* Effect.flip(bound.store.transaction(write))).toBeInstanceOf(
              AgentStore.Conflict,
            );
          expect(yield* storedAgents(bound)).toEqual([stored, storedPlanner].toSorted(byId));
          // A stored agent is replaced as a whole.
          const replaced = Agent.change(stored, {
            instructions: "Review each change, then test it.",
            sandbox: null,
            createdAt: yield* DateTime.now,
          });
          yield* bound.store.transaction(bound.agents.update(replaced));
          expect(yield* bound.agents.get(created.id)).toEqual(Option.some(replaced));
        }),
      ),
    ),
  );

  it.effect("configures and renames an agent, recording nothing when nothing changes", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const { workspace, connections } = yield* workspaceWithConnections;
          const bound = yield* boundTo(workspace.id);
          const created = yield* as(workspace.id, alice, (agentService) =>
            agentService.create(reviewer(connections)),
          );
          const inProcess = changed(reviewer(connections), {
            instructions: "Answer questions about the code.",
            harness: { _tag: "Connection", connectionId: connections.inProcess.id },
            model: { connectionId: connections.models.id, id: "other-model" },
            sandbox: null,
          });
          const configure = (input: Agent.CreateInput) =>
            as(workspace.id, alice, (agentService) =>
              agentService.configure(configurationOf(created.id, input)),
            );

          const configured = yield* configure(inProcess);
          expect(configured).toEqual(
            Object.assign({}, created, {
              instructions: inProcess.instructions,
              harness: inProcess.harness,
              model: inProcess.model,
              sandbox: null,
            }),
          );
          expect(
            yield* as(workspace.id, alice, (agentService) => agentService.get(created.id)),
          ).toEqual(configured);

          // The same setup again, or one that cannot run, records nothing.
          const before = yield* bound.store.read(journalLog, { limit: 200 });
          expect(yield* configure(inProcess)).toEqual(configured);
          expect(
            yield* Effect.flip(
              configure(
                changed(inProcess, {
                  harness: { _tag: "Connection", connectionId: connections.boxed.id },
                }),
              ),
            ),
          ).toEqual(new AgentService.Incomplete({ issues: [{ _tag: "SandboxRequired" }] }));
          expect(yield* bound.store.read(journalLog, { limit: 200 })).toEqual(before);

          const rename = (name: string, expectedName: string) =>
            as(workspace.id, alice, (agentService) =>
              agentService.rename({ agentId: created.id, name, expectedName }),
            );
          const listedNames = Effect.map(
            as(workspace.id, alice, (agentService) => agentService.list),
            (agents) => agents.map(({ name }) => name),
          );
          yield* as(workspace.id, alice, (agentService) =>
            agentService.create(planning(connections)),
          );
          expect(yield* listedNames).toEqual(["Planner", "Reviewer"]);
          const renamed = yield* rename("Answerer", "Reviewer");
          expect(renamed).toEqual(Object.assign({}, configured, { name: "Answerer" }));
          // The list is in name order, whatever the agents' ids.
          expect(yield* listedNames).toEqual(["Answerer", "Planner"]);
          expect(
            Option.map(yield* bound.members.get(created.memberId), (member) => member.name),
          ).toEqual(Option.some("Answerer"));
          expect(yield* Effect.flip(rename("Other", "Reviewer"))).toEqual(
            new CoreError.Changed({ resource: "Agent", id: created.id }),
          );
          // Renaming to the name it has is done already, whatever name was expected.
          expect(yield* rename("Answerer", "Reviewer")).toEqual(renamed);

          const unknown = Agent.Id.make("unknown");
          const operations: ReadonlyArray<Operation> = [
            (agentService) => agentService.get(unknown),
            (agentService) => agentService.configure(configurationOf(unknown, inProcess)),
            (agentService) =>
              agentService.rename({
                agentId: unknown,
                name: "Other",
                expectedName: "Answerer",
              }),
          ];
          for (const missing of operations)
            expect(yield* Effect.flip(as(workspace.id, alice, missing))).toEqual(
              new CoreError.NotFound({ resource: "Agent", id: unknown }),
            );
        }),
      ),
    ),
  );

  it.effect(
    "removes an agent with its membership, and returns the first when a create is retried",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, connections } = yield* workspaceWithConnections;
            const bound = yield* boundTo(workspace.id);
            const options = { requestKey: Request.Key.make("create-reviewer") };
            const create = (input: Agent.CreateInput) =>
              as(workspace.id, alice, (agentService) => agentService.create(input, options));
            const first = yield* create(reviewer(connections));
            expect(yield* create(reviewer(connections))).toEqual(first);
            // The key alone names the request: reused with another body, it returns the first.
            expect(yield* create(changed(reviewer(connections), { name: "Other" }))).toEqual(first);
            expect(yield* as(workspace.id, alice, (agentService) => agentService.list)).toEqual([
              first,
            ]);

            yield* Operations.removeMember(workspace.id, alice, first.memberId);
            const gone = new CoreError.NotFound({ resource: "Agent", id: first.id });
            expect(yield* as(workspace.id, alice, (agentService) => agentService.list)).toEqual([]);
            const operations: ReadonlyArray<Operation> = [
              (agentService) => agentService.get(first.id),
              (agentService) =>
                agentService.configure(configurationOf(first.id, reviewer(connections))),
              (agentService) =>
                agentService.rename({
                  agentId: first.id,
                  name: "Other",
                  expectedName: "Reviewer",
                }),
            ];
            for (const removed of operations)
              expect(yield* Effect.flip(as(workspace.id, alice, removed))).toEqual(gone);
            expect(yield* Effect.flip(create(reviewer(connections)))).toEqual(gone);
            // The agent stays recorded, as its departed membership does.
            expect(Option.isSome(yield* bound.agents.get(first.id))).toBe(true);
          }),
        ),
      ),
    60_000,
  );

  it.effect(
    "shows each agent as ready as its connections and the host's integrations now find them",
    () =>
      withStorage((storage) =>
        Effect.gen(function* () {
          const { workspace, connections, auto, reviewing } = yield* runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, connections } = yield* workspaceWithConnections;
              yield* disconnect(workspace.id, connections.inProcess.id);
              // An agent on Auto may wait for a harness it can run on.
              const auto = yield* as(workspace.id, alice, (agentService) =>
                agentService.create(
                  changed(reviewer(connections), {
                    name: "Auto",
                    harness: { _tag: "Auto" },
                    sandbox: null,
                  }),
                ),
              );
              expect(auto.readiness).toEqual({
                _tag: "Incomplete",
                issues: [{ _tag: "NoHarness" }],
              });
              const reviewing = yield* as(workspace.id, alice, (agentService) =>
                agentService.create(reviewer(connections)),
              );
              const inProcess = yield* connect(workspace.id, {
                integration: "test-in-process",
                name: "In-process harness",
                settings: {},
                auth: "none",
              });
              expect(
                yield* as(workspace.id, alice, (agentService) => agentService.get(auto.id)),
              ).toMatchObject({ readiness: { _tag: "Ready" } });
              yield* disconnect(workspace.id, connections.sandboxes.id);
              expect(
                yield* as(workspace.id, alice, (agentService) => agentService.get(reviewing.id)),
              ).toMatchObject({
                readiness: {
                  _tag: "Incomplete",
                  issues: [{ _tag: "Removed", part: "sandbox" }],
                },
              });
              return {
                workspace,
                connections: Object.assign({}, connections, { inProcess }),
                auto,
                reviewing,
              };
            }),
          );
          // Another host installs neither harness.
          const host = yield* storage.connect();
          yield* Effect.gen(function* () {
            const listed = yield* as(workspace.id, alice, (agentService) => agentService.list);
            expect(listed.map(({ id, readiness }) => ({ id, readiness }))).toEqual([
              { id: auto.id, readiness: { _tag: "Incomplete", issues: [{ _tag: "NoHarness" }] } },
              {
                id: reviewing.id,
                readiness: {
                  _tag: "Incomplete",
                  issues: [
                    { _tag: "Uninstalled", part: "harness" },
                    { _tag: "Removed", part: "sandbox" },
                  ],
                },
              },
            ]);
            // Nor can it be set up on them there.
            expect(
              yield* Effect.flip(
                as(workspace.id, alice, (agentService) =>
                  agentService.configure(
                    configurationOf(
                      auto.id,
                      changed(reviewer(connections), {
                        harness: { _tag: "Connection", connectionId: connections.inProcess.id },
                        sandbox: null,
                      }),
                    ),
                  ),
                ),
              ),
            ).toEqual(
              new AgentService.Incomplete({
                issues: [{ _tag: "Uninstalled", part: "harness" }],
              }),
            );
          }).pipe(
            Effect.provide(
              gateway(host, {
                ...installed,
                integrations: testIntegrations.filter(
                  ({ id }) => id !== "test-harness" && id !== "test-in-process",
                ),
              }),
            ),
          );
        }),
      ),
    60_000,
  );

  it.effect("rebuilds agents from the journal", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const { workspace, connections } = yield* workspaceWithConnections;
          const bound = yield* boundTo(workspace.id);
          const reviewing = yield* as(workspace.id, alice, (agentService) =>
            agentService.create(reviewer(connections)),
          );
          const answering = yield* as(workspace.id, alice, (agentService) =>
            agentService.create(
              changed(reviewer(connections), {
                name: "Answerer",
                harness: { _tag: "Auto" },
                model: { connectionId: connections.models.id, id: "other-model" },
                sandbox: null,
              }),
            ),
          );
          yield* as(workspace.id, alice, (agentService) =>
            agentService.configure(
              configurationOf(
                reviewing.id,
                changed(reviewer(connections), {
                  instructions: "Review each change, then test it.",
                  model: { connectionId: connections.models.id, id: "test-model", effort: "low" },
                }),
              ),
            ),
          );
          yield* Operations.removeMember(workspace.id, alice, answering.memberId);
          const records = yield* storedAgents(bound);
          expect(records).toHaveLength(2);

          yield* storage.discardProjections;
          expect(yield* bound.agents.list).toEqual([]);
          yield* Effect.flatMap(Journal.Journal, (journal) => journal.replay).pipe(
            Effect.provide(core(bound)),
          );
          expect(yield* storedAgents(bound)).toEqual(records);
        }),
      ),
    ),
  );
});
