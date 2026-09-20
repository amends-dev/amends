import { expect } from "bun:test";
import {
  setup,
  views,
  core,
  inDatabase,
  workspaceId,
  otherWorkspaceId,
  testProvenance,
} from "./support.ts";
const { it, withDatabase } = await setup();
import { Codec, Event, Fact, Journal, Log, Publication, Store } from "@amends/core/journal";
import { Effect, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

const logId = Log.Id.make("journal");
const Changed = Fact.make("storage.changed", { version: 1, payload: Schema.String });
const Changed2 = Fact.make(Changed.name, { version: 2, payload: Schema.String });
const Other = Fact.make("storage.other", { version: 1, payload: Schema.String });

it("fact metadata is stored in columns and indexed reads page matching entries across versions and commits", async () =>
  withDatabase(async (location) => {
    const events = await inDatabase(
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
          expect(yield* journal.read({ name: Changed.name, after: third, limit: 1 })).toEqual([]);
          expect((yield* journal.log.read({ limit: 1 }))[0]?.entries).toHaveLength(3);
          const other = yield* Journal.make({ logId: Log.Id.make("another"), projections: [] });
          yield* other.publish(Changed, "other log");
          expect(yield* journal.read({ name: Changed.name, limit: 10 })).toHaveLength(3);
          const foreign = yield* (yield* views()).forWorkspace(otherWorkspaceId);
          expect(yield* foreign.store.readFacts(logId, { name: Changed.name, limit: 10 })).toEqual(
            [],
          );
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
    await inDatabase(
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
  }));

it("native idempotency compares fact metadata and rejects foreign provenance before writing", async () =>
  withDatabase(async (location) => {
    await inDatabase(
      location,
      Effect.gen(function* () {
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
        const provenance = testProvenance(workspaceId);
        const content = {
          fact: { name: Changed.name, version: 1, provenance },
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
        expect((yield* Effect.flip(append(missingAttribution)))._tag).toBe("JournalStore.Conflict");
        const nullAttribution = { ...content, fact: { ...content.fact } };
        Reflect.set(nullAttribution.fact, "provenance", null);
        expect((yield* Effect.flip(append(nullAttribution)))._tag).toBe("JournalStore.Conflict");
        expect(Option.isSome(yield* bound.store.getAppend(logId, key))).toBe(true);
        expect(yield* bound.store.readFacts(logId, { name: Changed.name, limit: 10 })).toHaveLength(
          1,
        );
      }),
    );
  }));
