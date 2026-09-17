import { Array, Context, DateTime, Effect, Option, Ref, Schema, Semaphore } from "effect";
import { Commit } from "../src/journal/commit.ts";
import { Checkpoint } from "../src/journal/checkpoint.ts";
import { Entry } from "../src/journal/entry.ts";
import { Store } from "../src/journal/store.ts";

interface State {
  readonly logs: Map<Entry.LogId, Array<Store.Batch>>;
  readonly checkpoints: Map<string, Checkpoint.Cursor>;
  value: number;
}
interface Session {
  readonly owner: symbol;
  readonly state: State;
  commit: Commit.Record;
  active: boolean;
}
class Current extends Context.Service<Current, Session>()("JournalTest/MemorySession") {}

export class Counter extends Context.Service<
  Counter,
  {
    readonly add: (amount: number) => Effect.Effect<void, Store.Failure, Store.Transaction>;
    readonly get: Effect.Effect<number>;
  }
>()("JournalTest/Counter") {}

const cloneBatch = (batch: Store.Batch): Store.Batch =>
  Schema.decodeUnknownSync(Schema.toType(Store.Batch))({
    logId: batch.logId,
    position: batch.position,
    commit: { ...batch.commit },
    entries: batch.entries.map((entry) => ({ ...entry, payload: entry.payload.slice() })),
  });
const cloneState = (state: State): State => ({
  value: state.value,
  checkpoints: new Map([...state.checkpoints].map(([key, cursor]) => [key, cloneCursor(cursor)])),
  logs: new Map([...state.logs].map(([id, batches]) => [id, batches.map(cloneBatch)])),
});
const cloneCursor = (cursor: Checkpoint.Cursor): Checkpoint.Cursor => ({
  position: cursor.position,
  commitId: cursor.commitId,
  index: cursor.index,
  entryId: cursor.entryId,
});

/** A test adapter: staged log records and projection data share one snapshot. */
export const make = Effect.fn("JournalTest.memoryStore")(function* () {
  const owner = Symbol("memory store");
  const state = yield* Ref.make<State>({ logs: new Map(), checkpoints: new Map(), value: 0 });
  const attempts = yield* Ref.make(0);
  const uncertain = yield* Ref.make(false);
  const gate = yield* Semaphore.make(1);
  let nextEntry = 0;
  let nextCommit = 0;

  const view = Effect.gen(function* () {
    const current = yield* Effect.serviceOption(Current);
    return Option.isSome(current) && current.value.owner === owner && current.value.active
      ? current.value.state
      : yield* Ref.get(state);
  });

  const transaction = Effect.fn("JournalTest.transaction")(function* <A, E, R>(
    program: Effect.Effect<A, E, R>,
  ) {
    return yield* gate.withPermits(1)(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          yield* Ref.update(attempts, (count) => count + 1);
          const session: Session = {
            owner,
            state: cloneState(yield* Ref.get(state)),
            active: true,
            commit: Commit.Record.make({
              id: Commit.Id.make(`commit-${nextCommit++}`),
              entryCount: 0,
              recordedAt: yield* DateTime.now,
            }),
          };

          const native = Store.Transaction.of({
            id: session.commit.id,
            append: Effect.fn("JournalTest.append")(function* (request) {
              if (!session.active)
                return yield* new Store.Failure({ operation: "append", cause: "closed" });
              const batches = session.state.logs.get(request.logId) ?? [];
              const last = Array.last(batches);
              if (request.expectedAfter !== undefined) {
                const actual = Option.map(last, (batch) => batch.position);
                if (!Option.isNone(actual) || !Option.isNone(request.expectedAfter)) {
                  if (
                    Option.isNone(actual) ||
                    Option.isNone(request.expectedAfter) ||
                    actual.value !== request.expectedAfter.value
                  ) {
                    return yield* new Store.Conflict({
                      operation: "append",
                      message: "Expected log position changed",
                    });
                  }
                }
              }
              if (request.payloads.length === 0) return [];
              const extending = Option.isSome(last) && last.value.commit.id === session.commit.id;
              const position = Entry.Position.make(
                Option.isNone(last) ? 0 : last.value.position + (extending ? 0 : 1),
              );
              const existing = extending && Option.isSome(last) ? last.value.entries : [];
              const recordedAt = yield* DateTime.now;
              const entries = request.payloads.map((payload, index) =>
                Entry.Record.make({
                  id: Entry.Id.make(`entry-${nextEntry++}`),
                  logId: request.logId,
                  position,
                  commitId: session.commit.id,
                  index: existing.length + index,
                  recordedAt,
                  payload: payload.slice(),
                }),
              );
              session.commit = {
                id: session.commit.id,
                recordedAt: session.commit.recordedAt,
                entryCount: session.commit.entryCount + entries.length,
              };
              const batch = yield* Schema.decodeUnknownEffect(Schema.toType(Store.Batch))({
                logId: request.logId,
                position,
                commit: session.commit,
                entries: [...existing, ...entries],
              }).pipe(
                Effect.mapError((cause) => new Store.Failure({ operation: "append", cause })),
              );
              session.state.logs.set(
                request.logId,
                extending ? [...batches.slice(0, -1), batch] : [...batches, batch],
              );
              for (const [id, values] of session.state.logs) {
                session.state.logs.set(
                  id,
                  values.map((value) =>
                    value.commit.id === session.commit.id
                      ? {
                          logId: value.logId,
                          position: value.position,
                          entries: value.entries,
                          commit: session.commit,
                        }
                      : value,
                  ),
                );
              }
              return entries.map((entry) => ({ ...entry, payload: entry.payload.slice() }));
            }),
          });

          const result = yield* restore(
            program.pipe(
              Effect.updateContext((context: Context.Context<R>) =>
                Context.add(context, Current, session),
              ),
              Effect.provideService(Store.Transaction, native),
            ),
          ).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                session.active = false;
              }),
            ),
          );
          yield* Ref.set(state, session.state);
          if (yield* Ref.getAndSet(uncertain, false)) {
            return yield* new Store.CommitUncertain({
              commitId: session.commit.id,
              cause: "lost acknowledgment",
            });
          }
          return result;
        }),
      ),
    );
  });

  const store = Store.Service.of({
    transaction,
    get: Effect.fn("JournalTest.get")(function* (logId, commitId) {
      return Option.map(
        Array.findFirst(
          (yield* view).logs.get(logId) ?? [],
          (batch) => batch.commit.id === commitId,
        ),
        cloneBatch,
      );
    }),
    read: Effect.fn("JournalTest.read")(function* (logId, options) {
      return ((yield* view).logs.get(logId) ?? [])
        .filter((batch) => options.after === undefined || batch.position > options.after)
        .slice(0, options.limit)
        .map(cloneBatch);
    }),
  });

  const counter = Counter.of({
    add: Effect.fn("JournalTest.counter.add")(function* (amount) {
      const native = yield* Store.Transaction;
      const current = yield* Effect.serviceOption(Current);
      if (
        Option.isNone(current) ||
        current.value.owner !== owner ||
        !current.value.active ||
        native.id !== current.value.commit.id
      ) {
        return yield* new Store.Failure({ operation: "counter.add", cause: "missing transaction" });
      }
      const target = current.value.state;
      const next = target.value + amount;
      yield* Effect.yieldNow;
      target.value = next;
    }),
    get: Effect.map(view, (value) => value.value),
  });

  const keyOf = (key: Checkpoint.Key) => JSON.stringify([key.logId, key.name, key.version]);
  const checkpoints = Checkpoint.Service.of({
    get: Effect.fn("JournalTest.checkpoint.get")(function* (key) {
      return Option.map(
        Option.fromUndefinedOr((yield* view).checkpoints.get(keyOf(key))),
        cloneCursor,
      );
    }),
    set: Effect.fn("JournalTest.checkpoint.set")(function* (key, cursor) {
      const native = yield* Store.Transaction;
      const current = yield* Effect.serviceOption(Current);
      if (
        Option.isNone(current) ||
        current.value.owner !== owner ||
        !current.value.active ||
        native.id !== current.value.commit.id
      ) {
        return yield* new Store.Failure({
          operation: "checkpoint.set",
          cause: "missing transaction",
        });
      }
      current.value.state.checkpoints.set(keyOf(key), {
        position: cursor.position,
        commitId: cursor.commitId,
        index: cursor.index,
        entryId: cursor.entryId,
      });
    }),
  });

  return {
    store,
    counter,
    checkpoints,
    attempts: Ref.get(attempts),
    snapshot: Effect.map(Ref.get(state), cloneState),
    loseNextAcknowledgment: Ref.set(uncertain, true),
  };
});

export type Fixture = Effect.Success<ReturnType<typeof make>>;
