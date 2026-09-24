import { Subject } from "@amends/core/journal";
import { expect, it } from "@effect/vitest";
import { DateTime, Effect, Option, Schema } from "effect";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Event } from "../../src/journal/event.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Projection } from "../../src/journal/projection.ts";
import { Publication } from "../../src/journal/publication.ts";
import { Store } from "../../src/journal/store.ts";
import { Transaction } from "../../src/journal/transaction.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";
import { Counter, make, type Fixture } from "../memory-store.ts";
import { testProvenance } from "../publication.ts";

const testSubject = () => Subject.make("test", "entity");
const workspaceId = WorkspaceId.Id.make("workspace-one");
const logId = Log.Id.make("journal");
const key = Log.IdempotencyKey.make("operation/one");
const Changed = Fact.make("counter.changed", {
  subject: testSubject,
  version: 1,
  payload: Schema.Finite,
});
const projection = Projection.make("counter", { version: 1 }).on(Changed, (event) =>
  Effect.flatMap(Counter, (counter) => counter.add(event.payload)),
);
const setup = Journal.make({ logId, projections: [projection] });
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    | Log.Service
    | Transaction.Service
    | Journal.Service
    | Counter
    | Checkpoint.Service
    | Publication.Service
  >,
) =>
  Effect.gen(function* () {
    const journal = yield* setup;
    return yield* program.pipe(Effect.provideService(Journal.Service, journal));
  }).pipe(
    Effect.provideService(Publication.Service, testProvenance(workspaceId)),
    Effect.provide(Log.layer),
    Effect.provideService(Store.Service, fixture.store),
    Effect.provideService(Checkpoint.Service, fixture.checkpoints),
    Effect.provideService(Counter, fixture.counter),
    Effect.scoped,
  );
/** How many entries each committed batch holds, in log order. */
const committed = Effect.flatMap(Journal.Service, (journal) =>
  Effect.map(journal.log.read({ limit: 10 }), (batches) =>
    batches.map((batch) => batch.entries.length),
  ),
);
it.effect(
  "keyed publication returns the original event despite fresh provenance and stale expectedAfter",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* Journal.Service;
          const first = yield* journal.publish(Changed, 2, {
            idempotencyKey: key,
            expectedAfter: Option.none(),
          });
          const retried = yield* journal.commit(
            Effect.gen(function* () {
              yield* journal.publish(Changed, 3);
              return yield* journal
                .publish(Changed, 2, { idempotencyKey: key, expectedAfter: Option.none() })
                .pipe(
                  Publication.withOccurredAt(DateTime.makeUnsafe("2030-01-01T00:00:00Z")),
                  Effect.provideService(
                    Publication.Service,
                    Object.assign({}, testProvenance(workspaceId), {
                      correlationId: Event.CorrelationId.make("another-operation"),
                    }),
                  ),
                );
            }),
          );
          expect(retried).toEqual(first);
          expect(yield* fixture.counter.get).toBe(5);
          // The retry's commit records only its new fact.
          expect(yield* committed).toEqual([1, 1]);
          const original = yield* journal.log.getAppend(key);
          expect(Option.isSome(original) && original.value[0]?.id).toBe(first.id);
        }),
      );
    }),
);

it.effect(
  "retrying an uncertain commit recovers its original publication without applying it again",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* Journal.Service;
          yield* fixture.loseNextAcknowledgment;
          const failure = yield* Effect.flip(journal.publish(Changed, 7, { idempotencyKey: key }));
          if (failure._tag !== "JournalStore.CommitUncertain")
            return yield* Effect.die("Expected uncertain commit");
          const retry = yield* journal.publish(Changed, 7, { idempotencyKey: key });
          expect(retry.commitId).toBe(failure.commitId);
          expect(yield* fixture.counter.get).toBe(7);
          expect(yield* committed).toEqual([1]);
        }),
      );
    }),
);

it.effect("retries in one commit publish and project only one keyed occurrence", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* Journal.Service;
        const events = yield* journal.commit(
          Effect.all(
            Array.from({ length: 8 }, () => journal.publish(Changed, 2, { idempotencyKey: key })),
          ),
        );
        expect(new Set(events.map((event) => event.id)).size).toBe(1);
        expect(yield* fixture.counter.get).toBe(2);
        expect(yield* committed).toEqual([1]);
      }),
    );
  }),
);

it.effect(
  "conflicting key reuse aborts the enclosing commit and failed projections release their keys",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* Journal.Service;
          yield* journal.publish(Changed, 1, { idempotencyKey: key });
          const second = Log.IdempotencyKey.make("operation/two");
          const error = yield* Effect.flip(
            journal.commit(
              Effect.gen(function* () {
                yield* journal.publish(Changed, 3, { idempotencyKey: second });
                yield* journal.publish(Changed, 99, { idempotencyKey: key }).pipe(Effect.ignore);
              }),
            ),
          );
          expect(error._tag).toBe("Commit.Aborted");
          expect(yield* journal.log.getAppend(second)).toEqual(Option.none());
          expect(yield* fixture.counter.get).toBe(1);
          for (const fact of [
            Fact.make("another.fact", { subject: testSubject, version: 1, payload: Schema.Finite }),
            Fact.make(Changed.name, { subject: testSubject, version: 2, payload: Schema.Finite }),
          ])
            expect(
              (yield* Effect.flip(journal.publish(fact, 1, { idempotencyKey: key })))._tag,
            ).toBe("JournalStore.Conflict");
          const failing = yield* Journal.make({
            logId: Log.Id.make("failing"),
            projections: [
              Projection.make("failing", { version: 1 }).on(Changed, () => Effect.fail("reject")),
            ],
          });
          expect(
            (yield* Effect.flip(failing.publish(Changed, 1, { idempotencyKey: key })))._tag,
          ).toBe("Projection.Failure");
          expect(yield* failing.log.getAppend(key)).toEqual(Option.none());
          const retry = yield* Journal.make({ logId: Log.Id.make("failing"), projections: [] });
          yield* retry.publish(Changed, 1, { idempotencyKey: key });
        }),
      );
    }),
);

it.effect(
  "appendAll receipts isolate slices, reject changed count or order, and leave unkeyed appends unchanged",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const logs = yield* Log.Service;
          const log = logs.open({ id: Log.Id.make("execution"), schema: Schema.String });
          const first = yield* logs.commit(
            Effect.gen(function* () {
              yield* log.append("before");
              const batch = yield* log.appendAll(["one", "two"], { idempotencyKey: key });
              yield* log.append("after");
              expect(
                yield* log.appendAll(["one", "two"], {
                  idempotencyKey: key,
                  expectedAfter: Option.none(),
                }),
              ).toEqual(batch);
              return batch;
            }),
          );
          expect(first.map((entry) => entry.index)).toEqual([1, 2]);
          expect(yield* log.getAppend(key)).toEqual(Option.some(first));
          expect(yield* log.appendAll(["one", "two"], { idempotencyKey: key })).toEqual(first);
          for (const input of [["one"], ["two", "one"], ["one", "changed"]])
            expect((yield* Effect.flip(log.appendAll(input, { idempotencyKey: key })))._tag).toBe(
              "JournalStore.Conflict",
            );
          expect(
            (yield* Effect.flip(
              log.appendAll([], { idempotencyKey: Log.IdempotencyKey.make("empty") }),
            ))._tag,
          ).toBe("SchemaError");
          expect(
            (yield* Effect.flip(
              log.append("new", {
                idempotencyKey: Log.IdempotencyKey.make("new"),
                expectedAfter: Option.none(),
              }),
            ))._tag,
          ).toBe("JournalStore.Conflict");
          expect(yield* log.getAppend(Log.IdempotencyKey.make("new"))).toEqual(Option.none());
          const other = logs.open({ id: Log.Id.make("other"), schema: Schema.String });
          yield* other.append("different", { idempotencyKey: key });
          const a = yield* log.append("unkeyed");
          const b = yield* log.append("unkeyed");
          expect(a.id).not.toBe(b.id);
          expect((yield* log.read({ limit: 10 })).flatMap((batch) => batch.entries)).toHaveLength(
            6,
          );
        }),
      );
    }),
);

it.effect(
  "malformed or unavailable receipt reads fail closed, and appends never read their receipt back",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      const broken: Fixture = {
        ...fixture,
        store: {
          ...fixture.store,
          getAppend: (logId, key) =>
            fixture.store
              .getAppend(logId, key)
              .pipe(
                Effect.map((found) =>
                  Option.map(found, (receipt) =>
                    Object.assign({}, receipt, { entryCount: receipt.entryCount + 1 }),
                  ),
                ),
              ),
        },
      };
      yield* run(
        broken,
        Effect.gen(function* () {
          const log = (yield* Log.Service).open({
            id: Log.Id.make("guarded"),
            schema: Schema.String,
          });
          // The store resolves the key itself; the log trusts its returned entries.
          const appended = yield* log.append("value", { idempotencyKey: key });
          expect(appended.payload).toBe("value");
          expect((yield* Effect.flip(log.getAppend(key)))._tag).toBe("SchemaError");
        }),
      );
      expect((yield* fixture.snapshot).logs.get(Log.Id.make("guarded"))).toHaveLength(1);
      const failure = new Store.Failure({ operation: "getAppend", cause: "lookup unavailable" });
      const unavailable: Fixture = {
        ...fixture,
        store: { ...fixture.store, getAppend: () => Effect.fail(failure) },
      };
      yield* run(
        unavailable,
        Effect.gen(function* () {
          const log = (yield* Log.Service).open({
            id: Log.Id.make("guarded"),
            schema: Schema.String,
          });
          expect(yield* Effect.flip(log.getAppend(key))).toBe(failure);
          expect((yield* log.append("value", { idempotencyKey: key })).payload).toBe("value");
        }),
      );
      expect((yield* fixture.snapshot).logs.get(Log.Id.make("guarded"))).toHaveLength(1);
    }),
);
