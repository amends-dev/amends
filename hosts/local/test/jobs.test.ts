import { TurnJob } from "@amends-dev/cluster";
import { Integrations } from "@amends-dev/connection";
import { Commit, Store } from "@amends-dev/core/journal";
import { ThreadId } from "@amends-dev/core/thread";
import { SessionLogStore, TurnExecution, TurnJobs } from "@amends-dev/core/turn";
import { Member, Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { PostgresStorage } from "@amends-dev/storage-postgresql";
import { describe, expect, it } from "@effect/vitest";
import { Clock, Context, Duration, Effect, Exit, Layer, Option, Redacted } from "effect";
import { SqlClient } from "effect/sql";
import { LocalHost } from "../src/host.ts";
import { setup } from "./database.ts";

const { available, withDatabase } = setup();
const job: TurnJobs.Job = {
  workspaceId: Workspace.Id.make("workspace-one"),
  memberId: Member.Id.make("agent-member"),
  threadId: ThreadId.Id.make("thread-one"),
};

/**
 * A gateway through which a turn job finds no work, telling `ran` in which workspace it looked:
 * accepting gives no turn, and nothing else is reached.
 */
const acceptingNothing = (ran: (workspaceId: Workspace.Id) => void) => {
  const unexpected = () => Effect.die("Only accepting work is expected");
  return Gateway.Service.of({
    createWorkspace: unexpected,
    asMember: unexpected,
    inWorkspace: (workspaceId, program) =>
      Effect.provideContext(
        program,
        Context.make(
          TurnExecution.Service,
          TurnExecution.Service.of({
            accept: () => Effect.sync(() => ran(workspaceId)).pipe(Effect.as(Option.none())),
            start: unexpected,
            joinedConversation: unexpected,
            showDraft: unexpected,
            close: unexpected,
            fail: unexpected,
            confirmStopped: unexpected,
          }),
        ).pipe(
          Context.add(
            SessionLogStore.Service,
            SessionLogStore.Service.of({
              head: unexpected,
              append: unexpected,
              read: unexpected,
              waitForAppend: unexpected,
            }),
          ),
        ),
      ) as Effect.Effect<never>,
  });
};

/** Turn jobs over the host's database and cluster, through `gateway`. */
const turnJobs = (
  gateway: Gateway.Interface,
  database: ReturnType<typeof LocalHost.layerDatabase>,
) =>
  TurnJob.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(Gateway.Service, gateway),
        Layer.effect(Integrations.Integrations, Integrations.make([])),
        BunCrypto.layer,
      ),
    ),
    Layer.provideMerge(database),
  );

describe.skipIf(!available)("jobs on the local host", () => {
  // The host's database and cluster share one client, so Cluster stores a request on the connection
  // of the commit that asks for it.
  it.live(
    "a request asked for inside a commit is stored with it, and not if it rolls back",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const runs: Array<Workspace.Id> = [];
          const context = yield* Layer.build(
            turnJobs(
              acceptingNothing((workspaceId) => runs.push(workspaceId)),
              LocalHost.layerDatabase(Redacted.make(url)),
            ),
          );
          const storage = yield* PostgresStorage.make().pipe(Effect.provide(context));
          const store = Context.get(yield* storage.forWorkspace(job.workspaceId), Store.Service);
          const requests = Context.get(context, TurnJobs.Service);
          const stored = Effect.flatMap(
            SqlClient.SqlClient,
            (sql) => sql<{ readonly count: number }>`
            SELECT count(*)::int AS count FROM cluster_messages
            WHERE entity_type = 'amends/TurnJob'`,
          ).pipe(
            Effect.map(([row]) => row?.count ?? 0),
            Effect.orDie,
            Effect.provide(context),
          );
          const rolledBack = yield* Effect.exit(
            store.transaction(
              requests.requestRun(job).pipe(Effect.andThen(Effect.fail("abandon"))),
            ),
          );
          expect(Exit.isFailure(rolledBack)).toBe(true);
          expect(yield* stored).toBe(0);
          yield* store.transaction(requests.requestRun(job));
          expect(yield* stored).toBe(1);
          // The committed request reaches the worker; the rolled-back one never existed.
          yield* Effect.sleep("3 seconds");
          expect(runs).toEqual([job.workspaceId]);
        }).pipe(Effect.scoped),
      ),
    30_000,
  );

  // Cluster looks for a request as it stores it, before the commit can show it. Once the commit is
  // done the runner reads again, so the request does not wait for its next poll, here a minute away.
  it.live(
    "a committed request runs at once, not at the runner's next poll",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          let runs = 0;
          const context = yield* Layer.build(
            turnJobs(
              acceptingNothing(() => {
                runs += 1;
              }),
              LocalHost.layerDatabase(Redacted.make(url), { pollInterval: "1 minute" }),
            ),
          );
          const storage = yield* PostgresStorage.make().pipe(Effect.provide(context));
          const store = Context.get(yield* storage.forWorkspace(job.workspaceId), Store.Service);
          const requests = Context.get(context, TurnJobs.Service);
          // A commit goes on after it makes a request, as a real one does with its later facts
          // and staged writes, so Cluster's own look comes before the request is there to find.
          for (let commit = 1; commit <= 5; commit++) {
            yield* store.transaction(
              requests.requestRun(job).pipe(Effect.andThen(Effect.sleep("100 millis"))),
            );
            const committedAt = yield* Clock.currentTimeMillis;
            while (runs < commit) {
              if ((yield* Clock.currentTimeMillis) - committedAt > 5_000)
                return expect.fail(`Request ${commit} waited for the runner's next poll`);
              yield* Effect.sleep("10 millis");
            }
          }
          expect(runs).toBe(5);
        }).pipe(Effect.scoped),
      ),
    60_000,
  );

  it.effect("a process refuses to start at a runner address another process holds", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const at = (port: number) =>
          LocalHost.layerDatabase(Redacted.make(url), {
            runnerAddress: { host: "localhost", port },
          });
        yield* Layer.build(at(34461));
        expect(yield* Effect.flip(Effect.scoped(Layer.build(at(34461))))).toMatchObject({
          _tag: "PostgresClusterStorage.AddressTaken",
          address: "localhost:34461",
        });
        // A process at its own address runs beside it.
        yield* Effect.scoped(Layer.build(at(34462)));
      }).pipe(Effect.scoped),
    ),
  );

  // Two processes over one database, linked by sockets: a request for a job the other process
  // runs reaches it at once, well before its next read of the database.
  it.live(
    "over sockets, a request reaches the process that runs its job without waiting for a read",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const runs: Array<{ readonly runner: string; readonly workspaceId: string }> = [];
          const runner = (name: string, port: number) =>
            turnJobs(
              acceptingNothing((workspaceId) => runs.push({ runner: name, workspaceId })),
              LocalHost.layerDatabase(Redacted.make(url), {
                runnerAddress: { host: "localhost", port },
                runnerTransport: "socket",
                pollInterval: "5 seconds",
              }),
            );
          const first = yield* Layer.build(runner("first", 34471));
          yield* Layer.build(runner("second", 34472));
          const requests = Context.get(first, TurnJobs.Service);
          const workspaces = Array.from({ length: 20 }, (_, index) =>
            Workspace.Id.make(`workspace-${index}`),
          );
          const round = (name: string) =>
            Effect.forEach(
              workspaces,
              (workspaceId) =>
                requests
                  .requestRun({ workspaceId, memberId: job.memberId, threadId: job.threadId })
                  .pipe(
                    Effect.provideService(Store.Transaction, {
                      id: Commit.Id.make(`${name}:${workspaceId}`),
                      append: () => Effect.die("Unexpected append"),
                      afterCommit: (effect) => effect,
                    }),
                  ),
              { discard: true },
            );
          const ran = (count: number, within: Duration.Input) =>
            Effect.gen(function* () {
              const deadline = (yield* Clock.currentTimeMillis) + Duration.toMillis(within);
              while (runs.length < count && (yield* Clock.currentTimeMillis) < deadline)
                yield* Effect.sleep("20 millis");
              return runs.length;
            });
          // The processes share out the jobs once both run, a few seconds after starting.
          const deadline = (yield* Clock.currentTimeMillis) + 30_000;
          for (let attempt = 0; !runs.some((run) => run.runner === "second"); attempt++) {
            if ((yield* Clock.currentTimeMillis) > deadline)
              return expect.fail("The second process never took a job");
            runs.length = 0;
            yield* round(`warm-${attempt}`);
            yield* ran(20, "10 seconds");
            yield* Effect.sleep("1 second");
          }
          runs.length = 0;
          yield* round("warmed");
          expect(yield* ran(20, "1 second")).toBe(20);
          expect(runs.some((run) => run.runner === "second")).toBe(true);
        }).pipe(Effect.scoped),
      ),
    60_000,
  );
});
