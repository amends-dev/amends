import type { SessionLog } from "@amends/core/turn";
import { HarnessError, type StreamPart } from "@amends/harness";
import { Gateway } from "@amends/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Option, Stream } from "effect";
import { Prompt } from "effect/ai";
import { TurnRunner } from "../../src/turns/runner.ts";
import { SessionLogWriter } from "../../src/turns/session-log-writer.ts";
import {
  type FakeWorkspace,
  type FakeWorkspaceOptions,
  finish,
  integrationsFor,
  job,
  makeFakeWorkspace,
  makeScriptedAgent,
  participationId,
  reading,
  runnableOn,
  turn,
  writing,
} from "./fakes.ts";

type Script = Stream.Stream<StreamPart.StreamPart, HarnessError.HarnessError>;

/**
 * The job's turn runner over a workspace in memory, whose agent's turns stream `script`, which
 * may reach into the workspace, with the workspace and the agent to look into.
 */
const runnerFor = (
  script: Script | ((workspace: FakeWorkspace) => Script),
  options: FakeWorkspaceOptions = {},
  agentOptions: Parameters<typeof makeScriptedAgent>[1] = {},
) =>
  Effect.gen(function* () {
    const workspace = makeFakeWorkspace(options);
    const scripted = makeScriptedAgent(
      typeof script === "function" ? script(workspace) : script,
      agentOptions,
    );
    const services = Layer.merge(
      Layer.succeed(Gateway.Service, workspace.gateway),
      integrationsFor(scripted.agent),
    );
    const turnRunner = yield* TurnRunner.make(job);
    return {
      workspace,
      scripted,
      runNextTurn: Effect.provide(turnRunner.runNextTurn, services),
      stopTurn: (turnId: typeof turn.id) => Effect.provide(turnRunner.stopTurn(turnId), services),
    };
  });

const userTexts = (message: Prompt.Message) =>
  typeof message.content === "string"
    ? [message.content]
    : message.content.flatMap((part) => (part.type === "text" ? [part.text] : []));

/** How a logged step ended. */
const stepEnd: StreamPart.FinishStepPart = {
  type: "finish-step",
  reason: "stop",
  usage: { inputTokens: {}, outputTokens: {} },
};

describe("a turn's run", () => {
  it.effect(
    "logs the conversation joined, the prompt, and each step, shows drafts, and closes with the answer",
    () =>
      Effect.gen(function* () {
        const { workspace, scripted, runNextTurn } = yield* runnerFor(
          Stream.fromIterable([...reading, ...writing("The plan ", "is ", "on track."), finish]),
          { joined: [{ role: "user", texts: ["Kai: We need a plan."] }] },
        );

        expect(yield* runNextTurn).toEqual(Option.some(turn.id));
        // The session starts anew, named after the participation, with the conversation joined.
        expect(scripted.createdWith).toHaveLength(1);
        expect(scripted.createdWith[0]?.id).toBe(participationId);
        expect(scripted.createdWith[0]?.history.content.map(userTexts)).toEqual([
          ["Kai: We need a plan."],
        ]);
        expect(
          scripted.turns.map(({ prompt, instructions }) => [userTexts(prompt), instructions]),
        ).toEqual([[["Alice: Planner, summarize the plan."], "Plan each change."]]);
        // The turn starts with the agent's first part, as the agent announces no start.
        expect(workspace.log().map(({ _tag }) => _tag)).toEqual([
          "Joined",
          "Prompted",
          "Started",
          "Step",
          "Step",
        ]);
        expect(workspace.log()[2]).toEqual({ _tag: "Started", turnId: turn.id, agent: "scripted" });
        // Steps are named after the run's opening position in the log, as their drafts are.
        expect(
          workspace.log().flatMap((entry) => (entry._tag === "Step" ? [entry.id] : [])),
        ).toEqual(["2.0", "2.1"]);
        // The first text arrives at once, and the rest once the text ends.
        expect(workspace.drafts()).toEqual([
          { responseId: "2.1", part: 0, offset: 0, text: "The plan " },
          { responseId: "2.1", part: 0, offset: 9, text: "is on track." },
        ]);
        expect(workspace.endings()).toEqual([
          {
            kind: "close",
            reply: "The plan is on track.",
            resume: { agent: "scripted", agentState: { turns: 1 } },
          },
        ]);
        // Its work done, the job finds none.
        expect(yield* runNextTurn).toEqual(Option.none());
      }),
  );

  it.effect(
    "resumes a session from what it was left as, with the conversation its log records",
    () =>
      Effect.gen(function* () {
        const earlier = "turn-0" as typeof turn.id;
        const { scripted, runNextTurn } = yield* runnerFor(
          Stream.fromIterable([...writing("Done."), finish]),
          {
            resume: { agent: "scripted", agentState: { turns: 4 } },
            logged: [
              { _tag: "Prompted", turnId: earlier, texts: ["Alice: Hello."], messages: 1 },
              {
                _tag: "Step",
                turnId: earlier,
                id: "1.0",
                step: { parts: [{ type: "text", text: "Hi." }] },
              },
            ],
          },
        );
        yield* runNextTurn;
        expect(scripted.createdWith[0]?.agentState).toEqual({ turns: 4 });
        expect(scripted.createdWith[0]?.history.content.map(({ role }) => role)).toEqual([
          "user",
          "assistant",
        ]);
      }),
  );

  it.effect("runs a turn cut short again from the prompt its log has, noting the run stopped", () =>
    Effect.gen(function* () {
      const { workspace, scripted, runNextTurn } = yield* runnerFor(
        Stream.fromIterable([...writing("Again."), finish]),
        {
          prompt: ["Alice: A prompt read again."],
          logged: [
            { _tag: "Prompted", turnId: turn.id, texts: ["Alice: The prompt told."], messages: 1 },
            {
              _tag: "Step",
              turnId: turn.id,
              id: "1.0",
              step: { parts: [{ type: "text", text: "Half" }] },
            },
          ],
        },
      );
      yield* runNextTurn;
      expect(scripted.turns.map(({ prompt }) => userTexts(prompt))).toEqual([
        ["Alice: The prompt told."],
      ]);
      // The session starts without the turn, which its prompt brings.
      expect(scripted.createdWith[0]?.history).toEqual(Prompt.empty);
      expect(scripted.createdWith[0]?.unfinishedTurn).toBeUndefined();
      expect(workspace.log().map(({ _tag }) => _tag)).toEqual([
        "Prompted",
        "Step",
        "Interrupted",
        "Started",
        "Step",
      ]);
      expect(workspace.endings()).toMatchObject([{ kind: "close", reply: "Again." }]);
    }),
  );

  it.effect("notes the turn's start with what continues it, as the agent announces it", () =>
    Effect.gen(function* () {
      const { workspace, runNextTurn } = yield* runnerFor(
        Stream.fromIterable<StreamPart.StreamPart>([
          { type: "turn-start", agentState: { turn: "turn-a" } },
          ...writing("Done."),
          finish,
        ]),
      );
      yield* runNextTurn;
      expect(workspace.log().map(({ _tag }) => _tag)).toEqual(["Prompted", "Started", "Step"]);
      expect(workspace.log()[1]).toEqual({
        _tag: "Started",
        turnId: turn.id,
        agent: "scripted",
        agentState: { turn: "turn-a" },
      });
      expect(workspace.endings()).toMatchObject([{ kind: "close", reply: "Done." }]);
    }),
  );

  /** A log in which a run of the turn, on an agent that keeps the turn, stopped short of its end. */
  const cutShort: ReadonlyArray<SessionLog.Entry> = [
    { _tag: "Prompted", turnId: turn.id, texts: ["Alice: The prompt told."], messages: 1 },
    { _tag: "Started", turnId: turn.id, agent: "scripted", agentState: { turn: "turn-a" } },
    {
      _tag: "Step",
      turnId: turn.id,
      id: "1.0",
      step: { parts: [{ type: "text", text: "Half" }], finish: stepEnd },
    },
  ];

  it.effect(
    "continues a turn cut short on the agent that kept it, after the steps its log has",
    () =>
      Effect.gen(function* () {
        const { workspace, scripted, runNextTurn } = yield* runnerFor(
          Stream.fromIterable([...writing("Rest."), finish]),
          { logged: cutShort, resume: { agent: "scripted", agentState: { turns: 3 } } },
          { keepsTurns: true },
        );
        yield* runNextTurn;
        // The session resumes with the turn as the agent kept it, in place of what the turn before
        // left, and the agent continues it after the step the log has.
        expect(scripted.createdWith[0]).toMatchObject({
          history: Prompt.empty,
          unfinishedTurn: { turn: "turn-a" },
        });
        expect(scripted.createdWith[0]?.agentState).toBeUndefined();
        expect(scripted.turns).toEqual([]);
        expect(scripted.continued).toEqual([1]);
        expect(workspace.log().map(({ _tag }) => _tag)).toEqual([
          "Prompted",
          "Started",
          "Step",
          "Interrupted",
          "Step",
        ]);
        expect(workspace.endings()).toMatchObject([{ kind: "close", reply: "Rest." }]);
      }),
  );

  it.effect("replies with what a continued turn answered before, when it adds nothing", () =>
    Effect.gen(function* () {
      const { workspace, runNextTurn } = yield* runnerFor(
        Stream.fromIterable([finish]),
        { logged: cutShort },
        { keepsTurns: true },
      );
      yield* runNextTurn;
      expect(workspace.log().map(({ _tag }) => _tag)).toEqual([
        "Prompted",
        "Started",
        "Step",
        "Interrupted",
      ]);
      expect(workspace.endings()).toMatchObject([{ kind: "close", reply: "Half" }]);
    }),
  );

  it.effect("runs a turn cut short again from its prompt, when the agent lost it", () =>
    Effect.gen(function* () {
      const { workspace, scripted, runNextTurn } = yield* runnerFor(
        Stream.fromIterable<StreamPart.StreamPart>([
          { type: "turn-start", agentState: { turn: "turn-b" } },
          ...writing("Again."),
          finish,
        ]),
        { logged: cutShort },
      );
      yield* runNextTurn;
      expect(scripted.createdWith[0]?.unfinishedTurn).toEqual({ turn: "turn-a" });
      expect(scripted.turns.map(({ prompt }) => userTexts(prompt))).toEqual([
        ["Alice: The prompt told."],
      ]);
      expect(workspace.log().map(({ _tag }) => _tag)).toEqual([
        "Prompted",
        "Started",
        "Step",
        "Interrupted",
        "Started",
        "Step",
      ]);
      expect(workspace.log()[4]).toMatchObject({ agentState: { turn: "turn-b" } });
      expect(workspace.endings()).toMatchObject([{ kind: "close", reply: "Again." }]);
    }),
  );

  it.effect("fails a turn the agent reported failed, keeping what it did", () =>
    Effect.gen(function* () {
      const { workspace, runNextTurn } = yield* runnerFor(
        Stream.fromIterable<StreamPart.StreamPart>([
          { type: "text-start", id: "answer" },
          { type: "text-delta", id: "answer", delta: "Reading" },
          { type: "error", error: { message: "The model is overloaded." } },
          { type: "finish", reason: "error", usage: { inputTokens: {}, outputTokens: {} } },
        ]),
      );
      yield* runNextTurn;
      expect(workspace.log().map(({ _tag }) => _tag)).toEqual(["Prompted", "Started", "Step"]);
      expect(workspace.endings()).toEqual([
        {
          kind: "fail",
          reason: "The model is overloaded.",
          resume: { agent: "scripted", agentState: { turns: 1 } },
        },
      ]);
    }),
  );

  it.effect(
    "fails a turn whose harness fails, and one the agent cannot run on what it is given",
    () =>
      Effect.gen(function* () {
        const failing = yield* runnerFor(
          Stream.fail(
            new HarnessError.HarnessError({
              agent: "scripted",
              reason: new HarnessError.UnavailableError({ description: "The agent went away." }),
            }),
          ),
        );
        yield* failing.runNextTurn;
        expect(failing.workspace.endings()).toEqual([
          {
            kind: "fail",
            reason: "scripted: The agent went away.",
            resume: { agent: "scripted", agentState: { turns: 1 } },
          },
        ]);

        const unrunnable = yield* runnerFor(Stream.empty, {
          runnable: runnableOn("missing"),
        });
        yield* unrunnable.runNextTurn;
        expect(unrunnable.workspace.endings()).toEqual([
          {
            kind: "fail",
            reason: "missing: No integration is installed as missing",
            resume: undefined,
          },
        ]);
      }),
  );

  it.effect("stops the turn it runs when asked, logging the step it left unfinished", () =>
    Effect.gen(function* () {
      const { workspace, runNextTurn, stopTurn } = yield* runnerFor(
        Stream.concat(
          Stream.fromIterable<StreamPart.StreamPart>([
            { type: "text-start", id: "answer" },
            { type: "text-delta", id: "answer", delta: "Halfway" },
          ]),
          Stream.never,
        ),
      );
      const running = yield* Effect.forkChild(runNextTurn);
      // Waiting for the step's first draft, the run is streaming the turn.
      while (workspace.drafts().length === 0) yield* Effect.yieldNow;
      yield* stopTurn(turn.id);
      expect(yield* Fiber.join(running)).toEqual(Option.some(turn.id));
      expect(workspace.log().at(-1)).toMatchObject({
        _tag: "Step",
        step: { parts: [{ type: "text", text: "Halfway" }] },
      });
      expect(workspace.endings()).toEqual([
        { kind: "stop", resume: { agent: "scripted", agentState: { turns: 1 } } },
      ]);
    }),
  );

  it.effect("stops a turn no run holds as it stands", () =>
    Effect.gen(function* () {
      const { workspace, stopTurn } = yield* runnerFor(Stream.empty);
      yield* stopTurn(turn.id);
      expect(workspace.endings()).toEqual([{ kind: "stop", resume: undefined }]);
    }),
  );

  it.effect("a run another run replaced writes nothing more and leaves the turn to it", () =>
    Effect.gen(function* () {
      const { workspace, runNextTurn } = yield* runnerFor((workspace) =>
        Stream.concat(
          // Another run of the turn writes to the log first.
          Stream.drain(
            Stream.fromEffect(
              workspace.appendElsewhere({
                _tag: "Interrupted",
                turnId: turn.id,
                reason: "Its run stopped short.",
              }),
            ),
          ),
          Stream.fromIterable([...writing("Mine."), finish]),
        ),
      );
      expect(yield* runNextTurn).toEqual(Option.some(turn.id));
      expect(workspace.log().map(({ _tag }) => _tag)).toEqual(["Prompted", "Interrupted"]);
      expect(workspace.endings()).toEqual([]);
    }),
  );

  it.effect("does nothing while no work waits", () =>
    Effect.gen(function* () {
      const { workspace, scripted, runNextTurn } = yield* runnerFor(Stream.empty, {
        workWaits: false,
      });
      expect(yield* runNextTurn).toEqual(Option.none());
      expect(scripted.createdWith).toEqual([]);
      expect(workspace.log()).toEqual([]);
    }),
  );
});

describe("opening a session log for a run", () => {
  const ready = {
    _tag: "Ready",
    turn,
    prompt: ["Alice: Go."],
    messages: 1,
    resume: null,
  } as unknown as SessionLogWriter.Ready;

  it("starts a new log with the conversation joined, and leaves it out when there is none", () => {
    const opening = SessionLogWriter.openingOf([], ready, []);
    expect(opening.entries.map(({ _tag }) => _tag)).toEqual(["Prompted"]);
    expect(opening.resumeFrom).toBeUndefined();
    expect(
      SessionLogWriter.openingOf([], ready, [{ role: "user", texts: ["Kai: Hi."] }]).entries.map(
        ({ _tag }) => _tag,
      ),
    ).toEqual(["Joined", "Prompted"]);
  });

  it("resumes a turn cut short as the agent that started it last keeps it, with its steps", () => {
    const step = (id: string, text: string): SessionLog.Entry => ({
      _tag: "Step",
      turnId: turn.id,
      id,
      step: { parts: [{ type: "text", text }], finish: stepEnd },
    });
    const opening = SessionLogWriter.openingOf(
      [
        { _tag: "Prompted", turnId: turn.id, texts: ["Alice: Go."], messages: 1 },
        { _tag: "Started", turnId: turn.id, agent: "codex", agentState: { turn: "turn-a" } },
        step("1.0", "First"),
        { _tag: "Interrupted", turnId: turn.id, reason: "Its run stopped short." },
        { _tag: "Started", turnId: turn.id, agent: "opencode", agentState: { turn: "turn-b" } },
        step("4.0", "Second"),
      ],
      { ...ready, resume: { agent: "codex", agentState: { turns: 2 } } },
      [],
    );

    expect(opening.entries.map(({ _tag }) => _tag)).toEqual(["Interrupted"]);
    expect(opening.resumeFrom).toEqual({
      id: participationId,
      agent: "opencode",
      history: Prompt.empty,
      unfinishedTurn: {
        prompt: Prompt.makeMessage("user", {
          content: [Prompt.makePart("text", { text: "Alice: Go." })],
        }),
        steps: [{ parts: [{ type: "text", text: "Second" }], finish: stepEnd }],
        agentState: { turn: "turn-b" },
      },
    });
  });

  it("resumes a turn cut short from what the turn before left, when no agent keeps it", () => {
    const opening = SessionLogWriter.openingOf(
      [
        { _tag: "Prompted", turnId: turn.id, texts: ["Alice: Go."], messages: 1 },
        { _tag: "Started", turnId: turn.id, agent: "amends" },
      ],
      { ...ready, resume: { agent: "amends", agentState: { turns: 2 } } },
      [],
    );

    expect(opening.resumeFrom).toEqual({
      id: participationId,
      agent: "amends",
      agentState: { turns: 2 },
      history: Prompt.empty,
    });
  });
});

describe("drafts of a step", () => {
  it("hold what each text part wrote past what readers were shown", () => {
    expect(
      TurnRunner.newDrafts(
        "2.1",
        {
          parts: [
            { type: "reasoning", text: "Thinking." },
            { type: "text", text: "The plan is" },
            { type: "text", text: "" },
          ],
        },
        new Map([[1, 4]]),
      ),
    ).toEqual([{ responseId: "2.1", part: 1, offset: 4, text: "plan is" }]);
  });
});
