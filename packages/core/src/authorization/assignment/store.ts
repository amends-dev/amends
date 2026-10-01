import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../../journal/store.ts";
import type { Member } from "../../workspace/member/member.ts";

import type { Assignment } from "./assignment.ts";
import type { Role } from "../role/role.ts";

export class Failure extends Schema.TaggedError<Failure>()("AssignmentStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("AssignmentStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Host-owned assignment read model for one workspace. Reads use the current host
 * transaction when present, including its staged writes; otherwise committed
 * state. Isolate stored inputs and returned arrays and records from caller mutation.
 * List reads return every match exactly once, with unspecified ordering.
 *
 * Projection writes enlist in the same native transaction as journal entries and
 * checkpoints. List reads participate in its serializable view, including concurrent
 * inserts and revocations. Enforce constraints atomically across concurrent writers.
 * Reject expired or foreign transaction handles and never retry the program internally.
 * Membership, role ownership, permission compatibility, and grant authority are
 * checked by services before publication.
 */
export interface Interface {
  /** Find an active or revoked assignment in this workspace; None if absent. */
  readonly get: (
    assignmentId: Assignment.Id,
  ) => Effect.Effect<Option.Option<Assignment.Record>, Failure>;

  /** All active role and direct grant assignments for this member in this workspace. */
  readonly listActiveByMember: (
    memberId: Member.Id,
  ) => Effect.Effect<ReadonlyArray<Assignment.Record>, Failure>;

  /** All active Role-source assignments referencing this role in this workspace. */
  readonly listActiveByRole: (
    roleId: Role.Id,
  ) => Effect.Effect<ReadonlyArray<Assignment.Record>, Failure>;

  /**
   * Insert a valid, active Assignment.Record belonging to this workspace. Fail
   * with Conflict for schema violations (including scope/workspace mismatch),
   * a foreign workspace, an inactive record, or a reused assignment ID, including
   * revoked IDs. Overlapping grants remain separate assignments. Never upsert.
   */
  readonly insert: (
    record: Assignment.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;

  /**
   * Change an active assignment to revoked, retaining its ID, workspace, member,
   * and source. Fail with Conflict if absent or already revoked. Assigning access
   * again requires a fresh ID.
   */
  readonly markRevoked: (
    assignmentId: Assignment.Id,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/authorization/assignment-store/Service",
) {}

export * as AssignmentStore from "./store.ts";
