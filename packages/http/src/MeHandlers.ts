/**
 * Implements `MeGroup` over the host's services alone, entering no workspace: `Accounts.findByIds`
 * for the principal's account, `WorkspaceDirectory.list` for its memberships and pending
 * invitations, `SessionTokens.revoke` for the request's `Credential` on signing out, and
 * `SyncStorage` for the person's sync keys. An agent asking for its account or a sync key is
 * denied as `HumanRequired`, and a session no account holds `Unauthorized`.
 *
 * @since 0.1.0
 */

import { Accounts, SessionTokens, SyncStorage, WorkspaceDirectory } from "@amends-dev/gateway"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as Option from "effect/Option"
import * as Api from "./Api.ts"
import * as Authentication from "./Authentication.ts"
import { requireHuman } from "./internal/human.ts"

/**
 * Register the principal's own handlers over the host's accounts, directory, session tokens, and
 * sync storage, reading the principal per request.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "me",
  Effect.fn(function* (handlers) {
    const accounts = yield* Accounts.Accounts
    const workspaceDirectory = yield* WorkspaceDirectory.WorkspaceDirectory
    const sessionTokens = yield* SessionTokens.SessionTokens
    const syncStorage = yield* SyncStorage.SyncStorage
    return handlers.handleAll({
      account: () =>
        Effect.gen(function* () {
          const person = yield* requireHuman
          const found = Array.head(yield* accounts.findByIds([person.id]))
          if (Option.isNone(found))
            return yield* new Authentication.Unauthorized({
              message: "No account holds this session"
            })
          return found.value
        }),
      workspaces: () => Effect.flatMap(Authentication.Principal, (principal) => workspaceDirectory.list(principal)),
      signOut: () => Effect.flatMap(Authentication.Credential, (credential) => sessionTokens.revoke(credential)),
      registerSyncKey: ({ params }) =>
        Effect.flatMap(requireHuman, (person) => syncStorage.registerKey(params.publicKey, person.id)),
      removeSyncKey: ({ params }) =>
        Effect.flatMap(requireHuman, (person) => syncStorage.removeKey(params.publicKey, person.id))
    })
  })
)
