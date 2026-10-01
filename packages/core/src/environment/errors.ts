import { Harness, HarnessImplementation } from "@amends/harness";
import { SandboxImplementation } from "@amends/sandbox";
import { Schema } from "effect";
import { Environment } from "./environment.ts";

/** The outcomes `EnvironmentService` reports that a caller can act on; schemas only. */

/** Missing, removed, and unreadable environments share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("EnvironmentService.NotFound", {
  environmentId: Environment.Id,
}) {}

/** The environment's name is no longer the one expected: someone renamed it meanwhile. */
export class Changed extends Schema.TaggedError<Changed>()("EnvironmentService.Changed", {
  environmentId: Environment.Id,
}) {}

/** This host has not installed the harness. */
export class UnknownHarness extends Schema.TaggedError<UnknownHarness>()(
  "EnvironmentService.UnknownHarness",
  { harnessId: Harness.Name },
) {}

/** This host has not installed the sandbox provider. */
export class UnknownSandboxProvider extends Schema.TaggedError<UnknownSandboxProvider>()(
  "EnvironmentService.UnknownSandboxProvider",
  { providerId: SandboxImplementation.Id },
) {}

/**
 * The harness cannot run there: in process when it runs only inside a sandbox, or inside a sandbox
 * when it runs only in process or none was given.
 */
export class UnsupportedPlacement extends Schema.TaggedError<UnsupportedPlacement>()(
  "EnvironmentService.UnsupportedPlacement",
  { harnessId: Harness.Name, placement: HarnessImplementation.Placement },
) {}

/**
 * Why sandbox settings were refused: the provider needs an account and none was given, or takes
 * none; the account connection is not one the actor can read, or not for this provider; the
 * provider takes no template; or the environment has no sandbox to configure.
 */
export const SandboxIssue = Schema.Literals([
  "connection-required",
  "connection-not-allowed",
  "connection-unavailable",
  "connection-mismatch",
  "template-not-allowed",
  "no-sandbox",
]);
export type SandboxIssue = typeof SandboxIssue.Type;

export class InvalidSandbox extends Schema.TaggedError<InvalidSandbox>()(
  "EnvironmentService.InvalidSandbox",
  { issues: Schema.NonEmptyArray(SandboxIssue) },
) {}

export * as EnvironmentErrors from "./errors.ts";
