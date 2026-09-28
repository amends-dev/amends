import type { ConnectionImplementation } from "@amends/connection";
import type { HarnessImplementation } from "@amends/harness";
import type { SandboxImplementation } from "@amends/sandbox";
import { Option, Schema } from "effect";
import { Connection } from "../connection/connection.ts";
import { Environment } from "./environment.ts";

/** The account an environment's sandbox runs under, as readiness looks it up. */
export interface Account {
  readonly record: Option.Option<Connection.Record>;
  readonly declaration: Option.Option<ConnectionImplementation.Declaration>;
}

/**
 * Whether an environment can run now, from the host's catalog and its account connection. It
 * does not check that a provider accepts the account: nothing contacts the provider.
 */
export const readiness = (
  record: Environment.Record,
  installed: {
    readonly harness: Option.Option<HarnessImplementation.Declaration>;
    readonly sandbox: Option.Option<SandboxImplementation.Declaration>;
  },
  account: Account,
): Environment.Readiness => {
  const issues: Array<Environment.Issue> = [];
  if (Option.isNone(installed.harness)) issues.push("harness-unavailable");
  if (record.sandbox !== null) {
    const provider = installed.sandbox;
    if (Option.isNone(provider)) issues.push("sandbox-unavailable");
    else if (provider.value.account) {
      const connection = Option.filter(account.record, (found) => found.status === "active");
      const declaration = account.declaration;
      if (
        record.sandbox.connectionId === null ||
        Option.isNone(connection) ||
        Option.isNone(declaration) ||
        declaration.value.capabilities.sandbox?.provider !== provider.value.id
      )
        issues.push("connection-unavailable");
      else if (Connection.readiness(connection.value, declaration.value)._tag === "Incomplete")
        issues.push("connection-incomplete");
    }
  }
  const [first, ...rest] = issues;
  return first === undefined ? { _tag: "Ready" } : { _tag: "Incomplete", issues: [first, ...rest] };
};

/** The model access an agent or a turn asks an environment to run with. */
export interface Selection {
  readonly connection: Connection.View;
  /** The provider's model identifier; nothing checks it against the provider yet. */
  readonly model: string;
  readonly reasoning?: string | undefined;
}

/**
 * Why a selection cannot run in an environment: the environment itself cannot run now; the
 * connection does not provide model inference, or still needs setup; the harness does not speak
 * the connection's interface; or it cannot request that reasoning level.
 */
export const Reason = Schema.TaggedUnion({
  EnvironmentNotReady: { issues: Schema.NonEmptyArray(Environment.Issue) },
  NoModelInference: {},
  ConnectionNotReady: {},
  InterfaceUnsupported: { interface: Schema.String },
  ReasoningUnsupported: { reasoning: Schema.String },
});
export type Reason = typeof Reason.Type;

export const Compatibility = Schema.TaggedUnion({
  Compatible: {},
  Incompatible: { reasons: Schema.NonEmptyArray(Reason) },
});
export type Compatibility = typeof Compatibility.Type;

/**
 * Whether an environment can run a model selection. Agent setup, environment choices, turn setup,
 * and transfers all ask this one question, so a stale choice cannot bypass it.
 */
export const check = (
  environment: Environment.View,
  harness: HarnessImplementation.Declaration | undefined,
  selection: Selection,
): Compatibility => {
  const reasons: Array<Reason> = [];
  if (environment.readiness._tag === "Incomplete")
    reasons.push({ _tag: "EnvironmentNotReady", issues: environment.readiness.issues });
  const inference = selection.connection.installed
    ? selection.connection.capabilities.modelInference
    : undefined;
  if (inference === undefined) reasons.push({ _tag: "NoModelInference" });
  else {
    if (selection.connection.readiness.modelInference?._tag !== "Ready")
      reasons.push({ _tag: "ConnectionNotReady" });
    if (
      harness?.models._tag === "Interfaces" &&
      !harness.models.interfaces.includes(inference.interface)
    )
      reasons.push({ _tag: "InterfaceUnsupported", interface: inference.interface });
  }
  if (
    harness !== undefined &&
    selection.reasoning !== undefined &&
    !(harness.reasoning ?? ([] as ReadonlyArray<string>)).includes(selection.reasoning)
  )
    reasons.push({ _tag: "ReasoningUnsupported", reasoning: selection.reasoning });
  const [first, ...rest] = reasons;
  return first === undefined
    ? { _tag: "Compatible" }
    : { _tag: "Incompatible", reasons: [first, ...rest] };
};

export * as EnvironmentCompatibility from "./compatibility.ts";
