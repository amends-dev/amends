import { describe, expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import type { AiError, Response } from "effect/unstable/ai";
import { Environment, EnvironmentErrors } from "@amends/environment";
import { HarnessEvent, Transcript } from "@amends/harness";
import type { HarnessTool } from "@amends/harness";
import { AmendsHarness } from "@amends/harness-amends";
import { SandboxErrors } from "@amends/sandbox";
import type { Sandbox } from "@amends/sandbox";

type Script = Stream.Stream<Response.StreamPartEncoded, AiError.AiError>;

/** A model that answers each request with the next script and keeps every prompt. */
const scripted = Effect.fnUntraced(function* (scripts: ReadonlyArray<Script>) {
  const prompts: Array<unknown> = [];
  const model = yield* LanguageModel.make({
    generateText: () => Effect.die(new Error("The harness streams.")),
    streamText: (options) =>
      Stream.suspend(() => {
        prompts.push(options.prompt);
        return scripts[prompts.length - 1] ?? Stream.die(new Error("No script left."));
      }),
  });
  return { model, prompts };
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
 * An in-memory sandbox provider recording what the environment asks of it. `exec` answers with
 * `results[argv[0]]`, or success.
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
          calls.push(`exec ${id} ${command.argv.join(" ")}`);
          return results[command.argv[0]] ?? { exitCode: 0, stdout: "", stderr: "" };
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

const inProcess: Environment.Definition<LanguageModel.LanguageModel> = {
  id: Environment.DefinitionId.make("in-process"),
  harness: AmendsHarness.make(),
};

const withSandbox = (
  provider: Sandbox.Provider,
  retention: Environment.Retention,
  setup: ReadonlyArray<Sandbox.Command> = [],
): Environment.Definition<LanguageModel.LanguageModel> => ({
  id: Environment.DefinitionId.make("sandboxed"),
  harness: AmendsHarness.make(),
  sandbox: { provider, retention, setup },
});

const untilIdle = (running: Environment.Running) =>
  running.events.pipe(
    Stream.takeUntil((event) => event._tag === "Harness" && event.event._tag === "Idle"),
    Stream.runCollect,
  );

const harnessEvents = (events: ReadonlyArray<Environment.Event>) =>
  events.flatMap((event) => (event._tag === "Harness" ? [event.event] : []));

describe("Environment.spawn", () => {
  it.effect("runs in process: ready first, then history, input, and release", () =>
    Effect.gen(function* () {
      const { model } = yield* scripted([reply("Hello")]);
      const running = yield* Environment.spawn(inProcess, { sessionId: "s1" }).pipe(
        Effect.provideService(LanguageModel.LanguageModel, model),
      );
      expect(running.reference).toEqual({ definitionId: "in-process" });
      expect(running.acquisition).toEqual({
        filesystem: { _tag: "None" },
        harness: "needs-setup",
      });
      expect(yield* running.snapshot.pipe(Effect.flip)).toBeInstanceOf(SandboxErrors.Unsupported);

      yield* running.prepare([]);
      yield* running.submit(batch("b1", "Hi"));
      const events = yield* untilIdle(running);
      expect(events[0]).toEqual({
        _tag: "Environment",
        event: { _tag: "Ready", reference: running.reference, acquisition: running.acquisition },
      });
      expect(harnessEvents(events).map((event) => event._tag)).toEqual([
        "InputIncorporated",
        "TextDelta",
        "ResponseCompleted",
        "Idle",
      ]);

      yield* running.release;
      expect(yield* Stream.runCollect(running.events)).toEqual([
        { _tag: "Environment", event: { _tag: "Released" } },
      ]);
      yield* running.release;
      expect(yield* running.submit(batch("b2", "More")).pipe(Effect.flip)).toBeInstanceOf(
        EnvironmentErrors.Released,
      );
    }),
  );

  it.effect("cannot restore a snapshot into an environment without a sandbox", () =>
    Effect.gen(function* () {
      const { model } = yield* scripted([]);
      const failure = yield* Environment.spawn(inProcess, {
        sessionId: "s1",
        restore: { provider: "fake", id: "snapshot-0" },
      }).pipe(Effect.provideService(LanguageModel.LanguageModel, model), Effect.flip);
      expect(failure).toBeInstanceOf(SandboxErrors.SnapshotUnavailable);
    }),
  );

  it.effect("runs setup in its sandbox before the harness starts, and stops it on release", () =>
    Effect.gen(function* () {
      const { model } = yield* scripted([]);
      const fake = fakeProvider();
      const definition = withSandbox(fake.provider, "stop", [
        { argv: ["install", "tools"] },
        { argv: ["init"] },
      ]);
      const running = yield* Environment.spawn(definition, { sessionId: "s1" }).pipe(
        Effect.provideService(LanguageModel.LanguageModel, model),
      );
      expect(running.reference).toEqual({ definitionId: "sandboxed", sandboxId: "sandbox-0" });
      expect(running.acquisition.filesystem).toEqual({ _tag: "Fresh" });
      expect(fake.calls).toEqual(["exec sandbox-0 install tools", "exec sandbox-0 init"]);

      const snapshot = yield* running.snapshot;
      yield* running.release;
      expect(fake.calls.at(-1)).toBe("stop sandbox-0");
      expect(fake.sandboxes.get("sandbox-0")?.status).toBe("stopped");
      expect(yield* Stream.runCollect(running.events)).toEqual([
        { _tag: "Environment", event: expect.objectContaining({ _tag: "Ready" }) },
        { _tag: "Environment", event: { _tag: "SnapshotTaken", snapshot } },
        { _tag: "Environment", event: { _tag: "Released" } },
      ]);
    }),
  );

  it.effect("reports whether it retained, restored, or replaced the sandbox asked for", () =>
    Effect.gen(function* () {
      const { model } = yield* scripted([]);
      const fake = fakeProvider();
      const spawn = (
        definition: Environment.Definition<LanguageModel.LanguageModel>,
        options: Omit<Environment.SpawnOptions, "sessionId">,
      ) =>
        Environment.spawn(definition, { sessionId: "s", ...options }).pipe(
          Effect.provideService(LanguageModel.LanguageModel, model),
        );
      const keep = withSandbox(fake.provider, "stop", [{ argv: ["init"] }]);
      const first = yield* spawn(keep, {});
      const snapshot = yield* first.snapshot;
      yield* first.release;

      const retained = yield* spawn(keep, { reacquire: first.reference });
      expect(retained.reference).toEqual(first.reference);
      expect(retained.acquisition).toEqual({
        filesystem: { _tag: "Retained" },
        harness: "needs-setup",
      });
      expect(fake.calls.filter((call) => call === "exec sandbox-0 init")).toHaveLength(2);

      const discard = withSandbox(fake.provider, "destroy");
      const destroyed = yield* spawn(discard, {
        reacquire: { definitionId: discard.id, sandboxId: first.reference.sandboxId! },
      });
      yield* destroyed.release;
      expect(fake.sandboxes.has("sandbox-0")).toBe(false);

      const restored = yield* spawn(keep, { reacquire: first.reference, restore: snapshot });
      expect(restored.acquisition.filesystem).toEqual({ _tag: "Restored", snapshot });
      expect(restored.reference.sandboxId).not.toBe(first.reference.sandboxId);

      const fresh = yield* spawn(keep, { reacquire: first.reference });
      expect(fresh.acquisition.filesystem).toEqual({ _tag: "Fresh" });
    }),
  );

  it.effect(
    "fails the spawn when setup fails, destroying a new sandbox but not a reacquired one",
    () =>
      Effect.gen(function* () {
        const { model } = yield* scripted([]);
        const fake = fakeProvider({ broken: { exitCode: 2, stdout: "", stderr: "no such tool" } });
        const spawn = (options: Omit<Environment.SpawnOptions, "sessionId">) =>
          Environment.spawn(withSandbox(fake.provider, "stop", [{ argv: ["broken", "--flag"] }]), {
            sessionId: "s",
            ...options,
          }).pipe(Effect.provideService(LanguageModel.LanguageModel, model), Effect.flip);

        expect(yield* spawn({})).toEqual(
          new EnvironmentErrors.SetupFailed({
            argv: ["broken", "--flag"],
            exitCode: 2,
            stdout: "",
            stderr: "no such tool",
          }),
        );
        expect(fake.calls.at(-1)).toBe("destroy sandbox-0");

        fake.sandboxes.set("kept", { files: new Map(), status: "stopped" });
        yield* spawn({
          reacquire: {
            definitionId: Environment.DefinitionId.make("sandboxed"),
            sandboxId: "kept" as Sandbox.Id,
          },
        });
        expect(fake.calls.at(-1)).toBe("stop kept");
        expect(fake.sandboxes.has("kept")).toBe(true);
      }),
  );

  it.effect("refuses to reacquire another definition's running environment", () =>
    Effect.gen(function* () {
      const { model } = yield* scripted([]);
      const failure = yield* Environment.spawn(inProcess, {
        sessionId: "s1",
        reacquire: { definitionId: Environment.DefinitionId.make("elsewhere") },
      }).pipe(Effect.provideService(LanguageModel.LanguageModel, model), Effect.flip);
      expect(failure).toEqual(
        new EnvironmentErrors.ForeignReference({ definitionId: "elsewhere" }),
      );
    }),
  );

  it.effect("recovers by spawning again from the recorded reference and events", () =>
    Effect.gen(function* () {
      const lookup: HarnessTool.Tools = {
        definitions: [{ name: "lookup", parameters: { type: "object" } }],
        invoke: () => Effect.succeed({ isError: false, content: [{ _tag: "Text", text: "noon" }] }),
      };
      const fake = fakeProvider();
      const definition = withSandbox(fake.provider, "stop");
      const first = yield* scripted([
        Stream.fromIterable([
          { type: "tool-call", id: "c1", name: "lookup", params: {} },
          { type: "finish", reason: "tool-calls", usage: { inputTokens: {}, outputTokens: {} } },
        ]),
      ]);
      const interrupted = yield* Environment.spawn(definition, {
        sessionId: "s1",
        tools: lookup,
      }).pipe(Effect.provideService(LanguageModel.LanguageModel, first.model));
      yield* interrupted.prepare([]);
      yield* interrupted.submit(batch("b1", "When is high tide?"));
      const recorded: Array<Environment.Event> = [];
      yield* interrupted.events.pipe(
        Stream.runForEach((event) => Effect.sync(() => recorded.push(event))),
        Effect.ignore,
      );
      yield* interrupted.release;

      const second = yield* scripted([reply("High tide is at noon.")]);
      const recovered = yield* Environment.spawn(definition, {
        sessionId: "s2",
        reacquire: interrupted.reference,
        tools: lookup,
      }).pipe(Effect.provideService(LanguageModel.LanguageModel, second.model));
      expect(recovered.acquisition.filesystem).toEqual({ _tag: "Retained" });
      const transcript = HarnessEvent.transcript(harnessEvents(recorded));
      expect(transcript.map((item) => item._tag)).toEqual(["Input", "Response", "ToolResult"]);
      yield* recovered.prepare(transcript);
      yield* recovered.resume;
      const events = harnessEvents(yield* untilIdle(recovered));
      expect(events.at(-2)).toMatchObject({
        _tag: "ResponseCompleted",
        response: { id: "s2/1", parts: [{ _tag: "Text", text: "High tide is at noon." }] },
      });
      expect(Transcript.summarize(HarnessEvent.transcript(events, transcript))).toMatchObject({
        success: { pending: [], awaitsResponse: false },
      });
    }),
  );
});
