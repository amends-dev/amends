/**
 * Workspace storage in process memory, the reference implementation of
 * `WorkspaceStorage.WorkspaceStorage`: each workspace's stores and signal hub are core's
 * `MemoryStores`, bound to the workspace over one `MemoryConnection`.
 *
 * @since 0.1.0
 */
import { MemoryConnection, MemoryStores } from "@amends-dev/core/memory";
import type { Workspace } from "@amends-dev/core/workspace";
import { Effect, Layer } from "effect";
import * as WorkspaceStorage from "../WorkspaceStorage.ts";

/**
 * One connection, with inexpensive workspace-bound views over it. The stores hold no resources,
 * so the scope that builds them can close at once.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("MemoryWorkspaceStorage.make")(function* () {
  const memoryConnection = yield* MemoryConnection.MemoryConnection;
  const forWorkspace: WorkspaceStorage.WorkspaceStorage["Service"]["forWorkspace"] = Effect.fn(
    "MemoryWorkspaceStorage.forWorkspace",
  )(
    function* (workspaceId: Workspace.Id) {
      return yield* Effect.scoped(Layer.build(MemoryStores.layer(workspaceId)));
    },
    Effect.provideService(MemoryConnection.MemoryConnection, memoryConnection),
  );
  return WorkspaceStorage.WorkspaceStorage.of({ forWorkspace });
});

/**
 * Provide `WorkspaceStorage.WorkspaceStorage` over the `MemoryConnection` beneath it.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(WorkspaceStorage.WorkspaceStorage, make());
