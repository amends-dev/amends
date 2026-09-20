import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { Codec } from "../../src/journal/codec.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { CommittedEvents } from "../../src/journal/committed-events.ts";
import { Event } from "../../src/journal/event.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Publication } from "../../src/journal/publication.ts";
import { Store } from "../../src/journal/store.ts";
import { Transaction } from "../../src/journal/transaction.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";
import { make, type Fixture } from "../memory-store.ts";
import { testProvenance } from "../publication.ts";

const workspaceId = WorkspaceId.Id.make("workspace-one");
const logId = Log.Id.make("journal");
const Changed = Fact.make("example.changed", { version: 1, payload: Schema.FiniteFromString });
const Changed2 = Fact.make(Changed.name, { version: 2, payload: Schema.FiniteFromString });
const Other = Fact.make("example.other", { version: 1, payload: Schema.String });
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    Log.Service | Transaction.Service | Publication.Service | Checkpoint.Service
  >,
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provideService(Publication.Service, testProvenance(workspaceId)),
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
      Effect.provide(CommittedEvents.layer(workspaceId)),
    ),
  );

test("storage keeps the fact header separate and filtered entry pages preserve mixed-version commit order", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* Journal.make({ logId, projections: [] });
      const events = yield* journal.commit(
        Effect.gen(function* () {
          const first = yield* journal.publish(Changed, 1);
          yield* journal.publish(Other, "between");
          const second = yield* journal.publish(Changed, 2);
          const third = yield* journal.publish(Changed2, 3);
          return [first, second, third] as const;
        }),
      );
      const stored = (yield* fixture.store.read(logId, { limit: 1 }))[0]?.entries;
      expect(stored).toHaveLength(4);
      expect(stored?.[0]?.fact).toEqual({
        name: Changed.name,
        version: 1,
        provenance: events[0]?.provenance,
      });
      expect(stored?.[0]?.payload).toEqual(yield* Codec.make(Changed).encode(1));
      const firstPage = yield* journal.read({ name: Changed.name, limit: 1 });
      const first = firstPage[0];
      if (first === undefined) return yield* Effect.die("Missing first fact");
      expect(yield* Event.decode(Changed, first)).toEqual(events[0]);
      const secondPage = yield* journal.read({ name: Changed.name, after: first, limit: 2 });
      expect(secondPage.map((entry) => entry.id)).toEqual(events.slice(1).map((event) => event.id));
      expect(secondPage.map((entry) => entry.index)).toEqual([2, 3]);
      expect(
        (yield* journal.read({ name: Changed.name, version: 2, limit: 10 })).map(
          (entry) => entry.id,
        ),
      ).toEqual([events[2]?.id]);
      expect(yield* journal.read({ name: "absent", limit: 10 })).toEqual([]);
      expect((yield* journal.log.read({ limit: 1 }))[0]?.entries).toHaveLength(4);
      const plain = (yield* Log.Service).open({ id: logId, schema: Schema.Uint8Array });
      expect((yield* Effect.flip(plain.read({ limit: 1 })))._tag).toBe("SchemaError");
    }),
  );
});

test("filtered reads reject malformed adapter pages instead of skipping or leaking entries", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* Journal.make({ logId, projections: [] });
      yield* journal.commit(Effect.all([journal.publish(Changed, 1), journal.publish(Changed, 2)]));
    }),
  );
  const original = (await Effect.runPromise(fixture.store.read(logId, { limit: 1 })))[0]?.entries;
  if (original === undefined || original[0] === undefined)
    throw new Error("Missing stored entries");
  const first = original[0];
  if (first.fact === undefined) throw new Error("Missing fact header");
  const withoutFact = { ...first };
  Reflect.deleteProperty(withoutFact, "fact");
  for (const entries of [
    [...original].reverse(),
    [first, first],
    [...original, first],
    [{ ...first, logId: Log.Id.make("other") }],
    [{ ...first, fact: { ...first.fact, name: Other.name } }],
    [withoutFact],
  ]) {
    const broken: Fixture = {
      ...fixture,
      store: { ...fixture.store, readFacts: () => Effect.succeed(entries) },
    };
    await run(
      broken,
      Effect.gen(function* () {
        const journal = yield* Journal.make({ logId, projections: [] });
        expect((yield* Effect.flip(journal.read({ name: Changed.name, limit: 2 })))._tag).toBe(
          "SchemaError",
        );
      }),
    );
  }
});
