import { expect, it } from "@effect/vitest";
import { DateTime, Effect, Exit, Option } from "effect";
import { AgentV2 } from "../../src/agent-v2/agent.ts";
import { AgentV2Facts } from "../../src/agent-v2/facts.ts";
import { AgentV2Projection } from "../../src/agent-v2/projection.ts";
import { AgentV2Store } from "../../src/agent-v2/store.ts";
import { ConnectionV2 } from "../../src/connection-v2/connection.ts";
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

const created: AgentV2.Record = {
  id: AgentV2.Id.make("agent-one"),
  workspaceId,
  memberId: Member.Id.make("member-agent"),
  instructions: "Review each change.",
  harness: { _tag: "Auto" },
  model: { connectionId: ConnectionV2.Id.make("conn-models"), id: "claude-opus-5-5" },
  sandbox: null,
  createdBy: Member.Id.make("member-owner"),
  createdAt: DateTime.makeUnsafe("2026-10-06T12:00:00.000Z"),
};

/** Agents in memory, refusing a reused id and a missing one as storage does. */
const agentsInMemory = () => {
  const records = new Map<string, AgentV2.Record>();
  const conflict = (operation: string, message: string) =>
    Effect.fail(new AgentV2Store.Conflict({ operation, message }));
  return AgentV2Store.Service.of({
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

/** Publishes in one commit, projecting agents into `agentV2Store`. */
const commit = (
  agentV2Store: AgentV2Store.Interface,
  publish: (journal: Journal.Interface) => Effect.Effect<unknown, unknown, Publication.Service>,
) =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* Effect.gen(function* () {
      const journal = yield* Journal.make({ logId, projections: [AgentV2Projection.definition] });
      yield* journal.commit(publish(journal));
    }).pipe(
      Effect.provideService(Publication.Service, testProvenance(workspaceId)),
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
      Effect.provideService(AgentV2Store.Service, agentV2Store),
    );
  });

it.effect("records an agent, and replaces how it is set up as a whole", () =>
  Effect.gen(function* () {
    const agentV2Store = agentsInMemory();
    const configured = {
      instructions: "Review each change, then test it.",
      harness: { _tag: "Connection", connectionId: ConnectionV2.Id.make("conn-opencode") },
      model: {
        connectionId: ConnectionV2.Id.make("conn-models"),
        id: "claude-sonnet-5-5",
        effort: "high",
      },
      sandbox: { connectionId: ConnectionV2.Id.make("conn-daytona") },
    } as const;

    yield* commit(agentV2Store, (journal) =>
      Effect.gen(function* () {
        yield* journal.publish(AgentV2Facts.Created, created);
        expect(yield* agentV2Store.get(created.id)).toEqual(Option.some(created));
        yield* journal.publish(AgentV2Facts.Configured, {
          workspaceId,
          agentId: created.id,
          memberId: created.memberId,
          ...configured,
        });
      }),
    );

    expect(yield* agentV2Store.list).toEqual([AgentV2.change(created, configured)]);
  }),
);

it.effect("dies on a change to an agent it never recorded", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      commit(agentsInMemory(), (journal) =>
        journal.publish(AgentV2Facts.Configured, {
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
