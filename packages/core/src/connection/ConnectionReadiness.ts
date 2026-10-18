/**
 * How ready a connection is, as the integration its host installs now finds it: `Ready`, `Invalid`
 * when the integration no longer takes its settings or how it authenticates, or `Uninstalled`.
 * It reads nothing but the integrations it is given. `ConnectionService` reports it in each view,
 * and the replica holds it with each connection.
 *
 * @since 0.1.0
 */

import type { Integrations } from "@amends-dev/connection"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Connection from "./Connection.ts"

/**
 * How ready `record` is, as `integrations` find it.
 *
 * @category getters
 * @since 0.1.0
 */
export const readinessOf = Effect.fnUntraced(function* (
  record: Connection.Connection,
  integrations: Integrations.Integrations["Service"]
): Effect.fn.Return<Connection.Readiness> {
  const integration = yield* Effect.option(integrations.find(record.integration))
  if (Option.isNone(integration)) return Connection.Readiness.cases.Uninstalled.make({})
  return yield* Effect.match(integration.value.validate(Connection.connectionOf(record)), {
    onFailure: (error): Connection.Readiness =>
      Connection.Readiness.cases.Invalid.make({ description: error.reason.message }),
    onSuccess: (): Connection.Readiness => Connection.Readiness.cases.Ready.make({})
  })
})
