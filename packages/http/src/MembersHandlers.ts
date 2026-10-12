/**
 * Implements `MembersGroup`. Each handler enters the workspace as the principal's membership
 * through `Gateway.asMember` and calls one `MemberService` operation: `list`, `get`, `rename`, or
 * `remove`. `Routes` composes its `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { makeAsMember } from "./internal/as-member.ts";
import { MemberService } from "@amends-dev/core/workspace";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register member handlers, each entering the workspace as the request's principal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "members",
  Effect.fn(function* (handlers) {
    const asMember = yield* makeAsMember;
    return handlers.handleAll({
      list: ({ params }) =>
        asMember(
          params.workspaceId,
          MemberService.MemberService.use((memberService) => memberService.list),
        ),
      get: ({ params }) =>
        asMember(
          params.workspaceId,
          MemberService.MemberService.use((memberService) => memberService.get(params.memberId)),
        ),
      rename: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          MemberService.MemberService.use((memberService) => memberService.rename(payload.name)),
        ),
      remove: ({ params }) =>
        asMember(
          params.workspaceId,
          MemberService.MemberService.use((memberService) => memberService.remove(params.memberId)),
        ),
    });
  }),
);
