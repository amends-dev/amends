import type * as Core from "@amends/core";
import { describe, expect, it } from "@effect/vitest";
import { Actor, Identity } from "@amends/core/identity";
import { Entry, Journal, Store } from "@amends/core/journal";
import { Notification, NotificationService, NotificationStore } from "@amends/core/notification";
import { BuiltinRoles } from "@amends/core/authorization";
import { Group, GroupService, GroupMembershipService } from "@amends/core/group";
import { Thread, ThreadService, ThreadParticipation } from "@amends/core/thread";
import { Member } from "@amends/core/workspace";
import { Gateway, WorkspaceTurnJobs } from "@amends/gateway";
import { Array, Context, DateTime, Effect, Layer, Option } from "effect";
import { acceptInvitation, createWorkspace, invite, removeMember } from "./operations.ts";
import {
  boundTo,
  future,
  layerManualBackgroundJobs,
  otherWorkspaceId,
  runHost,
  Support,
  workspaceId,
} from "./support.ts";
import type { Harness } from "./harness.ts";

/** Notification storage: isolation, paging, batches, staged reads, and gateway reads. */

export const notifications = (harness: Harness) => {
  const { core, initialized, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: notifications`, () => {
    const humanIdentity = Identity.Reference.cases.Human.make({
      id: Identity.HumanId.make("recipient"),
    });
    const agentIdentity = Identity.Reference.cases.Agent.make({
      id: Identity.AgentId.make("recipient"),
    });
    const anotherIdentity = Identity.Reference.cases.Human.make({
      id: Identity.HumanId.make("another"),
    });
    // People and agents are notified as a membership.
    const human = Notification.ofMember(Member.Id.make("recipient-member"), humanIdentity);
    const agent = Notification.ofMember(Member.Id.make("agent-member"), agentIdentity);
    const contact = Identity.Reference.cases.Contact.make({
      id: Identity.ContactId.make("recipient"),
    });
    const triage = Notification.Recipient.cases.Triage.make({});
    const another = Notification.ofMember(Member.Id.make("another-member"), anotherIdentity);
    const recordedAt = DateTime.makeUnsafe("2026-09-19T12:00:00.123Z");
    const record = (
      id: string,
      overrides: Partial<Notification.Record> = {},
    ): Notification.Record => ({
      id: Notification.Id.make(id),
      workspaceId,
      source: { logId: Entry.LogId.make("journal"), entryId: Entry.Id.make(`source-${id}`) },
      recipient: { ...human },
      recordedAt,
      state: { _tag: "Pending" },
      ...overrides,
    });
    const page = { limit: 20 };
    it.effect(
      "notification storage persists across reopening and isolates workspaces and recipient kinds",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const one = record("same-id");
            const two = record("agent", { source: one.source, recipient: agent });
            const three = record("another", { source: one.source, recipient: another });
            const four = record("contact", { source: one.source, recipient: contact });
            const five = record("triage", { source: one.source, recipient: triage });
            const foreign = record("same-id", { workspaceId: otherWorkspaceId });
            yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const a = yield* boundTo(workspaceId);
                  const b = yield* boundTo(otherWorkspaceId);
                  yield* initialized(a);
                  yield* initialized(b);
                  yield* a.store.transaction(
                    Effect.forEach([one, two, three, four, five], a.notifications.insert),
                  );
                  yield* b.store.transaction(b.notifications.insert(foreign));
                }),
              ),
            );
            yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const a = yield* boundTo(workspaceId);
                  const b = yield* boundTo(otherWorkspaceId);
                  expect(yield* a.notifications.get(one.id)).toEqual(Option.some(one));
                  expect(yield* b.notifications.get(one.id)).toEqual(Option.some(foreign));
                  expect(yield* b.notifications.get(two.id)).toEqual(Option.none());
                  expect(yield* a.notifications.get(Notification.Id.make("absent"))).toEqual(
                    Option.none(),
                  );
                  expect(yield* a.notifications.listByRecipient(human, page)).toEqual([one]);
                  expect(yield* a.notifications.listPendingByRecipient(agent, page)).toEqual([two]);
                  expect(yield* a.notifications.listByRecipient(another, page)).toEqual([three]);
                  expect(yield* a.notifications.listByRecipient(contact, page)).toEqual([four]);
                  expect(yield* a.notifications.listPendingByRecipient(triage, page)).toEqual([
                    five,
                  ]);
                  expect(yield* b.notifications.listByRecipient(triage, page)).toEqual([]);
                  expect(yield* b.notifications.listPendingByRecipient(human, page)).toEqual([
                    foreign,
                  ]);
                }),
              ),
            );
          }),
        ),
    );

    it.effect(
      "pending counts per group include only the recipient's pending thread notifications",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              yield* initialized(bound);
              const [red, blue, green] = ["red", "blue", "green"].map((id) => Group.Id.make(id));
              if (!red || !blue || !green) return yield* Effect.die("Expected three groups");
              const inGroup = (groupId: Group.Id, sequence = 1) => ({
                thread: { threadId: Thread.Id.make(`thread-${groupId}`), groupId, sequence },
              });
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
                  record("unthreaded"),
                ]),
              );
              yield* bound.notifications.markSeen([Notification.Id.make("red-seen")], recordedAt);
              const counts = yield* bound.notifications.countPendingByGroup(human, [red, blue]);
              expect(counts.toSorted((a, b) => (a.groupId < b.groupId ? -1 : 1))).toEqual([
                { groupId: blue, count: 1 },
                { groupId: red, count: 2 },
              ]);
              expect(yield* bound.notifications.countPendingByGroup(agent, [red, green])).toEqual([
                { groupId: red, count: 1 },
              ]);
              expect(
                yield* bound.notifications.countPendingByGroup(human, [Group.Id.make("empty")]),
              ).toEqual([]);
              expect(yield* bound.notifications.countPendingByGroup(human, [])).toEqual([]);
              yield* bound.notifications.markSeen([Notification.Id.make("red-1")], recordedAt);
              expect(yield* bound.notifications.countPendingByGroup(human, [red])).toEqual([
                { groupId: red, count: 1 },
              ]);
              expect(
                yield* (yield* boundTo(otherWorkspaceId)).notifications.countPendingByGroup(human, [
                  red,
                ]),
              ).toEqual([]);
            }),
          ),
        ),
    );

    it.effect("both notification lists paginate exclusively by instant and binary ID order", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            yield* initialized(bound);
            const expected = [
              record("before", { recordedAt: DateTime.add(recordedAt, { milliseconds: -1 }) }),
              ...["A", "a", "é", "\uE000", "\u{10000}"].map((id) => record(id)),
              record("after", { recordedAt: DateTime.add(recordedAt, { milliseconds: 1 }) }),
            ];
            yield* bound.store.transaction(
              Effect.forEach([...expected].reverse(), bound.notifications.insert),
            );
            for (const read of [
              bound.notifications.listByRecipient,
              bound.notifications.listPendingByRecipient,
            ]) {
              expect(yield* read(human, page)).toEqual(expected);
              let after: NotificationStore.Cursor | undefined;
              for (const next of expected) {
                expect(
                  yield* read(human, { limit: 1, ...(after === undefined ? {} : { after }) }),
                ).toEqual([next]);
                after = { recordedAt: next.recordedAt, id: next.id };
              }
              expect(yield* read(human, { limit: 1, after })).toEqual([]);
            }
          }),
        ),
      ),
    );

    it.effect(
      "both latest notification lists page newest first, exclusively, in the same order",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              yield* initialized(bound);
              const newestFirst = [
                record("after", { recordedAt: DateTime.add(recordedAt, { milliseconds: 1 }) }),
                ...["\u{10000}", "\uE000", "é", "a", "A"].map((id) => record(id)),
                record("before", { recordedAt: DateTime.add(recordedAt, { milliseconds: -1 }) }),
              ];
              yield* bound.store.transaction(
                Effect.forEach(
                  [
                    ...newestFirst,
                    record("theirs", { recipient: { ...another } }),
                    record("agent's", { recipient: { ...agent } }),
                  ],
                  bound.notifications.insert,
                ),
              );
              for (const read of [
                bound.notifications.listLatestByRecipient,
                bound.notifications.listLatestPendingByRecipient,
              ]) {
                expect(yield* read(human, page)).toEqual(newestFirst);
                let before: NotificationStore.Cursor | undefined;
                for (const next of newestFirst) {
                  expect(
                    yield* read(human, { limit: 1, ...(before === undefined ? {} : { before }) }),
                  ).toEqual([next]);
                  before = { recordedAt: next.recordedAt, id: next.id };
                }
                expect(yield* read(human, { limit: 1, before })).toEqual([]);
                // The boundary need not be a stored notification.
                expect(
                  yield* read(human, {
                    limit: 2,
                    before: { recordedAt, id: Notification.Id.make("b") },
                  }),
                ).toEqual([record("a"), record("A")]);
              }
              // What the recipient saw stays in their inbox, and leaves what is pending.
              const seenAt = DateTime.add(recordedAt, { minutes: 1 });
              yield* bound.notifications.markSeen([Notification.Id.make("é")], seenAt);
              const seen = record("é", {
                state: { _tag: "Acknowledged", outcome: { _tag: "Seen" }, acknowledgedAt: seenAt },
              });
              expect(yield* bound.notifications.listLatestByRecipient(human, page)).toEqual(
                newestFirst.map((value) => (value.id === seen.id ? seen : value)),
              );
              expect(yield* bound.notifications.listLatestPendingByRecipient(human, page)).toEqual(
                newestFirst.filter((value) => value.id !== seen.id),
              );
            }),
          ),
        ),
    );

    it.effect(
      "notification uniqueness rejects reused IDs and duplicate source-recipient associations",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              yield* initialized(bound);
              const saved = record("saved");
              yield* bound.store.transaction(bound.notifications.insert(saved));
              for (const duplicate of [
                record("saved", { source: record("different").source }),
                record("duplicate", { source: saved.source }),
              ]) {
                expect(
                  yield* Effect.flip(
                    bound.store.transaction(bound.notifications.insert(duplicate)),
                  ),
                ).toMatchObject({
                  _tag: "NotificationStore.Conflict",
                  operation: "insert",
                });
              }
              const otherLog = record("other-log", {
                source: { ...saved.source, logId: Entry.LogId.make("another-log") },
              });
              yield* bound.store.transaction(bound.notifications.insert(otherLog));
              expect(yield* bound.notifications.get(saved.id)).toEqual(Option.some(saved));
              expect(yield* bound.notifications.get(Notification.Id.make("duplicate"))).toEqual(
                Option.none(),
              );
              expect(yield* bound.notifications.listByRecipient(human, page)).toHaveLength(2);
            }),
          ),
        ),
    );

    it.effect("writes and reads keep every record past the parameters one statement can bind", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            yield* initialized(bound);
            const groupId = Group.Id.make("crowded");
            const thread = { threadId: Thread.Id.make("crowded-thread"), groupId, sequence: 1 };
            // A reply without mentions notifies every participant of a crowded thread at once.
            const many = Array.makeBy(12_000, (index) => record(`many-${index}`, { thread }));
            yield* bound.store.transaction(bound.notifications.insertMany(many));
            const groups = [
              groupId,
              ...Array.makeBy(40_000, (index) => Group.Id.make(`absent-${index}`)),
            ];
            expect(yield* bound.notifications.countPendingByGroup(human, groups)).toEqual([
              { groupId, count: many.length },
            ]);
            yield* bound.notifications.markSeen(
              many.map((notification) => notification.id),
              recordedAt,
            );
            expect(yield* bound.notifications.countPendingByGroup(human, groups)).toEqual([]);
            const absent = Array.makeBy(40_000, (index) => Notification.Id.make(`absent-${index}`));
            expect(
              yield* Effect.flip(
                bound.notifications.markSeen(
                  [...absent, Notification.Id.make("many-0")],
                  recordedAt,
                ),
              ),
            ).toMatchObject({ _tag: "NotificationStore.Conflict", operation: "markSeen" });
          }),
        ),
      ),
    );

    it.effect("batch notification insertion writes every record or conflicts as a whole", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            yield* initialized(bound);
            yield* bound.store.transaction(bound.notifications.insertMany([]));
            const batch = [
              record("one"),
              record("two", { recipient: { ...agent } }),
              record("three"),
            ];
            yield* bound.store.transaction(bound.notifications.insertMany(batch));
            for (const saved of batch)
              expect(yield* bound.notifications.get(saved.id)).toEqual(Option.some(saved));
            for (const conflicting of [
              [record("four"), record("one", { source: record("reused").source })],
              [record("five"), record("five", { source: record("again").source })],
              [record("six"), record("seven", { workspaceId: otherWorkspaceId })],
            ]) {
              expect(
                yield* Effect.flip(
                  bound.store.transaction(bound.notifications.insertMany(conflicting)),
                ),
              ).toMatchObject({ _tag: "NotificationStore.Conflict", operation: "insertMany" });
              for (const rejected of conflicting.slice(0, 1))
                expect(yield* bound.notifications.get(rejected.id)).toEqual(Option.none());
            }
            expect(yield* bound.notifications.listByRecipient(human, page)).toHaveLength(2);
          }),
        ),
      ),
    );

    it.effect.each([human, agent, contact, triage])(
      "competing notification insertions produce only one source-recipient record for %o",
      (recipient) =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              yield* initialized(bound);
              const first = record("first", { recipient });
              const second = record("second", { source: first.source, recipient });
              const outcomes = yield* Effect.forEach(
                [first, second],
                (input) =>
                  bound.store.transaction(bound.notifications.insert(input)).pipe(
                    Effect.match({
                      onSuccess: () => "Inserted",
                      onFailure: (error) => error._tag,
                    }),
                  ),
                { concurrency: "unbounded" },
              );
              expect(outcomes.sort()).toEqual(["Inserted", "NotificationStore.Conflict"]);
              expect(
                yield* bound.notifications.listPendingByRecipient(recipient, page),
              ).toHaveLength(1);
            }),
          ),
        ),
    );

    it.effect(
      "notifications, source entries, and checkpoints share staged reads and rollback",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              yield* initialized(bound);
              const sourceLog = Entry.LogId.make("notification-source");
              const key = { logId: sourceLog, name: "notification-contract", version: 1 };
              const write = Effect.gen(function* () {
                const storeTransaction = yield* Store.Transaction;
                const [entry] = yield* storeTransaction.append({
                  logId: sourceLog,
                  entries: [{ payload: new Uint8Array([1]) }],
                });
                if (entry === undefined) return yield* Effect.die("Expected a source entry");
                const value = record("atomic", {
                  source: { logId: entry.logId, entryId: entry.id },
                });
                yield* bound.notifications.insert(value);
                yield* bound.checkpoints.set(key, {
                  position: entry.position,
                  commitId: entry.commitId,
                  index: entry.index,
                  entryId: entry.id,
                });
                expect(yield* bound.notifications.get(value.id)).toEqual(Option.some(value));
                expect(yield* bound.notifications.listByRecipient(human, page)).toEqual([value]);
                return value;
              });
              expect(
                yield* Effect.flip(
                  bound.store.transaction(write.pipe(Effect.andThen(Effect.fail("rollback")))),
                ),
              ).toBe("rollback");
              expect(yield* bound.notifications.listByRecipient(human, page)).toEqual([]);
              expect(yield* bound.store.read(sourceLog, { limit: 10 })).toEqual([]);
              expect(yield* bound.checkpoints.get(key)).toEqual(Option.none());
              const saved = yield* bound.store.transaction(write);
              expect(yield* bound.notifications.get(saved.id)).toEqual(Option.some(saved));
              expect(yield* bound.store.read(sourceLog, { limit: 10 })).toHaveLength(1);
              expect(Option.isSome(yield* bound.checkpoints.get(key))).toBe(true);
            }),
          ),
        ),
    );

    it.effect(
      "invalid notification writes conflict before conversion without poisoning the transaction",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              yield* initialized(bound);
              const corrupt: ReadonlyArray<(value: Notification.Record) => void> = [
                (value) => Reflect.set(value, "id", ""),
                (value) => Reflect.set(value, "workspaceId", otherWorkspaceId),
                (value) => Reflect.set(value.source, "logId", ""),
                (value) => Reflect.set(value.source, "entryId", ""),
                (value) => Reflect.set(value.recipient, "_tag", "Unknown"),
                (value) => Reflect.set(value.recipient, "id", ""),
                (value) => Reflect.set(value, "recordedAt", "not-a-date"),
                (value) => Reflect.set(value.state, "_tag", "Acknowledged"),
              ];
              yield* bound.store.transaction(
                Effect.gen(function* () {
                  for (const change of corrupt) {
                    const invalid = record("invalid");
                    change(invalid);
                    expect(yield* Effect.flip(bound.notifications.insert(invalid))).toMatchObject({
                      _tag: "NotificationStore.Conflict",
                      operation: "insert",
                    });
                    expect(yield* bound.notifications.listByRecipient(human, page)).toEqual([]);
                  }
                  yield* bound.notifications.insert(record("valid"));
                }),
              );
              expect(yield* bound.notifications.listByRecipient(human, page)).toEqual([
                record("valid"),
              ]);
            }),
          ),
        ),
    );

    it.effect(
      "notification reads reject invalid paging and recipient input as typed failures",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              yield* initialized(bound);
              const badCursor = { recordedAt, id: Notification.Id.make("cursor") };
              Reflect.set(badCursor, "recordedAt", "not-a-date");
              const badRecipient = { ...human };
              Reflect.set(badRecipient, "_tag", "Unknown");
              for (const read of [
                bound.notifications.listByRecipient,
                bound.notifications.listPendingByRecipient,
              ]) {
                for (const options of [
                  { limit: 0 },
                  { limit: -1 },
                  { limit: 1.5 },
                  { limit: 1, after: badCursor },
                ]) {
                  expect(yield* Effect.flip(read(human, options))).toMatchObject({
                    _tag: "NotificationStore.Failure",
                  });
                }
                expect(yield* Effect.flip(read(badRecipient, page))).toMatchObject({
                  _tag: "NotificationStore.Failure",
                });
                expect(yield* read(human, page)).toEqual([]);
              }
              for (const read of [
                bound.notifications.listLatestByRecipient,
                bound.notifications.listLatestPendingByRecipient,
              ]) {
                for (const options of [
                  { limit: 0 },
                  { limit: -1 },
                  { limit: 1.5 },
                  { limit: 1, before: badCursor },
                ]) {
                  expect(yield* Effect.flip(read(human, options))).toMatchObject({
                    _tag: "NotificationStore.Failure",
                  });
                }
                expect(yield* Effect.flip(read(badRecipient, page))).toMatchObject({
                  _tag: "NotificationStore.Failure",
                });
                expect(yield* read(human, page)).toEqual([]);
              }
            }),
          ),
        ),
    );

    it.effect(
      "notification operations reject foreign, expired, and incomplete transaction contexts",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const a = yield* boundTo(workspaceId);
              const b = yield* boundTo(otherWorkspaceId);
              yield* initialized(a);
              yield* initialized(b);
              const value = record("guarded");
              const expired = yield* a.store.transaction(Effect.context<Store.Transaction>());
              const native = Context.get(expired, Store.Transaction);
              const failures = [
                a.notifications.get(value.id).pipe(Effect.provide(expired)),
                a.notifications.listByRecipient(human, page).pipe(Effect.provide(expired)),
                a.notifications.listPendingByRecipient(human, page).pipe(Effect.provide(expired)),
                a.notifications.insert(value).pipe(Effect.provide(expired)),
                a.notifications
                  .insert(value)
                  .pipe(Effect.provideService(Store.Transaction, native)),
                a.store.transaction(b.notifications.get(value.id)),
                a.store.transaction(b.notifications.listByRecipient(human, page)),
                a.store.transaction(
                  b.notifications.insert(record("guarded", { workspaceId: otherWorkspaceId })),
                ),
              ];
              for (const operation of failures) {
                expect(yield* Effect.flip(operation)).toMatchObject({
                  _tag: "NotificationStore.Failure",
                });
              }
              expect(yield* a.notifications.get(value.id)).toEqual(Option.none());
              expect(yield* b.notifications.get(value.id)).toEqual(Option.none());
            }),
          ),
        ),
    );

    it.effect("notification storage isolates input and returned nested records from mutation", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            yield* initialized(bound);
            const input = record("isolated");
            yield* bound.store.transaction(bound.notifications.insert(input));
            Reflect.set(input.source, "entryId", "changed");
            Reflect.set(input.recipient, "id", "changed");
            const found = Option.getOrThrow(yield* bound.notifications.get(input.id));
            expect(found).toEqual(record("isolated"));
            Reflect.set(found.recipient, "id", "changed-again");
            const [listed] = yield* bound.notifications.listByRecipient(human, page);
            if (listed === undefined) return yield* Effect.die("Expected a notification");
            Reflect.set(listed.state, "_tag", "Changed");
            expect(yield* bound.notifications.get(input.id)).toEqual(
              Option.some(record("isolated")),
            );
          }),
        ),
      ),
    );

    it.effect(
      "gateway notification reads enforce recipient and workspace isolation with real pagination",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const a = yield* boundTo(workspaceId);
              const b = yield* boundTo(otherWorkspaceId);
              const workspace = yield* initialized(a, humanIdentity.id);
              const other = yield* initialized(b, humanIdentity.id);
              const owner = Notification.ofMember(workspace.ownerMemberId, humanIdentity);
              const agentMemberId = Member.Id.make("notification-agent");
              const first = record("a", { recipient: owner });
              const second = record("b", { recipient: owner });
              const forAgent = record("agent", {
                recipient: Notification.ofMember(agentMemberId, agentIdentity),
              });
              const forAnother = record("another", { recipient: another });
              // The same person under an earlier membership: someone who left and was invited back.
              const earlier = record("earlier", {
                recipient: Notification.ofMember(Member.Id.make("earlier-member"), humanIdentity),
              });
              const foreign = record("a", {
                workspaceId: otherWorkspaceId,
                recipient: Notification.ofMember(other.ownerMemberId, humanIdentity),
              });
              yield* a.store.transaction(
                Effect.gen(function* () {
                  yield* a.members.insert({
                    id: agentMemberId,
                    workspaceId,
                    identity: agentIdentity,
                    status: "active",
                  });
                  yield* Effect.forEach(
                    [second, forAnother, earlier, forAgent, first],
                    a.notifications.insert,
                  );
                }),
              );
              yield* b.store.transaction(b.notifications.insert(foreign));
              const before = yield* a.store.read(Entry.LogId.make("journal"), { limit: 20 });
              const gateway = yield* Gateway.make().pipe(
                Effect.provide(
                  Layer.mergeAll(
                    harness.crypto,
                    layerManualBackgroundJobs,
                    WorkspaceTurnJobs.layerNoRunner,
                  ),
                ),
              );
              yield* gateway.asMember(
                workspaceId,
                humanIdentity,
                Effect.gen(function* () {
                  const notificationService = yield* NotificationService.Service;
                  expect(yield* notificationService.get(first.id)).toEqual(first);
                  expect(yield* notificationService.list({ limit: 1 })).toEqual([first]);
                  expect(yield* notificationService.list(page)).toEqual([first, second]);
                  expect(yield* notificationService.listPending(page)).toEqual([first, second]);
                  const options = {
                    limit: 1,
                    after: { recordedAt: first.recordedAt, id: first.id },
                  };
                  expect(yield* notificationService.list(options)).toEqual([second]);
                  expect(yield* notificationService.listPending(options)).toEqual([second]);
                }),
              );
              const list = Effect.flatMap(NotificationService.Service, (notificationService) =>
                notificationService.list(page),
              );
              expect(yield* gateway.asMember(workspaceId, agentIdentity, list)).toEqual([forAgent]);
              expect(yield* gateway.asMember(otherWorkspaceId, humanIdentity, list)).toEqual([
                foreign,
              ]);
              for (const id of [
                forAgent.id,
                forAnother.id,
                earlier.id,
                Notification.Id.make("missing"),
              ]) {
                const get = Effect.flatMap(NotificationService.Service, (notificationService) =>
                  notificationService.get(id),
                );
                expect(
                  yield* Effect.flip(gateway.asMember(workspaceId, humanIdentity, get)),
                ).toMatchObject({
                  _tag: "NotificationService.NotFound",
                  workspaceId,
                  notificationId: id,
                });
              }
              expect(
                yield* Effect.flip(gateway.asMember(workspaceId, anotherIdentity, list)),
              ).toMatchObject({
                _tag: "Gateway.NotMember",
              });
              expect(yield* a.store.read(Entry.LogId.make("journal"), { limit: 20 })).toEqual(
                before,
              );
              yield* a.store.transaction(a.members.markRemoved(workspace.ownerMemberId));
              expect(
                yield* Effect.flip(gateway.asMember(workspaceId, humanIdentity, list)),
              ).toMatchObject({
                _tag: "Gateway.NotMember",
              });
              expect(yield* gateway.asMember(otherWorkspaceId, humanIdentity, list)).toEqual([
                foreign,
              ]);
            }).pipe(Effect.scoped),
          ),
        ),
    );

    it.effect(
      "notification application reads see staged inserts in the outer commit and respect rollback",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const workspace = yield* initialized(bound, humanIdentity.id);
              const actor = Actor.Value.make({
                workspaceId,
                memberId: workspace.ownerMemberId,
                identity: humanIdentity,
              });
              const value = record("staged", {
                recipient: Notification.ofMember(actor.memberId, humanIdentity),
              });
              yield* Effect.gen(function* () {
                const notificationService = yield* NotificationService.Service;
                const journal = yield* Journal.Service;
                expect(
                  yield* Effect.flip(
                    journal.commit(
                      Effect.gen(function* () {
                        yield* bound.notifications.insert(value);
                        expect(yield* notificationService.get(value.id)).toEqual(value);
                        expect(yield* notificationService.list(page)).toEqual([value]);
                        expect(yield* notificationService.listPending(page)).toEqual([value]);
                        return yield* Effect.fail("rollback");
                      }),
                    ),
                  ),
                ).toBe("rollback");
                expect(yield* notificationService.list(page)).toEqual([]);
                expect(yield* Effect.flip(notificationService.get(value.id))).toMatchObject({
                  _tag: "NotificationService.NotFound",
                });
                yield* journal.commit(bound.notifications.insert(value));
                expect(yield* notificationService.get(value.id)).toEqual(value);
              }).pipe(Effect.provide(core(bound)), Effect.provideService(Actor.Service, actor));
            }),
          ),
        ),
    );

    it.effect("settling an ended participation discards only its pending agent input", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            yield* initialized(bound);
            const participationId = ThreadParticipation.Id.make("ended");
            const input = record("agent-input", { recipient: agent, participationId });
            const kept = [
              record("human-input", { recipient: human, participationId }),
              record("other-participation", {
                recipient: agent,
                participationId: ThreadParticipation.Id.make("other"),
              }),
              record("unrelated", { recipient: agent }),
            ];
            yield* bound.store.transaction(bound.notifications.insertMany([input, ...kept]));
            yield* bound.store.transaction(
              bound.notifications.discardPendingForParticipation(participationId),
            );
            expect(yield* bound.notifications.get(input.id)).toEqual(
              Option.some(
                Object.assign({}, input, {
                  state: { _tag: "Discarded", reason: "participation-ended" },
                }),
              ),
            );
            for (const note of kept)
              expect(yield* bound.notifications.get(note.id)).toEqual(Option.some(note));
            // Settling again finds nothing pending and changes nothing.
            yield* bound.store.transaction(
              bound.notifications.discardPendingForParticipation(participationId),
            );
            expect(yield* bound.notifications.listPendingByRecipient(agent, page)).toEqual(
              kept.filter((note) => note.recipient._tag === "Agent"),
            );
          }),
        ),
      ),
    );

    it.effect(
      "settling a group departure discards only the member's pending notifications from it: a person's unseen ones, and an agent's input",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              yield* initialized(bound);
              const from = (groupId: string, sequence: number) => ({
                thread: {
                  threadId: Thread.Id.make(`thread-${groupId}`),
                  groupId: Group.Id.make(groupId),
                  sequence,
                },
              });
              const settled = [
                record("left-first", from("left", 1)),
                record("left-second", from("left", 2)),
              ];
              const seen = record("left-seen", from("left", 3));
              const kept = [
                record("elsewhere", from("kept", 1)),
                record("someone-else", { ...from("left", 4), recipient: another }),
                record("agent-there", { ...from("left", 5), recipient: agent }),
                record("agent-elsewhere", { ...from("kept", 6), recipient: agent }),
                record("no-thread"),
              ];
              yield* bound.store.transaction(
                bound.notifications.insertMany([...settled, seen, ...kept]),
              );
              yield* bound.notifications.markSeen([seen.id], recordedAt);
              const before = yield* bound.notifications.get(seen.id);
              const leave = bound.store.transaction(
                bound.notifications.discardPendingForGroup(
                  Member.Id.make("recipient-member"),
                  Group.Id.make("left"),
                ),
              );
              yield* leave;
              for (const note of settled)
                expect(yield* bound.notifications.get(note.id)).toEqual(
                  Option.some(
                    Object.assign({}, note, {
                      state: { _tag: "Discarded", reason: "access-lost" },
                    }),
                  ),
                );
              // What was seen stays as it was seen; others' notifications are untouched.
              expect(yield* bound.notifications.get(seen.id)).toEqual(before);
              for (const note of kept)
                expect(yield* bound.notifications.get(note.id)).toEqual(Option.some(note));
              expect(yield* bound.notifications.countPendingByRecipient(human)).toBe(2);
              // Settling again finds nothing pending and changes nothing.
              yield* leave;
              expect(yield* bound.notifications.countPendingByRecipient(human)).toBe(2);
              // An agent's departure ends its participation there, and with it its pending input.
              yield* bound.store.transaction(
                bound.notifications.discardPendingForGroup(
                  Member.Id.make("agent-member"),
                  Group.Id.make("left"),
                ),
              );
              const [agentThere, agentElsewhere] = kept.filter(
                (note) => note.recipient._tag === "Agent",
              );
              expect(yield* bound.notifications.get(agentThere!.id)).toEqual(
                Option.some(
                  Object.assign({}, agentThere, {
                    state: { _tag: "Discarded", reason: "participation-ended" },
                  }),
                ),
              );
              expect(yield* bound.notifications.get(agentElsewhere!.id)).toEqual(
                Option.some(agentElsewhere),
              );
            }),
          ),
        ),
    );

    it.effect("leaving a group settles what was pending from it, and nothing from elsewhere", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const gateway = yield* Gateway.Service;
            const alice = Identity.Reference.cases.Human.make({
              id: Identity.HumanId.make("alice"),
            });
            const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
            const workspace = yield* createWorkspace(alice.id);
            const asAlice = <A, E, R extends Core.Operations | Actor.Service>(
              program: Effect.Effect<A, E, R>,
            ) => gateway.asMember(workspace.id, alice, program);
            const asBob = <A, E, R extends Core.Operations | Actor.Service>(
              program: Effect.Effect<A, E, R>,
            ) => gateway.asMember(workspace.id, bob, program);
            const invitation = yield* invite(workspace.id, alice, {
              recipientId: bob.id,
              roleId: BuiltinRoles.MemberId,
              expiresAt: yield* future,
            });
            const member = yield* acceptInvitation(workspace.id, bob.id, invitation.details.id);
            const create = (name: string) =>
              asAlice(
                GroupService.Service.use((groups) =>
                  groups.createTeam({ name, memberIds: [workspace.ownerMemberId, member.id] }),
                ),
              );
            const mention = (groupId: Group.Id) =>
              asAlice(
                ThreadService.Service.use((threads) =>
                  threads.startInGroup({ groupId, text: "Bob?", mentions: [member.id] }),
                ),
              );
            const count = asBob(
              NotificationService.Service.use((notifications) => notifications.countPending),
            );
            const left = yield* create("Left");
            const kept = yield* create("Kept");
            yield* mention(left.id);
            yield* mention(left.id);
            yield* mention(kept.id);
            expect(yield* count).toBe(3);
            const [admission] = (yield* asBob(
              GroupMembershipService.Service.use((memberships) =>
                memberships.listCurrent(left.id, page),
              ),
            )).filter((value) => value.memberId === member.id);
            yield* asBob(
              GroupMembershipService.Service.use((memberships) =>
                memberships.leave({ groupId: left.id, membershipId: admission!.id }),
              ),
            );
            // What he can no longer open stops waiting for him, and stays as history.
            expect(yield* count).toBe(1);
            const all = yield* asBob(
              NotificationService.Service.use((notifications) => notifications.list(page)),
            );
            const settledIn = (groupId: Group.Id) =>
              all.filter((note) => note.thread?.groupId === groupId).map((note) => note.state);
            expect(settledIn(left.id)).toEqual([
              { _tag: "Discarded", reason: "access-lost" },
              { _tag: "Discarded", reason: "access-lost" },
            ]);
            expect(settledIn(kept.id)).toEqual([{ _tag: "Pending" }]);
          }),
        ),
      ),
    );

    it.effect("someone invited back after removal starts with an empty inbox", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const gateway = yield* Gateway.Service;
            const alice = Identity.Reference.cases.Human.make({
              id: Identity.HumanId.make("alice"),
            });
            const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
            const workspace = yield* createWorkspace(alice.id);
            const asAlice = <A, E, R extends Core.Operations | Actor.Service>(
              program: Effect.Effect<A, E, R>,
            ) => gateway.asMember(workspace.id, alice, program);
            const asBob = <A, E, R extends Core.Operations | Actor.Service>(
              program: Effect.Effect<A, E, R>,
            ) => gateway.asMember(workspace.id, bob, program);
            const join = Effect.gen(function* () {
              const invitation = yield* invite(workspace.id, alice, {
                recipientId: bob.id,
                roleId: BuiltinRoles.MemberId,
                expiresAt: yield* future,
              });
              return yield* acceptInvitation(workspace.id, bob.id, invitation.details.id);
            });
            const mention = (groupId: Group.Id, memberId: Member.Id) =>
              asAlice(
                ThreadService.Service.use((threads) =>
                  threads.startInGroup({ groupId, text: "Bob?", mentions: [memberId] }),
                ),
              );
            const pending = asBob(
              NotificationService.Service.use((notifications) => notifications.listPending(page)),
            );
            const sidebar = asBob(GroupService.Service.use((groups) => groups.listMine(page)));
            const first = yield* join;
            const group = yield* asAlice(
              GroupService.Service.use((groups) =>
                groups.createTeam({
                  name: "Private",
                  memberIds: [workspace.ownerMemberId, first.id],
                }),
              ),
            );
            yield* mention(group.id, first.id);
            expect(yield* pending).toHaveLength(1);
            yield* removeMember(workspace.id, alice, first.id);
            // Invited back, Bob is a new member, and his earlier membership's inbox stays with it.
            const second = yield* join;
            expect(second.id).not.toBe(first.id);
            expect(yield* pending).toEqual([]);
            yield* asAlice(
              GroupMembershipService.Service.use((memberships) =>
                memberships.add({ groupId: group.id, memberId: second.id }),
              ),
            );
            // General and Private: nothing waits in either.
            expect((yield* sidebar).map(({ pending }) => pending)).toEqual([0, 0]);
            // What reaches his new membership is his.
            const again = yield* mention(group.id, second.id);
            const [notification] = yield* pending;
            expect(notification).toMatchObject({
              recipient: { _tag: "Human", id: bob.id, memberId: second.id },
              thread: { threadId: again.thread.id },
            });
            // Private, then general by group ID.
            expect((yield* sidebar).map(({ pending }) => pending)).toEqual([1, 0]);
          }),
        ),
      ),
    );
  });
};
