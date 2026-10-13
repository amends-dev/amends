/**
 * Who a fact says did something: a member, an identity that is not a member of the workspace, or
 * the system itself. Facts record a performer for history; it is separate from the `Actor` whose
 * grants authorized the operation.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as MemberId from "../workspace/MemberId.ts";
import * as Identity from "./Identity.ts";

/**
 * Names a part of the system that acts on its own, such as a job or a migration.
 *
 * @category schemas
 * @since 0.1.0
 */
export const SystemId = Schema.NonEmptyString.check(Schema.isTrimmed()).pipe(
  Schema.brand("SystemPerformerId"),
);
/**
 * @category schemas
 * @since 0.1.0
 */
export type SystemId = typeof SystemId.Type;

/**
 * Historical attribution, independent of the authority used to authorize an operation.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Reference = Schema.TaggedUnion({
  Member: { memberId: MemberId.Id, identity: Identity.MemberReference },
  Identity: { identity: Identity.Reference },
  System: { id: SystemId },
});
/**
 * @category schemas
 * @since 0.1.0
 */
export type Reference = typeof Reference.Type;
