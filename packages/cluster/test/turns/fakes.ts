import { Integration, Integrations } from "@amends-dev/connection";
import type { AgentQuery } from "@amends-dev/core/agent";
import { Connection } from "@amends-dev/core/connection";
import { Identity } from "@amends-dev/core/identity";
import { Group } from "@amends-dev/core/group";
import { ThreadId, ThreadParticipation } from "@amends-dev/core/thread";
import {
  type SessionLog,
  SessionLogStore,
  type SessionStateStore,
  Turn,
  TurnExecution,
  type TurnJobs,
} from "@amends-dev/core/turn";
import { Member, Workspace } from "@amends-dev/core/workspace";
import { Gateway, GatewayErrors } from "@amends-dev/gateway";
import { type Agent, Harness, type HarnessError, type StreamPart } from "@amends-dev/harness";
import { Array, Context, DateTime, Effect, Layer, Option, Result, Stream } from "effect";
import { Prompt } from "effect/ai";

export const workspaceId = Workspace.Id.make("workspace-1");
export const job: TurnJobs.Job = {
  workspaceId,
  memberId: Member.Id.make("member-planner"),
  threadId: ThreadId.Id.make("thread-1"),
};
export const participationId = ThreadParticipation.Id.make("participation-1");
const at = DateTime.makeUnsafe("2026-10-07T12:00:00.000Z");
export const turn: Turn.Record = {
  id: Turn.Id.make("turn-1"),
  workspaceId,
  groupId: Group.Id.make("group-1"),
  threadId: job.threadId,
  agentId: Identity.AgentId.make("agent-planner"),
  memberId: job.memberId,
  participationId,
  retry: null,
  status: "running",
  acceptedThroughSequence: 3,
  logAfter: 0,
  selection: null,
  messageIds: [],
  failure: null,
  cancelReason: null,
  createdAt: at,
  startedAt: at,
  finishedAt: null,
};

/** A connection the runnable names, on `integration`, taking no key. */
const connectionOn = (integration: string) => ({
  connection: {
    id: Connection.Id.make(`connection-${integration}`),
    integration,
    name: integration,
    settings: {},
    auth: "none" as const,
  },
  credential: null,
});
/** What the agent runs on: its harness on `harnessIntegration`, a model, and no sandbox. */
export const runnableOn = (harnessIntegration: string): AgentQuery.Runnable => ({
  instructions: "Plan each change.",
  harness: connectionOn(harnessIntegration),
  model: {
    ...connectionOn("test-models"),
    model: { connectionId: Connection.Id.make("connection-test-models"), id: "test-model" },
  },
  sandbox: null,
});
export const runnable = runnableOn("test-agent");

/** How the job ended a turn, as the workspace was asked. */
export type Ending =
  | { readonly kind: "close"; readonly reply: string; readonly resume: SessionStateStore.Resume }
  | {
      readonly kind: "fail";
      readonly reason: string;
      readonly resume: SessionStateStore.Resume | undefined;
    }
  | { readonly kind: "stop"; readonly resume: SessionStateStore.Resume | undefined };

export interface FakeWorkspaceOptions {
  /** The turn's prompt, as starting it gives it. */
  readonly prompt?: Prompt.UserMessage;
  /** What the participation's session resumes from, or none for a new one. */
  readonly resume?: SessionStateStore.Resume | null;
  /** What the agent's job is given to run it on. */
  readonly runnable?: AgentQuery.Runnable;
  /** The conversation the agent joined. */
  readonly joined?: ReadonlyArray<Prompt.Message>;
  /** What the session log holds before the run. */
  readonly logged?: ReadonlyArray<SessionLog.Entry>;
  /** Whether work waits for the agent. True by default. */
  readonly workWaits?: boolean;
  /** How many times starting the turn fails first, as when storage is down. None by default. */
  readonly failedStarts?: number;
  /** Whether the workspace was ever created. True by default. */
  readonly created?: boolean;
}

/**
 * A workspace in memory, as the job reaches it through a gateway: one turn of the agent's, which
 * accepting gives while it is active and starting readies, and the participation's session log.
 * It records how the turn ended and the drafts it showed.
 */
export const makeFakeWorkspace = (options: FakeWorkspaceOptions = {}) => {
  const log: Array<SessionLog.Recorded> = (options.logged ?? []).map((entry, index) => ({
    position: index + 1,
    recordedAt: at,
    entry,
  }));
  const endings: Array<Ending> = [];
  const drafts: Array<Turn.Draft> = [];
  let active = options.workWaits ?? true;
  let starts = 0;
  const end = (ending: Ending) =>
    Effect.sync(() => {
      endings.push(ending);
      active = false;
    });
  const turnExecution = TurnExecution.Service.of({
    accept: () => Effect.succeed(active ? Option.some(turn) : Option.none()),
    start: () =>
      ++starts <= (options.failedStarts ?? 0)
        ? Effect.die(new Error("The workspace's storage is down"))
        : Effect.succeed(
            active
              ? TurnExecution.Start.cases.Ready.make({
                  turn,
                  runnable: options.runnable ?? runnable,
                  prompt: options.prompt ?? userMessage("Alice: Planner, summarize the plan."),
                  messages: 1,
                  resume: options.resume ?? null,
                })
              : TurnExecution.Start.cases.Idle.make({}),
          ),
    joinedConversation: () => Effect.succeed(options.joined ?? []),
    showDraft: (_, draft) => Effect.sync(() => void drafts.push(draft)),
    close: (_, { reply, resume }) =>
      Effect.as(
        end({ kind: "close", reply, resume }),
        TurnExecution.Closing.cases.Closed.make({ messageIds: [] }),
      ),
    fail: (_, { reason, resume }) => end({ kind: "fail", reason, resume }),
    confirmStopped: (_, { resume }) => (active ? end({ kind: "stop", resume }) : Effect.void),
  });
  /** Append to the log as another writer, after its latest entry. */
  const appendElsewhere = (entry: SessionLog.Entry) =>
    Effect.sync(() => void log.push({ position: log.length + 1, recordedAt: at, entry }));
  const sessionLogStore = SessionLogStore.Service.of({
    head: () => Effect.sync(() => log.length),
    append: (_, entries, after) =>
      Effect.suspend(() => {
        if (after !== log.length)
          return Effect.fail(
            new SessionLogStore.Conflict({ participationId: String(participationId), after }),
          );
        const recorded = Array.map(entries, (entry, index) => ({
          position: after + index + 1,
          recordedAt: at,
          entry,
        }));
        log.push(...recorded);
        return Effect.succeed(recorded);
      }),
    read: (_, { after, limit }) => Effect.sync(() => log.slice(after, after + limit)),
    waitForAppend: () => Effect.never,
  });
  const services = Context.make(TurnExecution.Service, turnExecution).pipe(
    Context.add(SessionLogStore.Service, sessionLogStore),
  );
  let entered = 0;
  const gateway = Gateway.Service.of({
    createWorkspace: () => Effect.die("The fake workspace is never created"),
    asMember: () => Effect.die("The job runs as no member"),
    inWorkspace: (_, program) =>
      Effect.provideContext(
        Effect.gen(function* () {
          entered += 1;
          if (options.created === false)
            return yield* new GatewayErrors.WorkspaceNotFound({ workspaceId });
          return yield* program;
        }),
        services,
      ) as Effect.Effect<never, never, never>,
  });
  return {
    gateway,
    /** The session log's entries, oldest first. */
    log: () => log.map(({ entry }) => entry),
    endings: () => [...endings],
    /** How many times the job started the turn. */
    starts: () => starts,
    /** How many times a job entered the workspace. */
    entered: () => entered,
    drafts: () => [...drafts],
    appendElsewhere,
  };
};

export type FakeWorkspace = ReturnType<typeof makeFakeWorkspace>;

export interface ScriptedAgent {
  readonly agent: Agent.Agent;
  /** What each `createSession` was given, in order. */
  readonly createdWith: ReadonlyArray<Agent.CreateSessionOptions>;
  /** What each turn was given, in order. */
  readonly turns: ReadonlyArray<Agent.TurnOptions>;
  /** How many finished steps each continued turn was told of, in order. */
  readonly continued: ReadonlyArray<number>;
}

/**
 * An agent in the host's process whose turns stream `script`, and whose state, which releasing
 * a session returns, counts its turns. One that `keepsTurns` has the unfinished turn a session is
 * created with, and continues it with `script`.
 */
export const makeScriptedAgent = (
  script: Stream.Stream<StreamPart.StreamPart, HarnessError.HarnessError>,
  { keepsTurns = false }: { readonly keepsTurns?: boolean } = {},
): ScriptedAgent => {
  const createdWith: Array<Agent.CreateSessionOptions> = [];
  const turns: Array<Agent.TurnOptions> = [];
  const continued: Array<number> = [];
  const agent: Agent.Agent = {
    id: "scripted",
    requiresSandbox: false,
    createSession: (options) =>
      Effect.sync(() => {
        createdWith.push(options);
        return {
          hasUnfinishedTurn: keepsTurns && options.unfinishedTurn !== undefined,
          promptTurn: (options) =>
            Stream.suspend(() => {
              turns.push(options);
              return script;
            }),
          continueTurn: (_, finishedSteps) =>
            Stream.suspend(() => {
              continued.push(finishedSteps);
              return script;
            }),
          submitToolResult: () => Effect.die("The scripted agent calls no host tool"),
          approve: () => Effect.die("The scripted agent asks for no approval"),
          compact: () => Effect.succeed({ type: "compaction", trigger: "manual", summary: "" }),
          suspendTurn: Effect.die("The scripted agent suspends no turn"),
          detach: Effect.sync(() => ({ turns: turns.length })),
          stop: Effect.sync(() => ({ turns: turns.length })),
          destroy: Effect.void,
        };
      }),
  };
  return { agent, createdWith, turns, continued };
};

/** The integrations a host installs for the scripted agent: models, and the agent's harness. */
export const integrationsFor = (agent: Agent.Agent) =>
  Layer.effect(
    Integrations.Integrations,
    Integrations.make([
      Integration.make({
        id: "test-models",
        name: "Test models",
        auth: ["none"],
        models: {
          listed: [],
          unlisted: true,
          endpoint: (_, { model }) =>
            Result.succeed({
              provider: "test-models",
              model,
              protocol: "openai-chat",
              url: "https://models.example",
            }),
        },
        check: () => Effect.succeed({ status: "healthy" }),
      }),
      Integration.make({
        id: "test-agent",
        name: "Test agent",
        auth: ["none"],
        harnesses: { requiresSandbox: false, harness: () => Effect.succeed(Harness.make(agent)) },
        check: () => Effect.succeed({ status: "healthy" }),
      }),
    ]),
  );

const usage = { inputTokens: {}, outputTokens: {} };
/** A step that only calls a tool of the agent's own. */
export const reading: ReadonlyArray<StreamPart.StreamPart> = [
  { type: "tool-call", id: "call-read", name: "read", params: {}, providerExecuted: true },
  {
    type: "tool-result",
    id: "call-read",
    name: "read",
    result: "2 and 3",
    isFailure: false,
    providerExecuted: true,
  },
  { type: "finish-step", reason: "tool-calls", usage },
];
/** A step that writes `deltas`, one text. */
export const writing = (...deltas: ReadonlyArray<string>): ReadonlyArray<StreamPart.StreamPart> => [
  { type: "text-start", id: "answer" },
  ...deltas.map((delta) => ({ type: "text-delta" as const, id: "answer", delta })),
  { type: "text-end", id: "answer" },
  { type: "finish-step", reason: "stop", usage },
];
export const finish: StreamPart.StreamPart = { type: "finish", reason: "stop", usage };

/** A user message with a text part for each of `texts`, as a turn's prompt is. */
export const userMessage = (...texts: ReadonlyArray<string>): Prompt.UserMessage =>
  Prompt.makeMessage("user", { content: texts.map((text) => Prompt.makePart("text", { text })) });
