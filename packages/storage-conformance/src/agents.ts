import { Agent, AgentApplication } from "@amends/core/agent";
import { BuiltinRoles } from "@amends/core/authorization";
import { Connection, ConnectionApplication } from "@amends/core/connection";
import { Environment, EnvironmentApplication } from "@amends/core/environment";
import type { Actor, Identity } from "@amends/core/identity";
import { Request } from "@amends/core/request";
import { MemberApplication, type Workspace } from "@amends/core/workspace";
import { Harness } from "@amends/harness";
import { SandboxImplementation } from "@amends/sandbox";
import { Gateway } from "@amends/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Harness as ConformanceHarness } from "./harness.ts";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  charlie,
  future,
  request,
  Support,
  testImplementation,
  testSandboxAccount,
} from "./support.ts";

const as = <A, E>(
  id: Workspace.Id,
  identity: Identity.MemberReference,
  use: (service: AgentApplication.Interface) => Effect.Effect<A, E, Actor.Service>,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(id, identity, Effect.flatMap(AgentApplication.Service, use)),
  );
const connect = <A, E>(
  id: Workspace.Id,
  use: (service: ConnectionApplication.Interface) => Effect.Effect<A, E, Actor.Service>,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(id, alice, Effect.flatMap(ConnectionApplication.Service, use)),
  );
const environments = <A, E>(
  id: Workspace.Id,
  use: (service: EnvironmentApplication.Interface) => Effect.Effect<A, E, Actor.Service>,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(id, alice, Effect.flatMap(EnvironmentApplication.Service, use)),
  );
const members = <A, E>(
  id: Workspace.Id,
  identity: Identity.MemberReference,
  use: (service: MemberApplication.Interface) => Effect.Effect<A, E, Actor.Service>,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(id, identity, Effect.flatMap(MemberApplication.Service, use)),
  );

/** A workspace owned by alice, in which bob is an ordinary member, with a ready model connection. */
const workspaceWithModels = Effect.gen(function* () {
  const workspace = yield* Operations.createWorkspace(alice.id);
  const invitation = yield* Operations.invite(workspace.id, alice, request(yield* future));
  yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
  const models = yield* connect(workspace.id, (service) =>
    service.create({
      name: "Models",
      implementationId: testImplementation.id,
      settings: { endpoint: "https://models.example" },
      authentication: "None",
    }),
  );
  return { workspace, models };
});

const newAgent = (
  connectionId: Connection.Id,
  changes: Partial<Agent.CreateInput> = {},
): Agent.CreateInput =>
  Object.assign(
    {
      name: "Reviewer",
      instructions: "Review each change for correctness.",
      model: { connectionId, model: "model-x", reasoning: null },
      environmentId: Environment.InProcessId,
      roleId: BuiltinRoles.MemberId,
    },
    changes,
  );

export const agents = (harness: ConformanceHarness) => {
  const { runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: agents`, () => {
    it.effect(
      "administrators create an agent as a named member; members read and use it",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, models } = yield* workspaceWithModels;
              const options = { requestKey: Request.Key.make("create-reviewer") };
              const created = yield* as(workspace.id, alice, (service) =>
                service.create(newAgent(models.id), options),
              );
              expect(created).toMatchObject({
                name: "Reviewer",
                instructions: "Review each change for correctness.",
                model: { connectionId: models.id, model: "model-x", reasoning: null },
                environmentId: Environment.InProcessId,
                configurable: true,
                usable: true,
                readiness: { _tag: "Ready" },
              });
              // A retried creation returns the same agent.
              expect(
                yield* as(workspace.id, alice, (service) =>
                  service.create(newAgent(models.id), options),
                ),
              ).toEqual(created);

              const membership = (yield* members(
                workspace.id,
                bob,
                (service) => service.list,
              )).find((member) => member.id === created.memberId);
              expect(membership).toMatchObject({
                identity: { _tag: "Agent", id: created.id },
                name: "Reviewer",
                status: "active",
              });
              expect(yield* as(workspace.id, bob, (service) => service.list)).toEqual([
                Object.assign({}, created, { configurable: false }),
              ]);

              for (const denied of [
                Effect.flip(
                  as(workspace.id, bob, (service) =>
                    service.create(newAgent(models.id, { name: "Mine" })),
                  ),
                ),
                Effect.flip(
                  as(workspace.id, bob, (service) =>
                    service.rename({
                      agentId: created.id,
                      name: "Mine",
                      expectedName: "Reviewer",
                    }),
                  ),
                ),
                Effect.flip(
                  as(workspace.id, bob, (service) =>
                    service.configure({
                      agentId: created.id,
                      instructions: "Approve everything.",
                      model: created.model,
                      environmentId: created.environmentId,
                    }),
                  ),
                ),
                Effect.flip(as(workspace.id, bob, (service) => service.remove(created.id))),
              ])
                expect(yield* denied).toMatchObject({ _tag: "Authorization.Denied" });
            }),
          ),
        ),
      60_000,
    );

    it.effect("an agent's initial role is one its creator may grant", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, models } = yield* workspaceWithModels;
            const invitation = yield* Operations.invite(
              workspace.id,
              alice,
              request(yield* future, charlie.id, BuiltinRoles.AdministratorId),
            );
            yield* Operations.acceptInvitation(workspace.id, charlie.id, invitation.details.id);
            expect(
              yield* Effect.flip(
                as(workspace.id, alice, (service) =>
                  service.create(newAgent(models.id, { roleId: BuiltinRoles.OwnerId })),
                ),
              ),
            ).toMatchObject({ _tag: "Delegation.OwnerProtected" });
            // Only the owner grants Administrator.
            expect(
              yield* Effect.flip(
                as(workspace.id, charlie, (service) =>
                  service.create(newAgent(models.id, { roleId: BuiltinRoles.AdministratorId })),
                ),
              ),
            ).toMatchObject({ _tag: "Delegation.Denied", reason: "administrator-role" });
            expect(
              yield* as(workspace.id, charlie, (service) => service.create(newAgent(models.id))),
            ).toMatchObject({ name: "Reviewer", configurable: true });
            expect(
              yield* as(workspace.id, alice, (service) =>
                service.create(
                  newAgent(models.id, { name: "Lead", roleId: BuiltinRoles.AdministratorId }),
                ),
              ),
            ).toMatchObject({ name: "Lead" });
          }),
        ),
      ),
    );

    it.effect(
      "refuses model access or an environment it cannot use, but saves setup still pending",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, models } = yield* workspaceWithModels;
              const create = (input: Agent.CreateInput) =>
                Effect.flip(as(workspace.id, alice, (service) => service.create(input)));
              const account = yield* connect(workspace.id, (service) =>
                service.create({
                  name: "Cloud account",
                  implementationId: testSandboxAccount.id,
                  settings: {},
                  authentication: "ApiKey",
                }),
              );
              const missing = Environment.Id.make("missing");
              expect(
                yield* create(
                  newAgent(models.id, {
                    model: {
                      connectionId: Connection.Id.make("gone"),
                      model: "model-x",
                      reasoning: null,
                    },
                  }),
                ),
              ).toMatchObject({ _tag: "AgentApplication.ConnectionUnavailable" });
              expect(yield* create(newAgent(models.id, { environmentId: missing }))).toEqual(
                new AgentApplication.EnvironmentUnavailable({ environmentId: missing }),
              );
              expect(yield* create(newAgent(account.id))).toEqual(
                new AgentApplication.Incompatible({ reasons: [{ _tag: "NoModelInference" }] }),
              );
              // Amends declares no reasoning levels.
              expect(
                yield* create(
                  newAgent(models.id, {
                    model: { connectionId: models.id, model: "model-x", reasoning: "high" },
                  }),
                ),
              ).toEqual(
                new AgentApplication.Incompatible({
                  reasons: [{ _tag: "ReasoningUnsupported", reasoning: "high" }],
                }),
              );

              // A connection still needing its key can be chosen; the agent shows it needs setup.
              const keyed = yield* connect(workspace.id, (service) =>
                service.create({
                  name: "Keyed models",
                  implementationId: testImplementation.id,
                  settings: { endpoint: "https://models.example" },
                  authentication: "ApiKey",
                }),
              );
              expect(
                (yield* as(workspace.id, alice, (service) =>
                  service.create(newAgent(keyed.id, { name: "Pending" })),
                )).readiness,
              ).toEqual({ _tag: "Incomplete", issues: [{ _tag: "ConnectionNotReady" }] });
            }),
          ),
        ),
    );

    it.effect("tells which environments can run a model selection", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, models } = yield* workspaceWithModels;
            const account = yield* connect(workspace.id, (service) =>
              service.create({
                name: "Cloud account",
                implementationId: testSandboxAccount.id,
                settings: {},
                authentication: "ApiKey",
              }),
            );
            const box = yield* environments(workspace.id, (service) =>
              service.create({
                name: "Cloud box",
                harnessId: Harness.Name.make("boxed"),
                sandbox: {
                  providerId: SandboxImplementation.Id.make("test-cloud"),
                  harness: "in-sandbox",
                  connectionId: account.id,
                  template: null,
                  env: {},
                  setup: [],
                  retention: "stop",
                },
              }),
            );
            const choices = yield* as(workspace.id, alice, (service) =>
              service.environmentChoices({
                model: { connectionId: models.id, model: "model-x", reasoning: "high" },
              }),
            );
            expect(
              choices.toSorted((left, right) =>
                left.environmentId < right.environmentId ? -1 : 1,
              ),
            ).toEqual(
              [
                {
                  environmentId: Environment.InProcessId,
                  compatibility: {
                    _tag: "Incompatible",
                    reasons: [{ _tag: "ReasoningUnsupported", reasoning: "high" }],
                  },
                },
                {
                  environmentId: box.id,
                  compatibility: {
                    _tag: "Incompatible",
                    reasons: [{ _tag: "EnvironmentNotReady", issues: ["connection-incomplete"] }],
                  },
                },
              ].toSorted((left, right) => (left.environmentId < right.environmentId ? -1 : 1)),
            );
            // A connection that is gone offers no choices.
            expect(
              yield* Effect.flip(
                as(workspace.id, bob, (service) =>
                  service.environmentChoices({
                    model: {
                      connectionId: Connection.Id.make("gone"),
                      model: "model-x",
                      reasoning: null,
                    },
                  }),
                ),
              ),
            ).toMatchObject({ _tag: "AgentApplication.ConnectionUnavailable" });
          }),
        ),
      ),
    );

    it.effect(
      "configures, renames through a conflict, follows its connection and environment, and is removed",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, models } = yield* workspaceWithModels;
              const created = yield* as(workspace.id, alice, (service) =>
                service.create(newAgent(models.id)),
              );
              const scratch = yield* environments(workspace.id, (service) =>
                service.create({
                  name: "Scratch",
                  harnessId: Harness.Name.make("amends"),
                  sandbox: {
                    providerId: SandboxImplementation.Id.make("test-local"),
                    harness: "in-process",
                    connectionId: null,
                    template: null,
                    env: {},
                    setup: [],
                    retention: "stop",
                  },
                }),
              );
              const configured = yield* as(workspace.id, alice, (service) =>
                service.configure({
                  agentId: created.id,
                  instructions: "Review, then summarize.",
                  model: { connectionId: models.id, model: "model-y", reasoning: null },
                  environmentId: scratch.id,
                }),
              );
              expect(configured).toMatchObject({
                instructions: "Review, then summarize.",
                model: { model: "model-y" },
                environmentId: scratch.id,
                readiness: { _tag: "Ready" },
              });
              expect(yield* as(workspace.id, alice, (service) => service.get(created.id))).toEqual(
                configured,
              );

              const renamed = yield* as(workspace.id, alice, (service) =>
                service.rename({ agentId: created.id, name: "Critic", expectedName: "Reviewer" }),
              );
              expect(renamed.name).toBe("Critic");
              expect(
                yield* Effect.flip(
                  as(workspace.id, alice, (service) =>
                    service.rename({
                      agentId: created.id,
                      name: "Other",
                      expectedName: "Reviewer",
                    }),
                  ),
                ),
              ).toEqual(new AgentApplication.Changed({ agentId: created.id }));

              // Removing what it runs with leaves the agent, which can no longer run.
              yield* environments(workspace.id, (service) => service.remove(scratch.id));
              yield* connect(workspace.id, (service) => service.remove(models.id));
              expect(
                (yield* as(workspace.id, alice, (service) => service.get(created.id))).readiness,
              ).toEqual({
                _tag: "Incomplete",
                issues: [{ _tag: "EnvironmentUnavailable" }, { _tag: "ConnectionUnavailable" }],
              });

              yield* as(workspace.id, alice, (service) => service.remove(created.id));
              expect(
                yield* Effect.flip(as(workspace.id, alice, (service) => service.get(created.id))),
              ).toEqual(new AgentApplication.NotFound({ agentId: created.id }));
              expect(yield* as(workspace.id, alice, (service) => service.list)).toEqual([]);
              expect(
                yield* members(workspace.id, alice, (service) => service.get(created.memberId)),
              ).toMatchObject({ status: "removed" });
            }),
          ),
        ),
    );
  });
};
