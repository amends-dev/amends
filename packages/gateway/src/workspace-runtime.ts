import * as Core from "@amends/core";
import { CommittedEvents, Journal } from "@amends/core/journal";
import { Workspace } from "@amends/core/workspace";
import { Context, Crypto, Duration, Effect, Exit, Layer, LayerMap, Schema, Scope } from "effect";
import { WorkspaceStorage } from "./storage.ts";
import { WorkspaceEvents } from "./workspace-events.ts";

/** Internal workspace context; gateway methods restrict which services callers can use. */
export type Provided = Layer.Success<typeof Core.layer> | Core.HostServices;

export interface Interface {
  /** Share a prepared workspace until the owning host scope closes. */
  readonly forWorkspace: (
    workspaceId: Workspace.Id,
  ) => Effect.Effect<Context.Context<Provided>, never, Scope.Scope>;
}

/**
 * Lazily boot each workspace once in the host scope. Concurrent callers await the
 * same boot; successful runtimes retain their services and bus lease until shutdown.
 * Request identity and transaction context must never enter service construction.
 *
 * @category constructors
 */
export const make = Effect.fn("WorkspaceRuntime.make")(function* () {
  const storage = yield* WorkspaceStorage.Service;
  const events = yield* WorkspaceEvents.Service;
  const cryptography = yield* Crypto.Crypto;
  const environment = yield* Effect.context<never>();

  const boot = Effect.fn("WorkspaceRuntime.boot")(function* (workspaceId: Workspace.Id) {
    const bindings = yield* storage.forWorkspace(workspaceId);
    const bus = yield* Effect.orDie(events.forWorkspace(workspaceId));
    if (bus.workspaceId !== workspaceId)
      return yield* Effect.die(
        new CommittedEvents.WorkspaceMismatch({
          expectedWorkspaceId: workspaceId,
          actualWorkspaceId: bus.workspaceId,
        }),
      );
    const services = Core.layer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeedContext(bindings),
          Layer.succeed(Crypto.Crypto, cryptography),
          Layer.succeed(CommittedEvents.Service, bus),
        ),
      ),
      Layer.orDie,
    );
    const context = yield* Layer.build(services);
    yield* Effect.orDie(Context.get(context, Journal.Service).replay);
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
    { idleTimeToLive: Duration.infinity },
  );

  const forWorkspace = Effect.fn("WorkspaceRuntime.forWorkspace")(function* (
    workspaceId: Workspace.Id,
  ) {
    const id = yield* Effect.orDie(Schema.decodeEffect(Workspace.Id)(workspaceId));
    return yield* runtimes.contextEffect(id);
  });

  return { forWorkspace } satisfies Interface;
});

export * as WorkspaceRuntime from "./workspace-runtime.ts";
