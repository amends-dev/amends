/**
 * The operations on connections an actor calls: listing the integrations the host installs,
 * reading the workspace's connections and the models each offers, and creating, renaming,
 * configuring, replacing the key of, checking, and removing one. A key goes to
 * `ConnectionCredentialStore` in the commit that records it, and no view returns one. Each
 * operation authorizes the actor itself; changes write inside one journal commit, and reads and
 * `check` run outside any.
 *
 * @since 0.1.0
 */
import { type Connection as ConnectionContract, Integrations } from "@amends-dev/connection";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import * as Authorization from "../authorization/Authorization.ts";
import type * as Permission from "../authorization/Permission.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as Target from "../authorization/Target.ts";
import * as Actor from "../identity/Actor.ts";
import * as Journal from "../journal/Journal.ts";
import type * as Log from "../journal/Log.ts";
import type * as Projection from "../journal/Projection.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as Request from "../request/Request.ts";
import * as Connection from "./Connection.ts";
import * as ConnectionCredentialStore from "./ConnectionCredentialStore.ts";
import {
  Changed,
  CredentialsUnavailable,
  InvalidConnection,
  Keyless,
  NotFound,
  UnknownIntegration,
} from "./ConnectionErrors.ts";
import * as ConnectionFacts from "./ConnectionFacts.ts";
import * as ConnectionPermissions from "./ConnectionPermissions.ts";
import * as ConnectionStore from "./ConnectionStore.ts";
export {
  /**
   * The connection's name is no longer the one expected: someone renamed it meanwhile.
   *
   * @category errors
   * @since 0.1.0
   */
  Changed,
  /**
   * This host keeps no credentials, so no connection that authenticates with a key can be used.
   *
   * @category errors
   * @since 0.1.0
   */
  CredentialsUnavailable,
  /**
   * The integration does not take the connection: its settings, how it authenticates, or, when
   * checking one that authenticates with a key, a missing key. The description is the integration's,
   * for the person who gave them.
   *
   * @category errors
   * @since 0.1.0
   */
  InvalidConnection,
  /**
   * The connection authenticates with nothing, so it takes no key.
   *
   * @category errors
   * @since 0.1.0
   */
  Keyless,
  /**
   * The connection is missing, removed, or not readable by the actor; the three are not told apart.
   *
   * @category errors
   * @since 0.1.0
   */
  NotFound,
  /**
   * This host does not install the integration, or no longer installs the one a connection names.
   *
   * @category errors
   * @since 0.1.0
   */
  UnknownIntegration,
} from "./ConnectionErrors.ts";

/**
 * What reading connections can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError =
  | Authorization.Error
  | ConnectionStore.Failure
  | Schema.SchemaError
  | NotFound;

/**
 * What every change can fail with: reading's failures, and recording the change in the journal.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = ReadError | PlatformError.PlatformError | Log.WriteError | Projection.Error;
/** Storing or reading a key can also meet a host that keeps no credentials. */
type KeyError = ConnectionCredentialStore.Failure | CredentialsUnavailable;

/**
 * What creating a connection can fail with: an integration the host does not install or that does
 * not take the connection, and storing its key.
 *
 * @category errors
 * @since 0.1.0
 */
export type CreateError = Error | UnknownIntegration | InvalidConnection | KeyError;

/**
 * What configuring a connection can fail with: an integration the host no longer installs, or one
 * that does not take the new settings.
 *
 * @category errors
 * @since 0.1.0
 */
export type ConfigureError = Error | UnknownIntegration | InvalidConnection;

/**
 * What replacing a connection's key can fail with: a connection that takes no key, and storing the
 * new one.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReplaceKeyError = Error | Keyless | KeyError;

/**
 * What removing a connection can fail with: a change's failures, and deleting its key.
 *
 * @category errors
 * @since 0.1.0
 */
export type RemoveError = Error | ConnectionCredentialStore.Failure;

/**
 * What checking a connection can fail with: reading it, an integration the host no longer installs
 * or that does not take the connection, and reading its key.
 *
 * @category errors
 * @since 0.1.0
 */
export type CheckError = ReadError | UnknownIntegration | InvalidConnection | KeyError;

/**
 * What reading the models a connection offers can fail with: reading it, and an integration the
 * host no longer installs.
 *
 * @category errors
 * @since 0.1.0
 */
export type ModelsError = ReadError | UnknownIntegration;

/**
 * The connection operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class ConnectionService extends Context.Service<
  ConnectionService,
  {
    /**
     * The integrations this host installs, in the order it installs them. They describe the host
     * rather than the workspace, so every member may see them.
     */
    readonly integrations: Effect.Effect<
      ReadonlyArray<Connection.IntegrationView>,
      Authorization.Error,
      Actor.Actor
    >;
    /** The workspace's connections the actor may read, by name. */
    readonly list: Effect.Effect<ReadonlyArray<Connection.View>, ReadError, Actor.Actor>;
    /**
     * The connection, under `connection.read`; a missing, removed, or unreadable one is
     * `NotFound`.
     */
    readonly get: (
      connectionId: Connection.Id,
    ) => Effect.Effect<Connection.View, ReadError, Actor.Actor>;
    /**
     * The models the connection offers an agent, to set an agent up with one: those its integration
     * lists, and whether it also offers others by any id. A connection whose integration this host
     * no longer installs offers nothing, and fails with `UnknownIntegration`.
     */
    readonly models: (
      connectionId: Connection.Id,
    ) => Effect.Effect<Connection.Models, ModelsError, Actor.Actor>;
    /**
     * Connect the workspace to an installed integration, with settings and a way of authenticating
     * the integration takes, and its key when it authenticates with one, stored in the same commit.
     * Needs `connection.create` on the workspace. A retry with the same request key returns the
     * connection its first attempt created, or `NotFound` once that connection is removed.
     */
    readonly create: (
      input: Connection.CreateInput,
      options?: Request.Options,
    ) => Effect.Effect<Connection.View, CreateError, Actor.Actor>;
    /**
     * Give a connection a new name, under `connection.manage`. The same name again records nothing;
     * otherwise a name other than `expectedName` is `Changed`, and nothing is recorded.
     */
    readonly rename: (
      input: Connection.RenameInput,
    ) => Effect.Effect<Connection.View, Error | Changed, Actor.Actor>;
    /** Replace its settings, which its integration must take, under `connection.manage`. */
    readonly configure: (
      input: Connection.ConfigureInput,
    ) => Effect.Effect<Connection.View, ConfigureError, Actor.Actor>;
    /**
     * Store a new key for a connection that authenticates with one, in place of its key, under
     * `connection.manage`; a connection that authenticates with none is `Keyless`.
     */
    readonly replaceKey: (
      input: Connection.ReplaceKeyInput,
    ) => Effect.Effect<Connection.View, ReplaceKeyError, Actor.Actor>;
    /**
     * Ask the connection's system whether the connection works, with its key, as its integration
     * checks it. It changes nothing, and holds no commit open while the system answers. Needs
     * `connection.manage`, since it sends the key.
     */
    readonly check: (
      connectionId: Connection.Id,
    ) => Effect.Effect<ConnectionContract.Health, CheckError, Actor.Actor>;
    /** Stop its use and delete its key, under `connection.manage`; its record remains. */
    readonly remove: (connectionId: Connection.Id) => Effect.Effect<void, RemoveError, Actor.Actor>;
  }
>()("@amends-dev/core/connection/service/Service") {}

/**
 * Builds the connection operations over the stores, the host's `Integrations`, the journal, and
 * authorization; each operation resolves the actor's authority itself.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ConnectionService.make")(function* () {
  const authorization = yield* Authorization.Authorization;
  const connectionStore = yield* ConnectionStore.ConnectionStore;
  const connectionCredentialStore = yield* ConnectionCredentialStore.ConnectionCredentialStore;
  const integrations = yield* Integrations.Integrations;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;

  const connectionTarget = (connectionId: Connection.Id) =>
    Target.Reference.cases.Connection.make({ workspaceId, connectionId });

  /** The integration this host installs as `integration`, or UnknownIntegration. */
  const requireIntegration = (integration: string) =>
    Effect.mapError(integrations.find(integration), () => new UnknownIntegration({ integration }));

  /** Fails, as the integration describes it, for a connection the integration does not take. */
  const toInvalidConnection = (error: ConnectionContract.ConnectionError) =>
    new InvalidConnection({ description: error.reason.description });

  /** Fails unless the integration this host installs takes `record`, as it describes it. */
  const requireValid = Effect.fnUntraced(function* (record: Connection.Record) {
    const integration = yield* requireIntegration(record.integration);
    yield* Effect.mapError(
      integration.validate(Connection.connectionOf(record)),
      toInvalidConnection,
    );
  });

  /** How ready the connection is, as the integration this host installs now finds it. */
  const readinessOf = Effect.fnUntraced(function* (
    record: Connection.Record,
  ): Effect.fn.Return<Connection.Readiness> {
    const integration = yield* Effect.option(integrations.find(record.integration));
    if (Option.isNone(integration)) return { _tag: "Uninstalled" };
    return yield* Effect.match(integration.value.validate(Connection.connectionOf(record)), {
      onFailure: (error): Connection.Readiness => ({
        _tag: "Invalid",
        description: error.reason.description,
      }),
      onSuccess: (): Connection.Readiness => ({ _tag: "Ready" }),
    });
  });

  const viewOf = (record: Connection.Record, manageable: boolean) =>
    Effect.map(readinessOf(record), (readiness) => Connection.view(record, readiness, manageable));

  /** The connection as the actor sees it, including whether they may manage it. */
  const viewForActor = Effect.fnUntraced(function* (record: Connection.Record) {
    const [manageable = false] = yield* authorization.permitted([
      Requirement.make(ConnectionPermissions.Manage, connectionTarget(record.id)),
    ]);
    return yield* viewOf(record, manageable);
  });

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

  /** Store `apiKey` as the connection's key, in place of any it had. */
  const setKey = (connectionId: Connection.Id, apiKey: Connection.ApiKey) =>
    connectionCredentialStore
      .set(connectionId, { apiKey })
      .pipe(
        Effect.catchTag(
          "ConnectionCredentialStore.Unavailable",
          ({ reason }) => new CredentialsUnavailable({ reason }),
        ),
      );

  /** The connection's key, read for using it, or nothing for one that authenticates with none. */
  const credentialOf = Effect.fnUntraced(function* (record: Connection.Record) {
    if (record.auth !== "apiKey") return undefined;
    const credential = yield* connectionCredentialStore
      .get(record.id)
      .pipe(
        Effect.catchTag(
          "ConnectionCredentialStore.Unavailable",
          ({ reason }) => new CredentialsUnavailable({ reason }),
        ),
      );
    return Option.getOrUndefined(credential);
  });

  /** Views by name, and by id among connections of one name. */
  const byName = (left: Connection.View, right: Connection.View) =>
    left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1);

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
    const views: Array<Connection.View> = [];
    for (const [index, record] of active.entries()) {
      const [readable = false, manageable = false] = permitted.slice(index * 2, index * 2 + 2);
      if (readable) views.push(yield* viewOf(record, manageable));
    }
    return views.toSorted(byName);
  });

  const get = Effect.fn("ConnectionService.get")(function* (connectionId: Connection.Id) {
    const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
    return yield* viewForActor(yield* requirePermittedConnection(id, ConnectionPermissions.Read));
  });

  const models = Effect.fn("ConnectionService.models")(function* (connectionId: Connection.Id) {
    const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
    const record = yield* requirePermittedConnection(id, ConnectionPermissions.Read);
    const integration = yield* requireIntegration(record.integration);
    return integration.models;
  });

  const create = Effect.fn("ConnectionService.create")(
    function* (input: Connection.CreateInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Connection.CreateInput))(input);
      yield* authorization.require([
        Requirement.make(ConnectionPermissions.Create, { _tag: "Workspace", workspaceId }),
      ]);
      const actor = yield* Actor.Actor;
      const connectionId = Connection.Id.make(
        yield* Request.idFor(options.requestKey, [
          "connection.create",
          workspaceId,
          actor.memberId,
        ]),
      );
      // A retry returns the connection its first attempt created, unless it was removed since.
      if (
        options.requestKey !== undefined &&
        Option.isSome(yield* connectionStore.get(connectionId))
      )
        return yield* viewForActor(yield* requireActiveConnection(connectionId));
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
      yield* requireValid(created);
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
      yield* requireValid(configured);
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
    const credential = yield* credentialOf(record);
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

  return ConnectionService.of({
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

/**
 * Provide the connection operations over the stores, the host's integrations, and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ConnectionService, make());
