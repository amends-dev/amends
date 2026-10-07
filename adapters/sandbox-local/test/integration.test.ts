import { Connection } from "@amends/connection";
import { LocalSandboxProvider } from "@amends/sandbox-local";
import { Sandbox } from "@amends/sandbox";
import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

const connectionOf = (id: string): Connection.Connection => ({
  id: Connection.ConnectionId.make(id),
  integration: "local",
  name: `Machine ${id}`,
  settings: {},
  auth: "none",
});

/**
 * The integration over a directory in a temporary one, with both for tests to look into, so that
 * nothing a test makes outside the integration's directory is left behind.
 */
const makeIntegration = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const temporary = yield* fs.makeTempDirectoryScoped();
  const directory = path.join(temporary, "sandboxes");
  return {
    temporary,
    directory,
    integration: yield* LocalSandboxProvider.integration({ directory }),
  };
});

layer(BunServices.layer)("LocalSandboxProvider.integration", (it) => {
  it.effect("keeps each connection's sandboxes in a directory of its own, named by its id", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const { directory, integration } = yield* makeIntegration;
      const id = Sandbox.SandboxId.make("sandbox-one");

      const mine = yield* integration.sandboxProvider(connectionOf("conn-a"), undefined);
      const theirs = yield* integration.sandboxProvider(connectionOf("conn-b"), undefined);
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
      const { temporary, integration } = yield* makeIntegration;
      const escaping = connectionOf("../outside");

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
      const { temporary, directory, integration } = yield* makeIntegration;
      const file = path.join(temporary, "file");
      yield* fs.writeFileString(file, "");
      const underFile = yield* LocalSandboxProvider.integration({ directory: file });

      const healthy = yield* integration.check(connectionOf("conn-a"), undefined);
      const unavailable = yield* underFile.check(connectionOf("conn-a"), undefined);

      expect(healthy).toEqual({ status: "healthy" });
      expect(yield* fs.exists(path.join(directory, "conn-a"))).toBe(true);
      expect(unavailable.status).toBe("unavailable");
      expect(unavailable.description).toContain("The sandboxes of Machine conn-a cannot be kept");
    }),
  );
});
