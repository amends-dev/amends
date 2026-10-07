import { type Connection as ConnectionContract, Integrations } from "@amends/connection";
import { Context, Crypto, DateTime, Effect, Layer, Option, Result, Schema } from "effect";
import type { PlatformError } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import type { Permission } from "../authorization/permission.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Request } from "../request/request.ts";
import { Connection } from "./connection.ts";
import { ConnectionCredentialStore } from "./credential-store.ts";
import {
  Changed,
  CredentialsUnavailable,
  InvalidConnection,
  Keyless,
  NotFound,
  UnknownIntegration,
} from "./errors.ts";
import { ConnectionFacts } from "./facts.ts";
import { ConnectionPermissions } from "./permissions.ts";
import { ConnectionStore } from "./store.ts";
export {
  Changed,
  CredentialsUnavailable,
  InvalidConnection,
  Keyless,
  NotFound,
  UnknownIntegration,
} from "./errors.ts";

export type ReadError =
  | Authorization.Error
  | ConnectionStore.Failure
  | Schema.SchemaError
  | NotFound;
/** What every change can meet besides reading. */
export type Error = ReadError | PlatformError.PlatformError | Log.WriteError | Projection.Error;
/** Storing or reading a key can also meet a host that keeps no credentials. */
type KeyError = ConnectionCredentialStore.Failure | CredentialsUnavailable;
export type CreateError = Error | UnknownIntegration | InvalidConnection | KeyError;
export type ConfigureError = Error | UnknownIntegration | InvalidConnection;
export type ReplaceKeyError = Error | Keyless | KeyError;
export type RemoveError = Error | ConnectionCredentialStore.Failure;
export type CheckError = ReadError | UnknownIntegration | InvalidConnection | KeyError;
export type ModelsError = ReadError | UnknownIntegration;

export interface Interface {
  /**
   * The integrations this host installs, in the order it installs them. They describe the host
   * rather than the workspace, so every member may see them.
   */
  readonly integrations: Effect.Effect<
    ReadonlyArray<Connection.IntegrationView>,
    Authorization.Error,
    Actor.Service
  >;
  /** The workspace's connections the actor may read, by name. */
  readonly list: Effect.Effect<ReadonlyArray<Connection.View>, ReadError, Actor.Service>;
  readonly get: (
    connectionId: Connection.Id,
  ) => Effect.Effect<Connection.View, ReadError, Actor.Service>;
  /**
   * The models the connection offers an agent, to set an agent up with one: those its integration
   * lists, and whether it also offers others by any id. A connection whose integration this host no
   * longer installs offers nothing, and fails with UnknownIntegration.
   */
  readonly models: (
    connectionId: Connection.Id,
  ) => Effect.Effect<Connection.Models, ModelsError, Actor.Service>;
  /**
   * Connect the workspace to an installed integration, with settings and a way of authenticating
   * the integration takes, and its key when it authenticates with one, stored in the same commit.
   */
  readonly create: (
    input: Connection.CreateInput,
    options?: Request.Options,
  ) => Effect.Effect<Connection.View, CreateError, Actor.Service>;
  readonly rename: (
    input: Connection.RenameInput,
  ) => Effect.Effect<Connection.View, Error | Changed, Actor.Service>;
  /** Replace its settings, which its integration must take. */
  readonly configure: (
    input: Connection.ConfigureInput,
  ) => Effect.Effect<Connection.View, ConfigureError, Actor.Service>;
  /** Store a new key for a connection that authenticates with one, in place of its key. */
  readonly replaceKey: (
    input: Connection.ReplaceKeyInput,
  ) => Effect.Effect<Connection.View, ReplaceKeyError, Actor.Service>;
  /**
   * Ask the connection's system whether the connection works, with its key, as its integration
   * checks it. It changes nothing, and holds no commit open while the system answers.
   */
  readonly check: (
    connectionId: Connection.Id,
  ) => Effect.Effect<ConnectionContract.Health, CheckError, Actor.Service>;
  /** Stop its use and delete its key; its record remains. */
  readonly remove: (connectionId: Connection.Id) => Effect.Effect<void, RemoveError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/connection/service/Service",
) {}

const ready: Connection.Readiness = { _tag: "Ready" };
const uninstalled: Connection.Readiness = { _tag: "Uninstalled" };

/** Capture workspace dependencies; resolve authority inside each operation. @category constructors */
export const make = Effect.fn("ConnectionService.make")(function* () {
  const authorization = yield* Authorization.Service;
  const connectionStore = yield* ConnectionStore.Service;
  const connectionCredentialStore = yield* ConnectionCredentialStore.Service;
  const integrations = yield* Integrations.Integrations;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const connectionTarget = (connectionId: Connection.Id) =>
    ({ _tag: "Connection", workspaceId, connectionId }) as const;

  const requireIntegration = (integration: string) =>
    Effect.mapError(integrations.find(integration), () => new UnknownIntegration({ integration }));

  /** Fails, as the integration describes it, for a connection the integration does not take. */
  const toInvalidConnection = (error: ConnectionContract.ConnectionError) =>
    new InvalidConnection({ description: error.reason.description });

  /** How ready the connection is, as the integration this host installs now finds it. */
  const readinessOf = Effect.fnUntraced(function* (record: Connection.Record) {
    const integration = yield* Effect.option(integrations.find(record.integration));
    if (Option.isNone(integration)) return uninstalled;
    const validated = yield* Effect.result(
      integration.value.validate(Connection.connectionOf(record)),
    );
    if (Result.isSuccess(validated)) return ready;
    const invalid: Connection.Readiness = {
      _tag: "Invalid",
      description: validated.failure.reason.description,
    };
    return invalid;
  });

  const viewOf = (record: Connection.Record, manageable: boolean) =>
    Effect.map(readinessOf(record), (readiness) => Connection.view(record, readiness, manageable));

  /** The connection as the actor sees it, including whether they may manage it. */
  const viewForActor = (record: Connection.Record) =>
    authorization
      .permitted([Requirement.make(ConnectionPermissions.Manage, connectionTarget(record.id))])
      .pipe(Effect.flatMap(([manageable = false]) => viewOf(record, manageable)));

  /** The active connection by ID, or NotFound. */
  const requireActiveConnection = Effect.fnUntraced(function* (connectionId: Connection.Id) {
    const found = yield* connectionStore.get(connectionId);
    if (Option.isNone(found) || found.value.status !== "active")
      return yield* new NotFound({ connectionId });
    return found.value;
  });

  /** A connection the actor may act on with `permission`; to anyone else it is missing. */
  const requirePermittedConnection = Effect.fnUntraced(function* (
    connectionId: Connection.Id,
    permission: Permission.Definition<"Connection">,
  ) {
    const record = yield* requireActiveConnection(connectionId);
    yield* Authorization.requireVisible(
      authorization,
      Requirement.make(ConnectionPermissions.Read, connectionTarget(connectionId)),
      Requirement.make(permission, connectionTarget(connectionId)),
      () => new NotFound({ connectionId }),
    );
    return record;
  });

  const setKey = (connectionId: Connection.Id, apiKey: Connection.ApiKey) =>
    connectionCredentialStore
      .set(connectionId, { apiKey })
      .pipe(
        Effect.catchTag("ConnectionCredentialStore.Unavailable", ({ reason }) =>
          Effect.fail(new CredentialsUnavailable({ reason })),
        ),
      );

  const listIntegrations = Effect.gen(function* () {
    yield* authorization.require([]);
    return integrations.all.map(Connection.integrationView);
  });

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const active = yield* connectionStore.listActive;
    // One grant resolution answers both permissions for every connection.
    const permitted = yield* authorization.permitted(
      active.flatMap((record) => [
        Requirement.make(ConnectionPermissions.Read, connectionTarget(record.id)),
        Requirement.make(ConnectionPermissions.Manage, connectionTarget(record.id)),
      ]),
    );
    const views = yield* Effect.forEach(
      active.flatMap((record, index) =>
        permitted[index * 2] === true ? [{ record, manageable: permitted[index * 2 + 1] }] : [],
      ),
      ({ record, manageable }) => viewOf(record, manageable === true),
    );
    return views.toSorted(
      (left, right) => left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1),
    );
  });

  const get = Effect.fn("ConnectionService.get")(function* (connectionId: Connection.Id) {
    const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
    return yield* viewForActor(yield* requirePermittedConnection(id, ConnectionPermissions.Read));
  });

  const models = Effect.fn("ConnectionService.models")(function* (connectionId: Connection.Id) {
    const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
    const record = yield* requirePermittedConnection(id, ConnectionPermissions.Read);
    return (yield* requireIntegration(record.integration)).models;
  });

  const create = Effect.fn("ConnectionService.create")(
    function* (input: Connection.CreateInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Connection.CreateInput))(input);
      yield* authorization.require([
        Requirement.make(ConnectionPermissions.Create, { _tag: "Workspace", workspaceId }),
      ]);
      const actor = yield* Actor.Service;
      const connectionId = Connection.Id.make(
        yield* Request.idFor(options.requestKey, [
          "connection.create",
          workspaceId,
          actor.memberId,
        ]),
      );
      // A retry returns the connection its first attempt created, unless it was removed since.
      if (options.requestKey !== undefined) {
        const retried = yield* connectionStore.get(connectionId);
        if (Option.isSome(retried)) {
          if (retried.value.status !== "active") return yield* new NotFound({ connectionId });
          return yield* viewForActor(retried.value);
        }
      }
      const created: Connection.Record = {
        id: connectionId,
        workspaceId,
        integration: request.integration,
        name: request.name,
        settings: request.settings,
        auth: request.auth,
        status: "active",
        createdBy: actor.memberId,
        createdAt: yield* DateTime.now,
      };
      const integration = yield* requireIntegration(created.integration);
      yield* Effect.mapError(
        integration.validate(Connection.connectionOf(created)),
        toInvalidConnection,
      );
      if (request.apiKey !== undefined) yield* setKey(connectionId, request.apiKey);
      yield* journal.publish(ConnectionFacts.Created, created);
      return yield* viewForActor(created);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const rename = Effect.fn("ConnectionService.rename")(
    function* (input: Connection.RenameInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Connection.RenameInput))(input);
      const record = yield* requirePermittedConnection(
        request.connectionId,
        ConnectionPermissions.Manage,
      );
      if (record.name === request.name) return yield* viewOf(record, true);
      if (record.name !== request.expectedName)
        return yield* new Changed({ connectionId: record.id });
      yield* journal.publish(ConnectionFacts.Renamed, {
        workspaceId,
        connectionId: record.id,
        name: request.name,
      });
      return yield* viewOf(Connection.change(record, { name: request.name }), true);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const configure = Effect.fn("ConnectionService.configure")(
    function* (input: Connection.ConfigureInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Connection.ConfigureInput))(input);
      const record = yield* requirePermittedConnection(
        request.connectionId,
        ConnectionPermissions.Manage,
      );
      const configured = Connection.change(record, { settings: request.settings });
      const integration = yield* requireIntegration(record.integration);
      yield* Effect.mapError(
        integration.validate(Connection.connectionOf(configured)),
        toInvalidConnection,
      );
      yield* journal.publish(ConnectionFacts.Configured, {
        workspaceId,
        connectionId: record.id,
        settings: request.settings,
      });
      return yield* viewOf(configured, true);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const replaceKey = Effect.fn("ConnectionService.replaceKey")(
    function* (input: Connection.ReplaceKeyInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Connection.ReplaceKeyInput))(input);
      const record = yield* requirePermittedConnection(
        request.connectionId,
        ConnectionPermissions.Manage,
      );
      if (record.auth !== "apiKey") return yield* new Keyless({ connectionId: record.id });
      yield* setKey(record.id, request.apiKey);
      yield* journal.publish(ConnectionFacts.KeyReplaced, {
        workspaceId,
        connectionId: record.id,
      });
      return yield* viewOf(record, true);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const check = Effect.fn("ConnectionService.check")(function* (connectionId: Connection.Id) {
    const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
    const record = yield* requirePermittedConnection(id, ConnectionPermissions.Manage);
    const integration = yield* requireIntegration(record.integration);
    const credential =
      record.auth === "apiKey"
        ? yield* connectionCredentialStore.get(record.id).pipe(
            Effect.map(Option.getOrUndefined),
            Effect.catchTag("ConnectionCredentialStore.Unavailable", ({ reason }) =>
              Effect.fail(new CredentialsUnavailable({ reason })),
            ),
          )
        : undefined;
    return yield* Effect.mapError(
      integration.check(Connection.connectionOf(record), credential),
      toInvalidConnection,
    );
  });

  const remove = Effect.fn("ConnectionService.remove")(
    function* (connectionId: Connection.Id) {
      const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
      const record = yield* requirePermittedConnection(id, ConnectionPermissions.Manage);
      if (record.auth === "apiKey") yield* connectionCredentialStore.remove(record.id);
      yield* journal.publish(ConnectionFacts.Removed, { workspaceId, connectionId: id });
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  return Service.of({
    integrations: listIntegrations,
    list,
    get,
    models,
    create,
    rename,
    configure,
    replaceKey,
    check,
    remove,
  });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as ConnectionService from "./service.ts";
