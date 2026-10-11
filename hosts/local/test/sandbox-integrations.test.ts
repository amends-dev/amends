import { Connection } from "@amends-dev/connection";
import { Sandbox } from "@amends-dev/sandbox";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, layer } from "@effect/vitest";
import { Effect, Fiber, FileSystem, Path, Redacted } from "effect";
import { TestClock } from "effect/testing";
import * as SandboxIntegrations from "../src/sandbox-integrations.ts";
import { serveDaytona } from "./fake-daytona.ts";

const machine = (id: string): Connection.Connection => ({
  id: Connection.ConnectionId.make(id),
  integration: "local",
  name: `Machine ${id}`,
  settings: {},
  auth: "none",
});

/**
 * The integration of this machine's sandboxes over a directory in a temporary one, with both for
 * tests to look into, so that nothing a test makes outside the integration's directory is left
 * behind.
 */
const makeLocal = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const temporary = yield* fs.makeTempDirectoryScoped();
  const directory = path.join(temporary, "sandboxes");
  return { temporary, directory, integration: yield* SandboxIntegrations.local({ directory }) };
});

layer(BunServices.layer)("SandboxIntegrations.local", (it) => {
  it.effect("keeps each connection's sandboxes in a directory of its own, named by its id", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const { directory, integration } = yield* makeLocal;
      const id = Sandbox.SandboxId.make("sandbox-one");

      const mine = yield* integration.sandboxProvider(machine("conn-a"), undefined);
      const theirs = yield* integration.sandboxProvider(machine("conn-b"), undefined);
      const sandbox = yield* mine.create({ id });
      const resumed = yield* Effect.flip(theirs.resume(id));

      expect(integration.provides).toEqual(["sandboxes"]);
      expect(sandbox.workingDirectory).toBe(path.join(directory, "conn-a", id, "workspace"));
      expect(resumed.reason._tag).toBe("NotFoundError");
    }),
  );

  it.effect("refuses a connection whose id cannot name a directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { temporary, integration } = yield* makeLocal;
      const escaping = machine("../outside");

      const error = yield* Effect.flip(integration.sandboxProvider(escaping, undefined));
      const health = yield* integration.check(escaping, undefined);

      expect(error.reason).toMatchObject({
        _tag: "InvalidConnectionError",
        description: "The id of Machine ../outside, ../outside, cannot name a directory",
      });
      expect(health.status).toBe("misconfigured");
      expect(yield* fs.exists(path.join(temporary, "outside"))).toBe(false);
    }),
  );

  it.effect("checks a connection by making its directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { temporary, directory, integration } = yield* makeLocal;
      const file = path.join(temporary, "file");
      yield* fs.writeFileString(file, "");
      const underFile = yield* SandboxIntegrations.local({ directory: file });

      const healthy = yield* integration.check(machine("conn-a"), undefined);
      const unavailable = yield* underFile.check(machine("conn-a"), undefined);

      expect(healthy).toEqual({ status: "healthy" });
      expect(yield* fs.exists(path.join(directory, "conn-a"))).toBe(true);
      expect(unavailable.status).toBe("unavailable");
      expect(unavailable.description).toContain("The sandboxes of Machine conn-a cannot be kept");
    }),
  );
});

const key = Redacted.make("secret-key");

const organization = (settings: Connection.Connection["settings"]): Connection.Connection => ({
  id: Connection.ConnectionId.make("conn-1"),
  integration: "daytona",
  name: "Our organization",
  settings,
  auth: "apiKey",
});

layer(BunServices.layer)("SandboxIntegrations.daytona", (it) => {
  it.effect("gives the sandboxes of an organization, reached at its API with its key", () =>
    Effect.gen(function* () {
      const integration = yield* SandboxIntegrations.daytona;
      const daytona = yield* serveDaytona(404);

      const sandboxProvider = yield* integration.sandboxProvider(
        organization({ apiUrl: daytona.apiUrl }),
        { apiKey: key },
      );
      const missing = yield* Effect.flip(
        sandboxProvider.resume(Sandbox.SandboxId.make("sandbox-one")),
      );
      const keyless = yield* Effect.flip(integration.check(organization({}), undefined));

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
      const integration = yield* SandboxIntegrations.daytona;
      const daytona = yield* serveDaytona(200);

      const health = yield* integration.check(organization({ apiUrl: daytona.apiUrl }), {
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
      const integration = yield* SandboxIntegrations.daytona;
      const checkAt = (apiUrl: string) =>
        integration.check(organization({ apiUrl }), { apiKey: key });

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
      expect(refused.description).toContain("refused the key (401)");
      expect(unreachable.description).toBe("Nothing answered at http://127.0.0.1:1/api");
    }),
  );

  it.effect("finds a connection unavailable when Daytona does not answer in 15 seconds", () =>
    Effect.gen(function* () {
      const integration = yield* SandboxIntegrations.daytona;
      const daytona = yield* serveDaytona("nothing");

      const checking = yield* Effect.forkChild(
        integration.check(organization({ apiUrl: daytona.apiUrl }), { apiKey: key }),
      );
      yield* Effect.promise(() => daytona.requested);
      yield* TestClock.adjust("15 seconds");

      expect(yield* Fiber.join(checking)).toEqual({
        status: "unavailable",
        description: `Nothing answered at ${daytona.apiUrl}`,
      });
    }),
  );
});

// Daytona's sandboxes cost money, so a real organization is reached only with `AMENDS_TEST_DAYTONA=1`.
describe.skipIf(
  process.env.AMENDS_TEST_DAYTONA !== "1" || process.env.DAYTONA_API_KEY === undefined,
)("SandboxIntegrations.daytona", () => {
  const organizationKey = Redacted.make(process.env.DAYTONA_API_KEY ?? "");

  layer(BunServices.layer, { excludeTestServices: true })("in Daytona's cloud", (it) => {
    it.effect(
      "checks an organization's key, and refuses another",
      () =>
        Effect.gen(function* () {
          const integration = yield* SandboxIntegrations.daytona;

          const valid = yield* integration.check(organization({}), { apiKey: organizationKey });
          const wrong = yield* integration.check(organization({}), {
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
          const integration = yield* SandboxIntegrations.daytona;
          const sandboxProvider = yield* integration.sandboxProvider(organization({}), {
            apiKey: organizationKey,
          });

          const sandbox = yield* sandboxProvider.createScoped();

          expect(sandbox.workingDirectory).toBe("/home/daytona");
        }),
      120_000,
    );
  });
});
