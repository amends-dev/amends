/**
 * Installs an opencode agent's bridge in a sandbox, and launches it there. The template gives the
 * sandbox a pinned Bun and a pinned opencode in `~/.amends/opencode/<programs>`, a directory named
 * for their versions, and beside them the agent's bridge program bundled into one file, named for
 * its contents: like AI SDK's harness, it keeps what it installs in the sandbox's home, out of the
 * directory sessions work in. Bun and opencode come from their npm packages for the sandbox's
 * platform, which the sandbox downloads and checks against the integrity npm published for them,
 * as a lockfile pins them. The two agents share the programs: opencode 1.18 serves both the
 * session API of opencode 1 and that of opencode 2.
 *
 * What a sandbox has already is kept: one created from a snapshot of a prepared one, or a local
 * sandbox sharing this machine's home with one prepared before, is ready at once, and a new bridge
 * program installs without downloading the programs again.
 */
import { Template } from "@amends/sandbox";
import { Crypto, Effect, FileSystem, Path, PlatformError, Result, Stream } from "effect";
import { Base64, Hex } from "effect/encoding";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** The platforms the bridge installs on, as `platformOf` names them. */
export type Platform = `${"darwin" | "linux"}-${"arm64" | "x64"}`;

/**
 * An npm package holding one program as `bin/<program>`, and the integrity npm published for
 * it.
 */
interface Package {
  readonly name: string;
  readonly integrity: string;
}

/** The programs the bridge needs, each at a pinned version, from its package for each platform. */
const programs = {
  bun: {
    version: "1.3.14",
    packages: {
      "darwin-arm64": {
        name: "@oven/bun-darwin-aarch64",
        integrity:
          "sha512-Omj20SuiHBOUjUBIyqtkNjSUIjOtEOJwmbix/ZyFH4BaQ6OZTaaRWIR4TjHVz0yadHgli6lLTiAh1uarnvD49A==",
      },
      "darwin-x64": {
        name: "@oven/bun-darwin-x64",
        integrity:
          "sha512-FFj3QdU/OhlDyZOJ8CWfN5eWLpRlT4qjZg7lMQi7jA6GuoY5ajlO1zWLP/MuHYRSbXQUvV52RejNi8DVnAp13w==",
      },
      "linux-arm64": {
        name: "@oven/bun-linux-aarch64",
        integrity:
          "sha512-X5SsPZHs+iYO8R/efIcRtc7gT2Q2DgPfliCxEkx4cXBumwkw0c/EsHMNwH3EgGpCDaZ7IYVPhpCG/xBOQHEwZw==",
      },
      "linux-x64": {
        name: "@oven/bun-linux-x64",
        integrity:
          "sha512-7OVTAKvwfPmSbIV1HpdOoVVx5VRc427GuPPne93N6vk4eQBPId9nXmZDh9/zGaKPdbVjVtQSZafWQoUjx38Utw==",
      },
    },
  },
  opencode: {
    version: "1.18.23",
    packages: {
      "darwin-arm64": {
        name: "opencode-darwin-arm64",
        integrity:
          "sha512-QP9PjwpHtZoLVXw2WvUmPZecz7mWbQkT4t3K36B//fCaDG+zWa+SsztIeaW5azujNwwtUemLA5icE/zINng48Q==",
      },
      "darwin-x64": {
        name: "opencode-darwin-x64",
        integrity:
          "sha512-R9nWP3edz/0FnEfwmuxtiWBB7bS4NtZCyCffJyiMlrbwdDC+bIXYrWxWXVrzaP1mJujs6g2MAwTCUSx/qpBhDw==",
      },
      "linux-arm64": {
        name: "opencode-linux-arm64",
        integrity:
          "sha512-g1zDFhuE9FOYwjSGderlu69wfd4GQzS0xsDiIY11QUciuBmM6DrHqLvmhlLFsUVHYVnCPY1YeN1pq5ewE3x72Q==",
      },
      "linux-x64": {
        name: "opencode-linux-x64",
        integrity:
          "sha512-5x9d1Cm/YtqzR6lAlNbgVprTQ3R3hx7qGTWCzm5l5u6lBNkhYTrhy2s8k25dxKKuxqZ9Kngqz9JYWvSVHy2Lmw==",
      },
    },
  },
} satisfies {
  readonly [program: string]: {
    readonly version: string;
    readonly packages: { readonly [platform in Platform]: Package };
  };
};

/** Bump to install the programs anew, as when the files they install move. */
const layoutVersion = 1;

/**
 * The version of opencode an agent runs: 1, whose session API opencode 1 speaks, or 2, whose
 * session API opencode 2 speaks. Each has a bridge program of its own, `bridge/v<version>/main`.
 */
export type Version = 1 | 2;

export interface Installation {
  /** Installs the bridge in a new sandbox. */
  readonly template: Template.Template;

  /** The command that launches the installed bridge, and its arguments. */
  readonly command: string;

  readonly args: ReadonlyArray<string>;
}

/**
 * Bundles the bridge program of the agent that runs opencode `version`, giving the template that
 * installs it with the command that launches it. The template's identity changes with anything it
 * installs.
 */
export const makeInstallation = Effect.fn("OpencodeAgent.makeInstallation")(function* (
  version: Version,
) {
  const crypto = yield* Crypto.Crypto;
  const hashOf = (text: string) =>
    Effect.map(crypto.digest("SHA-256", new TextEncoder().encode(text)), (digest) =>
      Hex.encode(digest).slice(0, 16),
    );
  const bundle = yield* bundleBridge(version);
  const programsHash = yield* hashOf(JSON.stringify([layoutVersion, programs]));
  const bundleHash = yield* hashOf(bundle);
  const directory = `.amends/opencode/${programsHash}`;
  const bridge = `bridge-${bundleHash}.js`;
  const installation: Installation = {
    template: {
      name: Template.TemplateName.make(version === 1 ? "opencode" : "opencode2"),
      identity: `${programsHash}-${bundleHash}`,
      prepare: install(directory, bridge, bundle),
    },
    command: "sh",
    args: ["-c", `exec "$HOME/${directory}/bun" "$HOME/${directory}/${bridge}"`],
  };
  return installation;
});

/** The platform that `uname -sm` printed, or nothing for one the bridge does not install on. */
export const platformOf = (uname: string): Platform | undefined => {
  const [system, machine] = uname.trim().split(/\s+/);
  const architecture =
    machine === "arm64" || machine === "aarch64"
      ? "arm64"
      : machine === "x86_64" || machine === "amd64"
        ? "x64"
        : undefined;
  if (architecture === undefined) return undefined;
  return system === "Darwin"
    ? `darwin-${architecture}`
    : system === "Linux"
      ? `linux-${architecture}`
      : undefined;
};

/**
 * The bridge program of opencode `version`, `bridge/v<version>/main.ts`, bundled with everything
 * it imports into one file for Bun. The program is beside this module, in this module's own form:
 * a source among the sources, a compiled file among the compiled ones of the distribution.
 */
const bundleBridge = (version: Version) =>
  Effect.promise(async () => {
    const extension = import.meta.url.slice(import.meta.url.lastIndexOf("."));
    const { outputs } = await Bun.build({
      entrypoints: [`${import.meta.dirname}/bridge/v${version}/main${extension}`],
      target: "bun",
      minify: true,
    });
    const [bundle] = outputs;
    if (bundle === undefined) throw new Error("Bun built the bridge program into no file");
    return bundle.text();
  });

/**
 * Installs Bun and opencode in `directory` of the sandbox's home, and `bundle` beside them as
 * `bridge`, each unless the sandbox has it already. Each goes in under another name first, renamed
 * into place once whole, so that no bridge launches from half an installation.
 */
const install = (directory: string, bridge: string, bundle: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const installed = path.join(yield* homeDirectory, directory);
    if (!(yield* fs.exists(installed))) yield* installPrograms(installed);
    const bridgeFile = path.join(installed, bridge);
    if (yield* fs.exists(bridgeFile)) return;
    const staging = yield* fs.makeTempDirectory({ directory: installed, prefix: ".bridge-" });
    yield* fs
      .writeFileString(path.join(staging, bridge), bundle)
      .pipe(
        Effect.andThen(fs.rename(path.join(staging, bridge), bridgeFile)),
        Effect.ensuring(Effect.ignore(fs.remove(staging, { recursive: true, force: true }))),
      );
  });

/** Installs Bun and opencode in `installed`, checking that each runs as its pinned version. */
const installPrograms = (installed: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const uname = yield* run("uname", ["-sm"]);
    const platform = platformOf(uname);
    if (platform === undefined) {
      return yield* failure(
        "Unknown",
        "opencode's bridge installs on macOS and on Linux with glibc, on arm64 and x64, not on " +
          uname.trim(),
      );
    }

    yield* fs.makeDirectory(path.dirname(installed), { recursive: true });
    const staging = yield* fs.makeTempDirectory({
      directory: path.dirname(installed),
      prefix: `.${path.basename(installed)}-`,
    });
    yield* Effect.gen(function* () {
      for (const [program, { version, packages }] of Object.entries(programs)) {
        yield* installProgram(staging, program, version, packages[platform]);
      }
      // A sandbox sharing this home may have installed the same meanwhile, which serves as well.
      yield* fs
        .rename(staging, installed)
        .pipe(
          Effect.catch((error) =>
            Effect.flatMap(fs.exists(installed), (exists) =>
              exists ? Effect.void : Effect.fail(error),
            ),
          ),
        );
    }).pipe(Effect.ensuring(Effect.ignore(fs.remove(staging, { recursive: true, force: true }))));
  });

/**
 * Installs `program` from `pkg` in `directory`: downloads the package, checks it against the
 * integrity npm published for it, extracts the program, and checks that it runs as `version`.
 */
const installProgram = (directory: string, program: string, version: string, pkg: Package) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tarball = path.join(directory, `${program}.tgz`);
    yield* run("curl", [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--retry",
      "3",
      "--output",
      tarball,
      `https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split("/").at(-1)}-${version}.tgz`,
    ]);
    // macOS has no `sha512sum`, and slim Linux images have no `shasum`.
    const [sha512] = (yield* run("sh", [
      "-c",
      'sha512sum "$1" 2>/dev/null || shasum -a 512 "$1"',
      "sh",
      tarball,
    ])).split(/\s/);
    if (sha512 !== hexOf(pkg.integrity)) {
      return yield* failure(
        "InvalidData",
        `${pkg.name}@${version} does not match the integrity npm published for it`,
      );
    }
    yield* run("tar", [
      "-xzf",
      tarball,
      "-C",
      directory,
      "--strip-components=2",
      `package/bin/${program}`,
    ]);
    yield* fs.remove(tarball);
    const printed = (yield* run(path.join(directory, program), ["--version"])).trim();
    if (printed !== version) {
      return yield* failure(
        "InvalidData",
        `${program} ${version} printed ${printed} as its version`,
      );
    }
  });

/** Runs `command` in the sandbox for its output, failing with its error output when it fails. */
const run = (command: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const process = yield* spawner.spawn(ChildProcess.make(command, args, { stdin: "ignore" }));
    const [output, errorOutput, code] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(process.stdout)),
        Stream.mkString(Stream.decodeText(process.stderr)),
        process.exitCode,
      ],
      { concurrency: "unbounded" },
    );
    if (code !== 0) {
      return yield* failure(
        "Unknown",
        `\`${[command, ...args].join(" ")}\` exited with code ${code}: ${errorOutput.trim()}`,
      );
    }
    return output;
  }).pipe(Effect.scoped);

/** The sandbox's home directory. */
const homeDirectory = run("sh", ["-c", 'printf %s "$HOME"']).pipe(
  Effect.filterOrFail(
    (home) => home.startsWith("/"),
    () => failure("NotFound", "The sandbox has no home directory"),
  ),
);

/** The SHA-512 digest in hex that an npm `integrity` names. */
const hexOf = (integrity: string) =>
  Hex.encode(Result.getOrThrow(Base64.decode(integrity.slice("sha512-".length))));

const failure = (tag: PlatformError.SystemErrorTag, description: string) =>
  PlatformError.systemError({
    _tag: tag,
    module: "OpencodeAgent",
    method: "prepare",
    description,
  });
