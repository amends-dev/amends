import {
  Cause,
  Context,
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
  /**
   * Every later commit in position order, history first. Fails when delivery cannot continue,
   * including at a commit this host cannot read.
   */
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

/**
 * A prepared commit. An unreadable one holds a delivered fact in a version this host does not
 * know, written by a newer host or no longer registered: nobody can be told what it changed or
 * whom it reaches, so its subscribers must refresh instead.
 */
interface Prepared extends Delivery {
  readonly unreadable: ReadonlyArray<ChangeFeedEvents.UnknownVersion>;
}

type Item =
  | { readonly _tag: "Delivery"; readonly sequence: bigint; readonly delivery: Prepared }
  | { readonly _tag: "Stopped" };

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
const backoff = (failures: number) =>
  Duration.millis(Math.min(5_000, 100 * 2 ** Math.min(failures - 1, 6)));

const unavailable = () => new ChangeFeed.Unavailable({});
const readable = (delivery: Prepared) => delivery.unreadable.length === 0;

/**
 * Share one follower of the workspace journal among this runtime's subscribers. It starts with
 * the first subscriber at the journal's head, decodes each commit once, and stops when the last
 * subscriber leaves; any process holding the workspace follows the same journal. When reading the
 * journal fails, it logs the failure and follows again from the last commit it delivered, after a
 * backoff, so its subscribers see a delay rather than an end.
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
    const unreadable: Array<ChangeFeedEvents.UnknownVersion> = [];
    for (const entry of batch.entries) {
      const prepared = yield* ChangeFeedEvents.prepare(entry).pipe(
        Effect.catchTag("ChangeFeedEvents.UnknownVersion", (unknown) =>
          Effect.sync(() => {
            unreadable.push(unknown);
            return Option.none<ChangeFeedEvents.Prepared>();
          }),
        ),
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

  const follow = Effect.gen(function* () {
    const hub = yield* PubSub.sliding<Item>(capacity);
    yield* Effect.addFinalizer(() => PubSub.shutdown(hub));
    const gate = yield* Semaphore.make(1);
    const state: Follower["state"] = {
      sequence: 0n,
      stopped: false,
      position: yield* log.head,
    };
    // A commit this host cannot read ends its subscribers' streams, but the follower continues.
    const pass = Stream.suspend(() =>
      log.tail(
        Option.match(state.position, {
          onNone: () => ({ limit: pageSize }),
          onSome: (after) => ({ after, limit: pageSize }),
        }),
      ),
    ).pipe(
      Stream.mapEffect(prepare),
      Stream.tap((delivery) =>
        readable(delivery)
          ? Effect.void
          : Effect.logWarning("Change feed met a commit this host cannot read", {
              position: delivery.position,
              facts: delivery.unreadable.map(({ name, version }) => ({ name, version })),
            }),
      ),
      Stream.runForEach((delivery) =>
        gate.withPermits(1)(
          Effect.suspend(() => {
            state.sequence += 1n;
            state.position = Option.some(delivery.position);
            return PubSub.publish(hub, { _tag: "Delivery", sequence: state.sequence, delivery });
          }),
        ),
      ),
    );
    const following = Effect.gen(function* () {
      let failures = 0;
      while (true) {
        const delivered = state.sequence;
        const exit = yield* Effect.exit(pass);
        if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) return;
        // Reads that delivered something before failing start the backoff over.
        failures = state.sequence === delivered ? failures + 1 : 1;
        yield* Effect.logWarning("Change feed follower failed; following again", exit.cause);
        yield* Effect.sleep(backoff(failures));
      }
    });
    yield* following.pipe(
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
    // A follower stops only as its runtime closes, so there is no other to follow instead.
    if (Option.isNone(registered)) return yield* unavailable();
    const { subscription } = registered.value;
    let expected = registered.value.expected;
    const head = yield* log.head.pipe(Effect.mapError(unavailable));

    let reset = true;
    let from = head;
    let history: ReadonlyArray<Prepared> = [];
    if (Option.isSome(after) && Option.isSome(head) && after.value <= head.value) {
      const page = yield* log
        .read({ after: after.value, limit: replayLimit + 1 })
        .pipe(Effect.flatMap(Effect.forEach(prepare)), Effect.mapError(unavailable));
      // Resuming across a commit this host cannot read would hide what it changed.
      if (page.length <= replayLimit && page.every(readable)) {
        reset = false;
        from = after;
        history = page;
      }
    }

    // Deliveries at or before the last one sent were already covered by history or the head.
    let last = history.at(-1)?.position ?? Option.getOrUndefined(from);
    const fresh = (delivery: Prepared) => last === undefined || delivery.position > last;
    const sent = (delivery: Prepared) =>
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
      Stream.flatMap((item): Stream.Stream<Prepared, ChangeFeed.Unavailable> => {
        if (item._tag === "Stopped") return Stream.fail(unavailable());
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
        // The subscriber reconnects from its last cursor, where this commit makes it reset.
        Stream.mapEffect(
          ({ unreadable, ...delivery }): Effect.Effect<Delivery, ChangeFeed.Unavailable> =>
            unreadable.length === 0 ? Effect.succeed(delivery) : Effect.fail(unavailable()),
        ),
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
