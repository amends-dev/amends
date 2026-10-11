import { Api, ApiErrors, Credential, Principal, Unauthorized } from "@amends-dev/api-http";
import { Identity } from "@amends-dev/core/identity";
import { Accounts, SessionTokens, WorkspaceDirectory } from "@amends-dev/gateway";
import { Array, Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the principal's own handlers over the host's accounts, directory, and session tokens,
 * reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "me",
  Effect.fn(function* (handlers) {
    const accounts = yield* Accounts.Accounts;
    const workspaceDirectory = yield* WorkspaceDirectory.WorkspaceDirectory;
    const sessionTokens = yield* SessionTokens.SessionTokens;
    return handlers.handleAll({
      account: () =>
        Effect.gen(function* () {
          const principal = yield* Principal;
          if (!Identity.MemberReference.isAnyOf(["Human"])(principal))
            return yield* new ApiErrors.HumanRequired();
          const found = Array.head(yield* accounts.findByIds([principal.id]));
          if (found._tag === "None")
            return yield* new Unauthorized({ message: "No account holds this session" });
          return found.value;
        }),
      workspaces: () =>
        Effect.flatMap(Principal, (principal) => workspaceDirectory.list(principal)),
      signOut: () => Effect.flatMap(Credential, (credential) => sessionTokens.revoke(credential)),
    });
  }),
);
