import { ConnectionImplementation } from "@amends/connection";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
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
import { ConnectionCatalog } from "./catalog.ts";
import { Connection } from "./connection.ts";
import { ConnectionCredentialStore } from "./credential-store.ts";
import {
  Changed,
  CredentialsUnavailable,
  InvalidSettings,
  NotFound,
  UnknownImplementation,
  UnsupportedAuthentication,
} from "./errors.ts";
import { ConnectionFacts } from "./facts.ts";
import { ConnectionPermissions } from "./permissions.ts";
import { ConnectionStore } from "./store.ts";
export {
  Changed,
  CredentialsUnavailable,
  InvalidSettings,
  NotFound,
  UnknownImplementation,
  UnsupportedAuthentication,
} from "./errors.ts";

export type ReadError =
  | Authorization.Error
  | ConnectionStore.Failure
  | Schema.SchemaError
  | NotFound;
export type Error =
  | ReadError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | ConnectionCredentialStore.Failure;
/** Creating can also meet an implementation this host lacks, or a request key used before. */
export type CreateError =
  | Error
  | UnknownImplementation
  | InvalidSettings
  | UnsupportedAuthentication;
export type ConfigureError = Error | UnknownImplementation | InvalidSettings;
export type CredentialError =
  | Error
  | UnknownImplementation
  | UnsupportedAuthentication
  | CredentialsUnavailable;

export interface Interface {
  /**
   * The implementations this host installed, as they declare themselves. They describe the host
   * rather than the workspace, so every member may see them.
   */
  readonly implementations: ReadonlyArray<ConnectionImplementation.Declaration>;
  /** The workspace's connections the actor may read, by name. */
  readonly list: Effect.Effect<ReadonlyArray<Connection.View>, ReadError, Actor.Service>;
  readonly get: (
    connectionId: Connection.Id,
  ) => Effect.Effect<Connection.View, ReadError, Actor.Service>;
  /**
   * Add a connection through an installed implementation, with settings it declares and a way
   * of authenticating it accepts. Its credential, if it takes one, is set separately.
   */
  readonly create: (
    input: Connection.CreateInput,
    options?: Request.Options,
  ) => Effect.Effect<Connection.View, CreateError, Actor.Service>;
  readonly rename: (
    input: Connection.RenameInput,
  ) => Effect.Effect<Connection.View, Error | Changed, Actor.Service>;
  /** Replace its settings, which must match what the implementation declares. */
  readonly configure: (
    input: Connection.ConfigureInput,
  ) => Effect.Effect<Connection.View, ConfigureError, Actor.Service>;
  /** Store a new credential for a connection that takes one, replacing any earlier one. */
  readonly setCredential: (
    input: Connection.SetCredentialInput,
  ) => Effect.Effect<Connection.View, CredentialError, Actor.Service>;
  readonly clearCredential: (
    connectionId: Connection.Id,
  ) => Effect.Effect<Connection.View, Error | UnsupportedAuthentication, Actor.Service>;
  /** Stop its use and delete its credential; its record remains for history. */
  readonly remove: (connectionId: Connection.Id) => Effect.Effect<void, Error, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/connection/service/Service",
) {}

/** Capture workspace dependencies; resolve authority inside each operation. @category constructors */
export const make = Effect.fn("ConnectionService.make")(function* () {
  const authorization = yield* Authorization.Service;
  const connectionStore = yield* ConnectionStore.Service;
  const connectionCredentialStore = yield* ConnectionCredentialStore.Service;
  const connectionCatalog = yield* ConnectionCatalog.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const connectionTarget = (connectionId: Connection.Id) =>
    ({ _tag: "Connection", workspaceId, connectionId }) as const;
  const findDeclaration = (id: ConnectionImplementation.Id) =>
    Option.getOrUndefined(connectionCatalog.get(id));
  const toView = (record: Connection.Record, manageable: boolean) =>
    Connection.view(record, findDeclaration(record.implementationId), manageable);
  /** The connection as the actor sees it, including whether they may manage it. */
  const viewForActor = (record: Connection.Record) =>
    authorization
      .permitted([Requirement.make(ConnectionPermissions.Manage, connectionTarget(record.id))])
      .pipe(Effect.map(([manageable = false]) => toView(record, manageable)));

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
  const checkSettings = (
    declaration: ConnectionImplementation.Declaration,
    settings: Connection.Settings,
  ) => {
    const issues = Connection.settingIssues(declaration, settings);
    return issues.length === 0 ? Effect.void : Effect.fail(new InvalidSettings({ issues }));
  };
  const requireImplementation = (id: ConnectionImplementation.Id) =>
    Option.match(connectionCatalog.get(id), {
      onNone: () => Effect.fail(new UnknownImplementation({ implementationId: id })),
      onSome: Effect.succeed,
    });

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const active = (yield* connectionStore.list).filter((record) => record.status === "active");
    // One grant resolution answers both permissions for every connection.
    const permitted = yield* authorization.permitted(
      active.flatMap((record) => [
        Requirement.make(ConnectionPermissions.Read, connectionTarget(record.id)),
        Requirement.make(ConnectionPermissions.Manage, connectionTarget(record.id)),
      ]),
    );
    return active
      .flatMap((record, index) =>
        permitted[index * 2] === true ? [toView(record, permitted[index * 2 + 1] === true)] : [],
      )
      .toSorted((left, right) =>
        left.name === right.name
          ? left.id < right.id
            ? -1
            : 1
          : left.name.localeCompare(right.name),
      );
  });

  const get = Effect.fn("ConnectionService.get")(function* (connectionId: Connection.Id) {
    const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
    return yield* viewForActor(yield* requirePermittedConnection(id, ConnectionPermissions.Read));
  });

  const readRetriedConnection = Effect.fnUntraced(function* (connectionId: Connection.Id) {
    const found = yield* connectionStore.get(connectionId);
    if (Option.isNone(found)) return yield* new NotFound({ connectionId });
    return found.value;
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
      // A retry returns the connection its first attempt created.
      if (
        options.requestKey !== undefined &&
        Option.isSome(yield* connectionStore.get(connectionId))
      )
        return yield* viewForActor(yield* readRetriedConnection(connectionId));
      const declaration = yield* requireImplementation(request.implementationId);
      if (
        !declaration.authentication.some(
          ConnectionImplementation.Authentication.isAnyOf([request.authentication]),
        )
      )
        return yield* new UnsupportedAuthentication({
          implementationId: declaration.id,
          method: request.authentication,
        });
      yield* checkSettings(declaration, request.settings);
      const created: Connection.Record = {
        id: connectionId,
        workspaceId,
        name: request.name,
        implementationId: declaration.id,
        settings: request.settings,
        authentication:
          request.authentication === "ApiKey"
            ? { _tag: "ApiKey", credentialId: null }
            : { _tag: "None" },
        status: "active",
        createdBy: actor.memberId,
        createdAt: yield* DateTime.now,
      };
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
      if (record.name === request.name) return toView(record, true);
      if (record.name !== request.expectedName)
        return yield* new Changed({ connectionId: record.id });
      yield* journal.publish(ConnectionFacts.Renamed, {
        workspaceId,
        connectionId: record.id,
        name: request.name,
      });
      return toView(Connection.change(record, { name: request.name }), true);
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
      yield* checkSettings(yield* requireImplementation(record.implementationId), request.settings);
      yield* journal.publish(ConnectionFacts.Configured, {
        workspaceId,
        connectionId: record.id,
        settings: request.settings,
      });
      return toView(Connection.change(record, { settings: request.settings }), true);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const setCredential = Effect.fn("ConnectionService.setCredential")(
    function* (input: Connection.SetCredentialInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Connection.SetCredentialInput))(
        input,
      );
      const record = yield* requirePermittedConnection(
        request.connectionId,
        ConnectionPermissions.Manage,
      );
      const declaration = yield* requireImplementation(record.implementationId);
      if (!Connection.Authentication.isAnyOf(["ApiKey"])(record.authentication))
        return yield* new UnsupportedAuthentication({
          implementationId: declaration.id,
          method: record.authentication._tag,
        });
      const credentialId = Connection.CredentialId.make(yield* crypto.randomUUIDv4);
      yield* connectionCredentialStore
        .put({ id: credentialId, connectionId: record.id, secret: request.secret })
        .pipe(
          Effect.catchTag("ConnectionCredentialStore.Unavailable", ({ reason }) =>
            Effect.fail(new CredentialsUnavailable({ reason })),
          ),
          // A credential takes a new random ID, which nothing else holds.
          Effect.catchTag("ConnectionCredentialStore.Conflict", Effect.die),
        );
      const replaced = record.authentication.credentialId;
      if (replaced !== null) yield* connectionCredentialStore.remove(replaced);
      yield* journal.publish(ConnectionFacts.CredentialSet, {
        workspaceId,
        connectionId: record.id,
        credentialId,
      });
      return toView(
        Connection.change(record, { authentication: { _tag: "ApiKey", credentialId } }),
        true,
      );
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const clearCredential = Effect.fn("ConnectionService.clearCredential")(
    function* (connectionId: Connection.Id) {
      const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
      const record = yield* requirePermittedConnection(id, ConnectionPermissions.Manage);
      if (!Connection.Authentication.isAnyOf(["ApiKey"])(record.authentication))
        return yield* new UnsupportedAuthentication({
          implementationId: record.implementationId,
          method: record.authentication._tag,
        });
      const cleared = record.authentication.credentialId;
      if (cleared === null) return toView(record, true);
      yield* connectionCredentialStore.remove(cleared);
      yield* journal.publish(ConnectionFacts.CredentialCleared, { workspaceId, connectionId: id });
      return toView(
        Connection.change(record, { authentication: { _tag: "ApiKey", credentialId: null } }),
        true,
      );
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const remove = Effect.fn("ConnectionService.remove")(
    function* (connectionId: Connection.Id) {
      const id = yield* Schema.decodeEffect(Connection.Id)(connectionId);
      const record = yield* requirePermittedConnection(id, ConnectionPermissions.Manage);
      if (
        Connection.Authentication.isAnyOf(["ApiKey"])(record.authentication) &&
        record.authentication.credentialId !== null
      )
        yield* connectionCredentialStore.remove(record.authentication.credentialId);
      yield* journal.publish(ConnectionFacts.Removed, { workspaceId, connectionId: id });
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  return Service.of({
    implementations: connectionCatalog.list,
    list,
    get,
    create,
    rename,
    configure,
    setCredential,
    clearCredential,
    remove,
  });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as ConnectionService from "./service.ts";
