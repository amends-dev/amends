import { Codec, Event, Fact, Journal, Log, Publication, Store } from "@amends/core/journal";
import { Effect, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Identity } from "@amends/core/identity";
import { boundTo } from "./support.ts";
import { Subject } from "@amends/core/journal";
import { describe, it, expect } from "@effect/vitest";
import {
  setup,
  views,
  core,
  inDatabase,
  workspaceId,
  otherWorkspaceId,
  testProvenance,
} from "./support.ts";

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  const testSubject = () => Subject.make("test", "entity");
  const logId = Log.Id.make("journal");
  const Changed = Fact.make("storage.changed", {
    subject: testSubject,
    version: 1,
    payload: Schema.String,
  });
  const Changed2 = Fact.make(Changed.name, {
    subject: testSubject,
    version: 2,
    payload: Schema.String,
  });
  const Other = Fact.make("storage.other", {
    subject: testSubject,
    version: 1,
    payload: Schema.String,
  });
  it.effect(
    "fact metadata is stored in columns and indexed reads page matching entries across versions and commits",
    () =>
      withDatabase((location) =>
        Effect.gen(function* () {
          const events = yield* inDatabase(
            location,
            Effect.gen(function* () {
              const bound = yield* (yield* views()).forWorkspace(workspaceId);
              return yield* Effect.gen(function* () {
                const journal = yield* Journal.Service;
                const events = yield* journal.commit(
                  Effect.gen(function* () {
                    const first = yield* journal.publish(Changed, "first");
                    yield* journal.publish(Other, "noise");
                    const second = yield* journal.publish(Changed2, "second");
                    return [first, second] as const;
                  }),
                );
                const third = yield* journal.publish(Changed, "third");
                const rows =
                  yield* (yield* SqlClient.SqlClient)`SELECT fact_name, fact_version, payload FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${logId} ORDER BY position, entry_index`;
                expect(rows.map((row) => row.fact_name)).toEqual([
                  Changed.name,
                  Other.name,
                  Changed.name,
                  Changed.name,
                ]);
                expect(rows.map((row) => row.fact_version)).toEqual([1, 1, 2, 1]);
                expect(rows[0]?.payload).toEqual(yield* Codec.make(Changed).encode("first"));
                const first = (yield* journal.read({ name: Changed.name, limit: 1 }))[0];
                if (first === undefined) return yield* Effect.die("Missing first event");
                const next = yield* journal.read({ name: Changed.name, after: first, limit: 2 });
                expect(next.map((entry) => entry.id)).toEqual([events[1].id, third.id]);
                expect(
                  (yield* journal.read({ name: Changed.name, version: 1, limit: 10 })).map(
                    (entry) => entry.id,
                  ),
                ).toEqual([events[0].id, third.id]);
                expect(yield* journal.read({ name: Changed.name, after: third, limit: 1 })).toEqual(
                  [],
                );
                expect((yield* journal.log.read({ limit: 1 }))[0]?.entries).toHaveLength(3);
                const other = yield* Journal.make({
                  logId: Log.Id.make("another"),
                  projections: [],
                });
                yield* other.publish(Changed, "other log");
                expect(yield* journal.read({ name: Changed.name, limit: 10 })).toHaveLength(3);
                const foreign = yield* (yield* views()).forWorkspace(otherWorkspaceId);
                expect(
                  yield* foreign.store.readFacts(logId, { name: Changed.name, limit: 10 }),
                ).toEqual([]);
                const execution = (yield* Log.Service).open({
                  id: Log.Id.make("execution"),
                  schema: Schema.String,
                });
                yield* execution.append("plain");
                expect(
                  yield* bound.store.readFacts(execution.id, { name: Changed.name, limit: 10 }),
                ).toEqual([]);
                return [...events, third] as const;
              }).pipe(
                Effect.provideService(Publication.Service, testProvenance(workspaceId)),
                Effect.provide(core(bound)),
              );
            }),
          );
          yield* inDatabase(
            location,
            Effect.gen(function* () {
              const bound = yield* (yield* views()).forWorkspace(workspaceId);
              const stored = yield* bound.store.readFacts(logId, { name: Changed.name, limit: 10 });
              expect(stored.map((entry) => entry.id)).toEqual(events.map((event) => event.id));
              for (const [index, entry] of stored.entries()) {
                const expected = events[index];
                if (expected === undefined) return yield* Effect.die("Unexpected stored entry");
                const decoded = yield* Event.storageCodec.decode(entry);
                expect(decoded.provenance).toEqual(expected.provenance);
                expect(yield* Codec.make(Changed).decode(entry.payload)).toBe(expected.payload);
              }
            }),
          );
        }),
      ),
  );

  it.effect(
    "native idempotency compares fact metadata and rejects foreign provenance before writing",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const bound = yield* (yield* views()).forWorkspace(workspaceId);
            const provenance = testProvenance(workspaceId);
            const content = {
              fact: { subject: testSubject(), name: Changed.name, version: 1, provenance },
              payload: yield* Codec.make(Changed).encode("same"),
            };
            const key = Log.IdempotencyKey.make("native-fact");
            const append = (entry: Store.Content) =>
              bound.store.transaction(
                Effect.flatMap(Store.Transaction, (native) =>
                  native.append({ logId, entries: [entry], idempotencyKey: key }),
                ),
              );
            const original = yield* append(content);
            expect(yield* append(content)).toEqual(original);
            for (const fact of [
              { ...content.fact, name: Other.name },
              { ...content.fact, version: 2 },
              { ...content.fact, subject: Subject.make("test", "another") },
              {
                ...content.fact,
                provenance: Object.assign({}, provenance, {
                  correlationId: Event.CorrelationId.make("different"),
                }),
              },
            ]) {
              expect((yield* Effect.flip(append({ ...content, fact })))._tag).toBe(
                "JournalStore.Conflict",
              );
            }
            const foreign = {
              ...content,
              fact: {
                ...content.fact,
                provenance: Object.assign({}, provenance, { workspaceId: otherWorkspaceId }),
              },
            };
            expect((yield* Effect.flip(append(foreign)))._tag).toBe("JournalStore.Conflict");
            const missingAttribution = { ...content, fact: { ...content.fact } };
            Reflect.deleteProperty(missingAttribution.fact, "provenance");
            expect((yield* Effect.flip(append(missingAttribution)))._tag).toBe(
              "JournalStore.Conflict",
            );
            const missingSubject = { ...content, fact: { ...content.fact } };
            Reflect.deleteProperty(missingSubject.fact, "subject");
            expect((yield* Effect.flip(append(missingSubject)))._tag).toBe("JournalStore.Conflict");
            const nullAttribution = { ...content, fact: { ...content.fact } };
            Reflect.set(nullAttribution.fact, "provenance", null);
            expect((yield* Effect.flip(append(nullAttribution)))._tag).toBe(
              "JournalStore.Conflict",
            );
            expect(Option.isSome(yield* bound.store.getAppend(logId, key))).toBe(true);
            expect(
              yield* bound.store.readFacts(logId, { name: Changed.name, limit: 10 }),
            ).toHaveLength(1);
          }),
        ),
      ),
  );

  it.effect(
    "subject reads span fact names, preserve entry cursors, and persist contact attribution",
    () =>
      withDatabase((location) =>
        Effect.gen(function* () {
          const Payload = Schema.Struct({ threadId: Schema.NonEmptyString, text: Schema.String });
          const subject = (payload: typeof Payload.Type) =>
            Subject.make("thread", payload.threadId);
          const Message = Fact.make("thread.message", { version: 1, payload: Payload, subject });
          const Activity = Fact.make("thread.activity", { version: 1, payload: Payload, subject });
          const target = subject({ threadId: "one", text: "" });
          const contact = Identity.Reference.cases.Contact.make({
            id: Identity.ContactId.make("external-author"),
          });
          const events = yield* inDatabase(
            location,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              return yield* Effect.gen(function* () {
                const journal = yield* Journal.Service;
                const saved = yield* journal.commit(
                  Effect.gen(function* () {
                    const first = yield* journal.publish(Message, {
                      threadId: "one",
                      text: "first",
                    });
                    yield* journal.publish(Message, { threadId: "two", text: "unrelated" });
                    const second = yield* journal.publish(Activity, {
                      threadId: "one",
                      text: "second",
                    });
                    return [first, second] as const;
                  }),
                );
                const third = yield* journal.publish(Message, { threadId: "one", text: "third" });
                const all = [...saved, third];
                for (const event of all) {
                  expect(event.subject).toBe(target);
                  expect(event.provenance.performedBy).toEqual({
                    _tag: "Identity",
                    identity: contact,
                  });
                }
                let after: Store.Cursor | undefined;
                for (const event of all) {
                  const page = yield* journal.read({
                    subject: target,
                    limit: 1,
                    ...(after === undefined ? {} : { after }),
                  });
                  expect(page.map((entry) => entry.id)).toEqual([event.id]);
                  after = event;
                }
                expect(yield* journal.read({ subject: target, limit: 1, after })).toEqual([]);
                expect(
                  (yield* journal.read({ subject: target, name: Activity.name, limit: 10 })).map(
                    (entry) => entry.id,
                  ),
                ).toEqual([saved[1].id]);
                expect(
                  yield* journal.read({ subject: Subject.make("member", "one"), limit: 10 }),
                ).toEqual([]);
                expect((yield* journal.log.read({ limit: 1 }))[0]?.entries).toHaveLength(3);
                const other = yield* Journal.make({
                  logId: Log.Id.make("other-subject-log"),
                  projections: [],
                });
                yield* other.publish(Message, { threadId: "one", text: "other log" });
                expect(yield* journal.read({ subject: target, limit: 10 })).toHaveLength(3);
                const foreign = yield* boundTo(otherWorkspaceId);
                expect(
                  yield* foreign.store.readFacts(logId, { subject: target, limit: 10 }),
                ).toEqual([]);
                const plain = (yield* Log.Service).open({ id: logId, schema: Schema.String });
                yield* plain.append("execution");
                expect(yield* journal.read({ subject: target, limit: 10 })).toHaveLength(3);
                return all;
              }).pipe(
                Effect.provideService(
                  Publication.Service,
                  Object.assign({}, testProvenance(workspaceId), {
                    performedBy: { _tag: "Identity" as const, identity: contact },
                  }),
                ),
                Effect.provide(core(bound)),
              );
            }),
          );
          yield* inDatabase(
            location,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const entries = yield* bound.store.readFacts(logId, { subject: target, limit: 10 });
              expect(entries.map((entry) => entry.id)).toEqual(events.map((event) => event.id));
              for (const entry of entries) {
                expect(entry.fact?.subject).toBe(target);
                expect(entry.fact?.provenance.performedBy).toEqual({
                  _tag: "Identity",
                  identity: contact,
                });
              }
              const rows =
                yield* (yield* SqlClient.SqlClient)`SELECT subject FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${logId} AND subject = ${target}`;
              expect(rows).toHaveLength(3);
            }),
          );
        }),
      ),
  );
});
