import { Integration } from "@amends-dev/connection";
import { Connection, ConnectionService } from "@amends-dev/core/connection";
import { Actor, type Identity } from "@amends-dev/core/identity";
import { Journal, Store } from "@amends-dev/core/journal";
import { Request } from "@amends-dev/core/request";
import type { Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Redacted, Schema } from "effect";
import { withStorage } from "./fixture.ts";
import * as Operations from "./operations.ts";
import * as Support from "./support.ts";
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
  testModel,
} from "./support.ts";
import { CoreError } from "@amends-dev/core/error";

const as = <A, E>(
  workspaceId: Workspace.Id,
  identity: Identity.MemberReference,
  use: (
    connectionService: ConnectionService.ConnectionService["Service"],
  ) => Effect.Effect<A, E, Actor.Actor>,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    gateway.asMember(
      workspaceId,
      identity,
      Effect.flatMap(ConnectionService.ConnectionService, use),
    ),
  );

const models: Connection.CreateInput = {
  integration: "test-models",
  name: "Models",
  settings: { endpoint: "https://models.example" },
  auth: "apiKey",
  apiKey: Redacted.make(goodKey),
};

const tools: Connection.CreateInput = {
  integration: "test-tools",
  name: "Tools",
  settings: {},
  auth: "none",
};

/** A new connection like `input`, with `changes`. */
const changed = (
  input: Connection.CreateInput,
  changes: Partial<Connection.CreateInput>,
): Connection.CreateInput => Object.assign({}, input, changes);

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
  connectionService: ConnectionService.ConnectionService["Service"],
) => Effect.Effect<unknown, unknown, Actor.Actor>;

/** The key stored for a connection, as it is. */
const keyOf = (bound: Support.Bound, connectionId: Connection.Id) =>
  Effect.map(bound.connectionCredentials.get(connectionId), (credential) =>
    Option.map(credential, ({ apiKey }) => Redacted.value(apiKey)),
  );

const { core, gateway, runGateway } = Support;
describe("connections", () => {
  it.effect("lists the integrations the host installs to every member, with their forms", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* workspaceWithMember;
          const integrations = yield* as(
            workspace.id,
            bob,
            (connectionService) => connectionService.integrations,
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
            {
              id: "test-channels",
              auth: ["none"],
              provides: ["channels"],
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
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* workspaceWithMember;
            const bound = yield* boundTo(workspace.id);
            const created = yield* as(workspace.id, alice, (connectionService) =>
              connectionService.create(models),
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
              yield* as(workspace.id, alice, (connectionService) => connectionService.list),
            ).toEqual([created]);

            // A member reads the same connection, told they may not manage it.
            const read = Object.assign({}, created, { manageable: false });
            expect(
              yield* as(workspace.id, bob, (connectionService) => connectionService.list),
            ).toEqual([read]);
            expect(
              yield* as(workspace.id, bob, (connectionService) =>
                connectionService.get(created.id),
              ),
            ).toEqual(read);
            const operations: ReadonlyArray<Operation> = [
              (connectionService) => connectionService.create(tools),
              (connectionService) =>
                connectionService.rename({
                  connectionId: created.id,
                  name: "Mine",
                  expectedName: "Models",
                }),
              (connectionService) =>
                connectionService.configure({ connectionId: created.id, settings: {} }),
              (connectionService) =>
                connectionService.replaceKey({
                  connectionId: created.id,
                  apiKey: Redacted.make("sk-mine"),
                }),
              (connectionService) => connectionService.check(created.id),
              (connectionService) => connectionService.remove(created.id),
            ];
            for (const denied of operations)
              expect(yield* Effect.flip(as(workspace.id, bob, denied))).toMatchObject({
                _tag: "CoreError.Denied",
                reason: { _tag: "NotGranted" },
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
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* workspaceWithMember;
          const offering = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.create(models),
          );
          const offeringNone = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.create(tools),
          );
          const modelsOf = (connectionId: Connection.Id) =>
            as(workspace.id, bob, (connectionService) => connectionService.models(connectionId));

          expect(yield* modelsOf(offering.id)).toEqual({ listed: [testModel], unlisted: true });
          expect(yield* modelsOf(offeringNone.id)).toEqual({ listed: [], unlisted: false });
          const missing = Connection.Id.make("missing");
          expect(yield* Effect.flip(modelsOf(missing))).toEqual(
            new CoreError.NotFound({ resource: "Connection", id: missing }),
          );
          yield* as(workspace.id, alice, (connectionService) =>
            connectionService.remove(offering.id),
          );
          expect(yield* Effect.flip(modelsOf(offering.id))).toEqual(
            new CoreError.NotFound({ resource: "Connection", id: offering.id }),
          );
        }),
      ),
    ),
  );

  it.effect("checks a connection with its system, using the key it has now", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id);
          const bound = yield* boundTo(workspace.id);
          const keyed = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.create(models),
          );
          const keyless = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.create(tools),
          );
          const check = (connectionId: Connection.Id) =>
            as(workspace.id, alice, (connectionService) => connectionService.check(connectionId));
          expect(yield* check(keyed.id)).toEqual({ status: "healthy" });
          expect(yield* check(keyless.id)).toEqual({ status: "healthy" });

          const replaced = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.replaceKey({
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
              as(workspace.id, alice, (connectionService) =>
                connectionService.replaceKey({
                  connectionId: keyless.id,
                  apiKey: Redacted.make("sk-bad"),
                }),
              ),
            ),
          ).toEqual(new ConnectionService.Keyless({ connectionId: keyless.id }));
          expect(yield* journalText(bound)).not.toContain("sk-bad");
        }),
      ),
    ),
  );

  it.effect("refuses a connection its integration does not take, and creates nothing", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id);
          const refused = (input: Connection.CreateInput) =>
            Effect.flip(
              as(workspace.id, alice, (connectionService) => connectionService.create(input)),
            );
          expect(yield* refused(changed(models, { integration: "not-installed" }))).toEqual(
            new ConnectionService.UnknownIntegration({ integration: "not-installed" }),
          );
          const unaccepted: ReadonlyArray<Connection.CreateInput["settings"]> = [
            {},
            { endpoint: "https://models.example", zone: "eu" },
          ];
          for (const settings of unaccepted) {
            const invalid = yield* refused(changed(models, { settings }));
            expect(invalid).toBeInstanceOf(ConnectionService.InvalidConnection);
            expect(invalid).toMatchObject({
              description: expect.stringContaining(
                "The settings of Models do not match what Test models takes",
              ),
            });
          }
          expect(
            yield* refused(changed(tools, { auth: "apiKey", apiKey: Redacted.make(goodKey) })),
          ).toEqual(
            new ConnectionService.InvalidConnection({
              description: "Test tools takes no authentication by apiKey",
            }),
          );
          // A key for a connection that authenticates with none is not a request at all.
          expect(yield* refused(changed(tools, { apiKey: Redacted.make(goodKey) }))).toMatchObject({
            _tag: "GatewayErrors.InvalidInput",
          });

          const created = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.create(models),
          );
          const reconfigured = yield* Effect.flip(
            as(workspace.id, alice, (connectionService) =>
              connectionService.configure({
                connectionId: created.id,
                settings: { region: "eu" },
              }),
            ),
          );
          expect(reconfigured).toBeInstanceOf(ConnectionService.InvalidConnection);
          expect(
            yield* as(workspace.id, alice, (connectionService) => connectionService.list),
          ).toEqual([created]);
        }),
      ),
    ),
  );

  it.effect("renames, reconfigures, and removes a connection with its key", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id);
          const bound = yield* boundTo(workspace.id);
          const created = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.create(models),
          );
          const renamed = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.rename({
              connectionId: created.id,
              name: "Team models",
              expectedName: "Models",
            }),
          );
          expect(renamed.name).toBe("Team models");
          expect(
            yield* Effect.flip(
              as(workspace.id, alice, (connectionService) =>
                connectionService.rename({
                  connectionId: created.id,
                  name: "Other",
                  expectedName: "Models",
                }),
              ),
            ),
          ).toEqual(new CoreError.Changed({ resource: "Connection", id: created.id }));
          const configured = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.configure({
              connectionId: created.id,
              settings: { endpoint: "https://eu.models.example", region: "eu" },
            }),
          );
          expect(configured.settings).toEqual({
            endpoint: "https://eu.models.example",
            region: "eu",
          });
          expect(
            yield* as(workspace.id, alice, (connectionService) =>
              connectionService.get(created.id),
            ),
          ).toEqual(configured);

          yield* as(workspace.id, alice, (connectionService) =>
            connectionService.remove(created.id),
          );
          const gone = new CoreError.NotFound({ resource: "Connection", id: created.id });
          expect(
            yield* as(workspace.id, alice, (connectionService) => connectionService.list),
          ).toEqual([]);
          const operations: ReadonlyArray<Operation> = [
            (connectionService) => connectionService.get(created.id),
            (connectionService) => connectionService.check(created.id),
            (connectionService) => connectionService.remove(created.id),
          ];
          for (const removed of operations)
            expect(yield* Effect.flip(as(workspace.id, alice, removed))).toEqual(gone);
          expect(yield* keyOf(bound, created.id)).toEqual(Option.none());
          expect(
            Option.map(yield* bound.connections.get(created.id), (record) => record.status),
          ).toEqual(Option.some("removed"));
        }),
      ),
    ),
  );

  it.effect("stores a connection's key with the commit that records it, or not at all", () =>
    withStorage((storage) =>
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
              Effect.flatMap(ConnectionService.ConnectionService, (connectionService) =>
                connectionService.create(models),
              ).pipe(
                Effect.provide(core(failingLate(bound, failure))),
                Effect.provideService(Actor.Actor, {
                  workspaceId: workspace.id,
                  memberId: workspace.ownerMemberId,
                  identity: alice,
                }),
              ),
            ),
          ).toBe(failure);
          expect(yield* bound.store.read(journalLog, { limit: 200 })).toEqual(before);
          expect(yield* storage.footprint).toBe(footprint);
          expect(yield* bound.connections.listActive).toEqual([]);
        }),
      ),
    ),
  );

  it.effect(
    "returns the first connection when a create is retried with its key, until it is removed",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const options = { requestKey: Request.Key.make("create-models") };
            const create = (input: Connection.CreateInput) =>
              as(workspace.id, alice, (connectionService) =>
                connectionService.create(input, options),
              );
            const first = yield* create(models);
            expect(yield* create(models)).toEqual(first);
            // The key alone names the request: reused with another body, it returns the first.
            expect(yield* create(changed(models, { name: "Different" }))).toEqual(first);
            expect(
              yield* as(workspace.id, alice, (connectionService) => connectionService.list),
            ).toEqual([first]);

            yield* as(workspace.id, alice, (connectionService) =>
              connectionService.remove(first.id),
            );
            expect(yield* Effect.flip(create(models))).toEqual(
              new CoreError.NotFound({ resource: "Connection", id: first.id }),
            );
          }),
        ),
      ),
  );

  it.effect(
    "shows each connection as ready as the integrations its host installs now find it",
    () =>
      withStorage((storage) =>
        Effect.gen(function* () {
          const { workspace, keyed, keyless } = yield* runGateway(
            storage,
            Effect.gen(function* () {
              const workspace = yield* Operations.createWorkspace(alice.id);
              const keyed = yield* as(workspace.id, alice, (connectionService) =>
                connectionService.create(models),
              );
              const keyless = yield* as(workspace.id, alice, (connectionService) =>
                connectionService.create(tools),
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
              (connectionService) => connectionService.list,
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
                as(workspace.id, alice, (connectionService) => connectionService.check(keyless.id)),
              ),
            ).toEqual(new ConnectionService.UnknownIntegration({ integration: "test-tools" }));
            expect(
              yield* Effect.flip(
                as(workspace.id, alice, (connectionService) => connectionService.check(keyed.id)),
              ),
            ).toBeInstanceOf(ConnectionService.InvalidConnection);
            // The models of a connection are its integration's, whatever its settings.
            expect(
              yield* as(workspace.id, alice, (connectionService) =>
                connectionService.models(keyed.id),
              ),
            ).toEqual({ listed: [], unlisted: false });
            expect(
              yield* Effect.flip(
                as(workspace.id, alice, (connectionService) =>
                  connectionService.models(keyless.id),
                ),
              ),
            ).toEqual(new ConnectionService.UnknownIntegration({ integration: "test-tools" }));
          }).pipe(Effect.provide(gateway(host, { ...installed, integrations: [changedModels] })));
        }),
      ),
    60_000,
  );

  it.effect("rebuilds connections from the journal, keeping their keys", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id);
          const bound = yield* boundTo(workspace.id);
          const keyed = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.create(models),
          );
          const keyless = yield* as(workspace.id, alice, (connectionService) =>
            connectionService.create(tools),
          );
          yield* as(workspace.id, alice, (connectionService) =>
            connectionService.rename({
              connectionId: keyed.id,
              name: "Team models",
              expectedName: "Models",
            }),
          );
          yield* as(workspace.id, alice, (connectionService) =>
            connectionService.configure({
              connectionId: keyed.id,
              settings: { endpoint: "https://eu.models.example", region: "eu" },
            }),
          );
          yield* as(workspace.id, alice, (connectionService) =>
            connectionService.remove(keyless.id),
          );
          const records = [
            yield* bound.connections.get(keyed.id),
            yield* bound.connections.get(keyless.id),
          ];

          yield* storage.discardProjections;
          expect(yield* bound.connections.get(keyed.id)).toEqual(Option.none());
          yield* Effect.flatMap(Journal.Journal, (journal) => journal.replay).pipe(
            Effect.provide(core(bound)),
          );
          expect([
            yield* bound.connections.get(keyed.id),
            yield* bound.connections.get(keyless.id),
          ]).toEqual(records);
          // A key is not a read model: rebuilding keeps it.
          expect(yield* keyOf(bound, keyed.id)).toEqual(Option.some(goodKey));
        }),
      ),
    ),
  );
});
