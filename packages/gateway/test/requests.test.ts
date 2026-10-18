import { CoreError } from "@amends-dev/core/error"
import { Group, GroupMembership, GroupService, GroupMembershipService } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Request } from "@amends-dev/core/request"
import { Thread, ThreadMessage, ThreadService, ThreadMessageService } from "@amends-dev/core/thread"
import { InvitationService, Member, MemberId } from "@amends-dev/core/workspace"
import { Gateway } from "@amends-dev/gateway"
import type { Storage } from "@amends-dev/gateway/conformance"
import { Entry, StoreError } from "@amends-dev/log"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Option } from "effect"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import { alice, type Bound, failingLate, forWorkspace, future, request, workspaceId } from "./support.ts"

const memberActor = (name: string) =>
  Actor.Actor.of({
    workspaceId,
    memberId: MemberId.MemberId.make(name),
    identity: { _tag: "Human", id: Identity.HumanId.make(name) }
  })
const other = memberActor("other")
const key = Request.Key.make("request-1")
const history = (bound: Bound) => bound.store.read(Entry.LogId.make("journal"), { limit: 500 })

/**
 * Request keys: a retry of a creating request returns what its first attempt created, and the IDs
 * of what a request creates are those its sender computes.
 */
const { core, initialized, seed, gateway } = Support

/** A workspace with its owner and another viewer, both in one team group. */
const world = (storage: Storage) =>
  Effect.gen(function* () {
    const host = yield* storage.connect()
    const bound = yield* forWorkspace(host, workspaceId)
    const workspace = yield* initialized(bound)
    const owner = Actor.Actor.of({
      workspaceId,
      memberId: workspace.ownerMemberId,
      identity: alice
    })
    yield* seed(bound, [other], [other])
    const services = yield* Layer.build(core(bound))
    const as = <A, E, R>(actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>, on = services) =>
      program.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(on))
    const group = yield* as(
      owner,
      Effect.flatMap(GroupService.GroupService, (groupService) =>
        groupService.createTeam({
          name: "Team",
          memberIds: [owner.memberId, other.memberId]
        })
      )
    )
    const start = (text: string, requestKey: Request.Key = key) =>
      Effect.flatMap(ThreadService.ThreadService, (threadService) =>
        threadService.startInGroup({ groupId: group.id, text, mentions: [] })
      ).pipe(Request.withKey(requestKey))
    return { storage, bound, owner, group, services, as, start }
  })

describe("request keys", () => {
  it.effect("a retried keyed start returns the first thread and records nothing more", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, owner, as, start } = yield* world(storage)
        const first = yield* as(owner, start("Hello"))
        const before = yield* history(bound)
        const retried = yield* as(owner, start("Hello"))
        expect(retried).toEqual(first)
        expect(yield* history(bound)).toEqual(before)
        expect(yield* bound.threads.listByGroup(first.thread.groupId)).toHaveLength(1)
        // Without a key, the same call creates another thread.
        const unkeyed = yield* as(
          owner,
          Effect.flatMap(ThreadService.ThreadService, (threadService) =>
            threadService.startInGroup({ groupId: first.thread.groupId, text: "Hello", mentions: [] })
          )
        )
        expect(unkeyed.thread.id).not.toBe(first.thread.id)
      })
    )
  )

  it.effect("a reused key returns what it created, whatever the retry asks for", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, owner, as, start } = yield* world(storage)
        const first = yield* as(owner, start("Hello"))
        const before = yield* history(bound)
        expect(yield* as(owner, start("Goodbye"))).toEqual(first)
        expect(yield* history(bound)).toEqual(before)
        const direct = (text: string) =>
          Effect.flatMap(ThreadService.ThreadService, (threadService) =>
            threadService.startDirect({ memberIds: [other.memberId], text, mentions: [] })
          ).pipe(Request.withKey(Request.Key.make("request-direct")))
        const opened = yield* as(owner, direct("Hi"))
        const afterDirect = yield* history(bound)
        expect(yield* as(owner, direct("Bye"))).toEqual(opened)
        expect(yield* history(bound)).toEqual(afterDirect)
      })
    )
  )

  it.effect("keys belong to their member", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { owner, as, start } = yield* world(storage)
        const mine = yield* as(owner, start("Hello"))
        const theirs = yield* as(other, start("Hello"))
        expect(theirs.thread.id).not.toBe(mine.thread.id)
      })
    )
  )

  it.effect("what a request creates takes the IDs its sender computes for it", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, owner, group, as, start } = yield* world(storage)
        /** The IDs `program` computes as the owner's request `requestKey`, as a browser computes them. */
        const computed = <A, E, R>(requestKey: Request.Key, program: Effect.Effect<A, E, R>) =>
          as(owner, program.pipe(Request.withKey(requestKey)))
        const started = yield* as(owner, start("Hello"))
        expect(started.thread.id).toBe(yield* computed(key, Thread.newId(group.id)))
        expect(started.message.id).toBe(yield* computed(key, ThreadMessage.newId(started.thread.id)))
        const team = Request.Key.make("request-team")
        const created = yield* as(
          owner,
          Effect.flatMap(GroupService.GroupService, (groupService) =>
            groupService.createTeam({ name: "Second", memberIds: [owner.memberId, other.memberId] })
          ).pipe(Request.withKey(team))
        )
        expect(created.id).toBe(yield* computed(team, Group.newId))
        for (const memberId of [owner.memberId, other.memberId])
          expect(Option.getOrThrow(yield* bound.groupMemberships.findActive(created.id, memberId)).id).toBe(
            yield* computed(team, GroupMembership.newId(created.id, memberId))
          )
        // A direct group's ID comes from its members, whoever starts it and whatever the key.
        const direct = yield* as(
          other,
          Effect.flatMap(ThreadService.ThreadService, (threadService) =>
            threadService.startDirect({ memberIds: [owner.memberId], text: "Hi", mentions: [] })
          ).pipe(Request.withKey(Request.Key.make("request-direct")))
        )
        expect(direct.thread.groupId).toBe(
          yield* as(owner, Group.directId(workspaceId, [other.memberId, owner.memberId]))
        )
        expect(direct.thread.groupId).not.toBe(group.id)
      })
    )
  )

  it.effect("a retry passes the start's checks again before it finds the thread", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, group, as, start } = yield* world(storage)
        yield* as(other, start("Hello"))
        const admission = yield* bound.groupMemberships.findActive(group.id, other.memberId)
        yield* as(
          other,
          Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
            groupMembershipService.leave({
              groupId: group.id,
              membershipId: Option.getOrThrow(admission).id
            })
          )
        )
        expect(yield* Effect.flip(as(other, start("Hello")))).toEqual(
          new CoreError.NotFound({ resource: "Group", id: group.id })
        )
      })
    )
  )

  it.effect("a retry after a rolled-back attempt runs again", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, owner, group, as, start } = yield* world(storage)
        const failure = StoreError.failed("Store", "commit")("injected")
        const failing = yield* Layer.build(core(failingLate(bound, failure)))
        expect(Exit.isFailure(yield* Effect.exit(as(owner, start("Hello"), failing)))).toBe(true)
        expect(yield* bound.threads.listByGroup(group.id)).toEqual([])
        const retried = yield* as(owner, start("Hello"))
        expect(yield* bound.threads.listByGroup(group.id)).toEqual([retried.thread])
      })
    )
  )

  it.effect("concurrent duplicates create one thread, and another host's retry finds it", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, owner, group, as, start } = yield* world(storage)
        const attempts = yield* Effect.forEach([1, 2, 3], () => as(owner, start("Hello")), {
          concurrency: "unbounded"
        })
        expect(new Set(attempts.map((started) => started.thread.id)).size).toBe(1)
        expect(yield* bound.threads.listByGroup(group.id)).toHaveLength(1)
        const elsewhere = yield* forWorkspace(yield* storage.connect(), workspaceId)
        const services = yield* Layer.build(core(elsewhere))
        expect(yield* as(owner, start("Hello"), services)).toEqual(attempts[0])
      })
    )
  )

  it.effect("replies, direct starts, group creation, and invitations also run once per key", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, owner, as, start } = yield* world(storage)
        const started = yield* as(owner, start("Hello"))
        const twice = <A, E, R>(program: Effect.Effect<A, E, R>) =>
          Effect.gen(function* () {
            const first = yield* as(owner, program)
            const before = yield* history(bound)
            expect(yield* as(owner, program)).toEqual(first)
            expect(yield* history(bound)).toEqual(before)
            return first
          })
        const requestKey = Request.Key.make("request-2")
        yield* twice(
          Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
            threadMessageService.publish({ threadId: started.thread.id, text: "Reply", mentions: [] })
          ).pipe(Request.withKey(requestKey))
        )
        yield* twice(
          Effect.flatMap(ThreadService.ThreadService, (threadService) =>
            threadService.startDirect({ memberIds: [other.memberId], text: "Hi", mentions: [] })
          ).pipe(Request.withKey(requestKey))
        )
        yield* twice(
          Effect.flatMap(GroupService.GroupService, (groupService) =>
            groupService.createTeam({ name: "Second", memberIds: [] })
          ).pipe(Request.withKey(requestKey))
        )
        const expiresAt = yield* future
        yield* twice(
          Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
            invitationService.issue(request(expiresAt, Identity.HumanId.make("carol")))
          ).pipe(Request.withKey(requestKey))
        )
      })
    )
  )

  it.effect("a created record's key returns it, whatever the retry asks for", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const { bound, owner, as } = yield* world(storage)
        const create = (name: string) =>
          Effect.flatMap(GroupService.GroupService, (groupService) =>
            groupService.createTeam({ name, memberIds: [] })
          ).pipe(Request.withKey(key))
        const first = yield* as(owner, create("Second"))
        const before = yield* history(bound)
        expect(yield* as(owner, create("Different"))).toEqual(first)
        expect(yield* history(bound)).toEqual(before)
      })
    )
  )

  it.effect("a keyed workspace creation returns the same workspace on retry", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const host = yield* storage.connect()
        const create = (name: string, creator = alice.id) =>
          Effect.flatMap(Gateway.Gateway, (gateway) =>
            gateway.createWorkspace(creator, { name, memberName: Member.Name.make(creator) }, key)
          ).pipe(Effect.provide(gateway(host)))
        const first = yield* create("Studio")
        expect(yield* create("Studio")).toEqual(first)
        expect(yield* create("Other name")).toEqual(first)
        // Another creator's key names another workspace.
        const theirs = yield* create("Studio", Identity.HumanId.make("bob"))
        expect(theirs.id).not.toBe(first.id)
        // A retry on another host finds it too.
        const elsewhere = yield* storage.connect()
        expect(
          yield* Effect.flatMap(Gateway.Gateway, (gateway) =>
            gateway.createWorkspace(alice.id, { name: "Studio", memberName: "alice" }, key)
          ).pipe(Effect.provide(gateway(elsewhere)))
        ).toEqual(first)
      })
    )
  )
})
