import { TurnJobs } from "@amends-dev/core/turn"
import { Gateway } from "@amends-dev/gateway"
import type { StreamPart } from "@amends-dev/harness"
import { Commit, Store } from "@amends-dev/log"
import { describe, expect, it } from "@effect/vitest"
import { Duration, Effect, Layer, Stream } from "effect"
import { MessageStorage, RunnerHealth, Runners, RunnerStorage, Sharding, ShardingConfig } from "effect/cluster"
import { TestClock } from "effect/testing"
import * as JobRequests from "../../src/JobRequests.ts"
import * as TurnJob from "../../src/TurnJob.ts"
import {
  type FakeWorkspace,
  type FakeWorkspaceOptions,
  finish,
  integrationsFor,
  job,
  makeFakeWorkspace,
  makeScriptedAgent,
  turn,
  writing
} from "../turns/fakes.ts"

/** Cluster in memory, reading for due messages every second of the test clock. */
const cluster = Sharding.layer.pipe(
  Layer.provideMerge(Runners.layerNoop),
  Layer.provideMerge(MessageStorage.layerMemory),
  Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop]),
  Layer.provide(ShardingConfig.layer({ entityMessagePollInterval: Duration.seconds(1) }))
)

/**
 * Turn jobs on Cluster in memory, over a workspace in memory whose agent's turns stream `script`,
 * with the workspace to look into.
 */
const turnJobsFor = Effect.fnUntraced(function* (
  script: Stream.Stream<StreamPart.StreamPart>,
  options: FakeWorkspaceOptions = {}
) {
  const workspace = yield* makeFakeWorkspace(options)
  const layer = TurnJob.layer.pipe(
    Layer.provide(JobRequests.layerWakeLocal),
    Layer.provideMerge(cluster),
    Layer.provide(
      Layer.merge(Layer.succeed(Gateway.Gateway, workspace.gateway), integrationsFor(makeScriptedAgent(script).agent))
    )
  )
  return { workspace, layer }
})

/** Run `request` in a commit `commitId`, then what it asked to run once the commit is done. */
const inCommit = <E>(
  commitId: string,
  request: (turnJobs: TurnJobs.TurnJobs["Service"]) => Effect.Effect<void, E, Store.Transaction>
) =>
  Effect.gen(function* () {
    const afterCommit: Array<Effect.Effect<void>> = []
    const storeTransaction = Store.Transaction.of({
      id: Commit.CommitId.make(commitId),
      append: () => Effect.die("The test commit appends nothing"),
      afterCommit: (effect) => Effect.sync(() => void afterCommit.push(effect))
    })
    yield* Effect.flatMap(TurnJobs.TurnJobs, request).pipe(Effect.provideService(Store.Transaction, storeTransaction))
    yield* Effect.forEach(afterCommit, (effect) => effect, { discard: true })
  })

/** Move the test clock on a second at a time until `done`, for at most `limit`. */
const until = (done: () => boolean, limit: Duration.Input = "1 minute") =>
  Effect.gen(function* () {
    const seconds = Duration.toSeconds(Duration.fromInputUnsafe(limit))
    for (let second = 0; second < seconds && !done(); second++) yield* TestClock.adjust("1 second")
  })

const hasEnded = (workspace: FakeWorkspace) => () => workspace.endings().length > 0

describe("a turn job", () => {
  it.effect("runs the agent's turn when a commit asks it to", () =>
    Effect.gen(function* () {
      const { workspace, layer } = yield* turnJobsFor(Stream.fromIterable([...writing("Done."), finish]))
      yield* Effect.gen(function* () {
        yield* inCommit("commit-1", (turnJobs) => turnJobs.requestRun(job))
        yield* until(hasEnded(workspace))
      }).pipe(Effect.provide(layer), Effect.scoped)
      expect(workspace.endings()).toMatchObject([{ kind: "close", reply: "Done." }])
    })
  )

  it.effect("stops the turn it runs when a commit asks it to", () =>
    Effect.gen(function* () {
      const { workspace, layer } = yield* turnJobsFor(
        Stream.concat(
          Stream.fromIterable<StreamPart.StreamPart>([
            { type: "text-start", id: "answer" },
            { type: "text-delta", id: "answer", delta: "Halfway" }
          ]),
          Stream.never
        )
      )
      yield* Effect.gen(function* () {
        yield* inCommit("commit-1", (turnJobs) => turnJobs.requestRun(job))
        yield* until(() => workspace.drafts().length > 0)
        yield* inCommit("commit-2", (turnJobs) => turnJobs.requestStop(Object.assign({ turnId: turn.id }, job)))
        yield* until(hasEnded(workspace))
      }).pipe(Effect.provide(layer), Effect.scoped)
      expect(workspace.endings()).toMatchObject([{ kind: "stop" }])
    })
  )

  it.effect("runs a turn again after its run failed, and gives it up once its runs keep failing", () =>
    Effect.gen(function* () {
      const recovers = yield* turnJobsFor(Stream.fromIterable([...writing("Done."), finish]), {
        failedStarts: 2
      })
      yield* Effect.gen(function* () {
        yield* inCommit("commit-1", (turnJobs) => turnJobs.requestRun(job))
        yield* until(hasEnded(recovers.workspace))
      }).pipe(Effect.provide(recovers.layer), Effect.scoped)
      expect(recovers.workspace.starts()).toBe(3)
      expect(recovers.workspace.endings()).toMatchObject([{ kind: "close", reply: "Done." }])

      const failing = yield* turnJobsFor(Stream.fromIterable([...writing("Done."), finish]), {
        failedStarts: JobRequests.maxFailures
      })
      yield* Effect.gen(function* () {
        yield* inCommit("commit-1", (turnJobs) => turnJobs.requestRun(job))
        yield* until(hasEnded(failing.workspace), "20 minutes")
      }).pipe(Effect.provide(failing.layer), Effect.scoped)
      expect(failing.workspace.starts()).toBe(JobRequests.maxFailures)
      expect(failing.workspace.endings()).toEqual([
        { kind: "fail", reason: "Its turn job kept failing to run it.", resume: undefined }
      ])
    })
  )

  it.effect("drops a request whose workspace was never created, without trying again", () =>
    Effect.gen(function* () {
      const { workspace, layer } = yield* turnJobsFor(Stream.empty, { created: false })
      yield* Effect.gen(function* () {
        yield* inCommit("commit-1", (turnJobs) => turnJobs.requestRun(job))
        yield* until(() => workspace.entered() > 1, "10 seconds")
      }).pipe(Effect.provide(layer), Effect.scoped)
      expect(workspace.entered()).toBe(1)
      expect(workspace.endings()).toEqual([])
    })
  )
})
