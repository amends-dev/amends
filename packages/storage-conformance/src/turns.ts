import type * as Core from "@amends/core";
import { AgentV2Service } from "@amends/core/agent-v2";
import { BuiltinRoles } from "@amends/core/authorization";
import { ConnectionV2Service } from "@amends/core/connection-v2";
import { Group, GroupService, GroupMembershipService } from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Log, Store } from "@amends/core/journal";
import { Notification } from "@amends/core/notification";
import {
  ThreadService,
  type ThreadMessage,
  ThreadMessageService,
  ThreadParticipationService,
  type ThreadTimeline,
  ThreadParticipation,
} from "@amends/core/thread";
import { Turn, TurnExecution, TurnLog, TurnService } from "@amends/core/turn";
import type { Member, Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Agent, type Session, type StreamPart } from "@amends/harness-v2";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Queue, Redacted, Stream } from "effect";
import { Prompt } from "effect/ai";
import type { Harness as ConformanceHarness } from "./harness.ts";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  boundTo,
  future,
  goodKey,
  placedIn,
  request,
  Support,
  takeTurnJobs,
} from "./support.ts";

const as = <A, E, R extends Core.Operations | Actor.Service>(
  id: Workspace.Id,
  identity: Identity.MemberReference,
  program: Effect.Effect<A, E, R>,
) => Effect.flatMap(Gateway.Service, (gateway) => gateway.asMember(id, identity, program));
/** Run a step of turn execution in the workspace, as a turn's job does. */
const execute = <A, E>(
  id: Workspace.Id,
  step: (turnExecution: TurnExecution.Interface) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    Effect.scoped(gateway.inWorkspace(id, Effect.flatMap(TurnExecution.Service, step))),
  );
const timelineOf = (id: Workspace.Id, threadId: Turn.Record["threadId"]) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadService.Service, (threadService) =>
      threadService.readTimeline(threadId, { limit: 50 }),
    ),
  );
/** The turn as stored now. */
const turnOf = (id: Workspace.Id, turnId: Turn.Id) =>
  Effect.flatMap(boundTo(id), (bound) => Effect.map(bound.turns.get(turnId), Option.getOrThrow));
/** Every entry of the turn's log, oldest first. */
const entriesOf = (id: Workspace.Id, turnId: Turn.Id) =>
  Effect.flatMap(boundTo(id), (bound) =>
    Effect.flatMap(Log.Service, (log) => TurnLog.readEntries(log, turnId)).pipe(
      Effect.map((entries) => entries.map(({ entry }) => entry)),
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, bound.store),
    ),
  );
/**
 * Follow a turn's log, as alice unless another reader is named, for the enclosing scope: each
 * message as it arrives, and whether the stream has finished or failed as unavailable.
 */
const followLog = (id: Workspace.Id, turnId: Turn.Id, reader: Identity.MemberReference = alice) =>
  Effect.gen(function* () {
    const gateway = yield* Gateway.Service;
    const stream = yield* gateway.asMember(
      id,
      reader,
      Effect.flatMap(TurnService.Service, (turnService) => turnService.watchLog(turnId)),
    );
    const queue = yield* Queue.unbounded<Turn.LogMessage | "done" | "unavailable">();
    yield* stream.pipe(
      Stream.runForEach((message) => Queue.offer(queue, message)),
      Effect.andThen(Queue.offer(queue, "done")),
      Effect.catchTag("Turn.LogUnavailable", () => Queue.offer(queue, "unavailable")),
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
  if ("message" in item) return `message: ${item.message.text}`;
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

/** What a prompt says, each part's text. */
const textsOf = (prompt: Prompt.UserMessage) =>
  prompt.content.flatMap((part) => (part.type === "text" ? [part.text] : []));

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
/** The session a harness hands back after a turn, as the agent's participation names it. */
const sessionAfter = (
  participationId: Turn.Record["participationId"],
  said: string,
): Session.SessionState => ({
  id: Agent.SessionId.make(participationId),
  agent: "test-in-process",
  history: Prompt.make([
    { role: "user", content: said },
    { role: "assistant", content: [{ type: "text", text: "Done." }] },
  ]),
  agentState: { turns: 1 },
});

/**
 * A workspace owned by alice, named Alice there, with an agent, Planner, that works in the host's
 * process on a model connection with a good key.
 */
const workspaceWithAgent = Effect.gen(function* () {
  const workspace = yield* Operations.createWorkspace(alice.id, "Alice");
  const connect = (input: Parameters<ConnectionV2Service.Interface["create"]>[0]) =>
    as(
      workspace.id,
      alice,
      Effect.flatMap(ConnectionV2Service.Service, (connectionV2Service) =>
        connectionV2Service.create(input),
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
    Effect.flatMap(AgentV2Service.Service, (agentV2Service) =>
      agentV2Service.create({
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
const withPlace = <A extends { readonly message: ThreadMessage.Record }>(
  id: Workspace.Id,
  result: A,
) => Effect.flatMap(boundTo(id), (bound) => placedIn(bound)(result));
const start = (id: Workspace.Id, text: string, mentions: ReadonlyArray<Member.Id>) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadService.Service, (threadService) =>
      threadService.startInGroup({ groupId: Group.GeneralId, text, mentions: [...mentions] }),
    ),
  ).pipe(Effect.flatMap((started) => withPlace(id, started)));
const reply = (
  id: Workspace.Id,
  threadId: Turn.Record["threadId"],
  text: string,
  mentions: ReadonlyArray<Member.Id> = [],
) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadMessageService.Service, (threadMessageService) =>
      threadMessageService.publish({ threadId, text, mentions: [...mentions] }),
    ),
  ).pipe(Effect.flatMap((message) => withPlace(id, { message })));
/** The agent stops taking part in the thread. */
const unfollow = (
  id: Workspace.Id,
  identity: Identity.MemberReference,
  memberId: Member.Id,
  threadId: Turn.Record["threadId"],
) =>
  Effect.gen(function* () {
    const participants = yield* as(
      id,
      identity,
      Effect.flatMap(ThreadService.Service, (threadService) =>
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
      Effect.flatMap(ThreadParticipationService.Service, (threadParticipationService) =>
        threadParticipationService.unfollow({ threadId, participationId: mine!.id }),
      ),
    );
  });
/** Start the agent's work in the thread, as its turn job does, expecting a turn ready to run. */
const startReady = (id: Workspace.Id, memberId: Member.Id, threadId: Turn.Record["threadId"]) =>
  execute(id, (turnExecution) => turnExecution.start({ memberId, threadId })).pipe(
    Effect.filterOrElse(TurnExecution.Start.$is("Ready"), (started) =>
      Effect.die(`Expected a turn ready to run, not ${started._tag}`),
    ),
  );

export const turns = (harness: ConformanceHarness) => {
  const { runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: turns`, () => {
    it.effect(
      "an agent accepts the work asked of it into a turn, which starts on its setup with the thread's prompt",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, agent, identity, selection } = yield* workspaceWithAgent;
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
              // The agent runs on its harness, with its instructions, in the host's process.
              expect(ready.runnable.instructions).toBe("Plan each change.");
              expect(ready.runnable.harness.agent.id).toBe("test-in-process");
              expect(ready.runnable.sandboxProvider).toBeUndefined();
              // Its first session in the thread is named by its participation, with nothing said
              // before it joined, and the turn's prompt is what it was asked.
              expect(ready.session).toEqual({
                id: Agent.SessionId.make(turn.participationId),
                history: Prompt.empty,
              });
              expect(textsOf(ready.prompt)).toEqual(["Alice: Planner, summarize the plan."]);
              expect(yield* bound.notifications.get(asked!.id)).toEqual(
                Option.some(
                  Object.assign({}, asked, {
                    state: { _tag: "Accepted", turnId: turn.id, acceptedAt: turn.createdAt },
                  }),
                ),
              );
              expect(yield* entriesOf(workspace.id, turn.id)).toEqual([
                { _tag: "Prompted", messages: 1 },
              ]);
              const active = yield* as(
                workspace.id,
                alice,
                Effect.flatMap(TurnService.Service, (turnService) => turnService.listActive(10)),
              );
              expect(active.map(({ id }) => id)).toEqual([turn.id]);

              // A run cut short runs the turn again from its prompt, which its log notes.
              const again = yield* startReady(workspace.id, agent.memberId, threadId);
              expect(again.turn).toEqual(turn);
              expect(again.session).toEqual(ready.session);
              expect(textsOf(again.prompt)).toEqual(["Alice: Planner, summarize the plan."]);
              expect((yield* entriesOf(workspace.id, turn.id)).map(({ _tag }) => _tag)).toEqual([
                "Prompted",
                "Interrupted",
              ]);
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
        harness.withStorage((storage) =>
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
              const state = sessionAfter(turn.participationId, "Planner, summarize the plan.");
              const closing = yield* execute(workspace.id, (turnExecution) =>
                Effect.gen(function* () {
                  yield* turnExecution.recordStep(turn.id, { id: "step-1", step: reading });
                  yield* turnExecution.recordStep(turn.id, {
                    id: "step-2",
                    step: answering("The plan is on track."),
                  });
                  return yield* turnExecution.close(turn.id, state);
                }),
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
                  text: "The plan is on track.",
                  turnId: turn.id,
                },
              });
              expect((yield* entriesOf(workspace.id, turn.id)).at(-1)).toEqual({
                _tag: "Ended",
                outcome: "completed",
                reason: null,
                cancelReason: null,
                messageIds: closed.messageIds,
              });
              // The session is kept for the agent's next turn in the thread, as prompted so far.
              const bound = yield* boundTo(workspace.id);
              expect(yield* bound.sessionStates.get(turn.participationId)).toEqual(
                Option.some({
                  state,
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
              expect(
                yield* execute(workspace.id, (turnExecution) =>
                  turnExecution.start({ memberId: agent.memberId, threadId }),
                ),
              ).toEqual(TurnExecution.Start.Idle());

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
              expect(next.session).toEqual({ resumeFrom: state });
              expect(textsOf(next.prompt)).toEqual(["Alice: Include the risks too."]);
              // An answer of nothing posts nothing.
              expect(
                yield* execute(workspace.id, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.recordStep(next.turn.id, {
                      id: "step-1",
                      step: answering("  "),
                    });
                    return yield* turnExecution.close(next.turn.id, state);
                  }),
                ),
              ).toEqual(TurnExecution.Closing.Closed({ messageIds: [] }));
              expect(yield* turnOf(workspace.id, next.turn.id)).toMatchObject({
                status: "completed",
                messageIds: [],
              });
              expect(yield* bound.sessionStates.get(turn.participationId)).toEqual(
                Option.some({
                  state,
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
        harness.withStorage((storage) =>
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
                const { turn } = yield* startReady(workspace.id, agent.memberId, threadId);
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
                yield* execute(workspace.id, (turnExecution) =>
                  turnExecution.recordStep(turn.id, { id: "step-1", step: reading }),
                );
                yield* draft("The ", 0);
                expect(brief(yield* next)).toBe("drafted The ");
                // A reader who starts following mid-step sees what it has written so far.
                yield* Effect.yieldNow;
                const late = yield* followLog(workspace.id, turn.id);
                expect(brief(yield* late)).toBe("opened InputTaken");
                expect(brief(yield* late)).toBe("drafted The ");
                yield* execute(workspace.id, (turnExecution) =>
                  turnExecution.recordStep(turn.id, {
                    id: "step-2",
                    step: answering("The plan is on track."),
                  }),
                );
                expect(brief(yield* next)).toBe("changed 1:The plan is on track.");
                expect(brief(yield* late)).toBe("changed 1:The plan is on track.");
                // Closing marks the step it posted as the reply, then the log ends.
                yield* execute(workspace.id, (turnExecution) =>
                  turnExecution.close(
                    turn.id,
                    sessionAfter(turn.participationId, "Planner, summarize the plan."),
                  ),
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
        harness.withStorage((storage) =>
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
                    Effect.flatMap(TurnService.Service, (turnService) =>
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
                  Effect.flatMap(TurnService.Service, (turnService) => turnService.retry(first.id)),
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
                const state = sessionAfter(second.turn.participationId, "Please try again.");
                yield* execute(workspace.id, (turnExecution) =>
                  turnExecution.confirmStopped(second.turn.id, state),
                );
                expect(yield* turnOf(workspace.id, second.turn.id)).toMatchObject({
                  status: "cancelled",
                  cancelReason: "requested",
                });
                // Confirming again changes nothing.
                yield* execute(workspace.id, (turnExecution) =>
                  turnExecution.confirmStopped(second.turn.id, undefined),
                );
                // What it took in stays told: the next turn resumes its session from there.
                const third = yield* startReady(workspace.id, agent.memberId, threadId);
                expect(third.session).toEqual({ resumeFrom: state });
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
                expect(
                  yield* execute(workspace.id, (turnExecution) =>
                    turnExecution.start({ memberId: agent.memberId, threadId }),
                  ),
                ).toEqual(TurnExecution.Start.Idle());
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
        harness.withStorage((storage) =>
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
                  Effect.flatMap(TurnService.Service, (turnService) => turnService.retry(turnId)),
                );
              const { turn } = yield* startReady(workspace.id, agent.memberId, threadId);
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.fail(turn.id, { reason: "The model provider is unavailable." }),
              );
              const failed = yield* as(
                workspace.id,
                alice,
                Effect.flatMap(TurnService.Service, (turnService) => turnService.get(turn.id)),
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
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent, models } = yield* workspaceWithAgent;
            yield* as(
              workspace.id,
              alice,
              Effect.flatMap(ConnectionV2Service.Service, (connectionV2Service) =>
                connectionV2Service.remove(models.id),
              ),
            );
            const started = yield* start(workspace.id, "Planner, draft the notes.", [
              agent.memberId,
            ]);
            const threadId = started.thread.id;
            expect(
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.start({ memberId: agent.memberId, threadId }),
              ),
            ).toEqual(TurnExecution.Start.Idle());
            const bound = yield* boundTo(workspace.id);
            const failed = Option.getOrThrow(
              yield* bound.turns.findLatest(agent.memberId, threadId),
            );
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
            expect(
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.start({ memberId: workspace.ownerMemberId, threadId }),
              ),
            ).toEqual(TurnExecution.Start.Idle());
          }),
        ),
      ),
    );

    it.effect("a turn whose answer the agent may no longer post fails, keeping its session", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent } = yield* workspaceWithAgent;
            const started = yield* start(workspace.id, "Planner, draft the notes.", [
              agent.memberId,
            ]);
            const threadId = started.thread.id;
            const { turn } = yield* startReady(workspace.id, agent.memberId, threadId);
            yield* revokeRoles(workspace.id, agent.memberId);
            const state = sessionAfter(turn.participationId, "Planner, draft the notes.");
            const closing = yield* execute(workspace.id, (turnExecution) =>
              Effect.gen(function* () {
                yield* turnExecution.recordStep(turn.id, {
                  id: "step-1",
                  step: answering("The notes."),
                });
                return yield* turnExecution.close(turn.id, state);
              }),
            );
            expect(closing).toEqual(
              TurnExecution.Closing.Failed({
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
              Option.map(
                yield* bound.sessionStates.get(turn.participationId),
                (saved) => saved.state,
              ),
            ).toEqual(Option.some(state));
          }),
        ),
      ),
    );

    it.effect("an agent that stops taking part in a thread has its turn there stopped", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent, identity } = yield* workspaceWithAgent;
            const started = yield* start(workspace.id, "Planner, look into this.", [
              agent.memberId,
            ]);
            const threadId = started.thread.id;
            const { turn } = yield* startReady(workspace.id, agent.memberId, threadId);
            yield* takeTurnJobs(workspace.id);
            yield* unfollow(workspace.id, identity, agent.memberId, threadId);
            // Unfollowing asks the agent's job to stop its turn there, which it confirms.
            expect(yield* takeTurnJobs(workspace.id)).toEqual([
              { kind: "stop", memberId: agent.memberId, threadId, turnId: turn.id },
            ]);
            const state = sessionAfter(turn.participationId, "Planner, look into this.");
            yield* execute(workspace.id, (turnExecution) =>
              turnExecution.confirmStopped(turn.id, state),
            );
            const stopped = yield* as(
              workspace.id,
              alice,
              Effect.flatMap(TurnService.Service, (turnService) => turnService.get(turn.id)),
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
                  Effect.flatMap(TurnService.Service, (turnService) => turnService.retry(turn.id)),
                ),
              ),
            ).toMatchObject({ _tag: "TurnService.NotRetryable", reason: "departed" });
          }),
        ),
      ),
    );

    it.effect(
      "an agent asked back into a thread ends its departed turn, then starts anew with what it missed",
      () =>
        harness.withStorage((storage) =>
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
                Effect.gen(function* () {
                  yield* turnExecution.recordStep(departed.id, {
                    id: "step-1",
                    step: answering("Looking."),
                  });
                  yield* turnExecution.close(
                    departed.id,
                    sessionAfter(departed.participationId, "Planner, look into this."),
                  );
                }),
              );
              yield* reply(workspace.id, threadId, "Planner, and the budget?");
              const { turn: unfinished } = yield* startReady(
                workspace.id,
                agent.memberId,
                threadId,
              );
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
              expect(
                yield* execute(workspace.id, (turnExecution) =>
                  turnExecution.start({ memberId: agent.memberId, threadId }),
                ),
              ).toEqual(TurnExecution.Start.Idle());
              expect(yield* turnOf(workspace.id, unfinished.id)).toMatchObject({
                status: "cancelled",
                cancelReason: "participation-ended",
              });
              const next = yield* startReady(workspace.id, agent.memberId, threadId);
              expect(next.turn.participationId).toBe(asked!.participationId);
              // The new participation starts a session of its own, with the conversation before
              // it rejoined: others' messages as the user's, its own answer as its.
              expect(next.session).toMatchObject({
                id: Agent.SessionId.make(next.turn.participationId),
              });
              expect("history" in next.session && next.session.history.content).toMatchObject([
                {
                  role: "user",
                  content: [{ type: "text", text: "Alice: Planner, look into this." }],
                },
                { role: "assistant", content: [{ type: "text", text: "Looking." }] },
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Alice: Planner, and the budget?" },
                    { type: "text", text: "Alice: The budget grew." },
                  ],
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
        harness.withStorage((storage) =>
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
              // Every earlier message is its history, not only the newest hundred activities.
              const history = "history" in first.session ? first.session.history.content : [];
              expect(history).toHaveLength(1);
              const earlier = history[0]?.role === "user" ? history[0].content : [];
              expect(earlier).toHaveLength(111);
              expect(earlier[0]).toMatchObject({ text: "Alice: Planning the launch." });
              expect(textsOf(first.prompt)).toEqual(["Alice: Planner, catch up and summarize."]);
              yield* execute(workspace.id, (turnExecution) =>
                turnExecution.close(
                  first.turn.id,
                  sessionAfter(first.turn.participationId, "Planner, catch up and summarize."),
                ),
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

    it.effect(
      "a member who may not read a thread may not read its turns or follow their logs",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, agent } = yield* workspaceWithAgent;
              const reader = yield* joinAsBob(workspace.id);
              const started = yield* start(workspace.id, "Planner, look into this.", [
                agent.memberId,
              ]);
              const { turn } = yield* startReady(workspace.id, agent.memberId, started.thread.id);
              const reads: ReadonlyArray<
                (turns: TurnService.Interface) => Effect.Effect<unknown, unknown, Actor.Service>
              > = [
                (turns) => turns.get(turn.id),
                (turns) => Effect.scoped(turns.watchLog(turn.id)),
              ];
              const asBob = <A, E>(
                read: (turns: TurnService.Interface) => Effect.Effect<A, E, Actor.Service>,
              ) => as(workspace.id, bob, Effect.flatMap(TurnService.Service, read));
              for (const read of reads) yield* asBob(read);
              expect((yield* asBob((turns) => turns.listActive(10))).map(({ id }) => id)).toEqual([
                turn.id,
              ]);

              // Without a role, bob still belongs to the thread's group, but may not read it.
              yield* revokeRoles(workspace.id, reader.id);
              for (const read of reads)
                expect(yield* Effect.flip(asBob(read))).toMatchObject({
                  _tag: "Authorization.Denied",
                  requirement: { permission: { name: "thread.read" } },
                });
              expect(yield* asBob((turns) => turns.listActive(10))).toEqual([]);
            }),
          ),
        ),
    );

    it.effect("following a turn's log ends once the reader may no longer read its thread", () =>
      harness.withStorage((storage) =>
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
                  const { memberId } = yield* Actor.Service;
                  const groupService = yield* GroupService.Service;
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
                  Effect.flatMap(ThreadService.Service, (threadService) =>
                    threadService.startInGroup({
                      groupId,
                      text: "Planner, draft the plan.",
                      mentions: [agent.memberId],
                    }),
                  ),
                );
                const { turn } = yield* startReady(workspace.id, agent.memberId, started.thread.id);
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
                Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
                  groupMembershipService.listCurrent(team.id, { limit: 10 }),
                ),
              )).filter((admission) => admission.memberId === reader.id);
              yield* as(
                workspace.id,
                bob,
                Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
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
};
