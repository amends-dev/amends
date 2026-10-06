import { type Connection, Integrations } from "@amends/connection-v2";
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
import { ConnectionV2 } from "./connection.ts";
import { ConnectionV2CredentialStore } from "./credential-store.ts";
import {
  Changed,
  CredentialsUnavailable,
  InvalidConnection,
  Keyless,
  NotFound,
  UnknownIntegration,
} from "./errors.ts";
import { ConnectionV2Facts } from "./facts.ts";
import { ConnectionV2Permissions } from "./permissions.ts";
import { ConnectionV2Store } from "./store.ts";
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
  | ConnectionV2Store.Failure
  | Schema.SchemaError
  | NotFound;
/** What every change can meet besides reading. */
export type Error = ReadError | PlatformError.PlatformError | Log.WriteError | Projection.Error;
/** Storing or reading a key can also meet a host that keeps no credentials. */
type KeyError = ConnectionV2CredentialStore.Failure | CredentialsUnavailable;
export type CreateError = Error | UnknownIntegration | InvalidConnection | KeyError;
export type ConfigureError = Error | UnknownIntegration | InvalidConnection;
export type ReplaceKeyError = Error | Keyless | KeyError;
export type RemoveError = Error | ConnectionV2CredentialStore.Failure;
export type CheckError = ReadError | UnknownIntegration | InvalidConnection | KeyError;

export interface Interface {
  /**
   * The integrations this host installs, in the order it installs them. They describe the host
   * rather than the workspace, so every member may see them.
   */
  readonly integrations: Effect.Effect<
    ReadonlyArray<ConnectionV2.IntegrationView>,
    Authorization.Error,
    Actor.Service
  >;
  /** The workspace's connections the actor may read, by name. */
  readonly list: Effect.Effect<ReadonlyArray<ConnectionV2.View>, ReadError, Actor.Service>;
  readonly get: (
    connectionId: ConnectionV2.Id,
  ) => Effect.Effect<ConnectionV2.View, ReadError, Actor.Service>;
  /**
   * Connect the workspace to an installed integration, with settings and a way of authenticating
   * the integration takes, and its key when it authenticates with one, stored in the same commit.
   */
  readonly create: (
    input: ConnectionV2.CreateInput,
    options?: Request.Options,
  ) => Effect.Effect<ConnectionV2.View, CreateError, Actor.Service>;
  readonly rename: (
    input: ConnectionV2.RenameInput,
  ) => Effect.Effect<ConnectionV2.View, Error | Changed, Actor.Service>;
  /** Replace its settings, which its integration must take. */
  readonly configure: (
    input: ConnectionV2.ConfigureInput,
  ) => Effect.Effect<ConnectionV2.View, ConfigureError, Actor.Service>;
  /** Store a new key for a connection that authenticates with one, in place of its key. */
  readonly replaceKey: (
    input: ConnectionV2.ReplaceKeyInput,
  ) => Effect.Effect<ConnectionV2.View, ReplaceKeyError, Actor.Service>;
  /**
   * Ask the connection's system whether the connection works, with its key, as its integration
   * checks it. It changes nothing, and holds no commit open while the system answers.
   */
  readonly check: (
    connectionId: ConnectionV2.Id,
  ) => Effect.Effect<Connection.Health, CheckError, Actor.Service>;
  /** Stop its use and delete its key; its record remains. */
  readonly remove: (
    connectionId: ConnectionV2.Id,
  ) => Effect.Effect<void, RemoveError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/connection-v2/service/Service",
) {}

const ready: ConnectionV2.Readiness = { _tag: "Ready" };
const uninstalled: ConnectionV2.Readiness = { _tag: "Uninstalled" };

/** Capture workspace dependencies; resolve authority inside each operation. @category constructors */
export const make = Effect.fn("ConnectionV2Service.make")(function* () {
  const authorization = yield* Authorization.Service;
  const connectionV2Store = yield* ConnectionV2Store.Service;
  const connectionV2CredentialStore = yield* ConnectionV2CredentialStore.Service;
  const integrations = yield* Integrations.Integrations;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const connectionTarget = (connectionId: ConnectionV2.Id) =>
    ({ _tag: "ConnectionV2", workspaceId, connectionId }) as const;

  /** The connection as its integration takes it. */
  const connectionOf = (record: ConnectionV2.Record): Connection.Connection => ({
    id: record.id,
    integration: record.integration,
    name: record.name,
    settings: record.settings,
    auth: record.auth,
  });

  const requireIntegration = (integration: string) =>
    Effect.mapError(integrations.find(integration), () => new UnknownIntegration({ integration }));

  /** Fails, as the integration describes it, for a connection the integration does not take. */
  const toInvalidConnection = (error: Connection.ConnectionError) =>
    new InvalidConnection({ description: error.reason.description });

  /** How ready the connection is, as the integration this host installs now finds it. */
  const readinessOf = Effect.fnUntraced(function* (record: ConnectionV2.Record) {
    const integration = yield* Effect.option(integrations.find(record.integration));
    if (Option.isNone(integration)) return uninstalled;
    const validated = yield* Effect.result(integration.value.validate(connectionOf(record)));
    if (Result.isSuccess(validated)) return ready;
    const invalid: ConnectionV2.Readiness = {
      _tag: "Invalid",
      description: validated.failure.reason.description,
    };
    return invalid;
  });

  const viewOf = (record: ConnectionV2.Record, manageable: boolean) =>
    Effect.map(readinessOf(record), (readiness) =>
      ConnectionV2.view(record, readiness, manageable),
    );

  /** The connection as the actor sees it, including whether they may manage it. */
  const viewForActor = (record: ConnectionV2.Record) =>
    authorization
      .permitted([Requirement.make(ConnectionV2Permissions.Manage, connectionTarget(record.id))])
      .pipe(Effect.flatMap(([manageable = false]) => viewOf(record, manageable)));

  /** The active connection by ID, or NotFound. */
  const requireActiveConnection = Effect.fnUntraced(function* (connectionId: ConnectionV2.Id) {
    const found = yield* connectionV2Store.get(connectionId);
    if (Option.isNone(found) || found.value.status !== "active")
      return yield* new NotFound({ connectionId });
    return found.value;
  });

  /** A connection the actor may act on with `permission`; to anyone else it is missing. */
  const requirePermittedConnection = Effect.fnUntraced(function* (
    connectionId: ConnectionV2.Id,
    permission: Permission.Definition<"ConnectionV2">,
  ) {
    const record = yield* requireActiveConnection(connectionId);
    yield* Authorization.requireVisible(
      authorization,
      Requirement.make(ConnectionV2Permissions.Read, connectionTarget(connectionId)),
      Requirement.make(permission, connectionTarget(connectionId)),
      () => new NotFound({ connectionId }),
    );
    return record;
  });

  const setKey = (connectionId: ConnectionV2.Id, apiKey: ConnectionV2.ApiKey) =>
    connectionV2CredentialStore
      .set(connectionId, { apiKey })
      .pipe(
        Effect.catchTag("ConnectionV2CredentialStore.Unavailable", ({ reason }) =>
          Effect.fail(new CredentialsUnavailable({ reason })),
        ),
      );

  const listIntegrations = Effect.gen(function* () {
    yield* authorization.require([]);
    return integrations.all.map(ConnectionV2.integrationView);
  });

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const active = yield* connectionV2Store.listActive;
    // One grant resolution answers both permissions for every connection.
    const permitted = yield* authorization.permitted(
      active.flatMap((record) => [
        Requirement.make(ConnectionV2Permissions.Read, connectionTarget(record.id)),
        Requirement.make(ConnectionV2Permissions.Manage, connectionTarget(record.id)),
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

  const get = Effect.fn("ConnectionV2Service.get")(function* (connectionId: ConnectionV2.Id) {
    const id = yield* Schema.decodeEffect(ConnectionV2.Id)(connectionId);
    return yield* viewForActor(yield* requirePermittedConnection(id, ConnectionV2Permissions.Read));
  });

  const create = Effect.fn("ConnectionV2Service.create")(
    function* (input: ConnectionV2.CreateInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(ConnectionV2.CreateInput))(input);
      yield* authorization.require([
        Requirement.make(ConnectionV2Permissions.Create, { _tag: "Workspace", workspaceId }),
      ]);
      const actor = yield* Actor.Service;
      const connectionId = ConnectionV2.Id.make(
        yield* Request.idFor(options.requestKey, [
          "connection-v2.create",
          workspaceId,
          actor.memberId,
        ]),
      );
      // A retry returns the connection its first attempt created, unless it was removed since.
      if (options.requestKey !== undefined) {
        const retried = yield* connectionV2Store.get(connectionId);
        if (Option.isSome(retried)) {
          if (retried.value.status !== "active") return yield* new NotFound({ connectionId });
          return yield* viewForActor(retried.value);
        }
      }
      const created: ConnectionV2.Record = {
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
      yield* Effect.mapError(integration.validate(connectionOf(created)), toInvalidConnection);
      if (request.apiKey !== undefined) yield* setKey(connectionId, request.apiKey);
      yield* journal.publish(ConnectionV2Facts.Created, created);
      return yield* viewForActor(created);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const rename = Effect.fn("ConnectionV2Service.rename")(
    function* (input: ConnectionV2.RenameInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(ConnectionV2.RenameInput))(input);
      const record = yield* requirePermittedConnection(
        request.connectionId,
        ConnectionV2Permissions.Manage,
      );
      if (record.name === request.name) return yield* viewOf(record, true);
      if (record.name !== request.expectedName)
        return yield* new Changed({ connectionId: record.id });
      yield* journal.publish(ConnectionV2Facts.Renamed, {
        workspaceId,
        connectionId: record.id,
        name: request.name,
      });
      return yield* viewOf(ConnectionV2.change(record, { name: request.name }), true);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const configure = Effect.fn("ConnectionV2Service.configure")(
    function* (input: ConnectionV2.ConfigureInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(ConnectionV2.ConfigureInput))(input);
      const record = yield* requirePermittedConnection(
        request.connectionId,
        ConnectionV2Permissions.Manage,
      );
      const configured = ConnectionV2.change(record, { settings: request.settings });
      const integration = yield* requireIntegration(record.integration);
      yield* Effect.mapError(integration.validate(connectionOf(configured)), toInvalidConnection);
      yield* journal.publish(ConnectionV2Facts.Configured, {
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

  const replaceKey = Effect.fn("ConnectionV2Service.replaceKey")(
    function* (input: ConnectionV2.ReplaceKeyInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(ConnectionV2.ReplaceKeyInput))(
        input,
      );
      const record = yield* requirePermittedConnection(
        request.connectionId,
        ConnectionV2Permissions.Manage,
      );
      if (record.auth !== "apiKey") return yield* new Keyless({ connectionId: record.id });
      yield* setKey(record.id, request.apiKey);
      yield* journal.publish(ConnectionV2Facts.KeyReplaced, {
        workspaceId,
        connectionId: record.id,
      });
      return yield* viewOf(record, true);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const check = Effect.fn("ConnectionV2Service.check")(function* (connectionId: ConnectionV2.Id) {
    const id = yield* Schema.decodeEffect(ConnectionV2.Id)(connectionId);
    const record = yield* requirePermittedConnection(id, ConnectionV2Permissions.Manage);
    const integration = yield* requireIntegration(record.integration);
    const credential =
      record.auth === "apiKey"
        ? yield* connectionV2CredentialStore.get(record.id).pipe(
            Effect.map(Option.getOrUndefined),
            Effect.catchTag("ConnectionV2CredentialStore.Unavailable", ({ reason }) =>
              Effect.fail(new CredentialsUnavailable({ reason })),
            ),
          )
        : undefined;
    return yield* Effect.mapError(
      integration.check(connectionOf(record), credential),
      toInvalidConnection,
    );
  });

  const remove = Effect.fn("ConnectionV2Service.remove")(
    function* (connectionId: ConnectionV2.Id) {
      const id = yield* Schema.decodeEffect(ConnectionV2.Id)(connectionId);
      const record = yield* requirePermittedConnection(id, ConnectionV2Permissions.Manage);
      if (record.auth === "apiKey") yield* connectionV2CredentialStore.remove(record.id);
      yield* journal.publish(ConnectionV2Facts.Removed, { workspaceId, connectionId: id });
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  return Service.of({
    integrations: listIntegrations,
    list,
    get,
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

export * as ConnectionV2Service from "./service.ts";
