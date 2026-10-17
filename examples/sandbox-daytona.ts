/**
 * A sandbox on Daytona, a Linux machine of its own: create one, work inside it with Effect's own
 * file system and processes, stop it, resume it by its id, and destroy it. The same program as
 * `sandbox-local.ts`, on another provider.
 *
 * Needs DAYTONA_API_KEY. Run with `bun examples/sandbox-daytona.ts`.
 */

import { Sandbox, SandboxProvider } from "@amends-dev/sandbox"
import { DaytonaSandboxProvider } from "@amends-dev/sandbox-daytona"
import { BunCrypto, BunRuntime } from "@effect/platform-bun"
import { Config, Console, Effect, FileSystem, Layer } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const sandboxes = Layer.unwrap(
  Effect.map(Config.Redacted("DAYTONA_API_KEY"), (apiKey) => DaytonaSandboxProvider.layer({ apiKey }))
).pipe(Layer.provide(BunCrypto.layer))

const program = Effect.gen(function* () {
  const sandboxProvider = yield* SandboxProvider.SandboxProvider
  const sandbox = yield* sandboxProvider.create()
  yield* Console.log(`Created ${sandbox.id}, working in ${sandbox.workingDirectory}`)

  // Inside the sandbox, Effect's FileSystem and ChildProcessSpawner are the sandbox's own, and a
  // command starts in its working directory.
  const greeting = yield* Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    yield* spawner.exitCode(ChildProcess.make("sh", ["-c", "echo hello from $(uname -m) > greeting.txt"]))
    return yield* fs.readFileString(`${sandbox.workingDirectory}/greeting.txt`)
  }).pipe(Effect.provide(Sandbox.layerServices(sandbox)))
  yield* Console.log(greeting.trim())

  // Stopping keeps the files. The provider resumes the sandbox by its id, from any host.
  yield* sandbox.stop
  const resumed = yield* sandboxProvider.resume(sandbox.id)
  const kept = yield* resumed.fileSystem.readFileString(`${resumed.workingDirectory}/greeting.txt`)
  yield* Console.log(`After resuming: ${kept.trim()}`)

  // Destroying removes the sandbox from Daytona.
  yield* resumed.destroy
}).pipe(Effect.provide(sandboxes))

BunRuntime.runMain(program)
