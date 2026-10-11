import { Context, Crypto, Effect, Layer } from "effect";
import type { PlatformError, Schema } from "effect";
import * as Journal from "../journal/Journal.ts";
import type * as Log from "../journal/Log.ts";
import type * as Projection from "../journal/Projection.ts";
import type * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import type * as Member from "../workspace/Member.ts";
import type * as Role from "./Role.ts";
import * as Assignment from "./Assignment.ts";
import * as AssignmentFacts from "./AssignmentFacts.ts";

export type Error =
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;
/**
 * @effect-expect-leaking Transaction
 */
export class AssignmentCommand extends Context.Service<
  AssignmentCommand,
  {
    /**
     * Give a member a role across the workspace, as a new assignment. The caller owns authorization
     * and delegation, and anything the member held before.
     */
    readonly assignRole: (
      memberId: Member.Id,
      roleId: Role.Id,
    ) => Effect.Effect<Assignment.Record, Error, Store.Transaction | Publication.Publication>;
    /** End an assignment, returning it as revoked. The caller owns authorization and delegation. */
    readonly revokeAssignment: (
      assignment: Assignment.Record,
    ) => Effect.Effect<Assignment.Record, Error, Store.Transaction | Publication.Publication>;
  }
>()("@amends-dev/core/authorization/assignment/command/Service") {}

/** @category constructors */
export const make = Effect.fn("AssignmentCommand.make")(function* () {
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;

  const assignRole = Effect.fn("AssignmentCommand.assignRole")(function* (
    memberId: Member.Id,
    roleId: Role.Id,
  ) {
    const assignment = Assignment.Record.make({
      id: Assignment.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      memberId,
      status: "active",
      source: Assignment.Source.cases.Role.make({
        roleId,
        scope: { _tag: "Workspace", workspaceId },
      }),
    });
    yield* journal.publish(AssignmentFacts.Created, {
      workspaceId,
      assignmentId: assignment.id,
      memberId: assignment.memberId,
      source: assignment.source,
    });
    return assignment;
  });

  const revokeAssignment = Effect.fn("AssignmentCommand.revokeAssignment")(function* (
    assignment: Assignment.Record,
  ) {
    yield* journal.publish(AssignmentFacts.Revoked, {
      workspaceId,
      assignmentId: assignment.id,
      memberId: assignment.memberId,
    });
    return Assignment.Record.make(Object.assign({}, assignment, { status: "revoked" as const }));
  });

  return AssignmentCommand.of({ assignRole, revokeAssignment });
});
/** Internal writes shared by assignment, ownership, invitation, agent operations, and workspace creation. @category layers */
export const layer = Layer.effect(AssignmentCommand, make());
