import { Connection } from "@amends/connection-v2";
import { DaytonaSandboxProvider } from "@amends/sandbox-daytona-v2";
import { Sandbox } from "@amends/sandbox-v2";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, layer } from "@effect/vitest";
import { Effect, Fiber, Redacted } from "effect";
import { TestClock } from "effect/testing";

const key = Redacted.make("secret-key");

const connectionOf = (settings: Connection.Connection["settings"]): Connection.Connection => ({
  id: Connection.ConnectionId.make("conn-1"),
  integration: "daytona",
  name: "Our organization",
  settings,
  auth: "apiKey",
});

/**
 * Daytona's API at a URL of this process, which answers every request with `status`, and a request
 * to list sandboxes with none when that is 200, or answers nothing. It keeps the path and
 * `Authorization` header of each request it receives, and `requested` settles at the first.
 */
const serveDaytona = (status: number | "nothing") =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const received: Array<{ readonly path: string; readonly authorization: string | null }> = [];
      const { promise: requested, resolve } = Promise.withResolvers<void>();
      const server = Bun.serve({
        port: 0,
        fetch: (request) => {
          received.push({
            path: new URL(request.url).pathname,
            authorization: request.headers.get("authorization"),
          });
          resolve();
          if (status === "nothing") return new Promise<Response>(() => {});
          return status === 200
            ? Response.json({ items: [], nextCursor: null })
            : Response.json({ statusCode: status, message: `Answered ${status}` }, { status });
        },
      });
      return { apiUrl: `http://127.0.0.1:${server.port}/api`, received, requested, server };
    }),
    ({ server }) => Effect.promise(() => server.stop(true)),
  );

layer(BunServices.layer)("DaytonaSandboxProvider.integration", (it) => {
  it.effect("gives the sandboxes of an organization, reached at its API with its key", () =>
    Effect.gen(function* () {
      const integration = yield* DaytonaSandboxProvider.integration;
      const daytona = yield* serveDaytona(404);

      const provider = yield* integration.sandboxProvider(
        connectionOf({ apiUrl: daytona.apiUrl }),
        {
          apiKey: key,
        },
      );
      const missing = yield* Effect.flip(provider.resume(Sandbox.SandboxId.make("sandbox-one")));
      const keyless = yield* Effect.flip(integration.check(connectionOf({}), undefined));

      expect(integration.provides).toEqual(["sandboxes"]);
      expect(missing.reason._tag).toBe("NotFoundError");
      expect(daytona.received).toContainEqual({
        path: "/api/sandbox/sandbox-one",
        authorization: "Bearer secret-key",
      });
      expect(keyless.reason._tag).toBe("InvalidConnectionError");
    }),
  );

  it.effect("checks a connection by listing a sandbox of the organization's, with its key", () =>
    Effect.gen(function* () {
      const integration = yield* DaytonaSandboxProvider.integration;
      const daytona = yield* serveDaytona(200);

      const health = yield* integration.check(connectionOf({ apiUrl: daytona.apiUrl }), {
        apiKey: key,
      });

      expect(health).toEqual({ status: "healthy" });
      expect(daytona.received).toContainEqual({
        path: "/api/sandbox",
        authorization: "Bearer secret-key",
      });
    }),
  );

  it.effect("says what Daytona's refusing to list sandboxes says of the connection", () =>
    Effect.gen(function* () {
      const integration = yield* DaytonaSandboxProvider.integration;
      const checkAt = (apiUrl: string) =>
        integration.check(connectionOf({ apiUrl }), { apiKey: key });

      const refused = yield* checkAt((yield* serveDaytona(401)).apiUrl);
      const forbidden = yield* checkAt((yield* serveDaytona(403)).apiUrl);
      const elsewhere = yield* checkAt((yield* serveDaytona(404)).apiUrl);
      const failed = yield* checkAt((yield* serveDaytona(500)).apiUrl);
      const failing = yield* checkAt((yield* serveDaytona(503)).apiUrl);
      const unreachable = yield* checkAt("http://127.0.0.1:1/api");

      expect(
        [refused, forbidden, elsewhere, failed, failing, unreachable].map(({ status }) => status),
      ).toEqual([
        "unauthorized",
        "unauthorized",
        "misconfigured",
        "unavailable",
        "unavailable",
        "unavailable",
      ]);
      expect(refused.description).toContain("Answered 401");
    }),
  );

  it.effect("finds a connection unavailable when Daytona does not answer in 15 seconds", () =>
    Effect.gen(function* () {
      const integration = yield* DaytonaSandboxProvider.integration;
      const daytona = yield* serveDaytona("nothing");

      const checking = yield* Effect.forkChild(
        integration.check(connectionOf({ apiUrl: daytona.apiUrl }), { apiKey: key }),
      );
      yield* Effect.promise(() => daytona.requested);
      yield* TestClock.adjust("15 seconds");

      expect(yield* Fiber.join(checking)).toEqual({
        status: "unavailable",
        description: "Daytona did not answer in 15 seconds",
      });
    }),
  );
});

describe.skipIf(
  process.env.AMENDS_TEST_DAYTONA !== "1" || process.env.DAYTONA_API_KEY === undefined,
)("DaytonaSandboxProvider.integration", () => {
  const organizationKey = Redacted.make(process.env.DAYTONA_API_KEY ?? "");

  layer(BunServices.layer, { excludeTestServices: true })("in Daytona's cloud", (it) => {
    it.effect(
      "checks an organization's key, and refuses another",
      () =>
        Effect.gen(function* () {
          const integration = yield* DaytonaSandboxProvider.integration;

          const valid = yield* integration.check(connectionOf({}), { apiKey: organizationKey });
          const wrong = yield* integration.check(connectionOf({}), {
            apiKey: Redacted.make("dtn_not-a-key"),
          });

          expect(valid).toEqual({ status: "healthy" });
          expect(wrong.status).toBe("unauthorized");
        }),
      30_000,
    );

    it.effect(
      "creates a sandbox of the organization's",
      () =>
        Effect.gen(function* () {
          const integration = yield* DaytonaSandboxProvider.integration;
          const provider = yield* integration.sandboxProvider(connectionOf({}), {
            apiKey: organizationKey,
          });

          const sandbox = yield* Effect.acquireRelease(provider.create(), (created) =>
            Effect.ignore(created.destroy),
          );

          expect(sandbox.workingDirectory).toBe("/home/daytona");
        }),
      120_000,
    );
  });
});
