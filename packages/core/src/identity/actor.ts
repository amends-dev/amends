import { Context, Schema } from "effect";
import { Member } from "../workspace/member/member.ts";
import { Workspace } from "../workspace/workspace.ts";
import { Identity } from "./identity.ts";

/** The resolved workspace member performing the current application operation. */
export const Value = Schema.Struct({
  workspaceId: Workspace.Id,
  memberId: Member.Id,
  identity: Identity.MemberReference,
});
export interface Value extends Schema.Schema.Type<typeof Value> {}

/**
 * Trusted ingress supplies this after authentication and membership resolution.
 * Read it during each operation, rather than capturing it when a domain layer is
 * built. Authorization evaluates current grants for this member and the target.
 * For agent execution, the actor is the agent; requester attribution is separate.
 *
 * Services require this from each caller on purpose: it names who
 * is calling, which changes per request, while a layer is built once.
 *
 * @effect-leakable-service
 */
export class Service extends Context.Service<Service, Value>()(
  "@amends/core/identity/actor/Service",
) {}

export * as Actor from "./actor.ts";
