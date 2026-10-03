import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Schema, Stream } from "effect";
import type { Prompt } from "effect/ai";
import { SessionId } from "../src/Agent.ts";
import * as Harness from "../src/Harness.ts";
import * as Session from "../src/Session.ts";
import { makeFakeAgent, makeFakeSandbox, reply, type Script } from "./fakes.ts";

const id = SessionId.make("session-one");

/**
 * Answers each prompt, except that the first `slow` turn runs until it is suspended. Run again, a
 * `slow` turn is answered like any other.
 */
const answersAs =
  (agent: string, running?: Deferred.Deferred<void>): Script =>
  (prompt) => {
    const answer = Stream.fromIterable(reply(`${agent} answers ${prompt}`));
    if (prompt !== "slow" || running === undefined) return answer;
    const runUntilSuspended = Stream.concat(
      Stream.fromEffectDrain(Deferred.succeed(running, undefined)),
      Stream.never,
    );
    return Stream.unwrap(
      Effect.map(Deferred.isDone(running), (ranBefore) => (ranBefore ? answer : runUntilSuspended)),
    );
  };

/** Suspends a turn running on `harness`, returning the session as a caller would store it: as JSON. */
const suspendSlowTurn = (harness: Harness.Harness["Service"], running: Deferred.Deferred<void>) =>
  Effect.gen(function* () {
    const { sandbox } = yield* makeFakeSandbox;
    const session = yield* harness.startSession({ sandbox, id });
    const slow = yield* Stream.runCollect(session.stream({ prompt: "slow" })).pipe(
      Effect.forkChild,
    );
    yield* Deferred.await(running);
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
        expect(codex.starts[0]?.resume).toBeUndefined();
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

      expect(codex.starts[1]?.resume).toEqual({ agent: "codex" });
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

      expect(opencode.starts[0]?.resume).toBeUndefined();
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

  it.effect("continues an unfinished turn on the agent that suspended it", () =>
    Effect.gen(function* () {
      const running = yield* Deferred.make<void>();
      const codex = yield* makeFakeAgent("codex", answersAs("codex", running));
      const harness = Harness.make(codex.agent);
      const state = yield* suspendSlowTurn(harness, running);
      const { sandbox } = yield* makeFakeSandbox;

      const session = yield* harness.resumeSession({ sandbox, state });
      const refused = yield* Effect.flip(session.generate({ prompt: "hello" }));
      const result = yield* Stream.runCollect(session.continue({}));

      expect(codex.starts[1]?.unfinishedTurn).toEqual({ agent: "codex", turn: true });
      expect(refused._tag === "HarnessError" && refused.reason._tag).toBe("TurnInProgressError");
      expect(result).toEqual(reply("codex finished the unfinished turn"));
      expect(textsOf((yield* session.detach).history)).toEqual([
        "slow",
        "codex finished the unfinished turn",
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

  it.effect("provides the harness through its layer", () =>
    Effect.gen(function* () {
      const codex = yield* makeFakeAgent("codex", answersAs("codex"));

      const harness = yield* Effect.provide(Harness.Harness, Harness.layer(codex.agent));

      expect(harness.agent).toBe("codex");
    }),
  );
});
