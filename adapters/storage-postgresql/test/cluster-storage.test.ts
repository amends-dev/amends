import { BunCrypto } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import {
  Clock,
  DateTime,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  PrimaryKey,
  Schema,
  Scope,
} from "effect";
import { ClusterSchema, DeliverAt, Entity, RunnerAddress, SingleRunner } from "effect/cluster";
import { Rpc } from "effect/rpc";
import { SqlClient } from "effect/sql";
import { PostgresClusterStorage } from "../src/index.ts";
import { database, setup } from "./support.ts";

const { available, withDatabase } = setup();

/** A request a job handles at `at`, under `key`, by doing nothing. */
class Ping extends Schema.Class<Ping>("test/Job/Ping")({
  key: Schema.String,
  at: Schema.DateTimeUtcFromMillis,
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
  [DeliverAt.symbol]() {
    return this.at;
  }
}

/** A job whose requests Cluster keeps, as a host's jobs are. */
const entity = Entity.make("test/Job", [
  Rpc.make("Ping", { payload: Ping }).annotate(ClusterSchema.Persisted, true),
]);

/** The job over the test database, reading for due requests as often as `pollInterval`. */
const cluster = (url: string, pollInterval: Duration.Input = "1 second") =>
  entity.toLayer(entity.of({ Ping: () => Effect.void })).pipe(
    Layer.provideMerge(
      SingleRunner.layer({
        shardingConfig: {
          runnerAddress: Option.some(RunnerAddress.make("localhost", 34431)),
          entityMessagePollInterval: Duration.fromInputUnsafe(pollInterval),
        },
      }).pipe(Layer.provide(BunCrypto.layer)),
    ),
    Layer.provideMerge(database(url)),
  );

/** Store a request, due at `at` or now, under `key`. */
const request = (key: string, at?: DateTime.Utc) =>
  Effect.gen(function* () {
    const client = yield* entity.client;
    yield* client("job-one").Ping(new Ping({ key, at: at ?? (yield* DateTime.now) }), {
      discard: true,
    });
  });

const count = (query: string) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql.unsafe<{ readonly count: number }>(query)).pipe(
    Effect.map(([row]) => row?.count ?? 0),
    Effect.orDie,
  );

describe.skipIf(!available)("PostgreSQL", () => {
  it.live(
    "pruning removes handled requests stored before a time, with their replies, in batches",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const context = yield* Layer.build(cluster(url));
          const handled = count(
            "SELECT count(*)::int AS count FROM cluster_messages WHERE processed",
          );
          yield* Effect.gen(function* () {
            for (const commit of ["one", "two", "three", "four", "five"]) yield* request(commit);
            // Not due for a day, so not handled, and kept however old it is.
            yield* request("later", DateTime.add(yield* DateTime.now, { days: 1 }));
            const deadline = (yield* Clock.currentTimeMillis) + 10_000;
            while ((yield* handled) < 5 && (yield* Clock.currentTimeMillis) < deadline)
              yield* Effect.sleep("100 millis");
            expect(yield* handled).toBe(5);
            // Another entity type's handled message is not this pruning's to remove.
            yield* Effect.flatMap(
              SqlClient.SqlClient,
              (sql) => sql`
                UPDATE cluster_messages SET entity_type = 'other/Entity'
                WHERE id = (SELECT min(id) FROM cluster_messages WHERE processed)`,
            ).pipe(Effect.orDie);
            const types = [entity.type];
            const now = yield* DateTime.now;
            expect(
              yield* PostgresClusterStorage.prune(types, DateTime.subtract(now, { hours: 1 })),
            ).toBe(0);
            expect(
              yield* PostgresClusterStorage.prune(types, DateTime.add(now, { minutes: 1 }), {
                batch: 3,
              }),
            ).toBe(4);
            expect(yield* count("SELECT count(*)::int AS count FROM cluster_messages")).toBe(2);
            expect(yield* handled).toBe(1);
            // Only the other entity type's handled message still has its reply.
            expect(
              yield* count(`
                SELECT count(*)::int AS count FROM cluster_replies r
                WHERE NOT EXISTS (SELECT 1 FROM cluster_messages m WHERE m.id = r.request_id)`),
            ).toBe(0);
            expect(yield* count("SELECT count(*)::int AS count FROM cluster_replies")).toBe(1);
          }).pipe(Effect.provide(context));
        }).pipe(Effect.scoped),
      ),
    30_000,
  );

  it.effect("a runner address is held by one process at a time, and freed when it stops", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const first = yield* Layer.build(database(url));
        const second = yield* Layer.build(database(url));
        const claim = (pool: typeof first, address: string) =>
          Layer.build(Layer.effectDiscard(PostgresClusterStorage.claimAddress(address))).pipe(
            Effect.provide(pool),
          );
        const held = yield* Scope.make();
        yield* claim(first, "runner-a:1").pipe(Scope.provide(held));
        expect(yield* Effect.flip(Effect.scoped(claim(second, "runner-a:1")))).toEqual(
          new PostgresClusterStorage.AddressTaken({ address: "runner-a:1" }),
        );
        // Another address is free, and so is this one once the process holding it stops.
        yield* Effect.scoped(claim(second, "runner-b:1"));
        yield* Scope.close(held, Exit.void);
        yield* Effect.scoped(claim(second, "runner-a:1"));
        // The first pool's connection went back without the lock: it can claim it again too.
        yield* Effect.scoped(claim(first, "runner-a:1"));
      }).pipe(Effect.scoped),
    ),
  );
});
