/**
 * Keeps the workspace read model, `WorkspaceStore`: the workspace as it was initialized, as since
 * renamed, and with whoever owns it now.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Projection from "../journal/Projection.ts"
import * as WorkspaceFacts from "./WorkspaceFacts.ts"
import * as WorkspaceStore from "./WorkspaceStore.ts"

/**
 * Inserts the workspace on its initialization, sets its name on each rename, and moves its owner
 * on each ownership transfer. It replays what the facts record without repeating the authorization
 * or the role assignments those operations did.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("workspace.metadata", { version: 1 })
  .on(
    WorkspaceFacts.Renamed,
    Effect.fn("WorkspaceProjection.renamed")(function* ({ payload }) {
      yield* (yield* WorkspaceStore.WorkspaceStore).rename(payload)
    })
  )
  .on(
    WorkspaceFacts.Initialized,
    Effect.fn("WorkspaceProjection.initialized")(function* ({ payload }) {
      yield* (yield* WorkspaceStore.WorkspaceStore).insert(payload)
    })
  )
  .on(
    WorkspaceFacts.OwnershipTransferred,
    Effect.fn("WorkspaceProjection.ownershipTransferred")(function* ({ payload }) {
      yield* (yield* WorkspaceStore.WorkspaceStore).transferOwnership(payload)
    })
  )
