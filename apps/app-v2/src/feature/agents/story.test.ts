import { Agent } from "@amends-dev/core/agent"
import { type Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
import { Identity } from "@amends-dev/core/identity"
import type { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import {
  aliceOwns,
  bob,
  bobIsMember,
  grantsOf,
  integrationGiving,
  keylessConnection,
  membership,
  offered,
  roleOf,
  roles,
  scout,
  scoutAgent
} from "../../../test/fixtures.ts"
import { connectionsGiving, Integrations } from "../connections/definition.ts"
import { givableRoles } from "../settings/definition.ts"
import { ConfigureAgent, CreateAgent, LoadModels, RenameAgent } from "./command.ts"
import { findAgentName, listedAgents, Message, OfferedModels, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member: alice } = membership
const asMember = { workspaceId: workspace.id, memberId: alice.id }
const workspaceId = workspace.id

const modelsIntegration = integrationGiving("test-models", "Test models", ["models"])
const harnessIntegration = integrationGiving("test-harness", "Test harness", ["harnesses"])
const sandboxIntegration = integrationGiving("test-sandbox", "Test sandbox", ["sandboxes"])

const models = keylessConnection("models-1", "test-models", "Models")
const otherModels = keylessConnection("models-2", "test-models", "Other models")
const harness = keylessConnection("harness-1", "test-harness", "Harness")
const sandbox = keylessConnection("sandbox-1", "test-sandbox", "Sandbox")

const agentId = Identity.AgentId.make("agent-1")
const modelsId = models.id
const otherModelsId = otherModels.id

/** What alice's replica holds of the workspace's agents, when members hold `assignments`. */
const agentsOf = (memberId: MemberId.MemberId, assignments: ReadonlyArray<Assignment.Assignment>) => ({
  agents: [{ agent: scoutAgent, pending: false }],
  members: [alice, bob, scout],
  connections: [models, otherModels, harness, sandbox].map((connection) => ({ connection, pending: false })),
  roles,
  workspace: Option.some({ workspace, pending: false }),
  grants: grantsOf(assignments.filter((assignment) => assignment.memberId === memberId))
})

const received = Message.ReceivedAgents(agentsOf(alice.id, [aliceOwns]))

const integrations = Message.ReceivedIntegrations({
  integrations: [modelsIntegration, harnessIntegration, sandboxIntegration]
})

const listed = init(workspace.id, alice.id).model

/** The agents read, and the integrations loaded. */
const read = [message(received), message(integrations)] as const

/** The configuration of an agent on any harness, the test model with a high effort, and no sandbox. */
const reviewing = Schema.decodeSync(Agent.Configuration)({
  instructions: "Review what is asked.",
  harness: { _tag: "Auto" },
  model: { connectionId: modelsId, id: "test-model", effort: "high" },
  sandbox: null
})

describe("the agents", () => {
  it("wait for the page to list the integrations, and keep what it informs them of or why it could not", () => {
    expect(init(workspace.id, alice.id).commands ?? []).toEqual([])
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Loading())
      }),
      message(Message.FailedLoadIntegrations({ error: "The host could not be reached. Try again." })),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Failed({ error: "The host could not be reached. Try again." }))
      }),
      // Trying again shows they are loading and asks the page to list them again.
      message(Message.ClickedReloadIntegrations()),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      Command.expectNone(),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Loading())
      }),
      message(integrations),
      model((model) => {
        expect(model.integrations).toEqual(
          Integrations.Loaded({ integrations: [modelsIntegration, harnessIntegration, sandboxIntegration] })
        )
      }),
      // Asking again once they are loaded asks nothing.
      message(Message.ClickedReloadIntegrations()),
      expectNoOutMessage(),
      Command.expectNone()
    )
  })

  it("read the agents with the connections they run on, and name the connections that give what a setup needs", () => {
    story(
      update,
      given(listed),
      ...read,
      model((model) => {
        expect(model.agents).toEqual([{ agent: scoutAgent, pending: false }])
        expect(listedAgents(model).map(({ agent }) => agent.id)).toEqual([agentId])
        expect(findAgentName(model, agentId)).toEqual(Option.some("Scout"))
        expect(connectionsGiving(model, "models")).toEqual([
          [modelsId, "Models"],
          [otherModelsId, "Other models"]
        ])
        expect(connectionsGiving(model, "harnesses")).toEqual([[harness.id, "Harness"]])
        expect(connectionsGiving(model, "sandboxes")).toEqual([[sandbox.id, "Sandbox"]])
      }),
      // An agent whose membership left the workspace is not listed.
      message(Message.ReceivedAgents({ ...agentsOf(alice.id, [aliceOwns]), members: [alice, bob] })),
      model((model) => {
        expect(listedAgents(model)).toEqual([])
        expect(findAgentName(model, agentId)).toEqual(Option.none())
      })
    )
  })

  it("add an agent as an action once its setup is complete, and say what a draft still wants", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedAdd()),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ _tag: "Adding", name: "", roleId: BuiltinRoles.MemberId, error: Option.none() })
        )
      }),
      message(Message.TypedName({ name: "Reviewer" })),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ error: Option.some("Choose the connection of the agent's model.") })
        )
      }),
      message(Message.ChoseModelConnection({ connectionId: modelsId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ error: Option.some("Choose the agent's model.") }))
      }),
      message(Message.ChoseModel({ modelId: "test-model" })),
      message(Message.ChoseEffort({ effort: "high" })),
      message(Message.TypedInstructions({ instructions: "  Review what is asked.  " })),
      message(Message.ChoseRole({ roleId: BuiltinRoles.AdministratorId })),
      message(Message.SubmittedForm()),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Reviewer",
          roleId: BuiltinRoles.AdministratorId,
          configuration: reviewing
        })
      ),
      model((model) => {
        expect(model.form).toEqual(Option.none())
        expect(model.offered).toEqual(Option.none())
      }),
      Command.resolve(CreateAgent, Message.WroteAction())
    )
  })

  it("add an agent on a harness and in a sandbox the workspace's connections give", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedAdd()),
      message(Message.TypedName({ name: "Builder" })),
      message(Message.ChoseHarness({ harness: harness.id })),
      message(Message.ChoseSandbox({ sandbox: sandbox.id })),
      message(Message.ChoseModelConnection({ connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      // A model the connection does not list is named by its id.
      message(Message.ChoseModel({ modelId: " other-model " })),
      message(Message.SubmittedForm()),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Builder",
          roleId: BuiltinRoles.MemberId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "",
            harness: { _tag: "Connection", connectionId: harness.id },
            model: { connectionId: modelsId, id: "other-model" },
            sandbox: { connectionId: sandbox.id }
          })
        })
      ),
      Command.resolve(CreateAgent, Message.FailedWriteAction({ error: "An agent needs a name." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("An agent needs a name."))
      })
    )
  })

  it("refuse instructions that can't be stored, and keep the form open", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedAdd()),
      message(Message.TypedName({ name: "Reviewer" })),
      message(Message.ChoseModelConnection({ connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.ChoseModel({ modelId: "test-model" })),
      message(Message.TypedInstructions({ instructions: "x".repeat(20_001) })),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({
            _tag: "Adding",
            error: Option.some("The instructions are too long, or hold what can't be stored.")
          })
        )
      }),
      // Changing the setup lets the draft be sent again.
      message(Message.TypedInstructions({ instructions: "Review what is asked." })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ error: Option.none() }))
      }),
      message(Message.SubmittedForm()),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Reviewer",
          roleId: BuiltinRoles.MemberId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "Review what is asked.",
            harness: { _tag: "Auto" },
            model: { connectionId: modelsId, id: "test-model" },
            sandbox: null
          })
        })
      ),
      Command.resolve(CreateAgent, Message.WroteAction())
    )
  })

  it("load the models of the model connection the form chooses, and ignore a late answer for another", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedAdd()),
      model((model) => {
        expect(model.offered).toEqual(Option.none())
      }),
      message(Message.ChoseModelConnection({ connectionId: modelsId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: modelsId })),
      model((model) => {
        expect(model.offered).toEqual(Option.some(OfferedModels.Loading({ connectionId: modelsId })))
      }),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      model((model) => {
        expect(model.offered).toEqual(Option.some(OfferedModels.Loaded({ connectionId: modelsId, models: offered })))
      }),
      message(Message.ChoseModelConnection({ connectionId: otherModelsId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: otherModelsId })),
      model((model) => {
        expect(model.offered).toEqual(Option.some(OfferedModels.Loading({ connectionId: otherModelsId })))
      }),
      // What the first connection offered, arriving late, is not the models of the second.
      Command.resolve(
        LoadModels({ workspaceId, connectionId: otherModelsId }),
        Message.ReceivedModels({ connectionId: modelsId, models: offered })
      ),
      model((model) => {
        expect(model.offered).toEqual(Option.some(OfferedModels.Loading({ connectionId: otherModelsId })))
      }),
      message(Message.FailedLoadModels({ connectionId: modelsId, error: "Too late." })),
      model((model) => {
        expect(model.offered).toEqual(Option.some(OfferedModels.Loading({ connectionId: otherModelsId })))
      }),
      message(Message.FailedLoadModels({ connectionId: otherModelsId, error: "It can't be reached." })),
      model((model) => {
        expect(model.offered).toEqual(
          Option.some(OfferedModels.Failed({ connectionId: otherModelsId, error: "It can't be reached." }))
        )
      }),
      // Choosing no connection offers no models, and asks for none.
      message(Message.ChoseModelConnection({ connectionId: "" })),
      Command.expectNone(),
      model((model) => {
        expect(model.offered).toEqual(Option.none())
      })
    )
  })

  it("choose the model again when the model connection changes", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedAdd()),
      message(Message.ChoseModelConnection({ connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.ChoseModel({ modelId: "test-model" })),
      message(Message.ChoseEffort({ effort: "low" })),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ setup: { modelConnectionId: modelsId, modelId: "test-model", effort: "low" } })
        )
      }),
      message(Message.ChoseModelConnection({ connectionId: otherModelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: otherModelsId, models: offered })),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ setup: { modelConnectionId: otherModelsId, modelId: "", effort: "" } })
        )
      }),
      // Another model reasons otherwise, so the effort is chosen again with it.
      message(Message.ChoseModel({ modelId: "test-model" })),
      message(Message.ChoseEffort({ effort: "high" })),
      message(Message.ChoseModel({ modelId: "other-model" })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ setup: { modelId: "other-model", effort: "" } }))
      })
    )
  })

  it("rename an agent from the name its membership had, and change how it is set up", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedRename({ agentId })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ _tag: "Renaming", agentId, name: "Scout" }))
      }),
      message(Message.TypedName({ name: "Scout Prime" })),
      message(Message.SubmittedForm()),
      Command.expectExact(RenameAgent({ ...asMember, agentId, name: "Scout Prime", expectedName: "Scout" })),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      }),
      Command.resolve(RenameAgent, Message.WroteAction()),
      message(Message.ClickedConfigure({ agentId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: modelsId })),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({
            _tag: "Configuring",
            agentId,
            setup: {
              instructions: "Review what is asked.",
              harness: "",
              modelConnectionId: modelsId,
              modelId: "test-model",
              effort: "",
              sandbox: ""
            },
            error: Option.none()
          })
        )
        expect(model.offered).toEqual(Option.some(OfferedModels.Loading({ connectionId: modelsId })))
      }),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      model((model) => {
        expect(model.offered).toEqual(Option.some(OfferedModels.Loaded({ connectionId: modelsId, models: offered })))
      }),
      message(Message.TypedInstructions({ instructions: "Review it twice." })),
      message(Message.ChoseHarness({ harness: harness.id })),
      message(Message.ChoseSandbox({ sandbox: sandbox.id })),
      message(Message.ChoseEffort({ effort: "low" })),
      message(Message.SubmittedForm()),
      Command.expectExact(
        ConfigureAgent({
          ...asMember,
          agentId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "Review it twice.",
            harness: { _tag: "Connection", connectionId: harness.id },
            model: { connectionId: modelsId, id: "test-model", effort: "low" },
            sandbox: { connectionId: sandbox.id }
          })
        })
      ),
      Command.resolve(ConfigureAgent, Message.WroteAction()),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      })
    )
  })

  it("keep the form for an agent's setup open while it still wants a model", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedConfigure({ agentId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.ChoseModelConnection({ connectionId: otherModelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: otherModelsId, models: offered })),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ _tag: "Configuring", error: Option.some("Choose the agent's model.") })
        )
      }),
      message(Message.ClickedCancelForm()),
      model((model) => {
        expect(model.form).toEqual(Option.none())
        expect(model.offered).toEqual(Option.none())
      })
    )
  })

  it("configure an agent whose model connection is gone, choosing another", () => {
    const removed = Message.ReceivedAgents({
      ...agentsOf(alice.id, [aliceOwns]),
      connections: [otherModels].map((connection) => ({ connection, pending: false }))
    })
    story(
      update,
      given(listed),
      message(removed),
      message(Message.ClickedConfigure({ agentId })),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ _tag: "Configuring", setup: { modelConnectionId: modelsId } }))
        expect(model.offered).toEqual(Option.none())
      })
    )
  })

  it("close a form about an agent that is gone", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedRename({ agentId })),
      message(Message.ReceivedAgents({ ...agentsOf(alice.id, [aliceOwns]), agents: [] })),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      }),
      message(received),
      message(Message.ClickedConfigure({ agentId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.ReceivedAgents({ ...agentsOf(alice.id, [aliceOwns]), members: [alice, bob] })),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      }),
      // A form that adds one is about no agent, and stays.
      message(received),
      message(Message.ClickedAdd()),
      message(Message.ReceivedAgents({ ...agentsOf(alice.id, [aliceOwns]), agents: [] })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ _tag: "Adding" }))
      })
    )
  })

  it("send no form that is about nothing", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.SubmittedForm()),
      Command.expectNone(),
      message(Message.ClickedRename({ agentId: Identity.AgentId.make("agent-2") })),
      message(Message.ClickedConfigure({ agentId: Identity.AgentId.make("agent-2") })),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      })
    )
  })

  it("say why a read or a write failed, until a write is kept", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.FailedRead({ error: "This browser could not read the workspace's copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace's copy."))
      }),
      message(Message.ClickedRename({ agentId })),
      message(Message.SubmittedForm()),
      Command.resolve(
        RenameAgent,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      }),
      message(Message.ClickedRename({ agentId })),
      message(Message.SubmittedForm()),
      Command.resolve(RenameAgent, Message.WroteAction()),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
      })
    )
  })

  it("offer a new agent the roles the person may give, from the roles and workspace it reads", () => {
    const administrators = [aliceOwns, roleOf("assignment-3", bob.id, BuiltinRoles.AdministratorId)]
    const readAs = (memberId: MemberId.MemberId, assignments: ReadonlyArray<Assignment.Assignment>) => ({
      ...init(workspace.id, memberId).model,
      ...agentsOf(memberId, assignments)
    })
    expect(givableRoles(listed)).toEqual([])
    expect(givableRoles(readAs(alice.id, [aliceOwns, bobIsMember])).map(({ id }) => id)).toEqual([
      BuiltinRoles.MemberId,
      BuiltinRoles.AdministratorId
    ])
    expect(givableRoles(readAs(bob.id, administrators)).map(({ id }) => id)).toEqual([BuiltinRoles.MemberId])
  })
})
