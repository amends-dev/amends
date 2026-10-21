import { Connection as ConnectionContract } from "@amends-dev/connection"
import { WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { type Answer, hostAnswering } from "../../../test/host.ts"
import { LoadModels } from "./command.ts"
import { Message } from "./definition.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const connectionId = ConnectionContract.ConnectionId.make("connection-1")

const load = (answer: Answer) => {
  const { layer } = hostAnswering(answer)
  return LoadModels({ workspaceId, connectionId }).effect.pipe(
    Effect.provide(LoadModels.layer.pipe(Layer.provideMerge(layer)))
  )
}

describe("LoadModels", () => {
  for (const [description, answer] of [
    ["the host cannot be reached", "unreachable"],
    ["the host answers a status the contract does not list", { status: 500, body: { message: "Boom" } }],
    ["the client’s call dies", "dies"]
  ] as const satisfies ReadonlyArray<readonly [string, Answer]>) {
    it.effect(`says the models could not be listed when ${description}, so the form stops waiting for them`, () =>
      Effect.gen(function* () {
        expect(yield* load(answer)).toEqual(
          Message.FailedLoadModels({ connectionId, error: "The host could not be reached. Try again." })
        )
      })
    )
  }

  it.effect("words the refusal as core does when the host refused", () =>
    Effect.gen(function* () {
      const message = yield* load({
        status: 404,
        body: { _tag: "CoreError.NotFound", resource: "Connection", id: "connection-1" }
      })

      expect(message).toEqual(Message.FailedLoadModels({ connectionId, error: "Connection connection-1 not found" }))
    })
  )
})
