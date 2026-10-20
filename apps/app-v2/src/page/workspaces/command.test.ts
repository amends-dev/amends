import { Request } from "@amends-dev/core/request"
import { Workspace } from "@amends-dev/core/workspace"
import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { apiUrl, session } from "../../../test/fixtures.ts"
import * as Session from "../../session.ts"
import { CreateWorkspace } from "./command.ts"
import { FormErrors, Message, noFormErrors } from "./definition.ts"

const created = { id: "workspace-3", name: "Acme", createdBy: "alice", ownerMemberId: "member-20" }

/** What the host answers: a status and a JSON body, or that it could not be reached. */
type Answer = Readonly<{ status: number; body: unknown }> | "unreachable"

/** What the app sent to create a workspace. */
interface Sent {
  readonly key: string | undefined
  readonly payload: unknown
}

/** The app's services over a host that gives `answer` to each request it gets, and keeps what it was sent. */
const hostAnswering = (answer: Answer) => {
  const sent: Array<Sent> = []
  const client = HttpClient.make((request) =>
    Effect.gen(function* () {
      const text = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : ""
      sent.push({ key: request.headers["idempotency-key"], payload: JSON.parse(text) })
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

describe("CreateWorkspace", () => {
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
