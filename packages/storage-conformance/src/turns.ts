import type * as Core from "@amends/core";
import { AgentApplication } from "@amends/core/agent";
import { BuiltinRoles } from "@amends/core/authorization";
import { ConnectionApplication } from "@amends/core/connection";
import { Environment } from "@amends/core/environment";
import { Group } from "@amends/core/group";
import { Identity, type Actor } from "@amends/core/identity";
import { Notification } from "@amends/core/notification";
import {
  ThreadApplication,
  ThreadMessageApplication,
  ThreadParticipationApplication,
} from "@amends/core/thread";
import { Turn, TurnApplication, TurnExecution } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { HarnessEvent, type Transcript } from "@amends/harness";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
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
const batch = (id: string, text: string) => ({
  id: HarnessEvent.BatchId.make(id),
  items: [input(text)] as const,
});
const answered = (responseId: string, text: string): ReadonlyArray<HarnessEvent.Event> => [
  {
    _tag: "ResponseCompleted",
    response: {
      _tag: "Response",
      id: responseId as Transcript.ResponseId,
      parts: [{ _tag: "Text", text }],
    },
    finish: "stop",
  },
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
                incorporatedThroughSequence: started.activity.sequence - 1,
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
      "execution takes input in, and closing publishes the agent's reply once nothing waits",
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
              const progressed = yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  Effect.gen(function* () {
                    yield* execution.submitted(turnId, {
                      batchId: first.id,
                      throughSequence: started.activity.sequence,
                    });
                    return yield* execution.report(turnId, [
                      { _tag: "InputIncorporated", batch: first },
                      ...answered("r1", "An early answer."),
                    ]);
                  }),
                ),
              );
              expect(progressed.incorporatedThroughSequence).toBe(started.activity.sequence);
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
                    });
                    yield* execution.report(turnId, [
                      { _tag: "InputIncorporated", batch: second },
                      ...answered("r2", "The plan, with its risks."),
                    ]);
                    return yield* execution.close(turnId);
                  }),
                ),
              );
              expect(closing._tag).toBe("Closed");
              const [closed] = yield* turnsOf(workspace.id, threadId);
              expect(closed).toMatchObject({
                status: "completed",
                incorporatedThroughSequence: more.activity.sequence,
              });
              expect(closed?.messageId).not.toBeNull();
              // The reply is the agent's own message, from the last response, verbatim.
              const timeline = yield* as(
                workspace.id,
                alice,
                Effect.flatMap(ThreadApplication.Service, (threads) =>
                  threads.readTimeline(threadId, { limit: 10 }),
                ),
              );
              const last = timeline.at(-1);
              expect(last).toMatchObject({
                activity: { kind: "message.published" },
                message: {
                  id: closed!.messageId,
                  author: { _tag: "Member", memberId: agent.memberId },
                  text: "The plan, with its risks.",
                },
              });
              // The log keeps both responses; the thread shows only the last.
              const entries = yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) => execution.entries(turnId)),
              );
              expect(entries.filter((entry) => entry._tag === "Submitted")).toHaveLength(2);
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
                inputAfterSequence: first!.incorporatedThroughSequence,
                acceptedThroughSequence: again.activity.sequence,
              });
              yield* execute(
                workspace.id,
                Effect.flatMap(TurnExecution.Service, (execution) =>
                  execution.start(second!.id, selection),
                ),
              );
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
            }),
          ),
        ),
      60_000,
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
            yield* accept(workspace.id);
            expect((yield* turnsOf(workspace.id, threadId))[0]).toMatchObject({
              status: "cancelled",
              cancelReason: "participation-ended",
            });
          }),
        ),
      ),
    );
  });
};
