/**
 * The storage contract for agents, which every storage adapter implements and `AgentProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Store from "../journal/Store.ts";
import * as Agent from "./Agent.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";
import { storeFailure } from "../journal/internal/store-failure.ts";

/**
 * Storage failed while reading or writing agents.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("AgentStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, or a missing
 * agent.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("AgentStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The agent store, bound to one workspace by the host.
 *
 * What a storage adapter implements for agents: `AgentProjection` writes it, and `AgentService`
 * and `AgentQuery` read it.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class AgentStore extends Context.Service<
  AgentStore,
  {
    /** The agent, whether or not its membership ended. */
    readonly get: (id: Agent.Id) => Effect.Effect<Option.Option<Agent.Agent>, Failure>;
    /** The workspace's agents, those whose membership ended included, in no particular order. */
    readonly list: Effect.Effect<ReadonlyArray<Agent.Agent>, Failure>;
    /** Reject a reused ID. Never upsert. */
    readonly insert: (
      record: Agent.Agent,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
    /** Replace a stored agent; a missing record conflicts. */
    readonly update: (
      record: Agent.Agent,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/agent/AgentStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: AgentStore["Service"],
): AgentStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Agent.Id, id), driver.get),
    list: driver.list,
    insert: (record) => Effect.flatMap(write("insert", Agent.Agent, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Agent.Agent, record), driver.update),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Agent.Agent));

/**
 * Agent records over the current workspace transaction.
 */
const makeMemory = Effect.fn("AgentStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  /** Fails when another agent than `record` has its membership, as PostgreSQL's unique index does. */
  const requireOwnMembership = (
    operation: string,
    record: Agent.Agent,
    space: MemoryDatabase.Space,
  ) =>
    Effect.gen(function* () {
      const agents = yield* rows
        .all(space.records.of("agents"))
        .pipe(Effect.mapError(storeFailure(Failure, operation)));
      if (agents.some((agent) => agent.memberId === record.memberId && agent.id !== record.id))
        return yield* new Conflict({
          operation,
          message: "Another agent has this membership",
        });
    });
  const driver: AgentStore["Service"] = {
    get: Effect.fn("AgentStore.memory.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("agents"), id);
      },
      Effect.mapError(storeFailure(Failure, "get")),
    ),
    list: Effect.gen(function* () {
      return yield* rows.all((yield* read).records.of("agents"));
    }).pipe(Effect.mapError(storeFailure(Failure, "list"))),
    insert: Effect.fn("AgentStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (space.records.of("agents").has(record.id))
        return yield* new Conflict({
          operation: "insert",
          message: "Agent ID already exists",
        });
      yield* requireOwnMembership("insert", record, space);
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("agents").set(record.id, row);
    }),
    update: Effect.fn("AgentStore.memory.update")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "update")));
      const found = yield* rows
        .get(space.records.of("agents"), record.id)
        .pipe(Effect.mapError(storeFailure(Failure, "update")));
      if (Option.isNone(found))
        return yield* new Conflict({
          operation: "update",
          message: "Expected a stored agent",
        });
      yield* requireOwnMembership("update", record, space);
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "update")));
      space.records.of("agents").set(record.id, row);
    }),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `AgentStore` in process memory, over the workspace's `Store.MemoryBinding`. It keeps what
 * the contract leaves to storage: a reused ID or an update of a missing agent conflicts, and so
 * does a second agent for one membership, which PostgreSQL refuses with a unique index. `make`
 * checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(AgentStore, makeMemory());
