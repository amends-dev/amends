import { ConnectionImplementation } from "@amends/connection";
import { Connection, ConnectionApplication } from "@amends/core/connection";
import { Actor, type Identity } from "@amends/core/identity";
import { Journal, Store } from "@amends/core/journal";
import { Request } from "@amends/core/request";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Redacted } from "effect";
import type { Harness } from "./harness.ts";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  boundTo,
  failingLate,
  future,
  journalLog,
  request,
  Support,
  testImplementation,
} from "./support.ts";

const as = <A, E>(
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  use: (service: ConnectionApplication.Interface) => Effect.Effect<A, E, Actor.Service>,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(workspaceId, identity, Effect.flatMap(ConnectionApplication.Service, use)),
  );

const models: Connection.CreateInput = {
  name: "Models",
  implementationId: testImplementation.id,
  settings: { endpoint: "https://models.example" },
  authentication: "ApiKey",
};

const modelsWith = (changes: Partial<Connection.CreateInput>): Connection.CreateInput =>
  Object.assign({}, models, changes);

/** A workspace owned by alice, in which bob is an ordinary member. */
const workspaceWithMember = Effect.gen(function* () {
  const workspace = yield* Operations.createWorkspace(alice.id);
  const invitation = yield* Operations.invite(workspace.id, alice, request(yield* future));
  yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
  return workspace;
});

/** Every recorded journal entry as text, to show what never reached it. */
const journalText = (bound: Support.Bound) =>
  bound.store
    .read(journalLog, { limit: 200 })
    .pipe(Effect.map((batches) => JSON.stringify(batches)));

const credentialOf = (bound: Support.Bound, connectionId: Connection.Id) =>
  bound.connections
    .get(connectionId)
    .pipe(
      Effect.map((found) =>
        Option.flatMap(found, (record) =>
          record.authentication._tag === "ApiKey" && record.authentication.credentialId !== null
            ? Option.some(record.authentication.credentialId)
            : Option.none(),
        ),
      ),
    );

export const connections = (harness: Harness) => {
  const { core, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: connections`, () => {
    it.effect(
      "creates a connection that members read and only administrators manage",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const workspace = yield* workspaceWithMember;
              const created = yield* as(workspace.id, alice, (service) => service.create(models));
              expect(created).toMatchObject({
                name: "Models",
                implementationId: testImplementation.id,
                settings: { endpoint: "https://models.example" },
                authentication: { _tag: "ApiKey", configured: false },
                installed: true,
                capabilities: { modelInference: { interface: "test-messages" } },
                manageable: true,
                readiness: {
                  modelInference: { _tag: "Incomplete", settings: [], credential: true },
                },
              });
              expect(yield* as(workspace.id, alice, (service) => service.list)).toEqual([created]);

              // A member reads the same connection, told they may not manage it.
              const read = Object.assign({}, created, { manageable: false });
              expect(yield* as(workspace.id, bob, (service) => service.list)).toEqual([read]);
              expect(yield* as(workspace.id, bob, (service) => service.get(created.id))).toEqual(
                read,
              );
              for (const denied of [
                Effect.flip(as(workspace.id, bob, (service) => service.create(models))),
                Effect.flip(
                  as(workspace.id, bob, (service) =>
                    service.rename({
                      connectionId: created.id,
                      name: "Mine",
                      expectedName: "Models",
                    }),
                  ),
                ),
                Effect.flip(as(workspace.id, bob, (service) => service.remove(created.id))),
              ])
                expect(yield* denied).toMatchObject({ _tag: "Authorization.Denied" });

              const renamed = yield* as(workspace.id, alice, (service) =>
                service.rename({
                  connectionId: created.id,
                  name: "Team models",
                  expectedName: "Models",
                }),
              );
              expect(renamed.name).toBe("Team models");
              expect(
                yield* Effect.flip(
                  as(workspace.id, alice, (service) =>
                    service.rename({
                      connectionId: created.id,
                      name: "Other",
                      expectedName: "Models",
                    }),
                  ),
                ),
              ).toEqual(new ConnectionApplication.Changed({ connectionId: created.id }));
              const configured = yield* as(workspace.id, alice, (service) =>
                service.configure({
                  connectionId: created.id,
                  settings: { endpoint: "https://eu.models.example", region: "eu" },
                }),
              );
              expect(configured.settings).toEqual({
                endpoint: "https://eu.models.example",
                region: "eu",
              });
              expect(yield* as(workspace.id, bob, (service) => service.get(created.id))).toEqual(
                Object.assign({}, configured, { manageable: false }),
              );
            }),
          ),
        ),
      60_000,
    );

    it.effect("checks the implementation, its settings, and how it authenticates", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const create = (input: Connection.CreateInput) =>
              Effect.flip(as(workspace.id, alice, (service) => service.create(input)));
            expect(
              yield* create(
                modelsWith({ implementationId: ConnectionImplementation.Id.make("not-installed") }),
              ),
            ).toEqual(
              new ConnectionApplication.UnknownImplementation({
                implementationId: ConnectionImplementation.Id.make("not-installed"),
              }),
            );
            expect(
              yield* create(modelsWith({ settings: { endpoint: "models.example", unknown: "x" } })),
            ).toEqual(
              new ConnectionApplication.InvalidSettings({
                issues: [
                  "unknown is not a setting of Test models.",
                  "Endpoint must be an http or https URL.",
                ],
              }),
            );
            expect(yield* create(modelsWith({ settings: {} }))).toEqual(
              new ConnectionApplication.InvalidSettings({ issues: ["Endpoint is required."] }),
            );
            const open = yield* as(workspace.id, alice, (service) =>
              service.create(modelsWith({ name: "Open", authentication: "None" })),
            );
            expect(open.readiness).toEqual({ modelInference: { _tag: "Ready" } });
            expect(
              yield* Effect.flip(
                as(workspace.id, alice, (service) =>
                  service.setCredential({
                    connectionId: open.id,
                    secret: Redacted.make("sk-unused"),
                  }),
                ),
              ),
            ).toEqual(
              new ConnectionApplication.UnsupportedAuthentication({
                implementationId: testImplementation.id,
                method: "None",
              }),
            );
          }),
        ),
      ),
    );

    it.effect(
      "keeps credentials out of the journal, replacing, clearing, and deleting them with it",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const workspace = yield* Operations.createWorkspace(alice.id);
              const bound = yield* boundTo(workspace.id);
              const created = yield* as(workspace.id, alice, (service) => service.create(models));
              const set = yield* as(workspace.id, alice, (service) =>
                service.setCredential({
                  connectionId: created.id,
                  secret: Redacted.make("sk-first-secret"),
                }),
              );
              expect(set.authentication).toEqual({ _tag: "ApiKey", configured: true });
              expect(set.readiness).toEqual({ modelInference: { _tag: "Ready" } });
              const first = Option.getOrThrow(yield* credentialOf(bound, created.id));
              const stored = yield* bound.credentials.get(first);
              expect(Option.map(stored, (credential) => Redacted.value(credential.secret))).toEqual(
                Option.some("sk-first-secret"),
              );
              expect(Option.map(stored, (credential) => credential.connectionId)).toEqual(
                Option.some(created.id),
              );

              yield* as(workspace.id, alice, (service) =>
                service.setCredential({
                  connectionId: created.id,
                  secret: Redacted.make("sk-second-secret"),
                }),
              );
              const second = Option.getOrThrow(yield* credentialOf(bound, created.id));
              expect(second).not.toBe(first);
              expect(yield* bound.credentials.get(first)).toEqual(Option.none());
              expect(
                Option.map(yield* bound.credentials.get(second), (credential) =>
                  Redacted.value(credential.secret),
                ),
              ).toEqual(Option.some("sk-second-secret"));

              const text = yield* journalText(bound);
              expect(text).not.toContain("sk-first-secret");
              expect(text).not.toContain("sk-second-secret");

              // Replay rebuilds the connection from facts; its credential is not a read model.
              const before = yield* bound.connections.get(created.id);
              yield* storage.discardProjections;
              yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
                Effect.provide(core(bound)),
              );
              expect(yield* bound.connections.get(created.id)).toEqual(before);
              expect(Option.isSome(yield* bound.credentials.get(second))).toBe(true);

              const cleared = yield* as(workspace.id, alice, (service) =>
                service.clearCredential(created.id),
              );
              expect(cleared.readiness).toEqual({
                modelInference: { _tag: "Incomplete", settings: [], credential: true },
              });
              expect(yield* bound.credentials.get(second)).toEqual(Option.none());

              yield* as(workspace.id, alice, (service) =>
                service.setCredential({
                  connectionId: created.id,
                  secret: Redacted.make("sk-third-secret"),
                }),
              );
              const third = Option.getOrThrow(yield* credentialOf(bound, created.id));
              yield* as(workspace.id, alice, (service) => service.remove(created.id));
              expect(yield* bound.credentials.get(third)).toEqual(Option.none());
              expect(yield* as(workspace.id, alice, (service) => service.list)).toEqual([]);
              expect(
                yield* Effect.flip(as(workspace.id, alice, (service) => service.get(created.id))),
              ).toEqual(new ConnectionApplication.NotFound({ connectionId: created.id }));
              expect(
                Option.map(yield* bound.connections.get(created.id), (record) => record.status),
              ).toEqual(Option.some("removed"));
            }),
          ),
        ),
      60_000,
    );

    it.effect("stores a credential with the commit that records it, or not at all", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const bound = yield* boundTo(workspace.id);
            const created = yield* as(workspace.id, alice, (service) => service.create(models));
            const before = yield* bound.store.read(journalLog, { limit: 200 });
            const footprint = yield* storage.footprint;
            const failure = new Store.Failure({
              operation: "transaction",
              cause: "Late write failed",
            });
            expect(
              yield* Effect.flip(
                Effect.flatMap(ConnectionApplication.Service, (connectionApplication) =>
                  connectionApplication.setCredential({
                    connectionId: created.id,
                    secret: Redacted.make("sk-rolled-back"),
                  }),
                ).pipe(
                  Effect.provide(core(failingLate(bound, failure))),
                  Effect.provideService(Actor.Service, {
                    workspaceId: workspace.id,
                    memberId: workspace.ownerMemberId,
                    identity: alice,
                  }),
                ),
              ),
            ).toBe(failure);
            expect(yield* bound.store.read(journalLog, { limit: 200 })).toEqual(before);
            expect(yield* storage.footprint).toBe(footprint);
            expect(yield* credentialOf(bound, created.id)).toEqual(Option.none());
          }),
        ),
      ),
    );

    it.effect("returns the first connection when a create is retried with its key", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const options = { requestKey: Request.Key.make("create-models") };
            const first = yield* as(workspace.id, alice, (service) =>
              service.create(models, options),
            );
            const again = yield* as(workspace.id, alice, (service) =>
              service.create(models, options),
            );
            expect(again).toEqual(first);
            expect(yield* as(workspace.id, alice, (service) => service.list)).toEqual([first]);
            // The key alone names the request: reused with another body, it returns the first.
            expect(
              yield* as(workspace.id, alice, (service) =>
                service.create(modelsWith({ name: "Different" }), options),
              ),
            ).toEqual(first);
          }),
        ),
      ),
    );
  });
};
