import { Role, RoleFacts } from "@amends-dev/core/authorization"
import { ChangeFeed, ChangeFeedService } from "@amends-dev/core/change-feed"
import type { CoreError } from "@amends-dev/core/error"
import { GroupService } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Journal, Publication } from "@amends-dev/core/journal"
import { NotificationService } from "@amends-dev/core/notification"
import { Signal } from "@amends-dev/core/signal"
import { ThreadMessage, ThreadMessageService, ThreadService } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Queue, Stream } from "effect"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import { alice, type Bound, boundTo, runHost, testProvenance, workspaceId } from "./support.ts"

/** Buffer a subscription's messages for the enclosing scope. */
const listen = <E, R>(watch: Effect.Effect<Stream.Stream<ChangeFeed.Message, CoreError.Unavailable>, E, R>) =>
  Effect.gen(function* () {
    const stream = yield* watch
    const queue = yield* Queue.unbounded<ChangeFeed.Message>()
    yield* stream.pipe(
      Stream.runForEach((message) => Queue.offer(queue, message)),
      Effect.forkScoped
    )
    return Queue.take(queue)
  })
const committed = (message: ChangeFeed.Message) => {
  if (!ChangeFeed.Message.isAnyOf(["Committed"])(message)) throw new Error(`Expected a commit, got ${message._tag}`)
  return message
}
const watch = (options?: ChangeFeed.WatchOptions) =>
  Effect.flatMap(ChangeFeedService.ChangeFeedService, (changeFeedService) => changeFeedService.watch(options))
const human = (name: string) => Identity.HumanId.make(name)
/** The text a timeline item shows, when it shows a message's. */
const textOf = (message: ThreadMessage.ThreadMessage) =>
  ThreadMessage.Content.isAnyOf(["Text"])(message.content) ? message.content.text : undefined
const memberActor = (name: string) =>
  Actor.Actor.of({
    workspaceId,
    memberId: MemberId.MemberId.make(name),
    identity: { _tag: "Human", id: human(name) }
  })

/** The change feed read from the journal: delivery across hosts, resumption, and audiences. */
const { core, initialized, seed } = Support
/** Record a role every member may see, as a trusted fixture would. */
const marker = (bound: Bound) =>
  Effect.flatMap(Journal.Journal, (journal) =>
    journal.commit(
      journal.publish(RoleFacts.Created, {
        roleId: Role.RoleId.make("marker"),
        workspaceId,
        name: "Marker",
        permissions: []
      })
    )
  ).pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)), Effect.provide(core(bound)))
describe("change feed", () => {
  it.effect("thread activity reaches the group's members with read access, and nobody else", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          const workspace = yield* initialized(bound)
          const owner = Actor.Actor.of({
            workspaceId,
            memberId: workspace.ownerMemberId,
            identity: alice
          })
          const reader = memberActor("reader")
          const outsider = memberActor("outsider")
          const unpermitted = memberActor("unpermitted")
          yield* seed(bound, [reader, outsider, unpermitted], [reader, outsider])
          // One core for the workspace, as one runtime serves every subscriber in a process.
          const services = yield* Layer.build(core(bound))
          const as = <A, E, R>(actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>) =>
            program.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(services))
          const feeds = yield* Effect.forEach([reader, outsider, unpermitted], (actor) => as(actor, listen(watch())))
          for (const next of feeds) expect(yield* next).toMatchObject({ reset: true })
          const group = yield* as(
            owner,
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.createTeam({
                name: "Private",
                memberIds: [owner.memberId, reader.memberId, unpermitted.memberId]
              })
            )
          )
          const thread = yield* as(
            owner,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.startInGroup({
                groupId: group.id,
                mentions: [],
                text: "Secret plan"
              })
            )
          )
          const reply = yield* as(
            owner,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.publish({ threadId: thread.thread.id, mentions: [], text: "First draft" })
            )
          )
          yield* as(
            owner,
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.edit({ messageId: reply.id, mentions: [], text: "Final draft", expectedRevision: 1 })
            )
          )
          // A role every member may see marks the end of what each reader receives.
          yield* marker(bound)
          const [readerFeed, outsiderFeed, unpermittedFeed] = feeds
          if (!readerFeed || !outsiderFeed || !unpermittedFeed) return yield* Effect.die("Expected three feeds")
          // The group's creation makes the reader's groups stale. Its thread's commits deliver what
          // changed, but for who takes part, which starting it changed.
          const created = committed(yield* readerFeed)
          expect(created.stale).toEqual(expect.arrayContaining([{ read: "groups" }, { read: "public-groups" }]))
          const started = committed(yield* readerFeed)
          expect(started.stale).toEqual([{ read: "participants", id: thread.thread.id }])
          // The commit's changes: the timeline items it recorded, as the timeline shows them, the
          // preview of their thread, as its group's stream shows it, and their group's latest
          // activity, as the groups list shows it.
          const changesOf = (message: ChangeFeed.Message) =>
            committed(message).changes.map((change) =>
              ChangeFeed.Change.match(change, {
                TimelineItem: ({ item }) => [
                  item.activity.sequence,
                  item.activity.kind,
                  "message" in item ? textOf(item.message) : undefined
                ],
                Preview: ({ preview }) => [
                  "preview",
                  preview.latest.sequence,
                  preview.replies,
                  textOf(preview.message)
                ],
                GroupLatest: ({ latest }) => ["group", latest.groupId],
                Turn: ({ turn }) => ["turn", turn.id]
              })
            )
          expect(changesOf(started)).toEqual([
            [1, "message.published", "Secret plan"],
            ["preview", 1, 0, "Secret plan"],
            ["group", group.id]
          ])
          expect(changesOf(yield* readerFeed)).toEqual([
            [2, "message.published", "First draft"],
            ["preview", 2, 1, "Secret plan"],
            ["group", group.id]
          ])
          // An edit changes the reply's own item in place, as well as recording its own; it is quiet,
          // so the preview's latest activity stays the reply.
          expect(changesOf(yield* readerFeed)).toEqual([
            [2, "message.published", "Final draft"],
            [3, "message.edited", "Final draft"],
            ["preview", 2, 1, "Secret plan"],
            ["group", group.id]
          ])
          const roleCreated = [{ read: "settings" }, { read: "members" }]
          expect(committed(yield* readerFeed).stale).toEqual(roleCreated)
          // Outside the group, or without read permission, only workspace facts arrive, and no change.
          for (const next of [outsiderFeed, unpermittedFeed]) {
            const received = committed(yield* next)
            expect(received.stale).toEqual(roleCreated)
            expect(received.changes).toEqual([])
          }
        })
      )
    )
  )

  it.effect("posting tells the author's sessions how far they read the thread, once it commits", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          const workspace = yield* initialized(bound)
          const owner = Actor.Actor.of({ workspaceId, memberId: workspace.ownerMemberId, identity: alice })
          const services = yield* Layer.build(core(bound))
          const as = <A, E, R>(program: Effect.Effect<A, E, R>) =>
            program.pipe(Effect.provideService(Actor.Actor, owner), Effect.provide(services))
          const feed = yield* as(listen(watch()))
          expect(yield* feed).toMatchObject({ reset: true })
          const group = yield* as(
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.createTeam({ name: "Plans", memberIds: [owner.memberId] })
            )
          )
          const started = yield* as(
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.startInGroup({ groupId: group.id, mentions: [], text: "Opening" })
            )
          )
          yield* as(
            Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
              threadMessageService.publish({ threadId: started.thread.id, mentions: [], text: "Reply" })
            )
          )
          // Each post reads the thread through the author's own message, and their sessions hear it.
          const readThroughs: Array<number> = []
          while (readThroughs.length < 2) {
            const message = yield* feed
            if (
              ChangeFeed.Message.isAnyOf(["Signal"])(message) &&
              Signal.Signal.isAnyOf(["ThreadRead"])(message.signal)
            )
              readThroughs.push(message.signal.readThrough)
          }
          expect(readThroughs).toEqual([1, 2])
        })
      )
    )
  )

  it.effect("a mention's notification reaches its recipient as their inbox lists it", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          const workspace = yield* initialized(bound)
          const owner = Actor.Actor.of({
            workspaceId,
            memberId: workspace.ownerMemberId,
            identity: alice
          })
          const mentioned = memberActor("mentioned")
          const bystander = memberActor("bystander")
          yield* seed(bound, [mentioned, bystander], [mentioned, bystander])
          const services = yield* Layer.build(core(bound))
          const as = <A, E, R>(actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>) =>
            program.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(services))
          const group = yield* as(
            owner,
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.createTeam({
                name: "Team",
                memberIds: [owner.memberId, mentioned.memberId, bystander.memberId]
              })
            )
          )
          const [mentionedFeed, bystanderFeed] = yield* Effect.forEach([mentioned, bystander], (actor) =>
            as(actor, listen(watch()))
          )
          if (!mentionedFeed || !bystanderFeed) return yield* Effect.die("Expected two feeds")
          for (const next of [mentionedFeed, bystanderFeed]) yield* next
          yield* as(
            owner,
            Effect.flatMap(ThreadService.ThreadService, (threadService) =>
              threadService.startInGroup({
                groupId: group.id,
                mentions: [mentioned.memberId],
                text: "Can you look?"
              })
            )
          )
          const started = committed(yield* mentionedFeed)
          const inbox = yield* as(
            mentioned,
            Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
              Effect.map(notificationService.inbox({ limit: 10 }), (items) => items.map((item) => item.notification))
            )
          )
          expect(inbox).toHaveLength(1)
          expect(started.notifications).toEqual(inbox)
          // The bystander sees the conversation, but nothing addressed to someone else.
          const seen = committed(yield* bystanderFeed)
          expect(seen.cursor).toBe(started.cursor)
          expect(seen.changes).not.toEqual([])
          expect(seen.notifications).toEqual([])
          // The mention makes the recipient's pending counts stale, and nobody else's.
          expect(started.stale).toContainEqual({ read: "pending" })
          expect(seen.stale).not.toContainEqual({ read: "pending" })
        })
      )
    )
  )
})
