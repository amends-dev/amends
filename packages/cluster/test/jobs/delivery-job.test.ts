import { ChannelTransport } from "@amends-dev/channel"
import { Integration, Integrations } from "@amends-dev/connection"
import { Delivery, DeliveryExecution, DeliveryJobs } from "@amends-dev/core/channel"
import { Connection } from "@amends-dev/core/connection"
import { CoreError } from "@amends-dev/core/error"
import { Group } from "@amends-dev/core/group"
import { Commit, Store } from "@amends-dev/core/journal"
import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { Workspace } from "@amends-dev/core/workspace"
import { Gateway } from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { Context, DateTime, Duration, Effect, Layer } from "effect"
import { MessageStorage, RunnerHealth, Runners, RunnerStorage, Sharding, ShardingConfig } from "effect/cluster"
import { TestClock } from "effect/testing"
import * as DeliveryJob from "../../src/DeliveryJob.ts"
import * as JobRequests from "../../src/JobRequests.ts"

/** Cluster in memory, reading for due messages every second of the test clock. */
const cluster = Sharding.layer.pipe(
  Layer.provideMerge(Runners.layerNoop),
  Layer.provideMerge(MessageStorage.layerMemory),
  Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop]),
  Layer.provide(ShardingConfig.layer({ entityMessagePollInterval: Duration.seconds(1) }))
)

const workspaceId = Workspace.Id.make("workspace-1")
const job: DeliveryJobs.Job = { workspaceId, threadId: ThreadId.Id.make("thread-1") }
const at = DateTime.makeUnsafe("2026-10-10T12:00:00.000Z")
const conversation = { id: "conv-1", details: {} }
const connection = {
  id: Connection.Id.make("connection-channels"),
  integration: "test-channels",
  name: "Support desk",
  settings: {},
  auth: "none" as const
}
/** A delivery of the thread's `sequence`th message, requested. */
const requested = (sequence: number) =>
  Delivery.requested({
    id: Delivery.Id.make(`delivery-${sequence}`),
    workspaceId,
    channelId: "channel-1" as never,
    threadId: job.threadId,
    groupId: Group.GeneralId,
    conversationId: conversation.id,
    messageId: ThreadMessage.Id.make(`message-${sequence}`),
    sequence,
    requestedAt: at
  })

/** How a delivery ended, as the workspace was asked. */
type Ending =
  | {
      readonly kind: "sent"
      readonly deliveryId: string
      readonly externalMessageId: string
      readonly attempts: number
    }
  | {
      readonly kind: "failed"
      readonly deliveryId: string
      readonly reason: string
      readonly attempts: number
    }

interface FakeWorkspaceOptions {
  /** The deliveries accepting gives, requested; each is readied until it ends. */
  readonly deliveries?: ReadonlyArray<Delivery.Delivery>
  /** Whether the workspace was ever created. True by default. */
  readonly created?: boolean
}

/** A workspace in memory, as the job reaches it through a gateway, with the deliveries it holds. */
const makeFakeWorkspace = (options: FakeWorkspaceOptions = {}) => {
  const endings: Array<Ending> = []
  const ended = new Set<string>()
  const deliveries = options.deliveries ?? [requested(2)]
  const deliveryExecution = DeliveryExecution.DeliveryExecution.of({
    accept: () => Effect.sync(() => deliveries.filter((delivery) => !ended.has(delivery.id))),
    start: (deliveryId) =>
      Effect.sync(() => {
        const delivery = deliveries.find((delivery) => delivery.id === deliveryId)
        return delivery === undefined || ended.has(deliveryId)
          ? DeliveryExecution.Start.cases.Idle.make({})
          : DeliveryExecution.Start.cases.Ready.make({
              delivery,
              conversation,
              outgoing: { text: `Message ${delivery.sequence}`, author: "Bob" },
              access: { connection, credential: null }
            })
      }),
    recordSent: (deliveryId, sent) =>
      Effect.sync(() => {
        ended.add(deliveryId)
        endings.push({ kind: "sent", deliveryId, ...sent })
      }),
    recordFailed: (deliveryId, failed) =>
      Effect.sync(() => {
        ended.add(deliveryId)
        endings.push({ kind: "failed", deliveryId, ...failed })
      })
  })
  const services = Context.make(DeliveryExecution.DeliveryExecution, deliveryExecution)
  const gateway = Gateway.Gateway.of({
    createWorkspace: () => Effect.die("The fake workspace is never created"),
    asMember: () => Effect.die("The job runs as no member"),
    inWorkspace: (_, program) =>
      Effect.provideContext(
        Effect.gen(function* () {
          if (options.created === false)
            return yield* new CoreError.NotFound({ resource: "Workspace", id: workspaceId })
          return yield* program
        }),
        services
      ) as Effect.Effect<never, never, never>
  })
  return { gateway, endings: () => [...endings] }
}

/**
 * The channel transport the host's integration gives: it posts, naming each message `posted-N`,
 * after refusing `unavailable` times as a system that cannot be reached, or refusing for good.
 */
const makeTransport = (options: { readonly unavailable?: number; readonly refuses?: boolean } = {}) => {
  const posted: Array<ChannelTransport.Outgoing> = []
  let failures = 0
  const transport: ChannelTransport.ChannelTransport = {
    self: undefined,
    receive: () => Effect.die("The job receives nothing"),
    post: (_, outgoing) =>
      Effect.suspend(() => {
        if (options.refuses === true)
          return Effect.fail(
            new ChannelTransport.TransportError({
              reason: new ChannelTransport.RefusedError({ description: "The channel is archived." })
            })
          )
        if (failures < (options.unavailable ?? 0)) {
          failures += 1
          return Effect.fail(
            new ChannelTransport.TransportError({
              reason: new ChannelTransport.UnavailableError({ description: "The system timed out." })
            })
          )
        }
        posted.push(outgoing)
        return Effect.succeed({ messageId: `posted-${posted.length}` })
      })
  }
  const integrations = Layer.effect(
    Integrations.Integrations,
    Integrations.make([
      Integration.make({
        id: "test-channels",
        name: "Test channels",
        auth: ["none"],
        channels: () => Effect.succeed(transport),
        check: () => Effect.succeed({ status: "healthy" })
      })
    ])
  )
  return { integrations, posted: () => [...posted] }
}

/** Delivery jobs on Cluster in memory, over a fake workspace, posting through `transport`. */
const deliveryJobsFor = (
  workspace: ReturnType<typeof makeFakeWorkspace>,
  transport: ReturnType<typeof makeTransport>
) =>
  DeliveryJob.layer.pipe(
    Layer.provide(JobRequests.layerWakeLocal),
    Layer.provideMerge(cluster),
    Layer.provide(Layer.merge(Layer.succeed(Gateway.Gateway, workspace.gateway), transport.integrations))
  )

/** Run `request` in a commit `commitId`, then what it asked to run once the commit is done. */
const inCommit = <E>(
  commitId: string,
  request: (deliveryJobs: DeliveryJobs.DeliveryJobs["Service"]) => Effect.Effect<void, E, Store.Transaction>
) =>
  Effect.gen(function* () {
    const afterCommit: Array<Effect.Effect<void>> = []
    const storeTransaction = Store.Transaction.of({
      id: Commit.Id.make(commitId),
      append: () => Effect.die("The test commit appends nothing"),
      afterCommit: (effect) => Effect.sync(() => void afterCommit.push(effect))
    })
    yield* Effect.flatMap(DeliveryJobs.DeliveryJobs, request).pipe(
      Effect.provideService(Store.Transaction, storeTransaction)
    )
    yield* Effect.forEach(afterCommit, (effect) => effect, { discard: true })
  })

/** Move the test clock on a second at a time until `done`, for at most `limit`. */
const until = (done: () => boolean, limit: Duration.Input = "1 minute") =>
  Effect.gen(function* () {
    const seconds = Duration.toSeconds(Duration.fromInputUnsafe(limit))
    for (let second = 0; second < seconds && !done(); second++) yield* TestClock.adjust("1 second")
  })

describe("a delivery job", () => {
  it.effect("posts the thread's requested deliveries in order when a commit asks it to", () =>
    Effect.gen(function* () {
      const workspace = makeFakeWorkspace({ deliveries: [requested(2), requested(3)] })
      const transport = makeTransport()
      yield* Effect.gen(function* () {
        yield* inCommit("commit-1", (deliveryJobs) => deliveryJobs.requestDeliver(job))
        yield* until(() => workspace.endings().length === 2)
      }).pipe(Effect.provide(deliveryJobsFor(workspace, transport)), Effect.scoped)
      expect(transport.posted()).toEqual([
        { text: "Message 2", author: "Bob" },
        { text: "Message 3", author: "Bob" }
      ])
      expect(workspace.endings()).toEqual([
        { kind: "sent", deliveryId: "delivery-2", externalMessageId: "posted-1", attempts: 1 },
        { kind: "sent", deliveryId: "delivery-3", externalMessageId: "posted-2", attempts: 1 }
      ])
    })
  )

  it.effect("tries a system that cannot be reached again, and gives the delivery up once it keeps failing", () =>
    Effect.gen(function* () {
      const recovers = {
        workspace: makeFakeWorkspace(),
        transport: makeTransport({ unavailable: 2 })
      }
      yield* Effect.gen(function* () {
        yield* inCommit("commit-1", (deliveryJobs) => deliveryJobs.requestDeliver(job))
        yield* until(() => recovers.workspace.endings().length > 0)
      }).pipe(Effect.provide(deliveryJobsFor(recovers.workspace, recovers.transport)), Effect.scoped)
      expect(recovers.workspace.endings()).toEqual([
        { kind: "sent", deliveryId: "delivery-2", externalMessageId: "posted-1", attempts: 3 }
      ])

      const failing = {
        workspace: makeFakeWorkspace(),
        transport: makeTransport({ unavailable: JobRequests.maxFailures + 1 })
      }
      yield* Effect.gen(function* () {
        yield* inCommit("commit-1", (deliveryJobs) => deliveryJobs.requestDeliver(job))
        yield* until(() => failing.workspace.endings().length > 0, "20 minutes")
      }).pipe(Effect.provide(deliveryJobsFor(failing.workspace, failing.transport)), Effect.scoped)
      expect(failing.workspace.endings()).toEqual([
        {
          kind: "failed",
          deliveryId: "delivery-2",
          reason: "Its delivery job could not reach the channel.",
          attempts: JobRequests.maxFailures
        }
      ])
    })
  )

  it.effect("fails a delivery the system refuses there and then, and goes on to the next", () =>
    Effect.gen(function* () {
      const workspace = makeFakeWorkspace({ deliveries: [requested(2), requested(3)] })
      const transport = makeTransport({ refuses: true })
      yield* Effect.gen(function* () {
        yield* inCommit("commit-1", (deliveryJobs) => deliveryJobs.requestDeliver(job))
        yield* until(() => workspace.endings().length === 2)
      }).pipe(Effect.provide(deliveryJobsFor(workspace, transport)), Effect.scoped)
      expect(workspace.endings()).toEqual([
        {
          kind: "failed",
          deliveryId: "delivery-2",
          reason: "The channel is archived.",
          attempts: 1
        },
        {
          kind: "failed",
          deliveryId: "delivery-3",
          reason: "The channel is archived.",
          attempts: 1
        }
      ])
    })
  )

  it.effect("drops a request whose workspace was never created, without trying again", () =>
    Effect.gen(function* () {
      const workspace = makeFakeWorkspace({ created: false })
      const transport = makeTransport()
      yield* Effect.gen(function* () {
        yield* inCommit("commit-1", (deliveryJobs) => deliveryJobs.requestDeliver(job))
        yield* until(() => false, "10 seconds")
      }).pipe(Effect.provide(deliveryJobsFor(workspace, transport)), Effect.scoped)
      expect(workspace.endings()).toEqual([])
      expect(transport.posted()).toEqual([])
    })
  )
})
