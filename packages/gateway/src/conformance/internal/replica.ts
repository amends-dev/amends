import { BuiltinRoles, GrantResolver } from "@amends-dev/core/authorization"
import { GroupMembershipService, GroupService } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Journal } from "@amends-dev/core/journal"
import { ReplicaQuery, ReplicaRecord } from "@amends-dev/core/replica"
import { TaskService } from "@amends-dev/core/task"
import { ThreadMessageService, ThreadService } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import type * as Fixture from "../Fixture.ts"
import * as Support from "../Support.ts"

/** A member's replica over each adapter: what a snapshot reads, and what a departure changed. */
export const replica = (fixture: Fixture.Fixture) => {
  const { core, initialized, seed } = Support
  const other = Actor.Actor.of({
    workspaceId: Support.workspaceId,
    memberId: MemberId.MemberId.make("other"),
    identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("other") })
  })
  describe.skipIf(!fixture.available)(`${fixture.name}: replica`, () => {
    it.effect("a snapshot reads every kind of record a member sees, and a departure names what it ended", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* Support.forWorkspace(yield* storage.connect(), Support.workspaceId)
          const workspace = yield* initialized(bound)
          const owner = Actor.Actor.of({
            workspaceId: Support.workspaceId,
            memberId: workspace.ownerMemberId,
            identity: Support.alice
          })
          yield* seed(bound, [other], [other])
          const services = yield* Layer.build(
            ReplicaQuery.layer.pipe(Layer.provide(GrantResolver.layer), Layer.provideMerge(core(bound)))
          )
          const as = <A, E, R>(actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>) =>
            program.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(services))
          const team = yield* as(
            owner,
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.createTeam({ name: "Team", memberIds: [owner.memberId, other.memberId] })
            )
          )
          const started = yield* as(
            owner,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.startInGroup({ groupId: team.id, text: "Hello", mentions: [other.memberId] })
            )
          )
          const threadId = started.thread.id
          const reply = yield* as(
            other,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.publish({ threadId, text: "Hi", mentions: [] })
            )
          )
          yield* as(
            owner,
            Effect.flatMap(TaskService.TaskService, (taskService) => taskService.create({ threadId }))
          )
          const keysOf = (records: ReadonlyArray<ReplicaRecord.ReplicaRecord>) =>
            records.map((record) => JSON.stringify(ReplicaRecord.keyOf(record)))
          const snapshot = yield* as(
            other,
            Effect.gen(function* () {
              const replicaQuery = yield* ReplicaQuery.ReplicaQuery
              return yield* Stream.runCollect(replicaQuery.snapshot(yield* replicaQuery.viewerOf(other.memberId)))
            })
          )
          const { cases } = ReplicaRecord.Key
          for (const key of [
            cases.Workspace.make({ id: Support.workspaceId }),
            cases.Member.make({ id: other.memberId }),
            ...[BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId].map((id) =>
              cases.Role.make({ id })
            ),
            cases.Group.make({ id: team.id }),
            cases.Thread.make({ id: threadId }),
            cases.ThreadMessage.make({ id: started.message.id }),
            cases.ThreadMessage.make({ id: reply.id }),
            cases.Task.make({ threadId }),
            cases.ThreadPosition.make({ memberId: other.memberId, threadId })
          ])
            expect(keysOf(snapshot)).toContain(JSON.stringify(key))
          // A departure names the participations it ended, which the others still see.
          const head = yield* as(
            owner,
            Effect.flatMap(Journal.Journal, (journal) => journal.log.head)
          )
          const admission = Option.getOrThrow(yield* bound.groupMemberships.findActive(team.id, other.memberId))
          yield* as(
            other,
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.leave({ groupId: team.id, membershipId: admission.id })
            )
          )
          const changed = yield* as(
            owner,
            Effect.gen(function* () {
              const journal = yield* Journal.Journal
              const batches = yield* journal.log.read(
                Option.isSome(head) ? { after: head.value, limit: 10 } : { limit: 10 }
              )
              return yield* (yield* ReplicaQuery.ReplicaQuery).keysChangedBy(batches.flatMap((batch) => batch.entries))
            })
          )
          const ended = (yield* bound.participations.listByThread(threadId)).filter(
            (participation) => participation.status === "ended"
          )
          expect(ended).toHaveLength(1)
          expect(changed.map((key) => JSON.stringify(key))).toContain(
            JSON.stringify(cases.ThreadParticipation.make({ id: ended[0]!.id }))
          )
        })
      )
    )
  })
}
