import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { AgentPermissions } from "../agent/permissions.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import type { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { ThreadAccess } from "../thread/access.ts";
import { ThreadId } from "../thread/id.ts";
import { NotActive, NotFound } from "./errors.ts";
import { TurnFacts } from "./facts.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";
export { NotActive, NotFound } from "./errors.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "TurnApplication.InvalidResponse",
  { message: Schema.String },
) {}

export type ReadError =
  | Exclude<ThreadAccess.Error, ThreadAccess.NotFound>
  | TurnStore.Failure
  | Schema.SchemaError
  | InvalidResponse
  | NotFound;
export type CancelError =
  | ReadError
  | NotActive
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;

export interface Interface {
  readonly workspaceId: Turn.Record["workspaceId"];
  /** A turn in a thread the reader may open; any other is NotFound. */
  readonly get: (turnId: Turn.Id) => Effect.Effect<Turn.Record, ReadError, Actor.Service>;
  /** A thread's turns, newest first, at most `limit`, for a reader who may open the thread. */
  readonly listByThread: (
    threadId: ThreadId.Id,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<Turn.Record>, ReadError, Actor.Service>;
  /**
   * Ask an active turn to stop, for a reader who may open its thread and direct its agent. A
   * queued turn stops at once, since nothing runs it yet; a running one stops once execution
   * confirms it. A turn already stopping stays as it is; a finished one is NotActive.
   */
  readonly cancel: (turnId: Turn.Id) => Effect.Effect<Turn.Record, CancelError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/application/Service",
) {}

/** @category constructors */
export const make = Effect.fn("TurnApplication.make")(function* () {
  const turns = yield* TurnStore.Service;
  const access = yield* ThreadAccess.Service;
  const authorization = yield* Authorization.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = turns.workspaceId;
  if (access.workspaceId !== workspaceId || authorization.workspaceId !== workspaceId)
    return yield* new InvalidResponse({ message: "Turn services belong to different workspaces" });

  const decode = Schema.decodeEffect(Schema.toType(Turn.Record));
  /** The turn, when the reader may open its thread; otherwise it is missing to them. */
  const readable = Effect.fnUntraced(function* (turnId: Turn.Id) {
    const found = yield* turns.get(turnId);
    if (Option.isNone(found)) return yield* new NotFound({ turnId });
    const turn = yield* decode(found.value);
    if (turn.workspaceId !== workspaceId || turn.id !== turnId)
      return yield* new InvalidResponse({ message: "Turn store returned another turn" });
    yield* access
      .require(turn.threadId)
      .pipe(Effect.catchTag("ThreadAccess.NotFound", () => Effect.fail(new NotFound({ turnId }))));
    return turn;
  });

  const get = Effect.fn("TurnApplication.get")(function* (turnId: Turn.Id) {
    return yield* readable(yield* Schema.decodeEffect(Turn.Id)(turnId));
  });

  const listByThread = Effect.fn("TurnApplication.listByThread")(function* (
    threadId: ThreadId.Id,
    limit: number,
  ) {
    const id = yield* Schema.decodeEffect(ThreadId.Id)(threadId);
    const bounded = yield* Schema.decodeEffect(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
    )(limit);
    const thread = yield* access
      .require(id)
      .pipe(
        Effect.catchTag("ThreadAccess.NotFound", () =>
          Effect.fail(new InvalidResponse({ message: "Thread is not available" })),
        ),
      );
    return yield* Effect.forEach(yield* turns.listByThread(thread.id, bounded), (turn) =>
      decode(turn),
    );
  });

  const cancel = Effect.fn("TurnApplication.cancel")(
    function* (turnId: Turn.Id) {
      const turn = yield* readable(yield* Schema.decodeEffect(Turn.Id)(turnId));
      yield* authorization.require([
        Requirement.make(AgentPermissions.Use, {
          _tag: "Member",
          workspaceId,
          memberId: turn.memberId,
        }),
      ]);
      if (!Turn.active(turn.status))
        return yield* new NotActive({ turnId: turn.id, status: turn.status });
      if (turn.status === "cancelling") return turn;
      const at = yield* DateTime.now;
      const where = {
        workspaceId,
        groupId: turn.groupId,
        threadId: turn.threadId,
        turnId: turn.id,
      };
      yield* journal.publish(
        TurnFacts.CancelRequested,
        Object.assign({}, where, { reason: "requested" as const, requestedAt: at }),
      );
      if (turn.status === "queued") {
        yield* journal.publish(TurnFacts.Cancelled, Object.assign({}, where, { finishedAt: at }));
        return Turn.change(turn, {
          status: "cancelled",
          cancelReason: "requested",
          finishedAt: at,
        });
      }
      return Turn.change(turn, { status: "cancelling", cancelReason: "requested" });
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  return Service.of({ workspaceId, get, listByThread, cancel });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnApplication from "./application.ts";
