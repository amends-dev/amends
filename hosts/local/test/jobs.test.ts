import { TurnJob } from "@amends-dev/cluster";
import { Integrations } from "@amends-dev/connection";
import { Store } from "@amends-dev/core/journal";
import { ThreadId } from "@amends-dev/core/thread";
import { SessionLogStore, TurnExecution, TurnJobs } from "@amends-dev/core/turn";
import { Member, Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { BunCrypto } from "@effect/platform-bun";
import {
  PostgresClusterStorage,
  type PostgresDatabase,
  PostgresWorkspaceStorage,
} from "@amends-dev/storage-postgresql";
import { describe, expect, it } from "@effect/vitest";
import { Clock, Context, Effect, Exit, Layer, Option, Redacted } from "effect";
import { SqlClient } from "effect/sql";
import * as LocalHost from "../src/LocalHost.ts";
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
  return Gateway.Gateway.of({
    createWorkspace: unexpected,
    asMember: unexpected,
    inWorkspace: (workspaceId, program) =>
      Effect.provideContext(
        program,
        Context.make(
          TurnExecution.TurnExecution,
          TurnExecution.TurnExecution.of({
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
            SessionLogStore.SessionLogStore,
            SessionLogStore.SessionLogStore.of({
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

/**
 * Turn jobs over the host's database and cluster, through `gateway`, waking runners and listening
 * for requests as a process that runs jobs does.
 */
const turnJobs = (
  gateway: Gateway.Gateway["Service"],
  database: ReturnType<typeof LocalHost.layerDatabase>,
) =>
  Layer.merge(TurnJob.layer, PostgresClusterStorage.layerWakeupListener).pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(Gateway.Gateway, gateway),
        Layer.effect(Integrations.Integrations, Integrations.make([])),
        BunCrypto.layer,
      ),
    ),
    Layer.provide(PostgresClusterStorage.layerWakeup),
    Layer.provideMerge(database),
  );

/** Turn job requests alone, as a process that serves the API and runs no jobs stores them. */
const turnJobRequests = (database: ReturnType<typeof LocalHost.layerDatabase>) =>
  TurnJob.layerRequests.pipe(
    Layer.provide(PostgresClusterStorage.layerWakeup),
    Layer.provideMerge(database),
  );

/** A job that ran: which process ran it, in which workspace. */
interface Ran {
  readonly runner: string;
  readonly workspaceId: Workspace.Id;
}

/** A gateway through which `runner`'s turn jobs find no work, recording in `runs` each that ran. */
const recordingRuns = (runs: Array<Ran>, runner: string) =>
  acceptingNothing((workspaceId) => runs.push({ runner, workspaceId }));

/**
 * In each workspace, commit a request to run its job through the requests `context` holds, going
 * on after the request as a real commit does, and wait for the job to run, failing for one that
 * has not run `within` milliseconds after its commit.
 */
const commitAndAwait = Effect.fnUntraced(function* (
  context: Context.Context<TurnJobs.TurnJobs | PostgresDatabase.PostgresDatabase>,
  runs: ReadonlyArray<Ran>,
  workspaceIds: ReadonlyArray<Workspace.Id>,
  within: number,
) {
  const storage = yield* PostgresWorkspaceStorage.make().pipe(Effect.provideContext(context));
  const requests = Context.get(context, TurnJobs.TurnJobs);
  for (const workspaceId of workspaceIds) {
    const store = Context.get(yield* storage.forWorkspace(workspaceId), Store.Store);
    yield* store.transaction(
      requests
        .requestRun({ workspaceId, memberId: job.memberId, threadId: job.threadId })
        .pipe(Effect.andThen(Effect.sleep("50 millis"))),
    );
    const committedAt = yield* Clock.currentTimeMillis;
    while (!runs.some((run) => run.workspaceId === workspaceId)) {
      if ((yield* Clock.currentTimeMillis) - committedAt > within)
        return yield* Effect.fail(`The job of ${workspaceId} waited for a runner's next poll`);
      yield* Effect.sleep("10 millis");
    }
  }
});

/** The workspaces of a round of requests, one for each of `count`. */
const workspacesOf = (round: string, count: number) =>
  Array.from({ length: count }, (_, index) => Workspace.Id.make(`${round}-${index}`));

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
          const storage = yield* PostgresWorkspaceStorage.make().pipe(Effect.provide(context));
          const store = Context.get(yield* storage.forWorkspace(job.workspaceId), Store.Store);
          const requests = Context.get(context, TurnJobs.TurnJobs);
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
          const storage = yield* PostgresWorkspaceStorage.make().pipe(Effect.provide(context));
          const store = Context.get(yield* storage.forWorkspace(job.workspaceId), Store.Store);
          const requests = Context.get(context, TurnJobs.TurnJobs);
          // A commit goes on after it makes a request, as a real one does with its later facts
          // and staged writes, so Cluster's own look comes before the request is there to find.
          for (let commit = 1; commit <= 5; commit++) {
            yield* store.transaction(
              requests.requestRun(job).pipe(Effect.andThen(Effect.sleep("100 millis"))),
            );
            const committedAt = yield* Clock.currentTimeMillis;
            // `runs` grows in the runner's fiber, which the rule cannot see.
            // oxlint-disable-next-line eslint/no-unmodified-loop-condition
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

  // A process that serves the API runs no jobs: its commits store requests, and wake the process
  // that runs each job, which reads them at once rather than at its next poll, here a minute away.
  it.live(
    "a request committed where no job runs reaches the process that runs its job at once",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const runs: Array<Ran> = [];
          yield* Layer.build(
            turnJobs(
              recordingRuns(runs, "runner"),
              LocalHost.layerDatabase(Redacted.make(url), { pollInterval: "1 minute" }),
            ),
          );
          const api = yield* Layer.build(
            turnJobRequests(LocalHost.layerDatabase(Redacted.make(url), { runJobs: false })),
          );
          // The runner takes every shard as it starts, and reads what was stored before.
          yield* commitAndAwait(api, runs, workspacesOf("first", 1), 30_000);
          yield* commitAndAwait(api, runs, workspacesOf("then", 5), 2_000);
          expect(runs.every((run) => run.runner === "runner")).toBe(true);
        }).pipe(Effect.scoped),
      ),
    60_000,
  );

  // Processes that run jobs share them out. A request committed in one reaches whichever runs its
  // job at once, over the database alone or over sockets too.
  for (const runnerTransport of ["storage", "socket"] as const)
    it.live(
      `over ${runnerTransport}, a committed request reaches the process that runs its job at once`,
      () =>
        withDatabase((url) =>
          Effect.gen(function* () {
            const runs: Array<Ran> = [];
            const runner = (name: string, port: number) =>
              turnJobs(
                recordingRuns(runs, name),
                LocalHost.layerDatabase(Redacted.make(url), {
                  runnerAddress: { host: "localhost", port },
                  runnerTransport,
                  pollInterval: "1 minute",
                }),
              );
            const first = yield* Layer.build(runner("first", 34471));
            yield* Layer.build(runner("second", 34472));
            // The processes share out the shards a few seconds after both start; until then a
            // request may wait for a shard to change hands.
            for (let round = 0; !runs.some((run) => run.runner === "second"); round++)
              yield* commitAndAwait(first, runs, workspacesOf(`warm-${round}`, 10), 30_000);
            runs.length = 0;
            yield* commitAndAwait(first, runs, workspacesOf("shared", 20), 2_000);
            expect(new Set(runs.map((run) => run.runner))).toEqual(new Set(["first", "second"]));
          }).pipe(Effect.scoped),
        ),
      90_000,
    );
});
