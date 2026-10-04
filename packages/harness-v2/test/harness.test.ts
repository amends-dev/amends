import { Port } from "@amends/sandbox-v2/Network";
import { Sandbox } from "@amends/sandbox-v2/Sandbox";
import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Schema, Stream } from "effect";
import type { Prompt } from "effect/ai";
import { SessionId } from "../src/Agent.ts";
import * as Harness from "../src/Harness.ts";
import * as Session from "../src/Session.ts";
import type { StreamPart } from "../src/StreamPart.ts";
import { makeFakeAgent, makeFakeSandbox, readUntil, reply, type Script } from "./fakes.ts";

const id = SessionId.make("session-one");

/** A step that reads the notes with the agent's own tool. */
const readingStep: ReadonlyArray<StreamPart> = [
  { type: "text-start", id: "plan" },
  { type: "text-delta", id: "plan", delta: "Reading the notes." },
  { type: "text-end", id: "plan" },
  {
    type: "tool-call",
    id: "call-read",
    name: "read",
    params: { path: "notes.md" },
    providerExecuted: true,
  },
  {
    type: "tool-result",
    id: "call-read",
    name: "read",
    result: "2 and 3",
    isFailure: false,
    providerExecuted: true,
  },
  { type: "finish-step", reason: "tool-calls", usage: { inputTokens: {}, outputTokens: {} } },
];

/** The messages that record `readingStep` in a conversation. */
const readingMessages = [
  {
    role: "assistant",
    content: [
      { type: "text", text: "Reading the notes." },
      { type: "tool-call", id: "call-read", name: "read", params: { path: "notes.md" } },
    ],
  },
  { role: "tool", content: [{ type: "tool-result", id: "call-read", result: "2 and 3" }] },
];

/**
 * Answers each prompt in one step, except `slow`, which first reads the notes in a step of its own.
 * The first `slow` turn stops partway through its answer until it is suspended; run again once
 * `running` is done, it finishes.
 */
const answersAs =
  (agent: string, running?: Deferred.Deferred<void>): Script =>
  (prompt) => {
    const answer = Stream.fromIterable(reply(`${agent} answers ${prompt}`));
    if (prompt !== "slow" || running === undefined) return answer;
    const answerUntilSuspended = Stream.concat(
      Stream.fromIterable<StreamPart>([
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: `${agent} answ` },
      ]),
      Stream.never,
    );
    return Stream.concat(
      Stream.fromIterable(readingStep),
      Stream.unwrap(
        Effect.map(Deferred.isDone(running), (ranBefore) =>
          ranBefore ? answer : answerUntilSuspended,
        ),
      ),
    );
  };

/**
 * Suspends a turn running on `harness` once the caller has read part of its answer, marking
 * `running` done, and returns the session as a caller would store it: as JSON.
 */
const suspendSlowTurn = (harness: Harness.Harness["Service"], running: Deferred.Deferred<void>) =>
  Effect.gen(function* () {
    const { sandbox } = yield* makeFakeSandbox;
    const session = yield* harness.startSession({ sandbox, id });
    const slow = yield* readUntil(
      session.stream({ prompt: "slow" }),
      (part) => part.type === "text-delta" && part.id === "answer",
    );
    yield* Deferred.succeed(running, undefined);
    const state = yield* session.suspend;
    yield* Fiber.join(slow);
    const stored = yield* Schema.encodeEffect(Schema.fromJsonString(Session.SessionState))(state);
    return yield* Schema.decodeEffect(Schema.fromJsonString(Session.SessionState))(stored);
  });

const textsOf = (history: Prompt.Prompt) =>
  history.content.map((message) =>
    typeof message.content === "string"
      ? message.content
      : message.content.map((part) => (part.type === "text" ? part.text : "")).join(""),
  );

describe("Harness", () => {
  it.effect(
    "starts a session in a directory named by its id, in the sandbox's working directory",
    () =>
      Effect.gen(function* () {
        const codex = yield* makeFakeAgent("codex", answersAs("codex"));
        const { sandbox, directories } = yield* makeFakeSandbox;

        yield* Harness.make(codex.agent).startSession({ sandbox, id });

        expect(directories).toEqual(["/work/session-one"]);
        expect(codex.starts[0]?.id).toBe(id);
        expect(codex.starts[0]?.workspace).toEqual({ sandbox, directory: "/work/session-one" });
        expect(codex.starts[0]?.history.content).toEqual([]);
        expect(codex.starts[0]?.agentState).toBeUndefined();
        expect(codex.starts[0]?.unfinishedTurn).toBeUndefined();
      }),
  );

  it.effect("resumes a session on the agent that last ran it from that agent's own state", () =>
    Effect.gen(function* () {
      const codex = yield* makeFakeAgent("codex", answersAs("codex"));
      const harness = Harness.make(codex.agent);
      const { sandbox } = yield* makeFakeSandbox;
      const session = yield* harness.startSession({ sandbox, id });
      yield* session.generate({ prompt: "hello" });
      const state = yield* session.detach;

      yield* harness.resumeSession({ sandbox, state });

      expect(codex.starts[1]?.agentState).toEqual({ agent: "codex" });
      expect(textsOf(codex.starts[1]?.history ?? state.history)).toEqual([
        "hello",
        "codex answers hello",
      ]);
    }),
  );

  it.effect("gives another agent the conversation, but not the last agent's own state", () =>
    Effect.gen(function* () {
      const codex = yield* makeFakeAgent("codex", answersAs("codex"));
      const opencode = yield* makeFakeAgent("opencode", answersAs("opencode"));
      const { sandbox } = yield* makeFakeSandbox;
      const onCodex = yield* Harness.make(codex.agent).startSession({ sandbox, id });
      yield* onCodex.generate({ prompt: "hello" });

      const onOpencode = yield* Harness.make(opencode.agent).resumeSession({
        sandbox,
        state: yield* onCodex.detach,
      });
      yield* onOpencode.generate({ prompt: "again" });
      const state = yield* onOpencode.detach;

      expect(opencode.starts[0]?.agentState).toBeUndefined();
      expect(textsOf(opencode.starts[0]?.history ?? state.history)).toEqual([
        "hello",
        "codex answers hello",
      ]);
      expect(state.agent).toBe("opencode");
      expect(textsOf(state.history)).toEqual([
        "hello",
        "codex answers hello",
        "again",
        "opencode answers again",
      ]);
    }),
  );

  it.effect(
    "continues an unfinished turn on the agent that suspended it, after the steps it finished",
    () =>
      Effect.gen(function* () {
        const running = yield* Deferred.make<void>();
        const codex = yield* makeFakeAgent("codex", answersAs("codex", running));
        const harness = Harness.make(codex.agent);
        const state = yield* suspendSlowTurn(harness, running);
        const { sandbox } = yield* makeFakeSandbox;

        const session = yield* harness.resumeSession({ sandbox, state });
        const refused = yield* Effect.flip(session.generate({ prompt: "hello" }));
        const result = yield* Stream.runCollect(session.continue({}));

        expect(state.unfinishedTurn?.steps.map((step) => step.content)).toMatchObject([
          readingMessages,
        ]);
        expect(codex.starts[1]?.unfinishedTurn).toEqual({ agent: "codex", turn: true });
        expect(refused._tag === "HarnessError" && refused.reason._tag).toBe("TurnInProgressError");
        expect(codex.continued).toEqual([1]);
        expect(result).toEqual(reply("codex answers slow"));
        expect((yield* session.detach).history.content).toMatchObject([
          { role: "user", content: [{ type: "text", text: "slow" }] },
          ...readingMessages,
          { role: "assistant", content: [{ type: "text", text: "codex answers slow" }] },
        ]);
      }),
  );

  it.effect("runs an unfinished turn again from its prompt on another agent", () =>
    Effect.gen(function* () {
      const running = yield* Deferred.make<void>();
      const codex = yield* makeFakeAgent("codex", answersAs("codex", running));
      const opencode = yield* makeFakeAgent("opencode", answersAs("opencode"));
      const state = yield* suspendSlowTurn(Harness.make(codex.agent), running);
      const { sandbox } = yield* makeFakeSandbox;

      const session = yield* Harness.make(opencode.agent).resumeSession({ sandbox, state });
      const result = yield* Stream.runCollect(session.continue({}));

      expect(opencode.starts[0]?.unfinishedTurn).toBeUndefined();
      expect(result).toEqual(reply("opencode answers slow"));
      expect(textsOf((yield* session.detach).history)).toEqual(["slow", "opencode answers slow"]);
    }),
  );

  it.effect(
    "runs an unfinished turn again from its prompt, without the steps it finished, on an agent that lost it",
    () =>
      Effect.gen(function* () {
        const running = yield* Deferred.make<void>();
        const codex = yield* makeFakeAgent("codex", answersAs("codex", running), {
          losesUnfinishedTurns: true,
        });
        const harness = Harness.make(codex.agent);
        const state = yield* suspendSlowTurn(harness, running);
        const { sandbox } = yield* makeFakeSandbox;

        const session = yield* harness.resumeSession({ sandbox, state });
        const result = yield* Stream.runCollect(session.continue({}));

        expect(codex.continued).toEqual([]);
        expect(codex.turns).toHaveLength(2);
        expect(result).toEqual([...readingStep, ...reply("codex answers slow")]);
        expect((yield* session.detach).history.content).toMatchObject([
          { role: "user", content: [{ type: "text", text: "slow" }] },
          ...readingMessages,
          { role: "assistant", content: [{ type: "text", text: "codex answers slow" }] },
        ]);
      }),
  );

  it.effect("starts a session without a sandbox for an agent that does not require one", () =>
    Effect.gen(function* () {
      const amends = yield* makeFakeAgent("amends", answersAs("amends"), {
        requiresSandbox: false,
      });

      const session = yield* Harness.make(amends.agent).startSession({ id });
      const result = yield* session.generate({ prompt: "how are you doing" });

      expect(amends.starts[0]?.workspace).toBeUndefined();
      expect(result.text).toBe("amends answers how are you doing");
    }),
  );

  it.effect("needs a sandbox for an agent that requires one, also to take over a session", () =>
    Effect.gen(function* () {
      const amends = yield* makeFakeAgent("amends", answersAs("amends"), {
        requiresSandbox: false,
      });
      const codex = yield* makeFakeAgent("codex", answersAs("codex"));
      const onAmends = yield* Harness.make(amends.agent).startSession({ id });
      yield* onAmends.generate({ prompt: "hello" });
      const state = yield* onAmends.detach;
      const harness = Harness.make(codex.agent);

      const refusedStart = yield* Effect.flip(harness.startSession({ id }));
      const refusedResume = yield* Effect.flip(harness.resumeSession({ state }));
      const { sandbox } = yield* makeFakeSandbox;
      const onCodex = yield* harness.resumeSession({ sandbox, state });
      const result = yield* onCodex.generate({ prompt: "again" });

      expect(refusedStart.reason._tag).toBe("UnsupportedError");
      expect(refusedResume.reason._tag).toBe("UnsupportedError");
      expect(textsOf(codex.starts[0]?.history ?? state.history)).toEqual([
        "hello",
        "amends answers hello",
      ]);
      expect(result.text).toBe("codex answers again");
    }),
  );

  it.effect("needs a sandbox created with the ports the agent listens on", () =>
    Effect.gen(function* () {
      const port = Port.make(4096);
      const opencode = yield* makeFakeAgent("opencode", answersAs("opencode"), { ports: [port] });
      const harness = Harness.make(opencode.agent);
      const { sandbox } = yield* makeFakeSandbox;

      const refused = yield* Effect.flip(harness.startSession({ sandbox, id }));
      yield* harness.startSession({ sandbox: Sandbox.of({ ...sandbox, ports: [port] }), id });

      expect(harness.ports).toEqual([port]);
      expect(refused.reason._tag).toBe("UnsupportedError");
      expect(refused.message).toBe(
        "opencode: opencode listens on ports 4096, which the sandbox was not created with",
      );
      expect(opencode.starts).toHaveLength(1);
    }),
  );

  it.effect("provides the harness through its layer", () =>
    Effect.gen(function* () {
      const codex = yield* makeFakeAgent("codex", answersAs("codex"));

      const harness = yield* Effect.provide(Harness.Harness, Harness.layer(codex.agent));

      expect(harness.agent).toBe("codex");
    }),
  );
});
