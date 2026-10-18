import { GroupMembershipService, GroupService } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Journal } from "@amends-dev/core/journal"
import { Notification } from "@amends-dev/core/notification"
import { ReadStateService } from "@amends-dev/core/read-state"
import { ReplicaQuery, ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadId, ThreadService } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import type { Storage } from "@amends-dev/gateway/conformance"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import { alice, forWorkspace, workspaceId } from "./support.ts"

/** The replica's reads over a workspace's stores: which records each commit changed, and those records now. */
const { core, initialized, seed } = Support
const other = Actor.Actor.of({
  workspaceId,
  memberId: MemberId.MemberId.make("other"),
  identity: { _tag: "Human", id: Identity.HumanId.make("other") }
})
const { cases: keys } = ReplicaRecord.Key
/** Keys in one order, to compare as sets. */
const sorted = (found: ReadonlyArray<ReplicaRecord.Key>) => found.map((key) => JSON.stringify(key)).toSorted()

/** A workspace with its owner and another member, both in one team, where the owner mentions the other in a thread. */
const world = (storage: Storage) =>
  Effect.gen(function* () {
    const bound = yield* forWorkspace(yield* storage.connect(), workspaceId)
    const workspace = yield* initialized(bound)
    const owner = Actor.Actor.of({ workspaceId, memberId: workspace.ownerMemberId, identity: alice })
    yield* seed(bound, [other], [other])
    const services = yield* Layer.build(ReplicaQuery.layer.pipe(Layer.provideMerge(core(bound))))
    const as = <A, E, R>(actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>) =>
      program.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(services))
    /** What `program` returns as `actor`, and the keys of the records its commits changed. */
    const changing = <A, E, R>(actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const head = yield* as(
          actor,
          Effect.flatMap(Journal.Journal, (journal) => journal.log.head)
        )
        const value = yield* as(actor, program)
        const changed = yield* as(
          actor,
          Effect.gen(function* () {
            const journal = yield* Journal.Journal
            const replicaQuery = yield* ReplicaQuery.ReplicaQuery
            const batches = yield* journal.log.read(
              Option.isSome(head) ? { after: head.value, limit: 100 } : { limit: 100 }
            )
            return yield* replicaQuery.keysChangedBy(batches.flatMap((batch) => batch.entries))
          })
        )
        return { value, changed }
      })
    const team = yield* as(
      owner,
      Effect.flatMap(GroupService.GroupService, (groupService) =>
        groupService.createTeam({ name: "Team", memberIds: [owner.memberId, other.memberId] })
      )
    )
    const started = yield* changing(
      owner,
      Effect.flatMap(ThreadService.ThreadService, (threadService) =>
        threadService.startInGroup({ groupId: team.id, text: "Hello", mentions: [other.memberId] })
      )
    )
    const threadId = started.value.thread.id
    const othersNotes = Notification.ofMember(other.memberId, other.identity)
    return { bound, owner, team, as, changing, started, threadId, othersNotes }
  })

describe("ReplicaQuery", () => {
  it.effect("names every record a commit changed: its facts' subjects, and what their projections changed beside", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, owner, started, threadId, othersNotes } = yield* world(storage)
        const activities = yield* bound.activities.listByThread(threadId)
        const participations = yield* bound.participations.listByThread(threadId)
        const [note] = yield* bound.notifications.listLatestByRecipient(othersNotes, { limit: 10 })
        expect(note).toBeDefined()
        expect(sorted(started.changed)).toEqual(
          sorted([
            keys.Thread.make({ id: threadId }),
            keys.ThreadMessage.make({ id: started.value.message.id }),
            ...activities.map(({ id }) => keys.ThreadActivity.make({ id })),
            ...participations.map(({ id }) => keys.ThreadParticipation.make({ id })),
            // The activity's notification for the person it mentions, and its author's read position.
            keys.Notification.make({ id: note!.id }),
            keys.ThreadPosition.make({ memberId: owner.memberId, threadId })
          ])
        )
      })
    )
  )

  it.effect("names the notifications reading a thread marked seen", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, changing, threadId, othersNotes } = yield* world(storage)
        const read = yield* changing(
          other,
          Effect.flatMap(ReadStateService.ReadStateService, (readStateService) =>
            readStateService.markThreadRead({ threadId, throughSequence: 1 })
          )
        )
        const [note] = yield* bound.notifications.listLatestByRecipient(othersNotes, { limit: 10 })
        expect(note?.state._tag).toBe("Seen")
        expect(sorted(read.changed)).toEqual(
          sorted([
            keys.ThreadPosition.make({ memberId: other.memberId, threadId }),
            keys.Notification.make({ id: note!.id })
          ])
        )
      })
    )
  )

  it.effect("names what leaving a group ended and settled", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, team, changing, threadId, othersNotes } = yield* world(storage)
        const admission = Option.getOrThrow(yield* bound.groupMemberships.findActive(team.id, other.memberId))
        const left = yield* changing(
          other,
          Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
            groupMembershipService.leave({ groupId: team.id, membershipId: admission.id })
          )
        )
        const participations = (yield* bound.participations.listByThread(threadId)).filter(
          (participation) => participation.status === "ended"
        )
        expect(participations).toHaveLength(1)
        const [note] = yield* bound.notifications.listLatestByRecipient(othersNotes, { limit: 10 })
        expect(note?.state._tag).toBe("Discarded")
        expect(sorted(left.changed)).toEqual(
          sorted([
            keys.GroupMembership.make({ id: admission.id }),
            ...participations.map(({ id }) => keys.ThreadParticipation.make({ id })),
            keys.Notification.make({ id: note!.id })
          ])
        )
      })
    )
  )

  it.effect("reads the records under keys as a replica holds them, leaving out keys with none", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, owner, as, started, threadId } = yield* world(storage)
        const records = yield* as(
          owner,
          Effect.flatMap(ReplicaQuery.ReplicaQuery, (replicaQuery) =>
            replicaQuery.readRecords([...started.changed, keys.Thread.make({ id: ThreadId.ThreadId.make("missing") })])
          )
        )
        expect(sorted(records.map(ReplicaRecord.keyOf))).toEqual(sorted(started.changed))
        const thread = records.find(ReplicaRecord.ReplicaRecord.isAnyOf(["Thread"]))
        expect(thread?.value).toEqual(Option.getOrThrow(yield* bound.threads.get(threadId)))
      })
    )
  )
})
