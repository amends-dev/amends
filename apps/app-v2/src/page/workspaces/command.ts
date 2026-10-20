/** The workspace requests, over HTTP, each ending in a message, failures worded for the person. */

import { Request } from "@amends-dev/core/request"
import { Member, Workspace } from "@amends-dev/core/workspace"
import * as ApiErrors from "@amends-dev/http/ApiErrors"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Api from "../../api.ts"
import { FormErrors, Message, noFormErrors, WorkspacesDefinition } from "./definition.ts"

/** List the workspaces the person belongs to. */
export const LoadWorkspaces = WorkspacesDefinition.command("LoadWorkspaces", {
  messages: [Message.SucceededLoadWorkspaces, Message.FailedLoadWorkspaces],
  handler: function* () {
    return () =>
      Effect.gen(function* () {
        const client = yield* Api.signedIn
        const listing = yield* client.me.workspaces()
        return Message.SucceededLoadWorkspaces({ memberships: listing.memberships })
      }).pipe(
        Effect.orElseSucceed(() => Message.FailedLoadWorkspaces({ error: "The host could not be reached. Try again." }))
      )
  }
})

const refusedName = "Use 1 to 80 characters, with no invisible ones."

/** The refusal of the whole form, which its fields did not cause. */
const refusedForm = (text: string) => FormErrors.make({ ...noFormErrors, form: Option.some(text) })

/** What the person reads of why `failure` kept the workspace from being created. */
const wordFailure = (failure: unknown): FormErrors =>
  refusedForm(
    Schema.is(ApiErrors.Denied)(failure)
      ? "This identity can't create workspaces."
      : Schema.is(ApiErrors.Invalid)(failure)
        ? "Those values were not accepted. Check them and try again."
        : "The workspace could not be created. Try again."
  )

/** The names as the host takes them, which ignores the space around them, or where each is refused. */
const decodeNames = (name: string, memberName: string): Effect.Effect<Workspace.CreateInput, FormErrors> => {
  const decoded = {
    name: Schema.decodeOption(Workspace.NewName)(name.trim()),
    memberName: Schema.decodeOption(Member.NewName)(memberName.trim())
  }
  return Option.isSome(decoded.name) && Option.isSome(decoded.memberName)
    ? Effect.succeed({ name: decoded.name.value, memberName: decoded.memberName.value })
    : Effect.fail(
        FormErrors.make({
          ...noFormErrors,
          name: Option.isNone(decoded.name) ? Option.some(refusedName) : Option.none(),
          memberName: Option.isNone(decoded.memberName) ? Option.some(refusedName) : Option.none()
        })
      )
}

/** A request key no other request has. */
const newRequestKey = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto
  return Request.Key.make(yield* crypto.randomUUIDv4())
})

/**
 * Create a workspace named `name`, with the person its owner and first member as `memberName`. Each attempt at the
 * same values sends the same request key, so that one made again after an uncertain outcome returns the workspace the
 * first created, and not a second; a `key` is the one an earlier attempt sent, and none starts a new request.
 */
export const CreateWorkspace = WorkspacesDefinition.command("CreateWorkspace", {
  args: { name: Schema.String, memberName: Schema.String, key: Schema.Option(Request.Key) },
  messages: [Message.SucceededCreate, Message.FailedCreate],
  handler: function* () {
    return ({ name, memberName, key }) =>
      Effect.gen(function* () {
        const input = yield* decodeNames(name, memberName).pipe(
          Effect.mapError((error) => Message.FailedCreate({ key, error }))
        )
        const requestKey = Option.isSome(key)
          ? key.value
          : yield* newRequestKey.pipe(
              Effect.mapError((failure) => Message.FailedCreate({ key, error: wordFailure(failure) }))
            )
        const workspace = yield* Api.signedIn.pipe(
          Effect.flatMap((client) =>
            client.workspaces.create({ payload: input, headers: { "idempotency-key": requestKey } })
          ),
          Effect.mapError((failure) =>
            Message.FailedCreate({ key: Option.some(requestKey), error: wordFailure(failure) })
          )
        )
        return Message.SucceededCreate({ workspace })
      }).pipe(Effect.catch(Effect.succeed))
  }
})

export const EffectsLayer = Layer.mergeAll(LoadWorkspaces.layer, CreateWorkspace.layer)
