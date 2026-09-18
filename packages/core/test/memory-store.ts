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
  readonly checkpoints: Map<string, Checkpoint.Cursor>;
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
  logs: new Map([...state.logs].map(([id, batches]) => [id, batches.map(cloneBatch)])),
  members: new Map([...state.members].map(([key, member]) => [key, cloneMember(member)])),
  roles: new Map([...state.roles].map(([key, role]) => [key, cloneRole(role)])),
  assignments: new Map(
    [...state.assignments].map(([key, assignment]) => [key, cloneAssignment(assignment)]),
  ),
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
    checkpoints: new Map(),
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
