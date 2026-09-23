import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup } from "./database.ts";
import { withServer } from "./server.ts";

const temporary = async (use: (directory: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "amends-server-fixture-"));
  try {
    await use(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
const script = (source: string) => [process.execPath, "--no-env-file", "-e", source];
/** Nothing listens here, so a server that reached its database would fail to connect. */
const unreachable = "postgres://unused:unused@127.0.0.1:1/unused";
const { available, withDatabase } = setup();

describe.skipIf(!available)("PostgreSQL", () => {
  it.live("the subprocess fixture overrides inherited configuration with its own database", () =>
    withDatabase((url) =>
      Effect.promise(() =>
        withServer(
          url,
          async (call) => {
            expect(
              (await call("fixture-owner", "POST", "/workspaces", { name: "Test workspace" }))
                .status,
            ).toBe(201);
          },
          { env: { AMENDS_DATABASE_URL: unreachable, AMENDS_PORT: "-1" } },
        ),
      ),
    ),
  );
});

it("startup failure drains stderr and includes the final diagnostic", async () => {
  await rejects(
    withServer(unreachable, async () => {}, {
      command: script(
        'console.error("x".repeat(262144)); console.error("final startup diagnostic"); process.exit(17);',
      ),
    }),
    /final startup diagnostic/,
  );
});

it("startup timeout terminates the child before releasing the fixture", async () =>
  temporary(async (directory) => {
    const pidFile = join(directory, "pid");
    await rejects(
      withServer(unreachable, async () => {}, {
        command: script(
          `await Bun.write(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`,
        ),
        startupTimeoutMs: 250,
      }),
      /Timed out waiting for the server/,
    );
    const pid = Number(await Bun.file(pidFile).text());
    expect(() => process.kill(pid, 0)).toThrow();
  }));

it("callback failure still terminates the child", async () =>
  temporary(async (directory) => {
    const pidFile = join(directory, "pid");
    await rejects(
      withServer(
        unreachable,
        async () => {
          throw new Error("Callback failed");
        },
        {
          command: script(
            `await Bun.write(${JSON.stringify(pidFile)}, String(process.pid)); console.log("Listening on http://127.0.0.1:1"); setInterval(() => {}, 1000);`,
          ),
        },
      ),
      /Callback failed/,
    );
    const pid = Number(await Bun.file(pidFile).text());
    expect(() => process.kill(pid, 0)).toThrow();
  }));

it("invalid startup configuration fails before connecting to the database", async () => {
  await rejects(
    withServer(unreachable, async () => {}, {
      command: script(
        'process.env.AMENDS_PORT = "-1"; await import("./hosts/local/src/index.ts");',
      ),
    }),
    /AMENDS_PORT/,
  );
});

it("importing host modules does not read configuration or launch the application", async () => {
  await rejects(
    withServer(
      unreachable,
      async () => {
        throw new Error("Unexpected server startup");
      },
      {
        command: script(`process.env.AMENDS_PORT = "invalid";
      await Promise.all([
        import("./hosts/local/src/config.ts"), import("./hosts/local/src/host.ts"),
        import("./hosts/local/src/server.ts"), import("./hosts/local/src/authentication/authentication.ts"),
      ]);
      console.error("Host imports completed without startup");`),
      },
    ),
    /Host imports completed without startup/,
  );
});
