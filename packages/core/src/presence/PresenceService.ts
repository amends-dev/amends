/**
 * The presence operations an actor calls: following who is present in the workspace, which makes
 * them present on a connection of their own for as long as they follow it, and saying they are
 * typing in a thread, or no longer. A member sees everyone present, and where someone types only
 * in a thread they may read. This process keeps what it hears from `PresenceRelay`, for as long as
 * the workspace is prepared, and lets each connection and each typing lapse unless it is heard again.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as SubscriptionRef from "effect/SubscriptionRef"
import type * as CoreError from "../error/CoreError.ts"
import * as Actor from "../identity/Actor.ts"
import * as Operation from "../operation/Operation.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadQuery from "../thread/ThreadQuery.ts"
import * as MemberStore from "../workspace/MemberStore.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Presence from "./Presence.ts"
import * as PresenceRelay from "./PresenceRelay.ts"

/**
 * What saying one is typing can fail with: a thread the actor may not read, or one that cannot be
 * read now.
 *
 * @category errors
 * @since 0.1.0
 */
export type TypeError = CoreError.NotFound | CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * The presence operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class PresenceService extends Context.Service<
  PresenceService,
  {
    /**
     * Follow who is present, as the actor sees them: everyone with the workspace open, and the
     * thread each types in where the actor may read it, now and each time it changes. For as long as
     * the caller's scope lasts, the actor is present on a connection of their own, which closes
     * with it. Following ends once the actor's membership has.
     */
    readonly watch: Effect.Effect<Stream.Stream<ReadonlyArray<Presence.Present>>, never, Actor.Actor | Scope.Scope>
    /**
     * Say the actor is typing in `threadId`, which they must be able to read, for a few seconds
     * unless they say so again; or, given null, that they no longer are.
     */
    readonly type: (threadId: ThreadId.ThreadId | null) => Effect.Effect<void, TypeError, Actor.Actor>
  }
>()("@amends-dev/core/presence/PresenceService") {}

/**
 * Follow the workspace's signals for as long as it is prepared, and serve the operations over
 * what this process heard.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const relay = yield* PresenceRelay.PresenceRelay
  const threadQuery = yield* ThreadQuery.ThreadQuery
  const memberStore = yield* MemberStore.MemberStore
  const crypto = yield* Crypto.Crypto
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId

  const heard = yield* SubscriptionRef.make(Presence.empty)
  const signals = yield* relay.signals(workspaceId)
  yield* signals.pipe(
    Stream.runForEach((signal) =>
      Effect.flatMap(DateTime.now, (now) =>
        SubscriptionRef.update(heard, (state) => Presence.apply(state, signal, now))
      )
    ),
    Effect.forkScoped
  )
  // Connections and typing lapse once they are not heard again in time.
  yield* Effect.flatMap(DateTime.now, (now) =>
    SubscriptionRef.update(heard, (state) => Presence.expire(state, now))
  ).pipe(Effect.repeat(Schedule.spaced("1 second")), Effect.forkScoped)

  /** Whether the actor may read `threadId` now. */
  const mayRead = (threadId: ThreadId.ThreadId) =>
    threadQuery.requireReadable(threadId).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false)
    )

  /** Who is present as the actor sees them: where someone types only in threads the actor may read. */
  const asReader = (present: ReadonlyArray<Presence.Present>) =>
    Effect.forEach(present, (member) =>
      member.typingIn === null
        ? Effect.succeed(member)
        : Effect.map(mayRead(member.typingIn), (may): Presence.Present =>
            may ? member : { memberId: member.memberId, typingIn: null }
          )
    )

  /** Whether the actor is still an active member. */
  const stillMember = (actor: Actor.Actor["Service"]) =>
    memberStore.get(actor.memberId).pipe(
      Effect.map(Option.exists((member) => member.status === "active")),
      Effect.orElseSucceed(() => true)
    )

  const watch = Effect.gen(function* () {
    const actor = yield* Actor.Actor
    const connectionId = yield* Effect.orDie(crypto.randomUUIDv4())
    const presence = { workspaceId, memberId: actor.memberId, connectionId }
    yield* Effect.addFinalizer(() => relay.send(Presence.Signal.cases.Gone.make(presence)))
    yield* relay
      .send(Presence.Signal.cases.Here.make(presence))
      .pipe(Effect.repeat(Schedule.spaced(Presence.connectionRepeats)), Effect.forkScoped)
    return SubscriptionRef.changes(heard).pipe(
      Stream.map(Presence.presentOf),
      Stream.changesWith(Presence.samePresent),
      Stream.takeWhileEffect(() => stillMember(actor)),
      Stream.mapEffect((present) => Effect.provideService(asReader(present), Actor.Actor, actor))
    )
  })

  const type = Effect.fn("PresenceService.type")(function* (threadId: ThreadId.ThreadId | null) {
    const actor = yield* Actor.Actor
    if (threadId === null)
      return yield* relay.send(Presence.Signal.cases.StoppedTyping.make({ workspaceId, memberId: actor.memberId }))
    const thread = yield* threadQuery.requireReadable(yield* Schema.decodeEffect(ThreadId.ThreadId)(threadId))
    yield* relay.send(Presence.Signal.cases.Typing.make({ workspaceId, memberId: actor.memberId, threadId: thread.id }))
  }, Operation.report)

  return PresenceService.of({ watch, type })
})

/**
 * The presence operations, over the host's relay, for as long as the workspace is prepared.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(PresenceService, make)
