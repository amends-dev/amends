import { AgentWork, TurnStore } from "@amends/core/turn";
import { Member, Workspace } from "@amends/core/workspace";
import { AgentJob } from "@amends/cluster";
import { Gateway, GatewayErrors } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Clock, DateTime, Duration, Effect, Exit, Layer, Option, Scope } from "effect";
import { RunnerAddress, SingleRunner } from "effect/cluster";
import { SqlClient } from "effect/sql";
import { PostgresClusterStorage } from "../src/index.ts";
import { database, setup } from "./support.ts";

const { available, withDatabase } = setup();
const workspaceId = Workspace.Id.make("workspace-one");
const agent = Member.Id.make("agent-member");

/**
 * A gateway that only does agents' work: in a workspace named `missing`, which was never created;
 * in one named `failing`, failing; elsewhere, doing nothing.
 */
const agentWorkOnly = () => {
  const unexpected = () => Effect.die("Only agents' work is expected");
  return Gateway.Service.of({
    createWorkspace: unexpected,
    asMember: unexpected,
    inWorkspace: <A, E>(id: Workspace.Id, program: Effect.Effect<A, E, unknown>) => {
      if (id === "missing")
        return Effect.fail(new GatewayErrors.WorkspaceNotFound({ workspaceId: id }));
      const work = () =>
        id === "failing"
          ? Effect.fail(new TurnStore.Failure({ operation: "get", cause: "Not yet" }))
          : Effect.void;
      return Effect.provideService(
        program as Effect.Effect<A, GatewayErrors.PublicErrorOf<E>, AgentWork.Service>,
        AgentWork.Service,
        AgentWork.Service.of({ acceptWork: work, stopDepartedTurns: work }),
      );
    },
  });
};

/** Agent jobs over the test database, reading for due requests as often as `pollInterval`. */
const cluster = (url: string, pollInterval: Duration.Input = "1 second") =>
  AgentJob.layer.pipe(
    Layer.provide(Layer.mergeAll(Layer.succeed(Gateway.Service, agentWorkOnly()), BunCrypto.layer)),
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

/** Store a request for the agent to accept its work, due at `at` or now, under `key`. */
const requestIn = (id: Workspace.Id, key: string, at?: DateTime.Utc) =>
  Effect.gen(function* () {
    const agentJobClient = yield* AgentJob.entity.client;
    yield* agentJobClient(AgentJob.entityId(id, agent)).AcceptWork(
      new AgentJob.AcceptWork({
        workspaceId: id,
        memberId: agent,
        key,
        at: at ?? (yield* DateTime.now),
        attempt: 0,
      }),
      { discard: true },
    );
  });

const request = (key: string, at?: DateTime.Utc) => requestIn(workspaceId, key, at);

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
            const types = [AgentJob.entity.type];
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
    "the agent job status counts what waits and retries, per kind of request",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const empty = yield* Layer.build(database(url));
          // Before any host ran agent jobs, there is nothing to report.
          expect(
            yield* PostgresClusterStorage.agentJobStatus().pipe(Effect.provide(empty)),
          ).toEqual({ requests: [], retries: [] });
          // Reading rarely, so the retry a failed run schedules stays waiting through the test.
          const context = yield* Layer.build(cluster(url, "30 seconds"));
          const now = yield* DateTime.now;
          yield* Effect.gen(function* () {
            for (const id of ["missing", "failing", "fine"])
              yield* requestIn(Workspace.Id.make(id), `commit-${id}`);
            yield* requestIn(
              Workspace.Id.make("later"),
              "commit-later",
              DateTime.add(now, { hours: 1 }),
            );
            const deadline = (yield* Clock.currentTimeMillis) + 10_000;
            while (
              (yield* PostgresClusterStorage.agentJobStatus()).retries.length === 0 &&
              (yield* Clock.currentTimeMillis) < deadline
            )
              yield* Effect.sleep("100 millis");
            const status = yield* PostgresClusterStorage.agentJobStatus();
            // The later request and the failed one's retry wait; the others were handled.
            expect(status.requests).toEqual([
              {
                request: "AcceptWork",
                due: 0,
                scheduled: 2,
                retrying: 1,
                oldestDue: Option.none(),
              },
            ]);
            expect(status.retries).toMatchObject([
              { request: "AcceptWork", workspaceId: "failing", memberId: agent, attempt: 1 },
            ]);
          }).pipe(Effect.provide(context));
        }).pipe(Effect.scoped),
      ),
    30_000,
  );
});
