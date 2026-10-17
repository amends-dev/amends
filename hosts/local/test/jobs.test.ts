import { TurnJob } from "@amends-dev/cluster"
import { Integrations } from "@amends-dev/connection"
import { ThreadId } from "@amends-dev/core/thread"
import { SessionLogStore, TurnExecution, TurnJobs } from "@amends-dev/core/turn"
import { WorkspaceId, MemberId } from "@amends-dev/core/workspace"
import { Gateway } from "@amends-dev/gateway"
import { Store } from "@amends-dev/log"
import { PostgresClusterStorage, type PostgresDatabase, PostgresWorkspaceStorage } from "@amends-dev/storage-postgresql"
import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Context, type Crypto, type Duration, Effect, Exit, Layer, Option, Queue, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import * as LocalHost from "../src/LocalHost.ts"
import { setup } from "./database.ts"

const { available, withDatabase } = setup()
const job: TurnJobs.Job = {
  workspaceId: WorkspaceId.WorkspaceId.make("workspace-one"),
  memberId: MemberId.MemberId.make("agent-member"),
  threadId: ThreadId.ThreadId.make("thread-one")
}

/**
 * A gateway through which a turn job finds no work, telling `ran` in which workspace it looked:
 * accepting gives no turn, and nothing else is reached.
 */
const acceptingNothing = (ran: (workspaceId: WorkspaceId.WorkspaceId) => Effect.Effect<void>) => {
  const unexpected = () => Effect.die("Only accepting work is expected")
  return Gateway.Gateway.of({
    createWorkspace: unexpected,
    asMember: unexpected,
    inWorkspace: (workspaceId, program) =>
      Effect.provideContext(
        program,
        Context.make(
          TurnExecution.TurnExecution,
          TurnExecution.TurnExecution.of({
            accept: () => ran(workspaceId).pipe(Effect.as(Option.none())),
            start: unexpected,
            joinedConversation: unexpected,
            showDraft: unexpected,
            close: unexpected,
            fail: unexpected,
            confirmStopped: unexpected
          })
        ).pipe(
          Context.add(
            SessionLogStore.SessionLogStore,
            SessionLogStore.SessionLogStore.of({
              head: unexpected,
              append: unexpected,
              read: unexpected,
              waitForAppend: unexpected
            })
          )
        )
      ) as Effect.Effect<never>
  })
}

/**
 * Turn jobs over the host's database and cluster, through `gateway`, waking runners and listening
 * for requests as a process that runs jobs does.
 */
const turnJobs = (gateway: Gateway.Gateway["Service"], database: ReturnType<typeof LocalHost.layerDatabase>) =>
  Layer.merge(TurnJob.layer, PostgresClusterStorage.layerWakeupListener).pipe(
    Layer.provide([
      Layer.succeed(Gateway.Gateway, gateway),
      Layer.effect(Integrations.Integrations, Integrations.make([]))
    ]),
    Layer.provide(PostgresClusterStorage.layerWakeup),
    Layer.provideMerge(database),
    Layer.provideMerge(BunCrypto.layer)
  )

/** Turn job requests alone, as a process that serves the API and runs no jobs stores them. */
const turnJobRequests = (database: ReturnType<typeof LocalHost.layerDatabase>) =>
  TurnJob.layerRequests.pipe(
    Layer.provide(PostgresClusterStorage.layerWakeup),
    Layer.provideMerge(database),
    Layer.provideMerge(BunCrypto.layer)
  )

/** A job that ran: which process ran it, in which workspace. */
interface Ran {
  readonly runner: string
  readonly workspaceId: WorkspaceId.WorkspaceId
}

/** The jobs that ran: every one so far, and each as it runs, for a test to wait on. */
interface Runs {
  readonly all: Array<Ran>
  readonly next: Queue.Queue<Ran>
}

const makeRuns: Effect.Effect<Runs> = Effect.map(Queue.unbounded<Ran>(), (next) => ({ all: [], next }))

/** A gateway through which `runner`'s turn jobs find no work, recording in `runs` each that ran. */
const recordingRuns = (runs: Runs, runner: string) =>
  acceptingNothing((workspaceId) => {
    const run = { runner, workspaceId }
    runs.all.push(run)
    return Queue.offer(runs.next, run)
  })

/** Wait for the next job to run in `workspaceId`, failing with `late` when none runs `within`. */
const awaitRun = (runs: Runs, workspaceId: WorkspaceId.WorkspaceId, within: Duration.Input, late: string) =>
  Queue.take(runs.next).pipe(
    Effect.repeat({ until: (run) => run.workspaceId === workspaceId }),
    Effect.timeoutOrElse({ duration: within, orElse: () => Effect.fail(late) })
  )

/**
 * In each workspace, commit a request to run its job through the requests `context` holds, going
 * on after the request as a real commit does, and wait for the job to run, failing for one that
 * has not run `within` milliseconds after its commit.
 */
const commitAndAwait = Effect.fnUntraced(function* (
  context: Context.Context<TurnJobs.TurnJobs | PostgresDatabase.PostgresDatabase | Crypto.Crypto>,
  runs: Runs,
  workspaceIds: ReadonlyArray<WorkspaceId.WorkspaceId>,
  within: Duration.Input
) {
  const storage = yield* PostgresWorkspaceStorage.make().pipe(Effect.provideContext(context))
  const requests = Context.get(context, TurnJobs.TurnJobs)
  for (const workspaceId of workspaceIds) {
    const store = Context.get(yield* storage.forWorkspace(workspaceId), Store.Store)
    yield* store.transaction(
      requests
        .requestRun({ workspaceId, memberId: job.memberId, threadId: job.threadId })
        .pipe(Effect.andThen(Effect.sleep("50 millis")))
    )
    yield* awaitRun(runs, workspaceId, within, `The job of ${workspaceId} waited for a runner's next poll`)
  }
})

/** The workspaces of a round of requests, one for each of `count`. */
const workspacesOf = (round: string, count: number) =>
  Array.from({ length: count }, (_, index) => WorkspaceId.WorkspaceId.make(`${round}-${index}`))

describe.skipIf(!available)("jobs on the local host", () => {
  // The host's database and cluster share one client, so Cluster stores a request on the connection
  // of the commit that asks for it.
  it.live(
    "a request asked for inside a commit is stored with it, and not if it rolls back",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const runs = yield* makeRuns
          const context = yield* Layer.build(
            turnJobs(recordingRuns(runs, "runner"), LocalHost.layerDatabase(Redacted.make(url)))
          )
          const storage = yield* PostgresWorkspaceStorage.make().pipe(Effect.provide(context))
          const store = Context.get(yield* storage.forWorkspace(job.workspaceId), Store.Store)
          const requests = Context.get(context, TurnJobs.TurnJobs)
          const stored = Effect.flatMap(
            SqlClient.SqlClient,
            (sql) => sql<{ readonly count: number }>`
            SELECT count(*)::int AS count FROM cluster_messages
            WHERE entity_type = 'amends/TurnJob'`
          ).pipe(
            Effect.map(([row]) => row?.count ?? 0),
            Effect.orDie,
            Effect.provide(context)
          )
          const rolledBack = yield* Effect.exit(
            store.transaction(requests.requestRun(job).pipe(Effect.andThen(Effect.fail("abandon"))))
          )
          expect(Exit.isFailure(rolledBack)).toBe(true)
          expect(yield* stored).toBe(0)
          yield* store.transaction(requests.requestRun(job))
          expect(yield* stored).toBe(1)
          // The committed request reaches the worker; the rolled-back one never existed.
          yield* awaitRun(runs, job.workspaceId, "10 seconds", "The committed request never ran")
          expect(runs.all).toEqual([{ runner: "runner", workspaceId: job.workspaceId }])
        }).pipe(Effect.scoped)
      ),
    30_000
  )

  // Cluster looks for a request as it stores it, before the commit can show it. Once the commit is
  // done the runner reads again, so the request does not wait for its next poll, here a minute away.
  it.live(
    "a committed request runs at once, not at the runner's next poll",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const runs = yield* makeRuns
          const context = yield* Layer.build(
            turnJobs(
              recordingRuns(runs, "runner"),
              LocalHost.layerDatabase(Redacted.make(url), { pollInterval: "1 minute" })
            )
          )
          const storage = yield* PostgresWorkspaceStorage.make().pipe(Effect.provide(context))
          const store = Context.get(yield* storage.forWorkspace(job.workspaceId), Store.Store)
          const requests = Context.get(context, TurnJobs.TurnJobs)
          // A commit goes on after it makes a request, as a real one does with its later facts
          // and staged writes, so Cluster's own look comes before the request is there to find.
          for (let commit = 1; commit <= 5; commit++) {
            yield* store.transaction(requests.requestRun(job).pipe(Effect.andThen(Effect.sleep("100 millis"))))
            yield* awaitRun(runs, job.workspaceId, "5 seconds", `Request ${commit} waited for the runner's next poll`)
          }
          expect(runs.all).toHaveLength(5)
        }).pipe(Effect.scoped)
      ),
    60_000
  )

  it.effect("a process refuses to start at a runner address another process holds", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const at = (port: number) =>
          LocalHost.layerDatabase(Redacted.make(url), {
            runnerAddress: { host: "localhost", port }
          })
        yield* Layer.build(at(34461))
        expect(yield* Effect.flip(Effect.scoped(Layer.build(at(34461))))).toMatchObject({
          _tag: "PostgresClusterStorage.AddressTaken",
          address: "localhost:34461"
        })
        // A process at its own address runs beside it.
        yield* Effect.scoped(Layer.build(at(34462)))
      }).pipe(Effect.scoped)
    )
  )

  // A process that serves the API runs no jobs: its commits store requests, and wake the process
  // that runs each job, which reads them at once rather than at its next poll, here a minute away.
  it.live(
    "a request committed where no job runs reaches the process that runs its job at once",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const runs = yield* makeRuns
          yield* Layer.build(
            turnJobs(
              recordingRuns(runs, "runner"),
              LocalHost.layerDatabase(Redacted.make(url), { pollInterval: "1 minute" })
            )
          )
          const api = yield* Layer.build(
            turnJobRequests(LocalHost.layerDatabase(Redacted.make(url), { runJobs: false }))
          )
          // The runner takes every shard as it starts, and reads what was stored before.
          yield* commitAndAwait(api, runs, workspacesOf("first", 1), "30 seconds")
          yield* commitAndAwait(api, runs, workspacesOf("then", 5), "2 seconds")
          expect(runs.all.every((run) => run.runner === "runner")).toBe(true)
        }).pipe(Effect.scoped)
      ),
    60_000
  )

  // Processes that run jobs share them out. A request committed in one reaches whichever runs its
  // job at once, over the database alone or over sockets too.
  for (const runnerTransport of ["storage", "socket"] as const)
    it.live(
      `over ${runnerTransport}, a committed request reaches the process that runs its job at once`,
      () =>
        withDatabase((url) =>
          Effect.gen(function* () {
            const runs = yield* makeRuns
            const runner = (name: string, port: number) =>
              turnJobs(
                recordingRuns(runs, name),
                LocalHost.layerDatabase(Redacted.make(url), {
                  runnerAddress: { host: "localhost", port },
                  runnerTransport,
                  pollInterval: "1 minute"
                })
              )
            const first = yield* Layer.build(runner("first", 34471))
            yield* Layer.build(runner("second", 34472))
            // The processes share out the shards a few seconds after both start; until then a
            // request may wait for a shard to change hands.
            for (let round = 0; !runs.all.some((run) => run.runner === "second"); round++)
              yield* commitAndAwait(first, runs, workspacesOf(`warm-${round}`, 10), "30 seconds")
            runs.all.length = 0
            yield* commitAndAwait(first, runs, workspacesOf("shared", 20), "2 seconds")
            expect(new Set(runs.all.map((run) => run.runner))).toEqual(new Set(["first", "second"]))
          }).pipe(Effect.scoped)
        ),
      90_000
    )
})
