import { CommittedEvents } from "@amends/core/journal";
import { Workspace } from "@amends/core/workspace";
import { Context, Effect, Layer, RcMap, Schema } from "effect";
import type { Scope } from "effect";

/** Process-local ownership of workspace buses. Construct once in the host's service scope. */
export interface Interface {
  /**
   * Acquire this workspace's shared bus for the caller's scope. Concurrent callers share
   * one acquisition; the final release shuts it down. A subscription must keep its lease open.
   * This internal operation creates no workspace and performs no authorization.
   */
  readonly forWorkspace: (
    workspaceId: Workspace.Id,
  ) => Effect.Effect<CommittedEvents.Interface, Schema.SchemaError, Scope.Scope>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/workspace-events/Service",
) {}

/**
 * Construct a registry with reference-counted buses and no idle retention or history.
 * Closing its scope shuts down every bus, including buses with outstanding leases.
 *
 * @category constructors
 */
export const make = Effect.fn("WorkspaceEvents.make")(function* (
  options: CommittedEvents.Options = { capacity: 256 },
): Effect.fn.Return<Interface, Schema.SchemaError, Scope.Scope> {
  const configuration = yield* Schema.decodeEffect(CommittedEvents.Options)(options);
  const buses = yield* RcMap.make({
    lookup: (workspaceId: Workspace.Id) => CommittedEvents.make(workspaceId, configuration),
  });
  const forWorkspace = Effect.fn("WorkspaceEvents.forWorkspace")(function* (
    workspaceId: Workspace.Id,
  ) {
    const id = yield* Schema.decodeEffect(Workspace.Id)(workspaceId);
    return yield* RcMap.get(buses, id);
  });
  return Service.of({ forWorkspace });
});

/**
 * Provide a registry once at the host boundary, shared by workspace requests and subscriptions.
 *
 * @category layers
 */
export const layer = (options?: CommittedEvents.Options) => Layer.effect(Service, make(options));

export * as WorkspaceEvents from "./workspace-events.ts";
