import { type Bridge, GenerateResult, type StreamPart } from "@amends/harness-v2";
import { SessionId } from "@amends/harness-v2/Agent";
import { BunServices } from "@effect/platform-bun";
import { expect, it, layer } from "@effect/vitest";
import { Effect, Fiber, Deferred, Layer, Stream } from "effect";
import { Prompt } from "effect/ai";
import { FetchHttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";
import { TestClock } from "effect/testing";
import * as OpencodeDriver from "../src/bridge/Driver.ts";
import {
  type FakeOpencodeOptions,
  type FakeTurn,
  makeFakeOpencode,
  makeFakeServerProcesses,
} from "./fakes.ts";
import { tokens } from "./fixtures.ts";

const id = SessionId.make("session-one");
const directory = "/work/session-one";

/**
 * opencode's driver as a bridge runs it, whose server is a fake opencode that runs each turn with
 * `runTurn`. The driver starts the server as it would opencode's, through a process spawner whose
 * servers announce the fake's address; the first `failingStarts` of them fail to start. Its models
 * are of opencode's own provider, the fake's only one, except `elsewhere`.
 */
const makeDriver = (
  runTurn: (turn: FakeTurn) => Effect.Effect<void>,
  options: FakeOpencodeOptions & { readonly failingStarts?: number } = {},
) =>
  Effect.gen(function* () {
    const fake = yield* makeFakeOpencode(runTurn, options);
    const processes = yield* makeFakeServerProcesses(`http://127.0.0.1:${fake.port}`, {
      failing: options.failingStarts,
    });
    const driver = yield* OpencodeDriver.make({
      model: { providerID: "opencode", id: "default-model" },
      models: {
        other: { providerID: "opencode", id: "other-model" },
        deep: { providerID: "opencode", id: "default-model", variant: "amends-high" },
        elsewhere: { providerID: "elsewhere", id: "model" },
      },
      command: "opencode",
      config: {},
      env: {},
    }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, processes.spawner));
    return { fake, processes, driver };
  });

const startSession = (
  runTurn: (turn: FakeTurn) => Effect.Effect<void>,
  options?: FakeOpencodeOptions,
) =>
  Effect.gen(function* () {
    const made = yield* makeDriver(runTurn, options);
    const session = yield* made.driver.start({ id, directory, history: Prompt.empty });
    return { ...made, session };
  });

/** A turn asking `text`, with nothing else that opencode does not take. */
const turnOptions = (
  text: string,
  options: Partial<Bridge.TurnOptions> = {},
): Bridge.TurnOptions => ({
  prompt: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] }),
  tools: [],
  responseFormat: { type: "text" },
  ...options,
});

/** Runs a turn asking `text` to its end. */
const runTurn = (
  session: Bridge.DriverSession,
  text: string,
  options?: Partial<Bridge.TurnOptions>,
) => Stream.runCollect(session.prompt(turnOptions(text, options)));

const textOf = (parts: ReadonlyArray<StreamPart.StreamPart>) =>
  new GenerateResult.GenerateResult(parts).text;

/** A turn that answers `text` in one step. */
const answer = (text: string) => (turn: FakeTurn) =>
  Effect.gen(function* () {
    const assistantMessageID = "msg_answer";
    yield* turn.record("session.next.step.started", {
      assistantMessageID,
      agent: "build",
      model: turn.model,
    });
    yield* turn.record("session.next.text.started", { assistantMessageID, textID: "text-0" });
    yield* turn.record("session.next.text.ended", { assistantMessageID, textID: "text-0", text });
    yield* turn.record("session.next.step.ended", {
      assistantMessageID,
      finish: "stop",
      cost: 0,
      tokens: tokens(10, 5),
    });
  });

/** A turn's first step, up to its call of `bash`, which then runs until the turn goes on. */
const callBash = (turn: FakeTurn) =>
  Effect.gen(function* () {
    const assistantMessageID = "msg_tool";
    yield* turn.record("session.next.step.started", {
      assistantMessageID,
      agent: "build",
      model: turn.model,
    });
    yield* turn.record("session.next.tool.input.started", {
      assistantMessageID,
      callID: "call_1",
      name: "bash",
    });
    yield* turn.record("session.next.tool.input.ended", {
      assistantMessageID,
      callID: "call_1",
      text: '{"command":"make"}',
    });
    yield* turn.record("session.next.tool.called", {
      assistantMessageID,
      callID: "call_1",
      tool: "bash",
      input: { command: "make" },
      provider: { executed: false },
    });
  });

const TestLayer = Layer.mergeAll(BunServices.layer, FetchHttpClient.layer);

layer(TestLayer)("OpencodeDriver", (it) => {
  it.effect("runs a turn in the session's directory, streaming what opencode records", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession(answer("hello"));

      const parts = yield* runTurn(session, "Say hello.");

      expect(textOf(parts)).toBe("hello");
      expect(parts.map((part) => part.type)).toEqual([
        "response-metadata",
        "text-start",
        "text-delta",
        "text-end",
        "finish-step",
        "finish",
      ]);
      const [opencodeSession] = (yield* fake.sessions).values();
      expect(opencodeSession?.directory).toBe(directory);
      expect(opencodeSession?.model).toEqual({ providerID: "opencode", id: "default-model" });
    }),
  );

  it.effect("streams a turn from opencode taking its prompt, not the call it failed before", () =>
    Effect.gen(function* () {
      const { session } = yield* startSession(answer("hello"), {
        takingPrompt: (record) =>
          record("session.next.tool.failed", {
            assistantMessageID: "msg_before",
            callID: "call_before",
            error: { type: "unknown", message: "Tool execution interrupted" },
            provider: { executed: false },
          }),
      });

      const parts = yield* runTurn(session, "Continue.");

      expect(textOf(parts)).toBe("hello");
      expect(parts.filter((part) => part.type === "tool-result")).toEqual([]);
    }),
  );

  it.effect("starts opencode's server once, when the first session starts", () =>
    Effect.gen(function* () {
      const { processes, driver } = yield* makeDriver(answer("hello"));
      const before = processes.spawned.length;

      yield* driver.start({ id, directory, history: Prompt.empty });
      yield* driver.start({ id: SessionId.make("session-two"), directory, history: Prompt.empty });

      expect(before).toBe(0);
      expect(processes.spawned).toHaveLength(1);
    }),
  );

  it.effect("starts opencode's server again for the next session when it failed to start", () =>
    Effect.gen(function* () {
      const { processes, driver } = yield* makeDriver(answer("hello"), { failingStarts: 1 });

      const failed = yield* Effect.flip(driver.start({ id, directory, history: Prompt.empty }));
      const session = yield* driver.start({ id, directory, history: Prompt.empty });

      expect(failed.reason._tag).toBe("UnavailableError");
      expect(textOf(yield* runTurn(session, "Say hello."))).toBe("hello");
      expect(processes.spawned).toHaveLength(2);
    }),
  );

  it.effect("reports when opencode's server exits by itself", () =>
    Effect.gen(function* () {
      const { processes, driver } = yield* makeDriver(answer("hello"));
      yield* driver.start({ id, directory, history: Prompt.empty });
      const exited = yield* Effect.forkChild(driver.serverExited);

      yield* processes.exit;

      yield* Fiber.join(exited);
    }),
  );

  it.effect("switches the session's model when a turn names another, and back", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession((turn) =>
        answer(`${turn.model?.providerID}/${turn.model?.id}:${turn.model?.variant ?? "-"}`)(turn),
      );

      const named = yield* runTurn(session, "Which?", { model: "other" });
      const again = yield* runTurn(session, "Which?", { model: "other" });
      const variant = yield* runTurn(session, "Which?", { model: "deep" });
      const unnamed = yield* runTurn(session, "Which?");

      expect([named, again, variant, unnamed].map(textOf)).toEqual([
        "opencode/other-model:-",
        "opencode/other-model:-",
        "opencode/default-model:amends-high",
        "opencode/default-model:-",
      ]);
      expect(fake.requests.filter((request) => request.endsWith("/model"))).toHaveLength(3);
    }),
  );

  it.effect("refuses what opencode's session API does not take, before prompting", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession(answer("unused"));
      const file = Prompt.makePart("file", { mediaType: "text/plain", data: "aGk=" });

      const refused: ReadonlyArray<Partial<Bridge.TurnOptions>> = [
        { instructions: "Be brief." },
        { responseFormat: { type: "json", objectName: "output", schema: {} } },
        { tools: [{ name: "Echo", parameters: { type: "object" } }] },
        { prompt: Prompt.makeMessage("user", { content: [file] }) },
        { model: "opencode/default-model" },
        { model: "constructor" },
      ];
      const refusals = yield* Effect.forEach(refused, (options) =>
        Effect.flip(runTurn(session, "Hi.", options)),
      );

      expect(refusals.map((error) => error.reason._tag)).toEqual(Array(6).fill("UnsupportedError"));
      expect(refusals.at(-1)?.reason).toMatchObject({
        description: "The opencode agent has no model named constructor",
      });
      expect(fake.requests.filter((request) => request.endsWith("/prompt"))).toEqual([]);
    }),
  );

  it.effect(
    "fails a turn whose events it cannot read, and interrupts the turn in opencode, rather than finishing it",
    () =>
      Effect.gen(function* () {
        const { fake, session } = yield* startSession((turn) =>
          Effect.andThen(
            Effect.andThen(callBash(turn), turn.record("fake.unreadable", {})),
            Effect.never,
          ),
        );

        const error = yield* Effect.flip(runTurn(session, "Build it."));

        expect(error.reason._tag).toBe("InvalidOutputError");
        expect(fake.requests.filter((request) => request.endsWith("/interrupt"))).toHaveLength(1);
      }),
  );

  it.effect("admits no prompt when the turn is aborted while it waits for opencode's models", () =>
    Effect.gen(function* () {
      const asked = yield* Deferred.make<void>();
      const loaded = yield* Deferred.make<void>();
      const { fake, session } = yield* startSession(answer("hello"), {
        loadingProvider: Effect.andThen(Deferred.succeed(asked, undefined), Deferred.await(loaded)),
      });

      const aborted = yield* Effect.forkChild(runTurn(session, "Say hi."));
      yield* Deferred.await(asked);
      yield* Fiber.interrupt(aborted);
      yield* Deferred.succeed(loaded, undefined);
      const parts = yield* runTurn(session, "Say hello.");

      expect(fake.requests.filter((request) => request.endsWith("/prompt"))).toHaveLength(1);
      expect(textOf(parts)).toBe("hello");
    }),
  );

  it.effect("refuses a model whose provider opencode has not loaded within 10 seconds", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession(answer("hello"));

      // The driver asks opencode over HTTP between its waits, so the clock moves on a little at a
      // time until it gives up.
      const refused = yield* Effect.raceFirst(
        Effect.flip(runTurn(session, "Say hello.", { model: "elsewhere" })),
        Effect.forever(
          Effect.andThen(
            TestClock.adjust("200 millis"),
            TestClock.withLive(Effect.sleep("5 millis")),
          ),
        ),
      );

      expect(refused.reason).toMatchObject({
        _tag: "UnsupportedError",
        description: "opencode has no model provider elsewhere",
      });
      expect(
        fake.requests.filter((request) => request === "GET /api/provider/elsewhere").length,
      ).toBeGreaterThan(1);
      expect(fake.requests.filter((request) => request.endsWith("/prompt"))).toEqual([]);
    }),
  );

  it.effect("interrupts the turn in opencode when its stream ends before the turn does", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession((turn) =>
        Effect.andThen(callBash(turn), Effect.never),
      );

      const read = yield* session.prompt(turnOptions("Build it.")).pipe(
        Stream.takeUntil((part) => part.type === "tool-call"),
        Stream.runCollect,
      );

      expect(read.at(-1)?.type).toBe("tool-call");
      expect(fake.requests.filter((request) => request.endsWith("/interrupt"))).toHaveLength(1);
    }),
  );

  it.effect("writes another agent's conversation into a new opencode session", () =>
    Effect.gen(function* () {
      const { fake, driver } = yield* makeDriver(answer("unused"));
      const history = Prompt.make([
        { role: "user", content: "Remember the codename BLUE-MARLIN-9." },
        { role: "assistant", content: [{ type: "text", text: "Noted." }] },
      ]);

      yield* driver.start({ id, directory, history });

      const [opencodeSession] = (yield* fake.sessions).values();
      expect(opencodeSession?.events.map((event) => event.type)).toEqual([
        "session.created",
        "session.next.prompted",
        "session.next.step.started",
        "session.next.text.started",
        "session.next.text.ended",
        "session.next.step.ended",
      ]);
    }),
  );

  it.effect(
    "picks its own opencode session up again from its state, or writes the conversation into a new one when opencode lost it",
    () =>
      Effect.gen(function* () {
        const { fake, driver, session } = yield* startSession(answer("hello"));
        yield* runTurn(session, "Say hello.");
        const history = Prompt.make([
          { role: "user", content: "Say hello." },
          { role: "assistant", content: [{ type: "text", text: "hello" }] },
        ]);

        const again = yield* driver.start({
          id,
          directory,
          history,
          agentState: yield* session.state,
        });
        const state = yield* again.state;
        const kept = [...(yield* fake.sessions).keys()];
        for (const sessionID of kept) fake.forget(sessionID);
        yield* driver.start({ id, directory, history, agentState: state });

        const sessions = yield* fake.sessions;
        expect(kept).toHaveLength(1);
        expect([...sessions.keys()]).not.toContain(kept[0]);
        const [rebuilt] = sessions.values();
        expect(
          rebuilt?.events.flatMap((event) =>
            event.type === "session.next.prompted" ? [event.data.prompt] : [],
          ),
        ).toEqual([{ text: "Say hello." }]);
      }),
  );

  it.effect("deletes the session in opencode when destroyed", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession(answer("hello"));
      yield* runTurn(session, "Say hello.");

      yield* session.destroy;

      expect((yield* fake.sessions).size).toBe(0);
    }),
  );
});

// The driver checks once a second whether opencode still runs a turn that recorded no end, so this
// test runs on the live clock, which the shared layer's tests do not offer.
it.live("OpencodeDriver fails a turn opencode stopped without recording its end", () =>
  Effect.gen(function* () {
    const { session } = yield* startSession(() => Effect.void);

    const parts = yield* runTurn(session, "Say hi.");

    expect(parts.slice(-2)).toEqual([
      {
        type: "error",
        error: { type: "unknown", message: "opencode stopped the turn unfinished" },
      },
      expect.objectContaining({ type: "finish", reason: "error" }),
    ]);
  }).pipe(Effect.provide(TestLayer)),
);
