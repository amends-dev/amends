/**
 * The page's commands: the workspace requests, over HTTP, each ending in a message, failures worded for the person;
 * and what it does in the window, which is moving focus to a row and letting a toast go after a while. And the
 * mount that selects a field's text when the field takes focus.
 */

import { Request } from "@amends-dev/core/request"
import { Invitation, Member, Workspace, WorkspaceId } from "@amends-dev/core/workspace"
import * as ApiErrors from "@amends-dev/http/ApiErrors"
import * as Authentication from "@amends-dev/http/Authentication"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Dom from "foldkit/dom"
import * as Api from "../../api.ts"
import {
  FormErrors,
  JoinErrors,
  Message,
  noFormErrors,
  noJoinErrors,
  WorkspacesDefinition,
  workspaceRowId
} from "./definition.ts"

/**
 * What a request ends in when the host answered `failure`: that the host does not know the session, when the
 * failure is that, since nothing the person does here will succeed until they sign in again, and otherwise what
 * `otherwise` makes of it.
 */
const rejectedSessionOr = <Otherwise>(failure: unknown, otherwise: () => Otherwise) =>
  Schema.is(Authentication.Unauthorized)(failure) ? Message.RejectedSession() : otherwise()

/** List the workspaces the person belongs to and the invitations waiting for them. */
export const LoadWorkspaces = WorkspacesDefinition.command("LoadWorkspaces", {
  messages: [Message.SucceededLoadWorkspaces, Message.FailedLoadWorkspaces, Message.RejectedSession],
  handler: function* () {
    return () =>
      Effect.gen(function* () {
        const client = yield* Api.signedIn
        const listing = yield* client.me.workspaces()
        return Message.SucceededLoadWorkspaces({ memberships: listing.memberships, invitations: listing.invitations })
      }).pipe(
        Effect.catch((failure) => Effect.succeed(rejectedSessionOr(failure, () => Message.FailedLoadWorkspaces())))
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
        : "We couldn't confirm creation. Try again with this name to safely check the same request."
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
  messages: [Message.SucceededCreate, Message.FailedCreate, Message.RejectedSession],
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
            rejectedSessionOr(failure, () =>
              Message.FailedCreate({ key: Option.some(requestKey), error: wordFailure(failure) })
            )
          )
        )
        return Message.SucceededCreate({ workspace })
      }).pipe(Effect.catch(Effect.succeed))
  }
})

/** The refusal of the form for joining as a whole, which the field did not cause. */
const refusedJoinForm = (text: string) => JoinErrors.make({ ...noJoinErrors, form: Option.some(text) })

/** What the person reads of why `failure` kept the invitation from being accepted, about the form. */
const wordJoinFailure = (failure: unknown): JoinErrors =>
  refusedJoinForm(
    Schema.is(ApiErrors.Changed)(failure)
      ? "This invitation changed while you were accepting it. Try again."
      : Schema.is(ApiErrors.Denied)(failure)
        ? "This invitation isn't addressed to this address."
        : Schema.is(ApiErrors.Conflict)(failure) || Schema.is(ApiErrors.NotFound)(failure)
          ? "This invitation is no longer available."
          : Schema.is(ApiErrors.Invalid)(failure)
            ? "This invitation can't be accepted as it is."
            : "We couldn't accept the invitation. Try again when the host is available."
  )

/**
 * Accept the invitation `invitationId` to the workspace `workspaceId`, going by `name` there, ignoring the space
 * around it. Accepting again returns the same member, so a request that ended unsure may be sent again as it was,
 * and carries no key.
 */
export const AcceptInvitation = WorkspacesDefinition.command("AcceptInvitation", {
  args: { workspaceId: WorkspaceId.WorkspaceId, invitationId: Invitation.InvitationId, name: Schema.String },
  messages: [Message.SucceededJoin, Message.FailedJoin, Message.RejectedSession],
  handler: function* () {
    return ({ workspaceId, invitationId, name }) =>
      Effect.gen(function* () {
        const memberName = yield* Schema.decodeEffect(Member.NewName)(name.trim()).pipe(
          Effect.mapError(() =>
            Message.FailedJoin({ error: JoinErrors.make({ ...noJoinErrors, name: Option.some(refusedName) }) })
          )
        )
        yield* Api.signedIn.pipe(
          Effect.flatMap((client) =>
            client.workspaces.acceptInvitation({ params: { workspaceId, invitationId }, payload: { name: memberName } })
          ),
          Effect.mapError((failure) =>
            rejectedSessionOr(failure, () => Message.FailedJoin({ error: wordJoinFailure(failure) }))
          )
        )
        return Message.SucceededJoin()
      }).pipe(Effect.catch(Effect.succeed))
  }
})

/** Move focus to the row that opens `workspaceId`, such as the one for the workspace the person has just joined. */
export const FocusWorkspaceRow = WorkspacesDefinition.command("FocusWorkspaceRow", {
  args: { workspaceId: WorkspaceId.WorkspaceId },
  messages: [Message.CompletedFocusWorkspaceRow],
  handler: function* () {
    return ({ workspaceId }) =>
      Dom.focus(`#${CSS.escape(workspaceRowId(workspaceId))}`).pipe(
        Effect.ignore,
        Effect.as(Message.CompletedFocusWorkspaceRow())
      )
  }
})

/** Wait five seconds, then report that the toast `toastId` has had its time. */
export const ExpireToast = WorkspacesDefinition.command("ExpireToast", {
  args: { toastId: Schema.Finite },
  messages: [Message.ExpiredToast],
  handler: function* () {
    return ({ toastId }) => Effect.sleep("5 seconds").pipe(Effect.as(Message.ExpiredToast({ toastId })))
  }
})

/** Select the text of the field it is mounted on each time the field takes focus, so that typing replaces it. */
export const SelectOnFocus = WorkspacesDefinition.mount("SelectOnFocus", {
  messages: [Message.CompletedSelectOnFocus],
  handler: function* () {
    return ({ element }) =>
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const selectText = () => {
              if (element instanceof HTMLInputElement) element.select()
            }
            element.addEventListener("focus", selectText)
            return selectText
          }),
          (selectText) => Effect.sync(() => element.removeEventListener("focus", selectText))
        )
        return Message.CompletedSelectOnFocus()
      })
  }
})

export const EffectsLayer = Layer.mergeAll(
  LoadWorkspaces.layer,
  CreateWorkspace.layer,
  AcceptInvitation.layer,
  FocusWorkspaceRow.layer,
  ExpireToast.layer,
  SelectOnFocus.layer
)
