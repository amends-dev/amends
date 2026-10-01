import { expect, it } from "@effect/vitest";
import { DateTime, Duration, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import {
  MessageStorage,
  RunnerHealth,
  Runners,
  RunnerStorage,
  Sharding,
  ShardingConfig,
} from "effect/unstable/cluster";
import { ClusterPruning } from "../src/cluster-pruning.ts";

/** Cluster in memory, reading for due messages every second of the test clock. */
const cluster = Sharding.layer.pipe(
  Layer.provideMerge(Runners.layerNoop),
  Layer.provideMerge(MessageStorage.layerMemory),
  Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop]),
  Layer.provide(ShardingConfig.layer({ entityMessagePollInterval: Duration.seconds(1) })),
);

it.effect("handled requests are pruned every hour, once they are a week old", () =>
  Effect.gen(function* () {
    const calls: Array<{ readonly types: ReadonlyArray<string>; readonly before: number }> = [];
    const pruning = ClusterPruning.layer({
      prune: (types, before) =>
        Effect.sync(() => {
          calls.push({ types, before: DateTime.toEpochMillis(before) });
          return 0;
        }),
      entityTypes: ["amends/WorkspaceProcess", "amends/Turn"],
    }).pipe(Layer.provideMerge(cluster));
    yield* TestClock.adjust("3 hours").pipe(Effect.provide(pruning), Effect.scoped);
    const week = Duration.toMillis(Duration.days(7));
    const hour = Duration.toMillis(Duration.hours(1));
    // The entity types it was given, and the job's own past runs.
    expect(calls).toEqual(
      [1, 2, 3].map((hours) => ({
        types: [
          "amends/WorkspaceProcess",
          "amends/Turn",
          "ClusterCron/amends/prune-handled-requests",
        ],
        before: hours * hour - week,
      })),
    );
  }),
);
