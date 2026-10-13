import type { Core } from "@amends-dev/core"
import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Group, GroupService, GroupMembershipService, GroupId } from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Entry, Journal, Store, StoreError } from "@amends-dev/core/journal"
import { Notification, NotificationService, type NotificationStore } from "@amends-dev/core/notification"
import { ThreadService, ThreadId, ThreadParticipationId } from "@amends-dev/core/thread"
import { TurnId } from "@amends-dev/core/turn"
import { Member, MemberId } from "@amends-dev/core/workspace"
import { Gateway } from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { Array, Context, DateTime, Effect, Layer, Option } from "effect"
import { withStorage } from "./fixture.ts"
import { acceptInvitation, createWorkspace, invite, removeMember } from "./operations.ts"
import * as Support from "./support.ts"
import {
  boundTo,
  future,
  layerRecordedDeliveryJobs,
  layerRecordedTurnJobs,
  listOldestFirst,
  otherWorkspaceId,
  runHost,
  workspaceId
} from "./support.ts"

/** Notification storage: isolation, paging, batches, staged reads, and gateway reads. */

/** Inbox items for these notifications, whose sources here are entries no log holds. */
const inboxOf = (...records: ReadonlyArray<Notification.Notification>) =>
  records.map((notification) => ({ notification }))

const { core, initialized, runGateway } = Support
describe("notifications", () => {
  const humanIdentity = Identity.Reference.cases.Human.make({
    id: Identity.HumanId.make("recipient")
  })
  const agentIdentity = Identity.Reference.cases.Agent.make({
    id: Identity.AgentId.make("recipient")
  })
  const anotherIdentity = Identity.Reference.cases.Human.make({
    id: Identity.HumanId.make("another")
  })
  // People and agents are notified as a membership.
  const human = Notification.ofMember(MemberId.MemberId.make("recipient-member"), humanIdentity)
  const agent = Notification.ofMember(MemberId.MemberId.make("agent-member"), agentIdentity)
  const contact = Identity.Reference.cases.Contact.make({
    id: Identity.ContactId.make("recipient")
  })
  const triage = Notification.Recipient.cases.Triage.make({})
  const another = Notification.ofMember(MemberId.MemberId.make("another-member"), anotherIdentity)
  const recordedAt = DateTime.makeUnsafe("2026-09-19T12:00:00.123Z")
  const record = (id: string, overrides: Partial<Notification.Notification> = {}): Notification.Notification => ({
    id: Notification.NotificationId.make(id),
    workspaceId,
    source: { logId: Entry.LogId.make("journal"), entryId: Entry.EntryId.make(`source-${id}`) },
    recipient: { ...human },
    recordedAt,
    state: { _tag: "Pending" },
    ...overrides
  })
  const page = { limit: 20 }
  it.effect("notification storage persists across reopening and isolates workspaces and recipient kinds", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const one = record("same-id")
        const two = record("agent", { source: one.source, recipient: agent })
        const three = record("another", { source: one.source, recipient: another })
        const four = record("contact", { source: one.source, recipient: contact })
        const five = record("triage", { source: one.source, recipient: triage })
        const foreign = record("same-id", { workspaceId: otherWorkspaceId })
        yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const a = yield* boundTo(workspaceId)
              const b = yield* boundTo(otherWorkspaceId)
              yield* initialized(a)
              yield* initialized(b)
              yield* a.store.transaction(Effect.forEach([one, two, three, four, five], a.notifications.insert))
              yield* b.store.transaction(b.notifications.insert(foreign))
            })
          )
        )
        yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const a = yield* boundTo(workspaceId)
              const b = yield* boundTo(otherWorkspaceId)
              expect(yield* a.notifications.get(one.id)).toEqual(Option.some(one))
              expect(yield* b.notifications.get(one.id)).toEqual(Option.some(foreign))
              expect(yield* b.notifications.get(two.id)).toEqual(Option.none())
              expect(yield* a.notifications.get(Notification.NotificationId.make("absent"))).toEqual(Option.none())
              expect(yield* listOldestFirst(a.notifications, human, page)).toEqual([one])
              expect(yield* a.notifications.listPendingByRecipient(agent, page)).toEqual([two])
              expect(yield* listOldestFirst(a.notifications, another, page)).toEqual([three])
              expect(yield* listOldestFirst(a.notifications, contact, page)).toEqual([four])
              expect(yield* a.notifications.listPendingByRecipient(triage, page)).toEqual([five])
              expect(yield* listOldestFirst(b.notifications, triage, page)).toEqual([])
              expect(yield* b.notifications.listPendingByRecipient(human, page)).toEqual([foreign])
            })
          )
        )
      })
    )
  )

  it.effect("pending counts per group include only the recipient's pending thread notifications", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const [red, blue, green] = ["red", "blue", "green"].map((id) => GroupId.GroupId.make(id))
          if (!red || !blue || !green) return yield* Effect.die("Expected three groups")
          const inGroup = (groupId: GroupId.GroupId, sequence = 1) => ({
            thread: { threadId: ThreadId.ThreadId.make(`thread-${groupId}`), groupId, sequence }
          })
          yield* bound.store.transaction(
            bound.notifications.insertMany([
              record("red-1", inGroup(red, 1)),
              record("red-2", inGroup(red, 2)),
              record("blue-1", inGroup(blue)),
              record("green-1", inGroup(green)),
              // Seen, someone else's, or not from a thread: none of these count.
              record("red-seen", inGroup(red, 3)),
              record("red-other", { ...inGroup(red), recipient: another }),
              record("red-agent", { ...inGroup(red), recipient: agent }),
              record("unthreaded")
            ])
          )
          yield* bound.notifications.markSeen([Notification.NotificationId.make("red-seen")], recordedAt)
          const counts = yield* bound.notifications.countPendingByGroup(human, [red, blue])
          expect(counts.toSorted((a, b) => (a.groupId < b.groupId ? -1 : 1))).toEqual([
            { groupId: blue, count: 1 },
            { groupId: red, count: 2 }
          ])
          expect(yield* bound.notifications.countPendingByGroup(agent, [red, green])).toEqual([
            { groupId: red, count: 1 }
          ])
          expect(yield* bound.notifications.countPendingByGroup(human, [GroupId.GroupId.make("empty")])).toEqual([])
          expect(yield* bound.notifications.countPendingByGroup(human, [])).toEqual([])
          yield* bound.notifications.markSeen([Notification.NotificationId.make("red-1")], recordedAt)
          expect(yield* bound.notifications.countPendingByGroup(human, [red])).toEqual([{ groupId: red, count: 1 }])
          expect(yield* (yield* boundTo(otherWorkspaceId)).notifications.countPendingByGroup(human, [red])).toEqual([])
        })
      )
    )
  )

  it.effect("a recipient's notifications from one thread list by position in a range, whatever their state", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const from = (threadId: string, sequence: number, groupId = Group.GeneralId) => ({
            thread: { threadId: ThreadId.ThreadId.make(threadId), groupId, sequence }
          })
          // One is accepted, and one, from a group the agent leaves, discarded.
          const told = [
            record("first", { ...from("thread", 1), recipient: agent }),
            record("second", { ...from("thread", 2), recipient: agent }),
            record("third-b", { ...from("thread", 3), recipient: agent }),
            record("third-a", {
              ...from("thread", 3, GroupId.GroupId.make("left")),
              recipient: agent
            }),
            record("fourth", { ...from("thread", 4), recipient: agent })
          ]
          const others = [
            record("someone-else", from("thread", 2)),
            record("elsewhere", { ...from("other-thread", 2), recipient: agent }),
            record("no-thread", { recipient: agent })
          ]
          yield* bound.store.transaction(
            Effect.gen(function* () {
              yield* bound.notifications.insertMany([...told, ...others])
              yield* bound.notifications.accept(
                [told[1]!.id],
                { _tag: "Turn", turnId: TurnId.TurnId.make("turn") },
                recordedAt
              )
              yield* bound.notifications.discardPendingForGroup(
                MemberId.MemberId.make("agent-member"),
                GroupId.GroupId.make("left")
              )
            })
          )
          const threadId = ThreadId.ThreadId.make("thread")
          const listed = (afterSequence: number, throughSequence: number) =>
            Effect.map(
              bound.notifications.listByThread(agent, threadId, {
                afterSequence,
                throughSequence
              }),
              (records) => records.map((record) => [record.id, record.state._tag])
            )
          // Positions after the first through the third: whatever their state, equal positions by ID.
          expect(yield* listed(1, 3)).toEqual([
            ["second", "Accepted"],
            ["third-a", "Discarded"],
            ["third-b", "Pending"]
          ])
          expect(yield* listed(0, 10)).toEqual([
            ["first", "Pending"],
            ["second", "Accepted"],
            ["third-a", "Discarded"],
            ["third-b", "Pending"],
            ["fourth", "Pending"]
          ])
          expect(yield* listed(4, 4)).toEqual([])
          expect(
            yield* bound.notifications.listByThread(human, threadId, {
              afterSequence: 0,
              throughSequence: 10
            })
          ).toEqual([others[0]])
        })
      )
    )
  )

  it.effect("pending notifications paginate exclusively by instant and binary ID order", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const expected = [
            record("before", { recordedAt: DateTime.add(recordedAt, { milliseconds: -1 }) }),
            ...["A", "a", "é", "\uE000", "\u{10000}"].map((id) => record(id)),
            record("after", { recordedAt: DateTime.add(recordedAt, { milliseconds: 1 }) })
          ]
          yield* bound.store.transaction(Effect.forEach([...expected].reverse(), bound.notifications.insert))
          const read = bound.notifications.listPendingByRecipient
          expect(yield* read(human, page)).toEqual(expected)
          let after: NotificationStore.Cursor | undefined
          for (const next of expected) {
            expect(yield* read(human, { limit: 1, ...(after === undefined ? {} : { after }) })).toEqual([next])
            after = { recordedAt: next.recordedAt, id: next.id }
          }
          expect(yield* read(human, { limit: 1, ...(after === undefined ? {} : { after }) })).toEqual([])
        })
      )
    )
  )

  it.effect("both latest notification lists page newest first, exclusively, in the same order", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const newestFirst = [
            record("after", { recordedAt: DateTime.add(recordedAt, { milliseconds: 1 }) }),
            ...["\u{10000}", "\uE000", "é", "a", "A"].map((id) => record(id)),
            record("before", { recordedAt: DateTime.add(recordedAt, { milliseconds: -1 }) })
          ]
          yield* bound.store.transaction(
            Effect.forEach(
              [
                ...newestFirst,
                record("theirs", { recipient: { ...another } }),
                record("agent's", { recipient: { ...agent } })
              ],
              bound.notifications.insert
            )
          )
          for (const read of [
            bound.notifications.listLatestByRecipient,
            bound.notifications.listLatestPendingByRecipient
          ]) {
            expect(yield* read(human, page)).toEqual(newestFirst)
            let before: NotificationStore.Cursor | undefined
            for (const next of newestFirst) {
              expect(yield* read(human, { limit: 1, ...(before === undefined ? {} : { before }) })).toEqual([next])
              before = { recordedAt: next.recordedAt, id: next.id }
            }
            expect(yield* read(human, { limit: 1, ...(before === undefined ? {} : { before }) })).toEqual([])
            // The boundary need not be a stored notification.
            expect(
              yield* read(human, {
                limit: 2,
                before: { recordedAt, id: Notification.NotificationId.make("b") }
              })
            ).toEqual([record("a"), record("A")])
          }
          // What the recipient saw stays in their inbox, and leaves what is pending.
          const seenAt = DateTime.add(recordedAt, { minutes: 1 })
          yield* bound.notifications.markSeen([Notification.NotificationId.make("é")], seenAt)
          const seen = record("é", {
            state: { _tag: "Seen", seenAt }
          })
          expect(yield* bound.notifications.listLatestByRecipient(human, page)).toEqual(
            newestFirst.map((value) => (value.id === seen.id ? seen : value))
          )
          expect(yield* bound.notifications.listLatestPendingByRecipient(human, page)).toEqual(
            newestFirst.filter((value) => value.id !== seen.id)
          )
        })
      )
    )
  )

  it.effect("notification uniqueness rejects reused IDs and duplicate source-recipient associations", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const saved = record("saved")
          yield* bound.store.transaction(bound.notifications.insert(saved))
          for (const duplicate of [
            record("saved", { source: record("different").source }),
            record("duplicate", { source: saved.source })
          ]) {
            expect(yield* Effect.flip(bound.store.transaction(bound.notifications.insert(duplicate)))).toMatchObject({
              _tag: "StoreError",
              store: "NotificationStore",
              operation: "insert",
              reason: { _tag: "Rejected" }
            })
          }
          const otherLog = record("other-log", {
            source: { ...saved.source, logId: Entry.LogId.make("another-log") }
          })
          yield* bound.store.transaction(bound.notifications.insert(otherLog))
          expect(yield* bound.notifications.get(saved.id)).toEqual(Option.some(saved))
          expect(yield* bound.notifications.get(Notification.NotificationId.make("duplicate"))).toEqual(Option.none())
          expect(yield* listOldestFirst(bound.notifications, human, page)).toHaveLength(2)
        })
      )
    )
  )

  it.effect("writes and reads keep every record past the parameters one statement can bind", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const groupId = GroupId.GroupId.make("crowded")
          const thread = { threadId: ThreadId.ThreadId.make("crowded-thread"), groupId, sequence: 1 }
          // A reply without mentions notifies every participant of a crowded thread at once.
          const many = Array.makeBy(12_000, (index) => record(`many-${index}`, { thread }))
          yield* bound.store.transaction(bound.notifications.insertMany(many))
          const groups = [groupId, ...Array.makeBy(40_000, (index) => GroupId.GroupId.make(`absent-${index}`))]
          expect(yield* bound.notifications.countPendingByGroup(human, groups)).toEqual([
            { groupId, count: many.length }
          ])
          yield* bound.notifications.markSeen(
            many.map((notification) => notification.id),
            recordedAt
          )
          expect(yield* bound.notifications.countPendingByGroup(human, groups)).toEqual([])
          const absent = Array.makeBy(40_000, (index) => Notification.NotificationId.make(`absent-${index}`))
          expect(
            yield* Effect.flip(
              bound.notifications.markSeen([...absent, Notification.NotificationId.make("many-0")], recordedAt)
            )
          ).toMatchObject({
            _tag: "StoreError",
            store: "NotificationStore",
            operation: "markSeen",
            reason: { _tag: "Rejected" }
          })
        })
      )
    )
  )

  it.effect("batch notification insertion writes every record or conflicts as a whole", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          yield* bound.store.transaction(bound.notifications.insertMany([]))
          const batch = [record("one"), record("two", { recipient: { ...agent } }), record("three")]
          yield* bound.store.transaction(bound.notifications.insertMany(batch))
          for (const saved of batch) expect(yield* bound.notifications.get(saved.id)).toEqual(Option.some(saved))
          for (const conflicting of [
            [record("four"), record("one", { source: record("reused").source })],
            [record("five"), record("five", { source: record("again").source })],
            [record("six"), record("seven", { workspaceId: otherWorkspaceId })]
          ]) {
            expect(
              yield* Effect.flip(bound.store.transaction(bound.notifications.insertMany(conflicting)))
            ).toMatchObject({
              _tag: "StoreError",
              store: "NotificationStore",
              operation: "insertMany",
              reason: { _tag: "Rejected" }
            })
            for (const rejected of conflicting.slice(0, 1))
              expect(yield* bound.notifications.get(rejected.id)).toEqual(Option.none())
          }
          expect(yield* listOldestFirst(bound.notifications, human, page)).toHaveLength(2)
        })
      )
    )
  )

  it.effect.each([human, agent, contact, triage])(
    "competing notification insertions produce only one source-recipient record for %o",
    (recipient) =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId)
            yield* initialized(bound)
            const first = record("first", { recipient })
            const second = record("second", { source: first.source, recipient })
            const outcomes = yield* Effect.forEach(
              [first, second],
              (input) =>
                bound.store.transaction(bound.notifications.insert(input)).pipe(
                  Effect.match({
                    onSuccess: () => "Inserted",
                    onFailure: (error) =>
                      StoreError.isStoreError(error) ? `${error.store} ${error.reason._tag}` : error._tag
                  })
                ),
              { concurrency: "unbounded" }
            )
            expect(outcomes.sort()).toEqual(["Inserted", "NotificationStore Rejected"])
            expect(yield* bound.notifications.listPendingByRecipient(recipient, page)).toHaveLength(1)
          })
        )
      )
  )

  it.effect("notifications, source entries, and checkpoints share staged reads and rollback", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const sourceLog = Entry.LogId.make("notification-source")
          const key = { logId: sourceLog, name: "notification-contract", version: 1 }
          const write = Effect.gen(function* () {
            const storeTransaction = yield* Store.Transaction
            const [entry] = yield* storeTransaction.append({
              logId: sourceLog,
              entries: [{ payload: new Uint8Array([1]) }]
            })
            if (entry === undefined) return yield* Effect.die("Expected a source entry")
            const value = record("atomic", {
              source: { logId: entry.logId, entryId: entry.id }
            })
            yield* bound.notifications.insert(value)
            yield* bound.checkpoints.set(key, {
              position: entry.position,
              commitId: entry.commitId,
              index: entry.index,
              entryId: entry.id
            })
            expect(yield* bound.notifications.get(value.id)).toEqual(Option.some(value))
            expect(yield* listOldestFirst(bound.notifications, human, page)).toEqual([value])
            return value
          })
          expect(yield* Effect.flip(bound.store.transaction(write.pipe(Effect.andThen(Effect.fail("rollback")))))).toBe(
            "rollback"
          )
          expect(yield* listOldestFirst(bound.notifications, human, page)).toEqual([])
          expect(yield* bound.store.read(sourceLog, { limit: 10 })).toEqual([])
          expect(yield* bound.checkpoints.get(key)).toEqual(Option.none())
          const saved = yield* bound.store.transaction(write)
          expect(yield* bound.notifications.get(saved.id)).toEqual(Option.some(saved))
          expect(yield* bound.store.read(sourceLog, { limit: 10 })).toHaveLength(1)
          expect(Option.isSome(yield* bound.checkpoints.get(key))).toBe(true)
        })
      )
    )
  )

  it.effect("invalid notification writes conflict before conversion without poisoning the transaction", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const corrupt: ReadonlyArray<(value: Notification.Notification) => void> = [
            (value) => Reflect.set(value, "id", ""),
            (value) => Reflect.set(value, "workspaceId", otherWorkspaceId),
            (value) => Reflect.set(value.source, "logId", ""),
            (value) => Reflect.set(value.source, "entryId", ""),
            (value) => Reflect.set(value.recipient, "_tag", "Unknown"),
            (value) => Reflect.set(value.recipient, "id", ""),
            (value) => Reflect.set(value, "recordedAt", "not-a-date"),
            (value) => Reflect.set(value.state, "_tag", "Unknown")
          ]
          yield* bound.store.transaction(
            Effect.gen(function* () {
              for (const change of corrupt) {
                const invalid = record("invalid")
                change(invalid)
                expect(yield* Effect.flip(bound.notifications.insert(invalid))).toMatchObject({
                  _tag: "StoreError",
                  store: "NotificationStore",
                  operation: "insert",
                  reason: { _tag: "Rejected" }
                })
                expect(yield* listOldestFirst(bound.notifications, human, page)).toEqual([])
              }
              yield* bound.notifications.insert(record("valid"))
            })
          )
          expect(yield* listOldestFirst(bound.notifications, human, page)).toEqual([record("valid")])
        })
      )
    )
  )

  it.effect("notification reads reject invalid paging and recipient input as typed failures", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const badCursor = { recordedAt, id: Notification.NotificationId.make("cursor") }
          Reflect.set(badCursor, "recordedAt", "not-a-date")
          const badRecipient = { ...human }
          Reflect.set(badRecipient, "_tag", "Unknown")
          const read = bound.notifications.listPendingByRecipient
          for (const options of [{ limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: 1, after: badCursor }]) {
            expect(yield* Effect.flip(read(human, options))).toMatchObject({
              _tag: "StoreError",
              store: "NotificationStore",
              reason: { _tag: "Failed" }
            })
          }
          expect(yield* Effect.flip(read(badRecipient, page))).toMatchObject({
            _tag: "StoreError",
            store: "NotificationStore",
            reason: { _tag: "Failed" }
          })
          expect(yield* read(human, page)).toEqual([])
          for (const read of [
            bound.notifications.listLatestByRecipient,
            bound.notifications.listLatestPendingByRecipient
          ]) {
            for (const options of [{ limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: 1, before: badCursor }]) {
              expect(yield* Effect.flip(read(human, options))).toMatchObject({
                _tag: "StoreError",
                store: "NotificationStore",
                reason: { _tag: "Failed" }
              })
            }
            expect(yield* Effect.flip(read(badRecipient, page))).toMatchObject({
              _tag: "StoreError",
              store: "NotificationStore",
              reason: { _tag: "Failed" }
            })
            expect(yield* read(human, page)).toEqual([])
          }
        })
      )
    )
  )

  it.effect("notification operations reject foreign, expired, and incomplete transaction contexts", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const a = yield* boundTo(workspaceId)
          const b = yield* boundTo(otherWorkspaceId)
          yield* initialized(a)
          yield* initialized(b)
          const value = record("guarded")
          const expired = yield* a.store.transaction(Effect.context<Store.Transaction>())
          const native = Context.get(expired, Store.Transaction)
          const failures = [
            a.notifications.get(value.id).pipe(Effect.provide(expired)),
            listOldestFirst(a.notifications, human, page).pipe(Effect.provide(expired)),
            a.notifications.listPendingByRecipient(human, page).pipe(Effect.provide(expired)),
            a.notifications.insert(value).pipe(Effect.provide(expired)),
            a.notifications.insert(value).pipe(Effect.provideService(Store.Transaction, native)),
            a.store.transaction(b.notifications.get(value.id)),
            a.store.transaction(listOldestFirst(b.notifications, human, page)),
            a.store.transaction(b.notifications.insert(record("guarded", { workspaceId: otherWorkspaceId })))
          ]
          for (const operation of failures) {
            expect(yield* Effect.flip(operation)).toMatchObject({
              _tag: "StoreError",
              store: "NotificationStore",
              reason: { _tag: "Failed" }
            })
          }
          expect(yield* a.notifications.get(value.id)).toEqual(Option.none())
          expect(yield* b.notifications.get(value.id)).toEqual(Option.none())
        })
      )
    )
  )

  it.effect("notification storage isolates input and returned nested records from mutation", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const input = record("isolated")
          yield* bound.store.transaction(bound.notifications.insert(input))
          Reflect.set(input.source, "entryId", "changed")
          Reflect.set(input.recipient, "id", "changed")
          const found = Option.getOrThrow(yield* bound.notifications.get(input.id))
          expect(found).toEqual(record("isolated"))
          Reflect.set(found.recipient, "id", "changed-again")
          const [listed] = yield* listOldestFirst(bound.notifications, human, page)
          if (listed === undefined) return yield* Effect.die("Expected a notification")
          Reflect.set(listed.state, "_tag", "Changed")
          expect(yield* bound.notifications.get(input.id)).toEqual(Option.some(record("isolated")))
        })
      )
    )
  )

  it.effect("gateway inbox reads enforce recipient and workspace isolation with real pagination", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const a = yield* boundTo(workspaceId)
          const b = yield* boundTo(otherWorkspaceId)
          const workspace = yield* initialized(a, humanIdentity.id)
          const other = yield* initialized(b, humanIdentity.id)
          const owner = Notification.ofMember(workspace.ownerMemberId, humanIdentity)
          const agentMemberId = MemberId.MemberId.make("notification-agent")
          const first = record("a", { recipient: owner })
          const second = record("b", { recipient: owner })
          const forAgent = record("agent", {
            recipient: Notification.ofMember(agentMemberId, agentIdentity)
          })
          const forAnother = record("another", { recipient: another })
          // The same person under an earlier membership: someone who left and was invited back.
          const earlier = record("earlier", {
            recipient: Notification.ofMember(MemberId.MemberId.make("earlier-member"), humanIdentity)
          })
          const foreign = record("a", {
            workspaceId: otherWorkspaceId,
            recipient: Notification.ofMember(other.ownerMemberId, humanIdentity)
          })
          yield* a.store.transaction(
            Effect.gen(function* () {
              yield* a.members.insert({
                id: agentMemberId,
                workspaceId,
                identity: agentIdentity,
                name: Member.Name.make(agentIdentity.id),
                status: "active"
              })
              yield* Effect.forEach([second, forAnother, earlier, forAgent, first], a.notifications.insert)
            })
          )
          yield* b.store.transaction(b.notifications.insert(foreign))
          const before = yield* a.store.read(Entry.LogId.make("journal"), { limit: 20 })
          const gateway = yield* Gateway.make().pipe(
            Effect.provide(Layer.mergeAll(layerRecordedTurnJobs, layerRecordedDeliveryJobs))
          )
          yield* gateway.asMember(
            workspaceId,
            humanIdentity,
            Effect.gen(function* () {
              const notificationService = yield* NotificationService.NotificationService
              expect(yield* notificationService.inbox({ limit: 1 })).toEqual(inboxOf(second))
              expect(yield* notificationService.inbox(page)).toEqual(inboxOf(second, first))
              expect(yield* notificationService.inbox({ ...page, pendingOnly: true })).toEqual(inboxOf(second, first))
              const options = {
                limit: 1,
                before: { recordedAt: second.recordedAt, id: second.id }
              }
              expect(yield* notificationService.inbox(options)).toEqual(inboxOf(first))
              expect(yield* notificationService.inbox({ ...options, pendingOnly: true })).toEqual(inboxOf(first))
              expect(yield* notificationService.countPending).toBe(2)
            })
          )
          const list = Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
            notificationService.inbox(page)
          )
          expect(yield* gateway.asMember(workspaceId, agentIdentity, list)).toEqual(inboxOf(forAgent))
          expect(yield* gateway.asMember(otherWorkspaceId, humanIdentity, list)).toEqual(inboxOf(foreign))
          for (const id of [forAgent.id, forAnother.id, earlier.id, Notification.NotificationId.make("missing")]) {
            const markSeen = Effect.flatMap(NotificationService.NotificationService, (notificationService) =>
              notificationService.markSeen(id)
            )
            expect(yield* Effect.flip(gateway.asMember(workspaceId, humanIdentity, markSeen))).toMatchObject({
              _tag: "CoreError.NotFound",
              resource: "Notification",
              id
            })
          }
          expect(yield* Effect.flip(gateway.asMember(workspaceId, anotherIdentity, list))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotMember" }
          })
          expect(yield* a.store.read(Entry.LogId.make("journal"), { limit: 20 })).toEqual(before)
          yield* a.store.transaction(a.members.markRemoved(workspace.ownerMemberId))
          expect(yield* Effect.flip(gateway.asMember(workspaceId, humanIdentity, list))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotMember" }
          })
          expect(yield* gateway.asMember(otherWorkspaceId, humanIdentity, list)).toEqual(inboxOf(foreign))
        }).pipe(Effect.scoped)
      )
    )
  )

  it.effect("inbox reads see staged inserts in the outer commit and respect rollback", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          const workspace = yield* initialized(bound, humanIdentity.id)
          const actor = Actor.Actor.of({
            workspaceId,
            memberId: workspace.ownerMemberId,
            identity: humanIdentity
          })
          const value = record("staged", {
            recipient: Notification.ofMember(actor.memberId, humanIdentity)
          })
          yield* Effect.gen(function* () {
            const notificationService = yield* NotificationService.NotificationService
            const journal = yield* Journal.Journal
            expect(
              yield* Effect.flip(
                journal.commit(
                  Effect.gen(function* () {
                    yield* bound.notifications.insert(value)
                    expect(yield* notificationService.inbox(page)).toEqual(inboxOf(value))
                    expect(yield* notificationService.inbox({ ...page, pendingOnly: true })).toEqual(inboxOf(value))
                    expect(yield* notificationService.countPending).toBe(1)
                    return yield* Effect.fail("rollback")
                  })
                )
              )
            ).toBe("rollback")
            expect(yield* notificationService.inbox(page)).toEqual([])
            expect(yield* Effect.flip(notificationService.markSeen(value.id))).toMatchObject({
              _tag: "CoreError.NotFound"
            })
            yield* journal.commit(bound.notifications.insert(value))
            expect(yield* notificationService.inbox(page)).toEqual(inboxOf(value))
          }).pipe(Effect.provide(core(bound)), Effect.provideService(Actor.Actor, actor))
        })
      )
    )
  )

  it.effect("settling an ended participation discards only its pending agent input", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const participationId = ThreadParticipationId.ThreadParticipationId.make("ended")
          const input = record("agent-input", { recipient: agent, participationId })
          const kept = [
            record("human-input", { recipient: human, participationId }),
            record("other-participation", {
              recipient: agent,
              participationId: ThreadParticipationId.ThreadParticipationId.make("other")
            }),
            record("unrelated", { recipient: agent })
          ]
          yield* bound.store.transaction(bound.notifications.insertMany([input, ...kept]))
          yield* bound.store.transaction(bound.notifications.discardPendingForParticipation(participationId))
          expect(yield* bound.notifications.get(input.id)).toEqual(
            Option.some(
              Object.assign({}, input, {
                state: { _tag: "Discarded", reason: "participation-ended" }
              })
            )
          )
          for (const note of kept) expect(yield* bound.notifications.get(note.id)).toEqual(Option.some(note))
          // Settling again finds nothing pending and changes nothing.
          yield* bound.store.transaction(bound.notifications.discardPendingForParticipation(participationId))
          expect(yield* bound.notifications.listPendingByRecipient(agent, page)).toEqual(
            kept.filter((note) => Notification.Recipient.isAnyOf(["Agent"])(note.recipient))
          )
        })
      )
    )
  )

  it.effect(
    "settling a group departure discards only the member's pending notifications from it: a person's unseen ones, and an agent's input",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId)
            yield* initialized(bound)
            const from = (groupId: string, sequence: number) => ({
              thread: {
                threadId: ThreadId.ThreadId.make(`thread-${groupId}`),
                groupId: GroupId.GroupId.make(groupId),
                sequence
              }
            })
            const settled = [record("left-first", from("left", 1)), record("left-second", from("left", 2))]
            const seen = record("left-seen", from("left", 3))
            const kept = [
              record("elsewhere", from("kept", 1)),
              record("someone-else", { ...from("left", 4), recipient: another }),
              record("agent-there", { ...from("left", 5), recipient: agent }),
              record("agent-elsewhere", { ...from("kept", 6), recipient: agent }),
              record("no-thread")
            ]
            yield* bound.store.transaction(bound.notifications.insertMany([...settled, seen, ...kept]))
            yield* bound.notifications.markSeen([seen.id], recordedAt)
            const before = yield* bound.notifications.get(seen.id)
            const leave = bound.store.transaction(
              bound.notifications.discardPendingForGroup(
                MemberId.MemberId.make("recipient-member"),
                GroupId.GroupId.make("left")
              )
            )
            yield* leave
            for (const note of settled)
              expect(yield* bound.notifications.get(note.id)).toEqual(
                Option.some(
                  Object.assign({}, note, {
                    state: { _tag: "Discarded", reason: "access-lost" }
                  })
                )
              )
            // What was seen stays as it was seen; others' notifications are untouched.
            expect(yield* bound.notifications.get(seen.id)).toEqual(before)
            for (const note of kept) expect(yield* bound.notifications.get(note.id)).toEqual(Option.some(note))
            expect(yield* bound.notifications.countPendingByRecipient(human)).toBe(2)
            // Settling again finds nothing pending and changes nothing.
            yield* leave
            expect(yield* bound.notifications.countPendingByRecipient(human)).toBe(2)
            // An agent's departure ends its participation there, and with it its pending input.
            yield* bound.store.transaction(
              bound.notifications.discardPendingForGroup(
                MemberId.MemberId.make("agent-member"),
                GroupId.GroupId.make("left")
              )
            )
            const [agentThere, agentElsewhere] = kept.filter((note) =>
              Notification.Recipient.isAnyOf(["Agent"])(note.recipient)
            )
            expect(yield* bound.notifications.get(agentThere!.id)).toEqual(
              Option.some(
                Object.assign({}, agentThere, {
                  state: { _tag: "Discarded", reason: "participation-ended" }
                })
              )
            )
            expect(yield* bound.notifications.get(agentElsewhere!.id)).toEqual(Option.some(agentElsewhere))
          })
        )
      )
  )

  it.effect("leaving a group settles what was pending from it, and nothing from elsewhere", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const gateway = yield* Gateway.Gateway
          const alice = Identity.Reference.cases.Human.make({
            id: Identity.HumanId.make("alice")
          })
          const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") })
          const workspace = yield* createWorkspace(alice.id)
          const asAlice = <A, E, R extends Core.Operations | Actor.Actor>(program: Effect.Effect<A, E, R>) =>
            gateway.asMember(workspace.id, alice, program)
          const asBob = <A, E, R extends Core.Operations | Actor.Actor>(program: Effect.Effect<A, E, R>) =>
            gateway.asMember(workspace.id, bob, program)
          const invitation = yield* invite(workspace.id, alice, {
            recipientId: bob.id,
            roleId: BuiltinRoles.MemberId,
            expiresAt: yield* future
          })
          const member = yield* acceptInvitation(workspace.id, bob.id, invitation.details.id)
          const create = (name: string) =>
            asAlice(
              GroupService.GroupService.use((groups) =>
                groups.createTeam({ name, memberIds: [workspace.ownerMemberId, member.id] })
              )
            )
          const mention = (groupId: GroupId.GroupId) =>
            asAlice(
              ThreadService.ThreadService.use((threads) =>
                threads.startInGroup({ groupId, text: "Bob?", mentions: [member.id] })
              )
            )
          const count = asBob(
            NotificationService.NotificationService.use((notifications) => notifications.countPending)
          )
          const left = yield* create("Left")
          const kept = yield* create("Kept")
          yield* mention(left.id)
          yield* mention(left.id)
          yield* mention(kept.id)
          expect(yield* count).toBe(3)
          const admission = (yield* asBob(
            GroupMembershipService.GroupMembershipService.use((memberships) => memberships.listCurrent(left.id, page))
          )).find((value) => value.memberId === member.id)
          yield* asBob(
            GroupMembershipService.GroupMembershipService.use((memberships) =>
              memberships.leave({ groupId: left.id, membershipId: admission!.id })
            )
          )
          // What he can no longer open stops waiting for him, and stays as history.
          expect(yield* count).toBe(1)
          const all = yield* asBob(
            NotificationService.NotificationService.use((notifications) =>
              Effect.map(notifications.inbox(page), (items) => items.map((item) => item.notification))
            )
          )
          const settledIn = (groupId: GroupId.GroupId) =>
            all.filter((note) => note.thread?.groupId === groupId).map((note) => note.state)
          expect(settledIn(left.id)).toEqual([
            { _tag: "Discarded", reason: "access-lost" },
            { _tag: "Discarded", reason: "access-lost" }
          ])
          expect(settledIn(kept.id)).toEqual([{ _tag: "Pending" }])
        })
      )
    )
  )

  it.effect("someone invited back after removal starts with an empty inbox", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const gateway = yield* Gateway.Gateway
          const alice = Identity.Reference.cases.Human.make({
            id: Identity.HumanId.make("alice")
          })
          const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") })
          const workspace = yield* createWorkspace(alice.id)
          const asAlice = <A, E, R extends Core.Operations | Actor.Actor>(program: Effect.Effect<A, E, R>) =>
            gateway.asMember(workspace.id, alice, program)
          const asBob = <A, E, R extends Core.Operations | Actor.Actor>(program: Effect.Effect<A, E, R>) =>
            gateway.asMember(workspace.id, bob, program)
          const join = Effect.gen(function* () {
            const invitation = yield* invite(workspace.id, alice, {
              recipientId: bob.id,
              roleId: BuiltinRoles.MemberId,
              expiresAt: yield* future
            })
            return yield* acceptInvitation(workspace.id, bob.id, invitation.details.id)
          })
          const mention = (groupId: GroupId.GroupId, memberId: MemberId.MemberId) =>
            asAlice(
              ThreadService.ThreadService.use((threads) =>
                threads.startInGroup({ groupId, text: "Bob?", mentions: [memberId] })
              )
            )
          const pending = asBob(
            NotificationService.NotificationService.use((notifications) =>
              Effect.map(notifications.inbox({ ...page, pendingOnly: true }), (items) =>
                items.map((item) => item.notification)
              )
            )
          )
          const sidebar = asBob(GroupService.GroupService.use((groups) => groups.listMine(page)))
          const first = yield* join
          const group = yield* asAlice(
            GroupService.GroupService.use((groups) =>
              groups.createTeam({
                name: "Private",
                memberIds: [workspace.ownerMemberId, first.id]
              })
            )
          )
          yield* mention(group.id, first.id)
          expect(yield* pending).toHaveLength(1)
          yield* removeMember(workspace.id, alice, first.id)
          // Invited back, Bob is a new member, and his earlier membership's inbox stays with it.
          const second = yield* join
          expect(second.id).not.toBe(first.id)
          expect(yield* pending).toEqual([])
          yield* asAlice(
            GroupMembershipService.GroupMembershipService.use((memberships) =>
              memberships.add({ groupId: group.id, memberId: second.id })
            )
          )
          // General and Private: nothing waits in either.
          expect((yield* sidebar).map(({ pending }) => pending)).toEqual([0, 0])
          // What reaches his new membership is his.
          const again = yield* mention(group.id, second.id)
          const [notification] = yield* pending
          expect(notification).toMatchObject({
            recipient: { _tag: "Human", id: bob.id, memberId: second.id },
            thread: { threadId: again.thread.id }
          })
          // Private, then general by group ID.
          expect((yield* sidebar).map(({ pending }) => pending)).toEqual([1, 0])
        })
      )
    )
  )
})
