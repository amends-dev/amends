import { Commit, Store } from "@amends/core/journal";
import { AgentJobs, AgentWork, TurnStore } from "@amends/core/turn";
import { Member, Workspace } from "@amends/core/workspace";
import { expect, it } from "@effect/vitest";
import { Clock, Crypto, Duration, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import {
  MessageStorage,
  RunnerHealth,
  Runners,
  RunnerStorage,
  Sharding,
  ShardingConfig,
} from "effect/cluster";
import { Gateway, GatewayErrors } from "@amends/gateway";
import { AgentJob } from "../../src/jobs/agent-job.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const agent = Member.Id.make("agent-member");
const other = Member.Id.make("other-member");

/** Cluster in memory, reading for due requests every second of the test clock. */
const cluster = Sharding.layer.pipe(
  Layer.provideMerge(Runners.layerNoop),
  Layer.provideMerge(MessageStorage.layerMemory),
  Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop]),
  Layer.provide(ShardingConfig.layer({ entityMessagePollInterval: Duration.seconds(1) })),
);

interface Run {
  readonly work: keyof AgentWork.Interface;
  readonly memberId: Member.Id;
  /** When the run happened, in seconds of the test clock. */
  readonly at: number;
}

/**
 * The worker and requests over a gateway that only does agents' work, answering each run as
 * `respond` says, and recording which work ran for whom, and when. A workspace that is `missing`
 * is never entered.
 */
const agentJobs = (
  options: {
    readonly respond?: (run: number) => Effect.Effect<void, AgentWork.Error>;
    readonly missing?: boolean;
  } = {},
) => {
  const runs: Array<Run> = [];
  const entered = { count: 0 };
  const unexpected = () => Effect.die("Only agents' work is expected");
  const record = (work: Run["work"]) => (memberId: Member.Id) =>
    Effect.gen(function* () {
      runs.push({ work, memberId, at: (yield* Clock.currentTimeMillis) / 1000 });
      return yield* (options.respond ?? (() => Effect.void))(runs.length);
    });
  const agentWork = AgentWork.Service.of({
    acceptWork: record("acceptWork"),
    stopDepartedTurns: record("stopDepartedTurns"),
  });
  const gateway = Gateway.Service.of({
    createWorkspace: unexpected,
    asMember: unexpected,
    // Agents' work, without the gateway's mapping of failures to public ones.
    inWorkspace: <A, E>(id: Workspace.Id, program: Effect.Effect<A, E, unknown>) => {
      expect(id).toBe(workspaceId);
      entered.count += 1;
      if (options.missing === true)
        return Effect.fail(new GatewayErrors.WorkspaceNotFound({ workspaceId: id }));
      return Effect.provideService(
        program as Effect.Effect<A, GatewayErrors.PublicErrorOf<E>, AgentWork.Service>,
        AgentWork.Service,
        agentWork,
      );
    },
  });
  const layer = AgentJob.layer.pipe(
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
  return { runs, entered, layer };
};

/** Run a request from inside a commit with this ID. */
const inCommit =
  (commit: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(Store.Transaction, {
        id: Commit.Id.make(commit),
        append: () => Effect.die("Unexpected append"),
        // The test has no commit to wait for.
        afterCommit: (effect) => effect,
      }),
    );
const acceptWork = (memberId: Member.Id, commit: string) =>
  Effect.flatMap(AgentJobs.Service, (agentJobs) =>
    agentJobs.requestAcceptWork({ workspaceId, memberId }),
  ).pipe(inCommit(commit));
const stopDepartedTurns = (memberId: Member.Id, commit: string) =>
  Effect.flatMap(AgentJobs.Service, (agentJobs) =>
    agentJobs.requestStopDepartedTurns({ workspaceId, memberId }),
  ).pipe(inCommit(commit));

it.effect("a commit's request does its work once for its agent, however often it asks", () =>
  Effect.gen(function* () {
    const { runs, layer } = agentJobs();
    yield* Effect.gen(function* () {
      yield* acceptWork(agent, "commit-1");
      yield* acceptWork(agent, "commit-1");
      yield* stopDepartedTurns(agent, "commit-1");
      yield* acceptWork(other, "commit-1");
      yield* TestClock.adjust("5 seconds");
      yield* acceptWork(agent, "commit-2");
      yield* TestClock.adjust("5 seconds");
    }).pipe(Effect.provide(layer));
    expect(runs.filter((run) => run.memberId === agent)).toEqual([
      { work: "acceptWork", memberId: agent, at: 0 },
      { work: "stopDepartedTurns", memberId: agent, at: 0 },
      { work: "acceptWork", memberId: agent, at: 5 },
    ]);
    expect(runs.filter((run) => run.memberId === other)).toEqual([
      { work: "acceptWork", memberId: other, at: 0 },
    ]);
  }),
);

it.effect("failing work runs again after a backoff that doubles", () =>
  Effect.gen(function* () {
    const { runs, layer } = agentJobs({
      respond: (run) =>
        run <= 3
          ? Effect.fail(new TurnStore.Failure({ operation: "get", cause: "not yet" }))
          : Effect.void,
    });
    yield* Effect.gen(function* () {
      yield* acceptWork(agent, "commit-1");
      yield* TestClock.adjust("1 hour");
    }).pipe(Effect.provide(layer));
    // Two, four, and eight seconds after each failure, to within a read of the storage.
    expect(runs.map((run) => run.at)).toEqual([0, 2, 6, 14]);
  }),
);

it.effect("work for a workspace that was never created is dropped after one run", () =>
  Effect.gen(function* () {
    const { runs, entered, layer } = agentJobs({ missing: true });
    yield* Effect.gen(function* () {
      yield* stopDepartedTurns(agent, "commit-1");
      yield* TestClock.adjust("15 minutes");
    }).pipe(Effect.provide(layer));
    expect(entered.count).toBe(1);
    expect(runs).toEqual([]);
  }),
);
