/**
 * A member is a human or an agent admitted to a workspace: the record every operation checks its
 * actor against, with the identity it refers to, what the workspace calls it, and whether it is
 * still active. `MemberService` is the operations on members, `MemberCommand` admits one, and
 * `MemberStore` keeps them. A removed membership keeps its record, so its ID stays referable.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Identity from "../identity/Identity.ts"
import * as Text from "../text/Text.ts"
import * as MemberId from "./MemberId.ts"
import * as WorkspaceId from "./WorkspaceId.ts"

/**
 * Whether the membership gives access now: `active`, or `removed`, which is terminal and keeps the
 * record for history.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Status = Schema.Literals(["active", "removed"])

/**
 * @category schemas
 * @since 0.1.0
 */
export type Status = typeof Status.Type

/**
 * What people in a workspace call a member, as recorded: without surrounding space, 1 to 80
 * characters. Names chosen now are `NewName`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Name = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(80)).annotate({
  identifier: "MemberName"
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Name = typeof Name.Type

/**
 * A name a member chooses now: a `Name` without hidden characters.
 *
 * @category schemas
 * @since 0.1.0
 */
export const NewName = Name.check(Text.isName)

/**
 * A membership as `MemberStore` keeps it: whom it admits, what the workspace calls them, and its
 * status. The name is what a person chose on joining or has chosen since, or an agent's name. A
 * removed membership retains its identity and name for historical references.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Member = Schema.Struct({
  id: MemberId.MemberId,
  workspaceId: WorkspaceId.WorkspaceId,
  identity: Identity.MemberReference,
  name: Name,
  status: Status
}).annotate({ identifier: "WorkspaceMember" })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Member extends Schema.Schema.Type<typeof Member> {}
