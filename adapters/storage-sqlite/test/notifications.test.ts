import { expect, test as it } from "bun:test";
import { Actor, Identity } from "@amends/core/identity";
import { Entry, Journal, Store } from "@amends/core/journal";
import {
  Notification,
  NotificationApplication,
  NotificationStore,
} from "@amends/core/notification";
import { Member, type Workspace } from "@amends/core/workspace";
import { Gateway, WorkspaceEvents, WorkspaceStorage } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { Context, DateTime, Effect, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqliteStorage } from "../src/index.ts";
import {
  bind,
  core,
  initialized,
  inDatabase,
  otherWorkspaceId,
  temporary as withDatabase,
  workspaceId,
} from "./support.ts";

const boundTo = Effect.fnUntraced(function* (id: Workspace.Id) {
  const storage = yield* SqliteStorage.make();
  const context = yield* storage.forWorkspace(id);
  const notifications = yield* Effect.serviceOption(NotificationStore.Service).pipe(
    Effect.provide(context),
  );
  if (Option.isNone(notifications))
    return yield* Effect.die("Workspace storage must provide notifications");
  return { ...bind(context), notifications: notifications.value };
});
const human = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("recipient") });
const agent = Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("recipient") });
const another = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("another") });
const recordedAt = DateTime.makeUnsafe("2026-09-19T12:00:00.123Z");
const record = (id: string, overrides: Partial<Notification.Record> = {}): Notification.Record => ({
  id: Notification.Id.make(id),
  workspaceId,
  source: { logId: Entry.LogId.make("journal"), entryId: Entry.Id.make(`source-${id}`) },
  recipient: { ...human },
  recordedAt,
  state: { _tag: "Pending" },
  ...overrides,
});
const page = { limit: 20 };

it("notification storage persists across reopening and isolates workspaces and recipient kinds", async () =>
  withDatabase(async (location) => {
    const one = record("same-id");
    const two = record("agent", { source: one.source, recipient: agent });
    const three = record("another", { source: one.source, recipient: another });
    const foreign = record("same-id", { workspaceId: otherWorkspaceId });
    await inDatabase(
      location,
      Effect.gen(function* () {
        const a = yield* boundTo(workspaceId);
        const b = yield* boundTo(otherWorkspaceId);
        yield* initialized(a);
        yield* initialized(b);
        yield* a.store.transaction(Effect.forEach([one, two, three], a.notifications.insert));
        yield* b.store.transaction(b.notifications.insert(foreign));
      }),
    );
    await inDatabase(
      location,
      Effect.gen(function* () {
        const a = yield* boundTo(workspaceId);
        const b = yield* boundTo(otherWorkspaceId);
        expect(yield* a.notifications.get(one.id)).toEqual(Option.some(one));
        expect(yield* b.notifications.get(one.id)).toEqual(Option.some(foreign));
        expect(yield* b.notifications.get(two.id)).toEqual(Option.none());
        expect(yield* a.notifications.get(Notification.Id.make("absent"))).toEqual(Option.none());
        expect(yield* a.notifications.listByRecipient(human, page)).toEqual([one]);
        expect(yield* a.notifications.listPendingByRecipient(agent, page)).toEqual([two]);
        expect(yield* a.notifications.listByRecipient(another, page)).toEqual([three]);
        expect(yield* b.notifications.listPendingByRecipient(human, page)).toEqual([foreign]);
      }),
    );
  }));

it("both notification lists paginate exclusively by instant and binary ID order", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
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
  ));

it("notification uniqueness rejects reused IDs and duplicate source-recipient associations", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
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
            yield* Effect.flip(bound.store.transaction(bound.notifications.insert(duplicate))),
          ).toMatchObject({ _tag: "NotificationStore.Conflict", operation: "insert" });
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
  ));

it("competing notification insertions produce only one source-recipient record", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* boundTo(workspaceId);
        yield* initialized(bound);
        const first = record("first");
        const second = record("second", { source: first.source });
        const outcomes = yield* Effect.forEach(
          [first, second],
          (input) =>
            bound.store
              .transaction(bound.notifications.insert(input))
              .pipe(
                Effect.match({ onSuccess: () => "Inserted", onFailure: (error) => error._tag }),
              ),
          { concurrency: "unbounded" },
        );
        expect(outcomes.sort()).toEqual(["Inserted", "NotificationStore.Conflict"]);
        expect(yield* bound.notifications.listPendingByRecipient(human, page)).toHaveLength(1);
      }),
    ),
  ));

it("notifications, source entries, and checkpoints share staged reads and rollback", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* boundTo(workspaceId);
        yield* initialized(bound);
        const sourceLog = Entry.LogId.make("notification-source");
        const key = { logId: sourceLog, name: "notification-contract", version: 1 };
        const write = Effect.gen(function* () {
          const native = yield* Store.Transaction;
          const [entry] = yield* native.append({
            logId: sourceLog,
            entries: [{ payload: new Uint8Array([1]) }],
          });
          if (entry === undefined) return yield* Effect.die("Expected a source entry");
          const value = record("atomic", { source: { logId: entry.logId, entryId: entry.id } });
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
  ));

it("invalid notification writes conflict before conversion without poisoning the transaction", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* boundTo(workspaceId);
        yield* initialized(bound);
        const corrupt: ReadonlyArray<(value: Notification.Record) => void> = [
          (value) => Reflect.set(value, "id", ""),
          (value) => Reflect.set(value, "workspaceId", otherWorkspaceId),
          (value) => Reflect.set(value.source, "logId", ""),
          (value) => Reflect.set(value.source, "entryId", ""),
          (value) => Reflect.set(value.recipient, "_tag", "Contact"),
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
        expect(yield* bound.notifications.listByRecipient(human, page)).toEqual([record("valid")]);
      }),
    ),
  ));

it("notification reads reject invalid paging and recipient input as typed failures", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* boundTo(workspaceId);
        yield* initialized(bound);
        const badCursor = { recordedAt, id: Notification.Id.make("cursor") };
        Reflect.set(badCursor, "recordedAt", "not-a-date");
        const badRecipient = { ...human };
        Reflect.set(badRecipient, "_tag", "Contact");
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
      }),
    ),
  ));

it("notification operations reject foreign, expired, and incomplete transaction contexts", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
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
          a.notifications.insert(value).pipe(Effect.provideService(Store.Transaction, native)),
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
  ));

it("notification storage isolates input and returned nested records from mutation", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
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
        expect(yield* bound.notifications.get(input.id)).toEqual(Option.some(record("isolated")));
      }),
    ),
  ));

it("malformed persisted notifications fail reads instead of returning invalid records", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* boundTo(workspaceId);
        yield* initialized(bound);
        const value = record("malformed");
        yield* bound.store.transaction(bound.notifications.insert(value));
        const sql = yield* SqlClient.SqlClient;
        yield* sql`UPDATE notifications SET record = json_set(record, '$.source.entryId', '') WHERE workspace_id = ${workspaceId} AND id = ${value.id}`;
        const reads: ReadonlyArray<Effect.Effect<unknown, NotificationStore.Failure>> = [
          bound.notifications.get(value.id),
          bound.notifications.listByRecipient(human, page),
          bound.notifications.listPendingByRecipient(human, page),
        ];
        for (const operation of reads) {
          expect(yield* Effect.flip(operation)).toMatchObject({
            _tag: "NotificationStore.Failure",
          });
        }
      }),
    ),
  ));

it("gateway notification reads enforce recipient and workspace isolation with real pagination", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const a = yield* boundTo(workspaceId);
        const b = yield* boundTo(otherWorkspaceId);
        const workspace = yield* initialized(a, human.id);
        yield* initialized(b, human.id);
        const first = record("a");
        const second = record("b");
        const forAgent = record("agent", { recipient: agent });
        const forAnother = record("another", { recipient: another });
        const foreign = record("a", { workspaceId: otherWorkspaceId });
        yield* a.store.transaction(
          Effect.gen(function* () {
            yield* a.members.insert({
              id: Member.Id.make("notification-agent"),
              workspaceId,
              identity: agent,
              status: "active",
            });
            yield* Effect.forEach([second, forAnother, forAgent, first], a.notifications.insert);
          }),
        );
        yield* b.store.transaction(b.notifications.insert(foreign));
        const before = yield* a.store.read(Entry.LogId.make("journal"), { limit: 20 });
        const gateway = yield* Gateway.make().pipe(
          Effect.provideService(WorkspaceStorage.Service, yield* SqliteStorage.make()),
          Effect.provide(BunCrypto.layer),
        );
        yield* gateway.asMember(
          workspaceId,
          human,
          Effect.gen(function* () {
            const notifications = yield* NotificationApplication.Service;
            expect(yield* notifications.get(first.id)).toEqual(first);
            expect(yield* notifications.list({ limit: 1 })).toEqual([first]);
            const options = { limit: 1, after: { recordedAt: first.recordedAt, id: first.id } };
            expect(yield* notifications.list(options)).toEqual([second]);
            expect(yield* notifications.listPending(options)).toEqual([second]);
          }),
        );
        const list = Effect.flatMap(NotificationApplication.Service, (notifications) =>
          notifications.list(page),
        );
        expect(yield* gateway.asMember(workspaceId, agent, list)).toEqual([forAgent]);
        expect(yield* gateway.asMember(otherWorkspaceId, human, list)).toEqual([foreign]);
        for (const id of [forAgent.id, forAnother.id, Notification.Id.make("missing")]) {
          const get = Effect.flatMap(NotificationApplication.Service, (notifications) =>
            notifications.get(id),
          );
          expect(yield* Effect.flip(gateway.asMember(workspaceId, human, get))).toMatchObject({
            _tag: "NotificationApplication.NotFound",
            workspaceId,
            notificationId: id,
          });
        }
        expect(yield* Effect.flip(gateway.asMember(workspaceId, another, list))).toMatchObject({
          _tag: "Gateway.NotMember",
        });
        expect(yield* a.store.read(Entry.LogId.make("journal"), { limit: 20 })).toEqual(before);
        yield* a.store.transaction(a.members.markRemoved(workspace.ownerMemberId));
        expect(yield* Effect.flip(gateway.asMember(workspaceId, human, list))).toMatchObject({
          _tag: "Gateway.NotMember",
        });
        expect(yield* gateway.asMember(otherWorkspaceId, human, list)).toEqual([foreign]);
      }).pipe(Effect.scoped, Effect.provide(WorkspaceEvents.layer())),
    ),
  ));

it("notification application reads see staged inserts in the outer commit and respect rollback", async () =>
  withDatabase(async (location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* boundTo(workspaceId);
        const workspace = yield* initialized(bound, human.id);
        const actor = Actor.Value.make({
          workspaceId,
          memberId: workspace.ownerMemberId,
          identity: human,
        });
        const value = record("staged");
        yield* Effect.gen(function* () {
          const notifications = yield* NotificationApplication.Service;
          const journal = yield* Journal.Service;
          expect(
            yield* Effect.flip(
              journal.commit(
                Effect.gen(function* () {
                  yield* bound.notifications.insert(value);
                  expect(yield* notifications.get(value.id)).toEqual(value);
                  expect(yield* notifications.list(page)).toEqual([value]);
                  expect(yield* notifications.listPending(page)).toEqual([value]);
                  return yield* Effect.fail("rollback");
                }),
              ),
            ),
          ).toBe("rollback");
          expect(yield* notifications.list(page)).toEqual([]);
          expect(yield* Effect.flip(notifications.get(value.id))).toMatchObject({
            _tag: "NotificationApplication.NotFound",
          });
          yield* journal.commit(bound.notifications.insert(value));
          expect(yield* notifications.get(value.id)).toEqual(value);
        }).pipe(Effect.provide(core(bound)), Effect.provideService(Actor.Service, actor));
      }),
    ),
  ));
