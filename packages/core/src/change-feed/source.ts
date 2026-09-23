import { Context, Effect, Layer, Option, PubSub, RcRef, Schema, Semaphore, Stream } from "effect";
import type { Scope } from "effect";
import type { Commit } from "../journal/commit.ts";
import type { Entry } from "../journal/entry.ts";
import type { Event } from "../journal/event.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import { ChangeFeed } from "./change-feed.ts";
import { ChangeFeedEvents } from "./events.ts";

/** One committed batch of the journal, with the events the feed may deliver from it. */
export interface Delivery {
  readonly position: Entry.Position;
  readonly commitId: Commit.Id;
  /** Possibly empty: a commit of internal facts still advances the journal. */
  readonly events: ReadonlyArray<ChangeFeedEvents.Prepared>;
}

export interface Subscription {
  /** Where delivery starts: the resumed cursor, or the head for a reset. None is an empty journal. */
  readonly from: Option.Option<Entry.Position>;
  /** The subscriber must refresh its view rather than rely on earlier deliveries. */
  readonly reset: boolean;
  /** Every later commit in position order, history first; fails when delivery cannot continue. */
  readonly deliveries: Stream.Stream<Delivery, ChangeFeed.Unavailable>;
}

export interface Interface {
  /**
   * Register for commits after a position, before reading the journal, so none is missed. A
   * cursor at or before the head replays the commits after it, up to the replay limit;
   * beyond it, and without a cursor or with one past the head, delivery resets at the head.
   * Hold the scope while consuming.
   */
  readonly subscribe: (
    after: Option.Option<Entry.Position>,
  ) => Effect.Effect<Subscription, ChangeFeed.Unavailable, Scope.Scope>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/change-feed/source/Service",
) {}

export const Options = Schema.Struct({
  /** Deliveries buffered for each subscriber; a slower subscriber catches up from the log. */
  capacity: Schema.Int.check(Schema.isGreaterThan(0)),
  /** The most commits a resuming subscriber replays before a reset is cheaper. */
  replayLimit: Schema.Int.check(Schema.isGreaterThan(0)),
  /** Batches read at a time. */
  pageSize: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface Options extends Schema.Schema.Type<typeof Options> {}

type Item =
  | { readonly _tag: "Delivery"; readonly sequence: bigint; readonly delivery: Delivery }
  | { readonly _tag: "Stopped" };

interface Follower {
  readonly hub: PubSub.PubSub<Item>;
  readonly gate: Semaphore.Semaphore;
  readonly state: { sequence: bigint; stopped: boolean };
}

const unavailable = () => new ChangeFeed.Unavailable({});

/**
 * Share one follower of the workspace journal among this runtime's subscribers. It starts with
 * the first subscriber at the journal's head, decodes each commit once, and stops when the last
 * subscriber leaves; any process holding the workspace follows the same journal.
 *
 * @category constructors
 */
export const make = Effect.fn("ChangeFeedSource.make")(function* (
  input: Options = { capacity: 256, replayLimit: 500, pageSize: 100 },
) {
  const { capacity, replayLimit, pageSize } = yield* Schema.decodeEffect(Options)(input);
  const log = (yield* Journal.Service).log;

  const prepare = Effect.fnUntraced(function* (batch: Log.Batch<Event.Envelope>) {
    const events: Array<ChangeFeedEvents.Prepared> = [];
    for (const entry of batch.entries) {
      const prepared = yield* ChangeFeedEvents.prepare(entry);
      if (Option.isSome(prepared)) events.push(prepared.value);
    }
    return { position: batch.position, commitId: batch.commit.id, events } satisfies Delivery;
  });

  const follow = Effect.gen(function* () {
    const hub = yield* PubSub.sliding<Item>(capacity);
    yield* Effect.addFinalizer(() => PubSub.shutdown(hub));
    const gate = yield* Semaphore.make(1);
    const state = { sequence: 0n, stopped: false };
    const start = yield* log.head;
    const from = Option.match(start, {
      onNone: () => ({ limit: pageSize }),
      onSome: (after) => ({ after, limit: pageSize }),
    });
    yield* log.tail(from).pipe(
      Stream.mapEffect(prepare),
      Stream.runForEach((delivery) =>
        gate.withPermits(1)(
          Effect.suspend(() => {
            state.sequence += 1n;
            return PubSub.publish(hub, { _tag: "Delivery", sequence: state.sequence, delivery });
          }),
        ),
      ),
      Effect.tapCause((cause) => Effect.logWarning("Change feed follower stopped", cause)),
      Effect.ensuring(
        gate.withPermits(1)(
          Effect.suspend(() => {
            state.stopped = true;
            return PubSub.publish(hub, { _tag: "Stopped" });
          }),
        ),
      ),
      Effect.forkScoped,
    );
    return { hub, gate, state } satisfies Follower;
  });
  const followers = yield* RcRef.make({ acquire: follow });

  const subscribe = Effect.fn("ChangeFeedSource.subscribe")(function* (
    after: Option.Option<Entry.Position>,
  ) {
    const follower = yield* RcRef.get(followers).pipe(Effect.mapError(unavailable));
    const registered = yield* follower.gate.withPermits(1)(
      Effect.gen(function* () {
        if (follower.state.stopped) return Option.none();
        const subscription = yield* PubSub.subscribe(follower.hub);
        return Option.some({ subscription, expected: follower.state.sequence + 1n });
      }),
    );
    if (Option.isNone(registered)) {
      yield* RcRef.invalidate(followers);
      return yield* unavailable();
    }
    const { subscription } = registered.value;
    let expected = registered.value.expected;
    const head = yield* log.head.pipe(Effect.mapError(unavailable));

    let reset = true;
    let from = head;
    let history: ReadonlyArray<Delivery> = [];
    if (Option.isSome(after) && Option.isSome(head) && after.value <= head.value) {
      const page = yield* log
        .read({ after: after.value, limit: replayLimit + 1 })
        .pipe(Effect.flatMap(Effect.forEach(prepare)), Effect.mapError(unavailable));
      if (page.length <= replayLimit) {
        reset = false;
        from = after;
        history = page;
      }
    }

    // Deliveries at or before the last one sent were already covered by history or the head.
    let last = history.at(-1)?.position ?? Option.getOrUndefined(from);
    const fresh = (delivery: Delivery) => last === undefined || delivery.position > last;
    const sent = (delivery: Delivery) =>
      Effect.sync(() => {
        last = delivery.position;
      });
    // A lagging subscriber lost deliveries from its buffer; the journal still has them.
    const catchUp = Stream.suspend(() =>
      log.stream({ ...(last === undefined ? {} : { after: last }), limit: pageSize }),
    ).pipe(
      Stream.mapEffect(prepare),
      Stream.filter(fresh),
      Stream.tap(sent),
      Stream.mapError(unavailable),
    );
    const live = Stream.fromEffectRepeat(PubSub.take(subscription)).pipe(
      Stream.flatMap((item): Stream.Stream<Delivery, ChangeFeed.Unavailable> => {
        if (item._tag === "Stopped")
          return Stream.fromEffect(RcRef.invalidate(followers)).pipe(
            Stream.flatMap(() => Stream.fail(unavailable())),
          );
        const lagged = item.sequence !== expected;
        expected = item.sequence + 1n;
        const current = Stream.suspend(() =>
          fresh(item.delivery) ? Stream.make(item.delivery).pipe(Stream.tap(sent)) : Stream.empty,
        );
        return lagged ? Stream.concat(catchUp, current) : current;
      }),
    );
    return {
      from,
      reset,
      deliveries: Stream.fromIterable(history).pipe(
        Stream.concat(live),
        Stream.mapError(unavailable),
      ),
    } satisfies Subscription;
  });

  return Service.of({ subscribe });
});

/**
 * Provide the shared journal follower for one workspace runtime.
 *
 * @category layers
 */
export const layer = (options?: Options) => Layer.effect(Service, make(options));

export * as ChangeFeedSource from "./source.ts";
