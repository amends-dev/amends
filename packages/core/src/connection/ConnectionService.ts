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
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Authorization from "../authorization/Authorization.ts";
import type * as Permission from "../authorization/Permission.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as Target from "../authorization/Target.ts";
import * as Actor from "../identity/Actor.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as Request from "../request/Request.ts";
import * as Connection from "./Connection.ts";
import * as ConnectionCredentialStore from "./ConnectionCredentialStore.ts";
import * as ConnectionFacts from "./ConnectionFacts.ts";
import * as ConnectionPermissions from "./ConnectionPermissions.ts";
import * as ConnectionStore from "./ConnectionStore.ts";
import * as CoreError from "../error/CoreError.ts";
import * as Operation from "../operation/Operation.ts";

/**
 * What reading connections can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable;

/**
 * What every change can fail with: reading's failures, and what its commit meets.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What creating a connection can fail with: an integration the host does not install or that does
 * not take the connection, besides what every change meets.
 *
 * @category errors
 * @since 0.1.0
 */
export type CreateError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What configuring a connection can fail with: an integration the host no longer installs, or one
 * that does not take the new settings.
 *
 * @category errors
 * @since 0.1.0
 */
export type ConfigureError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What replacing a connection's key can fail with: a connection that takes no key, or a host that
 * keeps no keys.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReplaceKeyError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What removing a connection can fail with: a change's failures.
 *
 * @category errors
 * @since 0.1.0
 */
export type RemoveError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What checking a connection can fail with: reading it, and an integration the host no longer
 * installs or that does not take the connection.
 *
 * @category errors
 * @since 0.1.0
 */
export type CheckError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable;

/**
 * What reading the models a connection offers can fail with: reading it, and an integration the
 * host no longer installs.
 *
 * @category errors
 * @since 0.1.0
 */
export type ModelsError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable;

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
      CoreError.Denied | CoreError.Invalid | CoreError.Unavailable,
      Actor.Actor
    >;
    /** The workspace's connections the actor may read, by name. */
    readonly list: Effect.Effect<ReadonlyArray<Connection.View>, ReadError, Actor.Actor>;
    /**
     * The connection, under `connection.read`; a missing, removed, or unreadable one is
     * `CoreError.NotFound`.
     */
    readonly get: (
      connectionId: Connection.Id,
    ) => Effect.Effect<Connection.View, ReadError, Actor.Actor>;
    /**
     * The models the connection offers an agent, to set an agent up with one: those its integration
     * lists, and whether it also offers others by any id. A connection whose integration this host
     * no longer installs offers nothing, and fails with `CoreError.Invalid` (`UnknownIntegration`).
     */
    readonly models: (
      connectionId: Connection.Id,
    ) => Effect.Effect<Connection.Models, ModelsError, Actor.Actor>;
    /**
     * Connect the workspace to an installed integration, with settings and a way of authenticating
     * the integration takes, and its key when it authenticates with one, stored in the same commit.
     * Needs `connection.create` on the workspace. A retry with the same request key returns the
     * connection its first attempt created, or `CoreError.NotFound` once that connection is
     * removed.
     */
    readonly create: (
      input: Connection.CreateInput,
      options?: Request.Options,
    ) => Effect.Effect<Connection.View, CreateError, Actor.Actor>;
    /**
     * Give a connection a new name, under `connection.manage`. The same name again records nothing;
     * otherwise a name other than `expectedName` is `CoreError.Changed`, and nothing is recorded.
     */
    readonly rename: (
      input: Connection.RenameInput,
    ) => Effect.Effect<Connection.View, Error | CoreError.Changed, Actor.Actor>;
    /** Replace its settings, which its integration must take, under `connection.manage`. */
    readonly configure: (
      input: Connection.ConfigureInput,
    ) => Effect.Effect<Connection.View, ConfigureError, Actor.Actor>;
    /**
     * Store a new key for a connection that authenticates with one, in place of its key, under
     * `connection.manage`; a connection that authenticates with none is `CoreError.Invalid`
     * (`Keyless`).
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
>()("@amends-dev/core/connection/ConnectionService") {}

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

  /** The integration this host installs as `integration`, or `UnknownIntegration`. */
  const requireIntegration = (integration: string) =>
    Effect.mapError(
      integrations.find(integration),
      () => new CoreError.Invalid({ reason: new CoreError.UnknownIntegration({ integration }) }),
    );

  /** Fails, as the integration describes it, for a connection the integration does not take. */
  const toInvalidConnection = (error: ConnectionContract.ConnectionError) =>
    new CoreError.Invalid({
      reason: new CoreError.IntegrationRefused({ description: error.reason.description }),
    });

  /** Fails unless the integration this host installs takes `record`, as it describes it. */
  const requireValid = Effect.fnUntraced(function* (record: Connection.Connection) {
    const integration = yield* requireIntegration(record.integration);
    yield* Effect.mapError(
      integration.validate(Connection.connectionOf(record)),
      toInvalidConnection,
    );
  });

  /** How ready the connection is, as the integration this host installs now finds it. */
  const readinessOf = Effect.fnUntraced(function* (
    record: Connection.Connection,
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

  const viewOf = (record: Connection.Connection, manageable: boolean) =>
    Effect.map(readinessOf(record), (readiness) => Connection.view(record, readiness, manageable));

  /** The connection as the actor sees it, including whether they may manage it. */
  const viewForActor = Effect.fnUntraced(function* (record: Connection.Connection) {
    const [manageable = false] = yield* authorization.permitted([
      Requirement.make(ConnectionPermissions.Manage, connectionTarget(record.id)),
    ]);
    return yield* viewOf(record, manageable);
  });

  /** The active connection by ID, or `CoreError.NotFound`. */
  const requireActiveConnection = Effect.fnUntraced(function* (connectionId: Connection.Id) {
    const found = yield* connectionStore.get(connectionId);
    if (Option.isNone(found) || found.value.status !== "active")
      return yield* new CoreError.NotFound({ resource: "Connection", id: connectionId });
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
      () => new CoreError.NotFound({ resource: "Connection", id: connectionId }),
    );
    return record;
  });

  /** Store `apiKey` as the connection's key, in place of any it had. */
  const setKey = (connectionId: Connection.Id, apiKey: Connection.ApiKey) =>
    connectionCredentialStore.set(connectionId, { apiKey });

  /** The connection's key, read for using it, or nothing for one that authenticates with none. */
  const credentialOf = Effect.fnUntraced(function* (record: Connection.Connection) {
    if (record.auth !== "apiKey") return undefined;
    const credential = yield* connectionCredentialStore.get(record.id);
    return Option.getOrUndefined(credential);
  });

  /** Views by name, and by id among connections of one name. */
  const byName = (left: Connection.View, right: Connection.View) =>
    left.name.localeCompare(right.name) || (left.id < right.id ? -1 : 1);

  const listIntegrations = Effect.gen(function* () {
    yield* authorization.require([]);
    return integrations.all.map(Connection.integrationView);
  }).pipe(Operation.report);

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
  }).pipe(Operation.report);

  const get = Effect.fn("ConnectionService.get")(function* (connectionId: Connection.Id) {
    const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
    return yield* viewForActor(yield* requirePermittedConnection(id, ConnectionPermissions.Read));
  }, Operation.report);

  const models = Effect.fn("ConnectionService.models")(function* (connectionId: Connection.Id) {
    const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
    const record = yield* requirePermittedConnection(id, ConnectionPermissions.Read);
    const integration = yield* requireIntegration(record.integration);
    return integration.models;
  }, Operation.report);

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
      const created: Connection.Connection = {
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
    Operation.report,
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
        return yield* new CoreError.Changed({ resource: "Connection", id: record.id });
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
    Operation.report,
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
    Operation.report,
  );

  const replaceKey = Effect.fn("ConnectionService.replaceKey")(
    function* (input: Connection.ReplaceKeyInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Connection.ReplaceKeyInput))(input);
      const record = yield* requirePermittedConnection(
        request.connectionId,
        ConnectionPermissions.Manage,
      );
      if (record.auth !== "apiKey")
        return yield* new CoreError.Invalid({
          reason: new CoreError.Keyless({ connectionId: record.id }),
        });
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
    Operation.report,
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
  }, Operation.report);

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
    Operation.report,
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
