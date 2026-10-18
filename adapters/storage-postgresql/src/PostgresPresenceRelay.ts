/**
 * The presence relay of a host whose processes share one database: each signal is a notice on the
 * pool's channel, which every process's listener hears, its own included. A notice lost is a signal
 * lost, which its repeating makes good, and nothing of presence is stored.
 *
 * @since 0.1.0
 */

import { PresenceRelay } from "@amends-dev/core/presence"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import * as PostgresDatabase from "./PostgresDatabase.ts"

/**
 * The relay over the connected database's notices.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  PresenceRelay.PresenceRelay,
  Effect.map(PostgresDatabase.PostgresDatabase, ({ notices }) =>
    PresenceRelay.PresenceRelay.of({
      send: notices.notifyPresence,
      signals: (workspaceId) =>
        Effect.map(
          notices.presence,
          Stream.filter((signal) => signal.workspaceId === workspaceId)
        )
    })
  )
)
