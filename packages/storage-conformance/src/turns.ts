import type * as Core from "@amends/core";
import { AgentService } from "@amends/core/agent";
import { BuiltinRoles } from "@amends/core/authorization";
import { ConnectionService } from "@amends/core/connection";
import { Environment } from "@amends/core/environment";
import { Group, GroupService, GroupMembershipService } from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Notification } from "@amends/core/notification";
import {
  ThreadService,
  type ThreadMessage,
  ThreadMessageService,
  ThreadParticipationService,
  type ThreadTimeline,
} from "@amends/core/thread";
import { Turn, TurnService, TurnExecution, TurnLog } from "@amends/core/turn";
import type { Member, Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { HarnessEvent, Transcript } from "@amends/harness";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Queue, Stream } from "effect";
import type { Harness as ConformanceHarness } from "./harness.ts";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  boundTo,
  future,
  placedIn,
  request,
  runAgentJobs,
  Support,
  testImplementation,
} from "./support.ts";

const as = <A, E, R extends Core.Operations | Actor.Service>(
  id: Workspace.Id,
  identity: Identity.MemberReference,
  program: Effect.Effect<A, E, R>,
) => Effect.flatMap(Gateway.Service, (gateway) => gateway.asMember(id, identity, program));
const turnsOf = (id: Workspace.Id, threadId: Turn.Record["threadId"]) =>
  as(
    id,
    alice,
    Effect.flatMap(TurnService.Service, (turnService) => turnService.listByThread(threadId, 10)),
  );
/** Run turn execution in the workspace, as a turn's job does each step. */
const execute = <A, E>(id: Workspace.Id, program: Effect.Effect<A, E, TurnExecution.Service>) =>
  Effect.flatMap(Gateway.Service, (gateway) => Effect.scoped(gateway.inWorkspace(id, program)));
const timelineOf = (id: Workspace.Id, threadId: Turn.Record["threadId"]) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadService.Service, (threadService) =>
      threadService.readTimeline(threadId, { limit: 50 }),
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
  switch (message._tag) {
    case "Opened":
      return `opened ${message.items.map((item) => item._tag).join(",")}`;
    case "Changed":
      return `changed ${message.changes
        .map(({ index, item }) =>
          item._tag === "Responded"
            ? `${index}:${item.text}${item.reply ? " (reply)" : ""}`
            : `${index}:${item._tag}`,
        )
        .join(",")}`;
    case "Drafted":
      return `drafted ${message.text}`;
    case "Ended":
      return "ended";
  }
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

/** A workspace owned by alice with an agent, Scout, that has a ready model connection. */
const workspaceWithAgent = Effect.gen(function* () {
  const workspace = yield* Operations.createWorkspace(alice.id);
  const models = yield* as(
    workspace.id,
    alice,
    Effect.flatMap(ConnectionService.Service, (connectionService) =>
      connectionService.create({
        name: "Models",
        implementationId: testImplementation.id,
        settings: { endpoint: "https://models.example" },
        authentication: "None",
      }),
    ),
  );
  const agent = yield* as(
    workspace.id,
    alice,
    Effect.flatMap(AgentService.Service, (agentService) =>
      agentService.create({
        name: "Scout",
        instructions: "Help the team.",
        model: { connectionId: models.id, model: "model-x", reasoning: null },
        environmentId: Environment.InProcessId,
        roleId: BuiltinRoles.MemberId,
      }),
    ),
  );
  const identity = Identity.MemberReference.cases.Agent.make({ id: agent.id });
  const selection: Turn.Selection = {
    connectionId: models.id,
    model: "model-x",
    reasoning: null,
    environmentId: Environment.InProcessId,
  };
  return { workspace, agent, identity, selection };
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
const start = (id: Workspace.Id, text: string, mentions: ReadonlyArray<Turn.Record["memberId"]>) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadService.Service, (threadService) =>
      threadService.startInGroup({ groupId: Group.GeneralId, text, mentions: [...mentions] }),
    ),
  ).pipe(Effect.flatMap((started) => withPlace(id, started)));
const reply = (id: Workspace.Id, threadId: Turn.Record["threadId"], text: string) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadMessageService.Service, (threadMessageService) =>
      threadMessageService.publish({ threadId, text, mentions: [] }),
    ),
  ).pipe(Effect.flatMap((message) => withPlace(id, { message })));

const input = (text: string): Transcript.Input => ({
  _tag: "Input",
  author: { id: "alice", name: "Alice" },
  content: [{ _tag: "Text", text }],
});
/** What the agent is told after one of its turns stopped short. */
const note = (text: string) => ({
  _tag: "Input",
  author: { id: "amends", name: "Amends" },
  content: [{ _tag: "Text", text }],
});
const batch = (id: string, text: string) => ({
  id: HarnessEvent.BatchId.make(id),
  items: [input(text)] as const,
});
/** Harness events as execution reports them, in the environment's envelope. */
const reported = (...events: ReadonlyArray<HarnessEvent.Event>) =>
  events.map((event) => ({ _tag: "Harness" as const, event }));
const took = (taken: HarnessEvent.InputBatch): HarnessEvent.Event => ({
  _tag: "InputIncorporated",
  batch: taken,
});
/** A response's text block at `part`, completed and finished, then the harness idle. */
const answered = (
  responseId: string,
  text: string,
  part = 0,
): ReadonlyArray<HarnessEvent.Event> => [
  {
    _tag: "BlockCompleted",
    responseId: Transcript.ResponseId.make(responseId),
    part,
    block: { _tag: "Text", text },
  },
  { _tag: "ResponseFinished", responseId: Transcript.ResponseId.make(responseId), finish: "stop" },
  { _tag: "Idle" },
];

export const turns = (harness: ConformanceHarness) => {
  const { runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: turns`, () => {
    it.effect(
      "an agent accepts the work asked of it into one turn per thread, settling its notifications",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, agent, identity } = yield* workspaceWithAgent;
              const started = yield* start(workspace.id, "Scout, summarize the plan.", [
                agent.memberId,
              ]);
              const threadId = started.thread.id;
              const bound = yield* boundTo(workspace.id);
              const recipient = Notification.ofMember(agent.memberId, identity);
              const [asked] = yield* bound.notifications.listPendingByRecipient(recipient, {
                limit: 10,
              });
              expect(asked?.thread?.sequence).toBe(started.activity.sequence);

              yield* runAgentJobs(workspace.id);
              const [turn] = yield* turnsOf(workspace.id, threadId);
              expect(turn).toMatchObject({
                agentId: agent.id,
                memberId: agent.memberId,
                status: "queued",
                inputAfterSequence: started.activity.sequence - 1,
                acceptedThroughSequence: started.activity.sequence,
                selection: null,
              });
              expect(yield* bound.notifications.get(asked!.id)).toEqual(
                Option.some(
                  Object.assign({}, asked, {
                    state: {
                      _tag: "Acknowledged",
                      outcome: { _tag: "Accepted", turnId: turn!.id },
                      acknowledgedAt: turn!.createdAt,
                    },
                  }),
                ),
              );
              // More work on the same thread joins the active turn.
              const more = yield* reply(workspace.id, threadId, "Include the risks too.");
              yield* runAgentJobs(workspace.id);
              const after = yield* turnsOf(workspace.id, threadId);
              expect(after).toHaveLength(1);
              expect(after[0]).toMatchObject({
                id: turn!.id,
                acceptedThroughSequence: more.activity.sequence,
              });
              expect(
                yield* bound.notifications.listPendingByRecipient(recipient, { limit: 10 }),
              ).toEqual([]);
            }),
          ),
        ),
      60_000,
    );

    it.effect(
      "execution takes input in, and closing publishes every answer the agent owes once nothing waits",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, agent, identity, selection } = yield* workspaceWithAgent;
              const started = yield* start(workspace.id, "Scout, summarize the plan.", [
                agent.memberId,
              ]);
              const threadId = started.thread.id;
              yield* runAgentJobs(workspace.id);
              const [queued] = yield* turnsOf(workspace.id, threadId);
              const turnId = queued!.id;
              const readTurns = <A, E>(
                read: (turns: TurnService.Interface) => Effect.Effect<A, E, Actor.Service>,
              ) => as(workspace.id, alice, Effect.flatMap(TurnService.Service, read));
              // The workspace's active turns include it until it ends.
              expect(
                (yield* readTurns((turns) => turns.listActive(10))).map(({ id }) => id),
              ).toEqual([turnId]);
              const running = yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  turnExecution.start(turnId, selection),
                ),
              );
              expect(running).toMatchObject({ status: "running", selection });
              // A turn cannot close before the harness confirms taking in its input.
              expect(
                yield* execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                    turnExecution.close(turnId),
                  ),
                ),
              ).toEqual({ _tag: "InputPending" });
              const first = batch("b1", "Scout, summarize the plan.");
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.recordSubmission(turnId, {
                      batchId: first.id,
                      throughSequence: started.activity.sequence,
                      items: first.items,
                    });
                    yield* turnExecution.recordEvents(
                      turnId,
                      reported(took(first), ...answered("r1", "An early answer.")),
                    );
                  }),
                ),
              );
              // How far the turn's input is taken in is its log's to say.
              const taken = yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  turnExecution.readEntries(turnId),
                ),
              );
              expect(TurnLog.read(taken).incorporatedThrough(0)).toBe(started.activity.sequence);
              // New work that has not been accepted yet keeps the turn open.
              const more = yield* reply(workspace.id, threadId, "Include the risks too.");
              expect(
                yield* execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                    turnExecution.close(turnId),
                  ),
                ),
              ).toEqual({ _tag: "InputPending" });
              yield* runAgentJobs(workspace.id);
              const second = batch("b2", "Include the risks too.");
              const closing = yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.recordSubmission(turnId, {
                      batchId: second.id,
                      throughSequence: more.activity.sequence,
                      items: second.items,
                    });
                    yield* turnExecution.recordEvents(
                      turnId,
                      reported(took(second), ...answered("r2", "The plan, with its risks.")),
                    );
                    return yield* turnExecution.close(turnId);
                  }),
                ),
              );
              expect(closing._tag).toBe("Closed");
              const [closed] = yield* turnsOf(workspace.id, threadId);
              expect(closed).toMatchObject({ status: "completed" });
              expect(closed?.messageIds).toHaveLength(2);
              // The early answer came before more input was taken in, so it is owed too: each is
              // the agent's own message, verbatim, in order, after the input that followed it.
              const timeline = yield* timelineOf(workspace.id, threadId);
              // The turn began where the agent took on the first message, and ended replying.
              expect(timeline.map(told)).toEqual([
                "message: Scout, summarize the plan.",
                `created ${turnId}`,
                `started ${turnId}`,
                "message: Include the risks too.",
                "message: An early answer.",
                "message: The plan, with its risks.",
                `ended ${turnId} completed replying ${closed!.messageIds.join(",")}`,
              ]);
              // Each reply names the turn that posted it; people's messages name none.
              expect(timeline.filter((item) => "message" in item).slice(-3)).toMatchObject([
                { message: { text: "Include the risks too.", turnId: null } },
                {
                  activity: { kind: "message.published" },
                  message: {
                    id: closed!.messageIds[0],
                    author: { _tag: "Member", memberId: agent.memberId },
                    text: "An early answer.",
                    turnId,
                  },
                },
                {
                  message: {
                    id: closed!.messageIds[1],
                    author: { _tag: "Member", memberId: agent.memberId },
                    text: "The plan, with its risks.",
                    turnId,
                  },
                },
              ]);
              // Readers see the log's facts: each batch taken in and each response's text.
              const shown = yield* readTurns((turns) => turns.log(turnId));
              expect(shown.turn).toMatchObject({ id: turnId, status: "completed" });
              expect(
                shown.items.map((item) =>
                  item._tag === "Responded"
                    ? `${item._tag}: ${item.text}${item.reply ? " (reply)" : ""}`
                    : item._tag === "InputTaken"
                      ? `${item._tag}: ${item.messages}`
                      : item._tag,
                ),
              ).toEqual([
                "InputTaken: 1",
                "Responded: An early answer. (reply)",
                "InputTaken: 1",
                "Responded: The plan, with its risks. (reply)",
              ]);
              expect(yield* readTurns((turns) => turns.listActive(10))).toEqual([]);
              const entries = yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  turnExecution.readEntries(turnId),
                ),
              );
              expect(entries.filter(({ entry }) => entry._tag === "Submitted")).toHaveLength(2);
              // The log says how the turn began and ended, as its facts do.
              expect(entries.find(({ entry }) => entry._tag === "Started")?.entry).toMatchObject({
                selection,
                instructions: "Help the team.",
              });
              expect(entries.at(-1)?.entry).toMatchObject({
                _tag: "Ended",
                outcome: "completed",
                messageIds: closed!.messageIds,
              });
              expect(TurnLog.read(entries).incorporatedThrough(0)).toBe(more.activity.sequence);
              // The agent's reply asks nothing of it: no new turn follows.
              const bound = yield* boundTo(workspace.id);
              expect(
                yield* bound.notifications.listPendingByRecipient(
                  Notification.ofMember(agent.memberId, identity),
                  { limit: 10 },
                ),
              ).toEqual([]);
              yield* runAgentJobs(workspace.id);
              expect(yield* turnsOf(workspace.id, threadId)).toHaveLength(1);
            }),
          ),
        ),
      60_000,
    );

    it.effect(
      "a reader follows a turn's log: its items as they stand, each change, drafts, and its end",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.scoped(
              Effect.gen(function* () {
                const { workspace, agent, selection } = yield* workspaceWithAgent;
                const started = yield* start(workspace.id, "Scout, summarize the plan.", [
                  agent.memberId,
                ]);
                const threadId = started.thread.id;
                yield* runAgentJobs(workspace.id);
                const [queued] = yield* turnsOf(workspace.id, threadId);
                const turnId = queued!.id;
                const run = <A, E>(
                  step: (turnExecution: TurnExecution.Interface) => Effect.Effect<A, E>,
                ) => execute(workspace.id, Effect.flatMap(TurnExecution.Service, step));

                // A queued turn has written nothing yet, so following it waits for its entries.
                const next = yield* followLog(workspace.id, turnId);
                expect(brief(yield* next)).toBe("opened ");
                const first = batch("b1", "Scout, summarize the plan.");
                yield* run((turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.start(turnId, selection);
                    yield* turnExecution.recordSubmission(turnId, {
                      batchId: first.id,
                      throughSequence: started.activity.sequence,
                      items: first.items,
                    });
                    yield* turnExecution.recordEvents(turnId, reported(took(first)));
                  }),
                );
                expect(brief(yield* next)).toBe("changed 0:InputTaken");
                // A response being written reaches the reader before its block completes.
                yield* run((turnExecution) =>
                  turnExecution.showDraft(turnId, {
                    responseId: "r1",
                    part: 0,
                    offset: 0,
                    text: "The ",
                  }),
                );
                expect(brief(yield* next)).toBe("drafted The ");
                // A reader who starts following mid-response sees what it has written so far.
                yield* Effect.yieldNow;
                const late = yield* followLog(workspace.id, turnId);
                expect(brief(yield* late)).toBe("opened InputTaken");
                expect(brief(yield* late)).toBe("drafted The ");
                yield* run((turnExecution) =>
                  turnExecution.recordEvents(
                    turnId,
                    reported(...answered("r1", "The plan is on track.")),
                  ),
                );
                expect(brief(yield* next)).toBe("changed 1:The plan is on track. (reply)");
                expect(brief(yield* late)).toBe("changed 1:The plan is on track. (reply)");
                // Closing records the turn's end in its log, after every item it wrote.
                yield* run((turnExecution) => turnExecution.close(turnId));
                expect(brief(yield* next)).toBe("ended");
                expect(yield* next).toBe("done");
                expect(brief(yield* late)).toBe("ended");

                // Following a turn that ended opens with its items and ends at once.
                const again = yield* followLog(workspace.id, turnId);
                expect(brief(yield* again)).toBe("opened InputTaken,Responded");
                expect(brief(yield* again)).toBe("ended");
                expect(yield* again).toBe("done");
              }),
            ),
          ),
        ),
      60_000,
    );

    it.effect("following a queued turn ends when it is stopped before it starts", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.scoped(
            Effect.gen(function* () {
              const { workspace, agent } = yield* workspaceWithAgent;
              const started = yield* start(workspace.id, "Scout, draft the notes.", [
                agent.memberId,
              ]);
              yield* runAgentJobs(workspace.id);
              const [queued] = yield* turnsOf(workspace.id, started.thread.id);
              const next = yield* followLog(workspace.id, queued!.id);
              expect(brief(yield* next)).toBe("opened ");
              yield* as(
                workspace.id,
                alice,
                Effect.flatMap(TurnService.Service, (turnService) =>
                  turnService.cancel(queued!.id),
                ),
              );
              // Its end is in its agent's log, which is all a reader follows.
              expect(brief(yield* next)).toBe("ended");
              expect(yield* next).toBe("done");
            }),
          ),
        ),
      ),
    );

    it.effect(
      "a turn still stopping holds new work, and each ended turn leaves what it took in behind",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, agent, selection } = yield* workspaceWithAgent;
              const started = yield* start(workspace.id, "Scout, draft the notes.", [
                agent.memberId,
              ]);
              const threadId = started.thread.id;
              const cancel = (turnId: Turn.Id) =>
                as(
                  workspace.id,
                  alice,
                  Effect.flatMap(TurnService.Service, (turnService) => turnService.cancel(turnId)),
                );
              yield* runAgentJobs(workspace.id);
              const [first] = yield* turnsOf(workspace.id, threadId);
              // A queued turn stops at once: nothing runs it yet.
              expect(yield* cancel(first!.id)).toMatchObject({
                status: "cancelled",
                cancelReason: "requested",
              });
              const again = yield* reply(workspace.id, threadId, "Please try again.");
              yield* runAgentJobs(workspace.id);
              const [second] = yield* turnsOf(workspace.id, threadId);
              expect(second).toMatchObject({
                status: "queued",
                inputAfterSequence: first!.inputAfterSequence,
                acceptedThroughSequence: again.activity.sequence,
              });
              const entriesOf = (turnId: Turn.Id) =>
                execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                    turnExecution.readEntries(turnId),
                  ),
                );
              // The turn stopped before it started leaves only its end in the agent's log, so the
              // next turn still records the thread's history before it starts.
              expect((yield* entriesOf(first!.id)).map(({ entry }) => entry)).toEqual([
                {
                  _tag: "Ended",
                  turnId: first!.id,
                  outcome: "cancelled",
                  reason: null,
                  cancelReason: "requested",
                  messageIds: [],
                },
              ]);
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  turnExecution.start(second!.id, selection),
                ),
              );
              expect((yield* entriesOf(second!.id)).map(({ entry }) => entry._tag)).toEqual([
                "History",
                "Started",
              ]);
              // A running turn stops once execution confirms it; meanwhile new work waits.
              expect(yield* cancel(second!.id)).toMatchObject({ status: "cancelling" });
              yield* reply(workspace.id, threadId, "Actually, just the summary.");
              yield* runAgentJobs(workspace.id);
              expect((yield* turnsOf(workspace.id, threadId)).map(({ status }) => status)).toEqual([
                "cancelling",
                "cancelled",
              ]);
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  turnExecution.confirmStopped(second!.id),
                ),
              );
              yield* runAgentJobs(workspace.id);
              const [third] = yield* turnsOf(workspace.id, threadId);
              expect(third?.id).not.toBe(second!.id);
              expect(third?.status).toBe("queued");
              // A failure ends the turn with its reason.
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.start(third!.id, selection);
                    yield* turnExecution.fail(third!.id, "The model provider is unavailable.");
                  }),
                ),
              );
              expect((yield* turnsOf(workspace.id, threadId))[0]).toMatchObject({
                status: "failed",
                failure: "The model provider is unavailable.",
              });
              expect(yield* Effect.flip(cancel(third!.id))).toMatchObject({
                _tag: "TurnService.NotActive",
                status: "failed",
              });
              // The thread tells each turn where the agent took on the work, and how it went.
              expect((yield* timelineOf(workspace.id, threadId)).map(told)).toEqual([
                "message: Scout, draft the notes.",
                `created ${first!.id}`,
                `ended ${first!.id} cancelled requested`,
                "message: Please try again.",
                `created ${second!.id}`,
                `started ${second!.id}`,
                `stopping ${second!.id} requested`,
                "message: Actually, just the summary.",
                `ended ${second!.id} cancelled requested`,
                `created ${third!.id}`,
                `started ${third!.id}`,
                `ended ${third!.id} failed The model provider is unavailable.`,
              ]);
            }),
          ),
        ),
      60_000,
    );

    it.effect(
      "a failed turn runs again as a new turn for the same input, once, while nothing follows it",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, agent, selection } = yield* workspaceWithAgent;
              const started = yield* start(workspace.id, "Scout, draft the notes.", [
                agent.memberId,
              ]);
              const threadId = started.thread.id;
              const retry = (turnId: Turn.Id) =>
                as(
                  workspace.id,
                  alice,
                  Effect.flatMap(TurnService.Service, (turnService) => turnService.retry(turnId)),
                );
              const flags = (views: ReadonlyArray<Turn.View>) =>
                views.map(({ status, stoppable, retryable }) => ({ status, stoppable, retryable }));
              yield* runAgentJobs(workspace.id);
              const [queued] = yield* turnsOf(workspace.id, threadId);
              expect(flags([queued!])).toEqual([
                { status: "queued", stoppable: true, retryable: false },
              ]);
              expect(yield* Effect.flip(retry(queued!.id))).toMatchObject({
                _tag: "TurnService.NotRetryable",
                reason: "active",
              });
              // The turn takes its input in, then fails.
              const first = batch("b1", "Scout, draft the notes.");
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.start(queued!.id, selection);
                    yield* turnExecution.recordSubmission(queued!.id, {
                      batchId: first.id,
                      throughSequence: started.activity.sequence,
                      items: first.items,
                    });
                    yield* turnExecution.recordEvents(queued!.id, reported(took(first)));
                    yield* turnExecution.fail(queued!.id, "The model provider is unavailable.");
                  }),
                ),
              );
              const [failed] = yield* turnsOf(workspace.id, threadId);
              expect(flags([failed!])).toEqual([
                { status: "failed", stoppable: false, retryable: true },
              ]);

              // Retrying handles the same input again, continuing from the failed turn with what
              // it took in, so that input is not submitted twice.
              const retried = yield* retry(failed!.id);
              expect(retried).toMatchObject({
                status: "queued",
                agentId: agent.id,
                participationId: failed!.participationId,
                historyFrom: failed!.historyFrom,
                retryOf: failed!.id,
                inputAfterSequence: started.activity.sequence,
                acceptedThroughSequence: failed!.acceptedThroughSequence,
                selection: null,
                failure: null,
                stoppable: true,
                retryable: false,
              });
              expect(retried.id).not.toBe(failed!.id);
              // A turn is retried once: asking again, by any request, returns that retry.
              expect((yield* retry(failed!.id)).id).toBe(retried.id);
              expect(flags(yield* turnsOf(workspace.id, threadId))).toEqual([
                { status: "queued", stoppable: true, retryable: false },
                { status: "failed", stoppable: false, retryable: false },
              ]);
              // The failed attempt stays where it began; the retry follows, once.
              expect((yield* timelineOf(workspace.id, threadId)).map(told)).toEqual([
                "message: Scout, draft the notes.",
                `created ${failed!.id}`,
                `started ${failed!.id}`,
                `ended ${failed!.id} failed The model provider is unavailable.`,
                `created ${retried.id} retrying ${failed!.id}`,
              ]);

              // It continues from what the failed turn took in, and its input is who asked again.
              expect(
                yield* execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                    turnExecution.prepare(retried.id),
                  ),
                ),
              ).toMatchObject({
                _tag: "Ready",
                plan: {
                  // The retry knows how the turn it retries ended.
                  history: [
                    input("Scout, draft the notes."),
                    note("Your work here stopped: The model provider is unavailable."),
                  ],
                  pending: {
                    afterSequence: started.activity.sequence,
                    throughSequence: started.activity.sequence,
                    items: [
                      {
                        _tag: "Input",
                        content: [{ _tag: "Text", text: "Please try that again." }],
                      },
                    ],
                  },
                },
              });
              // A turn that closed with its reply is done.
              const request = batch(`${retried.id}/retry`, "Please try that again.");
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.start(retried.id, selection);
                    yield* turnExecution.recordSubmission(retried.id, {
                      batchId: request.id,
                      throughSequence: started.activity.sequence,
                      items: request.items,
                    });
                    yield* turnExecution.recordEvents(
                      retried.id,
                      reported(took(request), ...answered("r1", "The notes.")),
                    );
                    yield* turnExecution.close(retried.id);
                  }),
                ),
              );
              expect(yield* Effect.flip(retry(retried.id))).toMatchObject({
                _tag: "TurnService.NotRetryable",
                reason: "completed",
              });
            }),
          ),
        ),
      60_000,
    );

    it.effect(
      "the next turn continues from the agent's log in the thread, taking in only what came after",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, agent, selection } = yield* workspaceWithAgent;
              const started = yield* start(workspace.id, "Scout, when is the deploy?", [
                agent.memberId,
              ]);
              const threadId = started.thread.id;
              const prepare = (turnId: Turn.Id) =>
                execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                    turnExecution.prepare(turnId),
                  ),
                );
              const reasoning: Transcript.ResponsePart = {
                _tag: "Reasoning",
                text: "Check the calendar.",
                native: { amends: { anthropic: { signature: "sig" } } },
              };
              yield* runAgentJobs(workspace.id);
              const [first] = yield* turnsOf(workspace.id, threadId);
              // The agent's log for the thread is empty, with no checkpoint yet.
              expect(first).toMatchObject({ logAfter: null, historyFrom: null, retryOf: null });
              // The first turn records reasoning and an answer, then closes.
              const asked = batch("b1", "Scout, when is the deploy?");
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.start(first!.id, selection);
                    yield* turnExecution.recordSubmission(first!.id, {
                      batchId: asked.id,
                      throughSequence: started.activity.sequence,
                      items: asked.items,
                    });
                    yield* turnExecution.recordEvents(
                      first!.id,
                      reported(
                        took(asked),
                        {
                          _tag: "BlockCompleted",
                          responseId: Transcript.ResponseId.make("s1/1"),
                          part: 0,
                          block: reasoning,
                        },
                        ...answered("s1/1", "Thursday.", 1),
                      ),
                    );
                    yield* turnExecution.close(first!.id);
                  }),
                ),
              );
              const more = yield* reply(workspace.id, threadId, "And the rollback plan?");
              yield* runAgentJobs(workspace.id);
              const [second] = yield* turnsOf(workspace.id, threadId);
              expect(second).toMatchObject({
                historyFrom: null,
                inputAfterSequence: started.activity.sequence,
              });
              expect(second!.logAfter).not.toBeNull();
              // Its history is what the agent's log holds, not the thread's messages: the posted
              // reply is not taken in again, and the first turn's reasoning stayed with that turn.
              const answer = {
                _tag: "Response",
                id: Transcript.ResponseId.make("s1/1"),
                parts: [{ _tag: "Text", text: "Thursday." }],
              } satisfies Transcript.Response;
              expect(yield* prepare(second!.id)).toMatchObject({
                _tag: "Ready",
                plan: {
                  history: [input("Scout, when is the deploy?"), answer],
                  pending: {
                    throughSequence: more.activity.sequence,
                    items: [
                      {
                        _tag: "Input",
                        content: [{ _tag: "Text", text: "And the rollback plan?" }],
                      },
                    ],
                  },
                },
              });
              // Stopped partway, the second turn leaves what it wrote for the next one.
              const followUp = batch("b2", "And the rollback plan?");
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.start(second!.id, selection);
                    yield* turnExecution.recordSubmission(second!.id, {
                      batchId: followUp.id,
                      throughSequence: more.activity.sequence,
                      items: followUp.items,
                    });
                    yield* turnExecution.recordEvents(
                      second!.id,
                      reported(took(followUp), {
                        _tag: "BlockCompleted",
                        responseId: Transcript.ResponseId.make("s2/1"),
                        part: 0,
                        block: { _tag: "Text", text: "The rollback plan is" },
                      }),
                    );
                  }),
                ),
              );
              yield* as(
                workspace.id,
                alice,
                Effect.flatMap(TurnService.Service, (turnService) =>
                  turnService.cancel(second!.id),
                ),
              );
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  turnExecution.confirmStopped(second!.id),
                ),
              );
              const last = yield* reply(workspace.id, threadId, "Never mind, just the date.");
              yield* runAgentJobs(workspace.id);
              const [third] = yield* turnsOf(workspace.id, threadId);
              expect(third).toMatchObject({ retryOf: null });
              expect(third!.logAfter!).toBeGreaterThan(second!.logAfter!);
              expect(yield* prepare(third!.id)).toMatchObject({
                _tag: "Ready",
                plan: {
                  history: [
                    input("Scout, when is the deploy?"),
                    answer,
                    input("And the rollback plan?"),
                    {
                      _tag: "Response",
                      id: "s2/1",
                      parts: [{ _tag: "Text", text: "The rollback plan is" }],
                    },
                    note("Your work here was stopped before it finished, as someone asked."),
                  ],
                  pending: { throughSequence: last.activity.sequence },
                },
              });

              // A checkpoint replaces what came before it, for this turn and the next.
              const summary = "Asked when the deploy is: Thursday. Then about the rollback plan.";
              const dateOnly = batch("b3", "Never mind, just the date.");
              const recorded = yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.start(third!.id, selection);
                    return yield* turnExecution.recordCheckpoint(third!.id, {
                      summary,
                      kept: [],
                      through: null,
                    });
                  }),
                ),
              );
              // The next turn's history starts from it, where it sits in the agent's log.
              expect(recorded).toBeGreaterThan(third!.logAfter!);
              const opening = {
                _tag: "Input",
                author: { id: "checkpoint" },
                content: [{ _tag: "Text", text: summary }],
              };
              expect(yield* prepare(third!.id)).toMatchObject({
                _tag: "Ready",
                plan: { history: [opening], transcript: [opening] },
              });
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.recordSubmission(third!.id, {
                      batchId: dateOnly.id,
                      throughSequence: last.activity.sequence,
                      items: dateOnly.items,
                    });
                    yield* turnExecution.recordEvents(
                      third!.id,
                      reported(took(dateOnly), ...answered("s3/1", "Thursday.")),
                    );
                    yield* turnExecution.close(third!.id);
                  }),
                ),
              );
              yield* reply(workspace.id, threadId, "Thanks.");
              yield* runAgentJobs(workspace.id);
              const [fourth] = yield* turnsOf(workspace.id, threadId);
              expect(fourth).toMatchObject({ historyFrom: recorded });
              expect(yield* prepare(fourth!.id)).toMatchObject({
                _tag: "Ready",
                plan: {
                  history: [
                    opening,
                    input("Never mind, just the date."),
                    { _tag: "Response", parts: [{ _tag: "Text", text: "Thursday." }] },
                  ],
                },
              });
            }),
          ),
        ),
      60_000,
    );

    it.effect(
      "a full page of work that must wait ends the run idle, and is taken once the turn stops",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, agent, selection } = yield* workspaceWithAgent;
              const started = yield* start(workspace.id, "Scout, draft the notes.", [
                agent.memberId,
              ]);
              const threadId = started.thread.id;
              yield* runAgentJobs(workspace.id);
              const [first] = yield* turnsOf(workspace.id, threadId);
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  turnExecution.start(first!.id, selection),
                ),
              );
              yield* as(
                workspace.id,
                alice,
                Effect.flatMap(TurnService.Service, (turnService) => turnService.cancel(first!.id)),
              );
              // A hundred messages ask for the agent's work while its turn is still stopping.
              yield* Effect.forEach(
                Array.from({ length: 100 }, (_, index) => `Update ${index + 1}.`),
                (text) => reply(workspace.id, threadId, text),
                { discard: true },
              );
              // None can be accepted yet.
              yield* runAgentJobs(workspace.id);
              expect((yield* turnsOf(workspace.id, threadId)).map(({ status }) => status)).toEqual([
                "cancelling",
              ]);
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  turnExecution.confirmStopped(first!.id),
                ),
              );
              yield* runAgentJobs(workspace.id);
              const [next] = yield* turnsOf(workspace.id, threadId);
              expect(next).toMatchObject({ status: "queued", retryOf: null });
            }),
          ),
        ),
      60_000,
    );

    it.effect(
      "a turn reads every message it has not seen, however many, before and after it joined",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, agent, selection } = yield* workspaceWithAgent;
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
              const asked = yield* as(
                workspace.id,
                alice,
                Effect.flatMap(ThreadMessageService.Service, (threadMessageService) =>
                  threadMessageService.publish({
                    threadId,
                    text: "Scout, catch up and summarize.",
                    mentions: [agent.memberId],
                  }),
                ),
              ).pipe(Effect.flatMap((message) => withPlace(workspace.id, { message })));
              yield* runAgentJobs(workspace.id);
              const [first] = yield* turnsOf(workspace.id, threadId);
              const prepare = (turnId: Turn.Id) =>
                execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                    turnExecution.prepare(turnId),
                  ),
                );
              const joined = yield* prepare(first!.id);
              expect(joined._tag).toBe("Ready");
              if (joined._tag !== "Ready") return;
              // Every earlier message is its history, not only the newest hundred activities.
              expect(joined.plan.history).toHaveLength(111);
              expect(joined.plan.history[0]).toMatchObject({
                content: [{ text: "Planning the launch." }],
              });
              expect(joined.plan.pending?.items).toHaveLength(1);
              // The turn answers, then more than a hundred messages arrive before it is asked again.
              const took = batch("b1", "Scout, catch up and summarize.");
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                  Effect.gen(function* () {
                    yield* turnExecution.start(first!.id, selection);
                    yield* turnExecution.recordSubmission(first!.id, {
                      batchId: took.id,
                      throughSequence: asked.activity.sequence,
                      items: took.items,
                    });
                    yield* turnExecution.recordEvents(
                      first!.id,
                      reported(
                        { _tag: "InputIncorporated", batch: took },
                        ...answered("s1/1", "Here is the summary."),
                      ),
                    );
                    yield* turnExecution.close(first!.id);
                  }),
                ),
              );
              yield* talk(120, "Later note");
              yield* runAgentJobs(workspace.id);
              const [second] = yield* turnsOf(workspace.id, threadId);
              const backlog = yield* prepare(second!.id);
              expect(backlog._tag).toBe("Ready");
              if (backlog._tag !== "Ready") return;
              expect(backlog.plan.pending?.items).toHaveLength(120);
              expect(backlog.plan.pending?.items[0]).toMatchObject({
                content: [{ text: "Later note 1." }],
              });
              // Each waiting message says where it came from, for a checkpoint to take in.
              expect(backlog.plan.waiting).toHaveLength(120);
              expect(backlog.plan.waiting.at(-1)?.sequence).toBeGreaterThan(
                backlog.plan.waiting[0]!.sequence,
              );
            }),
          ),
        ),
      120_000,
    );

    it.effect("an agent that stops taking part in a thread has its turn there stopped", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, agent, identity } = yield* workspaceWithAgent;
            const started = yield* start(workspace.id, "Scout, look into this.", [agent.memberId]);
            const threadId = started.thread.id;
            yield* runAgentJobs(workspace.id);
            const participants = yield* as(
              workspace.id,
              identity,
              Effect.flatMap(ThreadService.Service, (threadService) =>
                threadService.listParticipants(threadId, { limit: 10 }),
              ),
            );
            const mine = participants.find(
              (participant) =>
                participant.participant._tag === "Member" &&
                participant.participant.memberId === agent.memberId,
            );
            yield* as(
              workspace.id,
              identity,
              Effect.flatMap(ThreadParticipationService.Service, (threadParticipationService) =>
                threadParticipationService.unfollow({ threadId, participationId: mine!.id }),
              ),
            );
            // Unfollowing asks for the agent's turns there to stop.
            yield* runAgentJobs(workspace.id);
            const [stopped] = yield* turnsOf(workspace.id, threadId);
            expect(stopped).toMatchObject({
              status: "cancelled",
              cancelReason: "participation-ended",
              retryable: false,
            });
            expect((yield* timelineOf(workspace.id, threadId)).map(told)).toEqual([
              "message: Scout, look into this.",
              `created ${stopped!.id}`,
              "participation.ended",
              `ended ${stopped!.id} cancelled participation-ended`,
            ]);
            // It can't run again where the agent no longer takes part.
            expect(
              yield* Effect.flip(
                as(
                  workspace.id,
                  alice,
                  Effect.flatMap(TurnService.Service, (turnService) =>
                    turnService.retry(stopped!.id),
                  ),
                ),
              ),
            ).toMatchObject({ _tag: "TurnService.NotRetryable", reason: "departed" });
          }),
        ),
      ),
    );

    it.effect(
      "work asked of an agent that left and came back waits for its departed turn, then runs",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, agent, identity } = yield* workspaceWithAgent;
              const started = yield* start(workspace.id, "Scout, look into this.", [
                agent.memberId,
              ]);
              const threadId = started.thread.id;
              yield* runAgentJobs(workspace.id);
              const [departed] = yield* turnsOf(workspace.id, threadId);
              const participants = yield* as(
                workspace.id,
                identity,
                Effect.flatMap(ThreadService.Service, (threadService) =>
                  threadService.listParticipants(threadId, { limit: 10 }),
                ),
              );
              const mine = participants.find(
                (participant) =>
                  participant.participant._tag === "Member" &&
                  participant.participant.memberId === agent.memberId,
              );
              yield* as(
                workspace.id,
                identity,
                Effect.flatMap(ThreadParticipationService.Service, (threadParticipationService) =>
                  threadParticipationService.unfollow({
                    threadId,
                    participationId: mine!.id,
                  }),
                ),
              );
              // Asked again before its turn there is stopped, the agent takes part anew.
              const asked = yield* as(
                workspace.id,
                alice,
                Effect.flatMap(ThreadMessageService.Service, (threadMessageService) =>
                  threadMessageService.publish({
                    threadId,
                    text: "Scout, come back to this.",
                    mentions: [agent.memberId],
                  }),
                ),
              ).pipe(Effect.flatMap((message) => withPlace(workspace.id, { message })));
              const bound = yield* boundTo(workspace.id);
              const recipient = Notification.ofMember(agent.memberId, identity);
              const [request] = yield* bound.notifications.listPendingByRecipient(recipient, {
                limit: 10,
              });
              expect(request?.participationId).not.toBe(departed!.participationId);
              // Accepted before its departed turn is stopped, none of it goes to that turn: it
              // waits until that turn has stopped.
              yield* runAgentJobs(workspace.id, { only: "acceptWork" });
              expect(yield* turnsOf(workspace.id, threadId)).toMatchObject([
                {
                  id: departed!.id,
                  status: "queued",
                  acceptedThroughSequence: started.activity.sequence,
                },
              ]);
              expect(
                yield* bound.notifications.listPendingByRecipient(recipient, { limit: 10 }),
              ).toEqual([request]);
              yield* runAgentJobs(workspace.id);
              yield* runAgentJobs(workspace.id);
              const [next, stopped] = yield* turnsOf(workspace.id, threadId);
              expect(stopped).toMatchObject({
                id: departed!.id,
                status: "cancelled",
                cancelReason: "participation-ended",
              });
              expect(next).toMatchObject({
                status: "queued",
                participationId: request!.participationId,
                acceptedThroughSequence: asked.activity.sequence,
              });
              expect(
                yield* bound.notifications.listPendingByRecipient(recipient, { limit: 10 }),
              ).toEqual([]);
            }),
          ),
        ),
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
              const started = yield* start(workspace.id, "Scout, look into this.", [
                agent.memberId,
              ]);
              const threadId = started.thread.id;
              yield* runAgentJobs(workspace.id);
              const [queued] = yield* turnsOf(workspace.id, threadId);
              const turnId = queued!.id;
              const reads: ReadonlyArray<
                (turns: TurnService.Interface) => Effect.Effect<unknown, unknown, Actor.Service>
              > = [
                (turns) => turns.get(turnId),
                (turns) => turns.listByThread(threadId, 10),
                (turns) => turns.log(turnId),
                (turns) => Effect.scoped(turns.watchLog(turnId)),
              ];
              const asBob = <A, E>(
                read: (turns: TurnService.Interface) => Effect.Effect<A, E, Actor.Service>,
              ) => as(workspace.id, bob, Effect.flatMap(TurnService.Service, read));
              for (const read of reads) yield* asBob(read);
              expect(
                (yield* asBob((turns) => turns.listActive(10))).map((turn) => turn.id),
              ).toEqual([turnId]);

              // Without a role, bob still belongs to the thread's group, but may not read it.
              yield* revokeRoles(workspace.id, reader.id);
              expect(
                yield* Effect.flip(
                  as(
                    workspace.id,
                    bob,
                    Effect.flatMap(ThreadService.Service, (threadService) =>
                      threadService.readTimeline(threadId, { limit: 50 }),
                    ),
                  ),
                ),
              ).toMatchObject({ _tag: "Authorization.Denied" });
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
              const { workspace, agent, selection } = yield* workspaceWithAgent;
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
                      text: "Scout, draft the plan.",
                      mentions: [agent.memberId],
                    }),
                  ),
                );
                yield* runAgentJobs(workspace.id);
                const [queued] = yield* turnsOf(workspace.id, started.thread.id);
                const turnId = queued!.id;
                const draft = (text: string, offset: number) =>
                  execute(
                    workspace.id,
                    Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                      turnExecution.showDraft(turnId, { responseId: "r1", part: 0, offset, text }),
                    ),
                  );
                yield* execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (turnExecution) =>
                    turnExecution.start(turnId, selection),
                  ),
                );
                const next = yield* followLog(workspace.id, turnId, bob);
                expect(brief(yield* next)).toBe("opened ");
                yield* draft("The ", 0);
                expect(brief(yield* next)).toBe("drafted The ");
                return { next, draft };
              });

              // Leaving the thread's group ends following, with nothing more of the response.
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
              expect(yield* left.next).toBe("unavailable");

              // So does losing the permission to read it, while still in its group.
              const revoked = yield* following(Group.GeneralId);
              yield* revokeRoles(workspace.id, reader.id);
              expect(yield* revoked.next).toBe("unavailable");
            }),
          ),
        ),
      ),
    );
  });
};
