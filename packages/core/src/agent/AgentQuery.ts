/**
 * The reads of agents that turns share: what a turn runs on, and the agent ready to run on it.
 * `TurnExecution` calls it when a turn starts or runs again, as no actor, so it checks no
 * permission: who may direct an agent was checked when its work was asked for. It reads
 * `AgentStore`, `MemberStore`, `ConnectionStore`, and `ConnectionCredentialStore`, and finds each
 * connection's integration among those the host installs. Whoever runs the agent builds its
 * harness and sandbox from what `buildRunnable` gives, so core runs nothing of an agent.
 *
 * @since 0.1.0
 */
import { Integrations } from "@amends-dev/connection";
import { Array, Context, Effect, Layer, Option, Schema } from "effect";
import * as Connection from "../connection/Connection.ts";
import * as ConnectionCredentialStore from "../connection/ConnectionCredentialStore.ts";
import * as ConnectionStore from "../connection/ConnectionStore.ts";
import * as Identity from "../identity/Identity.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as MemberStore from "../workspace/MemberStore.ts";
import * as Agent from "./Agent.ts";
import { Incomplete } from "./internal/agent-errors.ts";
import * as AgentReadiness from "./AgentReadiness.ts";
import * as AgentStore from "./AgentStore.ts";

/**
 * The member is not one of the workspace's agents: it is a person, or its membership ended.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("AgentQuery.NotFound", {
  memberId: MemberId.Id,
}) {}

/**
 * What reading the agent of a member can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError = NotFound | MemberStore.Failure | AgentStore.Failure;

/**
 * What selecting can fail with: what reading the agent and the workspace's connections meets, and
 * `Incomplete`, when the agent cannot run for the issues its readiness reports.
 *
 * @category errors
 * @since 0.1.0
 */
export type SelectError = ReadError | ConnectionStore.Failure | Incomplete;

/**
 * What building can fail with: what selecting meets, and a connection whose key cannot be read.
 *
 * @category errors
 * @since 0.1.0
 */
export type BuildError = SelectError | ConnectionCredentialStore.Failure;

/**
 * An agent ready to run on a selection, as data: what it works by, and the connections of its
 * harness, model, and sandbox, each with its key. Whoever runs the agent builds it from them with
 * the integrations its host installs, so the keys go to it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Runnable = Schema.Struct({
  instructions: Agent.Instructions,
  harness: Connection.Access,
  /** The model's connection, and the model as its integration's endpoint takes it. */
  model: Schema.Struct({ ...Connection.Access.fields, model: Agent.Model }),
  /** The sandbox's connection, or none for an agent that works without a sandbox. */
  sandbox: Schema.NullOr(Connection.Access),
});
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Runnable extends Schema.Schema.Type<typeof Runnable> {}

/**
 * The agent reads turns share, which jobs call as no actor.
 *
 * @category services
 * @since 0.1.0
 */
export class AgentQuery extends Context.Service<
  AgentQuery,
  {
    /**
     * The harness, model, and sandbox the agent of `memberId` runs a turn on now, as it is set up.
     * On `Auto`, the harness is that of `previous`, the selection of its last turn in the
     * conversation, while it can still run on it, and otherwise the oldest it can run on.
     */
    readonly select: (
      memberId: MemberId.Id,
      previous: Agent.Selection | undefined,
    ) => Effect.Effect<Agent.Selection, SelectError>;

    /**
     * The agent of `memberId` ready to run on `selection`: its instructions, and each connection of
     * the selection with the key it holds. Fails with `Incomplete` when a connection of the selection
     * can no longer give its part, as when it was removed since the selection was made, or it has no
     * key.
     */
    readonly buildRunnable: (
      memberId: MemberId.Id,
      selection: Agent.Selection,
    ) => Effect.Effect<Runnable, BuildError>;
  }
>()("@amends-dev/core/agent/AgentQuery") {}

/** `selection` as the setup whose readiness says whether it can run. */
const setupOf = (selection: Agent.Selection): AgentReadiness.Setup => ({
  harness: { _tag: "Connection", connectionId: selection.harness.connectionId },
  model: selection.model,
  sandbox: selection.sandbox,
});

/** A connection's failure to give `part`, as the issue it is to the agent. */
const invalid = (part: Agent.Part, description: string) =>
  new Incomplete({ issues: [{ _tag: "Invalid", part, description }] });

/**
 * Capture the stores and the host's integrations; each read finds the agent by its membership.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("AgentQuery.make")(function* () {
  const memberStore = yield* MemberStore.MemberStore;
  const agentStore = yield* AgentStore.AgentStore;
  const connectionStore = yield* ConnectionStore.ConnectionStore;
  const connectionCredentialStore = yield* ConnectionCredentialStore.ConnectionCredentialStore;
  const integrations = yield* Integrations.Integrations;

  /** The agent whose membership `memberId` is, while it lasts. */
  const requireAgent = Effect.fnUntraced(function* (memberId: MemberId.Id) {
    const member = yield* memberStore.get(memberId);
    if (Option.isNone(member) || member.value.status !== "active")
      return yield* new NotFound({ memberId });
    const { identity } = member.value;
    if (!Identity.MemberReference.isAnyOf(["Agent"])(identity))
      return yield* new NotFound({ memberId });
    const found = yield* agentStore.get(identity.id);
    if (Option.isNone(found)) return yield* new NotFound({ memberId });
    return found.value;
  });

  /** Fails unless an agent set up as `setup` can run over `connections`. */
  const requireRunnable = Effect.fnUntraced(function* (
    setup: AgentReadiness.Setup,
    connections: AgentReadiness.Connections,
  ) {
    const issues = yield* AgentReadiness.issuesOf(setup, connections, integrations);
    if (Array.isReadonlyArrayNonEmpty(issues)) return yield* new Incomplete({ issues });
  });

  /**
   * The connection whose harness the agent runs on: the one its setup names, or, on `Auto`, the
   * one chosen among those it can run on, which fails when there is none.
   */
  const harnessFor = Effect.fnUntraced(function* (
    record: Agent.Agent,
    connections: AgentReadiness.Connections,
    previous: Agent.Selection | undefined,
  ) {
    if (record.harness._tag === "Connection") return record.harness.connectionId;
    const choices = yield* AgentReadiness.harnessesToChoose(record, connections, integrations);
    const chosen = AgentReadiness.chooseHarness(choices, previous?.harness.connectionId);
    if (chosen === undefined) return yield* new Incomplete({ issues: [{ _tag: "NoHarness" }] });
    return chosen;
  });

  /**
   * The connection for `part` as its integration takes it, with the key it holds. Fails for `part`
   * when the connection is gone, it authenticates with a key it has none of, or its key cannot be
   * read because this host keeps none.
   */
  const accessFor = Effect.fnUntraced(function* (
    part: Agent.Part,
    connectionId: Connection.Id,
    connections: AgentReadiness.Connections,
  ) {
    const resolved = yield* AgentReadiness.resolveConnection(
      connectionId,
      connections,
      integrations,
    );
    if (resolved._tag !== "Installed")
      return yield* new Incomplete({ issues: [{ _tag: resolved._tag, part }] });
    const { connection } = resolved;
    if (connection.auth === "none")
      return { connection, credential: null } satisfies Connection.Access;
    const credential = yield* connectionCredentialStore
      .get(connectionId)
      .pipe(
        Effect.catchTag("ConnectionCredentialStore.Unavailable", ({ reason }) =>
          invalid(part, reason),
        ),
      );
    if (Option.isNone(credential))
      return yield* invalid(part, `The connection ${connection.name} has no API key`);
    return { connection, credential: credential.value } satisfies Connection.Access;
  });

  const select = Effect.fn("AgentQuery.select")(function* (
    memberId: MemberId.Id,
    previous: Agent.Selection | undefined,
  ) {
    const record = yield* requireAgent(memberId);
    const connections = yield* connectionStore.listActive;
    const selection: Agent.Selection = {
      harness: { connectionId: yield* harnessFor(record, connections, previous) },
      model: record.model,
      sandbox: record.sandbox,
    };
    yield* requireRunnable(setupOf(selection), connections);
    return selection;
  });

  const buildRunnable = Effect.fn("AgentQuery.buildRunnable")(function* (
    memberId: MemberId.Id,
    selection: Agent.Selection,
  ) {
    const record = yield* requireAgent(memberId);
    const connections = yield* connectionStore.listActive;
    yield* requireRunnable(setupOf(selection), connections);
    const harness = yield* accessFor("harness", selection.harness.connectionId, connections);
    const model = yield* accessFor("model", selection.model.connectionId, connections);
    const sandbox =
      selection.sandbox === null
        ? null
        : yield* accessFor("sandbox", selection.sandbox.connectionId, connections);
    const runnable: Runnable = {
      instructions: record.instructions,
      harness,
      model: { ...model, model: selection.model },
      sandbox,
    };
    return runnable;
  });

  return AgentQuery.of({ select, buildRunnable });
});

/**
 * Provide the agent reads over the member, agent, connection, and credential stores, and the
 * host's integrations.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(AgentQuery, make());
