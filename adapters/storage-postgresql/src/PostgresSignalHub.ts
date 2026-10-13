/**
 * Each workspace's `SignalHub.SignalHub`, relayed between every process over the same database
 * through `PostgresNotices`: `publish` sends the JSON-encoded signal with `NOTIFY` outside any
 * transaction, and every pool's listener, the sender's included, offers it to that workspace's
 * subscribers. Nothing is stored, a signal over PostgreSQL's 8,000-byte notification limit is not
 * delivered, and behind a transaction-pooling proxy signals are unavailable.
 *
 * @since 0.1.0
 */

import { SignalHub } from "@amends-dev/core/signal"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Binding from "./internal/binding.ts"

/**
 * The workspace's signals, between every process over the same database, relayed with `NOTIFY`
 * on the pool's notice channel. A signal published here reaches this process's subscribers the
 * same way, through the listener; nothing is stored, and signals sent while a listener reconnects
 * are missed.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database } = yield* Binding.Binding
  return SignalHub.SignalHub.of({
    publish: database.notices.publishSignal,
    subscribe: database.notices.subscribeSignals(workspaceId)
  })
})

/**
 * Provides `SignalHub.SignalHub` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(SignalHub.SignalHub, make)
