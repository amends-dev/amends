/**
 * Implements `MembersGroup`. Each handler enters the workspace as the principal's membership
 * through `Gateway.asMember` and calls one `MemberService` operation: `list`, `get`, `rename`, or
 * `remove`. `Routes` composes its `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import { Api, Principal } from "@amends-dev/api-http";
import { MemberService } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register member handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api,
  "members",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    return handlers.handleAll({
      list: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(MemberService.MemberService, (memberService) => memberService.list),
          ),
        ),
      get: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(MemberService.MemberService, (memberService) =>
              memberService.get(params.memberId),
            ),
          ),
        ),
      rename: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(MemberService.MemberService, (memberService) =>
              memberService.rename(payload.name),
            ),
          ),
        ),
      remove: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(MemberService.MemberService, (memberService) =>
              memberService.remove(params.memberId),
            ),
          ),
        ),
    });
  }),
);
