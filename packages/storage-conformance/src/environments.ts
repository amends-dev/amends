import { Connection, ConnectionService } from "@amends/core/connection";
import {
  Environment,
  EnvironmentService,
  EnvironmentCompatibility,
} from "@amends/core/environment";
import type { Actor, Identity } from "@amends/core/identity";
import { Member, type Workspace } from "@amends/core/workspace";
import { Harness } from "@amends/harness";
import { SandboxImplementation } from "@amends/sandbox";
import { Gateway } from "@amends/gateway";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Redacted } from "effect";
import type { Harness as ConformanceHarness } from "./harness.ts";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  future,
  request,
  Support,
  testHarnesses,
  testImplementation,
  testSandboxAccount,
} from "./support.ts";

const as = <A, E>(
  id: Workspace.Id,
  identity: Identity.MemberReference,
  use: (service: EnvironmentService.Interface) => Effect.Effect<A, E, Actor.Service>,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(id, identity, Effect.flatMap(EnvironmentService.Service, use)),
  );
const connect = <A, E>(
  id: Workspace.Id,
  use: (service: ConnectionService.Interface) => Effect.Effect<A, E, Actor.Service>,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(id, alice, Effect.flatMap(ConnectionService.Service, use)),
  );

/** A workspace owned by alice, in which bob is an ordinary member. */
const workspaceWithMember = Effect.gen(function* () {
  const workspace = yield* Operations.createWorkspace(alice.id);
  const invitation = yield* Operations.invite(workspace.id, alice, request(yield* future));
  yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
  return workspace;
});

const amends = Harness.Name.make("amends");
const boxed = Harness.Name.make("boxed");
const local = SandboxImplementation.Id.make("test-local");
const cloud = SandboxImplementation.Id.make("test-cloud");
const settings: Environment.SandboxSettings = {
  connectionId: null,
  template: null,
  env: {},
  setup: [],
  retention: "stop",
};
const sandboxed = (
  sandbox: Partial<Environment.NewSandbox>,
  name = "Sandboxed",
): Environment.CreateInput => ({
  name,
  harnessId: amends,
  sandbox: Object.assign({ providerId: local, harness: "in-process" as const }, settings, sandbox),
});

export const environments = (harness: ConformanceHarness) => {
  const { runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: environments`, () => {
    it.effect(
      "a workspace starts with the in-process environment, which members read and administrators manage",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const workspace = yield* workspaceWithMember;
              const [inProcess] = yield* as(workspace.id, alice, (service) => service.list);
              expect(inProcess).toMatchObject({
                id: Environment.InProcessId,
                name: "In-process",
                harnessId: "amends",
                sandbox: null,
                createdBy: null,
                manageable: true,
                readiness: { _tag: "Ready" },
              });
              expect(
                yield* as(workspace.id, alice, (service) =>
                  Effect.succeed(service.implementations),
                ),
              ).toMatchObject({
                harnesses: [{ id: "amends" }, { id: "boxed" }],
                sandboxes: [{ id: "test-local" }, { id: "test-cloud" }],
              });

              expect(
                yield* as(workspace.id, bob, (service) => service.get(Environment.InProcessId)),
              ).toMatchObject({ id: Environment.InProcessId, manageable: false });
              for (const denied of [
                Effect.flip(as(workspace.id, bob, (service) => service.create(sandboxed({})))),
                Effect.flip(
                  as(workspace.id, bob, (service) =>
                    service.rename({
                      environmentId: Environment.InProcessId,
                      name: "Mine",
                      expectedName: "In-process",
                    }),
                  ),
                ),
                Effect.flip(
                  as(workspace.id, bob, (service) => service.remove(Environment.InProcessId)),
                ),
              ])
                expect(yield* denied).toMatchObject({ _tag: "Authorization.Denied" });
            }),
          ),
        ),
      60_000,
    );

    it.effect("checks the harness, where it runs, the provider, and the account", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const create = (input: Environment.CreateInput) =>
              Effect.flip(as(workspace.id, alice, (service) => service.create(input)));
            const models = yield* connect(workspace.id, (service) =>
              service.create({
                name: "Models",
                implementationId: testImplementation.id,
                settings: { endpoint: "https://models.example" },
                authentication: "None",
              }),
            );
            expect(
              yield* create({
                name: "Other",
                harnessId: Harness.Name.make("other"),
                sandbox: null,
              }),
            ).toEqual(
              new EnvironmentService.UnknownHarness({ harnessId: Harness.Name.make("other") }),
            );
            // Boxed runs only inside a sandbox, and amends only in process.
            expect(yield* create({ name: "Boxed", harnessId: boxed, sandbox: null })).toEqual(
              new EnvironmentService.UnsupportedPlacement({
                harnessId: boxed,
                placement: "in-process",
              }),
            );
            expect(yield* create(sandboxed({ harness: "in-sandbox" }))).toEqual(
              new EnvironmentService.UnsupportedPlacement({
                harnessId: amends,
                placement: "in-sandbox",
              }),
            );
            expect(
              yield* create(sandboxed({ providerId: SandboxImplementation.Id.make("gone") })),
            ).toEqual(
              new EnvironmentService.UnknownSandboxProvider({
                providerId: SandboxImplementation.Id.make("gone"),
              }),
            );
            expect(yield* create(sandboxed({ providerId: cloud }))).toEqual(
              new EnvironmentService.InvalidSandbox({ issues: ["connection-required"] }),
            );
            expect(
              yield* create(sandboxed({ providerId: cloud, connectionId: models.id })),
            ).toEqual(new EnvironmentService.InvalidSandbox({ issues: ["connection-mismatch"] }));
            expect(
              yield* create(sandboxed({ connectionId: models.id, template: "ubuntu" })),
            ).toEqual(
              new EnvironmentService.InvalidSandbox({
                issues: ["connection-not-allowed", "template-not-allowed"],
              }),
            );
          }),
        ),
      ),
    );

    it.effect(
      "a hosted sandbox is ready once its account connection is, and stays until removed",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const workspace = yield* Operations.createWorkspace(alice.id);
              const account = yield* connect(workspace.id, (service) =>
                service.create({
                  name: "Cloud account",
                  implementationId: testSandboxAccount.id,
                  settings: {},
                  authentication: "ApiKey",
                }),
              );
              const box = yield* as(workspace.id, alice, (service) =>
                service.create(
                  Object.assign(
                    sandboxed(
                      {
                        providerId: cloud,
                        harness: "in-sandbox",
                        connectionId: account.id,
                        template: "node-22",
                        env: { NODE_ENV: "development" },
                        setup: ["npm install -g opencode"],
                      },
                      "Cloud box",
                    ),
                    { harnessId: boxed },
                  ),
                ),
              );
              expect(box).toMatchObject({
                name: "Cloud box",
                harnessId: "boxed",
                sandbox: {
                  providerId: "test-cloud",
                  harness: "in-sandbox",
                  connectionId: account.id,
                  template: "node-22",
                  env: { NODE_ENV: "development" },
                  setup: ["npm install -g opencode"],
                  retention: "stop",
                },
                readiness: { _tag: "Incomplete", issues: ["connection-incomplete"] },
              });

              yield* connect(workspace.id, (service) =>
                service.setCredential({
                  connectionId: account.id,
                  secret: Redacted.make("cloud-key"),
                }),
              ).pipe(
                Effect.catchTag("ConnectionService.CredentialsUnavailable", () => Effect.void),
              );
              const keyed = yield* connect(workspace.id, (service) => service.get(account.id));
              const read = yield* as(workspace.id, alice, (service) => service.get(box.id));
              expect(read.readiness).toEqual(
                keyed.authentication._tag === "ApiKey" && keyed.authentication.configured
                  ? { _tag: "Ready" }
                  : { _tag: "Incomplete", issues: ["connection-incomplete"] },
              );

              // Removing the account leaves the environment, which can no longer run.
              yield* connect(workspace.id, (service) => service.remove(account.id));
              expect(
                (yield* as(workspace.id, alice, (service) => service.get(box.id))).readiness,
              ).toEqual({ _tag: "Incomplete", issues: ["connection-unavailable"] });
            }),
          ),
        ),
    );

    it.effect("renames through a conflict, reconfigures a sandbox, and removes", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const created = yield* as(workspace.id, alice, (service) =>
              service.create(sandboxed({ setup: ["echo ready"] }, "Scratch")),
            );
            expect(created.readiness).toEqual({ _tag: "Ready" });
            const renamed = yield* as(workspace.id, alice, (service) =>
              service.rename({
                environmentId: created.id,
                name: "Scratch box",
                expectedName: "Scratch",
              }),
            );
            expect(renamed.name).toBe("Scratch box");
            expect(
              yield* Effect.flip(
                as(workspace.id, alice, (service) =>
                  service.rename({
                    environmentId: created.id,
                    name: "Other",
                    expectedName: "Scratch",
                  }),
                ),
              ),
            ).toEqual(new EnvironmentService.Changed({ environmentId: created.id }));
            const configured = yield* as(workspace.id, alice, (service) =>
              service.configure({
                environmentId: created.id,
                sandbox: Object.assign({}, settings, {
                  setup: ["echo one", "echo two"],
                  retention: "destroy" as const,
                }),
              }),
            );
            expect(configured.sandbox).toMatchObject({
              providerId: "test-local",
              harness: "in-process",
              setup: ["echo one", "echo two"],
              retention: "destroy",
            });
            expect(
              yield* Effect.flip(
                as(workspace.id, alice, (service) =>
                  service.configure({ environmentId: Environment.InProcessId, sandbox: settings }),
                ),
              ),
            ).toEqual(new EnvironmentService.InvalidSandbox({ issues: ["no-sandbox"] }));

            yield* as(workspace.id, alice, (service) => service.remove(created.id));
            expect(
              yield* Effect.flip(as(workspace.id, alice, (service) => service.get(created.id))),
            ).toEqual(new EnvironmentService.NotFound({ environmentId: created.id }));
            expect(
              (yield* as(workspace.id, alice, (service) => service.list)).map(({ id }) => id),
            ).toEqual([Environment.InProcessId]);
          }),
        ),
      ),
    );

    it("tells whether an environment can run a model selection", () => {
      const [inProcessHarness, boxedHarness] = testHarnesses;
      const ready: Environment.View = {
        id: Environment.InProcessId,
        name: "In-process",
        harnessId: amends,
        sandbox: null,
        createdBy: null,
        createdAt: DateTime.makeUnsafe(0),
        manageable: true,
        readiness: { _tag: "Ready" },
      };
      const connection = (changes: Partial<Connection.View>): Connection.View =>
        Object.assign(
          {
            id: Connection.Id.make("c"),
            name: "Models",
            implementationId: testImplementation.id,
            settings: {},
            authentication: { _tag: "None" as const },
            createdBy: Member.Id.make("owner"),
            createdAt: ready.createdAt,
            installed: true,
            capabilities: { modelInference: { interface: "test-messages" } },
            manageable: true,
            readiness: { modelInference: { _tag: "Ready" as const } },
          },
          changes,
        );
      expect(
        EnvironmentCompatibility.check(ready, inProcessHarness, {
          connection: connection({}),
          model: "model-x",
        }),
      ).toEqual({ _tag: "Compatible" });
      expect(
        EnvironmentCompatibility.check(ready, inProcessHarness, {
          connection: connection({ capabilities: {}, readiness: {} }),
          model: "model-x",
          reasoning: "high",
        }),
      ).toEqual({
        _tag: "Incompatible",
        reasons: [
          { _tag: "NoModelInference" },
          { _tag: "ReasoningUnsupported", reasoning: "high" },
        ],
      });
      expect(
        EnvironmentCompatibility.check(
          Object.assign({}, ready, {
            readiness: { _tag: "Incomplete" as const, issues: ["connection-incomplete" as const] },
          }),
          boxedHarness,
          {
            connection: connection({
              capabilities: { modelInference: { interface: "other-messages" } },
              readiness: {
                modelInference: { _tag: "Incomplete", settings: [], credential: true },
              },
            }),
            model: "model-x",
            reasoning: "high",
          },
        ),
      ).toEqual({
        _tag: "Incompatible",
        reasons: [
          { _tag: "EnvironmentNotReady", issues: ["connection-incomplete"] },
          { _tag: "ConnectionNotReady" },
          { _tag: "InterfaceUnsupported", interface: "other-messages" },
        ],
      });
    });
  });
};
