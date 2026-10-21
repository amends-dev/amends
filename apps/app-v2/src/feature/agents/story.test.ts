import { Agent } from "@amends-dev/core/agent"
import { type Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
import { Identity } from "@amends-dev/core/identity"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadId } from "@amends-dev/core/thread"
import { Member, type MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { DateTime, Option, Result, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import {
  aliceOwns,
  bob,
  bobIsMember,
  design,
  general,
  grantsOf,
  integrationGiving,
  keylessConnection,
  membership,
  now,
  offered,
  reviewer,
  reviewerAgent,
  roleOf,
  roles,
  scout,
  scoutAgent,
  turnOf
} from "../../../test/fixtures.ts"
import { type Draft, empty } from "../../agentSetup.ts"
import { connectionsGiving, Integrations } from "../connections/definition.ts"
import { givableRoles } from "../settings/definition.ts"
import { ConfigureAgent, CreateAgent, LoadModels, RemoveAgent, RenameAgent } from "./command.ts"
import { DialogBinding } from "./composition.ts"
import {
  type Adding,
  checkSetup,
  connectionChoices,
  failureMessage,
  findAgentName,
  findCreatedAgent,
  isAddingReady,
  activityOfAgent,
  isDialogBusy,
  isNameChanged,
  isSetupChanged,
  listedAgents,
  mayRemove,
  type Model,
  Message,
  nameDraftOf,
  nameOfAgent,
  needsSetup,
  OfferedModels,
  OutMessage,
  Reason,
  setupDraftOf,
  SetupTarget,
  shownAgents,
  startingRoles,
  turnsOfAgent,
  Written
} from "./definition.ts"
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

/** The agents as an owner reads them, with the integrations loaded. */
const opened = {
  ...listed,
  ...agentsOf(alice.id, [aliceOwns]),
  isLoaded: true,
  integrations: Integrations.Loaded({ integrations: [modelsIntegration, harnessIntegration, sandboxIntegration] })
}

const agentMember = (id: string, agentId: string, name: string) =>
  Schema.decodeSync(Member.Member)({
    id,
    workspaceId: "workspace-1",
    identity: { _tag: "Agent", id: agentId },
    name,
    status: "active"
  })

const helper = agentMember("member-4", "agent-2", "Review helper")
const nora = agentMember("member-5", "agent-3", "Nórá")

/** An agent that can't run, since no connection gives a harness it can. */
const helperAgent = Schema.decodeSync(ReplicaRecord.Agent)({
  ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
  id: "agent-2",
  memberId: helper.id,
  readiness: { _tag: "Incomplete", issues: [{ _tag: "NoHarness" }] }
})

/** The configuration of an agent on any harness, the test model with a high effort, and no sandbox. */
const reviewing = Schema.decodeSync(Agent.Configuration)({
  instructions: "Review what is asked.",
  harness: { _tag: "Auto" },
  model: { connectionId: modelsId, id: "test-model", effort: "high" },
  sandbox: null
})

const setupOfScout: Draft = {
  instructions: "Review what is asked.",
  harness: "",
  modelConnectionId: modelsId,
  modelId: "test-model",
  effort: "",
  sandbox: ""
}

const adding = SetupTarget.Adding()
const onScout = SetupTarget.Agent({ agentId })

/** What the dialog reports, as the agents receive it. */
const fromDialog = (message: typeof DialogBlock.Message.Type) =>
  DialogBinding.embedView({
    slotId: "dialog",
    model: listed.dialog,
    viewInputs: { toView: () => null }
  }).toParentMessage(message)

/** The dialog asked for, on a blank form that adds an agent. */
const addingDialog = [
  message(Message.ClickedAdd()),
  Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog())
] as const

/** The agents once the store lists the one the form adds. */
const withReviewer = Message.ReceivedAgents({
  ...agentsOf(alice.id, [aliceOwns]),
  agents: [scoutAgent, reviewerAgent].map((agent) => ({ agent, pending: false })),
  members: [alice, bob, scout, reviewer]
})

const openDialog = (model: typeof opened) =>
  modifyFields(model, { dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }) })

/** The form filled in, whose request is on its way, among the agents alice sees. */
const sendingAdding = openDialog(
  modifyFields(opened, {
    offered: () => [OfferedModels.Loaded({ connectionId: modelsId, models: offered })],
    adding: () =>
      Option.some<Adding>({
        name: "Reviewer",
        roleId: BuiltinRoles.MemberId,
        setup: { ...setupOfScout, effort: "high" },
        failure: Option.none(),
        creating: Option.some({ name: "Reviewer", knownAgentIds: [agentId], isWritten: false })
      })
  })
)

/** The confirmation that removes scout, with its request on its way or not. */
const removingAgent = (isSending: boolean) =>
  openDialog(
    modifyFields(opened, {
      removing: () => Option.some({ agentId, name: "Scout", isSending, failure: Option.none() })
    })
  )

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

  it("say they are read once the store has answered, so that none yet is not said before", () => {
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.isLoaded).toBe(false)
      }),
      message(Message.ReceivedAgents({ ...agentsOf(alice.id, [aliceOwns]), agents: [] })),
      model((model) => {
        expect(model.isLoaded).toBe(true)
        expect(model.agents).toEqual([])
      })
    )
  })

  it("narrow the list by tab and by name, in any case and whatever the accents, and count those that need setup", () => {
    story(
      update,
      given(listed),
      message(
        Message.ReceivedAgents({
          ...agentsOf(alice.id, [aliceOwns]),
          agents: [
            scoutAgent,
            helperAgent,
            { ...helperAgent, id: Identity.AgentId.make("agent-3"), memberId: nora.id }
          ].map((agent) => ({ agent, pending: false })),
          members: [alice, bob, scout, helper, nora]
        })
      ),
      model((model) => {
        expect(model.browse).toEqual({ tab: "All", query: "" })
        expect(shownAgents(model).map(({ agent }) => agent.id)).toEqual(["agent-1", "agent-2", "agent-3"])
        expect(listedAgents(model).filter(needsSetup).length).toBe(2)
      }),
      message(Message.ChoseBrowseTab({ tab: "NeedsSetup" })),
      model((model) => {
        expect(shownAgents(model).map(({ agent }) => nameOfAgent(model, agent))).toEqual(["Review helper", "Nórá"])
      }),
      message(Message.TypedBrowseQuery({ query: " NORA " })),
      model((model) => {
        expect(model.browse).toEqual({ tab: "NeedsSetup", query: " NORA " })
        expect(shownAgents(model).map(({ agent }) => nameOfAgent(model, agent))).toEqual(["Nórá"])
      }),
      message(Message.ChoseBrowseTab({ tab: "All" })),
      message(Message.TypedBrowseQuery({ query: "scout" })),
      model((model) => {
        expect(shownAgents(model).map(({ agent }) => agent.id)).toEqual(["agent-1"])
      }),
      message(Message.TypedBrowseQuery({ query: "" })),
      expectNoOutMessage(),
      Command.expectNone()
    )
  })

  it("count an agent on its way as needing nothing, since the server has not said how ready it is", () => {
    expect(needsSetup({ agent: helperAgent, pending: true })).toBe(false)
    expect(needsSetup({ agent: helperAgent, pending: false })).toBe(true)
    expect(needsSetup({ agent: scoutAgent, pending: false })).toBe(false)
  })

  it("ask the page to show the agents when the person browses, and nothing when they add one, since the form is a dialog", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedBrowse()),
      expectOutMessage(OutMessage.RequestedBrowse()),
      Command.expectNone(),
      message(Message.ClickedAdd()),
      expectNoOutMessage(),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog())
    )
  })

  it("open the dialog on a blank form that adds an agent, and not on a confirmation", () => {
    story(
      update,
      given(listed),
      ...read,
      model((model) => {
        expect(model.dialog.isOpen).toBe(false)
        expect(model.adding).toEqual(Option.none())
      }),
      message(Message.ClickedAdd()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.adding).toEqual(
          Option.some({
            name: "",
            roleId: BuiltinRoles.MemberId,
            setup: empty,
            failure: Option.none(),
            creating: Option.none()
          })
        )
        expect(model.removing).toEqual(Option.none())
      })
    )
  })

  it("report the agent picked, and ask for the models of its connection unless they are loaded or on their way", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedAgent({ agentId })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: modelsId })),
      model((model) => {
        expect(model.offered).toEqual([OfferedModels.Loading({ connectionId: modelsId })])
      }),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.ClickedAgent({ agentId })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectNone(),
      model((model) => {
        expect(model.offered).toEqual([OfferedModels.Loaded({ connectionId: modelsId, models: offered })])
      }),
      // Once they could not be loaded, picking it asks again.
      message(Message.FailedLoadModels({ connectionId: modelsId, error: "It can’t be reached." })),
      message(Message.ClickedAgent({ agentId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered }))
    )
    // While they load, picking it asks for nothing more.
    story(
      update,
      given({ ...opened, offered: [OfferedModels.Loading({ connectionId: modelsId })] }),
      message(Message.ClickedAgent({ agentId })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectNone()
    )
  })

  it("report the agent picked, and ask for the models of its connection for a person who may not change it, but none for one that is gone", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedAgents(agentsOf(bob.id, [bobIsMember]))),
      message(Message.ClickedAgent({ agentId })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered }))
    )
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedAgent({ agentId: Identity.AgentId.make("agent-9") })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: Identity.AgentId.make("agent-9") })),
      Command.expectNone(),
      model((model) => {
        expect(model.offered).toEqual([])
      })
    )
  })

  it("send nothing from the form until it has a name, a role, and a model, and mark nothing before then", () => {
    story(
      update,
      given(listed),
      ...read,
      ...addingDialog,
      message(Message.TypedAddingName({ name: "Reviewer" })),
      message(Message.SubmittedAdding()),
      Command.expectNone(),
      model((model) => {
        expect(model.adding).toMatchObject(Option.some({ failure: Option.none(), creating: Option.none() }))
        expect(Option.exists(model.adding, isAddingReady)).toBe(false)
      }),
      message(Message.ChoseModelConnection({ target: adding, connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.SubmittedAdding()),
      Command.expectNone(),
      message(Message.ChoseModel({ target: adding, modelId: "test-model" })),
      model((model) => {
        expect(Option.exists(model.adding, isAddingReady)).toBe(true)
      })
    )
  })

  it("add an agent as an action once its setup is complete, and open the page of the agent the store lists", () => {
    story(
      update,
      given(listed),
      ...read,
      ...addingDialog,
      message(Message.TypedAddingName({ name: " Reviewer " })),
      message(Message.ChoseModelConnection({ target: adding, connectionId: modelsId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.ChoseModel({ target: adding, modelId: "test-model" })),
      message(Message.ChoseEffort({ target: adding, effort: "high" })),
      message(Message.TypedInstructions({ target: adding, instructions: "  Review what is asked.  " })),
      message(Message.ChoseRole({ roleId: BuiltinRoles.AdministratorId })),
      message(Message.SubmittedAdding()),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Reviewer",
          roleId: BuiltinRoles.AdministratorId,
          configuration: reviewing
        })
      ),
      model((model) => {
        expect(model.adding).toMatchObject(
          Option.some({ creating: Option.some({ name: "Reviewer", knownAgentIds: [agentId], isWritten: false }) })
        )
        expect(isDialogBusy(model)).toBe(true)
      }),
      // The store keeping the action is not the agent listed yet, so the dialog waits for it.
      Command.resolve(CreateAgent, Message.WroteAction({ written: Written.Create({ name: "Reviewer" }) })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.adding).toMatchObject(
          Option.some({ creating: Option.some({ name: "Reviewer", knownAgentIds: [agentId], isWritten: true }) })
        )
        expect(isDialogBusy(model)).toBe(false)
      }),
      message(withReviewer),
      expectOutMessage(OutMessage.CreatedAgent({ agentId: reviewerAgent.id, name: "Reviewer" })),
      Command.expectExact(Dialog.test.CloseDialog),
      model((model) => {
        expect(model.adding).toEqual(Option.none())
        expect(model.removing).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("finish adding the agent when it is listed before the store says it kept the action, and ask for no models it has", () => {
    story(
      update,
      given(sendingAdding),
      message(withReviewer),
      expectOutMessage(OutMessage.CreatedAgent({ agentId: reviewerAgent.id, name: "Reviewer" })),
      Command.expectExact(Dialog.test.CloseDialog),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      message(Message.WroteAction({ written: Written.Create({ name: "Reviewer" }) })),
      expectNoOutMessage(),
      Command.expectNone(),
      model((model) => {
        expect(model.adding).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("ask for the models of the new agent's connection when the form had not loaded them", () => {
    story(
      update,
      given(modifyFields(sendingAdding, { offered: () => [] })),
      message(withReviewer),
      expectOutMessage(OutMessage.CreatedAgent({ agentId: reviewerAgent.id, name: "Reviewer" })),
      Command.expectHas(Dialog.test.CloseDialog, LoadModels({ workspaceId, connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("not take for the new agent one that somebody else made, or one the workspace already had", () => {
    story(
      update,
      given(sendingAdding),
      message(
        Message.ReceivedAgents({
          ...agentsOf(alice.id, [aliceOwns]),
          agents: [scoutAgent, { ...reviewerAgent, createdBy: bob.id }].map((agent) => ({ agent, pending: false })),
          members: [alice, bob, scout, reviewer]
        })
      ),
      expectNoOutMessage(),
      Command.expectNone(),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(Option.isSome(model.adding)).toBe(true)
      })
    )
  })

  it("add an agent on a harness and in a sandbox the workspace's connections give, named by the id of a model they do not list", () => {
    story(
      update,
      given(listed),
      ...read,
      ...addingDialog,
      message(Message.TypedAddingName({ name: " Builder " })),
      message(Message.ChoseHarness({ target: adding, harness: harness.id })),
      message(Message.ChoseSandbox({ target: adding, sandbox: sandbox.id })),
      message(Message.ChoseModelConnection({ target: adding, connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.ChoseModel({ target: adding, modelId: " other-model " })),
      message(Message.SubmittedAdding()),
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
      // Sent once, whatever else is pressed while it is on its way.
      Command.resolve(
        CreateAgent,
        Message.FailedWriteAction({ written: Written.Create({ name: "Builder" }), reason: Reason.Invalid() })
      ),
      model((model) => {
        expect(model.adding).toMatchObject(
          Option.some({
            creating: Option.none(),
            failure: Option.some({ action: "Create", reason: Reason.Invalid() })
          })
        )
        expect(
          Option.map(
            Option.flatMap(model.adding, ({ failure }) => failure),
            failureMessage
          )
        ).toEqual(Option.some("Check the name, instructions, and model, then try again."))
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("send a form that is on its way once, and nothing else of it", () => {
    story(update, given(sendingAdding), message(Message.SubmittedAdding()), Command.expectNone())
  })

  it("mark the parts of the setup that can't be saved beside their fields, send nothing, and let the form be sent again once it changes", () => {
    story(
      update,
      given(listed),
      ...read,
      ...addingDialog,
      message(Message.TypedAddingName({ name: "Reviewer" })),
      message(Message.ChoseModelConnection({ target: adding, connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.ChoseModel({ target: adding, modelId: "test-model" })),
      message(Message.TypedInstructions({ target: adding, instructions: "x".repeat(20_001) })),
      message(Message.SubmittedAdding()),
      Command.expectNone(),
      model((model) => {
        expect(model.adding).toMatchObject(
          Option.some({
            creating: Option.none(),
            failure: Option.some({
              action: "Create",
              reason: Reason.Incomplete({
                problems: [
                  { field: "Instructions", message: "The instructions are too long, or hold what can’t be stored." }
                ]
              })
            })
          })
        )
      }),
      // Changing the setup lets the draft be sent again.
      message(Message.TypedInstructions({ target: adding, instructions: "Review what is asked." })),
      model((model) => {
        expect(model.adding).toMatchObject(Option.some({ failure: Option.none() }))
      }),
      message(Message.ChoseEffort({ target: adding, effort: "high" })),
      message(Message.SubmittedAdding()),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Reviewer",
          roleId: BuiltinRoles.MemberId,
          configuration: reviewing
        })
      ),
      Command.resolve(CreateAgent, Message.WroteAction({ written: Written.Create({ name: "Reviewer" }) }))
    )
  })

  it("say under the form, which stays open, that an agent could not be added, until it is sent again", () => {
    story(
      update,
      given(sendingAdding),
      message(
        Message.FailedWriteAction({ written: Written.Create({ name: "Reviewer" }), reason: Reason.Unwritable() })
      ),
      model((model) => {
        expect(model.adding).toMatchObject(
          Option.some({
            creating: Option.none(),
            failure: Option.some({ action: "Create", reason: Reason.Unwritable() })
          })
        )
        expect(model.dialog.isOpen).toBe(true)
        expect(model.notice).toEqual(Option.none())
      }),
      message(Message.SubmittedAdding()),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Reviewer",
          roleId: BuiltinRoles.MemberId,
          configuration: reviewing
        })
      ),
      model((model) => {
        expect(model.adding).toMatchObject(Option.some({ failure: Option.none() }))
      }),
      Command.resolve(CreateAgent, Message.WroteAction({ written: Written.Create({ name: "Reviewer" }) }))
    )
  })

  it("keep the models of each connection apart, as loading, loaded, or not reached, whichever answers first", () => {
    story(
      update,
      given(listed),
      ...read,
      ...addingDialog,
      model((model) => {
        expect(model.offered).toEqual([])
      }),
      message(Message.ChoseModelConnection({ target: adding, connectionId: modelsId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: modelsId })),
      model((model) => {
        expect(model.offered).toEqual([OfferedModels.Loading({ connectionId: modelsId })])
      }),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.ChoseModelConnection({ target: adding, connectionId: otherModelsId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: otherModelsId })),
      model((model) => {
        expect(model.offered).toEqual([
          OfferedModels.Loaded({ connectionId: modelsId, models: offered }),
          OfferedModels.Loading({ connectionId: otherModelsId })
        ])
      }),
      Command.resolve(
        LoadModels,
        Message.FailedLoadModels({ connectionId: otherModelsId, error: "It can’t be reached." })
      ),
      model((model) => {
        expect(model.offered).toEqual([
          OfferedModels.Loaded({ connectionId: modelsId, models: offered }),
          OfferedModels.Failed({ connectionId: otherModelsId, error: "It can’t be reached." })
        ])
      }),
      // Choosing no connection asks for none, and a connection the workspace does not have offers none.
      message(Message.ChoseModelConnection({ target: adding, connectionId: "" })),
      Command.expectNone(),
      message(Message.ChoseModelConnection({ target: adding, connectionId: "gone-1" })),
      Command.expectNone(),
      model((model) => {
        expect(model.offered).toHaveLength(2)
      })
    )
    // What the first connection offered, arriving after the second was asked, is the models of the first.
    story(
      update,
      given({
        ...opened,
        offered: [
          OfferedModels.Loading({ connectionId: modelsId }),
          OfferedModels.Loading({ connectionId: otherModelsId })
        ]
      }),
      message(Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      model((model) => {
        expect(model.offered).toEqual([
          OfferedModels.Loading({ connectionId: otherModelsId }),
          OfferedModels.Loaded({ connectionId: modelsId, models: offered })
        ])
      })
    )
  })

  it("choose the model again when the model connection changes", () => {
    story(
      update,
      given(listed),
      ...read,
      ...addingDialog,
      message(Message.ChoseModelConnection({ target: adding, connectionId: modelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: modelsId, models: offered })),
      message(Message.ChoseModel({ target: adding, modelId: "test-model" })),
      message(Message.ChoseEffort({ target: adding, effort: "low" })),
      model((model) => {
        expect(model.adding).toMatchObject(
          Option.some({ setup: { modelConnectionId: modelsId, modelId: "test-model", effort: "low" } })
        )
      }),
      message(Message.ChoseModelConnection({ target: adding, connectionId: otherModelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: otherModelsId, models: offered })),
      model((model) => {
        expect(model.adding).toMatchObject(
          Option.some({ setup: { modelConnectionId: otherModelsId, modelId: "", effort: "" } })
        )
      }),
      // Another model reasons otherwise, so the effort is chosen again with it.
      message(Message.ChoseModel({ target: adding, modelId: "test-model" })),
      message(Message.ChoseEffort({ target: adding, effort: "high" })),
      message(Message.ChoseModel({ target: adding, modelId: "other-model" })),
      model((model) => {
        expect(model.adding).toMatchObject(Option.some({ setup: { modelId: "other-model", effort: "" } }))
      })
    )
  })

  it("close the dialog that adds an agent when the person closes it, forgetting the form", () => {
    story(
      update,
      given(listed),
      ...read,
      ...addingDialog,
      message(Message.TypedAddingName({ name: "Reviewer" })),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.adding).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      // Sending a form that is not open sends nothing.
      message(Message.SubmittedAdding()),
      Command.expectNone()
    )
  })

  it("keep the dialog open on the request on its way when the person closes it then, to show how it ends", () => {
    story(
      update,
      given(modifyFields(sendingAdding, { adding: Option.map((open) => ({ ...open, name: "Reviewer" })) })),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.expectHas(Dialog.test.CloseDialog, Dialog.test.ShowDialog),
      model((model) => {
        expect(model.adding).toMatchObject(Option.some({ name: "Reviewer" }))
        expect(model.dialog.isOpen).toBe(true)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(
        Message.FailedWriteAction({ written: Written.Create({ name: "Reviewer" }), reason: Reason.Unwritable() })
      ),
      model((model) => {
        expect(model.adding).toMatchObject(
          Option.some({
            creating: Option.none(),
            failure: Option.some({ action: "Create", reason: Reason.Unwritable() })
          })
        )
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("let the dialog close once the store has kept the action, since only the agent being listed is awaited", () => {
    story(
      update,
      given(
        modifyFields(sendingAdding, {
          adding: Option.map((open) => ({
            ...open,
            creating: Option.map(open.creating, (sent) => ({ ...sent, isWritten: true }))
          }))
        })
      ),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.adding).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })
})

describe("removing an agent", () => {
  it("asks to confirm in the dialog, naming the agent as it is called, where the person may remove it", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedRemove({ agentId })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.adding).toEqual(Option.none())
        expect(model.removing).toEqual(
          Option.some({ agentId, name: "Scout", isSending: false, failure: Option.none() })
        )
      })
    )
  })

  it("asks nothing of a person who may not remove the agent, for an agent on its way, or for one that is gone", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedAgents(agentsOf(bob.id, [bobIsMember]))),
      message(Message.ClickedRemove({ agentId })),
      Command.expectNone(),
      model((model) => {
        expect(model.removing).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
    story(
      update,
      given(listed),
      message(
        Message.ReceivedAgents({ ...agentsOf(alice.id, [aliceOwns]), agents: [{ agent: scoutAgent, pending: true }] })
      ),
      message(Message.ClickedRemove({ agentId })),
      Command.expectNone(),
      model((model) => {
        expect(model.removing).toEqual(Option.none())
      })
    )
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedRemove({ agentId: Identity.AgentId.make("agent-9") })),
      Command.expectNone(),
      model((model) => {
        expect(model.removing).toEqual(Option.none())
      })
    )
  })

  it("removes the agent's membership once confirmed, says it is sending, and closes the dialog with the name it had", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedRemove({ agentId })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.ConfirmedRemoval()),
      Command.expectExact(RemoveAgent({ ...asMember, agentId, removeMemberId: scout.id })),
      model((model) => {
        expect(model.removing).toEqual(Option.some({ agentId, name: "Scout", isSending: true, failure: Option.none() }))
        expect(isDialogBusy(model)).toBe(true)
      }),
      Command.resolve(RemoveAgent, Message.WroteAction({ written: Written.Remove({ agentId }) })),
      expectOutMessage(OutMessage.RemovedAgent({ name: "Scout" })),
      Command.expectExact(Dialog.test.CloseDialog),
      model((model) => {
        expect(model.removing).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("sends the removal once, whatever is pressed while it is on its way, and nothing of a confirmation that is not open", () => {
    story(update, given(removingAgent(true)), message(Message.ConfirmedRemoval()), Command.expectNone())
    story(update, given(listed), ...read, message(Message.ConfirmedRemoval()), Command.expectNone())
  })

  it("says under the confirmation, which stays open, that the agent could not be removed, until it is sent again", () => {
    story(
      update,
      given(removingAgent(true)),
      message(Message.FailedWriteAction({ written: Written.Remove({ agentId }), reason: Reason.Unwritable() })),
      model((model) => {
        expect(model.removing).toEqual(
          Option.some({
            agentId,
            name: "Scout",
            isSending: false,
            failure: Option.some({ action: "Remove", reason: Reason.Unwritable() })
          })
        )
        expect(
          Option.map(
            Option.flatMap(model.removing, ({ failure }) => failure),
            failureMessage
          )
        ).toEqual(Option.some("The agent couldn’t be removed. Try again when the host is available."))
        expect(model.dialog.isOpen).toBe(true)
      }),
      message(Message.ConfirmedRemoval()),
      Command.expectExact(RemoveAgent({ ...asMember, agentId, removeMemberId: scout.id })),
      model((model) => {
        expect(model.removing).toEqual(Option.some({ agentId, name: "Scout", isSending: true, failure: Option.none() }))
      }),
      Command.resolve(RemoveAgent, Message.WroteAction({ written: Written.Remove({ agentId }) })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("keeps the dialog open on the request on its way when the person closes it then, and lets it close when it is not", () => {
    story(
      update,
      given(removingAgent(true)),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.expectHas(Dialog.test.CloseDialog, Dialog.test.ShowDialog),
      model((model) => {
        expect(Option.isSome(model.removing)).toBe(true)
        expect(model.dialog.isOpen).toBe(true)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog())
    )
    story(
      update,
      given(removingAgent(false)),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.removing).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("closes the confirmation of an agent somebody else removed, unless the person's own request is on its way", () => {
    const gone = Message.ReceivedAgents({ ...agentsOf(alice.id, [aliceOwns]), members: [alice, bob] })
    story(
      update,
      given(removingAgent(false)),
      message(gone),
      Command.expectExact(Dialog.test.CloseDialog),
      model((model) => {
        expect(model.removing).toEqual(Option.none())
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
    story(
      update,
      given(removingAgent(true)),
      message(gone),
      Command.expectNone(),
      model((model) => {
        expect(Option.isSome(model.removing)).toBe(true)
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })
})

describe("an agent's page", () => {
  it("shows the agent as it is until the person changes something, and has nothing to save", () => {
    story(
      update,
      given(listed),
      ...read,
      model((model) => {
        const item = { agent: scoutAgent, pending: false }
        expect(model.edits).toEqual([])
        expect(nameDraftOf(model, item)).toBe("Scout")
        expect(setupDraftOf(model, item)).toEqual({
          instructions: "Review what is asked.",
          harness: "",
          modelConnectionId: modelsId,
          modelId: "test-model",
          effort: "",
          sandbox: ""
        })
        expect(isNameChanged(model, item)).toBe(false)
        expect(isSetupChanged(model, item)).toBe(false)
      }),
      // Saving what did not change sends nothing.
      message(Message.SubmittedName({ agentId })),
      message(Message.SubmittedSetup({ agentId })),
      Command.expectNone()
    )
  })

  it("renames an agent from the name its membership had, keeps what is typed until it is saved, and says it is saving", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedName({ agentId, name: "  " })),
      model((model) => {
        expect(isNameChanged(model, { agent: scoutAgent, pending: false })).toBe(false)
      }),
      message(Message.TypedName({ agentId, name: " Scout Prime " })),
      model((model) => {
        expect(model.edits).toEqual([
          {
            agentId,
            name: Option.some(" Scout Prime "),
            setup: Option.none(),
            saving: Option.none(),
            failure: Option.none()
          }
        ])
        expect(isNameChanged(model, { agent: scoutAgent, pending: false })).toBe(true)
      }),
      message(Message.SubmittedName({ agentId })),
      Command.expectExact(RenameAgent({ ...asMember, agentId, name: "Scout Prime", expectedName: "Scout" })),
      model((model) => {
        expect(model.edits[0]?.saving).toEqual(Option.some("Rename"))
      }),
      Command.resolve(RenameAgent, Message.WroteAction({ written: Written.Rename({ agentId }) })),
      model((model) => {
        expect(model.edits).toEqual([])
      })
    )
    // Sending it again while it is on its way sends nothing.
    story(
      update,
      given({
        ...opened,
        edits: [
          {
            agentId,
            name: Option.some("Scout Prime"),
            setup: Option.none(),
            saving: Option.some("Rename"),
            failure: Option.none()
          }
        ]
      }),
      message(Message.SubmittedName({ agentId })),
      Command.expectNone()
    )
  })

  it("says why a name could not be saved under the name, and keeps it for the person to change", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedName({ agentId, name: "x".repeat(81) })),
      message(Message.SubmittedName({ agentId })),
      Command.resolve(
        RenameAgent,
        Message.FailedWriteAction({ written: Written.Rename({ agentId }), reason: Reason.Invalid() })
      ),
      model((model) => {
        expect(model.edits[0]).toMatchObject({
          name: Option.some("x".repeat(81)),
          saving: Option.none(),
          failure: Option.some({ action: "Rename", reason: Reason.Invalid() })
        })
        expect(Option.map(model.edits[0]?.failure ?? Option.none(), failureMessage)).toEqual(
          Option.some("Use 1 to 80 characters, with no invisible ones.")
        )
      }),
      // Typing takes the message away, and the name can be saved again.
      message(Message.TypedName({ agentId, name: "Scout Prime" })),
      model((model) => {
        expect(model.edits[0]?.failure).toEqual(Option.none())
      }),
      message(Message.SubmittedName({ agentId })),
      Command.resolve(
        RenameAgent,
        Message.FailedWriteAction({ written: Written.Rename({ agentId }), reason: Reason.Unwritable() })
      ),
      model((model) => {
        expect(Option.map(model.edits[0]?.failure ?? Option.none(), failureMessage)).toEqual(
          Option.some("The name couldn’t be saved. Try again when the host is available.")
        )
      })
    )
  })

  it("sets an agent up again as a whole, from how it is now, and says it is saving", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedInstructions({ target: onScout, instructions: "Review it twice." })),
      message(Message.ChoseHarness({ target: onScout, harness: harness.id })),
      message(Message.ChoseSandbox({ target: onScout, sandbox: sandbox.id })),
      message(Message.ChoseEffort({ target: onScout, effort: "low" })),
      model((model) => {
        expect(model.edits).toEqual([
          {
            agentId,
            name: Option.none(),
            setup: Option.some({
              instructions: "Review it twice.",
              harness: harness.id,
              modelConnectionId: modelsId,
              modelId: "test-model",
              effort: "low",
              sandbox: sandbox.id
            }),
            saving: Option.none(),
            failure: Option.none()
          }
        ])
        expect(isSetupChanged(model, { agent: scoutAgent, pending: false })).toBe(true)
      }),
      message(Message.SubmittedSetup({ agentId })),
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
      model((model) => {
        expect(model.edits[0]?.saving).toEqual(Option.some("Configure"))
      }),
      Command.resolve(ConfigureAgent, Message.WroteAction({ written: Written.Configure({ agentId }) })),
      model((model) => {
        expect(model.edits).toEqual([])
      })
    )
    // Sending it again while it is on its way sends nothing.
    story(
      update,
      given({
        ...opened,
        edits: [
          {
            agentId,
            name: Option.none(),
            setup: Option.some({ ...setupOfScout, instructions: "Review it twice." }),
            saving: Option.some("Configure"),
            failure: Option.none()
          }
        ]
      }),
      message(Message.SubmittedSetup({ agentId })),
      Command.expectNone()
    )
  })

  it("keeps a name and a setup apart, each saved on its own and each dropped once it is", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedName({ agentId, name: "Scout Prime" })),
      message(Message.TypedInstructions({ target: onScout, instructions: "Review it twice." })),
      message(Message.SubmittedName({ agentId })),
      Command.resolve(RenameAgent, Message.WroteAction({ written: Written.Rename({ agentId }) })),
      model((model) => {
        expect(model.edits).toMatchObject([
          { name: Option.none(), setup: Option.some({ instructions: "Review it twice." }) }
        ])
      }),
      message(Message.SubmittedSetup({ agentId })),
      Command.resolve(ConfigureAgent, Message.WroteAction({ written: Written.Configure({ agentId }) })),
      model((model) => {
        expect(model.edits).toEqual([])
      })
    )
  })

  it("marks the parts of a setup that can't be saved beside their fields, sends nothing, and clears the marks as the setup changes", () => {
    story(
      update,
      given(listed),
      message(
        Message.ReceivedAgents({
          ...agentsOf(alice.id, [aliceOwns]),
          connections: [otherModels, harness].map((connection) => ({ connection, pending: false }))
        })
      ),
      message(integrations),
      // The connection the agent's model runs on is gone.
      message(Message.TypedInstructions({ target: onScout, instructions: "Review it twice." })),
      message(Message.SubmittedSetup({ agentId })),
      Command.expectNone(),
      model((model) => {
        expect(model.edits[0]?.failure).toEqual(
          Option.some({
            action: "Configure",
            reason: Reason.Incomplete({
              problems: [
                {
                  field: "ModelConnection",
                  message: "This connection is no longer available to you. Choose another."
                }
              ]
            })
          })
        )
        expect(Option.map(model.edits[0]?.failure ?? Option.none(), failureMessage)).toEqual(
          Option.some("This setup can’t be saved as it is. Change what’s marked, then try again.")
        )
      }),
      message(Message.ChoseModelConnection({ target: onScout, connectionId: otherModelsId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: otherModelsId })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: otherModelsId, models: offered })),
      model((model) => {
        expect(model.edits[0]?.failure).toEqual(Option.none())
      }),
      message(Message.ChoseModel({ target: onScout, modelId: "test-model" })),
      message(Message.SubmittedSetup({ agentId })),
      Command.expectExact(
        ConfigureAgent({
          ...asMember,
          agentId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "Review it twice.",
            harness: { _tag: "Auto" },
            model: { connectionId: otherModelsId, id: "test-model" },
            sandbox: null
          })
        })
      ),
      Command.resolve(ConfigureAgent, Message.WroteAction({ written: Written.Configure({ agentId }) }))
    )
  })

  it("says why a setup could not be saved under it, and keeps it for the person to change", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ChoseSandbox({ target: onScout, sandbox: sandbox.id })),
      message(Message.SubmittedSetup({ agentId })),
      Command.resolve(
        ConfigureAgent,
        Message.FailedWriteAction({ written: Written.Configure({ agentId }), reason: Reason.Unwritable() })
      ),
      model((model) => {
        expect(model.edits[0]).toMatchObject({
          saving: Option.none(),
          setup: Option.some({ sandbox: sandbox.id }),
          failure: Option.some({ action: "Configure", reason: Reason.Unwritable() })
        })
        expect(Option.map(model.edits[0]?.failure ?? Option.none(), failureMessage)).toEqual(
          Option.some("The setup couldn’t be saved. Try again when the host is available.")
        )
      })
    )
  })

  it("puts the saved setup back in place of the edits when the person discards them", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedInstructions({ target: onScout, instructions: "Review it twice." })),
      message(Message.TypedName({ agentId, name: "Scout Prime" })),
      message(Message.ClickedDiscardSetup({ agentId })),
      model((model) => {
        expect(model.edits).toMatchObject([{ name: Option.some("Scout Prime"), setup: Option.none() }])
        expect(isSetupChanged(model, { agent: scoutAgent, pending: false })).toBe(false)
      }),
      Command.expectNone()
    )
  })

  it("lets a setup changed back to how it is be sent as nothing, since there is nothing to save", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedInstructions({ target: onScout, instructions: "Review it twice." })),
      message(Message.TypedInstructions({ target: onScout, instructions: " Review what is asked. " })),
      model((model) => {
        expect(isSetupChanged(model, { agent: scoutAgent, pending: false })).toBe(false)
      }),
      message(Message.SubmittedSetup({ agentId })),
      Command.expectNone()
    )
  })

  it("saves nothing for a person who may not configure the agent, for an agent on its way, or for one that is gone", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedAgents(agentsOf(bob.id, [bobIsMember]))),
      message(Message.TypedName({ agentId, name: "Scout Prime" })),
      message(Message.TypedInstructions({ target: onScout, instructions: "Review it twice." })),
      message(Message.SubmittedName({ agentId })),
      message(Message.SubmittedSetup({ agentId })),
      Command.expectNone()
    )
    story(
      update,
      given(listed),
      message(
        Message.ReceivedAgents({ ...agentsOf(alice.id, [aliceOwns]), agents: [{ agent: scoutAgent, pending: true }] })
      ),
      message(Message.TypedName({ agentId, name: "Scout Prime" })),
      message(Message.TypedInstructions({ target: onScout, instructions: "Review it twice." })),
      message(Message.SubmittedName({ agentId })),
      message(Message.SubmittedSetup({ agentId })),
      Command.expectNone()
    )
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedName({ agentId: Identity.AgentId.make("agent-9"), name: "Nobody" })),
      message(
        Message.TypedInstructions({
          target: SetupTarget.Agent({ agentId: Identity.AgentId.make("agent-9") }),
          instructions: "No one."
        })
      ),
      message(Message.SubmittedName({ agentId: Identity.AgentId.make("agent-9") })),
      message(Message.SubmittedSetup({ agentId: Identity.AgentId.make("agent-9") })),
      Command.expectNone(),
      model((model) => {
        expect(model.edits).toEqual([])
      })
    )
  })

  it("drops what was changed on the page of an agent that is gone", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedName({ agentId, name: "Scout Prime" })),
      message(Message.ReceivedAgents({ ...agentsOf(alice.id, [aliceOwns]), agents: [] })),
      model((model) => {
        expect(model.edits).toEqual([])
      }),
      message(received),
      message(Message.TypedName({ agentId, name: "Scout Prime" })),
      message(Message.ReceivedAgents({ ...agentsOf(alice.id, [aliceOwns]), members: [alice, bob] })),
      model((model) => {
        expect(model.edits).toEqual([])
      })
    )
  })

  it("say why a read failed, until an action is kept", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.FailedRead({ error: "This browser could not read the workspace’s copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace’s copy."))
      }),
      message(Message.WroteAction({ written: Written.Rename({ agentId }) })),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
      })
    )
  })
})

describe("trying again", () => {
  it("reads the agents again, and no longer says why the read failed", () => {
    story(
      update,
      given(listed),
      message(Message.FailedRead({ error: "This browser could not read the workspace’s copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace’s copy."))
        expect(model.reads).toBe(0)
      }),
      message(Message.ClickedRetry()),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
        expect(model.isLoaded).toBe(false)
        expect(model.reads).toBe(1)
      })
    )
  })
})

describe("the setup of an agent", () => {
  const setup: Draft = {
    instructions: "",
    harness: "",
    modelConnectionId: modelsId,
    modelId: "test-model",
    effort: "",
    sandbox: ""
  }
  const withOffered = { ...opened, offered: [OfferedModels.Loaded({ connectionId: modelsId, models: offered })] }
  const problemsOf = (model: Model, draft: Draft) => {
    const checked = checkSetup(model, draft)
    return Result.isFailure(checked) ? checked.failure : []
  }

  it("makes a configuration when nothing marks it", () => {
    expect(checkSetup(withOffered, setup)).toEqual(
      Result.succeed(
        Schema.decodeSync(Agent.Configuration)({
          instructions: "",
          harness: { _tag: "Auto" },
          model: { connectionId: modelsId, id: "test-model" },
          sandbox: null
        })
      )
    )
  })

  it("marks the parts it still wants, and the instructions it can't store", () => {
    expect(problemsOf(withOffered, { ...setup, modelConnectionId: "" })).toEqual([
      { field: "ModelConnection", message: "Choose a model connection." }
    ])
    expect(problemsOf(withOffered, { ...setup, modelId: " " })).toEqual([
      { field: "Model", message: "Choose a model." }
    ])
    expect(problemsOf(withOffered, { ...setup, instructions: "x".repeat(20_001) })).toEqual([
      { field: "Instructions", message: "The instructions are too long, or hold what can’t be stored." }
    ])
  })

  it("marks a connection that is gone, or whose integration is not installed, beside its field, once the integrations are listed", () => {
    const gone = { ...setup, harness: "gone-1", modelConnectionId: "gone-2", sandbox: "gone-3" }
    expect(problemsOf(withOffered, gone).map(({ field }) => field)).toEqual(["Harness", "ModelConnection", "Sandbox"])
    expect(problemsOf(withOffered, gone)[0]?.message).toBe(
      "This connection is no longer available to you. Choose another."
    )
    // It can't tell until the host has listed them.
    expect(
      problemsOf({ ...withOffered, integrations: Integrations.Loading() }, { ...setup, harness: "gone-1" })
    ).toEqual([])
    // A connection that gives something else than the part needs is no more available than one that is gone.
    expect(problemsOf(withOffered, { ...setup, sandbox: modelsId }).map(({ field }) => field)).toEqual(["Sandbox"])
  })

  it("marks a model that a connection listing only its own models does not offer, and not one it lists or one it takes unlisted", () => {
    const listingOnly = {
      ...withOffered,
      offered: [OfferedModels.Loaded({ connectionId: modelsId, models: { ...offered, unlisted: false } })]
    }
    expect(problemsOf(listingOnly, { ...setup, modelId: "other-model" })).toEqual([
      { field: "Model", message: "This connection offers only the models it lists." }
    ])
    expect(problemsOf(listingOnly, setup)).toEqual([])
    expect(problemsOf(withOffered, { ...setup, modelId: "other-model" })).toEqual([])
  })

  it("marks the sandbox a harness that works only in one needs", () => {
    const sandboxed = {
      ...withOffered,
      integrations: Integrations.Loaded({
        integrations: [modelsIntegration, { ...harnessIntegration, requiresSandbox: true }, sandboxIntegration]
      })
    }
    expect(problemsOf(sandboxed, { ...setup, harness: harness.id })).toEqual([
      { field: "Sandbox", message: "Harness works only in a sandbox. Choose one." }
    ])
    expect(problemsOf(sandboxed, { ...setup, harness: harness.id, sandbox: sandbox.id })).toEqual([])
    expect(problemsOf(sandboxed, setup)).toEqual([])
  })

  it("lists the connections that give what a part needs, each with its integration, and keeps the one an agent names that is gone", () => {
    const harnesses = (current: string) =>
      connectionChoices(opened, "harnesses", current, ({ name }) => `${name} · Works on this host`)
    expect(harnesses("")).toEqual([[harness.id, "Harness", { description: "Test harness · Works on this host" }]])
    expect(harnesses(harness.id)).toEqual(harnesses(""))
    // A connection removed from the workspace.
    expect(harnesses("gone-1")).toEqual([
      ...harnesses(""),
      ["gone-1", "Removed connection", { description: "This connection was removed.", isDisabled: true }]
    ])
    // A connection whose integration gives something else, or is not installed on this host.
    expect(connectionChoices(opened, "harnesses", modelsId, ({ name }) => name)[1]).toEqual([
      modelsId,
      "Models",
      { description: "Its integration doesn’t give this.", isDisabled: true }
    ])
    const vertex = keylessConnection("vertex-1", "vertex", "Vertex")
    expect(
      connectionChoices(
        { ...opened, connections: [...opened.connections, { connection: vertex, pending: false }] },
        "models",
        vertex.id,
        ({ name }) => name
      )[2]
    ).toEqual([vertex.id, "Vertex", { description: "Its integration isn’t installed on this host.", isDisabled: true }])
    // Until the host lists its integrations, it does not say so.
    expect(
      connectionChoices({ ...opened, integrations: Integrations.Loading() }, "harnesses", modelsId, ({ name }) => name)
    ).toEqual([[modelsId, "Models", { isDisabled: true }]])
  })

  it("words each failure for the action it belongs to", () => {
    expect(failureMessage({ action: "Create", reason: Reason.Invalid() })).toBe(
      "Check the name, instructions, and model, then try again."
    )
    expect(failureMessage({ action: "Create", reason: Reason.Unwritable() })).toBe(
      "The agent couldn’t be created. Try again when the host is available."
    )
    expect(failureMessage({ action: "Rename", reason: Reason.Invalid() })).toBe(
      "Use 1 to 80 characters, with no invisible ones."
    )
    expect(failureMessage({ action: "Rename", reason: Reason.Unwritable() })).toBe(
      "The name couldn’t be saved. Try again when the host is available."
    )
    expect(failureMessage({ action: "Configure", reason: Reason.Invalid() })).toBe(
      "Check the instructions and model, then save again."
    )
    expect(failureMessage({ action: "Configure", reason: Reason.Unwritable() })).toBe(
      "The setup couldn’t be saved. Try again when the host is available."
    )
    expect(failureMessage({ action: "Remove", reason: Reason.Invalid() })).toBe("That change isn’t possible.")
    expect(failureMessage({ action: "Remove", reason: Reason.Unwritable() })).toBe(
      "The agent couldn’t be removed. Try again when the host is available."
    )
    for (const action of ["Create", "Configure"] as const) {
      expect(failureMessage({ action, reason: Reason.Incomplete({ problems: [] }) })).toBe(
        "This setup can’t be saved as it is. Change what’s marked, then try again."
      )
    }
  })

  it("offers a new agent the roles the person may give, from the roles and workspace it reads", () => {
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

  it("offers a new agent Member and Administrator to start with, Administrator unavailable to all but the owner", () => {
    const administrators = [aliceOwns, roleOf("assignment-3", bob.id, BuiltinRoles.AdministratorId)]
    const readAs = (memberId: MemberId.MemberId, assignments: ReadonlyArray<Assignment.Assignment>) => ({
      ...init(workspace.id, memberId).model,
      ...agentsOf(memberId, assignments)
    })
    const offeredTo = (model: ReturnType<typeof readAs>) =>
      startingRoles(model).map(({ role, isGivable }) => [role.id, isGivable])
    expect(offeredTo(readAs(alice.id, [aliceOwns, bobIsMember]))).toEqual([
      [BuiltinRoles.MemberId, true],
      [BuiltinRoles.AdministratorId, true]
    ])
    expect(offeredTo(readAs(bob.id, administrators))).toEqual([
      [BuiltinRoles.MemberId, true],
      [BuiltinRoles.AdministratorId, false]
    ])
    expect(startingRoles(listed)).toEqual([])
  })

  it("wants a name and a model before an agent can be added", () => {
    const ready: Adding = {
      name: "Reviewer",
      roleId: BuiltinRoles.MemberId,
      setup: setupOfScout,
      failure: Option.none(),
      creating: Option.none()
    }
    expect(isAddingReady(ready)).toBe(true)
    expect(isAddingReady({ ...ready, name: "   " })).toBe(false)
    expect(isAddingReady({ ...ready, setup: { ...setupOfScout, modelConnectionId: "" } })).toBe(false)
    expect(isAddingReady({ ...ready, setup: { ...setupOfScout, modelId: " " } })).toBe(false)
  })

  it("tells the agent the person added by who made it, the name it was sent under, and that it was not there before", () => {
    const creating = { name: "Reviewer", knownAgentIds: [agentId], isWritten: false }
    const listedAfter = {
      ...opened,
      agents: [scoutAgent, reviewerAgent].map((agent) => ({ agent, pending: false })),
      members: [alice, bob, scout, reviewer]
    }
    expect(findCreatedAgent(listedAfter, creating)).toEqual(Option.some({ agent: reviewerAgent, pending: false }))
    expect(findCreatedAgent(listedAfter, { ...creating, name: "Builder" })).toEqual(Option.none())
    expect(findCreatedAgent(listedAfter, { ...creating, knownAgentIds: [agentId, reviewerAgent.id] })).toEqual(
      Option.none()
    )
    expect(findCreatedAgent({ ...listedAfter, memberId: bob.id }, creating)).toEqual(Option.none())
    expect(findCreatedAgent({ ...listedAfter, members: [alice, bob, scout] }, creating)).toEqual(Option.none())
  })

  it("lets only a person with the permission to remove members remove an agent", () => {
    expect(mayRemove(opened, scoutAgent)).toBe(true)
    expect(mayRemove({ ...opened, ...agentsOf(bob.id, [bobIsMember]) }, scoutAgent)).toBe(false)
  })

  it("is busy only while a request from the dialog is on its way, until the store keeps it", () => {
    expect(isDialogBusy(listed)).toBe(false)
    expect(isDialogBusy(sendingAdding)).toBe(true)
    expect(
      isDialogBusy(
        modifyFields(sendingAdding, {
          adding: Option.map((open) => ({
            ...open,
            creating: Option.map(open.creating, (sent) => ({ ...sent, isWritten: true }))
          }))
        })
      )
    ).toBe(false)
    expect(isDialogBusy(removingAgent(true))).toBe(true)
    expect(isDialogBusy(removingAgent(false))).toBe(false)
  })
})

describe("what the agents are doing", () => {
  const underWay = [
    { ...turnOf("turn-1", "running"), createdAt: DateTime.add(now, { minutes: 1 }) },
    { ...turnOf("turn-2", "queued"), groupId: design.id, createdAt: DateTime.add(now, { minutes: 2 }) }
  ]
  const [scoutItem] = opened.agents

  it("is read from the turns under way and the groups they are in, replacing what was read before", () => {
    story(
      update,
      given(opened),
      message(Message.ReceivedActivity({ turns: underWay, groups: [general, design] })),
      model((model) => {
        expect(model.turns).toEqual(underWay)
        expect(model.groups).toEqual([general, design])
      }),
      message(Message.ReceivedActivity({ turns: [], groups: [general] })),
      model((model) => {
        expect(model.turns).toEqual([])
        expect(model.groups).toEqual([general])
      }),
      expectNoOutMessage()
    )
  })

  it("is idle for an agent with no turn under way, and otherwise its state and each place", () => {
    const working = { ...opened, turns: underWay, groups: [general, design] }

    expect(turnsOfAgent(opened, scoutItem!)).toEqual([])
    expect(activityOfAgent(opened, scoutItem!)).toEqual(Option.none())
    expect(turnsOfAgent(working, scoutItem!).map(({ state }) => state)).toEqual(["working", "queued"])
    expect(activityOfAgent(working, scoutItem!)).toEqual(
      Option.some({ state: "working", places: ["#General", "#Design"] })
    )
  })

  it("is nothing for an agent still on its way, which has run no turn", () => {
    const working = { ...opened, turns: underWay, groups: [general, design] }

    expect(turnsOfAgent(working, { ...scoutItem!, pending: true })).toEqual([])
    expect(activityOfAgent(working, { ...scoutItem!, pending: true })).toEqual(Option.none())
  })

  it("reports the thread of the turn the person picks, with its group, and changes nothing else", () => {
    const working = { ...opened, turns: underWay, groups: [general, design] }
    const threadId = ThreadId.ThreadId.make("thread-2")

    story(
      update,
      given(working),
      message(Message.ClickedTurn({ groupId: design.id, threadId })),
      expectOutMessage(OutMessage.OpenedThread({ groupId: design.id, threadId })),
      Command.expectNone(),
      model((model) => {
        expect(model).toEqual(working)
      })
    )
  })

  it("is read again, with the agents, when the person tries again", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedRetry()),
      model((model) => {
        expect(model.reads).toBe(opened.reads + 1)
      })
    )
  })
})
