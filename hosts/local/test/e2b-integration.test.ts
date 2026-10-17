import { Connection } from "@amends-dev/connection"
import { Sandbox } from "@amends-dev/sandbox"
import { BunServices } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, Redacted } from "effect"
import { TestClock } from "effect/testing"
import * as SandboxIntegrations from "../src/SandboxIntegrations.ts"

const key = Redacted.make("e2b-test-key")

const organization = (apiUrl: string): Connection.Connection => ({
  id: Connection.ConnectionId.make("e2b-connection"),
  integration: "e2b",
  name: "Our E2B organization",
  settings: { apiUrl },
  auth: "apiKey"
})

/** E2B's list API, with no sandbox allocation or external requests. */
const serveE2b = (status: number | "nothing") =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const received: Array<{ readonly method: string; readonly path: string; readonly apiKey: string | null }> = []
      const { promise: requested, resolve } = Promise.withResolvers<void>()
      const server = Bun.serve({
        port: 0,
        fetch: (request) => {
          received.push({
            method: request.method,
            path: new URL(request.url).pathname,
            apiKey: request.headers.get("x-api-key")
          })
          resolve()
          if (status === "nothing") return new Promise<Response>(() => {})
          return status === 200 ? Response.json([]) : Response.json({ message: `Answered ${status}` }, { status })
        }
      })
      return { apiUrl: `http://127.0.0.1:${server.port}`, received, requested, server }
    }),
    ({ server }) => Effect.promise(() => server.stop(true))
  )

layer(BunServices.layer)("SandboxIntegrations.e2b", (it) => {
  it.effect("checks credentials by listing without creating, and passes the API settings to the provider", () =>
    Effect.gen(function* () {
      const api = yield* serveE2b(200)
      const connection = organization(api.apiUrl)
      const integration = yield* SandboxIntegrations.e2b
      expect(integration.provides).toEqual(["sandboxes"])
      expect(yield* integration.check(connection, { apiKey: key })).toEqual({ status: "healthy" })

      const provider = yield* integration.sandboxProvider(connection, { apiKey: key })
      const missing = yield* Effect.flip(provider.resume(Sandbox.SandboxId.make("missing")))
      expect(missing.reason._tag).toBe("NotFoundError")
      expect(api.received.length).toBeGreaterThanOrEqual(2)
      expect(api.received.every((request) => request.method === "GET")).toBe(true)
      expect(api.received).toContainEqual({ method: "GET", path: "/v2/sandboxes", apiKey: "e2b-test-key" })
    })
  )

  it.effect("classifies rejected credentials, missing endpoints, and provider failures", () =>
    Effect.gen(function* () {
      const integration = yield* SandboxIntegrations.e2b
      const statuses: Array<Connection.Health["status"]> = []
      for (const status of [401, 403, 404, 500]) {
        const api = yield* serveE2b(status)
        statuses.push((yield* integration.check(organization(api.apiUrl), { apiKey: key })).status)
      }
      expect(statuses).toEqual(["unauthorized", "unauthorized", "misconfigured", "unavailable"])
      const keyless = yield* Effect.flip(integration.check(organization("http://unused.invalid"), undefined))
      expect(keyless.reason._tag).toBe("InvalidConnectionError")
    })
  )

  it.effect("bounds an unanswered credential check", () =>
    Effect.gen(function* () {
      const api = yield* serveE2b("nothing")
      const integration = yield* SandboxIntegrations.e2b
      const checking = yield* Effect.forkChild(integration.check(organization(api.apiUrl), { apiKey: key }))
      yield* Effect.promise(() => api.requested)
      yield* TestClock.adjust("15 seconds")
      expect(yield* Fiber.join(checking)).toEqual(Connection.unanswered(api.apiUrl))
    })
  )
})
