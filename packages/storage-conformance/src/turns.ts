import type * as Core from "@amends/core";
import { AgentApplication } from "@amends/core/agent";
import { BuiltinRoles } from "@amends/core/authorization";
import { ConnectionApplication } from "@amends/core/connection";
import { Environment } from "@amends/core/environment";
import { Group } from "@amends/core/group";
import { Identity, type Actor } from "@amends/core/identity";
import { Notification } from "@amends/core/notification";
import { Request } from "@amends/core/request";
import {
  ThreadApplication,
  ThreadMessageApplication,
  ThreadParticipationApplication,
  type ThreadTimeline,
} from "@amends/core/thread";
import { Turn, TurnApplication, TurnExecution, TurnLog } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { HarnessEvent, Transcript } from "@amends/harness";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Queue, Stream } from "effect";
import type { Harness as ConformanceHarness } from "./harness.ts";
import { Operations } from "./operations.ts";
import { alice, boundTo, Support, testImplementation } from "./support.ts";

const as = <A, E, R extends Core.Operations | Actor.Service>(
  id: Workspace.Id,
  identity: Identity.MemberReference,
  program: Effect.Effect<A, E, R>,
) => Effect.flatMap(Gateway.Service, (gateway) => gateway.asMember(id, identity, program));
const turnsOf = (id: Workspace.Id, threadId: Turn.Record["threadId"]) =>
  as(
    id,
    alice,
    Effect.flatMap(TurnApplication.Service, (turns) => turns.listByThread(threadId, 10)),
  );
const execute = <A, E>(id: Workspace.Id, program: Effect.Effect<A, E, TurnExecution.Service>) =>
  Effect.flatMap(Gateway.Service, (gateway) => gateway.executeTurns(id, program));
const accept = (id: Workspace.Id) =>
  Effect.flatMap(Gateway.Service, (gateway) => gateway.runBackground(id, "turn.accept"));
const stopDeparted = (id: Workspace.Id) =>
  Effect.flatMap(Gateway.Service, (gateway) => gateway.runBackground(id, "turn.stop-departed"));
const timelineOf = (id: Workspace.Id, threadId: Turn.Record["threadId"]) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadApplication.Service, (threads) =>
      threads.readTimeline(threadId, { limit: 50 }),
    ),
  );
/**
 * Follow a turn's log as alice, for the enclosing scope: each message as it arrives, and whether the
 * stream has finished.
 */
const followLog = (id: Workspace.Id, turnId: Turn.Id) =>
  Effect.gen(function* () {
    const gateway = yield* Gateway.Service;
    const stream = yield* gateway.asMemberScoped(
      id,
      alice,
      Effect.flatMap(TurnApplication.Service, (turns) => turns.watchLog(turnId)),
    );
    const queue = yield* Queue.unbounded<Turn.LogMessage | "done">();
    yield* stream.pipe(
      Stream.runForEach((message) => Queue.offer(queue, message)),
      Effect.andThen(Queue.offer(queue, "done")),
      Effect.forkScoped,
    );
    return Queue.take(queue).pipe(Effect.timeout("10 seconds"));
  });
/** A log message in brief: its kind, and the items or text it carries. */
const brief = (message: Turn.LogMessage | "done") => {
  if (message === "done") return "done";
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
    Effect.flatMap(ConnectionApplication.Service, (connections) =>
      connections.create({
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
    Effect.flatMap(AgentApplication.Service, (agents) =>
      agents.create({
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
const start = (id: Workspace.Id, text: string, mentions: ReadonlyArray<Turn.Record["memberId"]>) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadApplication.Service, (threads) =>
      threads.startInGroup({ groupId: Group.GeneralId, text, mentions: [...mentions] }),
    ),
  );
const reply = (id: Workspace.Id, threadId: Turn.Record["threadId"], text: string) =>
  as(
    id,
    alice,
    Effect.flatMap(ThreadMessageApplication.Service, (messages) =>
      messages.publish({ threadId, text, mentions: [] }),
    ),
  );

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

              yield* accept(workspace.id);
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
              yield* accept(workspace.id);
              const after = yield* turnsOf(workspace.id, threadId);
              expect(after).toHaveLength(1);
              expect(after[0]).toMatchObject({
                id: turn!.id,
                acceptedThroughSequence: more.activity.sequence,
              });
              expect(
                yield* bound.notifications.listPendingByRecipient(recipient, { limit: 10 }),
              ).toEqual([]);
              // Running again with nothing waiting changes nothing.
              expect(yield* accept(workspace.id)).toEqual({ _tag: "Idle" });
              expect(yield* turnsOf(workspace.id, threadId)).toHaveLength(1);
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
              yield* accept(workspace.id);
              const [queued] = yield* turnsOf(workspace.id, threadId);
              const turnId = queued!.id;
              const readTurns = <A, E>(
                read: (turns: TurnApplication.Interface) => Effect.Effect<A, E, Actor.Service>,
              ) => as(workspace.id, alice, Effect.flatMap(TurnApplication.Service, read));
              // The workspace's active turns include it until it ends.
              expect(
                (yield* readTurns((turns) => turns.listActive(10))).map(({ id }) => id),
              ).toEqual([turnId]);
              const running = yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  execution.start(turnId, selection),
                ),
              );
              expect(running).toMatchObject({ status: "running", selection });
              // A turn cannot close before the harness confirms taking in its input.
              expect(
                yield* execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (execution) => execution.close(turnId)),
                ),
              ).toEqual({ _tag: "InputPending" });
              const first = batch("b1", "Scout, summarize the plan.");
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.submitted(turnId, {
                      batchId: first.id,
                      throughSequence: started.activity.sequence,
                      items: first.items,
                    });
                    yield* execution.report(
                      turnId,
                      reported(took(first), ...answered("r1", "An early answer.")),
                    );
                  }),
                ),
              );
              // How far the turn's input is taken in is its log's to say.
              const taken = yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) => execution.entries(turnId)),
              );
              expect(TurnLog.read(taken).incorporatedThrough(0)).toBe(started.activity.sequence);
              // New work that has not been accepted yet keeps the turn open.
              const more = yield* reply(workspace.id, threadId, "Include the risks too.");
              expect(
                yield* execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (execution) => execution.close(turnId)),
                ),
              ).toEqual({ _tag: "InputPending" });
              yield* accept(workspace.id);
              const second = batch("b2", "Include the risks too.");
              const closing = yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.submitted(turnId, {
                      batchId: second.id,
                      throughSequence: more.activity.sequence,
                      items: second.items,
                    });
                    yield* execution.report(
                      turnId,
                      reported(took(second), ...answered("r2", "The plan, with its risks.")),
                    );
                    return yield* execution.close(turnId);
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
                Effect.flatMap(TurnExecution.Service, (execution) => execution.entries(turnId)),
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
              yield* accept(workspace.id);
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
                yield* accept(workspace.id);
                const [queued] = yield* turnsOf(workspace.id, threadId);
                const turnId = queued!.id;
                const run = <A, E>(
                  step: (execution: TurnExecution.Interface) => Effect.Effect<A, E>,
                ) => execute(workspace.id, Effect.flatMap(TurnExecution.Service, step));

                // A queued turn has written nothing yet, so following it waits for its entries.
                const next = yield* followLog(workspace.id, turnId);
                expect(brief(yield* next)).toBe("opened ");
                const first = batch("b1", "Scout, summarize the plan.");
                yield* run((execution) =>
                  Effect.gen(function* () {
                    yield* execution.start(turnId, selection);
                    yield* execution.submitted(turnId, {
                      batchId: first.id,
                      throughSequence: started.activity.sequence,
                      items: first.items,
                    });
                    yield* execution.report(turnId, reported(took(first)));
                  }),
                );
                expect(brief(yield* next)).toBe("changed 0:InputTaken");
                // A response being written reaches the reader before its block completes.
                yield* run((execution) =>
                  execution.draft(turnId, { responseId: "r1", part: 0, offset: 0, text: "The " }),
                );
                expect(brief(yield* next)).toBe("drafted The ");
                // A reader who starts following mid-response sees what it has written so far.
                yield* Effect.yieldNow;
                const late = yield* followLog(workspace.id, turnId);
                expect(brief(yield* late)).toBe("opened InputTaken");
                expect(brief(yield* late)).toBe("drafted The ");
                yield* run((execution) =>
                  execution.report(turnId, reported(...answered("r1", "The plan is on track."))),
                );
                expect(brief(yield* next)).toBe("changed 1:The plan is on track. (reply)");
                expect(brief(yield* late)).toBe("changed 1:The plan is on track. (reply)");
                // Closing records the turn's end in its log, after every item it wrote.
                yield* run((execution) => execution.close(turnId));
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
              yield* accept(workspace.id);
              const [queued] = yield* turnsOf(workspace.id, started.thread.id);
              const next = yield* followLog(workspace.id, queued!.id);
              expect(brief(yield* next)).toBe("opened ");
              yield* as(
                workspace.id,
                alice,
                Effect.flatMap(TurnApplication.Service, (turns) => turns.cancel(queued!.id)),
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
                  Effect.flatMap(TurnApplication.Service, (turns) => turns.cancel(turnId)),
                );
              yield* accept(workspace.id);
              const [first] = yield* turnsOf(workspace.id, threadId);
              // A queued turn stops at once: nothing runs it yet.
              expect(yield* cancel(first!.id)).toMatchObject({
                status: "cancelled",
                cancelReason: "requested",
              });
              const again = yield* reply(workspace.id, threadId, "Please try again.");
              yield* accept(workspace.id);
              const [second] = yield* turnsOf(workspace.id, threadId);
              expect(second).toMatchObject({
                status: "queued",
                inputAfterSequence: first!.inputAfterSequence,
                acceptedThroughSequence: again.activity.sequence,
              });
              const entriesOf = (turnId: Turn.Id) =>
                execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (execution) => execution.entries(turnId)),
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
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  execution.start(second!.id, selection),
                ),
              );
              expect((yield* entriesOf(second!.id)).map(({ entry }) => entry._tag)).toEqual([
                "History",
                "Started",
              ]);
              // A running turn stops once execution confirms it; meanwhile new work waits.
              expect(yield* cancel(second!.id)).toMatchObject({ status: "cancelling" });
              yield* reply(workspace.id, threadId, "Actually, just the summary.");
              yield* accept(workspace.id);
              expect((yield* turnsOf(workspace.id, threadId)).map(({ status }) => status)).toEqual([
                "cancelling",
                "cancelled",
              ]);
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) => execution.stopped(second!.id)),
              );
              yield* accept(workspace.id);
              const [third] = yield* turnsOf(workspace.id, threadId);
              expect(third?.id).not.toBe(second!.id);
              expect(third?.status).toBe("queued");
              // A failure ends the turn with its reason.
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.start(third!.id, selection);
                    yield* execution.fail(third!.id, "The model provider is unavailable.");
                  }),
                ),
              );
              expect((yield* turnsOf(workspace.id, threadId))[0]).toMatchObject({
                status: "failed",
                failure: "The model provider is unavailable.",
              });
              expect(yield* Effect.flip(cancel(third!.id))).toMatchObject({
                _tag: "TurnApplication.NotActive",
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
              const retry = (turnId: Turn.Id, requestKey?: string) =>
                as(
                  workspace.id,
                  alice,
                  Effect.flatMap(TurnApplication.Service, (turns) =>
                    turns.retry(
                      turnId,
                      requestKey === undefined ? {} : { requestKey: Request.Key.make(requestKey) },
                    ),
                  ),
                );
              const flags = (views: ReadonlyArray<Turn.View>) =>
                views.map(({ status, stoppable, retryable }) => ({ status, stoppable, retryable }));
              yield* accept(workspace.id);
              const [queued] = yield* turnsOf(workspace.id, threadId);
              expect(flags([queued!])).toEqual([
                { status: "queued", stoppable: true, retryable: false },
              ]);
              expect(yield* Effect.flip(retry(queued!.id))).toMatchObject({
                _tag: "TurnApplication.NotRetryable",
                reason: "active",
              });
              // The turn takes its input in, then fails.
              const first = batch("b1", "Scout, draft the notes.");
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.start(queued!.id, selection);
                    yield* execution.submitted(queued!.id, {
                      batchId: first.id,
                      throughSequence: started.activity.sequence,
                      items: first.items,
                    });
                    yield* execution.report(queued!.id, reported(took(first)));
                    yield* execution.fail(queued!.id, "The model provider is unavailable.");
                  }),
                ),
              );
              const [failed] = yield* turnsOf(workspace.id, threadId);
              expect(flags([failed!])).toEqual([
                { status: "failed", stoppable: false, retryable: true },
              ]);

              // Retrying handles the same input again, continuing from the failed turn with what
              // it took in, so that input is not submitted twice.
              const retried = yield* retry(failed!.id, "retry-1");
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
              // The same request returns the turn it created; another finds the failure superseded.
              expect((yield* retry(failed!.id, "retry-1")).id).toBe(retried.id);
              expect(yield* Effect.flip(retry(failed!.id))).toMatchObject({
                _tag: "TurnApplication.NotRetryable",
                reason: "superseded",
              });
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
                  Effect.flatMap(TurnExecution.Service, (execution) =>
                    execution.prepare(retried.id),
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
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.start(retried.id, selection);
                    yield* execution.submitted(retried.id, {
                      batchId: request.id,
                      throughSequence: started.activity.sequence,
                      items: request.items,
                    });
                    yield* execution.report(
                      retried.id,
                      reported(took(request), ...answered("r1", "The notes.")),
                    );
                    yield* execution.close(retried.id);
                  }),
                ),
              );
              expect(yield* Effect.flip(retry(retried.id))).toMatchObject({
                _tag: "TurnApplication.NotRetryable",
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
                  Effect.flatMap(TurnExecution.Service, (execution) => execution.prepare(turnId)),
                );
              const reasoning: Transcript.ResponsePart = {
                _tag: "Reasoning",
                text: "Check the calendar.",
                native: { amends: { anthropic: { signature: "sig" } } },
              };
              yield* accept(workspace.id);
              const [first] = yield* turnsOf(workspace.id, threadId);
              // The agent's log for the thread is empty, with no checkpoint yet.
              expect(first).toMatchObject({ logAfter: null, historyFrom: null, retryOf: null });
              // The first turn records reasoning and an answer, then closes.
              const asked = batch("b1", "Scout, when is the deploy?");
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.start(first!.id, selection);
                    yield* execution.submitted(first!.id, {
                      batchId: asked.id,
                      throughSequence: started.activity.sequence,
                      items: asked.items,
                    });
                    yield* execution.report(
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
                    yield* execution.close(first!.id);
                  }),
                ),
              );
              const more = yield* reply(workspace.id, threadId, "And the rollback plan?");
              yield* accept(workspace.id);
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
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.start(second!.id, selection);
                    yield* execution.submitted(second!.id, {
                      batchId: followUp.id,
                      throughSequence: more.activity.sequence,
                      items: followUp.items,
                    });
                    yield* execution.report(
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
                Effect.flatMap(TurnApplication.Service, (turns) => turns.cancel(second!.id)),
              );
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) => execution.stopped(second!.id)),
              );
              const last = yield* reply(workspace.id, threadId, "Never mind, just the date.");
              yield* accept(workspace.id);
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
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.start(third!.id, selection);
                    return yield* execution.checkpoint(third!.id, {
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
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.submitted(third!.id, {
                      batchId: dateOnly.id,
                      throughSequence: last.activity.sequence,
                      items: dateOnly.items,
                    });
                    yield* execution.report(
                      third!.id,
                      reported(took(dateOnly), ...answered("s3/1", "Thursday.")),
                    );
                    yield* execution.close(third!.id);
                  }),
                ),
              );
              yield* reply(workspace.id, threadId, "Thanks.");
              yield* accept(workspace.id);
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
              yield* accept(workspace.id);
              const [first] = yield* turnsOf(workspace.id, threadId);
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  execution.start(first!.id, selection),
                ),
              );
              yield* as(
                workspace.id,
                alice,
                Effect.flatMap(TurnApplication.Service, (turns) => turns.cancel(first!.id)),
              );
              // A hundred messages ask for the agent's work while its turn is still stopping.
              yield* Effect.forEach(
                Array.from({ length: 100 }, (_, index) => `Update ${index + 1}.`),
                (text) => reply(workspace.id, threadId, text),
                { discard: true },
              );
              // None can be accepted yet, so the run does not ask to run again at once.
              expect(yield* accept(workspace.id)).toEqual({ _tag: "Idle" });
              expect((yield* turnsOf(workspace.id, threadId)).map(({ status }) => status)).toEqual([
                "cancelling",
              ]);
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) => execution.stopped(first!.id)),
              );
              expect(yield* accept(workspace.id)).toEqual({ _tag: "Idle" });
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
                Effect.flatMap(ThreadMessageApplication.Service, (messages) =>
                  messages.publish({
                    threadId,
                    text: "Scout, catch up and summarize.",
                    mentions: [agent.memberId],
                  }),
                ),
              );
              yield* accept(workspace.id);
              const [first] = yield* turnsOf(workspace.id, threadId);
              const prepare = (turnId: Turn.Id) =>
                execute(
                  workspace.id,
                  Effect.flatMap(TurnExecution.Service, (execution) => execution.prepare(turnId)),
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
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.start(first!.id, selection);
                    yield* execution.submitted(first!.id, {
                      batchId: took.id,
                      throughSequence: asked.activity.sequence,
                      items: took.items,
                    });
                    yield* execution.report(
                      first!.id,
                      reported(
                        { _tag: "InputIncorporated", batch: took },
                        ...answered("s1/1", "Here is the summary."),
                      ),
                    );
                    yield* execution.close(first!.id);
                  }),
                ),
              );
              yield* talk(120, "Later note");
              yield* accept(workspace.id);
              const [second] = yield* turnsOf(workspace.id, threadId);
              const backlog = yield* prepare(second!.id);
              expect(backlog._tag).toBe("Ready");
              if (backlog._tag !== "Ready") return;
              expect(backlog.plan.pending?.items).toHaveLength(120);
              expect(backlog.plan.pending?.items[0]).toMatchObject({
                content: [{ text: "Later note 1." }],
              });
              expect(backlog.plan.compaction).toBeUndefined();
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
            yield* accept(workspace.id);
            const participants = yield* as(
              workspace.id,
              identity,
              Effect.flatMap(ThreadApplication.Service, (threads) =>
                threads.listParticipants(threadId, { limit: 10 }),
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
              Effect.flatMap(ThreadParticipationApplication.Service, (participation) =>
                participation.unfollow({ threadId, participationId: mine!.id }),
              ),
            );
            // Taking work in does not look for departures; the process that stops them does.
            yield* accept(workspace.id);
            expect((yield* turnsOf(workspace.id, threadId))[0]?.status).toBe("queued");
            expect(yield* stopDeparted(workspace.id)).toEqual({ _tag: "Idle" });
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
                  Effect.flatMap(TurnApplication.Service, (turns) => turns.retry(stopped!.id)),
                ),
              ),
            ).toMatchObject({ _tag: "TurnApplication.NotRetryable", reason: "departed" });
          }),
        ),
      ),
    );
  });
};
