import { Identity } from "@amends-dev/core/identity";
import {
  Codec,
  Event,
  Fact,
  Journal,
  Log,
  Publication,
  Store,
  Subject,
} from "@amends-dev/core/journal";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import type { Fixture } from "./fixture.ts";
import {
  forWorkspace,
  journalLog,
  otherWorkspaceId,
  Support,
  testProvenance,
  workspaceId,
} from "./support.ts";

const testSubject = () => Subject.make("test", "entity");
/** Facts the fact-metadata suites publish; adapters' own tests may inspect how they are stored. */
export const Changed = Fact.make("storage.changed", {
  subject: testSubject,
  version: 1,
  payload: Schema.String,
});
export const Changed2 = Fact.make(Changed.name, {
  subject: testSubject,
  version: 2,
  payload: Schema.String,
});
export const Other = Fact.make("storage.other", {
  subject: testSubject,
  version: 1,
  payload: Schema.String,
});

/** Fact headers: stored beside payloads, filtered in storage, and compared on retries. */
export const factMetadata = (fixture: Fixture) => {
  const { core } = Support;
  describe.skipIf(!fixture.available)(`${fixture.name}: fact metadata`, () => {
    it.effect(
      "fact metadata survives reopening, and fact reads page matching entries across versions and commits",
      () =>
        fixture.withStorage((storage) =>
          Effect.gen(function* () {
            const events = yield* Effect.scoped(
              Effect.gen(function* () {
                const host = yield* storage.connect();
                const bound = yield* forWorkspace(host, workspaceId);
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
                  const stored = (yield* bound.store.read(journalLog, { limit: 10 })).flatMap(
                    (batch) => batch.entries,
                  );
                  expect(stored.map((entry) => entry.fact?.name)).toEqual([
                    Changed.name,
                    Other.name,
                    Changed.name,
                    Changed.name,
                  ]);
                  expect(stored.map((entry) => entry.fact?.version)).toEqual([1, 1, 2, 1]);
                  expect(stored[0]?.payload).toEqual(yield* Codec.make(Changed).encode("first"));
                  const first = (yield* journal.read({ name: Changed.name, limit: 1 }))[0];
                  if (first === undefined) return yield* Effect.die("Missing first event");
                  const next = yield* journal.read({ name: Changed.name, after: first, limit: 2 });
                  expect(next.map((entry) => entry.id)).toEqual([events[1].id, third.id]);
                  expect(
                    (yield* journal.read({ name: Changed.name, version: 1, limit: 10 })).map(
                      (entry) => entry.id,
                    ),
                  ).toEqual([events[0].id, third.id]);
                  expect(
                    yield* journal.read({ name: Changed.name, after: third, limit: 1 }),
                  ).toEqual([]);
                  expect((yield* journal.log.read({ limit: 1 }))[0]?.entries).toHaveLength(3);
                  const other = yield* Journal.make({
                    logId: Log.Id.make("another"),
                    projections: [],
                  });
                  yield* other.publish(Changed, "other log");
                  expect(yield* journal.read({ name: Changed.name, limit: 10 })).toHaveLength(3);
                  const foreign = yield* forWorkspace(host, otherWorkspaceId);
                  expect(
                    yield* foreign.store.readFacts(journalLog, { name: Changed.name, limit: 10 }),
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
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const stored = yield* bound.store.readFacts(journalLog, {
              name: Changed.name,
              limit: 10,
            });
            expect(stored.map((entry) => entry.id)).toEqual(events.map((event) => event.id));
            for (const [index, entry] of stored.entries()) {
              const expected = events[index];
              if (expected === undefined) return yield* Effect.die("Unexpected stored entry");
              const decoded = yield* Event.storageCodec.decode(entry);
              expect(decoded.provenance).toEqual(expected.provenance);
              expect(yield* Codec.make(Changed).decode(entry.payload)).toBe(expected.payload);
            }
          }),
        ),
    );

    it.effect(
      "native idempotency compares fact metadata and rejects foreign provenance before writing",
      () =>
        fixture.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const provenance = testProvenance(workspaceId);
            const content = {
              fact: { subject: testSubject(), name: Changed.name, version: 1, provenance },
              payload: yield* Codec.make(Changed).encode("same"),
            };
            const key = Log.IdempotencyKey.make("native-fact");
            const append = (entry: Store.Content) =>
              bound.store.transaction(
                Effect.flatMap(Store.Transaction, (storeTransaction) =>
                  storeTransaction.append({
                    logId: journalLog,
                    entries: [entry],
                    idempotencyKey: key,
                  }),
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
            expect(Option.isSome(yield* bound.store.getAppend(journalLog, key))).toBe(true);
            expect(
              yield* bound.store.readFacts(journalLog, { name: Changed.name, limit: 10 }),
            ).toHaveLength(1);
          }),
        ),
    );

    it.effect(
      "subject reads span fact names, preserve entry cursors, and persist contact attribution",
      () =>
        fixture.withStorage((storage) =>
          Effect.gen(function* () {
            const Payload = Schema.Struct({ threadId: Schema.NonEmptyString, text: Schema.String });
            const subject = (payload: typeof Payload.Type) =>
              Subject.make("thread", payload.threadId);
            const Message = Fact.make("thread.message", { version: 1, payload: Payload, subject });
            const Activity = Fact.make("thread.activity", {
              version: 1,
              payload: Payload,
              subject,
            });
            const target = subject({ threadId: "one", text: "" });
            const contact = Identity.Reference.cases.Contact.make({
              id: Identity.ContactId.make("external-author"),
            });
            const events = yield* Effect.scoped(
              Effect.gen(function* () {
                const host = yield* storage.connect();
                const bound = yield* forWorkspace(host, workspaceId);
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
                  const foreign = yield* forWorkspace(host, otherWorkspaceId);
                  expect(
                    yield* foreign.store.readFacts(journalLog, { subject: target, limit: 10 }),
                  ).toEqual([]);
                  const plain = (yield* Log.Service).open({
                    id: journalLog,
                    schema: Schema.String,
                  });
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
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const entries = yield* bound.store.readFacts(journalLog, {
              subject: target,
              limit: 10,
            });
            expect(entries.map((entry) => entry.id)).toEqual(events.map((event) => event.id));
            for (const entry of entries) {
              expect(entry.fact?.subject).toBe(target);
              expect(entry.fact?.provenance.performedBy).toEqual({
                _tag: "Identity",
                identity: contact,
              });
            }
          }),
        ),
    );
  });
};
