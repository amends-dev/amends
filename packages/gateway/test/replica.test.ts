import { AgentService } from "@amends-dev/core/agent"
import { AssignmentService, BuiltinRoles, GrantResolver } from "@amends-dev/core/authorization"
import { ConnectionService } from "@amends-dev/core/connection"
import { CoreError } from "@amends-dev/core/error"
import { Group, GroupFollowService, GroupMembershipService, GroupService } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Journal } from "@amends-dev/core/journal"
import { Notification, NotificationService } from "@amends-dev/core/notification"
import { ReadStateService } from "@amends-dev/core/read-state"
import { ReplicaChange, ReplicaQuery, ReplicaRecord, ReplicaService } from "@amends-dev/core/replica"
import { Request, RequestService } from "@amends-dev/core/request"
import { TaskService } from "@amends-dev/core/task"
import { Thread, ThreadId, ThreadMessage, ThreadMessageService, ThreadService } from "@amends-dev/core/thread"
import {
  InvitationService,
  Member,
  MemberId,
  MemberService,
  OwnershipService,
  WorkspaceSettingsService
} from "@amends-dev/core/workspace"
import type { Storage } from "@amends-dev/gateway/conformance"
import type { Entry } from "@amends-dev/log"
import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, Layer, Option, Queue, Redacted, Schema, Stream } from "effect"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import { alice, forWorkspace, future, goodKey, request, workspaceId } from "./support.ts"

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
    const services = yield* Layer.build(
      ReplicaQuery.layer.pipe(Layer.provide(GrantResolver.layer), Layer.provideMerge(core(bound)))
    )
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
    return { bound, workspace, owner, team, as, changing, started, threadId, othersNotes }
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

  it.effect("names every record a member's replica changes, across what members do", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, workspace, owner, team, as, changing, started, threadId } = yield* world(storage)
        const viewers = [owner, other]
        const encode = Schema.encodeEffect(ReplicaRecord.ReplicaRecord)
        /** A member's access and replica now, each record by its key. */
        const replicaOf = (viewer: Actor.Actor["Service"]) =>
          as(
            viewer,
            Effect.gen(function* () {
              const replicaQuery = yield* ReplicaQuery.ReplicaQuery
              const access = yield* replicaQuery.viewerOf(viewer.memberId)
              const records = yield* Stream.runCollect(replicaQuery.snapshot(access))
              const encoded = yield* Effect.forEach(records, (record) =>
                Effect.map(
                  encode(record),
                  (value) => [JSON.stringify(ReplicaRecord.keyOf(record)), JSON.stringify(value)] as const
                )
              )
              return {
                access: JSON.stringify([access.grants, [...access.groupIds].toSorted()]),
                records: new Map(encoded)
              }
            })
          )
        /**
         * Run `program` as `actor`, then check that every record that changed in a member's replica
         * is among the keys its commits named. A member whose own access changed is left out: what
         * they gain or lose reaches them otherwise.
         */
        const step = <A, E, R>(label: string, actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>) =>
          Effect.gen(function* () {
            const before = yield* Effect.forEach(viewers, replicaOf)
            const { value, changed } = yield* changing(actor, program)
            const after = yield* Effect.forEach(viewers, replicaOf)
            const named = new Set(changed.map((key) => JSON.stringify(key)))
            for (const [index, viewer] of viewers.entries()) {
              const was = before[index]!
              const now = after[index]!
              if (was.access !== now.access) continue
              const unnamed = [...now.records].filter(
                ([key, record]) => was.records.get(key) !== record && !named.has(key)
              )
              expect(
                unnamed.map(([key]) => key),
                `${label}, as ${viewer.memberId} sees it`
              ).toEqual([])
            }
            return value
          })
        const reply = yield* step(
          "a reply",
          other,
          Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
            threadMessageService.publish({ threadId, text: "Hi", mentions: [owner.memberId] })
          )
        )
        const opening = started.value.message
        yield* step(
          "an edit",
          owner,
          Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
            threadMessageService.edit({
              messageId: opening.id,
              text: ThreadMessage.Text.make("Hello again"),
              mentions: [],
              expectedRevision: ThreadMessage.Content.isAnyOf(["Text"])(opening.content) ? opening.content.revision : 1
            })
          )
        )
        yield* step(
          "a deletion",
          other,
          Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
            threadMessageService.delete(reply.id)
          )
        )
        yield* step(
          "a thread's rename",
          owner,
          Effect.flatMap(ThreadService.ThreadService, (threadService) =>
            threadService.rename({ threadId, title: Thread.Title.make("Plan"), expectedTitle: null })
          )
        )
        yield* step(
          "a task",
          owner,
          Effect.flatMap(TaskService.TaskService, (taskService) => taskService.create({ threadId }))
        )
        yield* step(
          "a task's change",
          owner,
          Effect.flatMap(TaskService.TaskService, (taskService) =>
            taskService.update({ threadId, change: { _tag: "Priority", from: "none", to: "high" } })
          )
        )
        const follow = { groupId: team.id, memberId: owner.memberId }
        yield* step(
          "a follow",
          owner,
          Effect.flatMap(GroupFollowService.GroupFollowService, (groupFollowService) =>
            groupFollowService.follow(follow)
          )
        )
        yield* step(
          "an unfollow",
          owner,
          Effect.flatMap(GroupFollowService.GroupFollowService, (groupFollowService) =>
            groupFollowService.unfollow(follow)
          )
        )
        const latest = Option.getOrThrow(yield* bound.activities.latest(threadId)).sequence
        yield* step(
          "reading a thread",
          other,
          Effect.flatMap(ReadStateService.ReadStateService, (readStateService) =>
            readStateService.markThreadRead({ threadId, throughSequence: latest })
          )
        )
        yield* step(
          "reading a group",
          other,
          Effect.flatMap(ReadStateService.ReadStateService, (readStateService) =>
            readStateService.markGroupRead({ groupId: team.id })
          )
        )
        const [pending] = yield* bound.notifications.listPendingByRecipient(
          Notification.ofMember(owner.memberId, owner.identity),
          { limit: 10 }
        )
        if (pending === undefined) return yield* Effect.die("The reply mentioned the owner")
        yield* step(
          "seeing a notification",
          owner,
          Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
            notificationService.markSeen(pending.id)
          )
        )
        yield* step(
          "a group's rename",
          owner,
          Effect.flatMap(GroupService.GroupService, (groupService) =>
            groupService.rename({ groupId: team.id, name: "Crew", expectedName: Group.Name.make("Team") })
          )
        )
        yield* step(
          "the workspace's rename",
          owner,
          Effect.flatMap(WorkspaceSettingsService.WorkspaceSettingsService, (workspaceSettingsService) =>
            workspaceSettingsService.rename({ name: "Studio", expectedName: workspace.name })
          )
        )
        yield* step(
          "a member's rename",
          other,
          Effect.flatMap(MemberService.MemberService, (memberService) => memberService.rename(Member.Name.make("Otto")))
        )
        const invitation = yield* step(
          "an invitation",
          owner,
          Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
            Effect.flatMap(future, (expiresAt) =>
              invitationService.issue(request(expiresAt, Identity.HumanId.make("carol")))
            )
          )
        )
        yield* step(
          "an invitation's revocation",
          owner,
          Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
            invitationService.revoke(invitation.details.id)
          )
        )
        const assignment = yield* step(
          "a role",
          owner,
          Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
            assignmentService.assign({ memberId: other.memberId, roleId: BuiltinRoles.AdministratorId })
          )
        )
        yield* step(
          "a role's revocation",
          owner,
          Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
            assignmentService.revoke(other.memberId, assignment.id)
          )
        )
        const connect = (input: Parameters<ConnectionService.ConnectionService["Service"]["create"]>[0]) =>
          step(
            `the connection ${input.name}`,
            owner,
            Effect.flatMap(ConnectionService.ConnectionService, (connectionService) => connectionService.create(input))
          )
        const models = yield* connect({
          integration: "test-models",
          name: "Models",
          settings: { endpoint: "https://models.example" },
          auth: "apiKey",
          apiKey: Redacted.make(goodKey)
        })
        const harness = yield* connect({ integration: "test-in-process", name: "Harness", settings: {}, auth: "none" })
        const agent = yield* step(
          "an agent",
          owner,
          Effect.flatMap(AgentService.AgentService, (agentService) =>
            agentService.create({
              name: "Planner",
              roleId: BuiltinRoles.MemberId,
              instructions: "Plan each change.",
              harness: { _tag: "Connection", connectionId: harness.id },
              model: { connectionId: models.id, id: "test-model" },
              sandbox: null
            })
          )
        )
        yield* step(
          "a connection's rename",
          owner,
          Effect.flatMap(ConnectionService.ConnectionService, (connectionService) =>
            connectionService.rename({ connectionId: models.id, name: "Model provider", expectedName: models.name })
          )
        )
        yield* step(
          "an agent's rename",
          owner,
          Effect.flatMap(AgentService.AgentService, (agentService) =>
            agentService.rename({ agentId: agent.id, name: "Strategist", expectedName: agent.name })
          )
        )
        yield* step(
          "removing the connection an agent uses",
          owner,
          Effect.flatMap(ConnectionService.ConnectionService, (connectionService) =>
            connectionService.remove(harness.id)
          )
        )
        const admission = Option.getOrThrow(yield* bound.groupMemberships.findActive(team.id, other.memberId))
        yield* step(
          "a departure",
          other,
          Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
            groupMembershipService.leave({ groupId: team.id, membershipId: admission.id })
          )
        )
      })
    )
  )

  it.effect("a snapshot holds what its member may see, as reading the same records finds them", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { owner, as, threadId } = yield* world(storage)
        const hidden = yield* as(
          owner,
          Effect.flatMap(GroupService.GroupService, (groupService) =>
            groupService.createTeam({ name: "Owners", memberIds: [owner.memberId] })
          )
        )
        const hiddenThread = yield* as(
          owner,
          Effect.flatMap(ThreadService.ThreadService, (threadService) =>
            threadService.startInGroup({ groupId: hidden.id, text: "Just us", mentions: [] })
          )
        )
        const snapshotOf = (viewer: Actor.Actor["Service"]) =>
          as(
            viewer,
            Effect.gen(function* () {
              const replicaQuery = yield* ReplicaQuery.ReplicaQuery
              const records = yield* Stream.runCollect(
                replicaQuery.snapshot(yield* replicaQuery.viewerOf(viewer.memberId))
              )
              const keysHeld = records.map(ReplicaRecord.keyOf)
              // The same records, read one at a time, are what the snapshot holds.
              expect(yield* replicaQuery.readRecords(keysHeld)).toEqual(records)
              return sorted(keysHeld)
            })
          )
        const owners = yield* snapshotOf(owner)
        const others = yield* snapshotOf(other)
        const hiddenKeys = sorted([
          keys.Group.make({ id: hidden.id }),
          keys.Thread.make({ id: hiddenThread.thread.id }),
          keys.ThreadMessage.make({ id: hiddenThread.message.id })
        ])
        for (const key of hiddenKeys) {
          expect(owners).toContain(key)
          expect(others).not.toContain(key)
        }
        for (const key of sorted([keys.Thread.make({ id: threadId }), keys.Group.make({ id: hidden.id })]))
          expect(owners).toContain(key)
        // Each sees their own read position, and not the other's.
        const ownersPosition = JSON.stringify(keys.ThreadPosition.make({ memberId: owner.memberId, threadId }))
        expect(owners).toContain(ownersPosition)
        expect(others).not.toContain(ownersPosition)
      })
    )
  )
})

describe("ReplicaService", () => {
  /** What a replica stream sends, in order, as it arrives. */
  const follow = (
    as: Effect.Success<ReturnType<typeof world>>["as"],
    actor: Actor.Actor["Service"],
    after: Option.Option<Entry.Position>
  ) =>
    Effect.gen(function* () {
      const batches = yield* Queue.unbounded<ReplicaChange.Batch>()
      const stream = yield* as(
        actor,
        Effect.flatMap(ReplicaService.ReplicaService, (replicaService) => replicaService.changes(after))
      )
      const ended = yield* stream.pipe(
        Stream.runForEach((batch) => Queue.offer(batches, batch)),
        Effect.exit,
        Effect.forkScoped
      )
      return { batches, ended }
    })
  const headOf = (as: Effect.Success<ReturnType<typeof world>>["as"]) =>
    Effect.map(
      as(
        other,
        Effect.flatMap(Journal.Journal, (journal) => journal.log.head)
      ),
      Option.getOrThrow
    )
  /**
   * Every batch sent before a marker: a commit every follower sees, the other member renaming
   * themselves, after which nothing earlier is still on its way.
   */
  const takeSettled = (
    as: Effect.Success<ReturnType<typeof world>>["as"],
    batches: Queue.Queue<ReplicaChange.Batch>,
    marker: string
  ) =>
    Effect.gen(function* () {
      yield* as(
        other,
        Effect.flatMap(MemberService.MemberService, (memberService) => memberService.rename(Member.Name.make(marker)))
      )
      return yield* takeBefore(batches, yield* headOf(as))
    })
  /** Every batch sent before the one at `position`, which the follower sees. */
  const takeBefore = (batches: Queue.Queue<ReplicaChange.Batch>, position: Entry.Position) =>
    Effect.gen(function* () {
      const taken: Array<ReplicaChange.Batch> = []
      while (true) {
        const batch = yield* Queue.take(batches)
        if (batch.position === position) return taken
        taken.push(batch)
      }
    })
  const changesIn = (taken: ReadonlyArray<ReplicaChange.Batch>) => taken.flatMap((batch) => batch.changes)
  const changedKeysOf = (changes: ReadonlyArray<ReplicaChange.ReplicaChange>) =>
    changes.flatMap((change) =>
      ReplicaChange.ReplicaChange.isAnyOf(["Changed"])(change)
        ? [JSON.stringify(ReplicaRecord.keyOf(change.record))]
        : []
    )
  const changedKeys = (taken: ReadonlyArray<ReplicaChange.Batch>) => changedKeysOf(changesIn(taken))
  const reply = (threadId: ThreadId.ThreadId, text: string, mentions: ReadonlyArray<MemberId.MemberId> = []) =>
    Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
      threadMessageService.publish({ threadId, text, mentions })
    )

  it.effect("a new replica starts with a reset and everything its member sees, then each commit's changes", () =>
    withStorage((storage) =>
      Effect.scoped(
        Effect.gen(function* () {
          const { owner, as, threadId } = yield* world(storage)
          const start = yield* headOf(as)
          const { batches } = yield* follow(as, other, Option.none())
          // What they see as the replica starts, before anything else commits.
          const snapshot = yield* as(
            other,
            Effect.gen(function* () {
              const replicaQuery = yield* ReplicaQuery.ReplicaQuery
              return yield* Stream.runCollect(replicaQuery.snapshot(yield* replicaQuery.viewerOf(other.memberId)))
            })
          )
          const message = yield* as(owner, reply(threadId, "Are you there?", [other.memberId]))
          const taken = yield* takeSettled(as, batches, "settled")
          const resetting = taken.filter((batch) => batch.position === start)
          expect(resetting[0]?.changes[0]?._tag).toBe("Reset")
          expect(changedKeys(resetting).toSorted()).toEqual(
            snapshot.map((record) => JSON.stringify(ReplicaRecord.keyOf(record))).toSorted()
          )
          // The reply then arrives as its own batch.
          expect(changedKeys(taken.filter((batch) => batch.position > start))).toContain(
            JSON.stringify(keys.ThreadMessage.make({ id: message.id }))
          )
        })
      )
    )
  )

  it.effect("a replica catches up from the position it holds, without a reset", () =>
    withStorage((storage) =>
      Effect.scoped(
        Effect.gen(function* () {
          const { owner, as, threadId } = yield* world(storage)
          const held = yield* headOf(as)
          const missed = yield* as(owner, reply(threadId, "While you were away"))
          const { batches } = yield* follow(as, other, Option.some(held))
          const now = yield* as(owner, reply(threadId, "And now"))
          const taken = yield* takeSettled(as, batches, "settled")
          expect(changesIn(taken).some((change) => change._tag === "Reset")).toBe(false)
          expect(taken.every((batch) => batch.position > held)).toBe(true)
          for (const message of [missed, now])
            expect(changedKeys(taken)).toContain(JSON.stringify(keys.ThreadMessage.make({ id: message.id })))
        })
      )
    )
  )

  it.effect("leaving a group drops it and nothing in it reaches the member after; joining sends it", () =>
    withStorage((storage) =>
      Effect.scoped(
        Effect.gen(function* () {
          const { bound, owner, team, as, threadId } = yield* world(storage)
          const { batches } = yield* follow(as, other, Option.some(yield* headOf(as)))
          const admission = Option.getOrThrow(yield* bound.groupMemberships.findActive(team.id, other.memberId))
          yield* as(
            other,
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.leave({ groupId: team.id, membershipId: admission.id })
            )
          )
          const left = yield* takeSettled(as, batches, "left")
          expect(changesIn(left)[0]).toEqual(
            ReplicaChange.ReplicaChange.cases.Dropped.make({ key: keys.Group.make({ id: team.id }) })
          )
          // What the group holds after they left never reaches them.
          const unseen = yield* as(owner, reply(threadId, "Without them"))
          yield* as(
            owner,
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.add({ groupId: team.id, memberId: other.memberId })
            )
          )
          const joined = yield* takeSettled(as, batches, "joined")
          expect(joined.every((batch) => batch.position === joined[0]!.position)).toBe(true)
          // Joining again sends the group as it is now, the message they missed included.
          for (const key of [
            keys.Group.make({ id: team.id }),
            keys.Thread.make({ id: threadId }),
            keys.ThreadMessage.make({ id: unseen.id })
          ])
            expect(changedKeys(joined)).toContain(JSON.stringify(key))
        })
      )
    )
  )

  it.effect("a change to the member's grants resets their replica", () =>
    withStorage((storage) =>
      Effect.scoped(
        Effect.gen(function* () {
          const { owner, as } = yield* world(storage)
          const { batches } = yield* follow(as, other, Option.some(yield* headOf(as)))
          yield* as(
            owner,
            Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) =>
              assignmentService.assign({ memberId: other.memberId, roleId: BuiltinRoles.AdministratorId })
            )
          )
          const taken = yield* takeSettled(as, batches, "settled")
          expect(taken[0]?.changes[0]?._tag).toBe("Reset")
        })
      )
    )
  )

  it.effect("a reset carries how the member's own requests in its commit ended", () =>
    withStorage((storage) =>
      Effect.scoped(
        Effect.gen(function* () {
          const { owner, as } = yield* world(storage)
          const { batches } = yield* follow(as, owner, Option.some(yield* headOf(as)))
          // Handing ownership to the other member changes the owner's own grants.
          yield* as(
            owner,
            Effect.flatMap(
              Effect.zip(OwnershipService.OwnershipService, RequestService.RequestService),
              ([ownershipService, requestService]) =>
                Effect.flatMap(ownershipService.get, (view) =>
                  requestService.runOnce(
                    Request.Key.make("hand-over"),
                    ownershipService.transfer({
                      memberId: other.memberId,
                      expectedOwnerAssignmentId: view.ownerAssignmentId
                    })
                  )
                )
            )
          )
          const [reset] = yield* takeSettled(as, batches, "settled")
          expect(reset?.changes.some(ReplicaChange.ReplicaChange.isAnyOf(["Reset"]))).toBe(true)
          expect(reset?.changes.filter(ReplicaChange.ReplicaChange.isAnyOf(["Completed", "Rejected"]))).toEqual([
            ReplicaChange.ReplicaChange.cases.Completed.make({ key: Request.Key.make("hand-over") })
          ])
        })
      )
    )
  )

  it.effect("tells a member how their requests ended, and only them", () =>
    withStorage((storage) =>
      Effect.scoped(
        Effect.gen(function* () {
          const { owner, as, threadId } = yield* world(storage)
          const start = Option.some(yield* headOf(as))
          const others = yield* follow(as, other, start)
          const owners = yield* follow(as, owner, start)
          const runOnce = (key: string, title: string, expectedTitle: string | null) =>
            as(
              other,
              Effect.flatMap(RequestService.RequestService, (requestService) =>
                requestService.runOnce(
                  Request.Key.make(key),
                  Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                    threadService.rename({
                      threadId,
                      title: Thread.Title.make(title),
                      expectedTitle: expectedTitle === null ? null : Thread.Title.make(expectedTitle)
                    })
                  )
                )
              )
            )
          yield* runOnce("rename", "Plan", null)
          yield* runOnce("stale", "Other", "Draft")
          const outcomes = changesIn(yield* takeSettled(as, others.batches, "settled")).filter(
            ReplicaChange.ReplicaChange.isAnyOf(["Completed", "Rejected"])
          )
          expect(outcomes).toEqual([
            ReplicaChange.ReplicaChange.cases.Completed.make({ key: Request.Key.make("rename") }),
            ReplicaChange.ReplicaChange.cases.Rejected.make({
              key: Request.Key.make("stale"),
              error: new CoreError.Changed({ resource: "Thread", id: threadId })
            })
          ])
          // The owner sees the rename, and not how the other's requests ended.
          const ownersChanges = changesIn(yield* takeBefore(owners.batches, yield* headOf(as)))
          expect(ownersChanges.some(ReplicaChange.ReplicaChange.isAnyOf(["Completed", "Rejected"]))).toBe(false)
          expect(changedKeysOf(ownersChanges)).toContain(JSON.stringify(keys.Thread.make({ id: threadId })))
        })
      )
    )
  )

  it.effect("ends with Denied once the member is removed, and follows no agent", () =>
    withStorage((storage) =>
      Effect.scoped(
        Effect.gen(function* () {
          const { owner, as } = yield* world(storage)
          const { ended } = yield* follow(as, other, Option.some(yield* headOf(as)))
          yield* as(
            owner,
            Effect.flatMap(MemberService.MemberService, (memberService) => memberService.remove(other.memberId))
          )
          const exit = yield* Fiber.join(ended)
          expect(exit).toMatchObject({ _tag: "Failure" })
          expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({ _tag: "CoreError.Denied" })
          const agent = Actor.Actor.of({
            workspaceId,
            memberId: other.memberId,
            identity: { _tag: "Agent", id: Identity.AgentId.make("agent") }
          })
          expect(
            yield* Effect.flip(
              as(
                agent,
                Effect.flatMap(ReplicaService.ReplicaService, (replicaService) => replicaService.changes(Option.none()))
              )
            )
          ).toMatchObject({ _tag: "CoreError.Denied" })
        })
      )
    )
  )
})
