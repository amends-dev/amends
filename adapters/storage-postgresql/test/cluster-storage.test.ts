import { BackgroundProcess } from "@amends/core/background";
import { Commit, Store } from "@amends/core/journal";
import { Workspace } from "@amends/core/workspace";
import { ClusterBackground, Gateway, WorkspaceWakes } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Clock, DateTime, Duration, Effect, Layer, Option } from "effect";
import { RunnerAddress, SingleRunner } from "effect/unstable/cluster";
import { SqlClient } from "effect/unstable/sql";
import { PostgresClusterStorage } from "../src/index.ts";
import { database, setup } from "./support.ts";

const { available, withDatabase } = setup();
const workspaceId = Workspace.Id.make("workspace-one");
const process = BackgroundProcess.Name.make("test.work");

/** Cluster over the test database, with a worker whose runs all leave nothing outstanding. */
const cluster = (url: string) => {
  const unexpected = () => Effect.die("Only background runs are expected");
  const gateway = Gateway.Service.of({
    createWorkspace: unexpected,
    inWorkspace: unexpected,
    asMember: unexpected,
    asMemberScoped: unexpected,
    runBackground: () => Effect.succeed(BackgroundProcess.idle),
  });
  return ClusterBackground.layer.pipe(
    Layer.provide(Layer.mergeAll(Layer.succeed(Gateway.Service, gateway), BunCrypto.layer)),
    Layer.provideMerge(
      SingleRunner.layer({
        shardingConfig: {
          runnerAddress: Option.some(RunnerAddress.make("localhost", 34431)),
          entityMessagePollInterval: Duration.seconds(1),
        },
      }).pipe(Layer.provide(BunCrypto.layer)),
    ),
    Layer.provideMerge(database(url)),
  );
};

const wake = (commit: string, at?: DateTime.Utc) =>
  Effect.flatMap(WorkspaceWakes.Service, (wakes) =>
    wakes.forWorkspace(workspaceId).request(process, { at }),
  ).pipe(
    Effect.provideService(Store.Transaction, {
      id: Commit.Id.make(commit),
      append: () => Effect.die("Unexpected append"),
    }),
  );

const count = (query: string) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql.unsafe<{ readonly count: number }>(query)).pipe(
    Effect.map(([row]) => row?.count ?? 0),
    Effect.orDie,
  );

describe.skipIf(!available)("PostgreSQL", () => {
  it.live(
    "pruning removes handled wakes stored before a time, with their replies, in batches",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const context = yield* Layer.build(cluster(url));
          const handled = count(
            "SELECT count(*)::int AS count FROM cluster_messages WHERE processed",
          );
          yield* Effect.gen(function* () {
            for (const commit of ["one", "two", "three", "four", "five"]) yield* wake(commit);
            // Not due for a day, so not handled, and kept however old it is.
            yield* wake("later", DateTime.add(yield* DateTime.now, { days: 1 }));
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
            const types = [ClusterBackground.WorkspaceProcess.type];
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
});
