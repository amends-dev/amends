import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Schema, Stream } from "effect";
import { Tool, Toolkit } from "effect/ai";
import { SessionId } from "../src/Agent.ts";
import * as Harness from "../src/Harness.ts";
import type { StreamPart } from "../src/StreamPart.ts";
import {
  type FakeAgentOptions,
  makeFakeAgent,
  makeFakeSandbox,
  reply,
  type Script,
} from "./fakes.ts";

const id = SessionId.make("session-one");

const Add = Tool.make("Add", {
  parameters: Schema.Struct({ a: Schema.Finite, b: Schema.Finite }),
  success: Schema.Finite,
});
const MathToolkit = Toolkit.make(Add);
const MathHandlers = MathToolkit.toLayer({ Add: ({ a, b }) => Effect.succeed(a + b) });

const answers: Script = (prompt) => Stream.fromIterable(reply(`codex answers ${prompt}`));

/** Starts a session on a fake agent following `script`. */
const startSession = (script: Script, options?: FakeAgentOptions) =>
  Effect.gen(function* () {
    const fake = yield* makeFakeAgent("codex", script, options);
    const { sandbox } = yield* makeFakeSandbox;
    const session = yield* Harness.make(fake.agent).startSession({ sandbox, id });
    return { fake, session };
  });

describe("Session", () => {
  it.effect("streams a turn's parts as the agent sends them, and returns the whole turn", () =>
    Effect.gen(function* () {
      const { session } = yield* startSession(answers);

      const parts = yield* Stream.runCollect(session.stream({ prompt: "hello" }));
      const result = yield* session.generate({ prompt: "again" });

      expect(parts).toEqual(reply("codex answers hello"));
      expect(result.text).toBe("codex answers again");
      expect(result.finishReason).toBe("stop");
    }),
  );

  it.effect("runs the host's tool the agent calls and gives the agent its result", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession((_prompt, host) =>
        Stream.concat(
          Stream.make({ type: "tool-call", id: "call-one", name: "Add", params: { a: 2, b: 3 } }),
          Stream.unwrap(
            Effect.map(host.toolResult, (sum) =>
              Stream.fromIterable(reply(`The sum is ${String(sum)}`)),
            ),
          ),
        ),
      );

      const result = yield* session.generate({ prompt: "add", toolkit: yield* MathToolkit });

      expect(fake.turns[0]?.tools.map((tool) => tool.name)).toEqual(["Add"]);
      expect(fake.submitted).toEqual([5]);
      expect(result.toolResults).toEqual([
        {
          type: "tool-result",
          id: "call-one",
          name: "Add",
          result: 5,
          isFailure: false,
          providerExecuted: false,
          preliminary: false,
        },
      ]);
      expect(result.text).toBe("The sum is 5");
    }).pipe(Effect.provide(MathHandlers)),
  );

  it.effect(
    "fails with InvalidOutputError when the agent calls a tool the host does not have",
    () =>
      Effect.gen(function* () {
        const { session } = yield* startSession(() =>
          Stream.make({ type: "tool-call", id: "call-one", name: "Delete", params: {} }),
        );

        const error = yield* Effect.flip(session.generate({ prompt: "delete" }));

        expect(error._tag === "HarnessError" && error.reason._tag).toBe("InvalidOutputError");
      }),
  );

  it.effect("asks for JSON and decodes the answer with the schema", () =>
    Effect.gen(function* () {
      const { fake, session } = yield* startSession(() =>
        Stream.fromIterable(reply('{"answer":42}')),
      );

      const result = yield* session.generateObject({
        prompt: "answer",
        schema: Schema.Struct({ answer: Schema.Finite }),
      });

      expect(fake.turns[0]?.responseFormat.type).toBe("json");
      expect(result.value).toEqual({ answer: 42 });
    }),
  );

  it.effect("fails with StructuredOutputError, keeping the answer, when it does not decode", () =>
    Effect.gen(function* () {
      const { session } = yield* startSession(() => Stream.fromIterable(reply("not JSON")));

      const error = yield* Effect.flip(
        session.generateObject({
          prompt: "answer",
          schema: Schema.Struct({ answer: Schema.Finite }),
        }),
      );

      expect(error._tag === "HarnessError" && error.reason).toMatchObject({
        _tag: "StructuredOutputError",
        responseText: "not JSON",
      });
    }),
  );

  it.effect(
    "fails generate with TurnFailedError when the agent reports a failure, which stream shows",
    () =>
      Effect.gen(function* () {
        const failure = { message: "The key was rejected" };
        const { session } = yield* startSession(() =>
          Stream.make(
            { type: "error", error: failure },
            { type: "finish", reason: "error", usage: { inputTokens: {}, outputTokens: {} } },
          ),
        );

        const parts = yield* Stream.runCollect(session.stream({ prompt: "hello" }));
        const error = yield* Effect.flip(session.generate({ prompt: "hello" }));

        expect(parts[0]).toEqual({ type: "error", error: failure });
        expect(error._tag === "HarnessError" && error.reason).toMatchObject({
          _tag: "TurnFailedError",
          error: failure,
        });
      }),
  );

  it.effect(
    "refuses a turn while another runs, and takes one again once that turn is interrupted",
    () =>
      Effect.gen(function* () {
        const running = yield* Deferred.make<void>();
        const { session } = yield* startSession((prompt, host) =>
          prompt === "slow"
            ? Stream.concat(
                Stream.fromEffectDrain(Deferred.succeed(running, undefined)),
                Stream.never,
              )
            : answers(prompt, host),
        );

        const slow = yield* Stream.runCollect(session.stream({ prompt: "slow" })).pipe(
          Effect.forkChild,
        );
        yield* Deferred.await(running);
        const refused = yield* Effect.flip(session.generate({ prompt: "hello" }));
        yield* Fiber.interrupt(slow);
        const result = yield* session.generate({ prompt: "hello" });

        expect(refused._tag === "HarnessError" && refused.reason._tag).toBe("TurnInProgressError");
        expect(result.text).toBe("codex answers hello");
      }),
  );

  it.effect("suspends a running turn, ending its stream, and returns it unfinished", () =>
    Effect.gen(function* () {
      const running = yield* Deferred.make<void>();
      const { session } = yield* startSession(() =>
        Stream.concat(
          Stream.make({ type: "text-start", id: "answer" }),
          Stream.concat(Stream.fromEffectDrain(Deferred.succeed(running, undefined)), Stream.never),
        ),
      );

      const slow = yield* Stream.runCollect(session.stream({ prompt: "slow" })).pipe(
        Effect.forkChild,
      );
      yield* Deferred.await(running);
      const state = yield* session.suspend;
      const parts = yield* Fiber.join(slow);
      const refused = yield* Effect.flip(session.generate({ prompt: "hello" }));

      expect(parts).toEqual([{ type: "text-start", id: "answer" }]);
      expect(state.unfinishedTurn?.agentState).toEqual({ agent: "codex", turn: true });
      expect(state.history.content).toEqual([]);
      expect(refused._tag === "HarnessError" && refused.reason._tag).toBe("NotFoundError");
    }),
  );

  it.effect(
    "records a turn that finishes while the session suspends, and leaves no turn unfinished",
    () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const answering = yield* Deferred.make<void>();
        const answered = yield* Deferred.make<void>();
        const { session } = yield* startSession(
          () =>
            Stream.concat(
              Stream.fromEffectDrain(
                Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(answering)),
              ),
              Stream.fromIterable(reply("Done")),
            ),
          // The turn finishes while the agent lets go of it.
          {
            beforeSuspend: Effect.andThen(
              Deferred.succeed(answering, undefined),
              Deferred.await(answered),
            ),
          },
        );

        const reading = yield* session.stream({ prompt: "hello" }).pipe(
          Stream.runForEach((part) =>
            part.type === "finish" ? Deferred.succeed(answered, undefined) : Effect.void,
          ),
          Effect.forkChild,
        );
        yield* Deferred.await(started);
        const state = yield* session.suspend;
        yield* Fiber.join(reading);

        expect(state.unfinishedTurn).toBeUndefined();
        expect(state.history.content).toMatchObject([
          { role: "user", content: [{ type: "text", text: "hello" }] },
          { role: "assistant", content: [{ type: "text", text: "Done" }] },
        ]);
      }),
  );

  it.effect("refuses to detach while a turn runs", () =>
    Effect.gen(function* () {
      const running = yield* Deferred.make<void>();
      const { session } = yield* startSession(() =>
        Stream.concat(Stream.fromEffectDrain(Deferred.succeed(running, undefined)), Stream.never),
      );

      yield* Stream.runCollect(session.stream({ prompt: "slow" })).pipe(Effect.forkChild);
      yield* Deferred.await(running);
      const refused = yield* Effect.flip(session.detach);

      expect(refused.reason._tag).toBe("TurnInProgressError");
    }),
  );

  it.effect(
    "records each step of a turn, with the tools called and their results, whoever ran them",
    () =>
      Effect.gen(function* () {
        const usage = { inputTokens: {}, outputTokens: {} };
        const readStep: ReadonlyArray<StreamPart> = [
          { type: "text-start", id: "plan" },
          { type: "text-delta", id: "plan", delta: "Reading the notes first." },
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
          { type: "finish-step", reason: "tool-calls", usage },
          { type: "tool-call", id: "call-add", name: "Add", params: { a: 2, b: 3 } },
        ];
        const { session } = yield* startSession((_prompt, host) =>
          Stream.concat(
            Stream.fromIterable(readStep),
            Stream.unwrap(
              Effect.map(host.toolResult, (sum) =>
                Stream.fromIterable<StreamPart>([
                  { type: "finish-step", reason: "tool-calls", usage },
                  ...reply(`The sum is ${String(sum)}`),
                ]),
              ),
            ),
          ),
        );

        yield* session.generate({
          prompt: "Add the numbers in notes.md",
          toolkit: yield* MathToolkit,
        });
        const state = yield* session.detach;

        expect(state.history.content).toMatchObject([
          { role: "user", content: [{ type: "text", text: "Add the numbers in notes.md" }] },
          {
            role: "assistant",
            content: [
              { type: "text", text: "Reading the notes first." },
              {
                type: "tool-call",
                id: "call-read",
                name: "read",
                params: { path: "notes.md" },
                providerExecuted: false,
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                id: "call-read",
                name: "read",
                result: "2 and 3",
                isFailure: false,
                providerExecuted: false,
              },
            ],
          },
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                id: "call-add",
                name: "Add",
                params: { a: 2, b: 3 },
                providerExecuted: false,
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                id: "call-add",
                name: "Add",
                result: 5,
                isFailure: false,
                providerExecuted: false,
              },
            ],
          },
          { role: "assistant", content: [{ type: "text", text: "The sum is 5" }] },
        ]);
      }).pipe(Effect.provide(MathHandlers)),
  );

  it.effect("records each finished turn's prompt and answer in the conversation it returns", () =>
    Effect.gen(function* () {
      const { session } = yield* startSession(answers);

      yield* session.generate({ prompt: "hello" });
      yield* session.generate({ prompt: "again" });
      const state = yield* session.detach;

      expect(
        state.history.content.map((message) => [
          message.role,
          typeof message.content === "string"
            ? message.content
            : message.content.map((part) => (part.type === "text" ? part.text : "")).join(""),
        ]),
      ).toEqual([
        ["user", "hello"],
        ["assistant", "codex answers hello"],
        ["user", "again"],
        ["assistant", "codex answers again"],
      ]);
      expect(state.agentState).toEqual({ agent: "codex" });
    }),
  );
});
