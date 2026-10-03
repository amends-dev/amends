import { fileURLToPath } from "node:url";
import type { HarnessServer } from "@amends/environment";
import { HarnessServerHost } from "@amends/harness-server";
import { Crypto, Effect, FileSystem, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export interface Options {
  /** Where builds are written, a directory for each platform. */
  readonly directory: string;
}

const platforms: ReadonlyArray<HarnessServer.Platform> = [
  "linux-x64",
  "linux-arm64",
  "darwin-x64",
  "darwin-arm64",
];

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * The harness server this host uploads into sandboxes, compiled from `@amends/harness-server` by
 * the Bun running this host the first time a sandbox on each platform needs it. Its version is a
 * digest of the build, so a sandbox already holding that build is not sent it again.
 *
 * @category constructors
 */
export const make = Effect.fnUntraced(function* (options: Options) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const crypto = yield* Crypto.Crypto;
  const entry = Bun.resolveSync(
    "@amends/harness-server/index.ts",
    fileURLToPath(new URL(".", import.meta.url)),
  );

  const compile = Effect.fnUntraced(function* (platform: HarnessServer.Platform) {
    const outfile = path.join(options.directory, platform, "harness-server");
    const build = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [
        "build",
        entry,
        "--compile",
        `--target=bun-${platform}`,
        `--outfile=${outfile}`,
      ]),
    );
    const [output, exitCode] = yield* Effect.all(
      [build.all.pipe(Stream.decodeText(), Stream.mkString), build.exitCode],
      { concurrency: "unbounded" },
    );
    if (exitCode !== 0)
      return yield* Effect.die(new Error(`Building the harness server failed:\n${output}`));
    const data = yield* fs.readFile(outfile);
    const digest = yield* crypto.digest("SHA-256", data);
    return { version: hex(digest).slice(0, 16), data } satisfies HarnessServer.Binary;
  }, Effect.scoped);

  const builds = new Map(
    yield* Effect.forEach(platforms, (platform) =>
      Effect.cached(Effect.orDie(compile(platform))).pipe(
        Effect.map((build) => [platform, build] as const),
      ),
    ),
  );
  const program: HarnessServer.Program = {
    harnesses: HarnessServerHost.served.harnesses.map((harness) => harness.declaration.id),
    binary: (platform) => builds.get(platform)!,
  };
  return program;
});

export * as LocalHarnessServer from "./harness-server.ts";
