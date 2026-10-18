import { GroupService } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { type Presence, PresenceService } from "@amends-dev/core/presence"
import { ThreadService } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Queue, Scope, Stream } from "effect"
import { TestClock } from "effect/testing"
import { withStorage } from "./fixture.ts"
import { boundTo, core, initialized, runHost, seed, workspaceId } from "./support.ts"

/**
 * Presence: who has the workspace open, and where they type, as a member following it sees it.
 */

const bob: Actor.Actor["Service"] = {
  workspaceId,
  memberId: MemberId.MemberId.make("member-bob"),
  identity: { _tag: "Human", id: Identity.HumanId.make("bob") }
}

/** The first of what `seen` holds, from now on, that `holds` accepts. */
const untilSeen = (
  seen: Queue.Queue<ReadonlyArray<Presence.Present>>,
  holds: (present: ReadonlyArray<Presence.Present>) => boolean
): Effect.Effect<ReadonlyArray<Presence.Present>> =>
  Effect.filterOrElse(Queue.take(seen), holds, () => untilSeen(seen, holds))

describe("presence", () => {
  it.effect(
    "a member sees who has the workspace open, and where they type only in threads they may read, until it lapses",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId)
            const workspace = yield* initialized(bound)
            const alice: Actor.Actor["Service"] = {
              workspaceId,
              memberId: workspace.ownerMemberId,
              identity: { _tag: "Human", id: Identity.HumanId.make("alice") }
            }
            yield* seed(bound, [bob], [bob])
            const services = yield* Layer.build(core(bound))
            const as = <A, E, R>(actor: Actor.Actor["Service"], effect: Effect.Effect<A, E, R>) =>
              effect.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(services))
            const presence = yield* PresenceService.PresenceService.pipe(Effect.provide(services))

            // A thread in a team of both, which bob reads, and one in a team of alice's alone, which he does not.
            const startIn = (memberIds: ReadonlyArray<MemberId.MemberId>, name: string) =>
              as(
                alice,
                Effect.gen(function* () {
                  const groupService = yield* GroupService.GroupService
                  const threadService = yield* ThreadService.ThreadService
                  const team = yield* groupService.createTeam({ name, memberIds })
                  return yield* threadService.startInGroup({ groupId: team.id, text: name, mentions: [] })
                })
              )
            const shared = yield* startIn([alice.memberId, bob.memberId], "Crew")
            const secret = yield* startIn([alice.memberId], "Board")

            /** Follow presence as `actor` in `scope`, into a queue of what they see. */
            const follow = Effect.fnUntraced(function* (actor: Actor.Actor["Service"], scope: Scope.Scope) {
              const seen = yield* Queue.unbounded<ReadonlyArray<Presence.Present>>()
              const stream = yield* as(actor, presence.watch).pipe(Scope.provide(scope))
              yield* stream.pipe(
                Stream.runForEach((present) => Queue.offer(seen, present)),
                Effect.forkIn(scope)
              )
              return seen
            })
            const present =
              (...members: ReadonlyArray<readonly [MemberId.MemberId, string | null]>) =>
              (seen: ReadonlyArray<Presence.Present>) =>
                JSON.stringify(seen) ===
                JSON.stringify(
                  members
                    .map(([memberId, typingIn]) => ({ memberId, typingIn }))
                    .toSorted((left, right) => (left.memberId < right.memberId ? -1 : 1))
                )

            const bobsScope = yield* Scope.make()
            const bobSees = yield* follow(bob, bobsScope)
            yield* untilSeen(bobSees, present([bob.memberId, null]))
            const alicesScope = yield* Scope.make()
            const aliceSees = yield* follow(alice, alicesScope)
            yield* untilSeen(bobSees, present([alice.memberId, null], [bob.memberId, null]))

            // Alice types where bob may not read: he sees her present, and typing nowhere.
            yield* as(alice, presence.type(secret.thread.id))
            yield* untilSeen(aliceSees, present([alice.memberId, secret.thread.id], [bob.memberId, null]))
            yield* untilSeen(bobSees, present([alice.memberId, null], [bob.memberId, null]))
            yield* as(alice, presence.type(null))

            // Bob types where both read; it lapses six seconds after, unless he types again.
            yield* as(bob, presence.type(shared.thread.id))
            yield* untilSeen(aliceSees, present([alice.memberId, null], [bob.memberId, shared.thread.id]))
            yield* TestClock.adjust("7 seconds")
            yield* untilSeen(aliceSees, present([alice.memberId, null], [bob.memberId, null]))

            // Bob may not say he types where he may not read.
            expect(yield* Effect.flip(as(bob, presence.type(secret.thread.id)))).toMatchObject({
              _tag: "CoreError.NotFound"
            })

            // Alice closes the workspace: bob sees her go.
            yield* Scope.close(alicesScope, Exit.void)
            yield* untilSeen(bobSees, present([bob.memberId, null]))
            yield* Scope.close(bobsScope, Exit.void)
          }).pipe(Effect.scoped)
        )
      )
  )
})
