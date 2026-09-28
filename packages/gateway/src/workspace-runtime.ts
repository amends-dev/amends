import * as Core from "@amends/core";
import { BuiltinRoleUpgrade } from "@amends/core/authorization";
import { BackgroundWakes } from "@amends/core/background";
import { ConnectionCatalog } from "@amends/core/connection";
import { EnvironmentCatalog } from "@amends/core/environment";
import type { HarnessImplementation } from "@amends/harness";
import type { SandboxImplementation } from "@amends/sandbox";
import type { ConnectionImplementation } from "@amends/connection";
import { Journal } from "@amends/core/journal";
import { Signals } from "@amends/core/signal";
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
import { SignalHub } from "./signals.ts";
import { WorkspaceStorage } from "./storage.ts";
import { WorkspaceWakes } from "./wakes.ts";

/** Internal workspace context; gateway methods restrict which services callers can use. */
export type Provided = Layer.Success<typeof Core.layer> | Core.HostServices;

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
   * How long a workspace stays prepared after its last lease closes. A later request boots it
   * again from storage. Defaults to five minutes.
   */
  readonly idleTimeToLive?: Duration.Input | undefined;
}

export interface Interface {
  /** Share a prepared workspace for the caller's scope; it stays prepared while any lease is open. */
  readonly forWorkspace: (
    workspaceId: Workspace.Id,
  ) => Effect.Effect<Context.Context<Provided>, never, Scope.Scope>;
  /** Whether the workspace is prepared or being prepared, so a lease on it would not boot it. */
  readonly prepared: (workspaceId: Workspace.Id) => Effect.Effect<boolean>;
  /**
   * Stop sharing the workspace's prepared runtime: leases already open keep it until they close,
   * and the next lease prepares the workspace again from storage, replaying what it needs.
   */
  readonly invalidate: (workspaceId: Workspace.Id) => Effect.Effect<void>;
}

/**
 * Lazily boot each workspace in the host scope. Concurrent callers await the same boot, and
 * a successful runtime keeps its services, including its change-feed follower, while leases are
 * open and for the idle time-to-live after the last one closes; then it is released, and the
 * next request boots it again. Request identity and transaction context must never enter service construction.
 *
 * @category constructors
 */
export const make = Effect.fn("WorkspaceRuntime.make")(function* (options: Options = {}) {
  const storage = yield* WorkspaceStorage.Service;
  const hub = yield* SignalHub.Service;
  const wakes = yield* WorkspaceWakes.Service;
  const cryptography = yield* Crypto.Crypto;
  const environment = yield* Effect.context<never>();
  const catalog = ConnectionCatalog.make(options.connections ?? []);
  const environments = EnvironmentCatalog.make({
    harnesses: options.harnesses,
    sandboxes: options.sandboxes,
  });

  const boot = Effect.fn("WorkspaceRuntime.boot")(function* (workspaceId: Workspace.Id) {
    const bindings = yield* storage.forWorkspace(workspaceId);
    const services = Core.layer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeedContext(bindings),
          Layer.succeed(Crypto.Crypto, cryptography),
          Layer.succeed(Signals.Service, hub.forWorkspace(workspaceId)),
          Layer.succeed(BackgroundWakes.Service, wakes.forWorkspace(workspaceId)),
          Layer.succeed(ConnectionCatalog.Service, catalog),
          Layer.succeed(EnvironmentCatalog.Service, environments),
        ),
      ),
      Layer.orDie,
    );
    const context = yield* Layer.build(services);
    yield* Effect.orDie(Context.get(context, Journal.Service).replay);
    // Bring built-in roles recorded by older code to this host's bundles. Recorded roles still
    // serve if it cannot run now, such as while another host writes; it then tries again in the
    // background, backing off to once a minute, for as long as the workspace stays prepared.
    const upgrade = BuiltinRoleUpgrade.upgrade().pipe(Effect.provide(context));
    yield* upgrade.pipe(
      Effect.catch((error) =>
        Effect.logWarning("Built-in role upgrade did not run; trying again later", error).pipe(
          Effect.andThen(
            upgrade.pipe(
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

  const runtimes: LayerMap.LayerMap<Workspace.Id, Provided> = yield* LayerMap.make(
    (workspaceId: Workspace.Id) =>
      Layer.effectContext(
        Effect.gen(function* () {
          const scope = yield* Scope.fork(yield* Scope.Scope);
          return yield* boot(workspaceId).pipe(
            Effect.setContext(Context.add(environment, Scope.Scope, scope)),
            // Evict from the acquisition itself: a cancelled waiter must never
            // discard shared boot, and failed waiters must not evict a later retry.
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

  const forWorkspace = Effect.fn("WorkspaceRuntime.forWorkspace")(function* (
    workspaceId: Workspace.Id,
  ) {
    const id = yield* Effect.orDie(Schema.decodeEffect(Workspace.Id)(workspaceId));
    return yield* runtimes.contextEffect(id);
  });

  const prepared = (workspaceId: Workspace.Id) => RcMap.has(runtimes.rcMap, workspaceId);

  const invalidate = (workspaceId: Workspace.Id) => runtimes.invalidate(workspaceId);

  return { forWorkspace, prepared, invalidate } satisfies Interface;
});

export * as WorkspaceRuntime from "./workspace-runtime.ts";
