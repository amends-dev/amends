/** Calls to Daytona's SDK, and the sandbox errors their failures amount to. */
import { SandboxError } from "@amends/sandbox-v2";
import {
  DaytonaAuthenticationError,
  DaytonaBadGatewayError,
  DaytonaConnectionError,
  DaytonaForbiddenError,
  DaytonaNotFoundError,
  DaytonaRateLimitError,
  DaytonaServiceUnavailableError,
  DaytonaTimeoutError,
} from "@daytona/sdk";
import { Effect } from "effect";

/** Calls Daytona, failing with the sandbox error its failure amounts to. */
export const call = <A>(request: () => Promise<A>) =>
  Effect.tryPromise({ try: request, catch: fromDaytonaError });

export const sandboxError = (reason: SandboxError.SandboxErrorReason, cause?: unknown) =>
  new SandboxError.SandboxError({ provider: "daytona", reason, cause });

export const fromDaytonaError = (error: unknown) => sandboxError(reasonOf(error), error);

/** The sandbox error reason a failure of Daytona's SDK amounts to. */
const reasonOf = (error: unknown): SandboxError.SandboxErrorReason => {
  const description = error instanceof Error ? error.message : String(error);
  if (error instanceof DaytonaNotFoundError) return new SandboxError.NotFoundError({ description });
  if (error instanceof DaytonaAuthenticationError || error instanceof DaytonaForbiddenError) {
    return new SandboxError.AuthenticationError({ description });
  }
  if (
    error instanceof DaytonaRateLimitError ||
    error instanceof DaytonaTimeoutError ||
    error instanceof DaytonaConnectionError ||
    error instanceof DaytonaBadGatewayError ||
    error instanceof DaytonaServiceUnavailableError
  ) {
    return new SandboxError.UnavailableError({ description });
  }
  return new SandboxError.UnknownError({ description });
};
