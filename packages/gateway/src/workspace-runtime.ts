import * as Core from "@amends/core";
import { BuiltinRoleUpgrade } from "@amends/core/authorization";
import { AgentJobs, TurnJobs } from "@amends/core/turn";
import { ConnectionCatalog } from "@amends/core/connection";
import { EnvironmentCatalog } from "@amends/core/environment";
import type { HarnessImplementation } from "@amends/harness";
import type { SandboxImplementation } from "@amends/sandbox";
import type { ConnectionImplementation } from "@amends/connection";
import { type Integration, Integrations } from "@amends/connection-v2";
import { Journal } from "@amends/core/journal";
import { Workspace } from "@amends/core/workspace";
import {
  Context,
  Crypto,
  Duration,
  Effect,
  Exit,
  Layer,
  LayerMap,
  RcMap,
  Schema,
  Schedule,
  Scope,
} from "effect";
import { WorkspaceStorage } from "./storage.ts";

/** Internal workspace context; gateway methods restrict which services callers can use. */
export type Services = Layer.Success<typeof Core.layer> | Core.HostServices;

export interface Options {
  /**
   * The connection implementations this host installed, as they declare themselves; every
   * workspace checks its connections against them. Defaults to none.
   */
  readonly connections?: ReadonlyArray<ConnectionImplementation.Declaration> | undefined;
  /**
   * The harnesses and sandbox providers this host installed, as they declare themselves; every
   * workspace checks its environments against them. Each defaults to none.
   */
  readonly harnesses?: ReadonlyArray<HarnessImplementation.Declaration> | undefined;
  readonly sandboxes?: ReadonlyArray<SandboxImplementation.Declaration> | undefined;
  /**
   * The integrations this host installs, which every workspace's connections link to. Their ids
   * must be distinct. Defaults to none.
   */
  readonly integrations?: ReadonlyArray<Integration.Integration> | undefined;
  /**
   * How long a workspace stays prepared after its last lease closes. A later request prepares it
   * again from storage. Defaults to five minutes.
   */
  readonly idleTimeToLive?: Duration.Input | undefined;
}

export interface Interface {
  /**
   * Lease the workspace's prepared runtime for the caller's scope, preparing it first if need be;
   * it stays prepared while any lease is open.
   */
  readonly lease: (
    workspaceId: Workspace.Id,
  ) => Effect.Effect<Context.Context<Services>, never, Scope.Scope>;
  /** Whether the workspace is prepared or being prepared, so a lease on it would not prepare it. */
  readonly isPrepared: (workspaceId: Workspace.Id) => Effect.Effect<boolean>;
  /**
   * Stop sharing the workspace's prepared runtime: leases already open keep it until they close,
   * and the next lease prepares the workspace again from storage, replaying what it needs.
   */
  readonly invalidate: (workspaceId: Workspace.Id) => Effect.Effect<void>;
}

/**
 * Lazily prepare each workspace in the host scope. Concurrent callers await the same preparation,
 * and a successful runtime keeps its services, including its change-feed follower, while leases
 * are open and for the idle time-to-live after the last one closes; then it is released, and the
 * next request prepares it again. Request identity and transaction context must never enter service construction.
 *
 * @category constructors
 */
export const make = Effect.fn("WorkspaceRuntime.make")(function* (options: Options = {}) {
  const workspaceStorage = yield* WorkspaceStorage.Service;
  const agentJobs = yield* AgentJobs.Service;
  const turnJobs = yield* TurnJobs.Service;
  const crypto = yield* Crypto.Crypto;
  const hostContext = yield* Effect.context<never>();
  const connectionCatalog = ConnectionCatalog.make(options.connections ?? []);
  const environmentCatalog = EnvironmentCatalog.make({
    harnesses: options.harnesses,
    sandboxes: options.sandboxes,
  });
  const integrations = yield* Integrations.make(options.integrations ?? []);

  const prepareWorkspace = Effect.fn("WorkspaceRuntime.prepareWorkspace")(function* (
    workspaceId: Workspace.Id,
  ) {
    const bindings = yield* workspaceStorage.forWorkspace(workspaceId);
    const services = Core.layer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeedContext(bindings),
          Layer.succeed(Crypto.Crypto, crypto),
          Layer.succeed(AgentJobs.Service, agentJobs),
          Layer.succeed(TurnJobs.Service, turnJobs),
          Layer.succeed(ConnectionCatalog.Service, connectionCatalog),
          Layer.succeed(EnvironmentCatalog.Service, environmentCatalog),
          Layer.succeed(Integrations.Integrations, integrations),
        ),
      ),
      Layer.orDie,
    );
    const context = yield* Layer.build(services);
    yield* Effect.orDie(Context.get(context, Journal.Service).replay);
    // Bring built-in roles recorded by older code to this host's bundles. Recorded roles still
    // serve if it cannot run now, such as while another host writes; it then tries again in the
    // background, backing off to once a minute, for as long as the workspace stays prepared.
    const upgradeBuiltinRoles = BuiltinRoleUpgrade.upgrade().pipe(Effect.provide(context));
    yield* upgradeBuiltinRoles.pipe(
      Effect.catch((error) =>
        Effect.logWarning("Built-in role upgrade did not run; trying again later", error).pipe(
          Effect.andThen(
            upgradeBuiltinRoles.pipe(
              Effect.retry(
                Schedule.min([Schedule.exponential("1 second"), Schedule.spaced("1 minute")]),
              ),
              Effect.andThen(Effect.logInfo("Built-in role upgrade ran")),
              Effect.forkScoped,
            ),
          ),
        ),
      ),
    );
    return context;
  });

  const runtimes: LayerMap.LayerMap<Workspace.Id, Services> = yield* LayerMap.make(
    (workspaceId: Workspace.Id) =>
      Layer.effectContext(
        Effect.gen(function* () {
          const scope = yield* Scope.fork(yield* Scope.Scope);
          return yield* prepareWorkspace(workspaceId).pipe(
            Effect.setContext(Context.add(hostContext, Scope.Scope, scope)),
            // Evict from the acquisition itself: a cancelled waiter must never
            // discard a shared preparation, and failed waiters must not evict a later retry.
            Effect.onExit((exit) =>
              Exit.isFailure(exit)
                ? Scope.close(scope, exit).pipe(Effect.ensuring(runtimes.invalidate(workspaceId)))
                : Effect.void,
            ),
          );
        }),
      ),
    { idleTimeToLive: options.idleTimeToLive ?? Duration.minutes(5) },
  );

  const lease = Effect.fn("WorkspaceRuntime.lease")(function* (workspaceId: Workspace.Id) {
    const id = yield* Effect.orDie(Schema.decodeEffect(Workspace.Id)(workspaceId));
    return yield* runtimes.contextEffect(id);
  });

  const isPrepared = (workspaceId: Workspace.Id) => RcMap.has(runtimes.rcMap, workspaceId);

  const invalidate = (workspaceId: Workspace.Id) => runtimes.invalidate(workspaceId);

  return { lease, isPrepared, invalidate } satisfies Interface;
});

export * as WorkspaceRuntime from "./workspace-runtime.ts";
