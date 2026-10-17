/**
 * The read-position write that operations share: marking a member's thread read through a position,
 * which also settles their notifications from it, and telling their sessions with a `ThreadRead`
 * signal once it is stored. Reading a thread and posting to it both read it this way, so a reader's
 * sessions keep their read positions without reading them again.
 *
 * @since 0.1.0
 */

import { Store, type StoreError } from "@amends-dev/log"
import * as Context from "effect/Context"
import type * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Signal from "../signal/Signal.ts"
import * as SignalHub from "../signal/SignalHub.ts"
import type * as ReadState from "./ReadState.ts"
import * as ReadStateStore from "./ReadStateStore.ts"

/**
 * The read-position write operations share.
 *
 * @category services
 * @since 0.1.0
 */
export class ReadStateCommand extends Context.Service<
  ReadStateCommand,
  {
    /**
     * Read the thread through the position at `at`, then tell the member's sessions: once the
     * caller's commit lands, when there is one, so a rollback tells no one, and at once otherwise.
     */
    readonly markThreadRead: (
      position: ReadState.ThreadPosition,
      at: DateTime.Utc
    ) => Effect.Effect<void, StoreError.StoreError>
  }
>()("@amends-dev/core/read-state/ReadStateCommand") {}

/**
 * Builds the command over the read-state store and the workspace's signals.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const readStateStore = yield* ReadStateStore.ReadStateStore
  const signalHub = yield* SignalHub.SignalHub
  const markThreadRead = Effect.fn("ReadStateCommand.markThreadRead")(function* (
    position: ReadState.ThreadPosition,
    at: DateTime.Utc
  ) {
    yield* readStateStore.markThreadRead(position, at)
    const told = signalHub.publish(
      Signal.Signal.cases.ThreadRead.make({
        workspaceId: position.workspaceId,
        memberId: position.memberId,
        threadId: position.threadId,
        readThrough: position.readThrough,
        readAt: at
      })
    )
    const storeTransaction = yield* Effect.serviceOption(Store.Transaction)
    if (Option.isSome(storeTransaction)) yield* storeTransaction.value.afterCommit(told)
    else yield* told
  })
  return ReadStateCommand.of({ markThreadRead })
})

/**
 * `ReadStateCommand` from `make`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ReadStateCommand, make)
