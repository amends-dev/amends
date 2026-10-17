import { AssignmentService } from "@amends-dev/core/authorization"
import { ChangeFeedService } from "@amends-dev/core/change-feed"
import { Entry, Store } from "@amends-dev/core/journal"
import { Notification, NotificationService } from "@amends-dev/core/notification"
import { InvitationService, MemberService, OwnershipService, MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as Gateway from "../../Gateway.ts"
import type * as Fixture from "../Fixture.ts"
import * as Support from "../Support.ts"

/** Reads outside transactions, which never wait for writers. */
export const reads = (fixture: Fixture.Fixture) => {
  const { gateway } = Support
  describe.skipIf(!fixture.available)(`${fixture.name}: reads`, () => {
    it.effect("workspace reads and SSE open while another host's transaction holds the writer", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const host = yield* storage.connect({ failFast: true })
          yield* Effect.gen(function* () {
            const gateway = yield* Gateway.Gateway
            // Creating the workspace also completes boot; this test exercises warm requests.
            const workspace = yield* gateway.createWorkspace(Support.alice.id, {
              name: "Read concurrency",
              memberName: "alice"
            })
            const bound = yield* Support.boundTo(workspace.id)
            const before = yield* bound.store.read(Entry.LogId.make("journal"), { limit: 20 })
            const writer = yield* Support.forWorkspace(yield* storage.connect(), workspace.id)
            const entered = yield* Deferred.make<void>()
            const release = yield* Deferred.make<void>()
            const writing = yield* writer.store
              .transaction(
                Effect.gen(function* () {
                  yield* (yield* Store.Transaction).append({
                    logId: Entry.LogId.make("background"),
                    entries: [{ payload: new Uint8Array([1]) }]
                  })
                  yield* Deferred.succeed(entered, undefined)
                  yield* Deferred.await(release)
                })
              )
              .pipe(Effect.forkChild)
            yield* Deferred.await(entered)
            yield* Effect.gen(function* () {
              yield* gateway.asMember(
                workspace.id,
                Support.alice,
                Effect.gen(function* () {
                  expect(Option.isNone(yield* Effect.serviceOption(Store.Transaction))).toBe(true)
                  const memberService = yield* MemberService.MemberService
                  expect((yield* memberService.get(workspace.ownerMemberId)).identity).toEqual(Support.alice)
                  expect(yield* memberService.list).toHaveLength(1)
                  expect(yield* (yield* InvitationService.InvitationService).list).toEqual([])
                  const assignmentService = yield* AssignmentService.AssignmentService
                  expect(yield* assignmentService.roles).toHaveLength(3)
                  expect((yield* assignmentService.list(workspace.ownerMemberId)).assignments).toHaveLength(1)
                  expect((yield* (yield* OwnershipService.OwnershipService).get).workspace).toEqual(workspace)
                  const notificationService = yield* NotificationService.NotificationService
                  expect(yield* notificationService.inbox({ limit: 10 })).toEqual([])
                  expect(yield* notificationService.inbox({ limit: 10, pendingOnly: true })).toEqual([])
                  expect(yield* notificationService.countPending).toBe(0)
                  expect(
                    yield* Effect.flip(notificationService.markSeen(Notification.NotificationId.make("missing")))
                  ).toMatchObject({ _tag: "CoreError.NotFound" })
                  const stream = yield* (yield* ChangeFeedService.ChangeFeedService).watch()
                  expect(yield* stream.pipe(Stream.take(1), Stream.runCollect)).toMatchObject([
                    { _tag: "Ready", workspaceId: workspace.id, reset: true }
                  ])
                })
              )
              // Write operations still enter their transaction before checking the target.
              expect(
                yield* Effect.flip(
                  gateway.asMember(
                    workspace.id,
                    Support.alice,
                    Effect.flatMap(MemberService.MemberService, (memberService) =>
                      memberService.remove(MemberId.MemberId.make("missing"))
                    )
                  )
                )
              ).toMatchObject({ _tag: "CoreError.Unavailable", reason: { _tag: "Contention" } })
            }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)))
            yield* Fiber.join(writing)
            expect(yield* bound.store.read(Entry.LogId.make("journal"), { limit: 20 })).toEqual(before)
          }).pipe(Effect.provide(gateway(host)))
        })
      )
    )
  })
}
