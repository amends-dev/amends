import { Context, Crypto, Effect, Layer } from "effect";
import type { PlatformError, Schema } from "effect";
import { Journal } from "../../journal/journal.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import type { Publication } from "../../journal/publication.ts";
import { Store } from "../../journal/store.ts";
import type { Member } from "../../workspace/member/member.ts";
import type { Role } from "../role/role.ts";
import { Assignment } from "./assignment.ts";
import { AssignmentFacts } from "./facts.ts";

export type Error =
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;
export interface Interface {
  /**
   * Give a member a role across the workspace, as a new assignment. The caller owns authorization
   * and delegation, and anything the member held before.
   */
  readonly assignRole: (
    memberId: Member.Id,
    roleId: Role.Id,
  ) => Effect.Effect<Assignment.Record, Error, Store.Transaction | Publication.Service>;
  /** End an assignment, returning it as revoked. The caller owns authorization and delegation. */
  readonly revokeAssignment: (
    assignment: Assignment.Record,
  ) => Effect.Effect<Assignment.Record, Error, Store.Transaction | Publication.Service>;
}
/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/authorization/assignment/command/Service",
) {}

/** @category constructors */
export const make = Effect.fn("AssignmentCommand.make")(function* () {
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

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

  return Service.of({ assignRole, revokeAssignment });
});
/** Internal writes shared by assignment, ownership, invitation, agent operations, and workspace creation. @category layers */
export const layer = Layer.effect(Service, make());
export * as AssignmentCommand from "./command.ts";
