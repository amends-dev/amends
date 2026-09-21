import { Subject } from "@amends/core/journal";
import { expect, expectTypeOf, test } from "bun:test";
import { Effect, Option, Schema } from "effect";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { CommittedEvents } from "../../src/journal/committed-events.ts";
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
const Payload = Schema.Struct({
  source: Schema.NonEmptyString,
  requestId: Schema.NullOr(Schema.String),
  amount: Schema.FiniteFromString,
});
const identity = (payload: typeof Payload.Type) =>
  payload.requestId === null ? null : [payload.source, payload.requestId];
const Received = Fact.make("counter.received", {
  subject: testSubject,
  version: 1,
  payload: Payload,
  occurrence: identity,
});
const projection = Projection.make("counter", { version: 1 }).on(Received, (event) =>
  Effect.flatMap(Counter, (counter) => counter.add(event.payload.amount)),
);
const setup = Journal.make({ logId, projections: [projection] });
const input = { source: "provider", requestId: "message", amount: 2 };
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    Log.Service | Transaction.Service | Counter | Checkpoint.Service | Publication.Service
  >,
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provideService(Publication.Service, testProvenance(workspaceId)),
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
      Effect.provideService(Counter, fixture.counter),
      Effect.provide(CommittedEvents.layer(workspaceId)),
    ),
  );

test("occurrence tuples have a stable, namespaced encoding without delimiter collisions or schema versions", async () => {
  expectTypeOf<Fact.Payload<typeof Received>>().toEqualTypeOf<typeof Payload.Type>();
  const version2 = Fact.make(Received.name, {
    subject: testSubject,
    version: 2,
    payload: Payload,
    occurrence: identity,
  });
  const other = Fact.make("counter.other", {
    subject: testSubject,
    version: 1,
    payload: Payload,
    occurrence: identity,
  });
  await Effect.runPromise(
    Effect.gen(function* () {
      const key = yield* Fact.makeOccurrenceKey(Received, input);
      expect(key).toBe(Log.IdempotencyKey.make('fact:["counter.received",["provider","message"]]'));
      expect(yield* Fact.makeOccurrenceKey(version2, input)).toBe(key);
      const keys = yield* Effect.all([
        Fact.makeOccurrenceKey(Received, { ...input, source: "a:b", requestId: "c" }),
        Fact.makeOccurrenceKey(Received, { ...input, source: "a", requestId: "b:c" }),
        Fact.makeOccurrenceKey(other, { ...input, source: "a:b", requestId: "c" }),
        Fact.makeOccurrenceKey(Received, { ...input, source: 'a"b', requestId: "c\\d" }),
      ]);
      expect(new Set(keys).size).toBe(4);
    }),
  );
});

test("publication deduplicates concurrent attempts without explicit keys and rejects conflicting content", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      const events = yield* journal.commit(
        Effect.all(
          Array.from({ length: 6 }, () => journal.publish(Received, input)),
          { concurrency: "unbounded" },
        ),
      );
      expect(new Set(events.map((event) => event.id)).size).toBe(1);
      expect(yield* fixture.counter.get).toBe(2);
      const original = events[0];
      if (original === undefined) return yield* Effect.die("Expected published event");
      expect(yield* journal.publish(Received, input, { expectedAfter: Option.none() })).toEqual(
        original,
      );
      expect(
        (yield* journal.log.read({ limit: 10 })).flatMap((batch) => batch.entries),
      ).toHaveLength(1);
      const key = yield* Fact.makeOccurrenceKey(Received, input);
      if (key === null) return yield* Effect.die("Expected occurrence key");
      expect(Option.isSome(yield* journal.log.getAppend(key))).toBe(true);
      expect((yield* Effect.flip(journal.publish(Received, { ...input, amount: 99 })))._tag).toBe(
        "JournalStore.Conflict",
      );
      const version2 = Fact.make(Received.name, {
        subject: testSubject,
        version: 2,
        payload: Payload,
        occurrence: identity,
      });
      expect((yield* Effect.flip(journal.publish(version2, input)))._tag).toBe(
        "JournalStore.Conflict",
      );
      expect(yield* fixture.counter.get).toBe(2);
    }),
  );
});

test("derived occurrences survive uncertain commits and remain available after rollback", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      const key = yield* Fact.makeOccurrenceKey(Received, input);
      if (key === null) return yield* Effect.die("Expected occurrence key");
      yield* journal
        .commit(
          Effect.gen(function* () {
            yield* journal.publish(Received, input);
            return yield* Effect.fail("rollback");
          }),
        )
        .pipe(Effect.flip);
      expect(yield* journal.log.getAppend(key)).toEqual(Option.none());
      expect(yield* fixture.counter.get).toBe(0);
      yield* fixture.loseNextAcknowledgment;
      const failure = yield* Effect.flip(journal.publish(Received, input));
      if (failure._tag !== "JournalStore.CommitUncertain")
        return yield* Effect.die("Expected uncertain commit");
      const retry = yield* journal.publish(Received, input);
      expect(retry.commitId).toBe(failure.commitId);
      expect(yield* fixture.counter.get).toBe(2);
      expect(
        (yield* journal.log.read({ limit: 10 })).flatMap((batch) => batch.entries),
      ).toHaveLength(1);
    }),
  );
});

test("declared identities cannot be overridden, while null identities permit explicit keys or distinct occurrences", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      const manual = Log.IdempotencyKey.make("manual-request");
      expect(
        (yield* Effect.flip(journal.publish(Received, input, { idempotencyKey: manual })))._tag,
      ).toBe("JournalStore.Conflict");
      expect(yield* journal.log.read({ limit: 10 })).toEqual([]);
      const automatic = yield* journal.publish(Received, input);
      const derived = yield* Fact.makeOccurrenceKey(Received, input);
      if (derived === null) return yield* Effect.die("Expected occurrence key");
      expect(
        (yield* Effect.flip(journal.publish(Received, input, { idempotencyKey: derived })))._tag,
      ).toBe("JournalStore.Conflict");
      expect(yield* journal.publish(Received, input)).toEqual(automatic);
      const unkeyed = { ...input, requestId: null };
      const first = yield* journal.publish(Received, unkeyed);
      const second = yield* journal.publish(Received, unkeyed);
      expect(first.id).not.toBe(second.id);
      const explicit = yield* journal.publish(Received, unkeyed, { idempotencyKey: manual });
      expect(yield* journal.publish(Received, unkeyed, { idempotencyKey: manual })).toEqual(
        explicit,
      );
      expect(yield* fixture.counter.get).toBe(8);
    }),
  );
});

test("invalid payloads are rejected before identity extraction, and invalid identity components never append", async () => {
  const fixture = await Effect.runPromise(make());
  let calls = 0;
  const derived = Fact.make("validated", {
    subject: testSubject,
    version: 1,
    payload: Payload,
    occurrence: (payload) => {
      calls++;
      expectTypeOf(payload.amount).toEqualTypeOf<number>();
      return [payload.amount.toFixed(0)];
    },
  });
  const invalid: Fact.Payload<typeof derived> = { ...input };
  Reflect.set(invalid, "amount", "not-a-decoded-number");
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      expect((yield* Effect.flip(Fact.makeOccurrenceKey(derived, invalid)))._tag).toBe(
        "SchemaError",
      );
      expect((yield* Effect.flip(journal.publish(derived, invalid)))._tag).toBe("SchemaError");
      expect(calls).toBe(0);
      yield* journal.publish(derived, input);
      expect(calls).toBe(1);
      for (const parts of [[], [""], ["  "], ["valid", ""]]) {
        const bad = Fact.make("bad-parts", {
          subject: testSubject,
          version: 1,
          payload: Payload,
          occurrence: () => parts,
        });
        expect((yield* Effect.flip(journal.publish(bad, input)))._tag).toBe("SchemaError");
      }
      expect(
        (yield* journal.log.read({ limit: 10 })).flatMap((batch) => batch.entries),
      ).toHaveLength(1);
    }),
  );
});

test("registered fact versions cannot change their subject or occurrence rules", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* setup;
      const unkeyed = Fact.make(Received.name, {
        subject: testSubject,
        version: 1,
        payload: Payload,
      });
      const changed = Fact.make(Received.name, {
        subject: testSubject,
        version: 1,
        payload: Payload,
        occurrence: () => ["different"],
      });
      const otherSubject = Fact.make(Received.name, {
        subject: () => Subject.make("test", "other"),
        version: 1,
        payload: Payload,
        occurrence: identity,
      });
      for (const fact of [unkeyed, changed, otherSubject]) {
        expect((yield* Effect.flip(journal.publish(fact, input)))._tag).toBe(
          "Journal.FactMismatch",
        );
        const conflicting = Projection.make("other", { version: 1 }).on(fact, () => Effect.void);
        expect(
          (yield* Effect.flip(Journal.make({ logId, projections: [projection, conflicting] })))
            ._tag,
        ).toBe("Journal.FactMismatch");
      }
      expect(yield* journal.log.read({ limit: 10 })).toEqual([]);
    }),
  );
});
