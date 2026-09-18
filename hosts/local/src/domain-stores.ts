import { Assignment, AssignmentStore, Role, RoleStore } from "@amends/core/authorization";
import { Store } from "@amends/core/journal";
import { Member, MemberStore, Workspace, WorkspaceStore } from "@amends/core/workspace";
import { Array, Effect, Schema } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import type { SqliteJournal } from "./journal-store.ts";

type PersistenceError = SqlError.SqlError | Schema.SchemaError | Store.Failure;
const invalid = (cause: PersistenceError) =>
  cause instanceof Schema.SchemaError ||
  (cause instanceof SqlError.SqlError &&
    (cause.reason._tag === "UniqueViolation" || cause.reason._tag === "ConstraintError"));
const memberWriteError = (operation: string) => (cause: PersistenceError) =>
  invalid(cause)
    ? new MemberStore.Conflict({ operation, message: cause.message })
    : new MemberStore.Failure({ operation, cause });
const roleWriteError = (operation: string) => (cause: PersistenceError) =>
  invalid(cause)
    ? new RoleStore.Conflict({ operation, message: cause.message })
    : new RoleStore.Failure({ operation, cause });
const assignmentWriteError = (operation: string) => (cause: PersistenceError) =>
  invalid(cause)
    ? new AssignmentStore.Conflict({ operation, message: cause.message })
    : new AssignmentStore.Failure({ operation, cause });
const workspaceWriteError = (operation: string) => (cause: PersistenceError) =>
  invalid(cause)
    ? new WorkspaceStore.Conflict({ operation, message: cause.message })
    : new WorkspaceStore.Failure({ operation, cause });

/** Decode persisted JSON at the adapter boundary; returned values are freshly allocated. */
const records = <S extends Schema.Constraint>(
  schema: S,
  query: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError | Store.Failure>,
) =>
  query.pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ record: Schema.String }))),
    ),
    Effect.flatMap((rows) =>
      Effect.forEach(rows, (row) =>
        Schema.decodeEffect(Schema.fromJsonString(Schema.toType(schema)))(row.record),
      ),
    ),
  );

export const make = Effect.fn("SqliteDomains.make")(function* (
  workspaceId: Workspace.Id,
  journal: Effect.Success<ReturnType<typeof SqliteJournal.make>>,
) {
  const sql = yield* SqlClient.SqlClient;
  const { guard } = journal;
  const encodeMember = Schema.encodeEffect(Schema.fromJsonString(Member.Record));
  const encodeRole = Schema.encodeEffect(Schema.fromJsonString(Role.Record));
  const encodeAssignment = Schema.encodeEffect(Schema.fromJsonString(Assignment.Record));
  const encodeWorkspace = Schema.encodeEffect(Schema.fromJsonString(Workspace.Record));

  const members = MemberStore.Service.of({
    workspaceId,
    get: Effect.fn("SqliteMember.get")(function* (id) {
      return yield* records(
        Member.Record,
        guard(sql`SELECT record FROM members WHERE workspace_id = ${workspaceId} AND id = ${id}`),
      ).pipe(
        Effect.map(Array.head),
        Effect.mapError((cause) => new MemberStore.Failure({ operation: "get", cause })),
      );
    }),
    findActive: Effect.fn("SqliteMember.findActive")(function* (identity) {
      return yield* records(
        Member.Record,
        guard(
          sql`SELECT record FROM members WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.identity._tag') = ${identity._tag} AND json_extract(record, '$.identity.id') = ${identity.id} AND json_extract(record, '$.status') = 'active'`,
        ),
      ).pipe(
        Effect.map(Array.head),
        Effect.mapError((cause) => new MemberStore.Failure({ operation: "findActive", cause })),
      );
    }),
    list: records(
      Member.Record,
      guard(sql`SELECT record FROM members WHERE workspace_id = ${workspaceId} ORDER BY id`),
    ).pipe(Effect.mapError((cause) => new MemberStore.Failure({ operation: "list", cause }))),
    insert: Effect.fn("SqliteMember.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.workspaceId !== workspaceId || record.status !== "active")
        return yield* new MemberStore.Conflict({
          operation: "insert",
          message: "Expected an active member in this workspace",
        });
      const data = yield* encodeMember(record).pipe(Effect.mapError(memberWriteError("insert")));
      yield* guard(
        sql`INSERT INTO members VALUES (${workspaceId}, ${record.id}, ${data})`,
        true,
      ).pipe(Effect.mapError(memberWriteError("insert")));
    }),
    markRemoved: Effect.fn("SqliteMember.markRemoved")(function* (id) {
      yield* Store.Transaction;
      const rows = yield* guard(
        sql`UPDATE members SET record = json_set(record, '$.status', 'removed') WHERE workspace_id = ${workspaceId} AND id = ${id} AND json_extract(record, '$.status') = 'active' RETURNING id`,
        true,
      ).pipe(Effect.mapError(memberWriteError("markRemoved")));
      if (rows.length === 0)
        return yield* new MemberStore.Conflict({
          operation: "markRemoved",
          message: "Expected an active membership",
        });
    }),
  });

  const roles = RoleStore.Service.of({
    workspaceId,
    get: Effect.fn("SqliteRole.get")(function* (id) {
      return yield* records(
        Role.Record,
        guard(sql`SELECT record FROM roles WHERE workspace_id = ${workspaceId} AND id = ${id}`),
      ).pipe(
        Effect.map(Array.head),
        Effect.mapError((cause) => new RoleStore.Failure({ operation: "get", cause })),
      );
    }),
    insert: Effect.fn("SqliteRole.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.workspaceId !== workspaceId)
        return yield* new RoleStore.Conflict({
          operation: "insert",
          message: "Role belongs to another workspace",
        });
      const data = yield* encodeRole(record).pipe(Effect.mapError(roleWriteError("insert")));
      yield* guard(
        sql`INSERT INTO roles VALUES (${workspaceId}, ${record.id}, ${data})`,
        true,
      ).pipe(Effect.mapError(roleWriteError("insert")));
    }),
    rename: Effect.fn("SqliteRole.rename")(function* (id, name) {
      yield* Store.Transaction;
      const valid = yield* Schema.decodeEffect(Role.Record.fields.name)(name).pipe(
        Effect.mapError(roleWriteError("rename")),
      );
      const rows = yield* guard(
        sql`UPDATE roles SET record = json_set(record, '$.name', ${valid}) WHERE workspace_id = ${workspaceId} AND id = ${id} RETURNING id`,
        true,
      ).pipe(Effect.mapError(roleWriteError("rename")));
      if (rows.length === 0)
        return yield* new RoleStore.Conflict({
          operation: "rename",
          message: "Role does not exist",
        });
    }),
    setPermissions: Effect.fn("SqliteRole.setPermissions")(function* (id, permissions) {
      yield* Store.Transaction;
      const data = yield* Schema.encodeEffect(
        Schema.fromJsonString(Role.Record.fields.permissions),
      )(permissions).pipe(Effect.mapError(roleWriteError("setPermissions")));
      const rows = yield* guard(
        sql`UPDATE roles SET record = json_set(record, '$.permissions', json(${data})) WHERE workspace_id = ${workspaceId} AND id = ${id} RETURNING id`,
        true,
      ).pipe(Effect.mapError(roleWriteError("setPermissions")));
      if (rows.length === 0)
        return yield* new RoleStore.Conflict({
          operation: "setPermissions",
          message: "Role does not exist",
        });
    }),
  });

  const assignments = AssignmentStore.Service.of({
    workspaceId,
    get: Effect.fn("SqliteAssignment.get")(function* (id) {
      return yield* records(
        Assignment.Record,
        guard(
          sql`SELECT record FROM assignments WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        ),
      ).pipe(
        Effect.map(Array.head),
        Effect.mapError((cause) => new AssignmentStore.Failure({ operation: "get", cause })),
      );
    }),
    listActiveByMember: Effect.fn("SqliteAssignment.listActiveByMember")(function* (memberId) {
      return yield* records(
        Assignment.Record,
        guard(
          sql`SELECT record FROM assignments WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.memberId') = ${memberId} AND json_extract(record, '$.status') = 'active'`,
        ),
      ).pipe(
        Effect.mapError(
          (cause) => new AssignmentStore.Failure({ operation: "listActiveByMember", cause }),
        ),
      );
    }),
    listActiveByRole: Effect.fn("SqliteAssignment.listActiveByRole")(function* (roleId) {
      return yield* records(
        Assignment.Record,
        guard(
          sql`SELECT record FROM assignments WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.source._tag') = 'Role' AND json_extract(record, '$.source.roleId') = ${roleId} AND json_extract(record, '$.status') = 'active'`,
        ),
      ).pipe(
        Effect.mapError(
          (cause) => new AssignmentStore.Failure({ operation: "listActiveByRole", cause }),
        ),
      );
    }),
    insert: Effect.fn("SqliteAssignment.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.workspaceId !== workspaceId || record.status !== "active")
        return yield* new AssignmentStore.Conflict({
          operation: "insert",
          message: "Expected an active assignment in this workspace",
        });
      const data = yield* encodeAssignment(record).pipe(
        Effect.mapError(assignmentWriteError("insert")),
      );
      yield* guard(
        sql`INSERT INTO assignments VALUES (${workspaceId}, ${record.id}, ${data})`,
        true,
      ).pipe(Effect.mapError(assignmentWriteError("insert")));
    }),
    markRevoked: Effect.fn("SqliteAssignment.markRevoked")(function* (id) {
      yield* Store.Transaction;
      const rows = yield* guard(
        sql`UPDATE assignments SET record = json_set(record, '$.status', 'revoked') WHERE workspace_id = ${workspaceId} AND id = ${id} AND json_extract(record, '$.status') = 'active' RETURNING id`,
        true,
      ).pipe(Effect.mapError(assignmentWriteError("markRevoked")));
      if (rows.length === 0)
        return yield* new AssignmentStore.Conflict({
          operation: "markRevoked",
          message: "Expected an active assignment",
        });
    }),
  });

  const workspace = WorkspaceStore.Service.of({
    workspaceId,
    get: Effect.fn("SqliteWorkspace.get")(function* () {
      return yield* records(
        Workspace.Record,
        guard(sql`SELECT record FROM workspaces WHERE workspace_id = ${workspaceId}`),
      ).pipe(
        Effect.map(Array.head),
        Effect.mapError((cause) => new WorkspaceStore.Failure({ operation: "get", cause })),
      );
    }),
    insert: Effect.fn("SqliteWorkspace.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.id !== workspaceId)
        return yield* new WorkspaceStore.Conflict({
          operation: "insert",
          message: "Record belongs to another workspace",
        });
      const data = yield* encodeWorkspace(record).pipe(
        Effect.mapError(workspaceWriteError("insert")),
      );
      yield* guard(sql`INSERT INTO workspaces VALUES (${workspaceId}, ${data})`, true).pipe(
        Effect.mapError(workspaceWriteError("insert")),
      );
    }),
  });

  return { members, roles, assignments, workspace };
});

export * as SqliteDomains from "./domain-stores.ts";
