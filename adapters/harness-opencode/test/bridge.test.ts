import { Bridge, Harness, type StreamPart } from "@amends/harness-v2";
import { SessionId } from "@amends/harness-v2/Agent";
import { type Network, type Sandbox, Template } from "@amends/sandbox-v2";
import { BunHttpServer, BunServices, BunSocket } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Path,
  Redacted,
  Schedule,
  Schema,
  Scope,
  Stream,
} from "effect";
import { HttpRouter } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { RpcGroup, RpcSerialization, RpcServer } from "effect/rpc";
import { freePort, isRunning, makeBridgedAgent, makeProxy, makeSandbox } from "./fixtures.ts";

/**
 * The bridge client launches `fake-bridge.ts`, a bridge over a stand-in agent, in a sandbox on this
 * machine, and reaches it over a WebSocket, as a host reaches an agent's bridge.
 */
const TestLayer = Layer.merge(BunServices.layer, BunSocket.layerWebSocketConstructor);

const id = SessionId.make("session-1");

/** The parts of a turn the stand-in agent answers `text` in. */
const answer = (text: string): ReadonlyArray<StreamPart.StreamPart> => [
  { type: "text-start", id: "answer" },
  { type: "text-delta", id: "answer", delta: text },
  { type: "text-end", id: "answer" },
  { type: "finish-step", reason: "stop", usage: { inputTokens: {}, outputTokens: {} } },
  { type: "finish", reason: "stop", usage: { inputTokens: {}, outputTokens: {} } },
];

/**
 * The fake bridge's template at `version`, which installs the bridge in the sandbox's working
 * directory as `bridge-<version>.ts`, a program that runs `fake-bridge.ts`.
 */
const templateOf = (version: string): Template.Template => ({
  name: Template.Name.make("fake-bridge"),
  identity: version,
  prepare: Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const program = `import "${import.meta.dirname}/fake-bridge.ts";`;
    yield* spawner.exitCode(
      ChildProcess.make("sh", [
        "-c",
        'printf "%s\n" "$1" > "$2"',
        "sh",
        program,
        `bridge-${version}.ts`,
      ]),
    );
  }),
});

/**
 * A harness over the fake bridge on `port`, at `version`, run by a host that derives tokens from
 * `secret`.
 */
const makeHarness = (
  port: Network.Port,
  { secret = "the hosts' secret", version = "1" }: { secret?: string; version?: string } = {},
) =>
  Effect.map(
    makeBridgedAgent({
      id: "fake",
      template: templateOf(version),
      port,
      command: process.execPath,
      args: [`bridge-${version}.ts`],
      token: (sandboxId) => Redacted.make(`${secret}/${sandboxId}`),
      agentOptions: { greeting: "hello" },
    }),
    Harness.make,
  );

/** A sandbox on a free port, and a harness over the fake bridge there. */
const makeSetup = Effect.gen(function* () {
  const port = yield* freePort;
  const sandbox = yield* makeSandbox(port);
  return { port, sandbox, harness: yield* makeHarness(port) };
});

/** The lines of `file` in the sandbox's working directory, as JSON. */
const linesOf = (sandbox: Sandbox.Sandbox["Service"], file: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const text = yield* sandbox.fileSystem.readFileString(
      path.join(sandbox.workingDirectory, file),
    );
    return text
      .trim()
      .split("\n")
      .map((line): unknown => JSON.parse(line));
  });

/** Kills the bridge launched last in the sandbox, as when it crashes, once it has exited. */
const killBridge = (sandbox: Sandbox.Sandbox["Service"]) =>
  Effect.gen(function* () {
    const launches = yield* linesOf(sandbox, "launches.jsonl");
    const { pid } = yield* Schema.decodeUnknownEffect(Schema.Struct({ pid: Schema.Int }))(
      launches.at(-1),
    );
    process.kill(pid, "SIGKILL");
    yield* Effect.repeat(isRunning(pid), {
      while: (running) => running,
      schedule: Schedule.spaced("20 millis"),
    });
  });

/**
 * Serves on `port`, from this process, a bridge of the fake agent that speaks `protocolVersion`,
 * as a host of another version would have launched, answering only the requests every version
 * keeps. It stops listening once a host asks it to exit, which the returned `Deferred` records.
 */
const serveOtherVersion = (port: Network.Port, protocolVersion: number) =>
  Effect.gen(function* () {
    const exitAsked = yield* Deferred.make<void>();
    const Rpcs = RpcGroup.make(Bridge.Hello, Bridge.Exit);
    const serverScope = yield* Scope.make();
    // Bun's server finishes stopping only once hosts close their connections.
    const stop = Effect.forkDetach(Scope.close(serverScope, Exit.void)).pipe(
      Effect.flatMap(Fiber.await),
      Effect.timeout("1 second"),
      Effect.ignore,
    );
    yield* Effect.addFinalizer(() => stop);
    yield* Layer.buildWithScope(
      HttpRouter.serve(
        RpcServer.layer(Rpcs).pipe(
          Layer.provide(
            Rpcs.toLayer({
              Hello: () => Effect.succeed({ agent: "fake", protocolVersion }),
              Exit: () => Effect.asVoid(Deferred.succeed(exitAsked, undefined)),
            }),
          ),
          Layer.provide(RpcServer.layerProtocolWebsocket({ path: "/" })),
          Layer.provide(RpcSerialization.layerJson),
        ),
        { disableLogger: true },
      ).pipe(Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port }))),
      serverScope,
    );
    yield* Effect.forkScoped(Effect.andThen(Deferred.await(exitAsked), stop));
    return exitAsked;
  });

/** Lets the stand-in agent finish a `wait` turn of the session `id`. */
const release = (sandbox: Sandbox.Sandbox["Service"]) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* sandbox.fileSystem.writeFileString(
      path.join(sandbox.workingDirectory, id, "release"),
      "",
    );
  });

/** Reads `turn` in the background, returning the collecting fiber once it read the first part. */
const readFromFirstPart = <E, R>(turn: Stream.Stream<StreamPart.StreamPart, E, R>) =>
  Effect.gen(function* () {
    const read = yield* Deferred.make<void>();
    const reading = yield* turn.pipe(
      Stream.tap(() => Deferred.succeed(read, undefined)),
      Stream.runCollect,
      Effect.forkChild,
    );
    yield* Deferred.await(read);
    return reading;
  });

describe("BridgeClient", () => {
  describe("over a bridge it launches", () => {
    it.live("launches the bridge with its options on standard input, and runs a turn there", () =>
      Effect.gen(function* () {
        const { sandbox, harness } = yield* makeSetup;
        const session = yield* harness.startSession({ sandbox, id });

        const parts = yield* Stream.runCollect(session.stream({ prompt: "reply hello" }));

        expect(parts).toEqual(answer("hello"));
        expect(yield* linesOf(sandbox, "launches.jsonl")).toEqual([
          {
            pid: expect.any(Number),
            agentOptions: { greeting: "hello" },
            tokenInEnvironment: false,
          },
        ]);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live("installs its bridge before it launches it, in a sandbox prepared for another", () =>
      Effect.gen(function* () {
        const port = yield* freePort;
        const sandbox = yield* makeSandbox(port, templateOf("1"));
        const harness = yield* makeHarness(port, { version: "2" });

        const session = yield* harness.startSession({ sandbox, id });
        const parts = yield* Stream.runCollect(session.stream({ prompt: "reply hello" }));

        expect(parts).toEqual(answer("hello"));
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live("replaces a bridge of an older protocol with its own", () =>
      Effect.gen(function* () {
        const { port, sandbox, harness } = yield* makeSetup;
        const exitAsked = yield* serveOtherVersion(port, Bridge.protocolVersion - 1);

        const session = yield* harness.startSession({ sandbox, id });
        const parts = yield* Stream.runCollect(session.stream({ prompt: "reply hello" }));

        expect(yield* Deferred.isDone(exitAsked)).toBe(true);
        expect(parts).toEqual(answer("hello"));
        expect(yield* linesOf(sandbox, "launches.jsonl")).toHaveLength(1);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live("refuses a bridge of a newer protocol, leaving it running", () =>
      Effect.gen(function* () {
        const { port, sandbox, harness } = yield* makeSetup;
        const exitAsked = yield* serveOtherVersion(port, Bridge.protocolVersion + 1);

        const error = yield* Effect.flip(harness.startSession({ sandbox, id }));

        expect(error.reason._tag).toBe("UnsupportedError");
        expect(yield* Deferred.isDone(exitAsked)).toBe(false);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live("connects to the bridge another host launched", () =>
      Effect.gen(function* () {
        const { port, sandbox, harness } = yield* makeSetup;
        yield* harness.startSession({ sandbox, id });
        const otherHarness = yield* makeHarness(port);

        const session = yield* otherHarness.startSession({
          sandbox,
          id: SessionId.make("session-2"),
        });
        const parts = yield* Stream.runCollect(session.stream({ prompt: "reply again" }));

        expect(parts).toEqual(answer("again"));
        expect(yield* linesOf(sandbox, "launches.jsonl")).toHaveLength(1);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live("is refused by the bridge when the host's token is another", () =>
      Effect.gen(function* () {
        const { port, sandbox, harness } = yield* makeSetup;
        yield* harness.startSession({ sandbox, id });
        const strangerHarness = yield* makeHarness(port, { secret: "another secret" });

        const error = yield* Effect.flip(strangerHarness.startSession({ sandbox, id }));

        expect(error.reason._tag).toBe("UnavailableError");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live("leaves a suspended turn running in the bridge, for another host to continue", () =>
      Effect.gen(function* () {
        const { port, sandbox, harness } = yield* makeSetup;
        const session = yield* harness.startSession({ sandbox, id });
        const reading = yield* readFromFirstPart(session.stream({ prompt: "wait later" }));

        const state = yield* session.suspendTurn;
        yield* Fiber.join(reading);
        yield* release(sandbox);
        const otherHarness = yield* makeHarness(port);
        const resumed = yield* otherHarness.startSession({ sandbox, resumeFrom: state });
        const parts = yield* Stream.runCollect(resumed.continueStream({}));

        expect(parts).toEqual(answer("later"));
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live(
      "continues a suspended turn its bridge lost when it died, in the agent's conversation",
      () =>
        Effect.gen(function* () {
          const { port, sandbox, harness } = yield* makeSetup;
          const session = yield* harness.startSession({ sandbox, id });
          const reading = yield* readFromFirstPart(session.stream({ prompt: "wait forever" }));

          const state = yield* session.suspendTurn;
          yield* Fiber.join(reading);
          yield* killBridge(sandbox);
          const otherHarness = yield* makeHarness(port);
          const resumed = yield* otherHarness.startSession({ sandbox, resumeFrom: state });
          const parts = yield* Stream.runCollect(resumed.continueStream({}));
          const { history } = yield* resumed.detach;

          // The agent continues the turn rather than run its prompt again, which would wait forever.
          expect(parts).toEqual(answer("Continue."));
          expect(history.content.map((message) => message.role)).toEqual(["user", "assistant"]);
          expect(yield* linesOf(sandbox, "launches.jsonl")).toHaveLength(2);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.live("aborts a turn whose stream the caller ends", () =>
      Effect.gen(function* () {
        const { sandbox, harness } = yield* makeSetup;
        const session = yield* harness.startSession({ sandbox, id });

        yield* session.stream({ prompt: "wait forever" }).pipe(Stream.take(1), Stream.runDrain);
        // The bridge runs one turn of a session at a time, so this one starts only once the first
        // was aborted.
        const parts = yield* Stream.runCollect(session.stream({ prompt: "reply next" }));

        expect(parts).toEqual(answer("next"));
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live("reads on after the connection drops, from the last part read", () =>
      Effect.gen(function* () {
        const { port, sandbox, harness } = yield* makeSetup;
        const proxy = yield* makeProxy(port);
        const throughProxy: Sandbox.Sandbox["Service"] = {
          ...sandbox,
          endpoint: () => Effect.succeed({ url: `ws://127.0.0.1:${proxy.port}`, headers: {} }),
        };
        const session = yield* harness.startSession({ sandbox: throughProxy, id });
        const reading = yield* readFromFirstPart(session.stream({ prompt: "wait across" }));

        yield* proxy.drop;
        yield* release(sandbox);
        const parts = yield* Fiber.join(reading);

        expect(parts).toEqual(answer("across"));
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live(
      "starts the session again, from its latest state, in the bridge launched after its own died",
      () =>
        Effect.gen(function* () {
          const { sandbox, harness } = yield* makeSetup;
          const session = yield* harness.startSession({ sandbox, id });
          yield* Stream.runDrain(session.stream({ prompt: "reply first" }));

          yield* killBridge(sandbox);
          const parts = yield* Stream.runCollect(session.stream({ prompt: "reply second" }));
          const state = yield* session.stop;

          expect(parts).toEqual(answer("second"));
          expect(state.agentState).toEqual({ agentState: { turns: 2 } });
          expect(yield* linesOf(sandbox, "launches.jsonl")).toHaveLength(2);
        }).pipe(Effect.provide(TestLayer)),
    );

    it.live("fails a turn its bridge lost when it died, and runs the next in another", () =>
      Effect.gen(function* () {
        const { sandbox, harness } = yield* makeSetup;
        const session = yield* harness.startSession({ sandbox, id });
        const reading = yield* readFromFirstPart(session.stream({ prompt: "wait forever" }));

        yield* killBridge(sandbox);
        const error = yield* Effect.flip(Fiber.join(reading));
        const parts = yield* Stream.runCollect(session.stream({ prompt: "reply next" }));

        expect(error._tag === "HarnessError" && error.reason._tag).toBe("NoTurnError");
        expect(parts).toEqual(answer("next"));
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live("lets go with the state its bridge last gave when its sandbox is gone", () =>
      Effect.gen(function* () {
        const { sandbox, harness } = yield* makeSetup;
        const session = yield* harness.startSession({ sandbox, id });
        yield* Stream.runDrain(session.stream({ prompt: "reply first" }));

        yield* sandbox.destroy;
        const state = yield* session.detach;

        expect(state.agentState).toEqual({ agentState: { turns: 1 } });
      }).pipe(Effect.provide(TestLayer)),
    );

    it.live("destroys a session it stopped, starting it again in the bridge to do so", () =>
      Effect.gen(function* () {
        const { sandbox, harness } = yield* makeSetup;
        const path = yield* Path.Path;
        const session = yield* harness.startSession({ sandbox, id });

        yield* session.stop;
        yield* session.destroy;

        expect(
          yield* sandbox.fileSystem.exists(path.join(sandbox.workingDirectory, `destroyed-${id}`)),
        ).toBe(true);
      }).pipe(Effect.provide(TestLayer)),
    );
  });
});
