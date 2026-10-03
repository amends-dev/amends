import { Network, Sandbox } from "@amends/sandbox-v2";
import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Data, Deferred, Effect, Fiber, FileSystem, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { makeProvider } from "./provider.ts";

const id = Sandbox.SandboxId.make("sandbox-one");
const port = Network.Port.make(3000);

class PrepareFailed extends Data.TaggedError("PrepareFailed") {}

const writeFile = (sandbox: Sandbox.Sandbox["Service"], name: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFileString(path.join(sandbox.workingDirectory, name), content);
  }).pipe(Effect.provide(Sandbox.layerServices(sandbox)));

const readFile = (sandbox: Sandbox.Sandbox["Service"], name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.join(sandbox.workingDirectory, name));
  }).pipe(Effect.provide(Sandbox.layerServices(sandbox)));

layer(BunServices.layer)("sandbox lifecycle", (it) => {
  it.effect("resumes a sandbox with the id, working directory, and ports it was created with", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;
      const created = yield* provider.create({ id, ports: [port] });
      const resumed = yield* provider.resume(id);

      expect(created.id).toBe(id);
      expect(resumed.id).toBe(id);
      expect(resumed.workingDirectory).toBe(created.workingDirectory);
      expect(resumed.ports).toEqual([port]);
    }),
  );

  it.effect("picks a different id for each sandbox created without one", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;
      const first = yield* provider.create();
      const second = yield* provider.create();

      expect(first.id).not.toBe(second.id);
    }),
  );

  it.effect("fails with AlreadyExistsError for an id in use and keeps that sandbox", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;
      const existing = yield* provider.create({ id });
      yield* writeFile(existing, "kept.txt", "kept");

      const error = yield* Effect.flip(provider.create({ id }));

      expect(error.reason._tag).toBe("AlreadyExistsError");
      expect(yield* readFile(yield* provider.resume(id), "kept.txt")).toBe("kept");
    }),
  );

  it.effect("fails with NotFoundError when resuming an unknown id, without creating it", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;

      const error = yield* Effect.flip(provider.resume(id));

      expect(error.reason._tag).toBe("NotFoundError");
      // The id is still free, so resuming created nothing under it.
      expect((yield* provider.create({ id })).id).toBe(id);
    }),
  );

  it.effect("cannot resume a destroyed sandbox, and destroying it again succeeds", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;
      const sandbox = yield* provider.create({ id });

      yield* sandbox.destroy;
      yield* sandbox.destroy;
      const error = yield* Effect.flip(provider.resume(id));

      expect(error.reason._tag).toBe("NotFoundError");
    }),
  );

  it.effect("keeps a stopped sandbox's files for resume, and stopping it again succeeds", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;
      const sandbox = yield* provider.create({ id });
      yield* writeFile(sandbox, "kept.txt", "kept");

      yield* sandbox.stop;
      yield* sandbox.stop;

      expect(yield* readFile(yield* provider.resume(id), "kept.txt")).toBe("kept");
    }),
  );

  it.effect("ends the sandbox's running processes when it stops", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;
      const sandbox = yield* provider.create({ id });
      const handle = yield* Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        return yield* spawner.spawn(ChildProcess.make("sleep", ["60"]));
      }).pipe(Effect.provide(Sandbox.layerServices(sandbox)));

      yield* sandbox.stop;

      expect(yield* handle.isRunning).toBe(false);
    }),
  );

  it.effect("runs the template inside the sandbox before create returns", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;

      const sandbox = yield* provider.create({
        template: {
          identity: "prepared",
          prepare: Effect.gen(function* () {
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
            yield* spawner.exitCode(ChildProcess.make("sh", ["-c", "echo ready > prepared.txt"]));
          }),
        },
      });

      expect(yield* readFile(sandbox, "prepared.txt")).toBe("ready\n");
    }),
  );

  it.effect("fails create with the template's own error, leaving no sandbox behind", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;

      const error = yield* Effect.flip(
        provider.create({
          id,
          template: { identity: "failing", prepare: Effect.fail(new PrepareFailed()) },
        }),
      );

      expect(error._tag).toBe("PrepareFailed");
      expect((yield* Effect.flip(provider.resume(id))).reason._tag).toBe("NotFoundError");
      expect((yield* provider.create({ id })).id).toBe(id);
    }),
  );

  it.effect("leaves no sandbox behind when create is interrupted", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;
      const preparing = yield* Deferred.make<void>();
      const creating = yield* Effect.forkChild(
        provider.create({
          id,
          template: {
            identity: "endless",
            prepare: Deferred.succeed(preparing, undefined).pipe(Effect.andThen(Effect.never)),
          },
        }),
      );

      yield* Deferred.await(preparing);
      yield* Fiber.interrupt(creating);

      expect((yield* Effect.flip(provider.resume(id))).reason._tag).toBe("NotFoundError");
      expect((yield* provider.create({ id })).id).toBe(id);
    }),
  );
});
