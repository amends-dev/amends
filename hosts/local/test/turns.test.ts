import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import type { Thread } from "@amends-dev/core/thread"
import type { Member } from "@amends-dev/core/workspace"
import { BunCrypto, BunHttpServer } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Schedule } from "effect"
import { Base64 } from "effect/encoding"
import { HttpRouter } from "effect/http"
import * as DevelopmentAuthentication from "../src/DevelopmentAuthentication.ts"
import * as LocalHost from "../src/LocalHost.ts"
import * as LocalServer from "../src/LocalServer.ts"
import { client, type Client } from "./client.ts"
import { setup } from "./database.ts"
import { type Call, withServer } from "./server.ts"

const alice = Identity.HumanId.make("alice")
const credentialKey = Redacted.make(Base64.encode(crypto.getRandomValues(new Uint8Array(32))))
/** The real routes, gateway, and PostgreSQL storage behind a Bun test server, over `host`. */
const serve = (host: LocalHost.HostLayer) =>
  HttpRouter.serve(LocalServer.layerRoutes, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(
      DevelopmentAuthentication.layer(() => Effect.void).pipe(Layer.provide(BunCrypto.layer), Layer.provideMerge(host))
    ),
    Layer.provideMerge(BunHttpServer.layerTest)
  )

/**
 * The servers the tests run against: one process that serves the API and runs turn jobs on
 * Cluster, reading for due job requests every tenth of a second; and one that serves the API alone
 * beside another that runs the jobs alone, reading for them only every minute, which hears of what
 * the API's commits request through their notices.
 */
const servers = {
  "one process": (url: string) =>
    serve(LocalHost.layer(Redacted.make(url), { credentialKey, pollInterval: "100 millis" })),
  "the API and its jobs apart": (url: string) =>
    serve(LocalHost.layer(Redacted.make(url), { credentialKey, runJobs: false })).pipe(
      Layer.merge(
        Layer.effectDiscard(
          Layer.build(LocalHost.layer(Redacted.make(url), { credentialKey, pollInterval: "1 minute" }))
        )
      )
    )
}

/** A message as a model is sent it: its role, and its text. */
interface Sent {
  readonly role: string
  readonly text: string
}

/**
 * A model provider speaking OpenAI's chat completions, which answers each request with the next of
 * `answers`, repeating the last, once `release` resolves, and keeps each request's messages.
 */
const fakeModels = (answers: ReadonlyArray<string>, release: Promise<void> = Promise.resolve()) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const requests: Array<ReadonlyArray<Sent>> = []
      const chunk = (choice: object, extra: object = {}) =>
        `data: ${JSON.stringify({ id: "c1", model: "fake-model", created: 0, choices: [choice], ...extra })}\n\n`
      const models = Bun.serve({
        port: 0,
        fetch: async (request) => {
          if (!new URL(request.url).pathname.endsWith("/chat/completions"))
            return new Response("Not found", { status: 404 })
          const body = (await request.json()) as {
            readonly messages: ReadonlyArray<{ readonly role: string; readonly content: unknown }>
          }
          requests.push(
            body.messages.map(({ role, content }) => ({
              role,
              text:
                typeof content === "string"
                  ? content
                  : (content as ReadonlyArray<{ readonly text?: string }>).map((part) => part.text ?? "").join("\n")
            }))
          )
          await release
          const answer = answers[Math.min(requests.length, answers.length) - 1]!
          return new Response(
            chunk({
              index: 0,
              delta: { role: "assistant", content: answer },
              finish_reason: null
            }) +
              chunk(
                { index: 0, delta: {}, finish_reason: "stop" },
                { usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } }
              ) +
              "data: [DONE]\n\n",
            { headers: { "content-type": "text/event-stream" } }
          )
        }
      })
      return { baseUrl: `${models.url.origin}/v1`, requests, stop: () => models.stop(true) }
    }),
    (models) => Effect.promise(() => models.stop())
  )

/**
 * Alice's workspace, where she is called Alice, with Planner, an agent on amends's own harness and a model the provider at
 * `modelsUrl` serves, which works without a sandbox.
 */
const workspaceWithAgent = (modelsUrl: string) =>
  Effect.gen(function* () {
    const { id: workspaceId } = yield* (yield* client(alice)).workspaces.create({
      headers: {},
      payload: { name: "Studio", memberName: "Alice" }
    })
    const asAlice = yield* client(alice, workspaceId)
    const connect = (integration: string, settings: Record<string, string> = {}) =>
      asAlice.connections.create({
        headers: {},
        payload: { integration, name: integration, settings, auth: "none" }
      })
    const amends = yield* connect("amends")
    const models = yield* connect("openai-compatible", { url: modelsUrl })
    const agent = yield* asAlice.agents.create({
      headers: {},
      payload: {
        name: "Planner",
        roleId: BuiltinRoles.MemberId,
        instructions: "Plan each change.",
        harness: { _tag: "Connection", connectionId: amends.id },
        model: { connectionId: models.id, id: "fake-model" },
        sandbox: null
      }
    })
    return { asAlice, agent }
  })

/** The thread's messages the agent `memberId` posted, once it posted `count`, read every 100 ms. */
const agentMessages = (asAlice: Client, params: { readonly threadId: Thread.Id }, memberId: Member.Id, count: number) =>
  asAlice.threads.timeline({ params, query: { limit: 50 } }).pipe(
    Effect.map((timeline) =>
      timeline.flatMap((item) =>
        "message" in item && item.message.author._tag === "Member" && item.message.author.memberId === memberId
          ? [item.message]
          : []
      )
    ),
    Effect.repeat({
      until: (messages) => messages.length >= count,
      schedule: Schedule.spaced("100 millis")
    }),
    Effect.timeout("20 seconds")
  )

const { available, withDatabase } = setup()
describe.skipIf(!available).each(Object.entries(servers))("turns on the local host, %s", (_, server) => {
  it.live(
    "an agent asked in a thread answers there, and its next turn resumes the conversation",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const models = yield* fakeModels(["The plan is on track.", "The risks are small."])
          const { asAlice, agent } = yield* workspaceWithAgent(models.baseUrl)
          const started = yield* asAlice.threads.start({
            params: { groupId: Group.GeneralId },
            headers: {},
            payload: { text: "Planner, summarize the plan.", mentions: [agent.memberId] }
          })
          const params = { threadId: started.thread.id }

          // The mention runs the agent's turn job, which posts its answer as the agent.
          const [answer] = yield* agentMessages(asAlice, params, agent.memberId, 1)
          expect(answer?.content).toMatchObject({ text: "The plan is on track." })
          expect(models.requests[0]).toEqual([
            { role: "system", text: "Plan each change." },
            { role: "user", text: "Alice: Planner, summarize the plan." }
          ])
          if (answer?.via?._tag !== "Turn") return yield* Effect.die("Expected an agent's reply")
          const turn = yield* asAlice.turns.get({
            params: { turnId: answer.via.turnId }
          })
          expect(turn).toMatchObject({ status: "completed", messageIds: [answer!.id] })

          // Asked again, the agent resumes its session with the conversation its log records.
          yield* asAlice.threads.publish({
            params,
            headers: {},
            payload: { text: "Planner, and the risks?", mentions: [agent.memberId] }
          })
          const answers = yield* agentMessages(asAlice, params, agent.memberId, 2)
          expect(answers.map(({ content }) => ("text" in content ? content.text : null))).toEqual([
            "The plan is on track.",
            "The risks are small."
          ])
          expect(models.requests[1]).toEqual([
            { role: "system", text: "Plan each change." },
            { role: "user", text: "Alice: Planner, summarize the plan." },
            { role: "assistant", text: "The plan is on track." },
            { role: "user", text: "Alice: Planner, and the risks?" }
          ])
        }).pipe(Effect.scoped, Effect.provide(server(url)))
      ),
    60_000
  )

  it.live("a turn asked to stop stops while its model answers, posting nothing", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const released = Promise.withResolvers<void>()
        yield* Effect.addFinalizer(() => Effect.sync(() => released.resolve()))
        const models = yield* fakeModels(["Too late."], released.promise)
        const { asAlice, agent } = yield* workspaceWithAgent(models.baseUrl)
        const started = yield* asAlice.threads.start({
          params: { groupId: Group.GeneralId },
          headers: {},
          payload: { text: "Planner, draft the notes.", mentions: [agent.memberId] }
        })
        // The turn runs once its model has the request.
        yield* Effect.sync(() => models.requests.length).pipe(
          Effect.repeat({ until: (count) => count > 0, schedule: Schedule.spaced("50 millis") }),
          Effect.timeout("20 seconds")
        )
        const [running] = yield* asAlice.turns.listActive({
          query: { limit: 10 }
        })
        expect(running).toMatchObject({ status: "running", stoppable: true })
        yield* asAlice.turns.cancel({ params: { turnId: running!.id } })
        const stopped = yield* asAlice.turns.get({ params: { turnId: running!.id } }).pipe(
          Effect.repeat({
            until: ({ status }) => status === "cancelled",
            schedule: Schedule.spaced("100 millis")
          }),
          Effect.timeout("20 seconds")
        )
        expect(stopped).toMatchObject({ cancelReason: "requested", messageIds: [] })
        released.resolve()
        const timeline = yield* asAlice.threads.timeline({
          params: { threadId: started.thread.id },
          query: { limit: 50 }
        })
        expect(timeline.filter((item) => "message" in item)).toHaveLength(1)
      }).pipe(Effect.scoped, Effect.provide(server(url)))
    )
  )
})

/**
 * Through a server `call` reaches, as Alice: make a workspace with Planner, an agent on amends's own
 * harness and a model the provider at `modelsUrl` serves, mention Planner in a new thread, and
 * return the text of its reply once it posts one, or nothing after twenty seconds.
 */
const mentionPlanner = async (call: Call, modelsUrl: string) => {
  const created = async <A = { readonly id: string }>(path: string, payload: object, workspaceId?: string) => {
    const { status, body } = await call(alice, "POST", path, payload, workspaceId)
    expect(status).toBe(201)
    return body as A
  }
  const { id: workspaceId } = await created("/workspaces", { name: "Studio", memberName: "Alice" })
  const connect = (integration: string, settings: object) =>
    created("/connections", { integration, name: integration, settings, auth: "none" }, workspaceId)
  const amends = await connect("amends", {})
  const models = await connect("openai-compatible", { url: modelsUrl })
  const agent = await created<{ readonly memberId: string }>(
    "/agents",
    {
      name: "Planner",
      roleId: BuiltinRoles.MemberId,
      instructions: "Plan each change.",
      harness: { _tag: "Connection", connectionId: amends.id },
      model: { connectionId: models.id, id: "fake-model" },
      sandbox: null
    },
    workspaceId
  )
  const { thread } = await created<{ readonly thread: { readonly id: string } }>(
    `/groups/${Group.GeneralId}/threads`,
    { text: "Planner, summarize the plan.", mentions: [agent.memberId] },
    workspaceId
  )
  const timeline = `/threads/${thread.id}/timeline?limit=50`
  for (const deadline = Date.now() + 20_000; Date.now() < deadline; await Bun.sleep(100)) {
    const { body } = await call(alice, "GET", timeline, undefined, workspaceId)
    const reply = (body as ReadonlyArray<Partial<TimelineMessage>>).find(
      (item) => item.message?.author.memberId === agent.memberId
    )
    if (reply?.message !== undefined) return reply.message.content.text
  }
  return undefined
}

/** A message in a thread's timeline, as the API returns it, with what `mentionPlanner` reads. */
interface TimelineMessage {
  readonly message: {
    readonly author: { readonly memberId?: string }
    readonly content: { readonly text?: string }
  }
}

describe.skipIf(!available)("turns across host processes", () => {
  // The real entry point twice over one database: the API's commits wake the process that runs
  // the job, which answers through the database.
  it.live(
    "an agent mentioned through a process that serves the API answers from one that runs its jobs",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const models = yield* fakeModels(["Answered from the jobs process."])
          const answer = yield* Effect.promise(() =>
            withServer(
              url,
              () =>
                withServer(url, (call) => mentionPlanner(call, models.baseUrl), {
                  env: { AMENDS_ROLE: "api" }
                }),
              { env: { AMENDS_ROLE: "jobs" }, ready: /Running jobs at (\S+)(?=\s)/ }
            )
          )
          expect(answer).toBe("Answered from the jobs process.")
        }).pipe(Effect.scoped)
      ),
    60_000
  )
})
