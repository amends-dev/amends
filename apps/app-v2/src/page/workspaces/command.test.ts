import { Request } from "@amends-dev/core/request"
import { Invitation, Member, Workspace, WorkspaceId } from "@amends-dev/core/workspace"
import { WorkspaceDirectory } from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { atlasInvitation, northstar } from "../../../test/fixtures.ts"
import { type Answer, hostAnswering } from "../../../test/host.ts"
import { AcceptInvitation, CreateWorkspace, ExpireToast, FocusWorkspaceRow, LoadWorkspaces } from "./command.ts"
import { FormErrors, JoinErrors, Message, noFormErrors, noJoinErrors, workspaceRowId } from "./definition.ts"

const created = { id: "workspace-3", name: "Acme", createdBy: "alice", ownerMemberId: "member-20" }

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

        expect(message).toEqual(Message.FailedLoadWorkspaces())
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
            error: refusedForm(
              "We couldn't confirm creation. Try again with this name to safely check the same request."
            )
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

  it.effect("sends the name, ignoring the space around it, to the invitation, and reports that the person joined", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* accept({ status: 200, body: joined }, "  Alex ")

      expect(sent).toEqual([
        { path: "/workspaces/workspace-4/invitations/invitation-4/accept", key: undefined, payload: { name: "Alex" } }
      ])
      expect(message).toEqual(Message.SucceededJoin())
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
      refusedJoin("This invitation isn't addressed to this address.")
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
      refusedJoin("This invitation is no longer available.")
    ],
    [
      "is to a workspace that is not there",
      { status: 404, body: { _tag: "CoreError.NotFound", resource: "Workspace", id: "workspace-4" } },
      refusedJoin("This invitation is no longer available.")
    ],
    [
      "cannot be accepted as it is",
      {
        status: 422,
        body: { _tag: "CoreError.Invalid", reason: { _tag: "Malformed", description: "Expected a name" } }
      },
      refusedJoin("This invitation can't be accepted as it is.")
    ],
    [
      "cannot be accepted because the host is not ready",
      {
        status: 503,
        body: { _tag: "CoreError.Unavailable", reason: { _tag: "CredentialsUnavailable", description: "No keys" } }
      },
      refusedJoin("We couldn't accept the invitation. Try again when the host is available.")
    ],
    [
      "cannot be accepted because the outcome is not known",
      { status: 500, body: { _tag: "CoreError.Uncertain", commitId: "commit-1" } },
      refusedJoin("We couldn't accept the invitation. Try again when the host is available.")
    ],
    [
      "cannot be accepted because the host cannot be reached",
      "unreachable",
      refusedJoin("We couldn't accept the invitation. Try again when the host is available.")
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

describe("FocusWorkspaceRow", () => {
  const workspaceId = northstar.workspace.id

  it.effect("moves focus to the row of the workspace", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const row = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const button = document.createElement("button")
            button.id = workspaceRowId(workspaceId)
            document.body.append(button)
            return button
          }),
          (button) => Effect.sync(() => button.remove())
        )

        const message = yield* FocusWorkspaceRow({ workspaceId }).effect.pipe(Effect.provide(FocusWorkspaceRow.layer))

        expect(document.activeElement).toBe(row)
        expect(message).toEqual(Message.CompletedFocusWorkspaceRow())
      })
    )
  )

  it.effect("completes all the same when the row is not there", () =>
    Effect.gen(function* () {
      const message = yield* FocusWorkspaceRow({ workspaceId }).effect.pipe(Effect.provide(FocusWorkspaceRow.layer))

      expect(message).toEqual(Message.CompletedFocusWorkspaceRow())
    })
  )
})

describe("ExpireToast", () => {
  it.effect("reports that the toast had its time once five seconds have passed, and not before", () =>
    Effect.gen(function* () {
      const expiry = yield* Effect.forkChild(ExpireToast({ toastId: 7 }).effect.pipe(Effect.provide(ExpireToast.layer)))

      yield* TestClock.adjust("4 seconds")
      expect(expiry.pollUnsafe()).toBeUndefined()

      yield* TestClock.adjust("1 second")
      expect(yield* Fiber.join(expiry)).toEqual(Message.ExpiredToast({ toastId: 7 }))
    })
  )
})
