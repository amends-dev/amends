import { Integration } from "@amends/connection-v2";
import { ConnectionV2, ConnectionV2Service } from "@amends/core/connection-v2";
import { Actor, type Identity } from "@amends/core/identity";
import { Journal, Store } from "@amends/core/journal";
import { Request } from "@amends/core/request";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Redacted, Schema } from "effect";
import type { Harness } from "./harness.ts";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  boundTo,
  failingLate,
  future,
  goodKey,
  installed,
  journalLog,
  request,
  Support,
  testModel,
} from "./support.ts";

const as = <A, E>(
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  use: (connectionV2Service: ConnectionV2Service.Interface) => Effect.Effect<A, E, Actor.Service>,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(workspaceId, identity, Effect.flatMap(ConnectionV2Service.Service, use)),
  );

const models: ConnectionV2.CreateInput = {
  integration: "test-models",
  name: "Models",
  settings: { endpoint: "https://models.example" },
  auth: "apiKey",
  apiKey: Redacted.make(goodKey),
};

const tools: ConnectionV2.CreateInput = {
  integration: "test-tools",
  name: "Tools",
  settings: {},
  auth: "none",
};

/** A new connection like `input`, with `changes`. */
const changed = (
  input: ConnectionV2.CreateInput,
  changes: Partial<ConnectionV2.CreateInput>,
): ConnectionV2.CreateInput => Object.assign({}, input, changes);

/** A workspace owned by alice, in which bob is an ordinary member. */
const workspaceWithMember = Effect.gen(function* () {
  const workspace = yield* Operations.createWorkspace(alice.id);
  const invitation = yield* Operations.invite(workspace.id, alice, request(yield* future));
  yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
  return workspace;
});

/**
 * Every recorded journal payload as text, a character for each byte, to show what text reached it
 * and what never did; the text looked for is ASCII.
 */
const journalText = (bound: Support.Bound) =>
  bound.store.read(journalLog, { limit: 200 }).pipe(
    Effect.map((batches) =>
      batches
        .flatMap((batch) => batch.entries)
        .map((entry) => Array.from(entry.payload, (byte) => String.fromCharCode(byte)).join(""))
        .join("\n"),
    ),
  );

/** An operation a test runs as some member, whatever it answers. */
type Operation = (
  connectionV2Service: ConnectionV2Service.Interface,
) => Effect.Effect<unknown, unknown, Actor.Service>;

/** The key stored for a connection, as it is. */
const keyOf = (bound: Support.Bound, connectionId: ConnectionV2.Id) =>
  Effect.map(bound.connectionV2Credentials.get(connectionId), (credential) =>
    Option.map(credential, ({ apiKey }) => Redacted.value(apiKey)),
  );

export const connectionsV2 = (harness: Harness) => {
  const { core, gateway, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: connections v2`, () => {
    it.effect("lists the integrations the host installs to every member, with their forms", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* workspaceWithMember;
            const integrations = yield* as(
              workspace.id,
              bob,
              (connectionV2Service) => connectionV2Service.integrations,
            );
            expect(
              integrations.map(({ id, auth, provides, requiresSandbox }) => ({
                id,
                auth,
                provides,
                requiresSandbox,
              })),
            ).toEqual([
              {
                id: "test-models",
                auth: ["apiKey", "none"],
                provides: ["models"],
                requiresSandbox: false,
              },
              { id: "test-tools", auth: ["none"], provides: ["tools"], requiresSandbox: false },
              {
                id: "test-harness",
                auth: ["none"],
                provides: ["harnesses"],
                requiresSandbox: true,
              },
              {
                id: "test-in-process",
                auth: ["none"],
                provides: ["harnesses"],
                requiresSandbox: false,
              },
              {
                id: "test-sandboxes",
                auth: ["none"],
                provides: ["sandboxes"],
                requiresSandbox: false,
              },
            ]);
            expect(integrations[0]).toMatchObject({
              name: "Test models",
              docs: "https://models.example/docs",
              settings: {
                type: "object",
                properties: { endpoint: { type: "string", title: "Endpoint" } },
                required: ["endpoint"],
              },
            });
            expect(integrations[1]?.settings).toEqual({ type: "object", properties: {} });
          }),
        ),
      ),
    );

    it.effect(
      "creates a connection with its key, which members read and only administrators manage",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const workspace = yield* workspaceWithMember;
              const bound = yield* boundTo(workspace.id);
              const created = yield* as(workspace.id, alice, (connectionV2Service) =>
                connectionV2Service.create(models),
              );
              expect(created).toMatchObject({
                name: "Models",
                integration: "test-models",
                settings: { endpoint: "https://models.example" },
                auth: "apiKey",
                readiness: { _tag: "Ready" },
                manageable: true,
              });
              expect(created).not.toHaveProperty("apiKey");
              expect(
                yield* as(workspace.id, alice, (connectionV2Service) => connectionV2Service.list),
              ).toEqual([created]);

              // A member reads the same connection, told they may not manage it.
              const read = Object.assign({}, created, { manageable: false });
              expect(
                yield* as(workspace.id, bob, (connectionV2Service) => connectionV2Service.list),
              ).toEqual([read]);
              expect(
                yield* as(workspace.id, bob, (connectionV2Service) =>
                  connectionV2Service.get(created.id),
                ),
              ).toEqual(read);
              const operations: ReadonlyArray<Operation> = [
                (connectionV2Service) => connectionV2Service.create(tools),
                (connectionV2Service) =>
                  connectionV2Service.rename({
                    connectionId: created.id,
                    name: "Mine",
                    expectedName: "Models",
                  }),
                (connectionV2Service) =>
                  connectionV2Service.configure({ connectionId: created.id, settings: {} }),
                (connectionV2Service) =>
                  connectionV2Service.replaceKey({
                    connectionId: created.id,
                    apiKey: Redacted.make("sk-mine"),
                  }),
                (connectionV2Service) => connectionV2Service.check(created.id),
                (connectionV2Service) => connectionV2Service.remove(created.id),
              ];
              for (const denied of operations)
                expect(yield* Effect.flip(as(workspace.id, bob, denied))).toMatchObject({
                  _tag: "Authorization.Denied",
                });

              // The key is stored apart, and never reaches the journal its settings reach.
              expect(yield* keyOf(bound, created.id)).toEqual(Option.some(goodKey));
              const text = yield* journalText(bound);
              expect(text).toContain("https://models.example");
              expect(text).not.toContain(goodKey);
            }),
          ),
        ),
      60_000,
    );

    it.effect("gives the models a connection offers to whoever may read it", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* workspaceWithMember;
            const offering = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.create(models),
            );
            const offeringNone = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.create(tools),
            );
            const modelsOf = (connectionId: ConnectionV2.Id) =>
              as(workspace.id, bob, (connectionV2Service) =>
                connectionV2Service.models(connectionId),
              );

            expect(yield* modelsOf(offering.id)).toEqual({ listed: [testModel], unlisted: true });
            expect(yield* modelsOf(offeringNone.id)).toEqual({ listed: [], unlisted: false });
            const missing = ConnectionV2.Id.make("missing");
            expect(yield* Effect.flip(modelsOf(missing))).toEqual(
              new ConnectionV2Service.NotFound({ connectionId: missing }),
            );
            yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.remove(offering.id),
            );
            expect(yield* Effect.flip(modelsOf(offering.id))).toEqual(
              new ConnectionV2Service.NotFound({ connectionId: offering.id }),
            );
          }),
        ),
      ),
    );

    it.effect("checks a connection with its system, using the key it has now", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const bound = yield* boundTo(workspace.id);
            const keyed = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.create(models),
            );
            const keyless = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.create(tools),
            );
            const check = (connectionId: ConnectionV2.Id) =>
              as(workspace.id, alice, (connectionV2Service) =>
                connectionV2Service.check(connectionId),
              );
            expect(yield* check(keyed.id)).toEqual({ status: "healthy" });
            expect(yield* check(keyless.id)).toEqual({ status: "healthy" });

            const replaced = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.replaceKey({
                connectionId: keyed.id,
                apiKey: Redacted.make("sk-bad"),
              }),
            );
            expect(replaced).toEqual(keyed);
            expect(yield* keyOf(bound, keyed.id)).toEqual(Option.some("sk-bad"));
            expect(yield* check(keyed.id)).toEqual({
              status: "unauthorized",
              description: "The key was refused",
            });
            expect(
              yield* Effect.flip(
                as(workspace.id, alice, (connectionV2Service) =>
                  connectionV2Service.replaceKey({
                    connectionId: keyless.id,
                    apiKey: Redacted.make("sk-bad"),
                  }),
                ),
              ),
            ).toEqual(new ConnectionV2Service.Keyless({ connectionId: keyless.id }));
            expect(yield* journalText(bound)).not.toContain("sk-bad");
          }),
        ),
      ),
    );

    it.effect("refuses a connection its integration does not take, and creates nothing", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const refused = (input: ConnectionV2.CreateInput) =>
              Effect.flip(
                as(workspace.id, alice, (connectionV2Service) => connectionV2Service.create(input)),
              );
            expect(yield* refused(changed(models, { integration: "not-installed" }))).toEqual(
              new ConnectionV2Service.UnknownIntegration({ integration: "not-installed" }),
            );
            const unaccepted: ReadonlyArray<ConnectionV2.CreateInput["settings"]> = [
              {},
              { endpoint: "https://models.example", zone: "eu" },
            ];
            for (const settings of unaccepted) {
              const invalid = yield* refused(changed(models, { settings }));
              expect(invalid).toBeInstanceOf(ConnectionV2Service.InvalidConnection);
              expect(invalid).toMatchObject({
                description: expect.stringContaining(
                  "The settings of Models do not match what Test models takes",
                ),
              });
            }
            expect(
              yield* refused(changed(tools, { auth: "apiKey", apiKey: Redacted.make(goodKey) })),
            ).toEqual(
              new ConnectionV2Service.InvalidConnection({
                description: "Test tools takes no authentication by apiKey",
              }),
            );
            // A key for a connection that authenticates with none is not a request at all.
            expect(
              yield* refused(changed(tools, { apiKey: Redacted.make(goodKey) })),
            ).toMatchObject({
              _tag: "Gateway.InvalidInput",
            });

            const created = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.create(models),
            );
            const reconfigured = yield* Effect.flip(
              as(workspace.id, alice, (connectionV2Service) =>
                connectionV2Service.configure({
                  connectionId: created.id,
                  settings: { region: "eu" },
                }),
              ),
            );
            expect(reconfigured).toBeInstanceOf(ConnectionV2Service.InvalidConnection);
            expect(
              yield* as(workspace.id, alice, (connectionV2Service) => connectionV2Service.list),
            ).toEqual([created]);
          }),
        ),
      ),
    );

    it.effect("renames, reconfigures, and removes a connection with its key", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const bound = yield* boundTo(workspace.id);
            const created = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.create(models),
            );
            const renamed = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.rename({
                connectionId: created.id,
                name: "Team models",
                expectedName: "Models",
              }),
            );
            expect(renamed.name).toBe("Team models");
            expect(
              yield* Effect.flip(
                as(workspace.id, alice, (connectionV2Service) =>
                  connectionV2Service.rename({
                    connectionId: created.id,
                    name: "Other",
                    expectedName: "Models",
                  }),
                ),
              ),
            ).toEqual(new ConnectionV2Service.Changed({ connectionId: created.id }));
            const configured = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.configure({
                connectionId: created.id,
                settings: { endpoint: "https://eu.models.example", region: "eu" },
              }),
            );
            expect(configured.settings).toEqual({
              endpoint: "https://eu.models.example",
              region: "eu",
            });
            expect(
              yield* as(workspace.id, alice, (connectionV2Service) =>
                connectionV2Service.get(created.id),
              ),
            ).toEqual(configured);

            yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.remove(created.id),
            );
            const gone = new ConnectionV2Service.NotFound({ connectionId: created.id });
            expect(
              yield* as(workspace.id, alice, (connectionV2Service) => connectionV2Service.list),
            ).toEqual([]);
            const operations: ReadonlyArray<Operation> = [
              (connectionV2Service) => connectionV2Service.get(created.id),
              (connectionV2Service) => connectionV2Service.check(created.id),
              (connectionV2Service) => connectionV2Service.remove(created.id),
            ];
            for (const removed of operations)
              expect(yield* Effect.flip(as(workspace.id, alice, removed))).toEqual(gone);
            expect(yield* keyOf(bound, created.id)).toEqual(Option.none());
            expect(
              Option.map(yield* bound.connectionsV2.get(created.id), (record) => record.status),
            ).toEqual(Option.some("removed"));
          }),
        ),
      ),
    );

    it.effect("stores a connection's key with the commit that records it, or not at all", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const bound = yield* boundTo(workspace.id);
            const before = yield* bound.store.read(journalLog, { limit: 200 });
            const footprint = yield* storage.footprint;
            const failure = new Store.Failure({
              operation: "transaction",
              cause: "Late write failed",
            });
            expect(
              yield* Effect.flip(
                Effect.flatMap(ConnectionV2Service.Service, (connectionV2Service) =>
                  connectionV2Service.create(models),
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
            expect(yield* bound.connectionsV2.listActive).toEqual([]);
          }),
        ),
      ),
    );

    it.effect(
      "returns the first connection when a create is retried with its key, until it is removed",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const workspace = yield* Operations.createWorkspace(alice.id);
              const options = { requestKey: Request.Key.make("create-models") };
              const create = (input: ConnectionV2.CreateInput) =>
                as(workspace.id, alice, (connectionV2Service) =>
                  connectionV2Service.create(input, options),
                );
              const first = yield* create(models);
              expect(yield* create(models)).toEqual(first);
              // The key alone names the request: reused with another body, it returns the first.
              expect(yield* create(changed(models, { name: "Different" }))).toEqual(first);
              expect(
                yield* as(workspace.id, alice, (connectionV2Service) => connectionV2Service.list),
              ).toEqual([first]);

              yield* as(workspace.id, alice, (connectionV2Service) =>
                connectionV2Service.remove(first.id),
              );
              expect(yield* Effect.flip(create(models))).toEqual(
                new ConnectionV2Service.NotFound({ connectionId: first.id }),
              );
            }),
          ),
        ),
    );

    it.effect(
      "shows each connection as ready as the integrations its host installs now find it",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const { workspace, keyed, keyless } = yield* runGateway(
              storage,
              Effect.gen(function* () {
                const workspace = yield* Operations.createWorkspace(alice.id);
                const keyed = yield* as(workspace.id, alice, (connectionV2Service) =>
                  connectionV2Service.create(models),
                );
                const keyless = yield* as(workspace.id, alice, (connectionV2Service) =>
                  connectionV2Service.create(tools),
                );
                return { workspace, keyed, keyless };
              }),
            );
            // Another host installs test models with other settings, and no test tools.
            const changedModels = Integration.make({
              id: "test-models",
              name: "Test models",
              settings: Schema.Struct({ url: Schema.NonEmptyString }),
              auth: ["apiKey", "none"],
              check: () => Effect.succeed({ status: "healthy" }),
            });
            const host = yield* storage.connect();
            yield* Effect.gen(function* () {
              const listed = yield* as(
                workspace.id,
                alice,
                (connectionV2Service) => connectionV2Service.list,
              );
              expect(listed.map(({ id, readiness }) => ({ id, readiness }))).toEqual([
                {
                  id: keyed.id,
                  readiness: {
                    _tag: "Invalid",
                    description: expect.stringContaining(
                      "The settings of Models do not match what Test models takes",
                    ),
                  },
                },
                { id: keyless.id, readiness: { _tag: "Uninstalled" } },
              ]);
              expect(
                yield* Effect.flip(
                  as(workspace.id, alice, (connectionV2Service) =>
                    connectionV2Service.check(keyless.id),
                  ),
                ),
              ).toEqual(new ConnectionV2Service.UnknownIntegration({ integration: "test-tools" }));
              expect(
                yield* Effect.flip(
                  as(workspace.id, alice, (connectionV2Service) =>
                    connectionV2Service.check(keyed.id),
                  ),
                ),
              ).toBeInstanceOf(ConnectionV2Service.InvalidConnection);
              // The models of a connection are its integration's, whatever its settings.
              expect(
                yield* as(workspace.id, alice, (connectionV2Service) =>
                  connectionV2Service.models(keyed.id),
                ),
              ).toEqual({ listed: [], unlisted: false });
              expect(
                yield* Effect.flip(
                  as(workspace.id, alice, (connectionV2Service) =>
                    connectionV2Service.models(keyless.id),
                  ),
                ),
              ).toEqual(new ConnectionV2Service.UnknownIntegration({ integration: "test-tools" }));
            }).pipe(Effect.provide(gateway(host, { ...installed, integrations: [changedModels] })));
          }),
        ),
      60_000,
    );

    it.effect("rebuilds connections from the journal, keeping their keys", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const bound = yield* boundTo(workspace.id);
            const keyed = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.create(models),
            );
            const keyless = yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.create(tools),
            );
            yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.rename({
                connectionId: keyed.id,
                name: "Team models",
                expectedName: "Models",
              }),
            );
            yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.configure({
                connectionId: keyed.id,
                settings: { endpoint: "https://eu.models.example", region: "eu" },
              }),
            );
            yield* as(workspace.id, alice, (connectionV2Service) =>
              connectionV2Service.remove(keyless.id),
            );
            const records = [
              yield* bound.connectionsV2.get(keyed.id),
              yield* bound.connectionsV2.get(keyless.id),
            ];

            yield* storage.discardProjections;
            expect(yield* bound.connectionsV2.get(keyed.id)).toEqual(Option.none());
            yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
              Effect.provide(core(bound)),
            );
            expect([
              yield* bound.connectionsV2.get(keyed.id),
              yield* bound.connectionsV2.get(keyless.id),
            ]).toEqual(records);
            // A key is not a read model: rebuilding keeps it.
            expect(yield* keyOf(bound, keyed.id)).toEqual(Option.some(goodKey));
          }),
        ),
      ),
    );
  });
};
