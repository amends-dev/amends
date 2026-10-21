import { ReplicaRecord } from "@amends-dev/core/replica"
import { describe, expect, it } from "@effect/vitest"
import { Result, Schema } from "effect"
import * as AgentSetup from "../src/agentSetup.ts"

const agent = Schema.decodeSync(ReplicaRecord.Agent)({
  id: "agent-1",
  workspaceId: "workspace-1",
  memberId: "member-3",
  instructions: "Review what is asked.",
  harness: { _tag: "Connection", connectionId: "harness-1" },
  model: { connectionId: "models-1", id: "test-model", effort: "high" },
  sandbox: null,
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z",
  readiness: { _tag: "Ready" }
})

describe("AgentSetup", () => {
  it("drafts an agent's setup as it stands, and makes the same configuration of it", () => {
    const draft = AgentSetup.draftOf(agent)
    expect(draft).toEqual({
      instructions: "Review what is asked.",
      harness: "harness-1",
      modelConnectionId: "models-1",
      modelId: "test-model",
      effort: "high",
      sandbox: ""
    })
    expect(AgentSetup.configurationOf(draft)).toEqual(
      Result.succeed({
        instructions: agent.instructions,
        harness: agent.harness,
        model: agent.model,
        sandbox: null
      })
    )
  })

  it("makes an agent on Auto with the model's own effort and a sandbox, or says what it still wants", () => {
    const draft = {
      ...AgentSetup.empty,
      modelConnectionId: "models-1",
      modelId: " test-model ",
      sandbox: "sandboxes-1"
    }
    expect(AgentSetup.configurationOf(draft)).toEqual(
      Result.succeed({
        instructions: "",
        harness: { _tag: "Auto" },
        model: { connectionId: "models-1", id: "test-model" },
        sandbox: { connectionId: "sandboxes-1" }
      })
    )
  })

  it("says which part of a setup it still wants, and why, to mark beside its field", () => {
    const draft = { ...AgentSetup.empty, modelConnectionId: "models-1", modelId: "test-model" }
    expect(AgentSetup.configurationOf(AgentSetup.empty)).toEqual(
      Result.fail({ field: "ModelConnection", message: "Choose a model connection." })
    )
    expect(AgentSetup.configurationOf({ ...draft, modelId: " " })).toEqual(
      Result.fail({ field: "Model", message: "Choose a model." })
    )
    expect(AgentSetup.configurationOf({ ...draft, instructions: "x".repeat(20_001) })).toEqual(
      Result.fail({ field: "Instructions", message: "The instructions are too long, or hold what can’t be stored." })
    )
    expect(AgentSetup.configurationOf({ ...draft, modelId: "x".repeat(201) })).toEqual(
      Result.fail({ field: "Model", message: "This model ID can’t be used. Use 1 to 200 characters." })
    )
  })

  it("sets two drafts apart only by what changes an agent, not by the space around its text", () => {
    const draft = AgentSetup.draftOf(agent)
    expect(
      AgentSetup.isSameSetup(draft, { ...draft, instructions: "  Review what is asked.\n", modelId: " test-model" })
    ).toBe(true)
    for (const changed of [
      { instructions: "Review it twice." },
      { harness: "" },
      { modelConnectionId: "models-2" },
      { modelId: "other-model" },
      { effort: "low" },
      { sandbox: "sandboxes-1" }
    ]) {
      expect(AgentSetup.isSameSetup(draft, { ...draft, ...changed })).toBe(false)
    }
  })
})
