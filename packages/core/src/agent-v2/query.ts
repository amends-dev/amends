import { type Connection, Integrations } from "@amends/connection-v2";
import type { Harness } from "@amends/harness-v2";
import type { SandboxProvider } from "@amends/sandbox-v2";
import { Array, Context, Effect, Layer, Option, Schema, type Scope } from "effect";
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

/** An agent ready to run on a selection. */
export interface Runnable {
  /** What the agent works by, as it is set up now. */
  readonly instructions: AgentV2.Instructions;

  /** The harness of the selection's harness connection, running the agent on its model. */
  readonly harness: Harness.Harness["Service"];

  /**
   * The provider of the sandboxes of the selection's sandbox connection, which works until the
   * scope that runs it closes, or nothing for an agent that works without a sandbox. Nothing runs
   * until the caller runs it, in a scope of its own.
   */
  readonly sandboxProvider:
    | Effect.Effect<
        SandboxProvider.SandboxProvider["Service"],
        Connection.ConnectionError,
        Scope.Scope
      >
    | undefined;
}

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
   * The agent of `memberId` ready to run on `selection`: its instructions, the harness of the
   * selection's connection, given the key it holds, and its sandbox provider. Fails with
   * `Incomplete` when a connection of the selection can no longer give its part, as when it was
   * removed since the selection was made, or it has no key.
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
   * when the connection is gone, or its key cannot be read because this host keeps none.
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
    const credential =
      resolved.connection.auth === "apiKey"
        ? yield* connectionV2CredentialStore.get(connectionId).pipe(
            Effect.map(Option.getOrUndefined),
            Effect.catchTag("ConnectionV2CredentialStore.Unavailable", ({ reason }) =>
              Effect.fail(invalid(part, reason)),
            ),
          )
        : undefined;
    return { ...resolved, credential };
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
    const modelAccess = yield* accessFor("model", selection.model.connectionId, connections);
    const endpoint = yield* modelAccess.integration
      .modelEndpoint(modelAccess.connection, modelAccess.credential, {
        model: selection.model.id,
        ...(selection.model.effort === undefined ? {} : { effort: selection.model.effort }),
      })
      .pipe(Effect.mapError((error) => invalid("model", error.reason.description)));
    const harnessAccess = yield* accessFor("harness", selection.harness.connectionId, connections);
    const harness = yield* harnessAccess.integration
      .harness(harnessAccess.connection, harnessAccess.credential, { model: endpoint })
      .pipe(Effect.mapError((error) => invalid("harness", error.reason.description)));
    const sandboxAccess =
      selection.sandbox === null
        ? undefined
        : yield* accessFor("sandbox", selection.sandbox.connectionId, connections);
    const runnable: Runnable = {
      instructions: record.instructions,
      harness,
      sandboxProvider:
        sandboxAccess === undefined
          ? undefined
          : sandboxAccess.integration.sandboxProvider(
              sandboxAccess.connection,
              sandboxAccess.credential,
            ),
    };
    return runnable;
  });

  return Service.of({ select, buildRunnable });
});

/** Internal reads that turns share. @category layers */
export const layer = Layer.effect(Service, make());

export * as AgentV2Query from "./query.ts";
