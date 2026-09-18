import { Api, Principal } from "@amends/api-http";
import { MemberApplication } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const layer = HttpApiBuilder.group(
  Api,
  "members",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      list: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(MemberApplication.Service, (members) => members.list),
          ),
        ),
      get: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(MemberApplication.Service, (members) => members.get(params.memberId)),
          ),
        ),
      remove: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(MemberApplication.Service, (members) => members.remove(params.memberId)),
          ),
        ),
    });
  }),
);

export * as MembersHandlers from "./members.ts";
