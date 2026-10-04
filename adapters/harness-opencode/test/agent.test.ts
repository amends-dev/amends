import { Agent, GenerateResult, Harness } from "@amends/harness-v2";
import { BunServices } from "@effect/platform-bun";
import { expect, it, layer } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Path, Schema, Stream } from "effect";
import { Prompt, Tool, Toolkit } from "effect/ai";
import { FetchHttpClient } from "effect/http";
import * as OpencodeAgent from "../src/OpencodeAgent.ts";
import { type FakeOpencodeOptions, type FakeTurn, makeFakeOpencode } from "./fakes.ts";
import { makeSandbox, tokens } from "./fixtures.ts";

const id = Agent.SessionId.make("session-one");

const Echo = Tool.make("Echo", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
});
const EchoToolkit = Toolkit.make(Echo);
const EchoHandlers = EchoToolkit.toLayer({ Echo: ({ text }) => Effect.succeed(text) });

/**
 * A harness over the opencode agent, whose sandbox on this machine reaches a fake opencode that
 * runs each turn with `runTurn`.
 */
const makeHarness = (
  runTurn: (turn: FakeTurn) => Effect.Effect<void>,
  options?: FakeOpencodeOptions,
) =>
  Effect.gen(function* () {
    const fake = yield* makeFakeOpencode(runTurn, options);
    const sandbox = yield* makeSandbox(fake.port);
    const agent = yield* OpencodeAgent.make({ model: "opencode/default-model", port: fake.port });
    return { fake, sandbox, harness: Harness.make(agent) };
  });

const startSession = (
  runTurn: (turn: FakeTurn) => Effect.Effect<void>,
  options?: FakeOpencodeOptions,
) =>
  Effect.gen(function* () {
    const made = yield* makeHarness(runTurn, options);
    const session = yield* made.harness.startSession({ sandbox: made.sandbox, id });
    return { ...made, session };
  });

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

/** A turn that runs `bash` in a first step, and answers in a second once `answering` is done. */
const buildThenAnswer = (answering: Deferred.Deferred<void>) => (turn: FakeTurn) =>
  Effect.gen(function* () {
    yield* callBash(turn);
    yield* turn.record("session.next.tool.success", {
      assistantMessageID: "msg_tool",
      callID: "call_1",
      structured: {},
      content: [{ type: "text", text: "built\n" }],
      provider: { executed: false },
    });
    yield* turn.record("session.next.step.ended", {
      assistantMessageID: "msg_tool",
      finish: "tool-calls",
      cost: 0,
      tokens: tokens(10, 5),
    });
    yield* Deferred.await(answering);
    yield* answer("The build finished.")(turn);
  });

/** The conversation `buildThenAnswer` records for the prompt `Build it.` */
const builtThenAnswered = [
  { role: "user", content: [{ type: "text", text: "Build it." }] },
  { role: "assistant", content: [{ type: "tool-call", id: "call_1", name: "bash" }] },
  { role: "tool", content: [{ type: "tool-result", id: "call_1", isFailure: false }] },
  { role: "assistant", content: [{ type: "text", text: "The build finished." }] },
];

const TestLayer = Layer.mergeAll(BunServices.layer, FetchHttpClient.layer, EchoHandlers);

layer(TestLayer)("OpencodeAgent", (it) => {
  it.effect("runs a turn in the session's directory, streaming what opencode records", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const { fake, sandbox, session } = yield* startSession(answer("hello"));

      const result = yield* session.generate({ prompt: "Say hello." });

      expect(result.text).toBe("hello");
      expect(result.parts.map((part) => part.type)).toEqual([
        "response-metadata",
        "text-start",
        "text-delta",
        "text-end",
        "finish-step",
        "finish",
      ]);
      const [opencodeSession] = (yield* fake.sessions).values();
      expect(opencodeSession?.directory).toBe(path.join(sandbox.workingDirectory, id));
      expect(opencodeSession?.model).toEqual({ providerID: "opencode", id: "default-model" });
    }),
  );

  it.effect("switches the session's model when a turn names another, and back", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession((turn) =>
        answer(`${turn.model?.providerID}/${turn.model?.id}`)(turn),
      );

      const named = yield* session.generate({ prompt: "Which?", model: "opencode/other-model" });
      const again = yield* session.generate({ prompt: "Which?", model: "opencode/other-model" });
      const unnamed = yield* session.generate({ prompt: "Which?" });

      expect([named.text, again.text, unnamed.text]).toEqual([
        "opencode/other-model",
        "opencode/other-model",
        "opencode/default-model",
      ]);
      expect(fake.requests.filter((request) => request.endsWith("/model"))).toHaveLength(2);
    }),
  );

  it.effect("refuses what opencode's session API does not take, before prompting", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession(answer("unused"));
      const file = Prompt.makePart("file", { mediaType: "text/plain", data: "aGk=" });

      const refusals = yield* Effect.all([
        Effect.flip(session.generate({ prompt: "Hi.", instructions: "Be brief." })),
        Effect.flip(
          session.generateObject({
            prompt: "Hi.",
            schema: Schema.Struct({ ok: Schema.Boolean }),
          }),
        ),
        Effect.flip(session.generate({ prompt: "Hi.", toolkit: yield* EchoToolkit })),
        Effect.flip(session.generate({ prompt: Prompt.makeMessage("user", { content: [file] }) })),
        Effect.flip(session.generate({ prompt: "Hi.", model: "default-model" })),
      ]);

      expect(
        refusals.map((error) => (error._tag === "HarnessError" ? error.reason._tag : error._tag)),
      ).toEqual(Array(5).fill("UnsupportedError"));
      expect(fake.requests.filter((request) => request.endsWith("/prompt"))).toEqual([]);
    }),
  );

  it.effect(
    "suspends a running turn, which goes on in opencode, and continues it after the steps the session has",
    () =>
      Effect.gen(function* () {
        const answering = yield* Deferred.make<void>();
        const { fake, sandbox, harness, session } = yield* startSession(buildThenAnswer(answering));
        const tookFirstStep = yield* Deferred.make<void>();

        const reading = yield* session.stream({ prompt: "Build it." }).pipe(
          Stream.runForEach((part) =>
            part.type === "finish-step" ? Deferred.succeed(tookFirstStep, undefined) : Effect.void,
          ),
          Effect.forkChild,
        );
        yield* Deferred.await(tookFirstStep);
        const state = yield* session.suspend;
        yield* Fiber.join(reading);
        yield* Deferred.succeed(answering, undefined);
        const resumed = yield* harness.resumeSession({ sandbox, state });
        const after = yield* Stream.runCollect(resumed.continue({}));

        expect(after.map((part) => part.type)).toEqual([
          "response-metadata",
          "text-start",
          "text-delta",
          "text-end",
          "finish-step",
          "finish",
        ]);
        expect((yield* resumed.detach).history.content).toMatchObject(builtThenAnswered);
        // The turn went on in opencode while no host read it.
        expect(fake.requests.filter((request) => request.endsWith("/interrupt"))).toEqual([]);
      }),
  );

  it.effect("continues a turn suspended within a step from the start of that step", () =>
    Effect.gen(function* () {
      const answering = yield* Deferred.make<void>();
      const { sandbox, harness, session } = yield* startSession(buildThenAnswer(answering));
      // The caller takes the call of `bash` and then waits, so the session has no step finished.
      const calledBash = yield* Deferred.make<void>();
      const suspended = yield* Deferred.make<void>();
      const reading = yield* session.stream({ prompt: "Build it." }).pipe(
        Stream.runForEach((part) =>
          part.type === "tool-call"
            ? Effect.andThen(Deferred.succeed(calledBash, undefined), Deferred.await(suspended))
            : Effect.void,
        ),
        Effect.forkChild,
      );
      yield* Deferred.await(calledBash);
      const state = yield* session.suspend;
      yield* Deferred.succeed(suspended, undefined);
      yield* Fiber.join(reading);
      yield* Deferred.succeed(answering, undefined);
      const resumed = yield* harness.resumeSession({ sandbox, state });
      const after = yield* Stream.runCollect(resumed.continue({}));

      expect(after.map((part) => part.type)).toEqual([
        "response-metadata",
        "tool-params-start",
        "tool-params-delta",
        "tool-params-end",
        "tool-call",
        "tool-result",
        "finish-step",
        "response-metadata",
        "text-start",
        "text-delta",
        "text-end",
        "finish-step",
        "finish",
      ]);
      expect((yield* resumed.detach).history.content).toMatchObject(builtThenAnswered);
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

        const error = yield* Effect.flip(session.generate({ prompt: "Build it." }));

        expect(error._tag === "HarnessError" && error.reason._tag).toBe("InvalidOutputError");
        expect(fake.requests.filter((request) => request.endsWith("/interrupt"))).toHaveLength(1);
        expect((yield* session.detach).history.content).toEqual([]);
      }),
  );

  it.effect("admits no prompt once suspended while it waited for opencode's models", () =>
    Effect.gen(function* () {
      const asked = yield* Deferred.make<void>();
      const loaded = yield* Deferred.make<void>();
      const { fake, sandbox, harness, session } = yield* startSession(answer("hello"), {
        loadingProvider: Effect.andThen(Deferred.succeed(asked, undefined), Deferred.await(loaded)),
      });

      const reading = yield* Stream.runCollect(session.stream({ prompt: "Say hello." })).pipe(
        Effect.forkChild,
      );
      yield* Deferred.await(asked);
      const state = yield* session.suspend;
      yield* Deferred.succeed(loaded, undefined);
      yield* Fiber.join(reading);
      const admittedBeforeResuming = fake.requests.filter((request) => request.endsWith("/prompt"));
      const resumed = yield* harness.resumeSession({ sandbox, state });
      const result = new GenerateResult.GenerateResult(
        yield* Stream.runCollect(resumed.continue({})),
      );

      expect(admittedBeforeResuming).toEqual([]);
      expect(fake.requests.filter((request) => request.endsWith("/prompt"))).toHaveLength(1);
      expect(result.text).toBe("hello");
    }),
  );

  it.effect("keeps a prompt opencode admitted while the session suspended, prompting once", () =>
    Effect.gen(function* () {
      const admitting = yield* Deferred.make<void>();
      const admit = yield* Deferred.make<void>();
      const { fake, sandbox, harness, session } = yield* startSession(answer("hello"), {
        admitting: Effect.andThen(Deferred.succeed(admitting, undefined), Deferred.await(admit)),
      });

      const reading = yield* Stream.runCollect(session.stream({ prompt: "Say hello." })).pipe(
        Effect.forkChild,
      );
      yield* Deferred.await(admitting);
      const suspending = yield* Effect.forkChild(session.suspend);
      yield* Deferred.succeed(admit, undefined);
      const state = yield* Fiber.join(suspending);
      yield* Fiber.join(reading);
      const resumed = yield* harness.resumeSession({ sandbox, state });
      const result = new GenerateResult.GenerateResult(
        yield* Stream.runCollect(resumed.continue({})),
      );

      expect(fake.requests.filter((request) => request.endsWith("/prompt"))).toHaveLength(1);
      expect(result.text).toBe("hello");
    }),
  );

  it.effect("interrupts the turn in opencode when the caller stops reading it", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession((turn) =>
        Effect.andThen(callBash(turn), Effect.never),
      );

      const read = yield* session.stream({ prompt: "Build it." }).pipe(
        Stream.takeUntil((part) => part.type === "tool-call"),
        Stream.runCollect,
      );

      expect(read.at(-1)?.type).toBe("tool-call");
      expect(fake.requests.filter((request) => request.endsWith("/interrupt"))).toHaveLength(1);
    }),
  );

  it.effect("stops a running turn in opencode, keeping the session to resume", () =>
    Effect.gen(function* () {
      const { fake, sandbox, harness, session } = yield* startSession((turn) =>
        Effect.andThen(callBash(turn), Effect.never),
      );
      const calledBash = yield* Deferred.make<void>();
      const reading = yield* session.stream({ prompt: "Build it." }).pipe(
        Stream.runForEach((part) =>
          part.type === "tool-call" ? Deferred.succeed(calledBash, undefined) : Effect.void,
        ),
        Effect.forkChild,
      );
      yield* Deferred.await(calledBash);

      const state = yield* session.stop;
      yield* Fiber.join(reading);

      expect(fake.requests.filter((request) => request.endsWith("/interrupt"))).toHaveLength(1);
      const resumed = yield* harness.resumeSession({ sandbox, state });
      yield* resumed.detach;
      expect((yield* fake.sessions).size).toBe(1);
    }),
  );

  it.effect("writes another agent's conversation into a new opencode session", () =>
    Effect.gen(function* () {
      const { fake, sandbox, harness } = yield* makeHarness(answer("unused"));
      const history = Prompt.make([
        { role: "user", content: "Remember the codename BLUE-MARLIN-9." },
        { role: "assistant", content: [{ type: "text", text: "Noted." }] },
      ]);

      yield* harness.resumeSession({ sandbox, state: { id, agent: "amends", history } });

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
    "picks its own opencode session up again, or writes the conversation into a new one when opencode lost it",
    () =>
      Effect.gen(function* () {
        const { fake, sandbox, harness, session } = yield* startSession(answer("hello"));
        yield* session.generate({ prompt: "Say hello." });

        const again = yield* harness.resumeSession({ sandbox, state: yield* session.detach });
        yield* again.generate({ prompt: "Again." });
        const state = yield* again.detach;
        const kept = [...(yield* fake.sessions).keys()];
        for (const sessionID of kept) fake.forget(sessionID);
        yield* harness.resumeSession({ sandbox, state });

        const sessions = yield* fake.sessions;
        expect(kept).toHaveLength(1);
        expect([...sessions.keys()]).not.toContain(kept[0]);
        const [rebuilt] = sessions.values();
        expect(
          rebuilt?.events.flatMap((event) =>
            event.type === "session.next.prompted" ? [event.data.prompt] : [],
          ),
        ).toEqual([{ text: "Say hello." }, { text: "Again." }]);
      }),
  );

  it.effect("deletes the session in opencode when destroyed", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession(answer("hello"));
      yield* session.generate({ prompt: "Say hello." });

      yield* session.destroy;

      expect((yield* fake.sessions).size).toBe(0);
    }),
  );
});

// The agent checks once a second whether opencode still runs a turn that recorded no end, so this
// test runs on the live clock, which the shared layer's tests do not offer.
it.live("OpencodeAgent fails a turn opencode stopped without recording its end", () =>
  Effect.gen(function* () {
    const { session } = yield* startSession(() => Effect.void);

    const error = yield* Effect.flip(session.generate({ prompt: "Say hi." }));

    expect(error._tag === "HarnessError" && error.reason).toEqual(
      expect.objectContaining({
        _tag: "TurnFailedError",
        error: { type: "unknown", message: "opencode stopped the turn unfinished" },
      }),
    );
  }).pipe(Effect.provide(TestLayer)),
);
