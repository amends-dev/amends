/**
 * One follower of the workspace journal for a runtime, shared by every reader: it tails the
 * journal from its head, prepares each commit once through `ChangeFeedEvents`, and fans the
 * deliveries out to its subscribers. A subscriber resuming from a cursor replays the commits
 * after it when they are few enough, and otherwise starts again at the head with a reset.
 * `ChangeFeedService` subscribes for each reader of the change feed, and readers following a
 * turn's log share the follower too.
 *
 * @since 0.1.0
 */
import {
  Cause,
  Context,
  Data,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  PubSub,
  RcRef,
  Schema,
  Semaphore,
  Stream,
} from "effect";
import type { Scope } from "effect";
import type * as Commit from "../journal/Commit.ts";
import type * as Entry from "../journal/Entry.ts";
import type * as Event from "../journal/Event.ts";
import * as Journal from "../journal/Journal.ts";
import type * as Log from "../journal/Log.ts";
import * as ChangeFeed from "./ChangeFeed.ts";
import * as ChangeFeedEvents from "./ChangeFeedEvents.ts";

/**
 * One committed batch of the journal, with the events the feed may deliver from it.
 *
 * @category models
 * @since 0.1.0
 */
export interface Delivery {
  readonly position: Entry.Position;
  readonly commitId: Commit.Id;
  /** Possibly empty: a commit of internal facts still advances the journal. */
  readonly events: ReadonlyArray<ChangeFeedEvents.Prepared>;
}

/**
 * What a subscriber receives: where delivery starts, whether it must refresh first, and every
 * later commit.
 *
 * @category models
 * @since 0.1.0
 */
export interface Subscription {
  /** Where delivery starts: the resumed cursor, or the head for a reset. None is an empty journal. */
  readonly from: Option.Option<Entry.Position>;
  /** The subscriber must refresh its view rather than rely on earlier deliveries. */
  readonly reset: boolean;
  /**
   * Every later commit in position order, history first. Fails when delivery cannot continue,
   * including at a commit this host cannot read.
   */
  readonly deliveries: Stream.Stream<Delivery, ChangeFeed.Unavailable>;
}

/**
 * The runtime's shared follower of the workspace journal, which each reader subscribes to.
 *
 * @category services
 * @since 0.1.0
 */
export class ChangeFeedSource extends Context.Service<
  ChangeFeedSource,
  {
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
>()("@amends-dev/core/change-feed/ChangeFeedSource") {}

/**
 * How much the follower buffers for each subscriber, how far back a subscriber may resume, and
 * how it pages the log.
 *
 * @category options
 * @since 0.1.0
 */
export const Options = Schema.Struct({
  /** Deliveries buffered for each subscriber; a slower subscriber catches up from the log. */
  capacity: Schema.Int.check(Schema.isGreaterThan(0)),
  /** The most commits a resuming subscriber replays before a reset is cheaper. */
  replayLimit: Schema.Int.check(Schema.isGreaterThan(0)),
  /** Batches read at a time. */
  pageSize: Schema.Int.check(Schema.isGreaterThan(0)),
});
/**
 * @category options
 * @since 0.1.0
 */
export interface Options extends Schema.Schema.Type<typeof Options> {}

/** A delivered fact this host cannot read, and why. */
interface Unreadable {
  readonly name: string;
  readonly version: number;
  /**
   * `unknown-version`: written by a newer host or no longer registered. `undecodable`: a version
   * this host knows, with a payload its schema rejects, as a damaged record or a schema changed
   * without a new version would leave.
   */
  readonly reason: "unknown-version" | "undecodable";
}
/**
 * A prepared commit. An unreadable one holds a delivered fact this host cannot read: nobody can be
 * told what it changed or whom it reaches, so its subscribers must refresh instead. Reading it
 * again would fail the same way, so the feed goes on past it.
 */
interface Prepared extends Delivery {
  readonly unreadable: ReadonlyArray<Unreadable>;
}

type Item = Data.TaggedEnum<{
  Delivery: { readonly sequence: bigint; readonly delivery: Prepared };
  Stopped: {};
}>;
const Item = Data.taggedEnum<Item>();

interface Follower {
  readonly hub: PubSub.PubSub<Item>;
  readonly gate: Semaphore.Semaphore;
  readonly state: {
    sequence: bigint;
    stopped: boolean;
    /** The last commit delivered, where following resumes after a failed read. */
    position: Option.Option<Entry.Position>;
  };
}

/** How long the follower waits before following again after its reads failed this many times. */
const backoffAfter = (failures: number) =>
  Duration.millis(Math.min(5_000, 100 * 2 ** Math.min(failures - 1, 6)));

const toUnavailable = () => new ChangeFeed.Unavailable({});
const isReadable = (delivery: Prepared) => delivery.unreadable.length === 0;

/**
 * Share one follower of the workspace journal among this runtime's subscribers. It starts with
 * the first subscriber at the journal's head, decodes each commit once, and stops when the last
 * subscriber leaves; any process holding the workspace follows the same journal. When reading the
 * journal fails, it logs the failure and follows again from the last commit it delivered, after a
 * backoff, so its subscribers see a delay rather than an end.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ChangeFeedSource.make")(function* (
  input: Options = { capacity: 256, replayLimit: 500, pageSize: 100 },
) {
  const { capacity, replayLimit, pageSize } = yield* Schema.decodeEffect(Options)(input);
  const log = (yield* Journal.Journal).log;

  const prepareBatch = Effect.fnUntraced(function* (batch: Log.Batch<Event.Envelope>) {
    const events: Array<ChangeFeedEvents.Prepared> = [];
    const unreadable: Array<Unreadable> = [];
    for (const entry of batch.entries) {
      const skipUnreadable = (reason: Unreadable["reason"]) =>
        Effect.sync(() => {
          const { name, version } = entry.payload;
          unreadable.push({ name, version, reason });
          return Option.none<ChangeFeedEvents.Prepared>();
        });
      const prepared = yield* ChangeFeedEvents.prepare(entry).pipe(
        Effect.catchTag("ChangeFeedEvents.UnknownVersion", () => skipUnreadable("unknown-version")),
        Effect.catchTags({
          SchemaError: () => skipUnreadable("undecodable"),
          "Journal.FactMismatch": () => skipUnreadable("undecodable"),
        }),
      );
      if (Option.isSome(prepared)) events.push(prepared.value);
    }
    return {
      position: batch.position,
      commitId: batch.commit.id,
      events,
      unreadable,
    } satisfies Prepared;
  });

  const startFollower = Effect.gen(function* () {
    const hub = yield* PubSub.sliding<Item>(capacity);
    yield* Effect.addFinalizer(() => PubSub.shutdown(hub));
    const gate = yield* Semaphore.make(1);
    const state: Follower["state"] = {
      sequence: 0n,
      stopped: false,
      position: yield* log.head,
    };
    // A commit this host cannot read ends its subscribers' streams, but the follower continues.
    const tailAndPublish = Stream.suspend(() =>
      log.tail(
        Option.match(state.position, {
          onNone: () => ({ limit: pageSize }),
          onSome: (after) => ({ after, limit: pageSize }),
        }),
      ),
    ).pipe(
      Stream.mapEffect(prepareBatch),
      Stream.tap((delivery) =>
        isReadable(delivery)
          ? Effect.void
          : Effect.logWarning("Change feed met a commit this host cannot read", {
              position: delivery.position,
              facts: delivery.unreadable,
            }),
      ),
      Stream.runForEach((delivery) =>
        gate.withPermits(1)(
          Effect.suspend(() => {
            state.sequence += 1n;
            state.position = Option.some(delivery.position);
            return PubSub.publish(hub, Item.Delivery({ sequence: state.sequence, delivery }));
          }),
        ),
      ),
    );
    const followWithRetries = Effect.gen(function* () {
      let failures = 0;
      while (true) {
        const delivered = state.sequence;
        const exit = yield* Effect.exit(tailAndPublish);
        if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) return;
        // Reads that delivered something before failing start the backoff over.
        failures = state.sequence === delivered ? failures + 1 : 1;
        yield* Effect.logWarning("Change feed follower failed; following again", exit.cause);
        yield* Effect.sleep(backoffAfter(failures));
      }
    });
    yield* followWithRetries.pipe(
      Effect.ensuring(
        gate.withPermits(1)(
          Effect.suspend(() => {
            state.stopped = true;
            return PubSub.publish(hub, Item.Stopped());
          }),
        ),
      ),
      Effect.forkScoped,
    );
    return { hub, gate, state } satisfies Follower;
  });
  const followers = yield* RcRef.make({ acquire: startFollower });

  const subscribe = Effect.fn("ChangeFeedSource.subscribe")(function* (
    after: Option.Option<Entry.Position>,
  ) {
    const follower = yield* RcRef.get(followers).pipe(Effect.mapError(toUnavailable));
    const registered = yield* follower.gate.withPermits(1)(
      Effect.gen(function* () {
        if (follower.state.stopped) return Option.none();
        const subscription = yield* PubSub.subscribe(follower.hub);
        return Option.some({ subscription, expected: follower.state.sequence + 1n });
      }),
    );
    // A follower stops only as its runtime closes, so there is no other to follow instead.
    if (Option.isNone(registered)) return yield* toUnavailable();
    const { subscription } = registered.value;
    let expected = registered.value.expected;
    const head = yield* log.head.pipe(Effect.mapError(toUnavailable));

    let reset = true;
    let from = head;
    let history: ReadonlyArray<Prepared> = [];
    if (Option.isSome(after) && Option.isSome(head) && after.value <= head.value) {
      const page = yield* log
        .read({ after: after.value, limit: replayLimit + 1 })
        .pipe(Effect.flatMap(Effect.forEach(prepareBatch)), Effect.mapError(toUnavailable));
      // Resuming across a commit this host cannot read would hide what it changed.
      if (page.length <= replayLimit && page.every(isReadable)) {
        reset = false;
        from = after;
        history = page;
      }
    }

    // Deliveries at or before the last one sent were already covered by history or the head.
    let last = history.at(-1)?.position ?? Option.getOrUndefined(from);
    const isFresh = (delivery: Prepared) => last === undefined || delivery.position > last;
    const markSent = (delivery: Prepared) =>
      Effect.sync(() => {
        last = delivery.position;
      });
    // A lagging subscriber lost deliveries from its buffer; the journal still has them.
    const catchUp = Stream.suspend(() =>
      log.stream({ ...(last === undefined ? {} : { after: last }), limit: pageSize }),
    ).pipe(
      Stream.mapEffect(prepareBatch),
      Stream.filter(isFresh),
      Stream.tap(markSent),
      Stream.mapError(toUnavailable),
    );
    const live = Stream.fromEffectRepeat(PubSub.take(subscription)).pipe(
      Stream.flatMap((item): Stream.Stream<Prepared, ChangeFeed.Unavailable> => {
        if (Item.$is("Stopped")(item)) return Stream.fail(toUnavailable());
        const lagged = item.sequence !== expected;
        expected = item.sequence + 1n;
        const current = Stream.suspend(() =>
          isFresh(item.delivery)
            ? Stream.make(item.delivery).pipe(Stream.tap(markSent))
            : Stream.empty,
        );
        return lagged ? Stream.concat(catchUp, current) : current;
      }),
    );
    return {
      from,
      reset,
      deliveries: Stream.fromIterable(history).pipe(
        Stream.concat(live),
        // The subscriber reconnects from its last cursor, where this commit makes it reset.
        Stream.mapEffect(
          ({ unreadable, ...delivery }): Effect.Effect<Delivery, ChangeFeed.Unavailable> =>
            unreadable.length === 0 ? Effect.succeed(delivery) : Effect.fail(toUnavailable()),
        ),
        Stream.mapError(toUnavailable),
      ),
    } satisfies Subscription;
  });

  return ChangeFeedSource.of({ subscribe });
});

/**
 * The shared journal follower for one workspace runtime, over the journal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (options?: Options) => Layer.effect(ChangeFeedSource, make(options));
