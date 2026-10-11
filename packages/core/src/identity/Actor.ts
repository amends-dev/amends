/**
 * The actor: the workspace member performing the current operation, which a trusted ingress such
 * as the gateway resolves from an authenticated identity and provides to each operation it runs.
 * Operations read it to authorize and to attribute what they record; nothing in core resolves it.
 *
 * @since 0.1.0
 */
import { Context, Schema } from "effect";
import * as Member from "../workspace/Member.ts";
import * as Workspace from "../workspace/Workspace.ts";
import * as Identity from "./Identity.ts";

/**
 * The resolved workspace member performing the current application operation: the workspace, the
 * member, and the identity the member was resolved from.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Value = Schema.Struct({
  workspaceId: Workspace.Id,
  memberId: Member.Id,
  identity: Identity.MemberReference,
});
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Value extends Schema.Schema.Type<typeof Value> {}

/**
 * The service an operation reads its actor from. Trusted ingress supplies it after authentication
 * and membership resolution. Read it during each operation, rather than capturing it when a
 * domain layer is built: it names who is calling, which changes per request, while a layer is
 * built once. Authorization evaluates current grants for this member and the target. For agent
 * execution, the actor is the agent; requester attribution is separate.
 *
 * @effect-leakable-service
 * @category services
 * @since 0.1.0
 */
export class Actor extends Context.Service<Actor, Value>()(
  "@amends-dev/core/identity/actor/Service",
) {}
