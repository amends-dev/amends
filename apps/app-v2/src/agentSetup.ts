/**
 * How an agent is set up, as the person fills it in: its instructions, the harness it runs on, or
 * `Auto`, the connection and the id of its model and how hard it reasons, and the sandbox it works
 * in, or none; the draft of an agent's setup as it stands; whether two drafts set an agent up alike;
 * and the configuration a draft makes, or the part it still wants.
 */

import { Agent } from "@amends-dev/core/agent"
import type { ReplicaRecord } from "@amends-dev/core/replica"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

/**
 * A draft of an agent's setup. Each connection is its ID, empty for `Auto` as the harness and for
 * none as the sandbox, and the effort is empty for the model's own.
 */
export const Draft = Schema.Struct({
  instructions: Schema.String,
  harness: Schema.String,
  modelConnectionId: Schema.String,
  modelId: Schema.String,
  effort: Schema.String,
  sandbox: Schema.String
})
export type Draft = typeof Draft.Type

/** The draft of a new agent's setup: on `Auto`, with no model chosen, and no sandbox. */
export const empty: Draft = {
  instructions: "",
  harness: "",
  modelConnectionId: "",
  modelId: "",
  effort: "",
  sandbox: ""
}

/** The draft of `agent`'s setup as it stands. */
export const draftOf = (agent: ReplicaRecord.Agent): Draft => ({
  instructions: agent.instructions,
  harness: Agent.Harness.match(agent.harness, { Auto: () => "", Connection: ({ connectionId }) => connectionId }),
  modelConnectionId: agent.model.connectionId,
  modelId: agent.model.id,
  effort: agent.model.effort ?? "",
  sandbox: agent.sandbox?.connectionId ?? ""
})

/** Whether `left` and `right` set an agent up alike: the space around the instructions and the model's id aside. */
export const isSameSetup = (left: Draft, right: Draft): boolean =>
  left.instructions.trim() === right.instructions.trim() &&
  left.harness === right.harness &&
  left.modelConnectionId === right.modelConnectionId &&
  left.modelId.trim() === right.modelId.trim() &&
  left.effort === right.effort &&
  left.sandbox === right.sandbox

/** The fields of a setup, which a part that can't be saved as it is is marked beside. */
export const Field = Schema.Literals(["Instructions", "Harness", "ModelConnection", "Model", "Sandbox"])
export type Field = typeof Field.Type

/** A part of a setup that can't be saved as it is: the field it is marked beside, and why. */
export const Problem = Schema.Struct({ field: Field, message: Schema.String })
export type Problem = typeof Problem.Type

const decodeInstructions = Schema.decodeUnknownResult(Agent.NewInstructions)

const decodeConfiguration = Schema.decodeUnknownResult(Agent.Configuration)

/** The configuration `draft` makes, or the part it still wants. */
export const configurationOf = (draft: Draft): Result.Result<Agent.Configuration, Problem> => {
  const instructions = draft.instructions.trim()
  if (draft.modelConnectionId === "") {
    return Result.fail({ field: "ModelConnection", message: "Choose a model connection." })
  }
  if (draft.modelId.trim() === "") return Result.fail({ field: "Model", message: "Choose a model." })
  if (Result.isFailure(decodeInstructions(instructions))) {
    return Result.fail({
      field: "Instructions",
      message: "The instructions are too long, or hold what can't be stored."
    })
  }
  return Result.mapError(
    decodeConfiguration({
      instructions,
      harness: draft.harness === "" ? { _tag: "Auto" } : { _tag: "Connection", connectionId: draft.harness },
      model: {
        connectionId: draft.modelConnectionId,
        id: draft.modelId.trim(),
        ...(draft.effort === "" ? {} : { effort: draft.effort })
      },
      sandbox: draft.sandbox === "" ? null : { connectionId: draft.sandbox }
    }),
    (): Problem => ({ field: "Model", message: "This model ID can't be used. Use 1 to 200 characters." })
  )
}
