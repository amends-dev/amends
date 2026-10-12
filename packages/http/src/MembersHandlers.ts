/**
 * Implements `MembersGroup`. Each handler runs in the workspace `WorkspaceMember` entered as the
 * principal's membership, and calls one `MemberService` operation: `list`, `get`, `rename`, or
 * `remove`. `Routes` composes its `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { MemberService } from "@amends-dev/core/workspace";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register member handlers.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(Api.Api, "members", (handlers) =>
  handlers.handleAll({
    list: () => MemberService.MemberService.use((memberService) => memberService.list),
    get: ({ params }) =>
      MemberService.MemberService.use((memberService) => memberService.get(params.memberId)),
    rename: ({ payload }) =>
      MemberService.MemberService.use((memberService) => memberService.rename(payload.name)),
    remove: ({ params }) =>
      MemberService.MemberService.use((memberService) => memberService.remove(params.memberId)),
  }),
);
