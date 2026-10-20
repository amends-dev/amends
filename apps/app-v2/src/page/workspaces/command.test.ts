import { Request } from "@amends-dev/core/request"
import { Invitation, Member, Workspace, WorkspaceId } from "@amends-dev/core/workspace"
import { WorkspaceDirectory } from "@amends-dev/gateway"
import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { apiUrl, atlasInvitation, northstar, session } from "../../../test/fixtures.ts"
import * as Session from "../../session.ts"
import { AcceptInvitation, CreateWorkspace, LoadWorkspaces } from "./command.ts"
import { FormErrors, JoinErrors, Message, noFormErrors, noJoinErrors } from "./definition.ts"

const created = { id: "workspace-3", name: "Acme", createdBy: "alice", ownerMemberId: "member-20" }

/** What the host answers: a status and a JSON body, or that it could not be reached. */
type Answer = Readonly<{ status: number; body: unknown }> | "unreachable"

/** What the app sent to the host: where, with which request key, and what. */
interface Sent {
  readonly path: string
  readonly key: string | undefined
  readonly payload: unknown
}

/** The app's services over a host that gives `answer` to each request it gets, and keeps what it was sent. */
const hostAnswering = (answer: Answer) => {
  const sent: Array<Sent> = []
  const client = HttpClient.make((request) =>
    Effect.gen(function* () {
      const text = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : ""
      sent.push({
        path: new URL(request.url).pathname,
        key: request.headers["idempotency-key"],
        payload: text === "" ? undefined : JSON.parse(text)
      })
      if (answer === "unreachable") {
        return yield* new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request }) })
      }
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(answer.body), {
          status: answer.status,
          headers: { "content-type": "application/json" }
        })
      )
    })
  )
  const layer = Layer.mergeAll(
    Layer.succeed(HttpClient.HttpClient, client),
    Layer.succeed(
      Session.Session,
      Session.Session.of({
        apiUrl,
        current: Effect.succeedSome(session),
        required: Effect.succeed(session),
        keep: () => Effect.void,
        forget: Effect.void
      })
    ),
    BunCrypto.layer
  )
  return { sent, layer }
}

/** What the host answers to a request whose session it does not know. */
const unauthorized: Answer = {
  status: 401,
  body: { _tag: "Authentication.Unauthorized", message: "The bearer token is not recognized" }
}

const load = (answer: Answer) => {
  const { sent, layer } = hostAnswering(answer)
  return LoadWorkspaces().effect.pipe(
    Effect.provide(LoadWorkspaces.layer.pipe(Layer.provideMerge(layer))),
    Effect.map((message) => ({ message, sent }))
  )
}

const create = (
  answer: Answer,
  names: Readonly<{ name: string; memberName: string }>,
  key: Option.Option<Request.Key>
) => {
  const { sent, layer } = hostAnswering(answer)
  return CreateWorkspace({ ...names, key }).effect.pipe(
    Effect.provide(CreateWorkspace.layer.pipe(Layer.provideMerge(layer))),
    Effect.map((message) => ({ message, sent }))
  )
}

const names = { name: "Acme", memberName: "Alex" }

const workspace = Schema.decodeSync(Workspace.Workspace)(created)

const key = Request.Key.make("key-1")

/** The refusal of the form as a whole. */
const refusedForm = (text: string) => FormErrors.make({ ...noFormErrors, form: Option.some(text) })

const refusedName = "Use 1 to 80 characters, with no invisible ones."

describe("LoadWorkspaces", () => {
  it.effect("asks for the person's workspaces, and reports them and their invitations", () =>
    Effect.gen(function* () {
      const listing = yield* Schema.encodeEffect(WorkspaceDirectory.Listing)({
        memberships: [northstar],
        invitations: [atlasInvitation]
      })
      const { message, sent } = yield* load({ status: 200, body: listing })

      expect(sent.map(({ path }) => path)).toEqual(["/me/workspaces"])
      expect(message).toEqual(
        Message.SucceededLoadWorkspaces({ memberships: [northstar], invitations: [atlasInvitation] })
      )
    })
  )

  it.effect("says the session is rejected when the host does not know it", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* load(unauthorized)

      expect(sent).toHaveLength(1)
      expect(message).toEqual(Message.RejectedSession())
    })
  )

  for (const [description, answer] of [
    [
      "the host is not ready",
      {
        status: 503,
        body: { _tag: "CoreError.Unavailable", reason: { _tag: "CredentialsUnavailable", description: "No keys" } }
      }
    ],
    ["the host cannot be reached", "unreachable"]
  ] as const satisfies ReadonlyArray<readonly [string, Answer]>) {
    it.effect(`says the listing failed when ${description}, which is no reason to sign in again`, () =>
      Effect.gen(function* () {
        const { message } = yield* load(answer)

        expect(message).toEqual(Message.FailedLoadWorkspaces({ error: "The host could not be reached. Try again." }))
      })
    )
  }
})

describe("CreateWorkspace", () => {
  it.effect("says the session is rejected when the host does not know it, whichever key it sent", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* create(unauthorized, names, Option.some(key))

      expect(sent).toHaveLength(1)
      expect(message).toEqual(Message.RejectedSession())
    })
  )

  it.effect("sends the names, ignoring the space around them, with a new key, and reports the workspace", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* create(
        { status: 201, body: created },
        { name: "  Acme ", memberName: "Alex  " },
        Option.none()
      )

      expect(sent).toHaveLength(1)
      expect(sent[0]?.payload).toEqual(names)
      expect(sent[0]?.key).toMatch(/^[\da-f-]{36}$/)
      expect(message).toEqual(Message.SucceededCreate({ workspace }))
    })
  )

  it.effect("sends the key of an earlier attempt again, so that the host gives back what it created", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* create({ status: 201, body: created }, names, Option.some(key))

      expect(sent.map(({ key }) => key)).toEqual(["key-1"])
      expect(message).toEqual(Message.SucceededCreate({ workspace }))
    })
  )

  it.effect("says where each name is refused without asking the host", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* create(
        { status: 201, body: created },
        { name: "   ", memberName: "Al\u0000ex" },
        Option.none()
      )

      expect(sent).toEqual([])
      expect(message).toEqual(
        Message.FailedCreate({
          key: Option.none(),
          error: FormErrors.make({
            ...noFormErrors,
            name: Option.some(refusedName),
            memberName: Option.some(refusedName)
          })
        })
      )
    })
  )

  it.effect("says an identity that may not create workspaces cannot, with the key it used", () =>
    Effect.gen(function* () {
      const { message } = yield* create(
        { status: 403, body: { _tag: "CoreError.Denied", reason: { _tag: "HumanRequired" } } },
        names,
        Option.some(key)
      )

      expect(message).toEqual(
        Message.FailedCreate({ key: Option.some(key), error: refusedForm("This identity can't create workspaces.") })
      )
    })
  )

  it.effect("says the host did not accept the values", () =>
    Effect.gen(function* () {
      const { message } = yield* create(
        {
          status: 422,
          body: { _tag: "CoreError.Invalid", reason: { _tag: "Malformed", description: "Expected a name" } }
        },
        names,
        Option.some(key)
      )

      expect(message).toEqual(
        Message.FailedCreate({
          key: Option.some(key),
          error: refusedForm("Those values were not accepted. Check them and try again.")
        })
      )
    })
  )

  for (const [description, answer] of [
    [
      "the host is not ready",
      {
        status: 503,
        body: { _tag: "CoreError.Unavailable", reason: { _tag: "CredentialsUnavailable", description: "No keys" } }
      }
    ],
    ["the outcome is not known", { status: 500, body: { _tag: "CoreError.Uncertain", commitId: "commit-1" } }],
    ["the host cannot be reached", "unreachable"]
  ] as const satisfies ReadonlyArray<readonly [string, Answer]>) {
    it.effect(`asks the person to try again when ${description}, with the key that makes trying again safe`, () =>
      Effect.gen(function* () {
        const { message, sent } = yield* create(answer, names, Option.none())

        expect(sent).toHaveLength(1)
        expect(message).toEqual(
          Message.FailedCreate({
            key: Option.some(Request.Key.make(sent[0]?.key ?? "")),
            error: refusedForm("The workspace could not be created. Try again.")
          })
        )
      })
    )
  }
})

const accept = (answer: Answer, name: string) => {
  const { sent, layer } = hostAnswering(answer)
  return AcceptInvitation({
    workspaceId: WorkspaceId.WorkspaceId.make("workspace-4"),
    invitationId: Invitation.InvitationId.make("invitation-4"),
    name
  }).effect.pipe(
    Effect.provide(AcceptInvitation.layer.pipe(Layer.provideMerge(layer))),
    Effect.map((message) => ({ message, sent }))
  )
}

/** The member the host made of the person, as it answers. */
const joined = Schema.encodeSync(Member.Member)(northstar.member)

/** The refusal of the form for joining as a whole. */
const refusedJoin = (text: string) => JoinErrors.make({ ...noJoinErrors, form: Option.some(text) })

describe("AcceptInvitation", () => {
  it.effect("says the session is rejected when the host does not know it", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* accept(unauthorized, "Alex")

      expect(sent).toHaveLength(1)
      expect(message).toEqual(Message.RejectedSession())
    })
  )

  it.effect("sends the name, ignoring the space around it, to the invitation, and reports the member", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* accept({ status: 200, body: joined }, "  Alex ")

      expect(sent).toEqual([
        { path: "/workspaces/workspace-4/invitations/invitation-4/accept", key: undefined, payload: { name: "Alex" } }
      ])
      expect(message).toEqual(Message.SucceededJoin({ member: northstar.member }))
    })
  )

  for (const name of ["   ", "Al\u0000ex"]) {
    it.effect(`says at the name that ${JSON.stringify(name)} is refused without asking the host`, () =>
      Effect.gen(function* () {
        const { message, sent } = yield* accept({ status: 200, body: joined }, name)

        expect(sent).toEqual([])
        expect(message).toEqual(
          Message.FailedJoin({ error: JoinErrors.make({ ...noJoinErrors, name: Option.some(refusedName) }) })
        )
      })
    )
  }

  for (const [description, answer, wording] of [
    [
      "is not addressed to this account",
      { status: 403, body: { _tag: "CoreError.Denied", reason: { _tag: "HumanRequired" } } },
      refusedJoin("This invitation isn't addressed to this account.")
    ],
    [
      "is no longer open",
      {
        status: 409,
        body: {
          _tag: "CoreError.Conflict",
          reason: { _tag: "InvitationClosed", invitationId: "invitation-4", reason: "revoked" }
        }
      },
      refusedJoin("This invitation is no longer open.")
    ],
    [
      "is to a workspace that is not there",
      { status: 404, body: { _tag: "CoreError.NotFound", resource: "Workspace", id: "workspace-4" } },
      refusedJoin("This workspace no longer exists.")
    ],
    [
      "has a name the host did not accept",
      {
        status: 422,
        body: { _tag: "CoreError.Invalid", reason: { _tag: "Malformed", description: "Expected a name" } }
      },
      JoinErrors.make({ ...noJoinErrors, name: Option.some("That name was not accepted.") })
    ],
    [
      "cannot be accepted because the host is not ready",
      {
        status: 503,
        body: { _tag: "CoreError.Unavailable", reason: { _tag: "CredentialsUnavailable", description: "No keys" } }
      },
      refusedJoin("The invitation could not be accepted. Try again.")
    ],
    [
      "cannot be accepted because the outcome is not known",
      { status: 500, body: { _tag: "CoreError.Uncertain", commitId: "commit-1" } },
      refusedJoin("The invitation could not be accepted. Try again.")
    ],
    [
      "cannot be accepted because the host cannot be reached",
      "unreachable",
      refusedJoin("The invitation could not be accepted. Try again.")
    ]
  ] as const satisfies ReadonlyArray<readonly [string, Answer, JoinErrors]>) {
    it.effect(`says so when the invitation ${description}`, () =>
      Effect.gen(function* () {
        const { message, sent } = yield* accept(answer, "Alex")

        expect(sent).toHaveLength(1)
        expect(message).toEqual(Message.FailedJoin({ error: wording }))
      })
    )
  }
})
