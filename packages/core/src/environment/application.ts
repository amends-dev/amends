import type { HarnessImplementation } from "@amends/harness";
import type { SandboxImplementation } from "@amends/sandbox";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import type { Permission } from "../authorization/permission.ts";
import { Requirement } from "../authorization/requirement.ts";
import { ConnectionCatalog } from "../connection/catalog.ts";
import { Connection } from "../connection/connection.ts";
import { ConnectionPermissions } from "../connection/permissions.ts";
import { ConnectionStore } from "../connection/store.ts";
import { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import type { Request } from "../request/request.ts";
import { RequestReceipts } from "../request/receipts.ts";
import { EnvironmentCatalog } from "./catalog.ts";
import { EnvironmentCompatibility } from "./compatibility.ts";
import { Environment } from "./environment.ts";
import {
  Changed,
  InvalidSandbox,
  NotFound,
  UnknownHarness,
  UnknownSandboxProvider,
  UnsupportedPlacement,
  type SandboxIssue,
} from "./errors.ts";
import { EnvironmentFacts } from "./facts.ts";
import { EnvironmentPermissions } from "./permissions.ts";
import { EnvironmentStore } from "./store.ts";
export {
  Changed,
  InvalidSandbox,
  NotFound,
  UnknownHarness,
  UnknownSandboxProvider,
  UnsupportedPlacement,
} from "./errors.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "EnvironmentApplication.InvalidResponse",
  { message: Schema.String },
) {}

export type ReadError =
  | Authorization.Error
  | EnvironmentStore.Failure
  | ConnectionStore.Failure
  | Schema.SchemaError
  | NotFound
  | InvalidResponse;
export type Error = ReadError | PlatformError.PlatformError | Log.WriteError | Projection.Error;
/** Creating can also meet a harness or provider this host lacks, or a request key used before. */
export type CreateError =
  | Error
  | RequestReceipts.Error
  | UnknownHarness
  | UnknownSandboxProvider
  | UnsupportedPlacement
  | InvalidSandbox;
export type ConfigureError = Error | UnknownSandboxProvider | InvalidSandbox;

/** The harnesses and sandbox providers this host installed. */
export interface Implementations {
  readonly harnesses: ReadonlyArray<HarnessImplementation.Declaration>;
  readonly sandboxes: ReadonlyArray<SandboxImplementation.Declaration>;
}

export interface Interface {
  readonly workspaceId: Environment.Record["workspaceId"];
  /**
   * The harnesses and sandbox providers this host installed, as they declare themselves. They
   * describe the host rather than the workspace, so every member may see them.
   */
  readonly implementations: Implementations;
  /** The workspace's environments the actor may read, by name. */
  readonly list: Effect.Effect<ReadonlyArray<Environment.View>, ReadError, Actor.Service>;
  readonly get: (
    environmentId: Environment.Id,
  ) => Effect.Effect<Environment.View, ReadError, Actor.Service>;
  /**
   * Add an environment: an installed harness, and optionally a sandbox from an installed provider,
   * under an account connection when the provider runs under one.
   */
  readonly create: (
    input: Environment.CreateInput,
    options?: Request.Options,
  ) => Effect.Effect<Environment.View, CreateError, Actor.Service>;
  readonly rename: (
    input: Environment.RenameInput,
  ) => Effect.Effect<Environment.View, Error | Changed, Actor.Service>;
  /** Replace its sandbox settings; its harness, provider, and placement stay. */
  readonly configure: (
    input: Environment.ConfigureInput,
  ) => Effect.Effect<Environment.View, ConfigureError, Actor.Service>;
  /** Stop its use; its record remains for history. */
  readonly remove: (environmentId: Environment.Id) => Effect.Effect<void, Error, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/environment/application/Service",
) {}

const CreatedReference = Schema.Struct({ environmentId: Environment.Id });
type CreatedReference = typeof CreatedReference.Type;

/** Capture workspace dependencies; resolve authority inside each operation. @category constructors */
export const make = Effect.fn("EnvironmentApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const environments = yield* EnvironmentStore.Service;
  const connections = yield* ConnectionStore.Service;
  const catalog = yield* EnvironmentCatalog.Service;
  const connectionCatalog = yield* ConnectionCatalog.Service;
  const journal = yield* Journal.Service;
  const receipts = yield* RequestReceipts.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [environments.workspaceId, connections.workspaceId, receipts.workspaceId].some(
      (id) => id !== workspaceId,
    )
  )
    return yield* new InvalidResponse({
      message: "Environment services belong to different workspaces",
    });

  const target = (environmentId: Environment.Id) =>
    ({ _tag: "Environment", workspaceId, environmentId }) as const;
  const connectionTarget = (connectionId: Connection.Id) =>
    ({ _tag: "Connection", workspaceId, connectionId }) as const;

  /** Readiness from the host's catalogs and the account connection, as the environment is now. */
  const readinessOf = Effect.fnUntraced(function* (record: Environment.Record) {
    const connectionId = record.sandbox?.connectionId ?? null;
    const found = connectionId === null ? Option.none() : yield* connections.get(connectionId);
    return EnvironmentCompatibility.readiness(
      record,
      {
        harness: catalog.harness(record.harnessId),
        sandbox:
          record.sandbox === null ? Option.none() : catalog.sandbox(record.sandbox.providerId),
      },
      {
        record: found,
        declaration: Option.flatMap(found, (connection) =>
          connectionCatalog.get(connection.implementationId),
        ),
      },
    );
  });
  const viewOf = (record: Environment.Record, manageable: boolean) =>
    Effect.map(readinessOf(record), (readiness) => Environment.view(record, manageable, readiness));
  /** The environment as the actor sees it, including whether they may manage it. */
  const presented = (record: Environment.Record) =>
    authorization
      .permitted([Requirement.make(EnvironmentPermissions.Manage, target(record.id))])
      .pipe(Effect.flatMap(([manageable = false]) => viewOf(record, manageable)));

  const decode = Schema.decodeEffect(Schema.toType(Environment.Record));
  const decoded = (record: Environment.Record) =>
    decode(record).pipe(
      Effect.mapError(
        (cause) =>
          new InvalidResponse({
            message: `Environment store returned invalid data: ${cause.message}`,
          }),
      ),
    );
  /** The active environment by ID, or NotFound. */
  const load = Effect.fnUntraced(function* (environmentId: Environment.Id) {
    const found = yield* environments.get(environmentId);
    if (Option.isNone(found)) return yield* new NotFound({ environmentId });
    const record = yield* decoded(found.value);
    if (record.workspaceId !== workspaceId || record.id !== environmentId)
      return yield* new InvalidResponse({
        message: "Environment store returned another environment or workspace",
      });
    if (record.status !== "active") return yield* new NotFound({ environmentId });
    return record;
  });
  /** An environment the actor may act on with `permission`; to anyone else it is missing. */
  const authorized = Effect.fnUntraced(function* (
    environmentId: Environment.Id,
    permission: Permission.Definition<"Environment">,
  ) {
    const record = yield* load(environmentId);
    const [readable = false, permitted = false] = yield* authorization.permitted([
      Requirement.make(EnvironmentPermissions.Read, target(environmentId)),
      Requirement.make(permission, target(environmentId)),
    ]);
    if (!readable) return yield* new NotFound({ environmentId });
    if (!permitted)
      yield* authorization.require([Requirement.make(permission, target(environmentId))]);
    return record;
  });

  const harnessOf = (id: Environment.Record["harnessId"]) =>
    Option.match(catalog.harness(id), {
      onNone: () => Effect.fail(new UnknownHarness({ harnessId: id })),
      onSome: Effect.succeed,
    });
  const providerOf = (id: SandboxImplementation.Id) =>
    Option.match(catalog.sandbox(id), {
      onNone: () => Effect.fail(new UnknownSandboxProvider({ providerId: id })),
      onSome: Effect.succeed,
    });
  /**
   * Check sandbox settings against the provider: an account connection exactly when it runs under
   * one, which the actor may read and use and which is for this provider, and a template only when
   * it takes one.
   */
  const checkSandbox = Effect.fnUntraced(function* (
    provider: SandboxImplementation.Declaration,
    settings: Environment.SandboxSettings,
  ) {
    const issues: Array<SandboxIssue> = [];
    if (!provider.account) {
      if (settings.connectionId !== null) issues.push("connection-not-allowed");
    } else if (settings.connectionId === null) issues.push("connection-required");
    else {
      const connectionId = settings.connectionId;
      const found = Option.filter(
        yield* connections.get(connectionId),
        (connection) => connection.workspaceId === workspaceId && connection.status === "active",
      );
      const [readable = false, usable = false] = yield* authorization.permitted([
        Requirement.make(ConnectionPermissions.Read, connectionTarget(connectionId)),
        Requirement.make(ConnectionPermissions.Use, connectionTarget(connectionId)),
      ]);
      if (Option.isNone(found) || !readable || !usable) issues.push("connection-unavailable");
      else {
        const declaration = connectionCatalog.get(found.value.implementationId);
        if (
          Option.isNone(declaration) ||
          declaration.value.capabilities.sandbox?.provider !== provider.id
        )
          issues.push("connection-mismatch");
      }
    }
    if (settings.template !== null && provider.template === undefined)
      issues.push("template-not-allowed");
    const [first, ...rest] = issues;
    if (first !== undefined) return yield* new InvalidSandbox({ issues: [first, ...rest] });
  });
  const sandboxOf = (
    placement: Pick<Environment.Sandbox, "providerId" | "harness">,
    settings: Environment.SandboxSettings,
  ): Environment.Sandbox => ({
    providerId: placement.providerId,
    harness: placement.harness,
    connectionId: settings.connectionId,
    template: settings.template,
    env: settings.env,
    setup: settings.setup,
    retention: settings.retention,
  });
  const committed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Publication.withActor,
      Effect.provideService(Crypto.Crypto, crypto),
      journal.commit,
    );

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const records = yield* Effect.forEach(yield* environments.list, decoded);
    const active = records.filter(
      (record) => record.status === "active" && record.workspaceId === workspaceId,
    );
    // One grant resolution answers both permissions for every environment.
    const permitted = yield* authorization.permitted(
      active.flatMap((record) => [
        Requirement.make(EnvironmentPermissions.Read, target(record.id)),
        Requirement.make(EnvironmentPermissions.Manage, target(record.id)),
      ]),
    );
    const views = yield* Effect.forEach(
      active.flatMap((record, index) =>
        permitted[index * 2] === true
          ? [{ record, manageable: permitted[index * 2 + 1] === true }]
          : [],
      ),
      ({ record, manageable }) => viewOf(record, manageable),
    );
    return views.toSorted((left, right) =>
      left.name === right.name
        ? left.id < right.id
          ? -1
          : 1
        : left.name.localeCompare(right.name),
    );
  });

  const get = Effect.fn("EnvironmentApplication.get")(function* (environmentId: Environment.Id) {
    const id = yield* Schema.decodeEffect(Environment.Id)(environmentId);
    return yield* presented(yield* authorized(id, EnvironmentPermissions.Read));
  });

  const restore = Effect.fnUntraced(function* (reference: CreatedReference) {
    const found = yield* environments.get(reference.environmentId);
    if (Option.isNone(found))
      return yield* new NotFound({ environmentId: reference.environmentId });
    return yield* decoded(found.value);
  });

  const create = Effect.fn("EnvironmentApplication.create")(
    function* (input: Environment.CreateInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Environment.CreateInput))(input);
      const record = yield* receipts.once(
        {
          operation: "environment.create",
          key: options.requestKey,
          input: Environment.CreateInput,
          value: request,
          result: CreatedReference,
          resultOf: (created: Environment.Record) => ({ environmentId: created.id }),
          restore,
        },
        Effect.gen(function* () {
          yield* authorization.require([
            Requirement.make(EnvironmentPermissions.Create, { _tag: "Workspace", workspaceId }),
          ]);
          const harness = yield* harnessOf(request.harnessId);
          const placement = request.sandbox?.harness ?? "in-process";
          if (!harness.placement.includes(placement))
            return yield* new UnsupportedPlacement({ harnessId: harness.id, placement });
          if (request.sandbox !== null)
            yield* checkSandbox(yield* providerOf(request.sandbox.providerId), request.sandbox);
          const created: Environment.Record = {
            id: Environment.Id.make(yield* crypto.randomUUIDv4),
            workspaceId,
            name: request.name,
            harnessId: harness.id,
            sandbox: request.sandbox === null ? null : sandboxOf(request.sandbox, request.sandbox),
            status: "active",
            createdBy: (yield* Actor.Service).memberId,
            createdAt: yield* DateTime.now,
          };
          yield* journal.publish(EnvironmentFacts.Created, created);
          return created;
        }),
      );
      return yield* presented(record);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const rename = Effect.fn("EnvironmentApplication.rename")(function* (
    input: Environment.RenameInput,
  ) {
    const request = yield* Schema.decodeEffect(Schema.toType(Environment.RenameInput))(input);
    return yield* Effect.gen(function* () {
      const record = yield* authorized(request.environmentId, EnvironmentPermissions.Manage);
      if (record.name === request.name) return yield* viewOf(record, true);
      if (record.name !== request.expectedName)
        return yield* new Changed({ environmentId: record.id });
      yield* journal.publish(EnvironmentFacts.Renamed, {
        workspaceId,
        environmentId: record.id,
        name: request.name,
      });
      return yield* viewOf(Environment.change(record, { name: request.name }), true);
    }).pipe(committed);
  });

  const configure = Effect.fn("EnvironmentApplication.configure")(function* (
    input: Environment.ConfigureInput,
  ) {
    const request = yield* Schema.decodeEffect(Schema.toType(Environment.ConfigureInput))(input);
    return yield* Effect.gen(function* () {
      const record = yield* authorized(request.environmentId, EnvironmentPermissions.Manage);
      if (record.sandbox === null) return yield* new InvalidSandbox({ issues: ["no-sandbox"] });
      yield* checkSandbox(yield* providerOf(record.sandbox.providerId), request.sandbox);
      const sandbox = sandboxOf(record.sandbox, request.sandbox);
      yield* journal.publish(EnvironmentFacts.Configured, {
        workspaceId,
        environmentId: record.id,
        sandbox,
      });
      return yield* viewOf(Environment.change(record, { sandbox }), true);
    }).pipe(committed);
  });

  const remove = Effect.fn("EnvironmentApplication.remove")(function* (
    environmentId: Environment.Id,
  ) {
    const id = yield* Schema.decodeEffect(Environment.Id)(environmentId);
    return yield* Effect.gen(function* () {
      yield* authorized(id, EnvironmentPermissions.Manage);
      yield* journal.publish(EnvironmentFacts.Removed, { workspaceId, environmentId: id });
    }).pipe(committed);
  });

  return Service.of({
    workspaceId,
    implementations: { harnesses: catalog.harnesses, sandboxes: catalog.sandboxes },
    list,
    get,
    create,
    rename,
    configure,
    remove,
  });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as EnvironmentApplication from "./application.ts";
