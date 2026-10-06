import { Agent, GenerateResult, Harness, Session } from "@amends/harness-v2";
import type { Sandbox } from "@amends/sandbox-v2";
import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Deferred, Effect, Fiber, Path, Schema, Stream } from "effect";
import { AiError, type LanguageModel, Prompt, type Response, Tool, Toolkit } from "effect/ai";
import {
  answer,
  callTool,
  callTools,
  makeAgent,
  makeSandbox,
  makeScriptedModel,
  toolResultsOf,
} from "./fixtures.ts";

const id = Agent.SessionId.make("session-one");

const Add = Tool.make("Add", {
  description: "Adds two numbers.",
  parameters: Schema.Struct({ a: Schema.Finite, b: Schema.Finite }),
  success: Schema.Finite,
});
const MathToolkit = Toolkit.make(Add);
const MathHandlers = MathToolkit.toLayer({ Add: ({ a, b }) => Effect.succeed(a + b) });

/** Stores a session's state as a caller would, as JSON, and reads it back. */
const throughJson = (state: Session.SessionState) =>
  Effect.flatMap(
    Schema.encodeEffect(Schema.fromJsonString(Session.SessionState))(state),
    Schema.decodeEffect(Schema.fromJsonString(Session.SessionState)),
  );

/** Reads a file in the session's directory in `sandbox`. */
const readSessionFile = (sandbox: Sandbox.Sandbox["Service"], name: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* sandbox.fileSystem.readFileString(path.join(sandbox.workingDirectory, id, name));
  });

const rolesOf = (prompt: Prompt.Prompt | undefined) =>
  prompt?.content.map((message) => message.role);

const toolNamesOf = (request: LanguageModel.ProviderOptions | undefined) =>
  request?.tools.map((tool) => tool.name);

/**
 * Responds with `response`, except the first time, when it signals `running` and then runs until
 * suspend cuts it short.
 */
const untilSuspended = (
  running: Deferred.Deferred<void>,
  response: Stream.Stream<Response.StreamPartEncoded, AiError.AiError>,
) =>
  Stream.unwrap(
    Effect.map(Deferred.isDone(running), (ranBefore) =>
      ranBefore
        ? response
        : Stream.concat(Stream.fromEffectDrain(Deferred.succeed(running, undefined)), Stream.never),
    ),
  );

layer(BunServices.layer)("AmendsAgent", (it) => {
  it.effect("answers from its model alone when the session has no sandbox", () =>
    Effect.gen(function* () {
      const { model, requests } = yield* makeScriptedModel(() => answer("I am well"));
      const session = yield* Harness.make(yield* makeAgent({ model })).startSession({ id });

      const result = yield* session.generate({ prompt: "how are you doing" });

      expect(toolNamesOf(requests[0])).toEqual([]);
      expect(result.parts.map((part) => part.type)).toEqual([
        "text-start",
        "text-delta",
        "text-end",
        "finish-step",
        "finish",
      ]);
      expect(result.text).toBe("I am well");
    }),
  );

  it.effect("works in its sandbox with its own tools, taking a step for each response", () =>
    Effect.gen(function* () {
      const sandbox = yield* makeSandbox;
      const { model, requests } = yield* makeScriptedModel((request) => {
        const results = toolResultsOf(request);
        if (results.length === 0) {
          return callTool("write-1", "write", { file_path: "notes.txt", content: "hello" });
        }
        if (results.length === 1) return callTool("read-1", "read", { file_path: "notes.txt" });
        return answer(`The file says ${String(results[1])}`);
      });
      const session = yield* Harness.make(yield* makeAgent({ model })).startSession({
        id,
        sandbox,
      });

      const result = yield* session.generate({ prompt: "write notes.txt and read it" });

      expect(toolNamesOf(requests[0])).toEqual(["read", "write", "edit", "bash"]);
      expect(requests.map((request) => toolResultsOf(request).length)).toEqual([0, 1, 2]);
      expect(result.toolCalls).toMatchObject([
        { name: "write", providerExecuted: true },
        { name: "read", providerExecuted: true },
      ]);
      expect(result.toolResults).toMatchObject([
        { name: "write", result: "Wrote notes.txt", providerExecuted: true },
        { name: "read", result: "hello", providerExecuted: true },
      ]);
      expect(
        result.parts.flatMap((part) => (part.type === "finish-step" ? [part.reason] : [])),
      ).toEqual(["tool-calls", "tool-calls", "stop"]);
      expect(result.text).toBe("The file says hello");
      expect(result.usage).toEqual({ inputTokens: { total: 30 }, outputTokens: { total: 15 } });
      expect(yield* readSessionFile(sandbox, "notes.txt")).toBe("hello");
    }),
  );

  it.effect("works in its sandbox with its own tools and the host's in the same step", () =>
    Effect.gen(function* () {
      const { model, requests } = yield* makeScriptedModel((request) =>
        toolResultsOf(request).length === 0
          ? callTools([
              { id: "bash-1", name: "bash", params: { command: "echo 2" } },
              { id: "add-1", name: "Add", params: { a: 2, b: 3 } },
            ])
          : answer("done"),
      );
      const session = yield* Harness.make(yield* makeAgent({ model })).startSession({
        id,
        sandbox: yield* makeSandbox,
      });

      const result = yield* session.generate({
        prompt: "echo 2, and add 2 and 3",
        toolkit: yield* MathToolkit,
      });

      expect(toolNamesOf(requests[0])).toEqual(["read", "write", "edit", "bash", "Add"]);
      const [, answered] = requests.map(toolResultsOf);
      expect(answered).toHaveLength(2);
      expect(answered).toEqual(expect.arrayContaining([{ exitCode: 0, output: "2\n" }, 5]));
      expect(
        Object.fromEntries(result.toolResults.map((part) => [part.name, part.providerExecuted])),
      ).toEqual({ bash: true, Add: false });
      expect(result.text).toBe("done");
    }).pipe(Effect.provide(MathHandlers)),
  );

  it.effect(
    "offers the host's tools as the host declares them, and gives the model their results",
    () =>
      Effect.gen(function* () {
        const { model, requests } = yield* makeScriptedModel((request) => {
          const [sum] = toolResultsOf(request);
          return typeof sum === "number"
            ? answer(`The sum is ${sum}`)
            : callTool("add-1", "Add", { a: 2, b: 3 });
        });
        const session = yield* Harness.make(yield* makeAgent({ model })).startSession({
          id,
        });

        const result = yield* session.generate({
          prompt: "add 2 and 3",
          toolkit: yield* MathToolkit,
        });

        const offered = requests[0]?.tools ?? [];
        expect(offered.map((tool) => tool.name)).toEqual(["Add"]);
        expect(offered.map(Tool.getDescription)).toEqual(["Adds two numbers."]);
        expect(offered.map((tool) => Tool.getJsonSchema(tool))).toEqual([Tool.getJsonSchema(Add)]);
        // The session streams the result of the host's tool; the agent does not repeat it.
        expect(result.toolResults).toEqual([
          {
            type: "tool-result",
            id: "add-1",
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
    "refuses a host's tool named like one of its own tools, which it has in a sandbox",
    () =>
      Effect.gen(function* () {
        const Read = Tool.make("read", {
          parameters: Schema.Struct({ id: Schema.String }),
          success: Schema.String,
        });
        const NotesToolkit = Toolkit.make(Read);
        const toolkit = yield* Effect.provide(
          NotesToolkit,
          NotesToolkit.toLayer({ read: () => Effect.succeed("a note") }),
        );
        const { model } = yield* makeScriptedModel(() => answer("done"));
        const harness = Harness.make(yield* makeAgent({ model }));
        const inSandbox = yield* harness.startSession({ id, sandbox: yield* makeSandbox });
        const withoutSandbox = yield* harness.startSession({ id });

        const refused = yield* Effect.flip(inSandbox.generate({ prompt: "read", toolkit }));
        const answered = yield* withoutSandbox.generate({ prompt: "read", toolkit });

        expect(refused._tag === "HarnessError" && refused.reason._tag).toBe("UnsupportedError");
        expect(answered.text).toBe("done");
      }),
  );

  it.effect("answers a turn asking for JSON with a last step, without tools, in JSON", () =>
    Effect.gen(function* () {
      const { model, requests } = yield* makeScriptedModel((request) =>
        request.responseFormat.type === "json" ? answer('{"answer":42}') : answer("Let me think"),
      );
      const session = yield* Harness.make(yield* makeAgent({ model })).startSession({
        id,
        sandbox: yield* makeSandbox,
      });

      const result = yield* session.generateObject({
        prompt: "what is the answer",
        schema: Schema.Struct({ answer: Schema.Finite }),
      });

      expect(requests.map((request) => request.responseFormat.type)).toEqual(["text", "json"]);
      expect(requests[1]?.responseFormat).toMatchObject({ objectName: "output" });
      expect(toolNamesOf(requests[1])).toEqual([]);
      expect(rolesOf(requests[1]?.prompt)).toEqual(["user", "assistant"]);
      expect(result.value).toEqual({ answer: 42 });
      expect(result.usage).toEqual({ inputTokens: { total: 20 }, outputTokens: { total: 10 } });
    }),
  );

  it.effect("leaves an answer that does not match the schema for the session to report", () =>
    Effect.gen(function* () {
      const { model } = yield* makeScriptedModel((request) =>
        request.responseFormat.type === "json" ? answer("not JSON") : answer("Let me think"),
      );
      const session = yield* Harness.make(yield* makeAgent({ model })).startSession({ id });

      const error = yield* Effect.flip(
        session.generateObject({
          prompt: "what is the answer",
          schema: Schema.Struct({ answer: Schema.Finite }),
        }),
      );

      expect(error._tag === "HarnessError" && error.reason).toMatchObject({
        _tag: "StructuredOutputError",
        responseText: "not JSON",
      });
    }),
  );

  it.effect("ends the turn with an error part when its model fails, which generate fails on", () =>
    Effect.gen(function* () {
      const failure = AiError.make({
        module: "Scripted",
        method: "streamText",
        reason: new AiError.RateLimitError({}),
      });
      const { model } = yield* makeScriptedModel(() => Stream.fail(failure));
      const session = yield* Harness.make(yield* makeAgent({ model })).startSession({ id });

      const parts = yield* Stream.runCollect(session.stream({ prompt: "hello" }));
      const error = yield* Effect.flip(session.generate({ prompt: "again" }));

      expect(parts).toMatchObject([
        {
          type: "error",
          error: {
            _tag: "AiError",
            module: "Scripted",
            method: "streamText",
            reason: { _tag: "RateLimitError" },
          },
        },
        { type: "finish", reason: "error" },
      ]);
      expect(error._tag === "HarnessError" && error.reason._tag).toBe("TurnFailedError");
    }),
  );

  it.effect("runs a turn on the model it names, and refuses a name it has no model for", () =>
    Effect.gen(function* () {
      const main = yield* makeScriptedModel(() => answer("from main"));
      const fast = yield* makeScriptedModel(() => answer("from fast"));
      const agent = yield* makeAgent({ model: main.model, models: { fast: fast.model } });
      const session = yield* Harness.make(agent).startSession({ id });

      const named = yield* session.generate({ prompt: "hello", model: "fast" });
      const unnamed = yield* session.generate({ prompt: "hello" });
      const unknown = yield* Effect.flip(session.generate({ prompt: "hello", model: "slow" }));
      const inherited = yield* Effect.flip(
        session.generate({ prompt: "hello", model: "toString" }),
      );

      expect([named.text, unnamed.text]).toEqual(["from fast", "from main"]);
      expect(unknown._tag === "HarnessError" && unknown.reason._tag).toBe("UnsupportedError");
      expect(inherited._tag === "HarnessError" && inherited.reason._tag).toBe("UnsupportedError");
    }),
  );

  it.effect("ends a turn after maxSteps steps even while the model calls tools", () =>
    Effect.gen(function* () {
      const { model, requests } = yield* makeScriptedModel((request) =>
        callTool(`bash-${toolResultsOf(request).length}`, "bash", { command: "true" }),
      );
      const session = yield* Harness.make(yield* makeAgent({ model, maxSteps: 2 })).startSession({
        id,
        sandbox: yield* makeSandbox,
      });

      const result = yield* session.generate({ prompt: "keep going" });

      expect(requests).toHaveLength(2);
      expect(result.toolResults).toHaveLength(2);
      expect(result.finishReason).toBe("tool-calls");
    }),
  );

  it.effect("asks with the turn's instructions, then the conversation with its tool calls", () =>
    Effect.gen(function* () {
      const { model, requests } = yield* makeScriptedModel((request) =>
        toolResultsOf(request).length === 0
          ? callTool("write-1", "write", { file_path: "notes.txt", content: "hello" })
          : answer("done"),
      );
      const session = yield* Harness.make(yield* makeAgent({ model })).startSession({
        id,
        sandbox: yield* makeSandbox,
      });

      yield* session.generate({ prompt: "write notes.txt" });
      yield* session.generate({ prompt: "again", instructions: "Answer in one word." });

      expect(rolesOf(requests[0]?.prompt)).toEqual(["user"]);
      expect(rolesOf(requests.at(-1)?.prompt)).toEqual([
        "system",
        "user",
        "assistant",
        "tool",
        "assistant",
        "user",
      ]);
      expect(requests.at(-1)?.prompt.content[0]).toMatchObject({
        role: "system",
        content: "Answer in one word.",
      });
    }),
  );

  it.effect("picks a session up from its own state, with the tool calls of earlier turns", () =>
    Effect.gen(function* () {
      const sandbox = yield* makeSandbox;
      const earlier = yield* makeScriptedModel((request) =>
        toolResultsOf(request).length === 0
          ? callTool("write-1", "write", { file_path: "notes.txt", content: "hello" })
          : answer("done"),
      );
      const session = yield* Harness.make(yield* makeAgent({ model: earlier.model })).startSession({
        id,
        sandbox,
      });
      yield* session.generate({ prompt: "write notes.txt" });
      const state = yield* throughJson(yield* session.detach);

      const later = yield* makeScriptedModel(() => answer("still here"));
      const resumed = yield* Harness.make(yield* makeAgent({ model: later.model })).resumeSession({
        sandbox,
        state,
      });
      yield* resumed.generate({ prompt: "again" });

      expect(rolesOf(later.requests[0]?.prompt)).toEqual([
        "user",
        "assistant",
        "tool",
        "assistant",
        "user",
      ]);
    }),
  );

  it.effect("loads the conversation of a session another agent ran", () =>
    Effect.gen(function* () {
      const { model, requests } = yield* makeScriptedModel(() => answer("hello again"));
      const state: Session.SessionState = {
        id,
        agent: "codex",
        history: Prompt.make([
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
        ]),
        agentState: { thread: "codex's own" },
      };

      const session = yield* Harness.make(yield* makeAgent({ model })).resumeSession({
        state,
      });
      yield* session.generate({ prompt: "again" });

      expect(rolesOf(requests[0]?.prompt)).toEqual(["user", "assistant", "user"]);
    }),
  );

  it.effect("refuses a state it did not write", () =>
    Effect.gen(function* () {
      const { model } = yield* makeScriptedModel(() => answer("unused"));
      const state: Session.SessionState = {
        id,
        agent: "amends",
        history: Prompt.empty,
        agentState: { conversation: "not a conversation" },
      };

      const error = yield* Effect.flip(
        Harness.make(yield* makeAgent({ model })).resumeSession({ state }),
      );

      expect(error.reason._tag).toBe("InvalidOutputError");
    }),
  );

  it.effect("continues a turn that suspend cut short after the steps it finished", () =>
    Effect.gen(function* () {
      const sandbox = yield* makeSandbox;
      /** Done once the turn's second step is running, which suspend then cuts short. */
      const secondStep = yield* Deferred.make<void>();
      const { model, requests } = yield* makeScriptedModel((request) => {
        if (toolResultsOf(request).length === 0) {
          return callTool("log-1", "bash", { command: "echo ran >> log.txt" });
        }
        return untilSuspended(secondStep, answer("logged"));
      });
      const harness = Harness.make(yield* makeAgent({ model }));
      const session = yield* harness.startSession({ id, sandbox });
      const tookFirstStep = yield* Deferred.make<void>();
      const reading = yield* session.stream({ prompt: "log a line" }).pipe(
        Stream.runForEach((part) =>
          part.type === "finish-step" ? Deferred.succeed(tookFirstStep, undefined) : Effect.void,
        ),
        Effect.forkChild,
      );
      yield* Deferred.await(tookFirstStep);
      yield* Deferred.await(secondStep);
      const state = yield* throughJson(yield* session.suspend);
      yield* Fiber.join(reading);

      const resumed = yield* harness.resumeSession({ sandbox, state });
      const continued = yield* Stream.runCollect(resumed.continue({}));

      // The first step ran once; only the step in flight ran again.
      expect(requests.map((request) => toolResultsOf(request).length)).toEqual([0, 1, 1]);
      expect(rolesOf(requests[2]?.prompt)).toEqual(["user", "assistant", "tool"]);
      expect(yield* readSessionFile(sandbox, "log.txt")).toBe("ran\n");
      expect(new GenerateResult.GenerateResult(continued).text).toBe("logged");
      expect(rolesOf((yield* resumed.detach).history)).toEqual([
        "user",
        "assistant",
        "tool",
        "assistant",
      ]);
    }),
  );

  it.effect(
    "continues after the steps the session has, though the turn finished more before suspend",
    () =>
      Effect.gen(function* () {
        const sandbox = yield* makeSandbox;
        /** Done once the turn's third step is running, which suspend then cuts short. */
        const thirdStep = yield* Deferred.make<void>();
        const { model, requests } = yield* makeScriptedModel((request) => {
          const ran = toolResultsOf(request).length;
          if (ran < 2) {
            return callTool(`log-${ran + 1}`, "bash", { command: `echo ${ran + 1} >> log.txt` });
          }
          return untilSuspended(thirdStep, answer("logged"));
        });
        const harness = Harness.make(yield* makeAgent({ model }));
        const session = yield* harness.startSession({ id, sandbox });
        // The caller takes the first step and then waits, while the agent goes on without it.
        const tookFirstStep = yield* Deferred.make<void>();
        const suspended = yield* Deferred.make<void>();
        const reading = yield* session.stream({ prompt: "log two lines" }).pipe(
          Stream.runForEach((part) =>
            part.type === "finish-step"
              ? Effect.andThen(
                  Deferred.succeed(tookFirstStep, undefined),
                  Deferred.await(suspended),
                )
              : Effect.void,
          ),
          Effect.forkChild,
        );
        yield* Deferred.await(tookFirstStep);
        yield* Deferred.await(thirdStep);
        const state = yield* throughJson(yield* session.suspend);
        yield* Deferred.succeed(suspended, undefined);
        yield* Fiber.join(reading);

        const resumed = yield* harness.resumeSession({ sandbox, state });
        yield* Stream.runCollect(resumed.continue({}));

        // The session had the first step only, so the second ran again.
        expect(state.unfinishedTurn?.steps).toHaveLength(1);
        expect(requests.map((request) => toolResultsOf(request).length)).toEqual([0, 1, 2, 1, 2]);
        expect(yield* readSessionFile(sandbox, "log.txt")).toBe("1\n2\n2\n");
        expect(rolesOf((yield* resumed.detach).history)).toEqual([
          "user",
          "assistant",
          "tool",
          "assistant",
          "tool",
          "assistant",
        ]);
      }),
  );

  it.effect("keeps a turn stop aborted in its conversation, as far as its steps went", () =>
    Effect.gen(function* () {
      const sandbox = yield* makeSandbox;
      /** Done once the turn's second step is running, which stop then aborts. */
      const secondStep = yield* Deferred.make<void>();
      const { model } = yield* makeScriptedModel((request) =>
        toolResultsOf(request).length === 0
          ? callTool("log-1", "bash", { command: "echo ran >> log.txt" })
          : untilSuspended(secondStep, answer("unused")),
      );
      const harness = Harness.make(yield* makeAgent({ model }));
      const session = yield* harness.startSession({ id, sandbox });
      const tookFirstStep = yield* Deferred.make<void>();
      const reading = yield* session.stream({ prompt: "log a line" }).pipe(
        Stream.tap((part) =>
          part.type === "finish-step" ? Deferred.succeed(tookFirstStep, undefined) : Effect.void,
        ),
        Stream.runCollect,
        Effect.forkChild,
      );
      yield* Deferred.await(tookFirstStep);
      yield* Deferred.await(secondStep);
      const state = yield* throughJson(yield* session.stop);
      const parts = yield* Fiber.join(reading);

      const later = yield* makeScriptedModel(() => answer("done"));
      const resumed = yield* Harness.make(yield* makeAgent({ model: later.model })).resumeSession({
        sandbox,
        state,
      });
      yield* resumed.generate({ prompt: "what did you do" });

      expect(parts.at(-1)).toMatchObject({ type: "finish", reason: "error" });
      expect(rolesOf(state.history)).toEqual(["user", "assistant", "tool"]);
      expect(rolesOf(later.requests[0]?.prompt)).toEqual(["user", "assistant", "tool", "user"]);
    }),
  );

  it.effect("drops a result the host submitted for no call, before the next turn", () =>
    Effect.gen(function* () {
      const { model } = yield* makeScriptedModel((request) => {
        const [sum] = toolResultsOf(request);
        return typeof sum === "number"
          ? answer(`The sum is ${sum}`)
          : callTool("add-1", "Add", { a: 2, b: 3 });
      });
      const agent = yield* makeAgent({ model });
      const agentSession = yield* agent.start({ id, history: Prompt.empty });
      const resultOf = (sum: number) =>
        agentSession.submitToolResult({ id: "add-1", name: "Add", result: sum, isFailure: false });

      yield* resultOf(99);
      const parts = yield* agentSession
        .prompt({
          prompt: Prompt.makeMessage("user", {
            content: [Prompt.makePart("text", { text: "add 2 and 3" })],
          }),
          tools: [Add],
          responseFormat: { type: "text" },
        })
        .pipe(
          Stream.tap((part) => (part.type === "tool-call" ? resultOf(5) : Effect.void)),
          Stream.runCollect,
        );

      expect(new GenerateResult.GenerateResult(parts).text).toBe("The sum is 5");
    }),
  );

  it.effect("asks for no approvals and does not compact yet", () =>
    Effect.gen(function* () {
      const { model } = yield* makeScriptedModel(() => answer("unused"));
      const session = yield* Harness.make(yield* makeAgent({ model })).startSession({ id });

      const approval = yield* Effect.flip(
        session.approve({ approvalId: "approval-1", approved: true }),
      );
      const compaction = yield* Effect.flip(session.compact());

      expect(approval.reason._tag).toBe("UnsupportedError");
      expect(compaction.reason._tag).toBe("UnsupportedError");
    }),
  );
});
