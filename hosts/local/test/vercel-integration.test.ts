import { Connection } from "@amends-dev/connection"
import { Sandbox } from "@amends-dev/sandbox"
import { BunServices } from "@effect/platform-bun"
import { expect, it as liveIt, layer } from "@effect/vitest"
import { Effect, Fiber, Redacted } from "effect"
import { TestClock } from "effect/testing"
import * as SandboxIntegrations from "../src/SandboxIntegrations.ts"

const key = Redacted.make("vercel-test-token")
const project = {
  id: Connection.ConnectionId.make("vercel-connection"),
  integration: "vercel",
  name: "Our Vercel project",
  settings: { teamId: "team-test", projectId: "prj-test" },
  auth: "apiKey"
} satisfies Connection.Connection

/** A transport for the real SDK, keeping every request inside this test. */
const fakeVercel = (status: number | "nothing") => {
  const received: Array<Request> = []
  const { promise: requested, resolve } = Promise.withResolvers<void>()
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    received.push(request)
    resolve()
    if (status === "nothing") {
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException("Request aborted", "AbortError"))
        if (request.signal.aborted) abort()
        else request.signal.addEventListener("abort", abort, { once: true })
      })
    }
    if (status === 200 && new URL(request.url).pathname === "/api/v2/sandboxes") {
      return Response.json({ sandboxes: [], pagination: { count: 0, next: null } })
    }
    return Response.json({ error: { message: "Sandbox API response" } }, { status: status === 200 ? 404 : status })
  }
  const fetch: typeof globalThis.fetch = Object.assign(fetchImpl, { preconnect() {} })
  return { fetch, received, requested }
}

layer(BunServices.layer)("SandboxIntegrations.vercel", (it) => {
  it.effect("uses the connection's token and project, checking without creating a sandbox", () =>
    Effect.gen(function* () {
      const api = fakeVercel(200)
      const integration = yield* SandboxIntegrations.vercel({ fetch: api.fetch })
      expect(integration.provides).toEqual(["sandboxes"])
      expect(yield* integration.check(project, { apiKey: key })).toEqual({ status: "healthy" })
      const request = api.received[0]
      expect(request?.method).toBe("GET")
      expect(request?.headers.get("authorization")).toBe("Bearer vercel-test-token")
      const url = new URL(request?.url ?? "http://missing.test")
      expect(url.searchParams.get("teamId")).toBe("team-test")
      expect(url.searchParams.get("project")).toBe("prj-test")
      expect(url.searchParams.get("limit")).toBe("1")

      const provider = yield* integration.sandboxProvider(project, { apiKey: key })
      const failure = yield* Effect.flip(provider.resume(Sandbox.SandboxId.make("missing")))
      expect(failure.reason._tag).toBe("NotFoundError")
      expect(api.received.every((entry) => entry.method === "GET")).toBe(true)
    })
  )

  liveIt.live("classifies refused credentials, missing APIs, and exhausted provider failures", () =>
    Effect.gen(function* () {
      const statuses: Array<Connection.Health["status"]> = []
      for (const status of [401, 403, 404, 500]) {
        const api = fakeVercel(status)
        const integration = yield* SandboxIntegrations.vercel({ fetch: api.fetch })
        statuses.push((yield* integration.check(project, { apiKey: key })).status)
      }
      expect(statuses).toEqual(["unauthorized", "unauthorized", "misconfigured", "unavailable"])
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.effect("validates project settings and bounds a stalled check", () =>
    Effect.gen(function* () {
      const api = fakeVercel("nothing")
      const integration = yield* SandboxIntegrations.vercel({ fetch: api.fetch })
      const invalid = yield* Effect.flip(integration.check({ ...project, settings: {} }, { apiKey: key }))
      expect(invalid.reason._tag).toBe("InvalidConnectionError")
      expect(api.received).toHaveLength(0)
      const checking = yield* Effect.forkChild(integration.check(project, { apiKey: key }))
      yield* Effect.promise(() => api.requested)
      yield* TestClock.adjust("15 seconds")
      expect(yield* Fiber.join(checking)).toEqual(Connection.unanswered("Vercel"))
    })
  )
})
