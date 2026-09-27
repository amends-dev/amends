import { BackgroundProcess, BackgroundRuns } from "@amends/core/background";
import { Commit, Store } from "@amends/core/journal";
import { Workspace } from "@amends/core/workspace";
import { expect, it } from "@effect/vitest";
import { Clock, Crypto, DateTime, Duration, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import {
  MessageStorage,
  RunnerHealth,
  Runners,
  RunnerStorage,
  Sharding,
  ShardingConfig,
} from "effect/unstable/cluster";
import { ClusterBackground } from "../src/cluster-background.ts";
import { GatewayErrors } from "../src/errors.ts";
import { Gateway } from "../src/gateway.ts";
import { WorkspaceWakes } from "../src/wakes.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const process = BackgroundProcess.Name.make("test.work");
type RunError = BackgroundRuns.Unknown | BackgroundRuns.Failure | GatewayErrors.WorkspaceNotFound;

/** Cluster in memory, reading for due wakes every second of the test clock. */
const cluster = Sharding.layer.pipe(
  Layer.provideMerge(Runners.layerNoop),
  Layer.provideMerge(MessageStorage.layerMemory),
  Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop]),
  Layer.provide(ShardingConfig.layer({ entityMessagePollInterval: Duration.seconds(1) })),
);

/**
 * The worker and wakes over a gateway that only runs background processes, answering each run
 * as `respond` says, and recording when, by the test clock, each run happened.
 */
const background = (
  respond: (run: number) => Effect.Effect<BackgroundProcess.Outcome, RunError>,
) => {
  const runs: Array<number> = [];
  const unexpected = () => Effect.die("Only background runs are expected");
  const gateway = Gateway.Service.of({
    createWorkspace: unexpected,
    inWorkspace: unexpected,
    asMember: unexpected,
    asMemberScoped: unexpected,
    runBackground: (id, name) =>
      Effect.gen(function* () {
        expect([id, name]).toEqual([workspaceId, process]);
        runs.push(yield* Clock.currentTimeMillis);
        return yield* respond(runs.length);
      }),
  });
  const layer = ClusterBackground.layer.pipe(
    Layer.provide(Layer.succeed(Gateway.Service, gateway)),
    Layer.provide(
      Layer.succeed(
        Crypto.Crypto,
        Crypto.make({
          randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
          digest: () => Effect.die("Unexpected digest"),
        }),
      ),
    ),
    Layer.provideMerge(cluster),
  );
  return { runs, layer };
};

/** Ask for the process to run from inside a commit with this ID. */
const wakeIn = (commit: string, at?: DateTime.Utc) =>
  Effect.flatMap(WorkspaceWakes.Service, (wakes) =>
    wakes.forWorkspace(workspaceId).request(process, { at }),
  ).pipe(
    Effect.provideService(Store.Transaction, {
      id: Commit.Id.make(commit),
      append: () => Effect.die("Unexpected append"),
    }),
  );

const seconds = (runs: ReadonlyArray<number>) => runs.map((at) => at / 1000);

it.effect("a commit's wake runs the process once, however often the commit asks", () =>
  Effect.gen(function* () {
    const { runs, layer } = background(() => Effect.succeed(BackgroundProcess.idle));
    yield* Effect.gen(function* () {
      yield* wakeIn("commit-1");
      yield* wakeIn("commit-1");
      yield* TestClock.adjust("5 seconds");
      yield* wakeIn("commit-2");
      yield* TestClock.adjust("5 seconds");
    }).pipe(Effect.provide(layer));
    expect(runs).toHaveLength(2);
  }),
);

it.effect("a process runs again at once while more is outstanding, and then when it is due", () =>
  Effect.gen(function* () {
    const { runs, layer } = background((run) =>
      Effect.gen(function* () {
        if (run === 1) return BackgroundProcess.continuing;
        if (run === 2)
          return BackgroundProcess.dueAt(DateTime.add(yield* DateTime.now, { minutes: 1 }));
        return BackgroundProcess.idle;
      }),
    );
    yield* Effect.gen(function* () {
      yield* wakeIn("commit-1");
      yield* TestClock.adjust("59 seconds");
      expect(runs).toHaveLength(2);
      yield* TestClock.adjust("2 seconds");
      yield* TestClock.adjust("58 minutes");
    }).pipe(Effect.provide(layer));
    expect(seconds(runs)).toEqual([0, 0, 60]);
  }),
);

it.effect("a process that asks again for the time its wake reached runs again", () =>
  Effect.gen(function* () {
    let due: DateTime.Utc | undefined;
    const { runs, layer } = background((run) =>
      Effect.gen(function* () {
        if (run === 1) {
          due = DateTime.add(yield* DateTime.now, { minutes: 1 });
          return BackgroundProcess.dueAt(due);
        }
        // Its clock a little behind the database's, the run at that time still finds it due then.
        if (run === 2 && due !== undefined) return BackgroundProcess.dueAt(due);
        return BackgroundProcess.idle;
      }),
    );
    yield* Effect.gen(function* () {
      yield* wakeIn("commit-1");
      yield* TestClock.adjust("2 minutes");
    }).pipe(Effect.provide(layer));
    expect(seconds(runs)).toEqual([0, 60, 60]);
  }),
);

it.effect("runs that each ask for the same later time wake the process once then", () =>
  Effect.gen(function* () {
    const start = yield* DateTime.now;
    const due = DateTime.add(start, { minutes: 10 });
    const { runs, layer } = background((run) =>
      Effect.succeed(run <= 3 ? BackgroundProcess.dueAt(due) : BackgroundProcess.idle),
    );
    yield* Effect.gen(function* () {
      for (const commit of ["commit-1", "commit-2", "commit-3"]) {
        yield* wakeIn(commit);
        yield* TestClock.adjust("5 seconds");
      }
      yield* TestClock.adjust("15 minutes");
    }).pipe(Effect.provide(layer));
    expect(seconds(runs)).toEqual([0, 5, 10, 600]);
  }),
);

it.effect("a failing process runs again after a backoff that doubles", () =>
  Effect.gen(function* () {
    const { runs, layer } = background((run) =>
      run <= 3
        ? Effect.fail(new BackgroundRuns.Failure({ process, cause: "not yet" }))
        : Effect.succeed(BackgroundProcess.idle),
    );
    yield* Effect.gen(function* () {
      yield* wakeIn("commit-1");
      yield* TestClock.adjust("1 hour");
    }).pipe(Effect.provide(layer));
    // Two, four, and eight seconds after each failure, to within a read of the storage.
    expect(seconds(runs)).toEqual([0, 2, 6, 14]);
  }),
);

it.effect("an unknown process is dropped after ten runs, a missing workspace after one", () =>
  Effect.gen(function* () {
    const unknown = background(() => Effect.fail(new BackgroundRuns.Unknown({ process })));
    yield* Effect.gen(function* () {
      yield* wakeIn("commit-1");
      // Its nine backoffs add up to under fifteen minutes; after them, nothing runs again.
      yield* TestClock.adjust("15 minutes");
      expect(unknown.runs).toHaveLength(ClusterBackground.unknownAttempts);
      yield* TestClock.adjust("15 minutes");
    }).pipe(Effect.provide(unknown.layer));
    expect(unknown.runs).toHaveLength(ClusterBackground.unknownAttempts);
    const missing = background(() =>
      Effect.fail(new GatewayErrors.WorkspaceNotFound({ workspaceId })),
    );
    yield* Effect.gen(function* () {
      yield* wakeIn("commit-1");
      yield* TestClock.adjust("15 minutes");
    }).pipe(Effect.provide(missing.layer));
    expect(missing.runs).toHaveLength(1);
  }),
);

it.effect("a wake asked for a later time waits for it", () =>
  Effect.gen(function* () {
    const { runs, layer } = background(() => Effect.succeed(BackgroundProcess.idle));
    yield* Effect.gen(function* () {
      yield* wakeIn("commit-1", DateTime.add(yield* DateTime.now, { minutes: 5 }));
      yield* TestClock.adjust("4 minutes");
      expect(runs).toHaveLength(0);
      yield* TestClock.adjust("2 minutes");
    }).pipe(Effect.provide(layer));
    expect(seconds(runs)).toEqual([300]);
  }),
);

it.effect("handled wakes are pruned every hour, once they are a week old", () =>
  Effect.gen(function* () {
    const calls: Array<{ readonly types: ReadonlyArray<string>; readonly before: number }> = [];
    const pruning = ClusterBackground.layerPruning({
      prune: (types, before) =>
        Effect.sync(() => {
          calls.push({ types, before: DateTime.toEpochMillis(before) });
          return 0;
        }),
    }).pipe(Layer.provideMerge(cluster));
    yield* TestClock.adjust("3 hours").pipe(Effect.provide(pruning), Effect.scoped);
    const week = Duration.toMillis(Duration.days(7));
    const hour = Duration.toMillis(Duration.hours(1));
    expect(calls).toEqual(
      [1, 2, 3].map((hours) => ({
        types: ["amends/WorkspaceProcess", "ClusterCron/amends/prune-wakes"],
        before: hours * hour - week,
      })),
    );
  }),
);
