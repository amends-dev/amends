import { WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { type Answer, hostAnswering } from "../../../test/host.ts"
import { LoadIntegrations } from "./command.ts"
import { Message } from "./definition.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")

const load = (answer: Answer) => {
  const { sent, layer } = hostAnswering(answer)
  return LoadIntegrations({ workspaceId }).effect.pipe(
    Effect.provide(LoadIntegrations.layer.pipe(Layer.provideMerge(layer))),
    Effect.map((message) => ({ message, sent }))
  )
}

describe("LoadIntegrations", () => {
  it.effect("asks the host which integrations it installs, and reports them", () =>
    Effect.gen(function* () {
      const { message, sent } = yield* load({ status: 200, body: [] })

      expect(sent).toHaveLength(1)
      expect(message).toEqual(Message.ReceivedIntegrations({ integrations: [] }))
    })
  )

  for (const [description, answer] of [
    ["the host cannot be reached", "unreachable"],
    ["the host answers a status the contract does not list", { status: 500, body: { message: "Boom" } }],
    ["the client’s call dies", "dies"]
  ] as const satisfies ReadonlyArray<readonly [string, Answer]>) {
    it.effect(`says they could not be listed when ${description}, so the page stops waiting`, () =>
      Effect.gen(function* () {
        const { message } = yield* load(answer)

        expect(message).toEqual(Message.FailedLoadIntegrations({ error: "The host could not be reached. Try again." }))
      })
    )
  }
})
