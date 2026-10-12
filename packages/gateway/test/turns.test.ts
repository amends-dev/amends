import type * as Core from "@amends-dev/core";
import { AgentService } from "@amends-dev/core/agent";
import { BuiltinRoles } from "@amends-dev/core/authorization";
import { ChannelIntake, ChannelService } from "@amends-dev/core/channel";
import { ConnectionService } from "@amends-dev/core/connection";
import { Group, GroupService, GroupMembershipService } from "@amends-dev/core/group";
import { Actor, Identity } from "@amends-dev/core/identity";
import { Notification } from "@amends-dev/core/notification";
import { TaskService } from "@amends-dev/core/task";
import {
  Thread,
  ThreadService,
  type ThreadMessage,
  ThreadMessageService,
  ThreadParticipationService,
  type ThreadTimeline,
  ThreadParticipation,
} from "@amends-dev/core/thread";
import {
  type SessionLog,
  type SessionStateStore,
  Turn,
  TurnExecution,
  TurnService,
} from "@amends-dev/core/turn";
import type { Member, Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import type { StreamPart } from "@amends-dev/harness";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Queue, Redacted, Stream } from "effect";
import type { Prompt } from "effect/ai";
import { withStorage } from "./fixture.ts";
import * as Operations from "./operations.ts";
import * as Support from "./support.ts";
import {
  alice,
  bob,
  boundTo,
  future,
  goodKey,
  placedIn,
  request,
  takeTurnJobs,
} from "./support.ts";

const as = <A, E, R extends Core.Operations | Actor.Actor>(
  id: Workspace.Id,
  identity: Identity.MemberReference,
  program: Effect.Effect<A, E, R>,
) => Effect.flatMap(Gateway.Gateway, (gateway) => gateway.asMember(id, identity, program));
/** Run a step of turn execution in the workspace, as a turn's job does. */
const execute = <A, E>(
  id: Workspace.Id,
  step: (turnExecution: TurnExecution.TurnExecution["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    Effect.scoped(gateway.inWorkspace(id, Effect.flatMap(TurnExecution.TurnExecution, step))),
  );
const timelineOf = (id: Workspace.Id, threadId: Turn.Turn["threadId"]) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      threadService.readTimeline(threadId, { limit: 50 }),
    ),
  );
/** The turn as stored now. */
const turnOf = (id: Workspace.Id, turnId: Turn.Id) =>
  Effect.flatMap(boundTo(id), (bound) => Effect.map(bound.turns.get(turnId), Option.getOrThrow));
/** Append to the participation's session log after its latest entry, as a turn's job does. */
const appendToLog = (
  id: Workspace.Id,
  participationId: Turn.Turn["participationId"],
  entries: readonly [SessionLog.Entry, ...Array<SessionLog.Entry>],
) =>
  Effect.flatMap(boundTo(id), (bound) =>
    Effect.flatMap(bound.sessionLogs.head(participationId), (head) =>
      bound.sessionLogs.append(participationId, entries, head),
    ),
  );
/** Log the prompt a turn started with, as its job does before running it. */
const logPrompt = (id: Workspace.Id, ready: Ready) =>
  appendToLog(id, ready.turn.participationId, [
    { _tag: "Prompted", turnId: ready.turn.id, prompt: ready.prompt, messages: ready.messages },
  ]);
/** Log a step the turn took, as its job does while running it. */
const logStep = (id: Workspace.Id, turn: Turn.Turn, stepId: string, step: StreamPart.Step) =>
  appendToLog(id, turn.participationId, [{ _tag: "Step", turnId: turn.id, id: stepId, step }]);
/**
 * Follow a turn's log, as alice unless another reader is named, for the enclosing scope: each
 * message as it arrives, and whether the stream has finished or failed as unavailable.
 */
const followLog = (id: Workspace.Id, turnId: Turn.Id, reader: Identity.MemberReference = alice) =>
  Effect.gen(function* () {
    const gateway = yield* Gateway.Gateway;
    const stream = yield* gateway.asMember(
      id,
      reader,
      Effect.flatMap(TurnService.TurnService, (turnService) => turnService.watchLog(turnId)),
    );
    const queue = yield* Queue.unbounded<Turn.LogMessage | "done" | "unavailable">();
    yield* stream.pipe(
      Stream.runForEach((message) => Queue.offer(queue, message)),
      Effect.andThen(Queue.offer(queue, "done")),
      Effect.catchTag("CoreError.Unavailable", () => Queue.offer(queue, "unavailable")),
      Effect.forkScoped,
    );
    return Queue.take(queue).pipe(Effect.timeout("10 seconds"));
  });
/** A log message in brief: its kind, and the items or text it carries. */
const brief = (message: Turn.LogMessage | "done" | "unavailable") => {
  if (message === "done" || message === "unavailable") return message;
  return Turn.LogMessage.match(message, {
    Opened: (message) => `opened ${message.items.map((item) => item._tag).join(",")}`,
    Changed: (message) =>
      `changed ${message.changes
        .map(({ index, item }) =>
          Turn.LogItem.isAnyOf(["Responded"])(item)
            ? `${index}:${item.text}${item.reply ? " (reply)" : ""}`
            : `${index}:${item._tag}`,
        )
        .join(",")}`,
    Drafted: (message) => `drafted ${message.text}`,
    Ended: () => "ended",
  });
};

/** A timeline item in brief: a message's text, or a turn's change. */
const told = (item: ThreadTimeline.Item) => {
  if ("message" in item)
    return `message: ${item.message.content._tag === "Text" ? item.message.content.text : "(deleted)"}`;
  const activity = item.activity;
  switch (activity.kind) {
    case "turn.created":
      return `created ${activity.details.turnId}${activity.details.retryOf === null ? "" : ` retrying ${activity.details.retryOf}`}`;
    case "turn.started":
      return `started ${activity.details.turnId}`;
    case "turn.stopping":
      return `stopping ${activity.details.turnId} ${activity.details.cancelReason}`;
    case "turn.ended": {
      const details = activity.details;
      const why = details.reason ?? details.cancelReason;
      return `ended ${details.turnId} ${details.outcome}${why === null ? "" : ` ${why}`}${details.messageIds.length === 0 ? "" : ` replying ${details.messageIds.join(",")}`}`;
    }
    default:
      return activity.kind;
  }
};

const usage = { inputTokens: {}, outputTokens: {} };
/** A step that only reads the notes. */
const reading: StreamPart.Step = {
  parts: [{ type: "tool-call", id: "call-read", name: "read", params: {}, providerExecuted: true }],
  finish: { type: "finish-step", reason: "tool-calls", usage },
};
/** A step that answers with `text`. */
const answering = (text: string): StreamPart.Step => ({
  parts: [{ type: "text", text }],
  finish: { type: "finish-step", reason: "stop", usage },
});
/** What a harness session resumes from, as a turn's job hands it back when the turn ends. */
const resume: SessionStateStore.Resume = { agent: "test-in-process", agentState: { turns: 1 } };

/**
 * A workspace owned by alice, named Alice there, with an agent, Planner, that works in the host's
 * process on a model connection with a good key.
 */
const workspaceWithAgent = Effect.gen(function* () {
  const workspace = yield* Operations.createWorkspace(alice.id, "Alice");
  const connect = (
    input: Parameters<ConnectionService.ConnectionService["Service"]["create"]>[0],
  ) =>
    as(
      workspace.id,
      alice,
      Effect.flatMap(ConnectionService.ConnectionService, (connectionService) =>
        connectionService.create(input),
      ),
    );
  const models = yield* connect({
    integration: "test-models",
    name: "Models",
    settings: { endpoint: "https://models.example" },
    auth: "apiKey",
    apiKey: Redacted.make(goodKey),
  });
  const inProcess = yield* connect({
    integration: "test-in-process",
    name: "In-process harness",
    settings: {},
    auth: "none",
  });
  const agent = yield* as(
    workspace.id,
    alice,
    Effect.flatMap(AgentService.AgentService, (agentService) =>
      agentService.create({
        name: "Planner",
        roleId: BuiltinRoles.MemberId,
        instructions: "Plan each change.",
        harness: { _tag: "Connection", connectionId: inProcess.id },
        model: { connectionId: models.id, id: "test-model" },
        sandbox: null,
      }),
    ),
  );
  const identity = Identity.MemberReference.cases.Agent.make({ id: agent.id });
  const selection = {
    harness: { connectionId: inProcess.id },
    model: { connectionId: models.id, id: "test-model" },
    sandbox: null,
  };
  return { workspace, agent, identity, selection, models };
});
/** Bob joins the workspace as an ordinary member, and so its general group. */
const joinAsBob = (id: Workspace.Id) =>
  Effect.gen(function* () {
    const invitation = yield* Operations.invite(id, alice, request(yield* future));
    return yield* Operations.acceptInvitation(id, bob.id, invitation.details.id);
  });
/** Alice revokes every role the member holds, leaving their memberships as they are. */
const revokeRoles = (id: Workspace.Id, memberId: Member.Id) =>
  Effect.gen(function* () {
    const access = yield* Operations.access(id, alice, memberId);
    for (const assignment of access.assignments)
      yield* Operations.revokeAssignment(id, alice, memberId, assignment.id);
  });
/** A post's result with the activity that placed its message, read through the workspace's stores. */
const withPlace = <A extends { readonly message: ThreadMessage.ThreadMessage }>(
  id: Workspace.Id,
  result: A,
) => Effect.flatMap(boundTo(id), (bound) => placedIn(bound)(result));
const start = (id: Workspace.Id, text: string, mentions: ReadonlyArray<Member.Id>) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      threadService.startInGroup({ groupId: Group.GeneralId, text, mentions: [...mentions] }),
    ),
  ).pipe(Effect.flatMap((started) => withPlace(id, started)));
const reply = (
  id: Workspace.Id,
  threadId: Turn.Turn["threadId"],
  text: string,
  mentions: ReadonlyArray<Member.Id> = [],
) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
      threadMessageService.publish({ threadId, text, mentions: [...mentions] }),
    ),
  ).pipe(Effect.flatMap((message) => withPlace(id, { message })));
/** The agent stops taking part in the thread. */
const unfollow = (
  id: Workspace.Id,
  identity: Identity.MemberReference,
  memberId: Member.Id,
  threadId: Turn.Turn["threadId"],
) =>
  Effect.gen(function* () {
    const participants = yield* as(
      id,
      identity,
      Effect.flatMap(ThreadService.ThreadService, (threadService) =>
        threadService.listParticipants(threadId, { limit: 10 }),
      ),
    );
    const mine = participants.find(
      (participant) =>
        ThreadParticipation.Reference.isAnyOf(["Member"])(participant.participant) &&
        participant.participant.memberId === memberId,
    );
    yield* as(
      id,
      identity,
      Effect.flatMap(
        ThreadParticipationService.ThreadParticipationService,
        (threadParticipationService) =>
          threadParticipationService.unfollow({ threadId, participationId: mine!.id }),
      ),
    );
  });
/**
 * A channel over the test channels into the general group, which opens tasks, and what the contact
 * Dana Customer sends through it: each message received as the system's event.
 */
const channelInto = (id: Workspace.Id) =>
  Effect.gen(function* () {
    const connection = yield* as(
      id,
      alice,
      Effect.flatMap(ConnectionService.ConnectionService, (connectionService) =>
        connectionService.create({
          integration: "test-channels",
          name: "Support desk",
          settings: {},
          auth: "none",
        }),
      ),
    );
    const channel = yield* as(
      id,
      alice,
      Effect.flatMap(ChannelService.ChannelService, (channelService) =>
        channelService.create({
          connectionId: connection.id,
          groupId: Group.GeneralId,
          name: "Support",
          opensTasks: true,
        }),
      ),
    );
    const receive = (messageId: string, text: string) =>
      Effect.flatMap(Gateway.Gateway, (gateway) =>
        Effect.scoped(
          gateway.inWorkspace(
            id,
            Effect.flatMap(ChannelIntake.ChannelIntake, (channelIntake) =>
              channelIntake.receive(channel.id, {
                headers: {},
                body: JSON.stringify({
                  events: [
                    {
                      _tag: "MessageReceived",
                      conversation: { id: "conv-1", details: { room: "C1" } },
                      messageId,
                      sender: { id: "U1", name: "Dana Customer" },
                      text,
                      receivedAt: "2026-10-10T12:00:00.000Z",
                    },
                  ],
                }),
              }),
            ),
          ),
        ),
      );
    return { channel, receive };
  });
type Ready = Extract<TurnExecution.Start, { readonly _tag: "Ready" }>;
/** Nothing for a turn job to run. */
const idle = TurnExecution.Start.cases.Idle.make({});
/**
 * Run the agent's job in the thread as far as core takes it: accept its work into a turn and start
 * the turn, or nothing when no work waits.
 */
const runJob = (id: Workspace.Id, memberId: Member.Id, threadId: Turn.Turn["threadId"]) =>
  execute(id, (turnExecution) =>
    Effect.flatMap(turnExecution.accept(memberId, threadId), (accepted) =>
      Option.match(accepted, {
        onNone: () => Effect.succeed(idle),
        onSome: (turn) => turnExecution.start(turn.id),
      }),
    ),
  );
/** Run the agent's job in the thread, as its turn job does, expecting a turn ready to run. */
const startReady = (id: Workspace.Id, memberId: Member.Id, threadId: Turn.Turn["threadId"]) =>
  runJob(id, memberId, threadId).pipe(
    Effect.filterOrElse(
      (started): started is Ready => started._tag === "Ready",
      (started) => Effect.die(`Expected a turn ready to run, not ${started._tag}`),
    ),
  );
/** The texts of a message the agent is told, its parts' in order. */
const textsOf = (message: Prompt.Message) =>
  typeof message.content === "string"
    ? [message.content]
    : message.content.flatMap((part) => (part.type === "text" ? [part.text] : []));
/**
 * The conversation the turn's agent joined, as its job reads it for a new session log: each
 * message's role and texts.
 */
const joinedOf = (id: Workspace.Id, turnId: Turn.Id) =>
  Effect.map(
    execute(id, (turnExecution) => turnExecution.joinedConversation(turnId)),
    (conversation) =>
      conversation.map((message) => ({ role: message.role, texts: textsOf(message) })),
  );

const { runGateway } = Support;
describe("turns", () => {
  it.effect(
    "an agent accepts the work asked of it into a turn, which starts on its setup with the thread's prompt",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent, identity, selection, models } = yield* workspaceWithAgent;
            const started = yield* start(workspace.id, "Planner, summarize the plan.", [
              agent.memberId,
            ]);
            const threadId = started.thread.id;
            const bound = yield* boundTo(workspace.id);
            const recipient = Notification.ofMember(agent.memberId, identity);
            const [asked] = yield* bound.notifications.listPendingByRecipient(recipient, {
              limit: 10,
            });
            // The mention asks the agent's turn job to run its work in the thread.
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "run", memberId: agent.memberId, threadId },
            ]);

            const ready = yield* startReady(workspace.id, agent.memberId, threadId);
            const turn = ready.turn;
            expect(turn).toMatchObject({
              agentId: agent.id,
              memberId: agent.memberId,
              participationId: asked!.participationId,
              retry: null,
              status: "running",
              acceptedThroughSequence: started.activity.sequence,
              selection,
            });
            expect(yield* turnOf(workspace.id, turn.id)).toEqual(turn);
            // The job runs the agent with its instructions on the connections of its selection,
            // each with its key: its harness in the host's process, with no sandbox.
            const { runnable } = ready;
            expect(runnable.instructions).toBe("Plan each change.");
            expect(runnable.harness).toMatchObject({
              connection: { integration: "test-in-process" },
              credential: null,
            });
            expect(runnable.model).toMatchObject({
              connection: { id: models.id, integration: "test-models" },
              model: selection.model,
            });
            expect(
              Option.map(Option.fromNullOr(runnable.model.credential), ({ apiKey }) =>
                Redacted.value(apiKey),
              ),
            ).toEqual(Option.some(goodKey));
            expect(runnable.sandbox).toBeNull();
            // Its first session in the thread starts anew, with nothing said before it joined,
            // and the turn's prompt is what it was asked.
            expect(ready.resume).toBeNull();
            expect(yield* joinedOf(workspace.id, turn.id)).toEqual([]);
            expect(textsOf(ready.prompt)).toEqual(["Alice: Planner, summarize the plan."]);
            expect(ready.messages).toBe(1);
            expect(yield* bound.notifications.get(asked!.id)).toEqual(
              Option.some(
                Object.assign({}, asked, {
                  state: {
                    _tag: "Accepted",
                    by: { _tag: "Turn", turnId: turn.id },
                    acceptedAt: turn.createdAt,
                  },
                }),
              ),
            );
            const active = yield* as(
              workspace.id,
              alice,
              Effect.flatMap(TurnService.TurnService, (turnService) => turnService.listActive(10)),
            );
            expect(active.map(({ id }) => id)).toEqual([turn.id]);

            // A run cut short runs the turn again, as it was ready to run.
            expect(yield* startReady(workspace.id, agent.memberId, threadId)).toEqual(ready);
            expect((yield* timelineOf(workspace.id, threadId)).map(told)).toEqual([
              "message: Planner, summarize the plan.",
              `created ${turn.id}`,
              `started ${turn.id}`,
            ]);
          }),
        ),
      ),
    60_000,
  );

  it.effect(
    "closing posts the turn's answer and keeps its session, and the next turn is prompted with what followed",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent, identity, selection } = yield* workspaceWithAgent;
            const started = yield* start(workspace.id, "Planner, summarize the plan.", [
              agent.memberId,
            ]);
            const threadId = started.thread.id;
            const { turn } = yield* startReady(workspace.id, agent.memberId, threadId);
            yield* takeTurnJobs(workspace.id);
            const closing = yield* execute(workspace.id, (turnExecution) =>
              turnExecution.close(turn.id, { reply: "The plan is on track.", resume }),
            );
            expect(closing._tag).toBe("Closed");
            const closed = yield* turnOf(workspace.id, turn.id);
            expect(closed).toMatchObject({ status: "completed", failure: null });
            expect(closed.messageIds).toHaveLength(1);
            // The answer is the agent's own message, naming the turn that posted it.
            const timeline = yield* timelineOf(workspace.id, threadId);
            expect(timeline.map(told)).toEqual([
              "message: Planner, summarize the plan.",
              `created ${turn.id}`,
              `started ${turn.id}`,
              "message: The plan is on track.",
              `ended ${turn.id} completed replying ${closed.messageIds[0]}`,
            ]);
            expect(timeline[3]).toMatchObject({
              message: {
                id: closed.messageIds[0],
                author: { _tag: "Member", memberId: agent.memberId },
                via: { _tag: "Turn", turnId: turn.id },
                content: { text: "The plan is on track." },
              },
            });
            // What the session resumes from is kept for the agent's next turn there, as prompted
            // so far.
            const bound = yield* boundTo(workspace.id);
            expect(yield* bound.sessionStates.get(turn.participationId)).toEqual(
              Option.some({
                agent: "test-in-process",
                agentState: { turns: 1 },
                promptedThroughSequence: started.activity.sequence,
                selection,
              }),
            );
            // The agent's answer asks nothing of it: its job finds no work.
            expect(
              yield* bound.notifications.listPendingByRecipient(
                Notification.ofMember(agent.memberId, identity),
                { limit: 10 },
              ),
            ).toEqual([]);
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "run", memberId: agent.memberId, threadId },
            ]);
            expect(yield* runJob(workspace.id, agent.memberId, threadId)).toEqual(idle);

            // More is asked, and the next turn resumes the session, prompted with only that.
            const more = yield* reply(workspace.id, threadId, "Include the risks too.");
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "run", memberId: agent.memberId, threadId },
            ]);
            const next = yield* startReady(workspace.id, agent.memberId, threadId);
            expect(next.turn).toMatchObject({
              participationId: turn.participationId,
              acceptedThroughSequence: more.activity.sequence,
              selection,
            });
            expect(next.resume).toEqual(resume);
            expect(textsOf(next.prompt)).toEqual(["Alice: Include the risks too."]);
            // An answer of nothing posts nothing.
            expect(
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.close(next.turn.id, { reply: "  ", resume }),
              ),
            ).toEqual(TurnExecution.Closing.cases.Closed.make({ messageIds: [] }));
            expect(yield* turnOf(workspace.id, next.turn.id)).toMatchObject({
              status: "completed",
              messageIds: [],
            });
            expect(yield* bound.sessionStates.get(turn.participationId)).toEqual(
              Option.some({
                agent: "test-in-process",
                agentState: { turns: 1 },
                promptedThroughSequence: more.activity.sequence,
                selection,
              }),
            );
          }),
        ),
      ),
    60_000,
  );

  it.effect(
    "a reader follows a turn's log: its prompt, drafts, each step that wrote text, and its end",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.scoped(
            Effect.gen(function* () {
              const { workspace, agent } = yield* workspaceWithAgent;
              const started = yield* start(workspace.id, "Planner, summarize the plan.", [
                agent.memberId,
              ]);
              const threadId = started.thread.id;
              const bound = yield* boundTo(workspace.id);
              const ready = yield* startReady(workspace.id, agent.memberId, threadId);
              const { turn } = ready;
              yield* logPrompt(workspace.id, ready);
              const next = yield* followLog(workspace.id, turn.id);
              expect(brief(yield* next)).toBe("opened InputTaken");
              // A step being written reaches the reader before it finishes.
              const draft = (text: string, offset: number) =>
                execute(workspace.id, (turnExecution) =>
                  turnExecution.showDraft(turn.id, {
                    responseId: "step-2",
                    part: 0,
                    offset,
                    text,
                  }),
                );
              yield* logStep(workspace.id, turn, "step-1", reading);
              yield* draft("The ", 0);
              expect(brief(yield* next)).toBe("drafted The ");
              // A reader who starts following mid-step catches up from a draft of all the step's
              // part has so far.
              yield* Effect.yieldNow;
              const late = yield* followLog(workspace.id, turn.id);
              expect(brief(yield* late)).toBe("opened InputTaken");
              yield* draft("The plan", 0);
              expect(brief(yield* next)).toBe("drafted The plan");
              expect(brief(yield* late)).toBe("drafted The plan");
              yield* logStep(workspace.id, turn, "step-2", answering("The plan is on track."));
              expect(brief(yield* next)).toBe("changed 1:The plan is on track.");
              expect(brief(yield* late)).toBe("changed 1:The plan is on track.");
              // Closing marks the step it posted as the reply, then the log ends.
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.close(turn.id, { reply: "The plan is on track.", resume }),
              );
              expect(brief(yield* next)).toBe("changed 1:The plan is on track. (reply)");
              expect(brief(yield* next)).toBe("ended");
              expect(yield* next).toBe("done");
              expect(brief(yield* late)).toBe("changed 1:The plan is on track. (reply)");
              expect(brief(yield* late)).toBe("ended");

              // Following a turn that ended opens with its items and ends at once.
              const again = yield* followLog(workspace.id, turn.id);
              expect(brief(yield* again)).toBe("opened InputTaken,Responded");
              expect(brief(yield* again)).toBe("ended");
              expect(yield* again).toBe("done");
              expect(yield* bound.turns.findActive(agent.memberId, threadId)).toEqual(
                Option.none(),
              );
            }),
          ),
        ),
      ),
    60_000,
  );

  it.effect(
    "a queued turn stops at once, a running one once its job confirms, and work waits meanwhile",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.scoped(
            Effect.gen(function* () {
              const { workspace, agent } = yield* workspaceWithAgent;
              const started = yield* start(workspace.id, "Planner, draft the notes.", [
                agent.memberId,
              ]);
              const threadId = started.thread.id;
              const bound = yield* boundTo(workspace.id);
              const cancel = (turnId: Turn.Id) =>
                as(
                  workspace.id,
                  alice,
                  Effect.flatMap(TurnService.TurnService, (turnService) =>
                    turnService.cancel(turnId),
                  ),
                );
              // A turn that failed, and its retry, which waits queued until its job starts it.
              const { turn: first } = yield* startReady(workspace.id, agent.memberId, threadId);
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.fail(first.id, { reason: "The model provider is unavailable." }),
              );
              yield* takeTurnJobs(workspace.id);
              const retried = yield* as(
                workspace.id,
                alice,
                Effect.flatMap(TurnService.TurnService, (turnService) =>
                  turnService.retry(first.id),
                ),
              );
              expect(retried.status).toBe("queued");
              expect(yield* takeTurnJobs(workspace.id)).toEqual([
                { kind: "run", memberId: agent.memberId, threadId },
              ]);
              const following = yield* followLog(workspace.id, retried.id);
              expect(brief(yield* following)).toBe("opened ");
              // Nothing runs a queued turn yet, so it stops at once, and its log ends.
              expect(yield* cancel(retried.id)).toMatchObject({
                status: "cancelled",
                cancelReason: "requested",
              });
              expect(brief(yield* following)).toBe("ended");
              expect(yield* following).toBe("done");
              expect(yield* takeTurnJobs(workspace.id)).toEqual([
                { kind: "stop", memberId: agent.memberId, threadId, turnId: retried.id },
                { kind: "run", memberId: agent.memberId, threadId },
              ]);

              // New work starts a turn prompted with all the agent was not yet told.
              yield* reply(workspace.id, threadId, "Please try again.");
              expect(yield* takeTurnJobs(workspace.id)).toEqual([
                { kind: "run", memberId: agent.memberId, threadId },
              ]);
              const second = yield* startReady(workspace.id, agent.memberId, threadId);
              expect(textsOf(second.prompt)).toEqual([
                "Alice: Planner, draft the notes.",
                "Alice: Please try again.",
              ]);
              // A running turn stops once its job confirms it; meanwhile work waits for it.
              expect(yield* cancel(second.turn.id)).toMatchObject({ status: "cancelling" });
              expect(yield* takeTurnJobs(workspace.id)).toEqual([
                { kind: "stop", memberId: agent.memberId, threadId, turnId: second.turn.id },
              ]);
              yield* reply(workspace.id, threadId, "Actually, just the summary.");
              expect(
                (yield* bound.turns.findActive(agent.memberId, threadId)).pipe(
                  Option.map(({ id, status }) => ({ id, status })),
                ),
              ).toEqual(Option.some({ id: second.turn.id, status: "cancelling" }));
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.confirmStopped(second.turn.id, { resume }),
              );
              expect(yield* turnOf(workspace.id, second.turn.id)).toMatchObject({
                status: "cancelled",
                cancelReason: "requested",
              });
              // Confirming again changes nothing.
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.confirmStopped(second.turn.id, {}),
              );
              // What it took in stays told: the next turn resumes its session from there.
              const third = yield* startReady(workspace.id, agent.memberId, threadId);
              expect(third.resume).toEqual(resume);
              expect(textsOf(third.prompt)).toEqual(["Alice: Actually, just the summary."]);
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.fail(third.turn.id, { reason: "The model is overloaded." }),
              );
              expect(yield* turnOf(workspace.id, third.turn.id)).toMatchObject({
                status: "failed",
                failure: "The model is overloaded.",
              });
              expect(yield* Effect.flip(cancel(third.turn.id))).toMatchObject({
                _tag: "TurnService.NotActive",
                status: "failed",
              });
              // A turn asked to stop that its job is not running ends when the job next runs.
              yield* reply(workspace.id, threadId, "One more thing.");
              const fourth = yield* startReady(workspace.id, agent.memberId, threadId);
              yield* cancel(fourth.turn.id);
              expect(yield* runJob(workspace.id, agent.memberId, threadId)).toEqual(idle);
              expect(yield* turnOf(workspace.id, fourth.turn.id)).toMatchObject({
                status: "cancelled",
                cancelReason: "requested",
              });
              expect((yield* timelineOf(workspace.id, threadId)).map(told)).toEqual([
                "message: Planner, draft the notes.",
                `created ${first.id}`,
                `started ${first.id}`,
                `ended ${first.id} failed The model provider is unavailable.`,
                `created ${retried.id} retrying ${first.id}`,
                `ended ${retried.id} cancelled requested`,
                "message: Please try again.",
                `created ${second.turn.id}`,
                `started ${second.turn.id}`,
                `stopping ${second.turn.id} requested`,
                "message: Actually, just the summary.",
                `ended ${second.turn.id} cancelled requested`,
                `created ${third.turn.id}`,
                `started ${third.turn.id}`,
                `ended ${third.turn.id} failed The model is overloaded.`,
                "message: One more thing.",
                `created ${fourth.turn.id}`,
                `started ${fourth.turn.id}`,
                `stopping ${fourth.turn.id} requested`,
                `ended ${fourth.turn.id} cancelled requested`,
              ]);
            }),
          ),
        ),
      ),
    60_000,
  );

  it.effect(
    "a failed turn runs again once, telling the agent who asked, while nothing follows",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent } = yield* workspaceWithAgent;
            const started = yield* start(workspace.id, "Planner, draft the notes.", [
              agent.memberId,
            ]);
            const threadId = started.thread.id;
            const retry = (turnId: Turn.Id) =>
              as(
                workspace.id,
                alice,
                Effect.flatMap(TurnService.TurnService, (turnService) => turnService.retry(turnId)),
              );
            const { turn } = yield* startReady(workspace.id, agent.memberId, threadId);
            yield* execute(workspace.id, (turnExecution) =>
              turnExecution.fail(turn.id, { reason: "The model provider is unavailable." }),
            );
            const failed = yield* as(
              workspace.id,
              alice,
              Effect.flatMap(TurnService.TurnService, (turnService) => turnService.get(turn.id)),
            );
            expect(failed).toMatchObject({ status: "failed", retryable: true, stoppable: false });
            yield* takeTurnJobs(workspace.id);

            const retried = yield* retry(turn.id);
            expect(retried).toMatchObject({
              status: "queued",
              participationId: turn.participationId,
              retry: { of: turn.id, by: workspace.ownerMemberId },
              acceptedThroughSequence: turn.acceptedThroughSequence,
            });
            expect(retried.createdAt.epochMilliseconds).toBeGreaterThan(
              turn.createdAt.epochMilliseconds,
            );
            // Asking again returns the same retry, and its job is asked to run it.
            expect(yield* retry(turn.id)).toMatchObject({ id: retried.id });
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "run", memberId: agent.memberId, threadId },
            ]);
            const ready = yield* startReady(workspace.id, agent.memberId, threadId);
            expect(ready.turn.id).toBe(retried.id);
            expect(textsOf(ready.prompt)).toEqual([
              "Alice: Planner, draft the notes.",
              "Alice asked you to try that again.",
            ]);
            // Once a retry follows it, the failed turn cannot run again.
            expect(yield* Effect.flip(retry(retried.id))).toMatchObject({
              _tag: "TurnService.NotRetryable",
              reason: "active",
            });
            yield* execute(workspace.id, (turnExecution) =>
              turnExecution.fail(retried.id, { reason: "Still unavailable." }),
            );
            yield* reply(workspace.id, threadId, "Never mind.");
            yield* startReady(workspace.id, agent.memberId, threadId);
            expect(yield* Effect.flip(retry(retried.id))).toMatchObject({
              _tag: "TurnService.NotRetryable",
              reason: "superseded",
            });
          }),
        ),
      ),
  );

  it.effect("a turn the agent cannot run as it is set up fails before it starts", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const { workspace, agent, models } = yield* workspaceWithAgent;
          yield* as(
            workspace.id,
            alice,
            Effect.flatMap(ConnectionService.ConnectionService, (connectionService) =>
              connectionService.remove(models.id),
            ),
          );
          const started = yield* start(workspace.id, "Planner, draft the notes.", [agent.memberId]);
          const threadId = started.thread.id;
          expect(yield* runJob(workspace.id, agent.memberId, threadId)).toEqual(idle);
          const bound = yield* boundTo(workspace.id);
          const failed = Option.getOrThrow(yield* bound.turns.findLatest(agent.memberId, threadId));
          expect(failed).toMatchObject({
            status: "failed",
            failure: "The connection for the agent's model was removed.",
            selection: null,
            startedAt: null,
          });
          expect((yield* timelineOf(workspace.id, threadId)).map(told)).toEqual([
            "message: Planner, draft the notes.",
            `created ${failed.id}`,
            `ended ${failed.id} failed The connection for the agent's model was removed.`,
          ]);
          // A member who is no agent has no work to run.
          expect(yield* runJob(workspace.id, workspace.ownerMemberId, threadId)).toEqual(idle);
        }),
      ),
    ),
  );

  it.effect("a turn whose answer the agent may no longer post fails, keeping its session", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const { workspace, agent } = yield* workspaceWithAgent;
          const started = yield* start(workspace.id, "Planner, draft the notes.", [agent.memberId]);
          const threadId = started.thread.id;
          const { turn } = yield* startReady(workspace.id, agent.memberId, threadId);
          yield* revokeRoles(workspace.id, agent.memberId);
          const closing = yield* execute(workspace.id, (turnExecution) =>
            turnExecution.close(turn.id, { reply: "The notes.", resume }),
          );
          expect(closing).toEqual(
            TurnExecution.Closing.cases.Failed.make({
              reason: "The agent may no longer post in this thread.",
            }),
          );
          expect(yield* turnOf(workspace.id, turn.id)).toMatchObject({
            status: "failed",
            failure: "The agent may no longer post in this thread.",
            messageIds: [],
          });
          const bound = yield* boundTo(workspace.id);
          expect(
            Option.map(yield* bound.sessionStates.get(turn.participationId), ({ agent }) => agent),
          ).toEqual(Option.some(resume.agent));
        }),
      ),
    ),
  );

  it.effect("an agent that stops taking part in a thread has its turn there stopped", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const { workspace, agent, identity } = yield* workspaceWithAgent;
          const started = yield* start(workspace.id, "Planner, look into this.", [agent.memberId]);
          const threadId = started.thread.id;
          const { turn } = yield* startReady(workspace.id, agent.memberId, threadId);
          yield* takeTurnJobs(workspace.id);
          yield* unfollow(workspace.id, identity, agent.memberId, threadId);
          // Unfollowing asks the agent's job to stop its turn there, which it confirms.
          expect(yield* takeTurnJobs(workspace.id)).toEqual([
            { kind: "stop", memberId: agent.memberId, threadId, turnId: turn.id },
          ]);
          yield* execute(workspace.id, (turnExecution) =>
            turnExecution.confirmStopped(turn.id, { resume }),
          );
          const stopped = yield* as(
            workspace.id,
            alice,
            Effect.flatMap(TurnService.TurnService, (turnService) => turnService.get(turn.id)),
          );
          expect(stopped).toMatchObject({
            status: "cancelled",
            cancelReason: "participation-ended",
            retryable: false,
          });
          expect((yield* timelineOf(workspace.id, threadId)).map(told)).toEqual([
            "message: Planner, look into this.",
            `created ${turn.id}`,
            `started ${turn.id}`,
            "participation.ended",
            `ended ${turn.id} cancelled participation-ended`,
          ]);
          // It can't run again where the agent no longer takes part.
          expect(
            yield* Effect.flip(
              as(
                workspace.id,
                alice,
                Effect.flatMap(TurnService.TurnService, (turnService) =>
                  turnService.retry(turn.id),
                ),
              ),
            ),
          ).toMatchObject({ _tag: "TurnService.NotRetryable", reason: "departed" });
        }),
      ),
    ),
  );

  it.effect(
    "an agent taken off a task has its turn there stopped, and is asked anew as work resumes",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent } = yield* workspaceWithAgent;
            // Assigned at the start, the agent is asked to work the task.
            const started = yield* as(
              workspace.id,
              alice,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.startInGroup({
                  groupId: Group.GeneralId,
                  text: "Plan the launch.",
                  mentions: [],
                  task: { assignee: agent.memberId },
                }),
              ),
            );
            const threadId = started.thread.id;
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "run", memberId: agent.memberId, threadId },
            ]);
            yield* reply(workspace.id, threadId, "Planner, start with the budget.");
            yield* takeTurnJobs(workspace.id);
            const { turn } = yield* startReady(workspace.id, agent.memberId, threadId);
            const change = (
              change: Parameters<TaskService.TaskService["Service"]["update"]>[0]["change"],
            ) =>
              as(
                workspace.id,
                alice,
                Effect.flatMap(TaskService.TaskService, (taskService) =>
                  taskService.update({ threadId, change }),
                ),
              );
            // Holding the task asks the agent's job to stop its turn, which it confirms.
            yield* change({ _tag: "Status", from: "todo", to: "held" });
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "stop", memberId: agent.memberId, threadId, turnId: turn.id },
            ]);
            yield* execute(workspace.id, (turnExecution) =>
              turnExecution.confirmStopped(turn.id, { resume }),
            );
            expect(yield* turnOf(workspace.id, turn.id)).toMatchObject({
              status: "cancelled",
              cancelReason: "task-changed",
            });
            // The turn's end runs the job again, for work that waited; nothing does.
            yield* takeTurnJobs(workspace.id);
            // Resuming the work asks the agent again; taking it off the task stops that turn too.
            yield* reply(workspace.id, threadId, "Planner, pick it up again.");
            yield* change({ _tag: "Status", from: "held", to: "todo" });
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "run", memberId: agent.memberId, threadId },
              { kind: "run", memberId: agent.memberId, threadId },
            ]);
            const { turn: resumed } = yield* startReady(workspace.id, agent.memberId, threadId);
            yield* change({ _tag: "Assignee", from: agent.memberId, to: null });
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "stop", memberId: agent.memberId, threadId, turnId: resumed.id },
            ]);
            yield* execute(workspace.id, (turnExecution) =>
              turnExecution.confirmStopped(resumed.id, { resume }),
            );
            expect((yield* timelineOf(workspace.id, threadId)).map(told)).toEqual([
              "message: Plan the launch.",
              "task.created",
              "message: Planner, start with the budget.",
              `created ${turn.id}`,
              `started ${turn.id}`,
              "task.updated",
              `stopping ${turn.id} task-changed`,
              `ended ${turn.id} cancelled task-changed`,
              "message: Planner, pick it up again.",
              "task.updated",
              `created ${resumed.id}`,
              `started ${resumed.id}`,
              "task.updated",
              `stopping ${resumed.id} task-changed`,
              `ended ${resumed.id} cancelled task-changed`,
            ]);
          }),
        ),
      ),
  );

  it.effect(
    "an agent given a task is asked with the thread as it stands and what made it a task, then told each change in its words",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent } = yield* workspaceWithAgent;
            const asAlice = <A, E>(program: Effect.Effect<A, E, Core.Operations | Actor.Actor>) =>
              as(workspace.id, alice, program);
            const started = yield* asAlice(
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.startInGroup({
                  groupId: Group.GeneralId,
                  title: Thread.Title.make("Launch plan"),
                  text: "Plan the launch.",
                  mentions: [],
                }),
              ),
            );
            const threadId = started.thread.id;
            // Making the thread a task assigned to the agent asks it to work, though no message does.
            yield* asAlice(
              Effect.flatMap(TaskService.TaskService, (taskService) =>
                taskService.create({ threadId, assignee: agent.memberId, priority: "high" }),
              ),
            );
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "run", memberId: agent.memberId, threadId },
            ]);
            // Its prompt is the thread as it stands, then what told it: the task's creation.
            const first = yield* startReady(workspace.id, agent.memberId, threadId);
            expect(textsOf(first.prompt)).toEqual([
              "The thread is titled “Launch plan”. It is a task: status to do, priority high, assigned to you.",
              "Alice made this thread a task: status to do, priority high, assigned to you.",
            ]);
            expect(first.messages).toBe(0);
            // What was said before it joined is the conversation its session starts with.
            expect(yield* joinedOf(workspace.id, first.turn.id)).toEqual([
              { role: "user", texts: ["Alice: Plan the launch."] },
            ]);
            yield* execute(workspace.id, (turnExecution) =>
              turnExecution.close(first.turn.id, { reply: "On it.", resume }),
            );
            yield* takeTurnJobs(workspace.id);
            // The thread is renamed, its opening message edited, and the task started; a message
            // said and deleted before the turn tells nothing.
            yield* asAlice(
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.rename({
                  threadId,
                  title: Thread.Title.make("Launch plan, revised"),
                  expectedTitle: Thread.Title.make("Launch plan"),
                }),
              ),
            );
            yield* asAlice(
              Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
                threadMessageService.edit({
                  messageId: started.message.id,
                  text: "Plan the launch by Friday.",
                  mentions: [],
                  expectedRevision: 1,
                }),
              ),
            );
            yield* asAlice(
              Effect.flatMap(TaskService.TaskService, (taskService) =>
                taskService.update({
                  threadId,
                  change: { _tag: "Status", from: "todo", to: "doing" },
                }),
              ),
            );
            const aside = yield* reply(workspace.id, threadId, "Mind the budget.");
            yield* asAlice(
              Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
                threadMessageService.delete(aside.message.id),
              ),
            );
            yield* takeTurnJobs(workspace.id);
            const second = yield* startReady(workspace.id, agent.memberId, threadId);
            expect(textsOf(second.prompt)).toEqual([
              "The thread is titled “Launch plan, revised”. It is a task: status doing, priority high, assigned to you.",
              "The thread was renamed to “Launch plan, revised”.",
              "Alice edited their message: Plan the launch by Friday.",
              "The task's status is now doing.",
            ]);
            expect(second.messages).toBe(0);
          }),
        ),
      ),
  );

  it.effect(
    "an agent assigned a channel's task is told the contact's messages by the contact's name",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent } = yield* workspaceWithAgent;
            const { receive } = yield* channelInto(workspace.id);
            // The contact's message opens a task in triage, which alice assigns to the agent.
            const opened = (yield* receive("m1", "Where is my order?")).intakes[0];
            if (opened?._tag !== "Opened")
              return expect.fail(`Expected a thread opened, not ${opened?._tag}`);
            const { threadId } = opened;
            yield* takeTurnJobs(workspace.id);
            yield* as(
              workspace.id,
              alice,
              Effect.flatMap(TaskService.TaskService, (taskService) =>
                taskService.update({
                  threadId,
                  change: { _tag: "Assignee", from: null, to: agent.memberId },
                }),
              ),
            );
            // The contact writes again, which asks the agent to work.
            yield* receive("m2", "It was order 42.");
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "run", memberId: agent.memberId, threadId },
            ]);
            const ready = yield* startReady(workspace.id, agent.memberId, threadId);
            expect(textsOf(ready.prompt)).toEqual([
              "This thread is a task: status triage, assigned to you.",
              "The task was assigned to you.",
              "Dana Customer: It was order 42.",
            ]);
            expect(ready.messages).toBe(1);
            expect(yield* joinedOf(workspace.id, ready.turn.id)).toEqual([
              { role: "user", texts: ["Dana Customer: Where is my order?"] },
            ]);
          }),
        ),
      ),
  );

  it.effect(
    "an agent asked back into a thread ends its departed turn, then starts anew with what it missed",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent, identity } = yield* workspaceWithAgent;
            const started = yield* start(workspace.id, "Planner, look into this.", [
              agent.memberId,
            ]);
            const threadId = started.thread.id;
            const { turn: departed } = yield* startReady(workspace.id, agent.memberId, threadId);
            yield* execute(workspace.id, (turnExecution) =>
              turnExecution.close(departed.id, { reply: "Looking.", resume }),
            );
            yield* reply(workspace.id, threadId, "Planner, and the budget?");
            const { turn: unfinished } = yield* startReady(workspace.id, agent.memberId, threadId);
            yield* unfollow(workspace.id, identity, agent.memberId, threadId);
            yield* reply(workspace.id, threadId, "The budget grew.");
            // Asked back before its turn there is stopped, the agent takes part anew.
            yield* reply(workspace.id, threadId, "Planner, come back to this.", [agent.memberId]);
            const bound = yield* boundTo(workspace.id);
            const [asked] = yield* bound.notifications.listPendingByRecipient(
              Notification.ofMember(agent.memberId, identity),
              { limit: 10 },
            );
            expect(asked?.participationId).not.toBe(departed.participationId);
            // Its job ends the departed turn first; that turn's end runs the job again.
            expect(yield* runJob(workspace.id, agent.memberId, threadId)).toEqual(idle);
            expect(yield* turnOf(workspace.id, unfinished.id)).toMatchObject({
              status: "cancelled",
              cancelReason: "participation-ended",
            });
            const next = yield* startReady(workspace.id, agent.memberId, threadId);
            expect(next.turn.participationId).toBe(asked!.participationId);
            // The new participation starts a session of its own, with the conversation before
            // it rejoined: others' messages as the user's, its own answer as its.
            expect(next.resume).toBeNull();
            expect(yield* joinedOf(workspace.id, next.turn.id)).toEqual([
              { role: "user", texts: ["Alice: Planner, look into this."] },
              { role: "assistant", texts: ["Looking."] },
              {
                role: "user",
                texts: ["Alice: Planner, and the budget?", "Alice: The budget grew."],
              },
            ]);
            expect(textsOf(next.prompt)).toEqual(["Alice: Planner, come back to this."]);
          }),
        ),
      ),
    60_000,
  );

  it.effect(
    "an agent reads every message it has not been told, however many, before and after it joined",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent } = yield* workspaceWithAgent;
            // A long conversation happens before the agent is asked anything.
            const started = yield* start(workspace.id, "Planning the launch.", []);
            const threadId = started.thread.id;
            const talk = (count: number, label: string) =>
              Effect.forEach(
                Array.from({ length: count }, (_, index) => `${label} ${index + 1}.`),
                (text) => reply(workspace.id, threadId, text),
                { discard: true },
              );
            yield* talk(110, "Earlier note");
            yield* reply(workspace.id, threadId, "Planner, catch up and summarize.", [
              agent.memberId,
            ]);
            const first = yield* startReady(workspace.id, agent.memberId, threadId);
            // Every earlier message is in what it joined, not only the newest hundred activities.
            const joined = yield* joinedOf(workspace.id, first.turn.id);
            expect(joined).toHaveLength(1);
            expect(joined[0]?.texts).toHaveLength(111);
            expect(joined[0]?.texts[0]).toBe("Alice: Planning the launch.");
            expect(textsOf(first.prompt)).toEqual(["Alice: Planner, catch up and summarize."]);
            yield* execute(workspace.id, (turnExecution) =>
              turnExecution.close(first.turn.id, { reply: "", resume }),
            );
            // More than a hundred messages arrive before it is asked again.
            yield* talk(120, "Later note");
            const second = yield* startReady(workspace.id, agent.memberId, threadId);
            const prompt = textsOf(second.prompt);
            expect(prompt).toHaveLength(120);
            expect(prompt[0]).toBe("Alice: Later note 1.");
            expect(prompt.at(-1)).toBe("Alice: Later note 120.");
          }),
        ),
      ),
    120_000,
  );

  it.effect("a member who may not read a thread may not read its turns or follow their logs", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const { workspace, agent } = yield* workspaceWithAgent;
          const reader = yield* joinAsBob(workspace.id);
          const started = yield* start(workspace.id, "Planner, look into this.", [agent.memberId]);
          const { turn } = yield* startReady(workspace.id, agent.memberId, started.thread.id);
          const reads: ReadonlyArray<
            (
              turns: TurnService.TurnService["Service"],
            ) => Effect.Effect<unknown, unknown, Actor.Actor>
          > = [(turns) => turns.get(turn.id), (turns) => Effect.scoped(turns.watchLog(turn.id))];
          const asBob = <A, E>(
            read: (turns: TurnService.TurnService["Service"]) => Effect.Effect<A, E, Actor.Actor>,
          ) => as(workspace.id, bob, Effect.flatMap(TurnService.TurnService, read));
          for (const read of reads) yield* asBob(read);
          expect((yield* asBob((turns) => turns.listActive(10))).map(({ id }) => id)).toEqual([
            turn.id,
          ]);

          // Without a role, bob still belongs to the thread's group, but may not read it.
          yield* revokeRoles(workspace.id, reader.id);
          for (const read of reads)
            expect(yield* Effect.flip(asBob(read))).toMatchObject({
              _tag: "CoreError.Denied",
              reason: { _tag: "NotGranted", requirement: { permission: { name: "thread.read" } } },
            });
          expect(yield* asBob((turns) => turns.listActive(10))).toEqual([]);
        }),
      ),
    ),
  );

  it.effect("following a turn's log ends once the reader may no longer read its thread", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.scoped(
          Effect.gen(function* () {
            const { workspace, agent } = yield* workspaceWithAgent;
            const reader = yield* joinAsBob(workspace.id);
            const team = yield* as(
              workspace.id,
              alice,
              Effect.gen(function* () {
                const { memberId } = yield* Actor.Actor;
                const groupService = yield* GroupService.GroupService;
                return yield* groupService.createTeam({
                  name: "Planning",
                  memberIds: [memberId, reader.id, agent.memberId],
                });
              }),
            );
            /** A running turn in a new thread of `groupId`, which bob follows. */
            const following = Effect.fnUntraced(function* (groupId: Group.Id) {
              const started = yield* as(
                workspace.id,
                alice,
                Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                  threadService.startInGroup({
                    groupId,
                    text: "Planner, draft the plan.",
                    mentions: [agent.memberId],
                  }),
                ),
              );
              const ready = yield* startReady(workspace.id, agent.memberId, started.thread.id);
              const { turn } = ready;
              yield* logPrompt(workspace.id, ready);
              const next = yield* followLog(workspace.id, turn.id, bob);
              expect(brief(yield* next)).toBe("opened InputTaken");
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.showDraft(turn.id, {
                  responseId: "step-1",
                  part: 0,
                  offset: 0,
                  text: "The ",
                }),
              );
              expect(brief(yield* next)).toBe("drafted The ");
              return next;
            });

            // Leaving the thread's group ends following, with nothing more of the step.
            const left = yield* following(team.id);
            const [membership] = (yield* as(
              workspace.id,
              bob,
              Effect.flatMap(
                GroupMembershipService.GroupMembershipService,
                (groupMembershipService) =>
                  groupMembershipService.listCurrent(team.id, { limit: 10 }),
              ),
            )).filter((admission) => admission.memberId === reader.id);
            yield* as(
              workspace.id,
              bob,
              Effect.flatMap(
                GroupMembershipService.GroupMembershipService,
                (groupMembershipService) =>
                  groupMembershipService.leave({
                    groupId: team.id,
                    membershipId: membership!.id,
                  }),
              ),
            );
            expect(yield* left).toBe("unavailable");

            // So does losing the permission to read it, while still in its group.
            const revoked = yield* following(Group.GeneralId);
            yield* revokeRoles(workspace.id, reader.id);
            expect(yield* revoked).toBe("unavailable");
          }),
        ),
      ),
    ),
  );
});
