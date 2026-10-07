import { Connection, Integrations } from "@amends/connection-v2";
import { Array, Context, Effect, Layer, Option, Schema } from "effect";
import { ConnectionV2 } from "../connection-v2/connection.ts";
import { ConnectionV2CredentialStore } from "../connection-v2/credential-store.ts";
import { ConnectionV2Store } from "../connection-v2/store.ts";
import { Identity } from "../identity/identity.ts";
import { MemberId } from "../workspace/member/id.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { AgentV2 } from "./agent.ts";
import { Incomplete } from "./errors.ts";
import { AgentV2Readiness } from "./readiness.ts";
import { AgentV2Store } from "./store.ts";

/** The member is not one of the workspace's agents: it is a person, or its membership ended. */
export class NotFound extends Schema.TaggedError<NotFound>()("AgentV2Query.NotFound", {
  memberId: MemberId.Id,
}) {}

export type ReadError = NotFound | MemberStore.Failure | AgentV2Store.Failure;
/** The agent cannot run, for the issues its readiness reports, besides what reading meets. */
export type SelectError = ReadError | ConnectionV2Store.Failure | Incomplete;
/** Building can also meet a connection whose key cannot be read. */
export type BuildError = SelectError | ConnectionV2CredentialStore.Failure;

/** A connection as its integration takes it, with its key when it authenticates with one. */
export const Access = Schema.Struct({
  connection: Connection.Connection,
  credential: Schema.NullOr(Connection.Credential),
});
export interface Access extends Schema.Schema.Type<typeof Access> {}

/**
 * An agent ready to run on a selection, as data: what it works by, and the connections of its
 * harness, model, and sandbox, each with its key. Whoever runs the agent builds it from them with
 * the integrations its host installs, so the keys go to it.
 */
export const Runnable = Schema.Struct({
  instructions: AgentV2.Instructions,
  harness: Access,
  /** The model's connection, and the model as its integration's endpoint takes it. */
  model: Schema.Struct({ ...Access.fields, model: AgentV2.Model }),
  /** The sandbox's connection, or none for an agent that works without a sandbox. */
  sandbox: Schema.NullOr(Access),
});
export interface Runnable extends Schema.Schema.Type<typeof Runnable> {}

export interface Interface {
  /**
   * The harness, model, and sandbox the agent of `memberId` runs a turn on now, as it is set up.
   * On `Auto`, the harness is that of `previous`, the selection of its last turn in the
   * conversation, while it can still run on it, and otherwise the oldest it can run on.
   */
  readonly select: (
    memberId: MemberId.Id,
    previous: AgentV2.Selection | undefined,
  ) => Effect.Effect<AgentV2.Selection, SelectError>;

  /**
   * The agent of `memberId` ready to run on `selection`: its instructions, and each connection of
   * the selection with the key it holds. Fails with `Incomplete` when a connection of the selection
   * can no longer give its part, as when it was removed since the selection was made, or it has no
   * key.
   */
  readonly buildRunnable: (
    memberId: MemberId.Id,
    selection: AgentV2.Selection,
  ) => Effect.Effect<Runnable, BuildError>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/agent-v2/query/Service",
) {}

/** `selection` as the setup whose readiness says whether it can run. */
const setupOf = (selection: AgentV2.Selection): AgentV2Readiness.Setup => ({
  harness: { _tag: "Connection", connectionId: selection.harness.connectionId },
  model: selection.model,
  sandbox: selection.sandbox,
});

/** `issues` as a failure, or nothing when there are none. */
const requireNoIssues = (issues: ReadonlyArray<AgentV2.Issue>) =>
  Array.isReadonlyArrayNonEmpty(issues) ? Effect.fail(new Incomplete({ issues })) : Effect.void;

/** A connection's failure to give `part`, as the issue it is to the agent. */
const invalid = (part: AgentV2.Part, description: string) =>
  new Incomplete({ issues: [{ _tag: "Invalid", part, description }] });

/** @category constructors */
export const make = Effect.fn("AgentV2Query.make")(function* () {
  const memberStore = yield* MemberStore.Service;
  const agentV2Store = yield* AgentV2Store.Service;
  const connectionV2Store = yield* ConnectionV2Store.Service;
  const connectionV2CredentialStore = yield* ConnectionV2CredentialStore.Service;
  const integrations = yield* Integrations.Integrations;

  /** The agent whose membership `memberId` is, while it lasts. */
  const requireAgent = Effect.fnUntraced(function* (memberId: MemberId.Id) {
    const member = yield* memberStore.get(memberId);
    if (
      Option.isNone(member) ||
      member.value.status !== "active" ||
      !Identity.MemberReference.isAnyOf(["Agent"])(member.value.identity)
    )
      return yield* new NotFound({ memberId });
    const found = yield* agentV2Store.get(member.value.identity.id);
    if (Option.isNone(found)) return yield* new NotFound({ memberId });
    return found.value;
  });

  /** The workspace's connections that are not removed, by id. */
  const readConnections = Effect.map(
    connectionV2Store.listActive,
    (records): AgentV2Readiness.Connections =>
      new Map(records.map((record) => [record.id, record])),
  );

  /**
   * The connection for `part` as its integration takes it, with the key it holds. Fails for `part`
   * when the connection is gone, it authenticates with a key it has none of, or its key cannot be
   * read because this host keeps none.
   */
  const accessFor = Effect.fnUntraced(function* (
    part: AgentV2.Part,
    connectionId: ConnectionV2.Id,
    connections: AgentV2Readiness.Connections,
  ) {
    const resolved = yield* AgentV2Readiness.resolveConnection(
      connectionId,
      connections,
      integrations,
    );
    if (resolved._tag !== "Installed")
      return yield* new Incomplete({ issues: [{ _tag: resolved._tag, part }] });
    const { connection } = resolved;
    if (connection.auth === "none") return { connection, credential: null } satisfies Access;
    const credential = yield* connectionV2CredentialStore
      .get(connectionId)
      .pipe(
        Effect.catchTag("ConnectionV2CredentialStore.Unavailable", ({ reason }) =>
          Effect.fail(invalid(part, reason)),
        ),
      );
    if (Option.isNone(credential))
      return yield* invalid(part, `The connection ${connection.name} has no API key`);
    return { connection, credential: credential.value } satisfies Access;
  });

  const select = Effect.fn("AgentV2Query.select")(function* (
    memberId: MemberId.Id,
    previous: AgentV2.Selection | undefined,
  ) {
    const record = yield* requireAgent(memberId);
    const connections = yield* readConnections;
    yield* requireNoIssues(yield* AgentV2Readiness.issuesOf(record, connections, integrations));
    const harness =
      record.harness._tag === "Connection"
        ? record.harness.connectionId
        : AgentV2Readiness.chooseHarness(
            yield* AgentV2Readiness.harnessesToChoose(record, connections, integrations),
            previous?.harness.connectionId,
          );
    // Readiness found a harness to choose, which `chooseHarness` then gives.
    if (harness === undefined) return yield* new Incomplete({ issues: [{ _tag: "NoHarness" }] });
    const selection: AgentV2.Selection = {
      harness: { connectionId: harness },
      model: record.model,
      sandbox: record.sandbox,
    };
    return selection;
  });

  const buildRunnable = Effect.fn("AgentV2Query.buildRunnable")(function* (
    memberId: MemberId.Id,
    selection: AgentV2.Selection,
  ) {
    const record = yield* requireAgent(memberId);
    const connections = yield* readConnections;
    yield* requireNoIssues(
      yield* AgentV2Readiness.issuesOf(setupOf(selection), connections, integrations),
    );
    const runnable: Runnable = {
      instructions: record.instructions,
      harness: yield* accessFor("harness", selection.harness.connectionId, connections),
      model: {
        ...(yield* accessFor("model", selection.model.connectionId, connections)),
        model: selection.model,
      },
      sandbox:
        selection.sandbox === null
          ? null
          : yield* accessFor("sandbox", selection.sandbox.connectionId, connections),
    };
    return runnable;
  });

  return Service.of({ select, buildRunnable });
});

/** Internal reads that turns share. @category layers */
export const layer = Layer.effect(Service, make());

export * as AgentV2Query from "./query.ts";
