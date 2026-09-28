import { BackgroundProcess, BackgroundRuns } from "@amends/core/background";
import { Commit, Store } from "@amends/core/journal";
import { Workspace } from "@amends/core/workspace";
import { ClusterBackground, Gateway, GatewayErrors, WorkspaceWakes } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Clock, DateTime, Duration, Effect, Exit, Layer, Option, Scope } from "effect";
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
    executeTurns: unexpected,
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

const wakeIn = (id: Workspace.Id, commit: string, at?: DateTime.Utc) =>
  Effect.flatMap(WorkspaceWakes.Service, (wakes) =>
    wakes.forWorkspace(id).request(process, { at }),
  ).pipe(
    Effect.provideService(Store.Transaction, {
      id: Commit.Id.make(commit),
      append: () => Effect.die("Unexpected append"),
    }),
  );

const wake = (commit: string, at?: DateTime.Utc) => wakeIn(workspaceId, commit, at);

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

  it.live(
    "background status counts what waits, retries, and was dropped, per process",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const empty = yield* Layer.build(database(url));
          // Before any host ran background work, there is nothing to report.
          expect(
            yield* PostgresClusterStorage.backgroundStatus().pipe(Effect.provide(empty)),
          ).toEqual({ processes: [], retries: [], drops: [] });
          const unexpected = () => Effect.die("Only background runs are expected");
          const gateway = Gateway.Service.of({
            createWorkspace: unexpected,
            inWorkspace: unexpected,
            asMember: unexpected,
            asMemberScoped: unexpected,
            executeTurns: unexpected,
            runBackground: (id) =>
              id === "missing"
                ? Effect.fail(new GatewayErrors.WorkspaceNotFound({ workspaceId: id }))
                : id === "failing"
                  ? Effect.fail(new BackgroundRuns.Failure({ process, cause: "Not yet" }))
                  : Effect.succeed(BackgroundProcess.idle),
          });
          // Reading rarely, so the retry a failed run schedules stays waiting through the test.
          const context = yield* Layer.build(
            ClusterBackground.layer.pipe(
              Layer.provide(
                Layer.mergeAll(Layer.succeed(Gateway.Service, gateway), BunCrypto.layer),
              ),
              Layer.provideMerge(
                SingleRunner.layer({
                  shardingConfig: {
                    runnerAddress: Option.some(RunnerAddress.make("localhost", 34431)),
                    entityMessagePollInterval: Duration.seconds(30),
                  },
                }).pipe(Layer.provide(BunCrypto.layer)),
              ),
              Layer.provideMerge(database(url)),
            ),
          );
          const now = yield* DateTime.now;
          yield* Effect.gen(function* () {
            for (const id of ["missing", "failing", "fine"])
              yield* wakeIn(Workspace.Id.make(id), `commit-${id}`);
            yield* wakeIn(
              Workspace.Id.make("later"),
              "commit-later",
              DateTime.add(now, { hours: 1 }),
            );
            const deadline = (yield* Clock.currentTimeMillis) + 10_000;
            while (
              (yield* PostgresClusterStorage.backgroundStatus()).retries.length === 0 &&
              (yield* Clock.currentTimeMillis) < deadline
            )
              yield* Effect.sleep("100 millis");
            const status = yield* PostgresClusterStorage.backgroundStatus();
            expect(status.processes).toEqual([
              {
                process,
                due: 0,
                scheduled: 2,
                retrying: 1,
                oldestDue: Option.none(),
                dropped: 1,
              },
            ]);
            expect(status.retries).toMatchObject([{ process, workspaceId: "failing", attempt: 1 }]);
            expect(status.drops).toMatchObject([
              { process, workspaceId: "missing", reason: "workspace-not-found", attempt: 0 },
            ]);
          }).pipe(Effect.provide(context));
        }).pipe(Effect.scoped),
      ),
    30_000,
  );
});
