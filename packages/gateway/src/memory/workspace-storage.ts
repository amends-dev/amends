import { MemoryConnection, MemoryStores } from "@amends-dev/core/memory";
import type { Workspace } from "@amends-dev/core/workspace";
import { Effect, Layer } from "effect";
import { WorkspaceStorage } from "../storage.ts";

/**
 * One connection, with inexpensive workspace-bound views over it. The stores hold no resources,
 * so the scope that builds them can close at once.
 *
 * @category constructors
 */
export const make = Effect.fn("MemoryWorkspaceStorage.make")(function* () {
  const memoryConnection = yield* MemoryConnection.Service;
  const forWorkspace: WorkspaceStorage.Interface["forWorkspace"] = Effect.fn(
    "MemoryWorkspaceStorage.forWorkspace",
  )(
    function* (workspaceId: Workspace.Id) {
      return yield* Effect.scoped(Layer.build(MemoryStores.layer(workspaceId)));
    },
    Effect.provideService(MemoryConnection.Service, memoryConnection),
  );
  return WorkspaceStorage.Service.of({ forWorkspace });
});

/**
 * Expose the workspace views to the gateway as its workspace storage contract.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceStorage.Service, make());

export * as MemoryWorkspaceStorage from "./workspace-storage.ts";
