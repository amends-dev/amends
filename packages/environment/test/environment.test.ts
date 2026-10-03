import { describe, expect, it } from "@effect/vitest";
import { Crypto, Deferred, Effect, Fiber, FileSystem, Layer, Path, Redacted, Stream } from "effect";
import { ChildProcessSpawner } from "effect/process";
import { HttpClient, HttpClientError, HttpClientResponse, HttpRouter } from "effect/http";
import { LanguageModel, Model } from "effect/ai";
import type { AiError, Prompt, Response } from "effect/ai";
import { ConnectionImplementation } from "@amends/connection";
import type { ModelInference } from "@amends/connection/model-inference";
import { Environment, EnvironmentErrors, HarnessServer } from "@amends/environment";
import { Harness, HarnessErrors, HarnessEvent } from "@amends/harness";
import { AmendsHarness } from "@amends/harness-amends";
import { SandboxErrors, SandboxImplementation } from "@amends/sandbox";
import type { Sandbox } from "@amends/sandbox";

/** The processes and files of a machine that has none, for harness servers whose harnesses use neither. */
const noPlatform = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die(new Error("This machine runs no processes."))),
  ),
);

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
    endpoint: () => ({
      interface: "test",
      baseUrl: undefined,
      apiKey: undefined,
      model: "test-model",
      limits: { contextTokens: 100_000, outputTokens: undefined },
    }),
  };
  const session: Environment.SessionOptions = {
    sessionId: "session-1",
    model: {
      inference,
      access: { settings: {}, credential: undefined },
      selection: { model: "m" },
    },
  };
  return { session, prompts, inference };
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

const probe = 'uname -s; uname -m; printf "%s" "${TMPDIR:-/tmp}"';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A harness server a fake sandbox runs: its routes, as a web handler in this process. */
interface FakeServer {
  readonly sandboxId: string;
  readonly handler: (request: Request) => Promise<Response>;
  readonly dispose: () => Promise<void>;
}

/**
 * An in-memory sandbox provider recording what the environment asks of it. `exec` answers a shell
 * command with `results[command]`, or success; `test`, `cat`, and `rm` act on its files. A process
 * it spawns is a harness server serving `served`, reached through `httpClient` at the address its
 * sandbox exposes; stopping or destroying the sandbox stops it.
 */
const fakeProvider = (
  results: Record<string, Sandbox.ExecResult> = {},
  served?: HarnessServer.Served,
) => {
  const sandboxes = new Map<string, FakeSandbox>();
  const snapshots = new Map<string, Map<string, Uint8Array>>();
  const servers = new Map<string, FakeServer>();
  const calls: Array<string> = [];
  let next = 0;
  /** Stop the harness servers a sandbox runs, as its processes end. */
  const stopServers = (sandboxId: string) =>
    Effect.promise(() =>
      Promise.all(
        [...servers.entries()]
          .filter(([, server]) => server.sandboxId === sandboxId)
          .map(([address, server]) => {
            servers.delete(address);
            return server.dispose();
          }),
      ),
    );
  const ok = (stdout = ""): Sandbox.ExecResult => ({ exitCode: 0, stdout, stderr: "" });
  const missing: Sandbox.ExecResult = { exitCode: 1, stdout: "", stderr: "No such file" };
  const open = (id: string): Sandbox.Running => {
    const state = () => sandboxes.get(id)!;
    return {
      id: id as Sandbox.Id,
      workdir: "/work",
      exec: (command) =>
        Effect.sync(() => {
          const [program, ...args] = command.argv;
          const last = command.argv.at(-1) ?? "";
          calls.push(`exec ${id} ${program === "sh" ? last : command.argv.join(" ")}`);
          const file = state().files.get(last);
          if (program === "test") return file === undefined ? missing : ok();
          if (program === "cat") return file === undefined ? missing : ok(decoder.decode(file));
          if (program === "sh" && args.length === 4) {
            // Installing the harness server: its partial upload renamed into place.
            const [, , from, to] = args;
            state().files.set(to!, state().files.get(from!)!);
            state().files.delete(from!);
            return ok();
          }
          if (program === "rm") {
            state().files.delete(last);
            return ok();
          }
          return results[program === "sh" ? last : args.join(" ")] ?? ok();
        }),
      spawn: (command) =>
        Effect.sync(() => {
          if (served === undefined) throw new Error("This sandbox runs no processes.");
          const port = 4000 + next++;
          const token = `token-${port}`;
          const address = `${id}:${port}`;
          // Like the program, it stops once its answer is on its way.
          const stop = Effect.sync(() => {
            const server = servers.get(address);
            servers.delete(address);
            setTimeout(() => void server?.dispose(), 10);
          });
          const { handler, dispose } = HttpRouter.toWebHandler(
            HarnessServer.layerRoutes(served, { token, stop }).pipe(Layer.provide(noPlatform)),
            { disableLogger: true },
          );
          servers.set(address, { sandboxId: id, handler, dispose });
          const statePath = command.argv[1]!;
          state().files.set(
            statePath,
            encoder.encode(
              JSON.stringify({ port, token, protocolVersion: HarnessServer.protocolVersion }),
            ),
          );
          calls.push(`spawn ${id} ${command.argv.join(" ")}`);
          const process: Sandbox.Process = {
            output: Stream.empty,
            exit: Effect.never,
            kill: stopServers(id),
            write: () => Effect.fail(new SandboxErrors.Unsupported({ capability: "stdin" })),
          };
          return process;
        }),
      expose: (port) =>
        Effect.succeed({ url: `http://${id}.test:${port}/`, headers: { "x-sandbox": id } }),
      readFile: (path) => {
        const data = state().files.get(path);
        return data === undefined
          ? Effect.fail(new SandboxErrors.FileNotFound({ path }))
          : Effect.succeed(data);
      },
      writeFile: (path, data) =>
        Effect.sync(() => {
          calls.push(`write ${id} ${path.replace(/[0-9a-f-]{36}$/u, "<id>")}`);
          state().files.set(path, data);
        }),
      snapshot: Effect.sync(() => {
        const snapshot = `snapshot-${next++}`;
        snapshots.set(snapshot, new Map(state().files));
        return { provider: "fake", id: snapshot };
      }),
      stop: stopServers(id).pipe(
        Effect.andThen(
          Effect.sync(() => {
            state().status = "stopped";
            calls.push(`stop ${id}`);
          }),
        ),
      ),
      destroy: stopServers(id).pipe(
        Effect.andThen(
          Effect.sync(() => {
            sandboxes.delete(id);
            calls.push(`destroy ${id}`);
          }),
        ),
      ),
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
  /** Requests to an address a sandbox exposed reach the harness server listening there. */
  const httpClient = HttpClient.make((request, url) => {
    const server = servers.get(`${url.hostname.replace(/\.test$/u, "")}:${url.port}`);
    if (server === undefined)
      return Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, description: "Refused" }),
        }),
      );
    const body = (request.body as { readonly body?: Uint8Array | string }).body;
    return Effect.promise(() =>
      server.handler(
        new Request(url.toString(), {
          method: request.method,
          headers: request.headers,
          body: body ?? null,
        }),
      ),
    ).pipe(Effect.map((response) => HttpClientResponse.fromWeb(request, response)));
  });
  return { provider, sandboxes, calls, servers, httpClient, stopServers };
};

const crypto = Crypto.make({
  randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: () => Effect.die(new Error("Unexpected digest")),
});

/** The harness server's builds, each a few bytes standing in for the executable. */
const program: HarnessServer.Program = {
  harnesses: [Harness.Name.make("amends")],
  binary: (platform) =>
    Effect.succeed({ version: `v1-${platform}`, data: encoder.encode(platform) }),
};

/**
 * The environments a host with amends's harness, these sandbox providers, and a harness server
 * running amends's harness spawns, reaching harness servers through `httpClient`.
 */
/**
 * The environment service with these providers installed, each made for any connection; `made`
 * receives the connections they were made with.
 */
const environments = (
  providers: ReadonlyArray<Sandbox.Provider> = [],
  options: {
    readonly harnessServer?: HarnessServer.Program;
    readonly httpClient?: HttpClient.HttpClient;
    readonly made?: Array<ConnectionImplementation.Access | undefined>;
  } = {},
) =>
  Environment.make({
    harnesses: [AmendsHarness.harness],
    sandboxes: providers.map((provider): Sandbox.Implementation => ({
      declaration: {
        id: SandboxImplementation.Id.make(provider.name),
        name: provider.name,
        description: "",
        capabilities: provider.capabilities,
        account: false,
      },
      provider: (connection) =>
        Effect.sync(() => {
          options.made?.push(connection);
          return provider;
        }),
    })),
    harnessServer: options.harnessServer ?? program,
  }).pipe(
    Effect.provideService(Crypto.Crypto, crypto),
    Effect.provideService(
      HttpClient.HttpClient,
      options.httpClient ?? HttpClient.make(() => Effect.die(new Error("No harness server here."))),
    ),
  );

const inProcess: Environment.Definition = { id: "in-process", harnessId: "amends", sandbox: null };

const withSandbox = (
  retention: Environment.Retention,
  setup: ReadonlyArray<string> = [],
): Environment.Definition => ({
  id: "sandboxed",
  harnessId: "amends",
  sandbox: { providerId: "fake", harness: "in-process", template: null, env: {}, setup, retention },
});

/** An environment whose harness runs inside its sandbox, on Linux. */
const inSandbox: Environment.Definition = {
  id: "in-sandbox",
  harnessId: "amends",
  sandbox: {
    providerId: "fake",
    harness: "in-sandbox",
    template: null,
    env: {},
    setup: ["install tools"],
    retention: "destroy",
  },
};
const linux = { [probe]: { exitCode: 0, stdout: "Linux\nx86_64\n/tmp/", stderr: "" } };
const executable = "/tmp/amends-harness-server/v1-linux-x64/harness-server";

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
      const harness = yield* later.startSession({ ...second.session, sessionId: "session-2" });
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

/** Spawn an environment whose harness runs inside its sandbox, with a fake that serves `served`. */
const spawnInSandbox = Effect.fnUntraced(function* (served: HarnessServer.Served) {
  const fake = fakeProvider(linux, served);
  const service = yield* environments([fake.provider], { httpClient: fake.httpClient });
  const running = yield* service.spawn(inSandbox);
  return { fake, service, running };
});

const statePath = "/tmp/amends-harness-server/sandbox-0.json";

describe("Environment.spawn with the harness in its sandbox", () => {
  it.effect(
    "uploads the harness server, starts it in the background, and runs sessions in it",
    () =>
      Effect.gen(function* () {
        const { session, prompts, inference } = yield* scripted([reply("Hello")]);
        const { fake, running } = yield* spawnInSandbox({
          harnesses: [AmendsHarness.harness],
          models: [inference],
        });
        expect(fake.calls).toEqual([
          "exec sandbox-0 install tools",
          `exec sandbox-0 ${probe}`,
          `exec sandbox-0 cat ${statePath}`,
          `exec sandbox-0 test -x ${executable}`,
          `write sandbox-0 ${executable}.<id>`,
          `exec sandbox-0 ${executable}`,
          `exec sandbox-0 rm -f ${statePath}`,
          `spawn sandbox-0 ${executable} ${statePath}`,
          `exec sandbox-0 cat ${statePath}`,
        ]);

        const events = yield* Effect.scoped(
          Effect.gen(function* () {
            const harness = yield* running.startSession({ ...session, instructions: "Be brief." });
            yield* harness.prepare([]);
            yield* harness.submit(batch("b1", "Hi"));
            return yield* untilIdle(harness);
          }),
        );
        expect(events.map((event) => event._tag)).toEqual([
          "InputIncorporated",
          "TextDelta",
          "BlockCompleted",
          "ResponseFinished",
          "Idle",
        ]);
        expect(events[3]).toMatchObject({ model: { provider: "test", model: "test-model" } });
        expect(prompts[0]?.content[0]).toMatchObject({ role: "system", content: "Be brief." });
        // Releasing stops the harness server, then applies the retention.
        yield* running.release;
        expect(fake.calls.slice(-4)).toEqual([
          `exec sandbox-0 ${probe}`,
          `exec sandbox-0 cat ${statePath}`,
          `exec sandbox-0 rm -f ${statePath}`,
          "destroy sandbox-0",
        ]);
        expect(fake.servers.size).toBe(0);
      }),
  );

  it.effect("stops a harness server speaking another protocol version, and starts this one", () =>
    Effect.gen(function* () {
      const fake = fakeProvider(linux, { harnesses: [AmendsHarness.harness], models: [] });
      const service = yield* environments([fake.provider], { httpClient: fake.httpClient });
      const keep = { ...inSandbox, sandbox: { ...inSandbox.sandbox!, retention: "stop" as const } };
      const first = yield* service.spawn(keep);
      fake.sandboxes.get("sandbox-0")!.files.set(
        statePath,
        encoder.encode(
          JSON.stringify({
            port: 4001,
            token: "token-4001",
            protocolVersion: HarnessServer.protocolVersion - 1,
          }),
        ),
      );
      yield* service.spawn(keep, { reacquire: first.reference });
      expect(fake.calls.filter((call) => call.startsWith("spawn"))).toHaveLength(2);
      // Only the server speaking this version still runs.
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect([...fake.servers.keys()]).toEqual(["sandbox-0:4002"]);
    }),
  );

  it.effect(
    "keeps the harness server already running in a sandbox acquired again, uploading nothing",
    () =>
      Effect.gen(function* () {
        const fake = fakeProvider(linux, { harnesses: [AmendsHarness.harness], models: [] });
        const service = yield* environments([fake.provider], { httpClient: fake.httpClient });
        const keep = {
          ...inSandbox,
          sandbox: { ...inSandbox.sandbox!, retention: "stop" as const },
        };
        const first = yield* service.spawn(keep);
        const before = fake.calls.length;
        // Whichever build started it: one host's build of the program differs from another's.
        yield* service.spawn(keep, { reacquire: first.reference });
        expect(fake.calls.slice(before)).toEqual([
          "exec sandbox-0 install tools",
          `exec sandbox-0 ${probe}`,
          `exec sandbox-0 cat ${statePath}`,
        ]);
      }),
  );

  it.effect("starts the harness server again when the one it wrote down doesn't answer", () =>
    Effect.gen(function* () {
      const fake = fakeProvider(linux, { harnesses: [AmendsHarness.harness], models: [] });
      const service = yield* environments([fake.provider], { httpClient: fake.httpClient });
      const keep = { ...inSandbox, sandbox: { ...inSandbox.sandbox!, retention: "stop" as const } };
      const first = yield* service.spawn(keep);
      yield* fake.stopServers("sandbox-0");
      yield* service.spawn(keep, { reacquire: first.reference });
      expect(fake.calls.filter((call) => call.startsWith("spawn"))).toHaveLength(2);
    }),
  );

  it.effect(
    "lets a later run attach to a session a cut-short run left, and collect what it missed",
    () =>
      Effect.gen(function* () {
        const { session, inference } = yield* scripted([reply("High tide is at noon.")]);
        const { running } = yield* spawnInSandbox({
          harnesses: [AmendsHarness.harness],
          models: [inference],
        });
        // A run starts the session, gives it input, and is cut short before reading what it reports.
        const submitted = yield* Deferred.make<void>();
        const cutShort = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function* () {
              const harness = yield* running.startSession(session);
              yield* harness.prepare([]);
              yield* harness.submit(batch("b1", "When is high tide?"));
              yield* Deferred.succeed(submitted, undefined);
              return yield* Effect.never;
            }),
          ),
        );
        yield* Deferred.await(submitted);
        yield* Fiber.interrupt(cutShort);

        const collected = yield* Effect.scoped(
          Effect.gen(function* () {
            const attached = yield* running.attachSession({ sessionId: "session-1", recorded: 0 });
            expect(attached).toBeDefined();
            const rest = attached!.state === "working" ? yield* untilIdle(attached!.session) : [];
            return [...attached!.missed, ...rest].filter((event) => !HarnessEvent.isDelta(event));
          }),
        );
        expect(collected.map((event) => event._tag)).toEqual([
          "InputIncorporated",
          "BlockCompleted",
          "ResponseFinished",
          "Idle",
        ]);
        // Once the attached run ended, the session ended with it.
        expect(
          yield* Effect.scoped(running.attachSession({ sessionId: "session-1", recorded: 4 })),
        ).toBeUndefined();
      }),
  );

  it.effect("gives a batch submitted again once, and holds one session at a time", () =>
    Effect.gen(function* () {
      const { session, inference } = yield* scripted([reply("Hello")]);
      const { running } = yield* spawnInSandbox({
        harnesses: [AmendsHarness.harness],
        models: [inference],
      });
      const events = yield* Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* running.startSession(session);
          yield* harness.prepare([]);
          yield* harness.submit(batch("b1", "Hi"));
          yield* harness.submit(batch("b1", "Hi"));
          return yield* untilIdle(harness);
        }),
      );
      expect(events.filter(HarnessEvent.Event.isAnyOf(["InputIncorporated"]))).toHaveLength(1);

      const replaced = yield* Effect.scoped(
        Effect.gen(function* () {
          const first = yield* running.startSession({ ...session, sessionId: "session-2" });
          yield* first.prepare([]);
          yield* running.startSession({ ...session, sessionId: "session-3" });
          return yield* first.submit(batch("b2", "Still there?")).pipe(Effect.flip);
        }),
      );
      expect(replaced).toMatchObject({ problem: "ended", retryable: true });
    }),
  );

  it.effect("tells a run listening to its session that another run replaced it", () =>
    Effect.gen(function* () {
      // The model never answers, so the session works until it ends.
      const { session, inference } = yield* scripted([Stream.never]);
      const { running } = yield* spawnInSandbox({
        harnesses: [AmendsHarness.harness],
        models: [inference],
      });
      const failure = yield* Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* running.startSession(session);
          yield* harness.prepare([]);
          yield* harness.submit(batch("b1", "Hi"));
          const listening = yield* Effect.forkScoped(Stream.runDrain(harness.events));
          yield* running.startSession({ ...session, sessionId: "session-2" });
          return yield* Effect.flip(Fiber.join(listening));
        }),
      );
      expect(failure).toMatchObject({ problem: "ended", retryable: true });
    }),
  );

  it.effect("ends its session's work when it shuts down", () =>
    Effect.gen(function* () {
      const asked = yield* Deferred.make<void>();
      const interrupted = yield* Deferred.make<void>();
      const { session, inference } = yield* scripted([
        Stream.fromEffect(
          Deferred.succeed(asked, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
          ),
        ),
      ]);
      const { fake, running } = yield* spawnInSandbox({
        harnesses: [AmendsHarness.harness],
        models: [inference],
      });
      yield* Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* running.startSession(session);
          yield* harness.prepare([]);
          yield* harness.submit(batch("b1", "Hi"));
          yield* Deferred.await(asked);
          yield* fake.stopServers("sandbox-0");
          yield* Deferred.await(interrupted);
        }),
      );
    }),
  );

  it.effect("fails the session as ended, worth retrying, once its harness server stops", () =>
    Effect.gen(function* () {
      const { session, inference } = yield* scripted([]);
      const { fake, running } = yield* spawnInSandbox({
        harnesses: [AmendsHarness.harness],
        models: [inference],
      });
      const failure = yield* Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* running.startSession(session);
          yield* harness.prepare([]);
          yield* fake.stopServers("sandbox-0");
          return yield* harness.submit(batch("b1", "Hi")).pipe(Effect.flip);
        }),
      );
      expect(failure).toMatchObject({
        _tag: "Harness.ExecutionFailed",
        problem: "ended",
        retryable: true,
      });
    }),
  );

  it.effect("fails starting a session whose model code the server wasn't built with", () =>
    Effect.gen(function* () {
      const { session } = yield* scripted([]);
      const { running } = yield* spawnInSandbox({ harnesses: [AmendsHarness.harness], models: [] });
      const failure = yield* Effect.scoped(running.startSession(session)).pipe(Effect.flip);
      expect(failure).toEqual(
        new HarnessErrors.ExecutionFailed({
          reason: "The harness server doesn't run test models.",
          retryable: false,
          problem: "unexpected",
        }),
      );
    }),
  );

  it.effect("skips uploading a version the sandbox already has", () =>
    Effect.gen(function* () {
      const fake = fakeProvider(linux, { harnesses: [AmendsHarness.harness], models: [] });
      fake.sandboxes.set("kept", {
        files: new Map([[executable, new Uint8Array()]]),
        status: "stopped",
      });
      const service = yield* environments([fake.provider], { httpClient: fake.httpClient });
      yield* service.spawn(inSandbox, {
        reacquire: {
          definitionId: Environment.DefinitionId.make("in-sandbox"),
          sandboxId: "kept" as Sandbox.Id,
        },
      });
      expect(fake.calls.some((call) => call.startsWith("write"))).toBe(false);
    }),
  );

  it.effect("refuses a harness its harness server doesn't run, before acquiring a sandbox", () =>
    Effect.gen(function* () {
      const fake = fakeProvider(linux);
      const service = yield* environments([fake.provider], {
        harnessServer: { ...program, harnesses: [] },
      });
      expect(yield* service.spawn(inSandbox).pipe(Effect.flip)).toEqual(
        new EnvironmentErrors.HarnessUnavailable({ harnessId: "amends" }),
      );
      expect(fake.calls).toEqual([]);
    }),
  );

  it.effect("fails the spawn on a platform the harness server isn't built for", () =>
    Effect.gen(function* () {
      const fake = fakeProvider({
        [probe]: { exitCode: 0, stdout: "Linux\nriscv64\n/tmp", stderr: "" },
      });
      const service = yield* environments([fake.provider]);
      expect(yield* service.spawn(inSandbox).pipe(Effect.flip)).toEqual(
        new EnvironmentErrors.UnsupportedPlatform({ platform: "Linux riscv64" }),
      );
      expect(fake.calls.at(-1)).toBe("destroy sandbox-0");
    }),
  );
});

describe("Environment.release", () => {
  it.effect("stops the harness server a sandbox a run left still runs, then releases it", () =>
    Effect.gen(function* () {
      const fake = fakeProvider(linux, { harnesses: [AmendsHarness.harness], models: [] });
      const service = yield* environments([fake.provider], { httpClient: fake.httpClient });
      const keep = { ...inSandbox, sandbox: { ...inSandbox.sandbox!, retention: "stop" as const } };
      const left = yield* service.spawn(keep);
      expect(fake.servers.size).toBe(1);
      yield* service.release(keep, left.reference);
      expect(fake.servers.size).toBe(0);
      expect(fake.calls.at(-1)).toBe("stop sandbox-0");
    }),
  );

  it.effect("makes the provider with the sandbox's connection, to spawn and to release", () =>
    Effect.gen(function* () {
      const fake = fakeProvider();
      const made: Array<ConnectionImplementation.Access | undefined> = [];
      const service = yield* environments([fake.provider], { made });
      const account = { settings: { target: "eu" }, credential: Redacted.make("key") };
      const definition = withSandbox("stop");
      const left = yield* service.spawn(definition, { sandboxConnection: account });
      yield* service.release(definition, left.reference, account);
      expect(made).toEqual([account, account]);
      expect(fake.calls).toEqual(["stop sandbox-0"]);
    }),
  );

  it.effect("applies retention to a sandbox a run left behind, without spawning", () =>
    Effect.gen(function* () {
      const fake = fakeProvider();
      const service = yield* environments([fake.provider]);
      const definition = withSandbox("stop", ["init"]);
      const left = yield* service.spawn(definition);
      yield* service.release(definition, left.reference);
      expect(fake.calls).toEqual(["exec sandbox-0 init", "stop sandbox-0"]);

      // One already gone comes back new from the provider, and is destroyed.
      yield* service.release(definition, {
        definitionId: left.reference.definitionId,
        sandboxId: "gone" as Sandbox.Id,
      });
      expect(fake.calls.at(-1)).toBe("destroy sandbox-1");
      // Without a sandbox there is nothing to release.
      yield* service.release(inProcess, {
        definitionId: Environment.DefinitionId.make("in-process"),
      });
    }),
  );
});
