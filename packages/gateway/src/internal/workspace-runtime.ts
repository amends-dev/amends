/**
 * The gateway's prepared workspaces, one runtime for each. Preparing a workspace binds its
 * storage, builds core over it, replays the journal, and upgrades its built-in roles; every caller
 * shares the runtime while a lease on it is open and for the idle time-to-live after the last one
 * closes. Only `Gateway` uses it, and restricts which of a runtime's services each program may
 * require.
 */

import { type Integration, Integrations } from "@amends-dev/connection"
import * as Core from "@amends-dev/core"
import { BuiltinRoleUpgrade } from "@amends-dev/core/authorization"
import { DeliveryJobs } from "@amends-dev/core/channel"
import { Journal } from "@amends-dev/core/journal"
import { TurnJobs } from "@amends-dev/core/turn"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as LayerMap from "effect/LayerMap"
import * as RcMap from "effect/RcMap"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as WorkspaceStorage from "../WorkspaceStorage.ts"

/**
 * What a prepared workspace provides: core's services and the host services it was built over.
 * The gateway's methods restrict which of them a program may require.
 */
export type Services = Layer.Success<typeof Core.layer> | Core.HostServices

/**
 * How the gateway prepares workspaces: the integrations each workspace's core receives, and how
 * long an unused workspace stays prepared. `Gateway.Options` is this type.
 */
export interface Options {
  /**
   * The integrations this host installs, which every workspace's connections link to. Their ids
   * must be distinct. Defaults to none.
   */
  readonly integrations?: ReadonlyArray<Integration.Integration> | undefined
  /**
   * How long a workspace stays prepared after its last lease closes. A later request prepares it
   * again from storage. Defaults to five minutes.
   */
  readonly idleTimeToLive?: Duration.Input | undefined
}

/**
 * What `make` returns: leases on prepared workspaces, and a way to stop sharing one.
 */
export interface Interface {
  /**
   * Lease the workspace's prepared runtime for the caller's scope, preparing it first if need be;
   * it stays prepared while any lease is open.
   */
  readonly lease: (workspaceId: WorkspaceId.WorkspaceId) => Effect.Effect<Context.Context<Services>, never, Scope.Scope>
  /** Whether the workspace is prepared or being prepared, so a lease on it would not prepare it. */
  readonly isPrepared: (workspaceId: WorkspaceId.WorkspaceId) => Effect.Effect<boolean>
  /**
   * Stop sharing the workspace's prepared runtime: leases already open keep it until they close,
   * and the next lease prepares the workspace again from storage, replaying what it needs.
   */
  readonly invalidate: (workspaceId: WorkspaceId.WorkspaceId) => Effect.Effect<void>
}

/**
 * Lazily prepare each workspace in the host scope. Concurrent callers await the same preparation,
 * and a successful runtime keeps its services, including its change-feed follower, while leases
 * are open and for the idle time-to-live after the last one closes; then it is released, and the
 * next request prepares it again. Request identity and transaction context must never enter
 * service construction.
 */
export const make = Effect.fnUntraced(function* (options: Options = {}) {
  const workspaceStorage = yield* WorkspaceStorage.WorkspaceStorage
  const turnJobs = yield* TurnJobs.TurnJobs
  const deliveryJobs = yield* DeliveryJobs.DeliveryJobs
  const crypto = yield* Crypto.Crypto
  const hostContext = yield* Effect.context<never>()
  const integrations = yield* Integrations.make(options.integrations ?? [])

  const prepareWorkspace = Effect.fn("WorkspaceRuntime.prepareWorkspace")(function* (
    workspaceId: WorkspaceId.WorkspaceId
  ) {
    const bindings = yield* workspaceStorage.forWorkspace(workspaceId)
    const services = Core.layer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeedContext(bindings),
          Layer.succeed(Crypto.Crypto, crypto),
          Layer.succeed(TurnJobs.TurnJobs, turnJobs),
          Layer.succeed(DeliveryJobs.DeliveryJobs, deliveryJobs),
          Layer.succeed(Integrations.Integrations, integrations)
        )
      ),
      Layer.orDie
    )
    const context = yield* Layer.build(services)
    yield* Effect.orDie(Context.get(context, Journal.Journal).replay)
    // Bring built-in roles recorded by older code to this host's bundles. Recorded roles still
    // serve if it cannot run now, such as while another host writes; it then tries again in the
    // background, backing off to once a minute, for as long as the workspace stays prepared.
    const upgradeBuiltinRoles = BuiltinRoleUpgrade.upgrade().pipe(Effect.provide(context))
    yield* upgradeBuiltinRoles.pipe(
      Effect.catch((error) =>
        Effect.logWarning("Built-in role upgrade did not run; trying again later", error).pipe(
          Effect.andThen(
            upgradeBuiltinRoles.pipe(
              Effect.retry(Schedule.min([Schedule.exponential("1 second"), Schedule.spaced("1 minute")])),
              Effect.andThen(Effect.logInfo("Built-in role upgrade ran")),
              Effect.forkScoped
            )
          )
        )
      )
    )
    return context
  })

  const runtimes: LayerMap.LayerMap<WorkspaceId.WorkspaceId, Services> = yield* LayerMap.make(
    (workspaceId: WorkspaceId.WorkspaceId) =>
      Layer.effectContext(
        Effect.gen(function* () {
          const scope = yield* Scope.fork(yield* Scope.Scope)
          return yield* prepareWorkspace(workspaceId).pipe(
            Effect.setContext(Context.add(hostContext, Scope.Scope, scope)),
            // Evict from the acquisition itself: a cancelled waiter must never
            // discard a shared preparation, and failed waiters must not evict a later retry.
            Effect.onExit((exit) =>
              Exit.isFailure(exit)
                ? Scope.close(scope, exit).pipe(Effect.ensuring(runtimes.invalidate(workspaceId)))
                : Effect.void
            )
          )
        })
      ),
    { idleTimeToLive: options.idleTimeToLive ?? Duration.minutes(5) }
  )

  const lease = Effect.fn("WorkspaceRuntime.lease")(function* (workspaceId: WorkspaceId.WorkspaceId) {
    const id = yield* Effect.orDie(Schema.decodeEffect(WorkspaceId.WorkspaceId)(workspaceId))
    return yield* runtimes.contextEffect(id)
  })

  const isPrepared = (workspaceId: WorkspaceId.WorkspaceId) => RcMap.has(runtimes.rcMap, workspaceId)

  const invalidate = (workspaceId: WorkspaceId.WorkspaceId) => runtimes.invalidate(workspaceId)

  return { lease, isPrepared, invalidate } satisfies Interface
})
