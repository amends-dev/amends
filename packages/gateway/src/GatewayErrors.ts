/**
 * The outcomes a program run through the gateway may fail with: core's outcomes by kind, from
 * `CoreError.NotFound` to `CoreError.Unavailable`, which pass through unchanged, and the gateway's
 * own `Uncertain`. Every other failure becomes a defect. `PublicError` lists them all, so a kind
 * core adds reaches callers only once it is listed here. The HTTP contract imports this module
 * from `@amends-dev/gateway/GatewayErrors`, which does not load the gateway itself.
 *
 * @since 0.1.0
 */
import { Commit } from "@amends-dev/core/journal";
import { Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { CoreError } from "@amends-dev/core/error";

/**
 * The commit's outcome is unknown; reconcile stored state before repeating.
 *
 * @category errors
 * @since 0.1.0
 */
export class Uncertain extends Schema.TaggedError<Uncertain>()("GatewayErrors.Uncertain", {
  workspaceId: Workspace.Id,
  commitId: Commit.Id,
}) {}

/**
 * Domain outcomes a caller can act on. Storage, transaction, projection, and
 * consistency failures reveal nothing actionable and become defects that keep
 * their original cause for host logging.
 *
 * @category schemas
 * @since 0.1.0
 */
export const PublicError = Schema.Union([
  CoreError.NotFound,
  CoreError.Changed,
  CoreError.Denied,
  CoreError.Conflict,
  CoreError.Invalid,
  CoreError.Unavailable,
  Uncertain,
]);
/**
 * @category schemas
 * @since 0.1.0
 */
export type PublicError = typeof PublicError.Type;

/**
 * The public outcomes of a core program whose error type is `E`: the public errors among `E`,
 * and the storage outcomes and invalid input the gateway adds to every program.
 *
 * @category models
 * @since 0.1.0
 */
export type PublicErrorOf<E> =
  | Extract<E, PublicError>
  | CoreError.Unavailable
  | Uncertain
  | CoreError.Invalid;
