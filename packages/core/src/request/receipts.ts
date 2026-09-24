import { Context, Crypto, Effect, Encoding, Layer, Option, Result, Schema } from "effect";
import type { PlatformError } from "effect";
import { Actor } from "../identity/actor.ts";
import { Event } from "../journal/event.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import type { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { RequestFacts } from "./facts.ts";
import { Request } from "./request.ts";

/** A schema that encodes to JSON without services, as operation inputs and results do. */
type Standalone = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};

export type Error =
  | Request.Reused
  | Log.ReadError
  | Log.WriteError
  | Projection.Error
  | Event.FactMismatch
  | Schema.SchemaError
  | PlatformError.PlatformError;

/** How one creating operation is recorded and returned again. */
export interface Spec<Input extends Standalone, Result extends Standalone, A, E, R> {
  /** Names the operation, so each has its own keys. */
  readonly operation: string;
  readonly key: Request.Key | undefined;
  /** The decoded input a retry must repeat. */
  readonly input: Input;
  readonly value: Input["Type"];
  /** The IDs of what the operation created, and how to read those records again. */
  readonly result: Result;
  readonly resultOf: (created: A) => Result["Type"];
  readonly restore: (result: Result["Type"]) => Effect.Effect<A, E, R>;
}

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Run a creating operation once per request key, inside the caller's commit. A key the acting
   * member used before for the operation returns the records that request created, without
   * running it again; with a different input, it fails with `Request.Reused`. Otherwise the
   * operation runs and a `request.completed` receipt joins its commit. Without a key it runs.
   */
  readonly once: <Input extends Standalone, Result extends Standalone, A, E, R, E2, R2>(
    spec: Spec<Input, Result, A, E2, R2>,
    run: Effect.Effect<A, E, R>,
  ) => Effect.Effect<
    A,
    E | E2 | Error,
    R | R2 | Actor.Service | Publication.Service | Store.Transaction
  >;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/request/receipts/Service",
) {}

/** A string's UTF-8 bytes; hex encoding reads strings as UTF-8, and valid hex always decodes. */
const utf8 = (text: string) => Result.getOrThrow(Encoding.decodeHex(Encoding.encodeHex(text)));

/** Capture the journal and cryptography; receipts are read and written in each operation's commit. @category constructors */
export const make = Effect.fn("RequestReceipts.make")(function* () {
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const once: Interface["once"] = Effect.fnUntraced(function* <
    Input extends Standalone,
    Result extends Standalone,
    A,
    E,
    R,
    E2,
    R2,
  >(spec: Spec<Input, Result, A, E2, R2>, run: Effect.Effect<A, E, R>) {
    if (spec.key === undefined) return yield* run;
    // The receipt read and write share the operation's commit, so a retry arriving while the
    // first attempt commits waits for it, and one after a rollback runs again.
    yield* Store.Transaction;
    const actor = yield* Actor.Service;
    const idempotencyKey = Store.IdempotencyKey.make(
      `request:${JSON.stringify([spec.operation, actor.memberId, spec.key])}`,
    );
    const encoded = yield* Schema.encodeEffect(Schema.toCodecJson(spec.input))(spec.value);
    const input = Encoding.encodeHex(
      yield* crypto.digest("SHA-256", utf8(JSON.stringify(encoded))),
    );
    const found = yield* journal.log.getAppend(idempotencyKey);
    const receipt = Option.flatMap(found, (entries) => Option.fromUndefinedOr(entries[0]));
    if (Option.isSome(receipt)) {
      const recorded = yield* Event.decode(RequestFacts.Completed, receipt.value);
      if (recorded.payload.input !== input || recorded.payload.operation !== spec.operation)
        return yield* new Request.Reused({ operation: spec.operation, key: spec.key });
      const result = yield* Schema.decodeEffect(Schema.toCodecJson(spec.result))(
        recorded.payload.result,
      );
      return yield* spec.restore(result);
    }
    const created = yield* run;
    const result = yield* Schema.encodeEffect(Schema.toCodecJson(spec.result))(
      spec.resultOf(created),
    );
    yield* journal.publish(
      RequestFacts.Completed,
      {
        workspaceId,
        memberId: actor.memberId,
        operation: spec.operation,
        key: spec.key,
        input,
        result: result as Schema.Json,
      },
      { idempotencyKey },
    );
    return created;
  });

  return Service.of({ workspaceId, once });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as RequestReceipts from "./receipts.ts";
