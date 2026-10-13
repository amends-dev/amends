import { Cause, Effect, Record, Schema } from "effect";
import type { ApiClient } from "./client.ts";

/**
 * Why a workspace operation failed, for the reader. `changed`, `denied`, and `gone` mean what the
 * reader sees is out of date; `invalid` and `failed` leave it current, so they may retry at once.
 */
export type WorkspaceFailure = "changed" | "denied" | "gone" | "invalid" | "failed";
/** Whether a failure means the values on screen are out of date, so edits wait for a refresh. */
export const isStale = (failure: string) =>
  failure === "changed" || failure === "denied" || failure === "gone";

/** A command the reader composed that fails the contract's schema before any request. */
export class InvalidCommand extends Schema.TaggedError<InvalidCommand>()("Client.InvalidCommand", {
  message: Schema.String,
}) {}
/** Decode a reader's input for a request, reporting a mismatch as an invalid command. */
export const command = <S extends Schema.Top>(schema: S) => {
  const decode = Schema.decodeUnknownEffect(schema);
  return (input: unknown) =>
    decode(input).pipe(Effect.mapError((error) => new InvalidCommand({ message: error.message })));
};

type Client = ApiClient["Service"];
type Failure<F> = F extends (...args: never) => Effect.Effect<unknown, infer E, unknown>
  ? E
  : never;
/**
 * The workspace, settings, member, access, invitation, conversation, connection, agent, turn, and
 * channel endpoints.
 */
type Endpoints =
  | "workspaces"
  | "settings"
  | "members"
  | "assignments"
  | "invitations"
  | "groups"
  | "threads"
  | "tasks"
  | "notifications"
  | "connections"
  | "agents"
  | "turns"
  | "channels";
/** Every failure those endpoints report. */
type Reported =
  | { readonly [Group in Endpoints]: Failure<Client[Group][keyof Client[Group]]> }[Endpoints]
  | InvalidCommand;
// Keyed by every reported tag, so a new or renamed failure fails to compile until it is placed.
const failures: { readonly [Tag in Reported["_tag"]]: WorkspaceFailure } = {
  // What the reader expected changed since they read it.
  "CoreError.Changed": "changed",
  // The state of what the reader acted on refuses it, such as a member removed or a turn finished
  // meanwhile; `turnRefusal` tells a turn's reasons apart.
  "CoreError.Conflict": "changed",
  // The reader may not do this, for the reason it gives.
  "CoreError.Denied": "denied",
  // Anything the reader named that is missing or out of their reach.
  "CoreError.NotFound": "gone",
  // The request cannot be done as asked, and the draft is kept, such as a name that does not hold,
  // a connection the reader can't use, or a setup that cannot run; `connectionsFailure` and
  // `agentsFailure` tell the reasons they show apart.
  "CoreError.Invalid": "invalid",
  // What the request needs cannot be reached now, such as storage another writer held or a turn's
  // log that stopped short, or too many streams are open: asking again may work. A host that keeps
  // no keys is one too; `connectionsFailure` tells it apart.
  "CoreError.Unavailable": "failed",
  // A commit storage could not confirm, which may have taken effect.
  "CoreError.Uncertain": "failed",
  "ApiErrors.TooManyStreams": "failed",
  "Client.InvalidCommand": "invalid",
  // Rejected credentials sign out in the HTTP layer; the rest are transport or host failures.
  "Authentication.Unauthorized": "failed",
  HttpClientError: "failed",
  // A response that fails its schema; readers' inputs fail as Client.InvalidCommand instead.
  SchemaError: "failed",
};
const hasKnownFailureTag = Schema.is(
  Schema.Struct({ _tag: Schema.Literals(Record.keys(failures)) }),
);
/**
 * Classify the first failure with a recognized tag, including tags mapped to `failed`.
 * Unknown failures, defects, and interruptions are skipped; no recognized failure means `failed`.
 */
export const workspaceFailure = (cause: Cause.Cause<unknown>): WorkspaceFailure => {
  for (const reason of cause.reasons)
    if (Cause.isFailReason(reason) && hasKnownFailureTag(reason.error))
      return failures[reason.error._tag];
  return "failed";
};
