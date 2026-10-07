import { expect, it } from "@effect/vitest";
import { DateTime, Effect, Exit, Option } from "effect";
import { Agent } from "../../src/agent/agent.ts";
import { AgentFacts } from "../../src/agent/facts.ts";
import { AgentProjection } from "../../src/agent/projection.ts";
import { AgentStore } from "../../src/agent/store.ts";
import { Connection } from "../../src/connection/connection.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Publication } from "../../src/journal/publication.ts";
import { Store } from "../../src/journal/store.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { Workspace } from "../../src/workspace/workspace.ts";
import { make } from "../memory-store.ts";
import { testProvenance } from "../publication.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const logId = Log.Id.make("workspace-one/journal");

const created: Agent.Record = {
  id: Agent.Id.make("agent-one"),
  workspaceId,
  memberId: Member.Id.make("member-agent"),
  instructions: "Review each change.",
  harness: { _tag: "Auto" },
  model: { connectionId: Connection.Id.make("conn-models"), id: "claude-opus-5-5" },
  sandbox: null,
  createdBy: Member.Id.make("member-owner"),
  createdAt: DateTime.makeUnsafe("2026-10-06T12:00:00.000Z"),
};

/** Agents in memory, refusing a reused id and a missing one as storage does. */
const agentsInMemory = () => {
  const records = new Map<string, Agent.Record>();
  const conflict = (operation: string, message: string) =>
    Effect.fail(new AgentStore.Conflict({ operation, message }));
  return AgentStore.Service.of({
    get: (id) => Effect.sync(() => Option.fromNullishOr(records.get(id))),
    list: Effect.sync(() => [...records.values()]),
    insert: (record) =>
      records.has(record.id)
        ? conflict("insert", "The agent exists")
        : Effect.sync(() => void records.set(record.id, record)),
    update: (record) =>
      records.has(record.id)
        ? Effect.sync(() => void records.set(record.id, record))
        : conflict("update", "The agent is missing"),
  });
};

/** Publishes in one commit, projecting agents into `agentStore`. */
const commit = (
  agentStore: AgentStore.Interface,
  publish: (journal: Journal.Interface) => Effect.Effect<unknown, unknown, Publication.Service>,
) =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* Effect.gen(function* () {
      const journal = yield* Journal.make({ logId, projections: [AgentProjection.definition] });
      yield* journal.commit(publish(journal));
    }).pipe(
      Effect.provideService(Publication.Service, testProvenance(workspaceId)),
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
      Effect.provideService(AgentStore.Service, agentStore),
    );
  });

it.effect("records an agent, and replaces how it is set up as a whole", () =>
  Effect.gen(function* () {
    const agentStore = agentsInMemory();
    const configured = {
      instructions: "Review each change, then test it.",
      harness: { _tag: "Connection", connectionId: Connection.Id.make("conn-opencode") },
      model: {
        connectionId: Connection.Id.make("conn-models"),
        id: "claude-sonnet-5-5",
        effort: "high",
      },
      sandbox: { connectionId: Connection.Id.make("conn-daytona") },
    } as const;

    yield* commit(agentStore, (journal) =>
      Effect.gen(function* () {
        yield* journal.publish(AgentFacts.Created, created);
        expect(yield* agentStore.get(created.id)).toEqual(Option.some(created));
        yield* journal.publish(AgentFacts.Configured, {
          workspaceId,
          agentId: created.id,
          memberId: created.memberId,
          ...configured,
        });
      }),
    );

    expect(yield* agentStore.list).toEqual([Agent.change(created, configured)]);
  }),
);

it.effect("dies on a change to an agent it never recorded", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      commit(agentsInMemory(), (journal) =>
        journal.publish(AgentFacts.Configured, {
          workspaceId,
          agentId: created.id,
          memberId: created.memberId,
          instructions: created.instructions,
          harness: created.harness,
          model: created.model,
          sandbox: created.sandbox,
        }),
      ),
    );

    expect(Exit.hasDies(exit)).toBe(true);
  }),
);
