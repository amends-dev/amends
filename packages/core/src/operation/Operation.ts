/**
 * How an operation reports its failures: by kind, as `CoreError` names them, so its signature lists
 * only what a caller can act on. Each operation passes `report` to the `Effect.fn` that defines it.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as PlatformError from "effect/PlatformError";
import * as CoreError from "../error/CoreError.ts";
import type * as Log from "../journal/Log.ts";
import * as Projection from "../journal/Projection.ts";
import * as Store from "../journal/Store.ts";
import * as StoreError from "../journal/StoreError.ts";
import type * as ThreadActivityKind from "../thread/ThreadActivityKind.ts";
import type * as ThreadCommand from "../thread/ThreadCommand.ts";

/**
 * What core's internals fail with: storage and its commits, the journal's log and projections,
 * stored activity read as a kind it is not, a timeline position another write took, a value that
 * does not decode, and the platform. A caller can act on none as it is: `classify` reports some
 * as kinds, and the rest are defects.
 *
 * @category models
 * @since 0.1.0
 */
export type Internal =
  | Log.WriteError
  | Log.ReadError
  | Projection.Error
  | ThreadActivityKind.Mismatch
  | ThreadCommand.PositionChanged
  | PlatformError.PlatformError;

/**
 * What an operation whose work fails with `E` reports: its kinds as they are, storage and read
 * models it may reach again later as `Unavailable`, a commit storage could not confirm as
 * `Uncertain`, and a value that does not decode as `Invalid`. Other internal failures are defects.
 * A failure that is neither a kind nor internal stays, so the operation's signature, which lists
 * only kinds, refuses it until it is one or the other.
 *
 * @category models
 * @since 0.1.0
 */
export type Failure<E> =
  | Exclude<E, Internal>
  | (E extends StoreError.StoreError | Projection.Behind | Projection.Unregistered
      ? CoreError.Unavailable
      : never)
  | (E extends Store.CommitUncertain ? CoreError.Uncertain : never)
  | (E extends Schema.SchemaError ? CoreError.Invalid : never);

const isCoreError = Schema.is(CoreError.CoreError);
const isStoreError = Schema.is(StoreError.StoreError);
const isCommitUncertain = Schema.is(Store.CommitUncertain);
const isBehind = Schema.is(Projection.Behind);
const isUnregistered = Schema.is(Projection.Unregistered);

/**
 * The kind an operation reports `error` as, or none for a defect. Values reach core decoded, and
 * core trusts what storage returns, so a value that does not decode during an operation is one a
 * caller supplied, such as an invitation's grants. Storage another writer held may be free when
 * asked again, as may read models another host is rebuilding; storage that failed otherwise, and
 * stored state core cannot use, are server errors.
 *
 * @category utils
 * @since 0.1.0
 */
export const classify = (error: unknown): CoreError.CoreError | undefined => {
  if (isCoreError(error)) return error;
  if (isStoreError(error) && error.reason._tag === "Contended")
    return new CoreError.Unavailable({
      reason: new CoreError.Contention({
        operation: error.operation,
        description: error.reason.description,
      }),
    });
  if (isCommitUncertain(error)) return new CoreError.Uncertain({ commitId: error.commitId });
  if (isBehind(error) || isUnregistered(error))
    return new CoreError.Unavailable({ reason: new CoreError.Reloading() });
  if (Schema.isSchemaError(error))
    return new CoreError.Invalid({
      reason: new CoreError.Malformed({ description: error.message }),
    });
  return undefined;
};

/**
 * Report an operation's failures by kind, as `classify` decides, and the rest as defects that keep
 * the original failure for the host's logs.
 *
 * @category utils
 * @since 0.1.0
 */
export const report = <A, E, R>(
  operation: Effect.Effect<A, E, R>,
): Effect.Effect<A, Failure<E>, R> =>
  Effect.catch(operation, (error) => {
    const kind = classify(error);
    return kind === undefined ? Effect.die(error) : Effect.fail(kind as Failure<E>);
  });
