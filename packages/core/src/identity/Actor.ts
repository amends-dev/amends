/**
 * The actor: the workspace member performing the current operation, which a trusted ingress such
 * as the gateway resolves from an authenticated identity and provides to each operation it runs.
 * Operations read it to authorize and to attribute what they record; nothing in core resolves it.
 *
 * @since 0.1.0
 */
import * as Context from "effect/Context";
import type * as Identity from "./Identity.ts";
import type * as Member from "../workspace/Member.ts";
import type * as Workspace from "../workspace/Workspace.ts";

/**
 * The resolved workspace member performing the current application operation, which an operation
 * reads its actor from. Trusted ingress supplies it after authentication and membership
 * resolution, with `Actor.of`. Read it during each operation, rather than capturing it when a
 * domain layer is built: it names who is calling, which changes per request, while a layer is
 * built once. Authorization evaluates current grants for this member and the target. For agent
 * execution, the actor is the agent; requester attribution is separate.
 *
 * @effect-leakable-service
 * @category services
 * @since 0.1.0
 */
export class Actor extends Context.Service<
  Actor,
  {
    /** The workspace the member acts in. */
    readonly workspaceId: Workspace.Id;
    /** The acting member. */
    readonly memberId: Member.Id;
    /** The human or agent the member was resolved from. */
    readonly identity: Identity.MemberReference;
  }
>()("@amends-dev/core/identity/Actor") {}
