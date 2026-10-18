/**
 * One workspace's view of memory storage: what its stores read and write, and the transactions
 * they share with its logs. `layer` binds a workspace over the caller's `MemoryDatabase.Connection`
 * and provides `MemoryBinding`, through which every store's `layerMemory` reads and writes; the
 * workspace's log store, the log package's memory store over a `MemoryStore.Binding` of the same
 * transactions, so a commit's entries and records land together; and `WorkspaceId.CurrentWorkspaceId`.
 *
 * @since 0.1.0
 */

import { MemoryStore, Store, StoreError } from "@amends-dev/log"
import * as Commit from "@amends-dev/log/Commit"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as MemoryDatabase from "./MemoryDatabase.ts"

/**
 * One open transaction over memory storage: a snapshot of the workspace that its writes change
 * until it commits, whose logs are the memory store's session. The binding's statements check it
 * against their own.
 */
class MemoryTransaction extends Context.Service<
  MemoryTransaction,
  MemoryStore.Session & {
    /** The connection that opened it; a handle reaching another connection's binding fails. */
    readonly connection: MemoryDatabase.Connection["Service"]
    readonly workspaceId: WorkspaceId.WorkspaceId
    /** Its snapshot of the workspace, whose `logs` are the session's, which a commit makes committed. */
    readonly space: MemoryDatabase.Space
  }
>()("@amends-dev/core/journal/MemoryBinding/MemoryTransaction") {}

/**
 * One workspace's view of memory storage: what a read and a write see. `layer` provides it, and
 * every store's `layerMemory` reads and writes through it.
 *
 * @category services
 * @since 0.1.0
 */
export class MemoryBinding extends Context.Service<
  MemoryBinding,
  {
    /** The workspace every store over this binding reads and writes. */
    readonly workspaceId: WorkspaceId.WorkspaceId
    /** The host's connection: the storage the stores read, and the gate transactions take. */
    readonly connection: MemoryDatabase.Connection["Service"]
    /**
     * What a read sees: the live transaction of this workspace on this connection, or committed
     * state outside any transaction. Any other transaction is a foreign or expired handle.
     */
    readonly read: Effect.Effect<MemoryDatabase.Space, StoreError.StoreError>
    /** What a write changes: the caller's transaction, which it requires. */
    readonly write: Effect.Effect<MemoryDatabase.Space, StoreError.StoreError>
  }
>()("@amends-dev/core/journal/MemoryBinding") {}

const closed = StoreError.failed("Store", "transaction")("Missing, closed, or foreign workspace transaction")

/** One workspace's binding over the caller's connection, and the memory store's view of it. */
const makeBindings = Effect.fn("MemoryBinding.make")(function* (workspaceId: WorkspaceId.WorkspaceId) {
  const memoryConnection = yield* MemoryDatabase.Connection
  const { database, gate } = memoryConnection

  /** The caller's live transaction here, None outside any, or a failure for any other. */
  const session = Effect.gen(function* () {
    const current = yield* Effect.serviceOption(MemoryTransaction)
    const native = yield* Effect.serviceOption(Store.Transaction)
    if (Option.isNone(current) && Option.isNone(native)) return Option.none<MemoryTransaction["Service"]>()
    if (
      Option.isNone(current) ||
      Option.isNone(native) ||
      !current.value.active ||
      current.value.connection !== memoryConnection ||
      current.value.workspaceId !== workspaceId ||
      current.value.commit.id !== native.value.id
    )
      return yield* closed
    return current
  })
  const read = Effect.map(session, (current) =>
    Option.isSome(current) ? current.value.space : MemoryDatabase.committed(database, workspaceId)
  )
  const write = Effect.flatMap(session, (current) =>
    Option.isSome(current) ? Effect.succeed(current.value.space) : Effect.fail(closed)
  )
  /** Take the workspace's writer, which this host's writers wait for and another host's refuse. */
  const acquire = Effect.fnUntraced(function* (
    restore: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  ) {
    yield* restore(gate.take(1))
    if (database.writers.has(workspaceId)) {
      yield* gate.release(1)
      return yield* StoreError.contended("Store", "transaction", "Another host is writing this workspace")
    }
    database.writers.set(workspaceId, memoryConnection)
  })
  const release = Effect.suspend(() => {
    database.writers.delete(workspaceId)
    return gate.release(1)
  })
  /**
   * A transaction of the workspace: a snapshot of all its state, which its log appends and store
   * writes change, made committed together. A standalone one takes no writer and commits only the
   * logs it held.
   */
  const transaction: MemoryStore.Binding["Service"]["transaction"] = Effect.fn("MemoryBinding.transaction")(function* <
    A,
    E,
    R
  >(
    program: Effect.Effect<A, E, R>,
    native: (session: MemoryStore.Session) => Store.Transaction["Service"],
    options: { readonly standalone: boolean }
  ) {
    yield* read
    if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
      return yield* StoreError.failed("Store", "transaction")("Native transactions cannot nest; use journal.commit")
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        // This host's writers wait for each other; another host's writer is contention.
        if (!options.standalone) yield* acquire(restore)
        const space = MemoryDatabase.copy(MemoryDatabase.committed(database, workspaceId))
        const state: MemoryTransaction["Service"] = {
          connection: memoryConnection,
          workspaceId,
          active: true,
          commit: {
            id: Commit.CommitId.make(database.nextId("commit")),
            recordedAt: yield* DateTime.now,
            entryCount: 0
          },
          space,
          logs: space.logs,
          held: new Set(),
          afterCommit: []
        }
        const exit = yield* Effect.exit(
          restore(
            program.pipe(
              Effect.updateContext((context: Context.Context<R>) => Context.add(context, MemoryTransaction, state)),
              Effect.provideService(Store.Transaction, native(state))
            )
          )
        )
        state.active = false
        // Committing makes the snapshot of what it wrote committed; rolling back drops it.
        if (Exit.isSuccess(exit)) {
          MemoryDatabase.commit(database, workspaceId, state.space, {
            logs: state.held,
            workspace: !options.standalone
          })
          if ((state.logs.commits.get(state.commit.id)?.entryCount ?? 0) > 0) MemoryDatabase.wakeAppendReaders(database)
        }
        for (const logId of state.held) yield* MemoryDatabase.logLock(database, workspaceId, logId).release(1)
        if (!options.standalone) yield* release
        if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause)
        // Committed, with the workspace and its logs released.
        yield* Store.runAfterCommit(state.afterCommit)
        return exit.value
      })
    )
  })

  return {
    memoryBinding: MemoryBinding.of({ workspaceId, connection: memoryConnection, read, write }),
    storeBinding: MemoryStore.Binding.of({
      read: Effect.map(read, (space) => space.logs),
      committed: () => MemoryDatabase.committed(database, workspaceId).logs,
      session,
      transaction,
      logLock: (logId) => MemoryDatabase.logLock(database, workspaceId, logId),
      appended: () => database.appended,
      nextId: database.nextId
    })
  }
})

/**
 * Bind one workspace over the caller's `MemoryDatabase.Connection`: the `MemoryBinding` every
 * store's `layerMemory` reads and writes through, the workspace's log store, and the workspace's
 * ID. Its logs and records commit together, holding the workspace's writer, which this host's
 * writers wait for and another host's report as contention; a standalone append holds only its
 * log. The stores hold no resources, so the scope that builds them can close at once.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (workspaceId: WorkspaceId.WorkspaceId) =>
  Layer.effect(Store.Store, MemoryStore.make).pipe(
    Layer.provideMerge(
      Layer.effectContext(
        Effect.map(makeBindings(workspaceId), ({ memoryBinding, storeBinding }) =>
          Context.make(MemoryBinding, memoryBinding).pipe(
            Context.add(MemoryStore.Binding, storeBinding),
            Context.add(WorkspaceId.CurrentWorkspaceId, workspaceId)
          )
        )
      )
    )
  )
