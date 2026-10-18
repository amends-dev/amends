/**
 * The app's side effects over HTTP, each a named command that ends in a message: the sign-in
 * requests, keeping the session, listing the person's workspaces, and signing out; and, as a
 * member of a workspace, what no replica holds or no action may carry: the integrations the host
 * installs and the models a connection offers, adding a connection, replacing its key, and
 * checking it, since a key never enters an action, and saying the person types in a thread, which
 * no replica holds. A command's failures are messages too, worded for the person.
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import { CoreError } from "@amends-dev/core/error"
import { Presence } from "@amends-dev/core/presence"
import { ThreadId } from "@amends-dev/core/thread"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Accounts from "@amends-dev/gateway/Accounts"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Command from "foldkit/command"
import * as Api from "./api.ts"
import { Message } from "./message.ts"
import * as Session from "./session.ts"
import * as Store from "./sync/Store.ts"
import * as SyncKey from "./sync/SyncKey.ts"

const unreachable = "The host could not be reached. Try again."

/** Why the host refused a request, as core words it, or that it could not be reached. */
const refusalOf = (error: unknown) => (Schema.is(CoreError.Rejection)(error) ? error.message : unreachable)

/** Whom a member's request acts as: the host, the session, and the workspace. */
const asMember = { apiUrl: Schema.String, token: Schema.String, workspaceId: WorkspaceId.WorkspaceId }

/** Send a sign-in code to `email`. */
export const SendCode = Command.define("SendCode", {
  args: { apiUrl: Schema.String, email: Schema.String },
  messages: [Message.SucceededSendCode, Message.FailedSendCode],
  execute: ({ apiUrl, email }) =>
    Effect.gen(function* () {
      const address = yield* Schema.decodeEffect(Accounts.Email)(email).pipe(
        Effect.mapError(() => Message.FailedSendCode({ error: "Enter an email address." }))
      )
      const client = yield* Api.client(apiUrl)
      yield* client.session.start({ payload: { email: address } }).pipe(
        Effect.mapError((error) =>
          Message.FailedSendCode({
            error: Schema.is(SignIn.Limited)(error)
              ? "Too many codes were sent lately. Try again later."
              : Schema.is(SignIn.Unavailable)(error)
                ? "The code could not be sent. Try again."
                : unreachable
          })
        )
      )
      return Message.SucceededSendCode()
    }).pipe(Effect.catch(Effect.succeed))
})

/** Exchange the code sent to `email` for a session. */
export const CheckCode = Command.define("CheckCode", {
  args: { apiUrl: Schema.String, email: Schema.String, code: Schema.String },
  messages: [Message.SucceededSignIn, Message.FailedSignIn],
  execute: ({ apiUrl, email, code }) =>
    Effect.gen(function* () {
      const payload = yield* Schema.decodeEffect(Schema.Struct({ email: Accounts.Email, code: SignIn.Code }))({
        email,
        code
      }).pipe(Effect.mapError(() => Message.FailedSignIn({ error: "Enter the six digits of the code." })))
      const client = yield* Api.client(apiUrl)
      const session = yield* client.session.complete({ payload }).pipe(
        Effect.mapError((error) =>
          Message.FailedSignIn({
            error: Schema.is(SignIn.Rejected)(error) ? "That code is wrong or has expired." : unreachable
          })
        )
      )
      return Message.SucceededSignIn({ session })
    }).pipe(Effect.catch(Effect.succeed))
})

/** Keep `session` in the browser for the next visit. */
export const SaveSession = Command.define("SaveSession", {
  args: { apiUrl: Schema.String, session: SignIn.Session },
  messages: [Message.CompletedSaveSession],
  execute: ({ apiUrl, session }) =>
    Session.save(apiUrl, session).pipe(
      Effect.tapCause((cause) => Effect.logWarning("The session could not be kept", cause)),
      Effect.ignore,
      Effect.as(Message.CompletedSaveSession())
    )
})

/** List the workspaces the session's person belongs to. */
export const LoadWorkspaces = Command.define("LoadWorkspaces", {
  args: { apiUrl: Schema.String, token: Schema.String },
  messages: [Message.SucceededLoadWorkspaces, Message.FailedLoadWorkspaces],
  execute: ({ apiUrl, token }) =>
    Effect.gen(function* () {
      const client = yield* Api.client(apiUrl, token)
      const listing = yield* client.me.workspaces()
      return Message.SucceededLoadWorkspaces({ memberships: listing.memberships })
    }).pipe(Effect.orElseSucceed(() => Message.FailedLoadWorkspaces({ error: unreachable })))
})

/**
 * Sign out: forget the session, the person's stores, and the identity they synced with, then, as
 * far as the host can be reached, remove the browser's sync key and end the session there too.
 */
export const SignOut = Command.define("SignOut", {
  args: { apiUrl: Schema.String, session: SignIn.Session },
  messages: [Message.CompletedSignOut],
  execute: ({ apiUrl, session }) =>
    Effect.gen(function* () {
      const humanId = session.account.id
      const identity = yield* SyncKey.find(apiUrl, humanId)
      yield* Session.forget(apiUrl)
      yield* Store.forgetPerson(apiUrl, humanId)
      const client = yield* Api.client(apiUrl, session.token)
      if (Option.isSome(identity))
        yield* Effect.ignore(client.me.removeSyncKey({ params: { publicKey: identity.value.publicKey } }))
      yield* Effect.ignore(client.me.signOut())
    }).pipe(
      Effect.tapCause((cause) => Effect.logWarning("Signing out left something behind", cause)),
      Effect.ignore,
      Effect.as(Message.CompletedSignOut())
    )
})

/** List the integrations the host installs, which the workspace's connections link to. */
export const LoadIntegrations = Command.define("LoadIntegrations", {
  args: asMember,
  messages: [Message.GotIntegrations, Message.FailedLoadIntegrations],
  execute: ({ apiUrl, token, workspaceId }) =>
    Effect.gen(function* () {
      const client = yield* Api.memberClient(apiUrl, token, workspaceId)
      return Message.GotIntegrations({ integrations: yield* client.connections.integrations() })
    }).pipe(Effect.orElseSucceed(() => Message.FailedLoadIntegrations({ error: unreachable })))
})

/** Add a connection to `integration` called `name`, with its settings, and its key when it authenticates with one. */
export const AddConnection = Command.define("AddConnection", {
  args: {
    ...asMember,
    integration: Schema.String,
    name: Schema.String,
    auth: ConnectionContract.AuthMethod,
    apiKey: Schema.String,
    settings: Connection.Settings
  },
  messages: [Message.AddedConnection, Message.FailedAddConnection],
  execute: ({ apiUrl, token, workspaceId, apiKey, ...connection }) =>
    Effect.gen(function* () {
      const payload = yield* Schema.decodeEffect(Schema.toType(Connection.CreateInput))({
        ...connection,
        ...(connection.auth === "apiKey" ? { apiKey: Redacted.make(apiKey.trim()) } : {})
      }).pipe(
        Effect.mapError(() =>
          Message.FailedAddConnection({ error: "A connection needs a name, and its key when it takes one." })
        )
      )
      const client = yield* Api.memberClient(apiUrl, token, workspaceId)
      yield* client.connections
        .create({ headers: {}, payload })
        .pipe(Effect.mapError((error) => Message.FailedAddConnection({ error: refusalOf(error) })))
      return Message.AddedConnection()
    }).pipe(Effect.catch(Effect.succeed))
})

/** Replace the key of `connectionId` with `apiKey`. */
export const ReplaceConnectionKey = Command.define("ReplaceConnectionKey", {
  args: { ...asMember, connectionId: ConnectionContract.ConnectionId, apiKey: Schema.String },
  messages: [Message.ReplacedKey, Message.FailedReplaceKey],
  execute: ({ apiUrl, token, workspaceId, connectionId, apiKey }) =>
    Effect.gen(function* () {
      const key = yield* Schema.decodeEffect(Schema.toType(Connection.ApiKey))(Redacted.make(apiKey.trim())).pipe(
        Effect.mapError(() => Message.FailedReplaceKey({ error: "Enter the new key." }))
      )
      const client = yield* Api.memberClient(apiUrl, token, workspaceId)
      yield* client.connections
        .replaceKey({ params: { connectionId }, payload: { apiKey: key } })
        .pipe(Effect.mapError((error) => Message.FailedReplaceKey({ error: refusalOf(error) })))
      return Message.ReplacedKey()
    }).pipe(Effect.catch(Effect.succeed))
})

/** Check `connectionId` with its system: whether it answers, and accepts the connection's key. */
export const CheckConnection = Command.define("CheckConnection", {
  args: { ...asMember, connectionId: ConnectionContract.ConnectionId },
  messages: [Message.CheckedConnection, Message.FailedCheckConnection],
  execute: ({ apiUrl, token, workspaceId, connectionId }) =>
    Effect.gen(function* () {
      const client = yield* Api.memberClient(apiUrl, token, workspaceId)
      const health = yield* client.connections.check({ params: { connectionId } })
      return Message.CheckedConnection({ connectionId, health })
    }).pipe(
      Effect.catch((error) => Effect.succeed(Message.FailedCheckConnection({ connectionId, error: refusalOf(error) })))
    )
})

/** List the models `connectionId` offers an agent. */
export const LoadModels = Command.define("LoadModels", {
  args: { ...asMember, connectionId: ConnectionContract.ConnectionId },
  messages: [Message.GotModels, Message.FailedLoadModels],
  execute: ({ apiUrl, token, workspaceId, connectionId }) =>
    Effect.gen(function* () {
      const client = yield* Api.memberClient(apiUrl, token, workspaceId)
      const models = yield* client.connections.models({ params: { connectionId } })
      return Message.GotModels({ connectionId, models })
    }).pipe(
      Effect.catch((error) => Effect.succeed(Message.FailedLoadModels({ connectionId, error: refusalOf(error) })))
    )
})

/**
 * Say the person types in `threadId`, or, given none, that they stopped; then, while they type, wait
 * as long as typing goes without being said again, so it is said at most that often.
 */
export const TellTyping = Command.define("TellTyping", {
  args: { ...asMember, threadId: Schema.NullOr(ThreadId.ThreadId) },
  messages: [Message.ToldTyping],
  execute: ({ apiUrl, token, workspaceId, threadId }) =>
    Effect.gen(function* () {
      const client = yield* Api.memberClient(apiUrl, token, workspaceId)
      yield* client.presence.type({ payload: { threadId } }).pipe(Effect.ignore)
      if (threadId !== null) yield* Effect.sleep(Presence.typingRepeats)
      return Message.ToldTyping()
    }).pipe(Effect.orElseSucceed(() => Message.ToldTyping()))
})
