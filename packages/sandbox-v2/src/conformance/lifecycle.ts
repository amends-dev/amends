import { expect, layer } from "@effect/vitest";
import { Data, Deferred, Effect, Fiber, FileSystem, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { layerServices, type Sandbox } from "../Sandbox.ts";
import { Name } from "../Template.ts";
import { type Fixture, newIdentity, newSandboxId, useProvider } from "./Fixture.ts";

class PrepareFailed extends Data.TaggedError("PrepareFailed") {}

const writeFile = (sandbox: Sandbox["Service"], name: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFileString(path.join(sandbox.workingDirectory, name), content);
  }).pipe(Effect.provide(layerServices(sandbox)));

const readFile = (sandbox: Sandbox["Service"], name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.join(sandbox.workingDirectory, name));
  }).pipe(Effect.provide(layerServices(sandbox)));

/** Spawns a long command whose handle is unreferenced, so that it outlives the scope it spawned in. */
const spawnOutliving = (sandbox: Sandbox["Service"]) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(ChildProcess.make("sleep", ["60"]));
    // Never referenced again, so the effect that would do so is dropped.
    yield* Effect.asVoid(handle.unref);
    return handle;
  }).pipe(Effect.scoped, Effect.provide(layerServices(sandbox)));

/** Creating, resuming, stopping, and destroying sandboxes, and preparing them with templates. */
export const lifecycle = <R>(fixture: Fixture<R>) =>
  layer(fixture.layer, { excludeTestServices: true })("sandbox lifecycle", (it) => {
    it.effect(
      "resumes a sandbox with the id, working directory, and ports it was created with",
      () =>
        Effect.gen(function* () {
          const port = yield* fixture.freePort;
          const provider = yield* useProvider(fixture);
          const id = yield* newSandboxId;
          const created = yield* provider.create({ id, ports: [port] });
          const resumed = yield* provider.resume(id);

          expect(created.id).toBe(id);
          expect(resumed.id).toBe(id);
          expect(resumed.workingDirectory).toBe(created.workingDirectory);
          expect(resumed.ports).toEqual([port]);
        }),
      fixture.timeout,
    );

    it.effect(
      "describes where to work, and the ports servers are reachable on",
      () =>
        Effect.gen(function* () {
          const port = yield* fixture.freePort;
          const provider = yield* useProvider(fixture);
          const sandbox = yield* provider.create({ ports: [port] });

          expect(sandbox.description).toContain(sandbox.workingDirectory);
          expect(sandbox.description).toContain(String(port));
        }),
      fixture.timeout,
    );

    it.effect(
      "picks a different id for each sandbox created without one",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const first = yield* provider.create();
          const second = yield* provider.create();

          expect(first.id).not.toBe(second.id);
        }),
      fixture.timeout,
    );

    it.effect(
      "fails with AlreadyExistsError for an id in use and keeps that sandbox",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const id = yield* newSandboxId;
          const existing = yield* provider.create({ id });
          yield* writeFile(existing, "kept.txt", "kept");

          const error = yield* Effect.flip(provider.create({ id }));

          expect(error.reason._tag).toBe("AlreadyExistsError");
          expect(yield* readFile(yield* provider.resume(id), "kept.txt")).toBe("kept");
        }),
      fixture.timeout,
    );

    it.effect(
      "fails with NotFoundError when resuming an unknown id, without creating it",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const id = yield* newSandboxId;

          const error = yield* Effect.flip(provider.resume(id));

          expect(error.reason._tag).toBe("NotFoundError");
          // The id is still free, so resuming created nothing under it.
          expect((yield* provider.create({ id })).id).toBe(id);
        }),
      fixture.timeout,
    );

    it.effect(
      "cannot resume a destroyed sandbox, and destroying it again succeeds",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const id = yield* newSandboxId;
          const sandbox = yield* provider.create({ id });

          yield* sandbox.destroy;
          yield* sandbox.destroy;
          const error = yield* Effect.flip(provider.resume(id));

          expect(error.reason._tag).toBe("NotFoundError");
        }),
      fixture.timeout,
    );

    it.effect(
      "resumes a stopped sandbox with its files, where processes run again, and stopping it again succeeds",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const id = yield* newSandboxId;
          const sandbox = yield* provider.create({ id });
          yield* writeFile(sandbox, "kept.txt", "kept");

          yield* sandbox.stop;
          yield* sandbox.stop;
          const resumed = yield* provider.resume(id);
          const read = yield* Effect.gen(function* () {
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
            return yield* spawner.string(ChildProcess.make("cat", ["kept.txt"]));
          }).pipe(Effect.provide(layerServices(resumed)));

          expect(yield* readFile(resumed, "kept.txt")).toBe("kept");
          expect(read).toBe("kept");
        }),
      fixture.timeout,
    );

    it.effect(
      "ends the sandbox's running processes when it stops",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const sandbox = yield* provider.create();
          const handle = yield* Effect.gen(function* () {
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
            return yield* spawner.spawn(ChildProcess.make("sleep", ["60"]));
          }).pipe(Effect.provide(layerServices(sandbox)));

          yield* sandbox.stop;

          expect(yield* handle.isRunning).toBe(false);
        }),
      fixture.timeout,
    );

    it.effect(
      "ends a process that outlived the scope that spawned it when the sandbox stops",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const sandbox = yield* provider.create();

          const handle = yield* spawnOutliving(sandbox);
          const outlived = yield* handle.isRunning;
          yield* sandbox.stop;

          expect(outlived).toBe(true);
          expect(yield* handle.isRunning).toBe(false);
        }),
      fixture.timeout,
    );

    it.effect(
      "ends a process that outlived the scope that spawned it when it is destroyed",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const sandbox = yield* provider.create();

          const handle = yield* spawnOutliving(sandbox);
          yield* sandbox.destroy;

          expect(yield* handle.isRunning).toBe(false);
        }),
      fixture.timeout,
    );

    it.effect(
      "runs the template inside the sandbox before create returns",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);

          const sandbox = yield* provider.create({
            template: {
              name: Name.make("conformance-prepared"),
              identity: yield* newIdentity("prepared"),
              prepare: Effect.gen(function* () {
                const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
                yield* spawner.exitCode(
                  ChildProcess.make("sh", ["-c", "echo ready > prepared.txt"]),
                );
              }),
            },
          });

          expect(yield* readFile(sandbox, "prepared.txt")).toBe("ready\n");
        }),
      fixture.timeout,
    );

    it.effect(
      "fails create with the template's own error, leaving no sandbox behind",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const id = yield* newSandboxId;

          const error = yield* Effect.flip(
            provider.create({
              id,
              template: {
                name: Name.make("conformance-failing"),
                identity: yield* newIdentity("failing"),
                prepare: Effect.fail(new PrepareFailed()),
              },
            }),
          );

          expect(error._tag).toBe("PrepareFailed");
          expect((yield* Effect.flip(provider.resume(id))).reason._tag).toBe("NotFoundError");
          expect((yield* provider.create({ id })).id).toBe(id);
        }),
      fixture.timeout,
    );

    it.effect(
      "leaves no sandbox behind when create is interrupted",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const id = yield* newSandboxId;
          const preparing = yield* Deferred.make<void>();
          const creating = yield* Effect.forkChild(
            provider.create({
              id,
              template: {
                name: Name.make("conformance-endless"),
                identity: yield* newIdentity("endless"),
                prepare: Deferred.succeed(preparing, undefined).pipe(Effect.andThen(Effect.never)),
              },
            }),
          );

          yield* Deferred.await(preparing);
          yield* Fiber.interrupt(creating);

          expect((yield* Effect.flip(provider.resume(id))).reason._tag).toBe("NotFoundError");
          expect((yield* provider.create({ id })).id).toBe(id);
        }),
      fixture.timeout,
    );
  });
