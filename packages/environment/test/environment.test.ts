import { describe, expect, it } from "@effect/vitest";
import { Crypto, Effect, Layer, Stream } from "effect";
import { LanguageModel, Model } from "effect/ai";
import type { AiError, Prompt, Response } from "effect/ai";
import { ConnectionImplementation } from "@amends/connection";
import type { ModelInference } from "@amends/connection/model-inference";
import { Environment, EnvironmentErrors } from "@amends/environment";
import { HarnessEvent } from "@amends/harness";
import type { Harness } from "@amends/harness";
import { AmendsHarness } from "@amends/harness-amends";
import { SandboxErrors } from "@amends/sandbox";
import type { Sandbox } from "@amends/sandbox";

type Script = Stream.Stream<Response.StreamPartEncoded, AiError.AiError>;

/** A connection's model code whose model answers each request with the next script. */
const scripted = Effect.fnUntraced(function* (scripts: ReadonlyArray<Script>) {
  const prompts: Array<Prompt.Prompt> = [];
  const model = yield* LanguageModel.make({
    generateText: () => Effect.die(new Error("The harness streams.")),
    streamText: (options) =>
      Stream.suspend(() => {
        prompts.push(options.prompt);
        return scripts[prompts.length - 1] ?? Stream.die(new Error("No script left."));
      }),
  });
  const inference: ModelInference.Implementation = {
    declaration: ConnectionImplementation.Declaration.make({
      id: ConnectionImplementation.Id.make("test"),
      name: "Test",
      description: "Scripted answers.",
      capabilities: { modelInference: { interface: "test" } },
      settings: [],
      authentication: [{ _tag: "None" }],
    }),
    languageModel: () =>
      Layer.mergeAll(
        Layer.succeed(LanguageModel.LanguageModel, model),
        Layer.succeed(Model.ProviderName, "test"),
        Layer.succeed(Model.ModelName, "test-model"),
      ),
    limits: () => ({ contextTokens: 100_000, outputTokens: undefined }),
  };
  const session: Environment.SessionOptions = {
    model: {
      inference,
      access: { settings: {}, credential: undefined },
      selection: { model: "m" },
    },
  };
  return { session, prompts };
});

const reply = (text: string): Script =>
  Stream.fromIterable([
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    { type: "finish", reason: "stop", usage: { inputTokens: {}, outputTokens: {} } },
  ]);

const batch = (id: string, text: string): HarnessEvent.InputBatch => ({
  id: HarnessEvent.BatchId.make(id),
  items: [
    { _tag: "Input", author: { id: "alice", name: "Alice" }, content: [{ _tag: "Text", text }] },
  ],
});

interface FakeSandbox {
  files: Map<string, Uint8Array>;
  status: "running" | "stopped";
}

/**
 * An in-memory sandbox provider recording what the environment asks of it. `exec` answers a shell
 * command with `results[command]`, or success.
 */
const fakeProvider = (results: Record<string, Sandbox.ExecResult> = {}) => {
  const sandboxes = new Map<string, FakeSandbox>();
  const snapshots = new Map<string, Map<string, Uint8Array>>();
  const calls: Array<string> = [];
  let next = 0;
  const open = (id: string): Sandbox.Running => {
    const state = () => sandboxes.get(id)!;
    return {
      id: id as Sandbox.Id,
      workdir: "/work",
      exec: (command) =>
        Effect.sync(() => {
          const shell = command.argv.at(-1) ?? "";
          calls.push(`exec ${id} ${shell}`);
          return results[shell] ?? { exitCode: 0, stdout: "", stderr: "" };
        }),
      spawn: () => Effect.die(new Error("unused")),
      expose: () => Effect.die(new Error("unused")),
      readFile: (path) => {
        const data = state().files.get(path);
        return data === undefined
          ? Effect.fail(new SandboxErrors.FileNotFound({ path }))
          : Effect.succeed(data);
      },
      writeFile: (path, data) => Effect.sync(() => void state().files.set(path, data)),
      snapshot: Effect.sync(() => {
        const snapshot = `snapshot-${next++}`;
        snapshots.set(snapshot, new Map(state().files));
        return { provider: "fake", id: snapshot };
      }),
      stop: Effect.sync(() => {
        state().status = "stopped";
        calls.push(`stop ${id}`);
      }),
      destroy: Effect.sync(() => {
        sandboxes.delete(id);
        calls.push(`destroy ${id}`);
      }),
    };
  };
  const provider: Sandbox.Provider = {
    name: "fake",
    capabilities: { stdin: false, snapshots: "filesystem", isolated: true },
    acquire: (options = {}) =>
      Effect.gen(function* () {
        if (options.id !== undefined && sandboxes.has(options.id)) {
          sandboxes.get(options.id)!.status = "running";
          return { sandbox: open(options.id), filesystem: "retained" as const };
        }
        const id = `sandbox-${next++}`;
        if (options.snapshot !== undefined) {
          const files = snapshots.get(options.snapshot.id);
          if (files === undefined)
            return yield* new SandboxErrors.SnapshotUnavailable({ reason: "gone" });
          sandboxes.set(id, { files: new Map(files), status: "running" });
          return { sandbox: open(id), filesystem: "restored" as const };
        }
        sandboxes.set(id, { files: new Map(), status: "running" });
        return { sandbox: open(id), filesystem: "fresh" as const };
      }),
    deleteSnapshot: (snapshot) => Effect.sync(() => void snapshots.delete(snapshot.id)),
  };
  return { provider, sandboxes, calls };
};

const crypto = Crypto.make({
  randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: () => Effect.die(new Error("Unexpected digest")),
});

/** The environments a host with amends's harness and these sandbox providers spawns. */
const environments = (sandboxes: ReadonlyArray<Sandbox.Provider> = []) =>
  Environment.make({ harnesses: [AmendsHarness.harness], sandboxes }).pipe(
    Effect.provideService(Crypto.Crypto, crypto),
  );

const inProcess: Environment.Definition = { id: "in-process", harnessId: "amends", sandbox: null };

const withSandbox = (
  retention: Environment.Retention,
  setup: ReadonlyArray<string> = [],
): Environment.Definition => ({
  id: "sandboxed",
  harnessId: "amends",
  sandbox: { providerId: "fake", template: null, env: {}, setup, retention },
});

const untilIdle = (session: Harness.Session) =>
  session.events.pipe(Stream.takeUntil(HarnessEvent.Event.isAnyOf(["Idle"])), Stream.runCollect);

describe("Environment.spawn", () => {
  it.effect("runs in process: a session per call, with the turn's model access", () =>
    Effect.gen(function* () {
      const { session, prompts } = yield* scripted([reply("Hello")]);
      const service = yield* environments();
      const running = yield* service.spawn(inProcess);
      expect(running.reference).toEqual({ definitionId: "in-process" });
      expect(running.filesystem).toEqual({ _tag: "None" });
      expect(yield* running.snapshot.pipe(Effect.flip)).toBeInstanceOf(SandboxErrors.Unsupported);

      const harness = yield* running.startSession({ ...session, instructions: "Be brief." });
      yield* harness.prepare([]);
      yield* harness.submit(batch("b1", "Hi"));
      const events = yield* untilIdle(harness);
      expect(events.map((event) => event._tag)).toEqual([
        "InputIncorporated",
        "TextDelta",
        "BlockCompleted",
        "ResponseFinished",
        "Idle",
      ]);
      expect(events[3]).toMatchObject({ model: { provider: "test", model: "test-model" } });
      expect(prompts[0]?.content[0]).toMatchObject({ role: "system", content: "Be brief." });
      yield* running.release;
    }),
  );

  it.effect("refuses a harness or sandbox provider this host did not install", () =>
    Effect.gen(function* () {
      const service = yield* environments();
      expect(
        yield* service.spawn({ ...inProcess, harnessId: "elsewhere" }).pipe(Effect.flip),
      ).toEqual(new EnvironmentErrors.HarnessUnavailable({ harnessId: "elsewhere" }));
      expect(yield* service.spawn(withSandbox("stop")).pipe(Effect.flip)).toEqual(
        new EnvironmentErrors.SandboxUnavailable({ providerId: "fake" }),
      );
    }),
  );

  it.effect("cannot restore a snapshot into an environment without a sandbox", () =>
    Effect.gen(function* () {
      const service = yield* environments();
      const failure = yield* service
        .spawn(inProcess, { restore: { provider: "fake", id: "snapshot-0" } })
        .pipe(Effect.flip);
      expect(failure).toBeInstanceOf(SandboxErrors.SnapshotUnavailable);
    }),
  );

  it.effect("runs setup in its sandbox before the harness starts, and stops it on release", () =>
    Effect.gen(function* () {
      const fake = fakeProvider();
      const service = yield* environments([fake.provider]);
      const running = yield* service.spawn(withSandbox("stop", ["install tools", "init"]));
      expect(running.reference).toEqual({ definitionId: "sandboxed", sandboxId: "sandbox-0" });
      expect(running.filesystem).toEqual({ _tag: "Fresh" });
      expect(fake.calls).toEqual(["exec sandbox-0 install tools", "exec sandbox-0 init"]);

      yield* running.release;
      yield* running.release;
      expect(fake.calls.filter((call) => call === "stop sandbox-0")).toHaveLength(1);
      expect(fake.sandboxes.get("sandbox-0")?.status).toBe("stopped");
    }),
  );

  it.effect("reports whether it retained, restored, or replaced the sandbox asked for", () =>
    Effect.gen(function* () {
      const fake = fakeProvider();
      const service = yield* environments([fake.provider]);
      const keep = withSandbox("stop", ["init"]);
      const first = yield* service.spawn(keep);
      const snapshot = yield* first.snapshot;
      yield* first.release;

      const retained = yield* service.spawn(keep, { reacquire: first.reference });
      expect(retained.reference).toEqual(first.reference);
      expect(retained.filesystem).toEqual({ _tag: "Retained" });
      expect(fake.calls.filter((call) => call === "exec sandbox-0 init")).toHaveLength(2);

      const discard = withSandbox("destroy");
      const destroyed = yield* service.spawn(discard, {
        reacquire: {
          definitionId: Environment.DefinitionId.make(discard.id),
          sandboxId: first.reference.sandboxId!,
        },
      });
      yield* destroyed.release;
      expect(fake.sandboxes.has("sandbox-0")).toBe(false);

      const restored = yield* service.spawn(keep, {
        reacquire: first.reference,
        restore: snapshot,
      });
      expect(restored.filesystem).toEqual({ _tag: "Restored", snapshot });
      expect(restored.reference.sandboxId).not.toBe(first.reference.sandboxId);

      const fresh = yield* service.spawn(keep, { reacquire: first.reference });
      expect(fresh.filesystem).toEqual({ _tag: "Fresh" });
    }),
  );

  it.effect(
    "fails the spawn when setup fails, destroying a new sandbox but not a reacquired one",
    () =>
      Effect.gen(function* () {
        const fake = fakeProvider({
          "broken --flag": { exitCode: 2, stdout: "", stderr: "no such tool" },
        });
        const service = yield* environments([fake.provider]);
        const definition = withSandbox("stop", ["broken --flag"]);

        expect(yield* service.spawn(definition).pipe(Effect.flip)).toEqual(
          new EnvironmentErrors.SetupFailed({
            command: "broken --flag",
            exitCode: 2,
            stdout: "",
            stderr: "no such tool",
          }),
        );
        expect(fake.calls.at(-1)).toBe("destroy sandbox-0");

        fake.sandboxes.set("kept", { files: new Map(), status: "stopped" });
        yield* service
          .spawn(definition, {
            reacquire: {
              definitionId: Environment.DefinitionId.make(definition.id),
              sandboxId: "kept" as Sandbox.Id,
            },
          })
          .pipe(Effect.flip);
        expect(fake.calls.at(-1)).toBe("stop kept");
        expect(fake.sandboxes.has("kept")).toBe(true);
      }),
  );

  it.effect("refuses to reacquire another definition's running environment", () =>
    Effect.gen(function* () {
      const service = yield* environments();
      const failure = yield* service
        .spawn(inProcess, {
          reacquire: { definitionId: Environment.DefinitionId.make("elsewhere") },
        })
        .pipe(Effect.flip);
      expect(failure).toEqual(
        new EnvironmentErrors.ForeignReference({ definitionId: "elsewhere" }),
      );
    }),
  );

  it.effect("continues in a reacquired sandbox from the events a session recorded", () =>
    Effect.gen(function* () {
      const fake = fakeProvider();
      const service = yield* environments([fake.provider]);
      const definition = withSandbox("stop");
      const first = yield* scripted([reply("High tide is at noon.")]);
      const earlier = yield* service.spawn(definition);
      const recorded = yield* Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* earlier.startSession(first.session);
          yield* harness.prepare([]);
          yield* harness.submit(batch("b1", "When is high tide?"));
          return yield* untilIdle(harness);
        }),
      );
      yield* earlier.release;

      const second = yield* scripted([reply("Low tide is at six.")]);
      const later = yield* service.spawn(definition, { reacquire: earlier.reference });
      expect(later.filesystem).toEqual({ _tag: "Retained" });
      const harness = yield* later.startSession(second.session);
      yield* harness.prepare(HarnessEvent.transcript(recorded));
      yield* harness.submit(batch("b2", "And low tide?"));
      yield* untilIdle(harness);
      // The later session's model reads the earlier exchange before the new question.
      expect(
        second.prompts[0]?.content.map((message) =>
          typeof message.content === "string"
            ? message.content
            : message.content.map((part) => (part.type === "text" ? part.text : "")).join(""),
        ),
      ).toEqual(["Alice: When is high tide?", "High tide is at noon.", "Alice: And low tide?"]);
    }),
  );
});
