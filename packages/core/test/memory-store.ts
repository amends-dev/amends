import { Array, Context, DateTime, Deferred, Effect, Option, Ref, Schema, Semaphore } from "effect";
import { Assignment } from "../src/authorization/assignment/assignment.ts";
import { AssignmentStore } from "../src/authorization/assignment/store.ts";
import { Role } from "../src/authorization/role/role.ts";
import { RoleStore } from "../src/authorization/role/store.ts";
import type { Scope } from "../src/authorization/scope.ts";
import { Commit } from "../src/journal/commit.ts";
import { Checkpoint } from "../src/journal/checkpoint.ts";
import { Entry } from "../src/journal/entry.ts";
import { Store } from "../src/journal/store.ts";
import { Member } from "../src/workspace/member/member.ts";
import { MemberStore } from "../src/workspace/member/store.ts";
import type { Workspace } from "../src/workspace/workspace.ts";

interface State {
  readonly logs: Map<Entry.LogId, Array<Store.Batch>>;
  readonly appends: Map<Entry.LogId, Map<Store.IdempotencyKey, Store.AppendReceipt>>;
  readonly checkpoints: Map<string, Checkpoint.Cursor>;
  readonly live: Map<Entry.LogId, ReadonlyArray<Checkpoint.LiveVersion>>;
  readonly members: Map<string, Member.Record>;
  readonly roles: Map<string, Role.Record>;
  readonly assignments: Map<string, Assignment.Record>;
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
  live: new Map(
    [...state.live].map(([logId, versions]) => [
      logId,
      versions.map(({ name, version }) => ({ name, version })),
    ]),
  ),
  logs: new Map([...state.logs].map(([id, batches]) => [id, batches.map(cloneBatch)])),
  appends: new Map(
    [...state.appends].map(([id, receipts]) => [
      id,
      new Map([...receipts].map(([key, receipt]) => [key, cloneReceipt(receipt)])),
    ]),
  ),
  members: new Map([...state.members].map(([key, member]) => [key, cloneMember(member)])),
  roles: new Map([...state.roles].map(([key, role]) => [key, cloneRole(role)])),
  assignments: new Map(
    [...state.assignments].map(([key, assignment]) => [key, cloneAssignment(assignment)]),
  ),
});
const cloneReceipt = (receipt: Store.AppendReceipt): Store.AppendReceipt =>
  Schema.decodeUnknownSync(Schema.toType(Store.AppendReceipt))({
    logId: receipt.logId,
    key: receipt.key,
    commitId: receipt.commitId,
    firstIndex: receipt.firstIndex,
    entryCount: receipt.entryCount,
    entries: receipt.entries.map((entry) => ({ ...entry, payload: entry.payload.slice() })),
  });
const cloneMember = (member: Member.Record): Member.Record => ({
  id: member.id,
  workspaceId: member.workspaceId,
  identity: { ...member.identity },
  status: member.status,
});
const cloneRole = (role: Role.Record): Role.Record => ({
  id: role.id,
  workspaceId: role.workspaceId,
  name: role.name,
  permissions: [...role.permissions],
});
const cloneScope = (scope: Scope.Value): Scope.Value =>
  scope._tag === "Workspace" ? { ...scope } : { ...scope, target: { ...scope.target } };
const cloneAssignment = (assignment: Assignment.Record): Assignment.Record => ({
  id: assignment.id,
  workspaceId: assignment.workspaceId,
  memberId: assignment.memberId,
  status: assignment.status,
  source:
    assignment.source._tag === "Role"
      ? { ...assignment.source, scope: cloneScope(assignment.source.scope) }
      : {
          ...assignment.source,
          grant: { ...assignment.source.grant, scope: cloneScope(assignment.source.grant.scope) },
        },
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
  const state = yield* Ref.make<State>({
    logs: new Map(),
    appends: new Map(),
    checkpoints: new Map(),
    live: new Map(),
    members: new Map(),
    roles: new Map(),
    assignments: new Map(),
    value: 0,
  });
  const changes = yield* Ref.make(yield* Deferred.make<void>());
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
    options?: Store.TransactionOptions,
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
            append: Effect.fn("JournalTest.append")(function* (input) {
              if (!session.active)
                return yield* new Store.Failure({ operation: "append", cause: "closed" });
              const request = yield* Schema.decodeEffect(Schema.toType(Store.AppendInput))(
                input,
              ).pipe(
                Effect.mapError(
                  () =>
                    new Store.Conflict({ operation: "append", message: "Invalid append request" }),
                ),
              );
              if (request.idempotencyKey !== undefined) {
                const previous = session.state.appends
                  .get(request.logId)
                  ?.get(request.idempotencyKey);
                if (previous !== undefined) {
                  if (!Store.sameContents(request.entries, previous.entries))
                    return yield* new Store.Conflict({
                      operation: "append",
                      message: "Idempotency key is already associated with different content",
                    });
                  return cloneReceipt(previous).entries;
                }
              }
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
              if (request.entries.length === 0) return [];
              const extending = Option.isSome(last) && last.value.commit.id === session.commit.id;
              const position = Entry.Position.make(
                Option.isNone(last) ? 0 : last.value.position + (extending ? 0 : 1),
              );
              const existing = extending && Option.isSome(last) ? last.value.entries : [];
              const recordedAt = yield* DateTime.now;
              const entries = request.entries.map((content, index) =>
                Store.Entry.make({
                  id: Entry.Id.make(`entry-${nextEntry++}`),
                  logId: request.logId,
                  position,
                  commitId: session.commit.id,
                  index: existing.length + index,
                  recordedAt,
                  ...content,
                  payload: content.payload.slice(),
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
              if (request.idempotencyKey !== undefined) {
                const receipts =
                  session.state.appends.get(request.logId) ??
                  new Map<Store.IdempotencyKey, Store.AppendReceipt>();
                const receipt = yield* Schema.decodeUnknownEffect(
                  Schema.toType(Store.AppendReceipt),
                )({
                  logId: request.logId,
                  key: request.idempotencyKey,
                  commitId: session.commit.id,
                  firstIndex: existing.length,
                  entryCount: entries.length,
                  entries,
                }).pipe(
                  Effect.mapError((cause) => new Store.Failure({ operation: "append", cause })),
                );
                receipts.set(request.idempotencyKey, receipt);
                session.state.appends.set(request.logId, receipts);
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
          if (session.commit.entryCount > 0) {
            const previous = yield* Ref.getAndSet(changes, yield* Deferred.make<void>());
            yield* Deferred.succeed(previous, undefined);
          }
          if (yield* Ref.getAndSet(uncertain, false)) {
            return yield* new Store.CommitUncertain({
              commitId: session.commit.id,
              cause: "lost acknowledgment",
            });
          }
          yield* Store.notifyCommit(session.commit.id, options);
          return result;
        }),
      ),
    );
  });

  const store = Store.Service.of({
    getEntry: Effect.fn("JournalTest.getEntry")(function* (logId, entryId) {
      return Option.fromUndefinedOr(
        ((yield* view).logs.get(logId) ?? [])
          .flatMap((batch) => cloneBatch(batch).entries)
          .find((entry) => entry.id === entryId),
      );
    }),
    getAppend: Effect.fn("JournalTest.getAppend")(function* (logId, key) {
      const saved = (yield* view).appends.get(logId)?.get(key);
      return saved === undefined ? Option.none() : Option.some(cloneReceipt(saved));
    }),
    transaction,
    readFacts: Effect.fn("JournalTest.readFacts")(function* (logId, input) {
      const options = yield* Schema.decodeEffect(Store.ReadFactsOptions)(input).pipe(
        Effect.mapError((cause) => new Store.Failure({ operation: "readFacts", cause })),
      );
      return ((yield* view).logs.get(logId) ?? [])
        .flatMap((batch) => cloneBatch(batch).entries)
        .filter(
          (entry) =>
            entry.fact !== undefined &&
            (options.name === undefined || entry.fact.name === options.name) &&
            (options.subject === undefined || entry.fact.subject === options.subject) &&
            (options.version === undefined || entry.fact.version === options.version) &&
            (options.after === undefined ||
              entry.position > options.after.position ||
              (entry.position === options.after.position && entry.index > options.after.index)),
        )
        .slice(0, options.limit);
    }),
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
    waitForAppend: Effect.fn("JournalTest.waitForAppend")(function* (logId, after) {
      while (true) {
        // Observe the signal before checking committed state, closing the read/wait race.
        const signal = yield* Ref.get(changes);
        const last = Array.last((yield* Ref.get(state)).logs.get(logId) ?? []);
        if (Option.isSome(last) && (Option.isNone(after) || last.value.position > after.value))
          return;
        yield* Deferred.await(signal);
      }
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
    listLive: Effect.fn("JournalTest.checkpoint.listLive")(function* (logId) {
      return ((yield* view).live.get(logId) ?? []).map(({ name, version }) => ({ name, version }));
    }),
    setLive: Effect.fn("JournalTest.checkpoint.setLive")(function* (logId, input) {
      const native = yield* Store.Transaction;
      const current = yield* Effect.serviceOption(Current);
      if (
        Option.isNone(current) ||
        current.value.owner !== owner ||
        !current.value.active ||
        native.id !== current.value.commit.id
      ) {
        return yield* new Store.Failure({
          operation: "checkpoint.setLive",
          cause: "missing transaction",
        });
      }
      const versions = yield* Schema.decodeEffect(Checkpoint.LiveVersions)(input).pipe(
        Effect.mapError(
          (error) =>
            new Store.Conflict({ operation: "checkpoint.setLive", message: error.message }),
        ),
      );
      current.value.state.live.set(
        logId,
        versions.map(({ name, version }) => ({ name, version })),
      );
    }),
  });

  const memberState = Effect.fnUntraced(function* (operation: string) {
    const native = yield* Store.Transaction;
    const current = yield* Effect.serviceOption(Current);
    if (
      Option.isNone(current) ||
      current.value.owner !== owner ||
      !current.value.active ||
      native.id !== current.value.commit.id
    )
      return yield* new MemberStore.Failure({ operation, cause: "missing transaction" });
    return current.value.state;
  });
  const members = (workspaceId: Workspace.Id): MemberStore.Interface => {
    const keyOf = (id: Member.Id) => JSON.stringify([workspaceId, id]);
    return MemberStore.Service.of({
      workspaceId,
      get: Effect.fn("JournalTest.members.get")(function* (id) {
        return Option.map(
          Option.fromUndefinedOr((yield* view).members.get(keyOf(id))),
          cloneMember,
        );
      }),
      getMany: Effect.fn("JournalTest.members.getMany")(function* (ids) {
        const members = (yield* view).members;
        return [...new Set(ids)].flatMap((id) => {
          const member = members.get(keyOf(id));
          return member === undefined ? [] : [cloneMember(member)];
        });
      }),
      findActive: Effect.fn("JournalTest.members.findActive")(function* (identity) {
        return Option.map(
          Array.findFirst(
            [...(yield* view).members.values()],
            (member) =>
              member.workspaceId === workspaceId &&
              member.status === "active" &&
              member.identity._tag === identity._tag &&
              member.identity.id === identity.id,
          ),
          cloneMember,
        );
      }),
      list: Effect.gen(function* () {
        return [...(yield* view).members.values()]
          .filter((member) => member.workspaceId === workspaceId)
          .map(cloneMember);
      }),
      insert: Effect.fn("JournalTest.members.insert")(function* (record) {
        const target = yield* memberState("insert");
        if (record.workspaceId !== workspaceId || record.status !== "active") {
          return yield* new MemberStore.Conflict({
            operation: "insert",
            message: "Expected an active member in this workspace",
          });
        }
        if (target.members.has(keyOf(record.id))) {
          return yield* new MemberStore.Conflict({
            operation: "insert",
            message: "Member ID already exists",
          });
        }
        if (
          [...target.members.values()].some(
            (member) =>
              member.workspaceId === workspaceId &&
              member.status === "active" &&
              member.identity._tag === record.identity._tag &&
              member.identity.id === record.identity.id,
          )
        ) {
          return yield* new MemberStore.Conflict({
            operation: "insert",
            message: "Identity already has an active membership",
          });
        }
        target.members.set(keyOf(record.id), cloneMember(record));
      }),
      markRemoved: Effect.fn("JournalTest.members.markRemoved")(function* (id) {
        const target = yield* memberState("markRemoved");
        const existing = target.members.get(keyOf(id));
        if (existing === undefined || existing.status !== "active") {
          return yield* new MemberStore.Conflict({
            operation: "markRemoved",
            message: "Expected an active membership",
          });
        }
        target.members.set(keyOf(id), {
          id: existing.id,
          workspaceId,
          identity: { ...existing.identity },
          status: "removed",
        });
      }),
    });
  };

  const authorizationView = Effect.gen(function* () {
    const native = yield* Effect.serviceOption(Store.Transaction);
    const current = yield* Effect.serviceOption(Current);
    if (Option.isNone(native) && Option.isNone(current)) return yield* Ref.get(state);
    if (
      Option.isNone(native) ||
      Option.isNone(current) ||
      current.value.owner !== owner ||
      !current.value.active ||
      native.value.id !== current.value.commit.id
    )
      return yield* Effect.fail("missing, closed, or foreign transaction");
    return current.value.state;
  });
  const authorizationWrite = Effect.gen(function* () {
    yield* Store.Transaction;
    return yield* authorizationView;
  });

  const decodeRole = Schema.decodeEffect(Role.Record);
  const validateRole = Effect.fnUntraced(function* (operation: string, record: Role.Record) {
    return yield* decodeRole(record).pipe(
      Effect.mapError((error) => new RoleStore.Conflict({ operation, message: error.message })),
    );
  });
  const roles = (workspaceId: Workspace.Id): RoleStore.Interface => {
    const keyOf = (id: Role.Id) => JSON.stringify([workspaceId, id]);
    const read = Effect.fnUntraced(function* (operation: string) {
      return yield* authorizationView.pipe(
        Effect.mapError((cause) => new RoleStore.Failure({ operation, cause })),
      );
    });
    const write = Effect.fnUntraced(function* (operation: string) {
      return yield* authorizationWrite.pipe(
        Effect.mapError((cause) => new RoleStore.Failure({ operation, cause })),
      );
    });
    return RoleStore.Service.of({
      workspaceId,
      get: Effect.fn("JournalTest.roles.get")(function* (id) {
        return Option.map(
          Option.fromUndefinedOr((yield* read("get")).roles.get(keyOf(id))),
          cloneRole,
        );
      }),
      insert: Effect.fn("JournalTest.roles.insert")(function* (record) {
        const target = yield* write("insert");
        const valid = yield* validateRole("insert", record);
        if (valid.workspaceId !== workspaceId || target.roles.has(keyOf(valid.id))) {
          return yield* new RoleStore.Conflict({
            operation: "insert",
            message: "Expected a fresh role ID in this workspace",
          });
        }
        target.roles.set(keyOf(valid.id), cloneRole(valid));
      }),
      rename: Effect.fn("JournalTest.roles.rename")(function* (id, name) {
        const target = yield* write("rename");
        const existing = target.roles.get(keyOf(id));
        if (existing === undefined)
          return yield* new RoleStore.Conflict({
            operation: "rename",
            message: "Role does not exist",
          });
        const next = yield* validateRole("rename", {
          id: existing.id,
          workspaceId: existing.workspaceId,
          name,
          permissions: existing.permissions,
        });
        target.roles.set(keyOf(id), cloneRole(next));
      }),
      setPermissions: Effect.fn("JournalTest.roles.setPermissions")(function* (id, permissions) {
        const target = yield* write("setPermissions");
        const existing = target.roles.get(keyOf(id));
        if (existing === undefined)
          return yield* new RoleStore.Conflict({
            operation: "setPermissions",
            message: "Role does not exist",
          });
        const next = yield* validateRole("setPermissions", {
          id: existing.id,
          workspaceId: existing.workspaceId,
          name: existing.name,
          permissions,
        });
        target.roles.set(keyOf(id), cloneRole(next));
      }),
    });
  };

  const decodeAssignment = Schema.decodeEffect(Assignment.Record);
  const assignments = (workspaceId: Workspace.Id): AssignmentStore.Interface => {
    const keyOf = (id: Assignment.Id) => JSON.stringify([workspaceId, id]);
    const read = Effect.fnUntraced(function* (operation: string) {
      return yield* authorizationView.pipe(
        Effect.mapError((cause) => new AssignmentStore.Failure({ operation, cause })),
      );
    });
    const write = Effect.fnUntraced(function* (operation: string) {
      return yield* authorizationWrite.pipe(
        Effect.mapError((cause) => new AssignmentStore.Failure({ operation, cause })),
      );
    });
    return AssignmentStore.Service.of({
      workspaceId,
      get: Effect.fn("JournalTest.assignments.get")(function* (id) {
        return Option.map(
          Option.fromUndefinedOr((yield* read("get")).assignments.get(keyOf(id))),
          cloneAssignment,
        );
      }),
      listActiveByMember: Effect.fn("JournalTest.assignments.listActiveByMember")(
        function* (memberId) {
          return [...(yield* read("listActiveByMember")).assignments.values()]
            .filter(
              (record) =>
                record.workspaceId === workspaceId &&
                record.status === "active" &&
                record.memberId === memberId,
            )
            .map(cloneAssignment);
        },
      ),
      listActiveByRole: Effect.fn("JournalTest.assignments.listActiveByRole")(function* (roleId) {
        return [...(yield* read("listActiveByRole")).assignments.values()]
          .filter(
            (record) =>
              record.workspaceId === workspaceId &&
              record.status === "active" &&
              record.source._tag === "Role" &&
              record.source.roleId === roleId,
          )
          .map(cloneAssignment);
      }),
      insert: Effect.fn("JournalTest.assignments.insert")(function* (record) {
        const target = yield* write("insert");
        const valid = yield* decodeAssignment(record).pipe(
          Effect.mapError(
            (error) =>
              new AssignmentStore.Conflict({ operation: "insert", message: error.message }),
          ),
        );
        if (
          valid.workspaceId !== workspaceId ||
          valid.status !== "active" ||
          target.assignments.has(keyOf(valid.id))
        ) {
          return yield* new AssignmentStore.Conflict({
            operation: "insert",
            message: "Expected an active assignment with a fresh ID in this workspace",
          });
        }
        target.assignments.set(keyOf(valid.id), cloneAssignment(valid));
      }),
      markRevoked: Effect.fn("JournalTest.assignments.markRevoked")(function* (id) {
        const target = yield* write("markRevoked");
        const existing = target.assignments.get(keyOf(id));
        if (existing === undefined || existing.status !== "active") {
          return yield* new AssignmentStore.Conflict({
            operation: "markRevoked",
            message: "Expected an active assignment",
          });
        }
        target.assignments.set(
          keyOf(id),
          cloneAssignment({
            id: existing.id,
            workspaceId: existing.workspaceId,
            memberId: existing.memberId,
            source: existing.source,
            status: "revoked",
          }),
        );
      }),
    });
  };

  return {
    store,
    counter,
    checkpoints,
    members,
    roles,
    assignments,
    attempts: Ref.get(attempts),
    snapshot: Effect.map(Ref.get(state), cloneState),
    loseNextAcknowledgment: Ref.set(uncertain, true),
  };
});

export type Fixture = Effect.Success<ReturnType<typeof make>>;
