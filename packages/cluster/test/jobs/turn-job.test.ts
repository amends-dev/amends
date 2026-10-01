import { Commit, Store } from "@amends/core/journal";
import { Turn, TurnStore } from "@amends/core/turn";
import { Workspace } from "@amends/core/workspace";
import { WorkspaceTurnJobs } from "@amends/gateway";
import { expect, it } from "@effect/vitest";
import { Clock, Duration, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import {
  MessageStorage,
  RunnerHealth,
  Runners,
  RunnerStorage,
  Sharding,
  ShardingConfig,
} from "effect/unstable/cluster";
import { TurnJob } from "../../src/jobs/turn-job.ts";
import { TurnRunner } from "../../src/runner/runner.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const turnId = Turn.Id.make("turn-one");
const down = new TurnStore.Failure({ operation: "get", cause: "The database is down" });

/** Cluster in memory, reading for due requests every second of the test clock. */
const cluster = Sharding.layer.pipe(
  Layer.provideMerge(Runners.layerNoop),
  Layer.provideMerge(MessageStorage.layerMemory),
  Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop]),
  Layer.provide(ShardingConfig.layer({ entityMessagePollInterval: Duration.seconds(1) })),
);

/**
 * The worker and requests over a runner whose runs always fail, and which answers each attempt to
 * give the turn up as `abandon` says, recording when, by the test clock, each call happened.
 */
const turns = (abandon: (call: number) => Effect.Effect<void, TurnRunner.Failure>) => {
  const runs: Array<number> = [];
  const abandons: Array<number> = [];
  const runner = TurnRunner.Service.of({
    run: () =>
      Effect.gen(function* () {
        runs.push((yield* Clock.currentTimeMillis) / 1000);
        return yield* down;
      }),
    abandon: () =>
      Effect.gen(function* () {
        abandons.push((yield* Clock.currentTimeMillis) / 1000);
        return yield* abandon(abandons.length);
      }),
  });
  const layer = TurnJob.layer.pipe(
    Layer.provide(Layer.succeed(TurnRunner.Service, runner)),
    Layer.provideMerge(cluster),
  );
  return { runs, abandons, layer };
};

/** Ask for the turn to run, as the commit that created it does. */
const requestTurnJob = Effect.flatMap(WorkspaceTurnJobs.Service, (workspaceTurnJobs) =>
  workspaceTurnJobs.forWorkspace(workspaceId).request(turnId),
).pipe(
  Effect.provideService(Store.Transaction, {
    id: Commit.Id.make("commit-1"),
    append: () => Effect.die("Unexpected append"),
    // The test has no commit to wait for.
    afterCommit: (effect) => effect,
  }),
);

it.effect("a turn whose runs keep failing is given up after eight, and runs no more", () =>
  Effect.gen(function* () {
    const { runs, abandons, layer } = turns(() => Effect.void);
    yield* Effect.gen(function* () {
      yield* requestTurnJob;
      yield* TestClock.adjust("1 hour");
    }).pipe(Effect.provide(layer));
    // Two, four, eight, and on up to 128 seconds after each failure.
    expect(runs).toEqual([0, 2, 6, 14, 30, 62, 126, 254]);
    expect(abandons).toEqual([254]);
  }),
);

it.effect("a turn that can't be marked failed keeps trying until it is, without running", () =>
  Effect.gen(function* () {
    const { runs, abandons, layer } = turns((call) => (call <= 2 ? down : Effect.void));
    yield* Effect.gen(function* () {
      yield* requestTurnJob;
      yield* TestClock.adjust("2 hours");
    }).pipe(Effect.provide(layer));
    expect(runs).toHaveLength(TurnJob.maxFailedRuns);
    // At once when the runs give out, then after two and four seconds, as any retry waits.
    expect(abandons).toEqual([254, 256, 260]);
  }),
);
