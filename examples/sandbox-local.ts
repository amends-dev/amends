/**
 * A sandbox on this machine: create one, work inside it with Effect's own file system and
 * processes, stop it, resume it by its id, and destroy it.
 *
 * Needs nothing. Run with `bun examples/sandbox-local.ts`.
 */

import { tmpdir } from "node:os"
import { Sandbox, SandboxProvider } from "@amends-dev/sandbox"
import { LocalSandboxProvider } from "@amends-dev/sandbox-local"
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Console, Effect, FileSystem, Layer, Path } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

// Each sandbox is a directory under this one, which the provider creates if it is missing.
const sandboxes = LocalSandboxProvider.layer({ directory: `${tmpdir()}/amends-examples` }).pipe(
  Layer.provide(BunServices.layer)
)

const program = Effect.gen(function* () {
  const sandboxProvider = yield* SandboxProvider.SandboxProvider
  const sandbox = yield* sandboxProvider.create()
  yield* Console.log(`Created ${sandbox.id} at ${sandbox.workingDirectory}`)

  // Inside the sandbox, Effect's FileSystem and ChildProcessSpawner are the sandbox's own, and a
  // command starts in its working directory.
  const greeting = yield* Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    yield* spawner.exitCode(ChildProcess.make("sh", ["-c", "echo hello from the sandbox > greeting.txt"]))
    return yield* fs.readFileString(path.join(sandbox.workingDirectory, "greeting.txt"))
  }).pipe(Effect.provide(Sandbox.layerServices(sandbox)))
  yield* Console.log(greeting.trim())

  // Stopping keeps the files. The provider resumes the sandbox by its id, in this process or another.
  yield* sandbox.stop
  const resumed = yield* sandboxProvider.resume(sandbox.id)
  const kept = yield* resumed.fileSystem.readFileString(`${resumed.workingDirectory}/greeting.txt`)
  yield* Console.log(`After resuming: ${kept.trim()}`)

  // Destroying removes the sandbox with its files.
  yield* resumed.destroy
}).pipe(Effect.provide(sandboxes))

BunRuntime.runMain(program)
