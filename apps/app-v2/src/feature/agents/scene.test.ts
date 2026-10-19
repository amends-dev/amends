import { Agent } from "@amends-dev/core/agent"
import { BuiltinRoles } from "@amends-dev/core/authorization"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Member } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import {
  Command,
  Subscription,
  change,
  click,
  expect,
  given,
  inside,
  label,
  role,
  scene,
  text,
  type
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  aliceOwns,
  bob,
  bobIsMember,
  grantsOf,
  integrationGiving,
  keylessConnection,
  membership,
  offered,
  roles,
  scout,
  scoutAgent
} from "../../../test/fixtures.ts"
import { Integrations } from "../connections/definition.ts"
import { AgentsBlock } from "./block.ts"
import { ConfigureAgent, CreateAgent, LoadIntegrations, LoadModels, RenameAgent } from "./command.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member: alice } = membership
const asMember = { workspaceId: workspace.id, memberId: alice.id }
const workspaceId = workspace.id

const modelsIntegration = integrationGiving("test-models", "Test models", ["models"])
const harnessIntegration = integrationGiving("test-harness", "Test harness", ["harnesses"])
const sandboxIntegration = integrationGiving("test-sandbox", "Test sandbox", ["sandboxes"])

const models = keylessConnection("models-1", "test-models", "Models")
const harness = keylessConnection("harness-1", "test-harness", "Harness")
const sandbox = keylessConnection("sandbox-1", "test-sandbox", "Sandbox")

const agentId = scoutAgent.id
const ownerGrants = grantsOf([aliceOwns])
const memberGrants = grantsOf([bobIsMember])

/** The agents as an owner of the workspace reads them, scout among them, with the integrations loaded. */
const opened: Model = {
  ...init(workspace.id, alice.id).model,
  agents: [{ agent: scoutAgent, pending: false }],
  members: [alice, bob, scout],
  connections: [models, harness, sandbox].map((connection) => ({ connection, pending: false })),
  integrations: Integrations.Loaded({
    integrations: [modelsIntegration, harnessIntegration, sandboxIntegration]
  }),
  roles,
  workspace: Option.some({ workspace, pending: false }),
  grants: ownerGrants
}

describe("the agents", () => {
  it("are added by an owner, on a harness, a model of a connection, and a sandbox the connections give", () => {
    scene(
      { update, view, subscriptions: AgentsBlock.subscriptions },
      given(modifyFields(opened, { agents: () => [] })),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      click(role("button", { name: "Add an agent" })),
      expect(role("region", { name: "Add an agent" })).toExist(),
      inside(
        role("form", { name: "Add an agent" }),
        type(label("Name"), "Reviewer"),
        change(label("Role"), BuiltinRoles.AdministratorId),
        type(label("Instructions"), "Review what is asked."),
        change(label("Harness"), harness.id),
        expect(label("Model")).toBeAbsent(),
        change(label("Model connection"), models.id)
      ),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      inside(role("form", { name: "Add an agent" }), expect(text("Loading the models…")).toExist()),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(
        role("form", { name: "Add an agent" }),
        expect(text("Loading the models…")).toBeAbsent(),
        expect(label("Effort")).toBeAbsent(),
        change(label("Model"), "test-model"),
        change(label("Effort"), "high"),
        change(label("Sandbox"), sandbox.id),
        click(role("button", { name: "Add" }))
      ),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Reviewer",
          roleId: BuiltinRoles.AdministratorId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "Review what is asked.",
            harness: { _tag: "Connection", connectionId: harness.id },
            model: { connectionId: models.id, id: "test-model", effort: "high" },
            sandbox: { connectionId: sandbox.id }
          })
        })
      ),
      Command.resolve(CreateAgent, Message.WroteAction()),
      expect(role("form", { name: "Add an agent" })).toBeAbsent(),
      Subscription.emit(
        subscriptions.agents,
        Message.ReceivedAgents({
          agents: opened.agents,
          members: opened.members,
          connections: opened.connections,
          roles: opened.roles,
          workspace: opened.workspace,
          grants: opened.grants
        })
      ),
      expect(text("Runs test-model on Models, any harness, no sandbox.")).toExist()
    )
  })

  it("are added with a model the connection does not list, named by its id", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "Add an agent" })),
      inside(
        role("form", { name: "Add an agent" }),
        type(label("Name"), "Builder"),
        change(label("Model connection"), models.id)
      ),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(
        role("form", { name: "Add an agent" }),
        type(label("Model ID"), "other-model"),
        click(role("button", { name: "Add" }))
      ),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Builder",
          roleId: BuiltinRoles.MemberId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "",
            harness: { _tag: "Auto" },
            model: { connectionId: models.id, id: "other-model" },
            sandbox: null
          })
        })
      ),
      Command.resolve(CreateAgent, Message.WroteAction())
    )
  })

  it("are refused, with why, until the draft names the connection and the model of the agent", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "Add an agent" })),
      inside(
        role("form", { name: "Add an agent" }),
        type(label("Name"), "Reviewer"),
        click(role("button", { name: "Add" }))
      ),
      Command.expectNone(),
      expect(text("Choose the connection of the agent's model.")).toExist(),
      expect(role("alert")).toExist(),
      inside(role("form", { name: "Add an agent" }), change(label("Model connection"), models.id)),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      expect(text("Choose the connection of the agent's model.")).toBeAbsent(),
      inside(role("form", { name: "Add an agent" }), click(role("button", { name: "Add" }))),
      Command.expectNone(),
      expect(text("Choose the agent's model.")).toExist(),
      click(role("button", { name: "Cancel" })),
      expect(role("form", { name: "Add an agent" })).toBeAbsent(),
      expect(role("button", { name: "Add an agent" })).toExist()
    )
  })

  it("say why the models of a connection could not be listed", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "Add an agent" })),
      inside(role("form", { name: "Add an agent" }), change(label("Model connection"), models.id)),
      Command.resolve(
        LoadModels,
        Message.FailedLoadModels({ connectionId: models.id, error: "The host could not be reached. Try again." })
      ),
      expect(text("The host could not be reached. Try again.")).toExist(),
      expect(label("Model")).toBeAbsent()
    )
  })

  it("are renamed and set up again by an owner, from how they are now", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "Rename" })),
      inside(
        role("form", { name: "Rename the agent" }),
        type(label("Name"), "Scout Prime"),
        click(role("button", { name: "Save" }))
      ),
      Command.expectExact(RenameAgent({ ...asMember, agentId, name: "Scout Prime", expectedName: "Scout" })),
      Command.resolve(
        RenameAgent,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      expect(text("This browser could not keep that. Try again.")).toExist(),
      click(role("button", { name: "Change setup" })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(
        role("form", { name: "Change the agent's setup" }),
        expect(label("Instructions")).toExist(),
        expect(label("Model")).toExist(),
        type(label("Instructions"), "Review it twice."),
        change(label("Sandbox"), sandbox.id),
        click(role("button", { name: "Save" }))
      ),
      Command.expectExact(
        ConfigureAgent({
          ...asMember,
          agentId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "Review it twice.",
            harness: { _tag: "Auto" },
            model: { connectionId: models.id, id: "test-model" },
            sandbox: { connectionId: sandbox.id }
          })
        })
      ),
      Command.resolve(ConfigureAgent, Message.WroteAction()),
      expect(role("form", { name: "Change the agent's setup" })).toBeAbsent(),
      expect(text("This browser could not keep that. Try again.")).toBeAbsent()
    )
  })

  it("show an ordinary member each agent and how ready it is, and none of the controls", () => {
    scene(
      { update, view, subscriptions: AgentsBlock.subscriptions },
      given(modifyFields(opened, { grants: () => memberGrants })),
      inside(
        role("list", { name: "Agents" }),
        expect(text("Scout")).toExist(),
        expect(text("Ready")).toExist(),
        expect(text("Runs test-model on Models, any harness, no sandbox.")).toExist()
      ),
      expect(role("button", { name: "Add an agent" })).toBeAbsent(),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      expect(role("button", { name: "Change setup" })).toBeAbsent(),
      // Once the person is given the role that manages them, the controls appear.
      Subscription.emit(
        subscriptions.agents,
        Message.ReceivedAgents({
          agents: opened.agents,
          members: opened.members,
          connections: opened.connections,
          roles: opened.roles,
          workspace: opened.workspace,
          grants: ownerGrants
        })
      ),
      expect(role("button", { name: "Add an agent" })).toExist(),
      expect(role("button", { name: "Rename" })).toExist(),
      expect(role("button", { name: "Change setup" })).toExist()
    )
  })

  it("say an agent is changing while its change is on its way, and offer no control for it", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { agents: () => [{ agent: scoutAgent, pending: true }] })),
      inside(role("list", { name: "Agents" }), expect(text("Scout")).toExist(), expect(text(" · Sending…")).toExist()),
      expect(text("Ready")).toBeAbsent(),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      expect(role("button", { name: "Change setup" })).toBeAbsent()
    )
  })

  it("say what each agent runs on, and why one can't run", () => {
    const agentMember = (id: string, agentId: string, name: string) =>
      Schema.decodeSync(Member.Member)({
        id,
        workspaceId: "workspace-1",
        identity: { _tag: "Agent", id: agentId },
        name,
        status: "active"
      })
    const agentOf = (id: string, memberId: string, setup: object) =>
      Schema.decodeSync(ReplicaRecord.Agent)({
        ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
        id,
        memberId,
        ...setup
      })
    const builder = agentMember("member-4", "agent-2", "Builder")
    const stranded = agentMember("member-5", "agent-3", "Stranded")
    const onConnections = agentOf("agent-2", "member-4", {
      harness: { _tag: "Connection", connectionId: harness.id },
      sandbox: { connectionId: sandbox.id }
    })
    const incomplete = agentOf("agent-3", "member-5", {
      model: { connectionId: "gone-1", id: "old-model" },
      readiness: {
        _tag: "Incomplete",
        issues: [
          { _tag: "Removed", part: "model" },
          { _tag: "Uninstalled", part: "harness" },
          { _tag: "Invalid", part: "sandbox", description: "It takes no sandboxes" },
          { _tag: "SandboxRequired" },
          { _tag: "NoHarness" }
        ]
      }
    })
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          agents: () => [onConnections, incomplete].map((agent) => ({ agent, pending: false })),
          members: () => [alice, builder, stranded]
        })
      ),
      expect(text("Builder")).toExist(),
      expect(text("Runs test-model on Models, the Harness harness, sandboxes on Sandbox.")).toExist(),
      expect(text("Ready")).toExist(),
      expect(text("Stranded")).toExist(),
      expect(text("Runs old-model on a removed connection, any harness, no sandbox.")).toExist(),
      expect(text("Can't run")).toExist(),
      expect(
        text(
          [
            "its model's connection was removed",
            "its harness's integration is no longer installed",
            "its sandbox: It takes no sandboxes",
            "its harness works only in a sandbox",
            "no connection gives a harness it can run on"
          ].join("; ")
        )
      ).toExist()
    )
  })

  it("name the agent an unnamed membership is, and list none whose membership left", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { members: () => [alice, { ...scout, status: "removed" }] })),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      expect(text("Scout")).toBeAbsent()
    )
  })

  it("say why the integrations could not be listed, and ask again, offering to add only once they are", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          integrations: () => Integrations.Failed({ error: "The host could not be reached. Try again." })
        })
      ),
      expect(text("The host could not be reached. Try again.")).toExist(),
      expect(role("button", { name: "Add an agent" })).toBeAbsent(),
      click(role("button", { name: "Try again" })),
      Command.expectExact(LoadIntegrations({ workspaceId })),
      expect(text("Loading the integrations…")).toExist(),
      Command.resolve(
        LoadIntegrations,
        Message.ReceivedIntegrations({
          integrations: [modelsIntegration, harnessIntegration, sandboxIntegration]
        })
      ),
      expect(text("Loading the integrations…")).toBeAbsent(),
      expect(role("button", { name: "Add an agent" })).toExist()
    )
  })

  it("offer to add an agent only when a connection gives models", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          connections: () => [harness, sandbox].map((connection) => ({ connection, pending: false }))
        })
      ),
      expect(text("An agent needs a connection that gives models.")).toExist(),
      expect(role("button", { name: "Add an agent" })).toBeAbsent()
    )
  })

  it("say why they could not be read", () => {
    scene(
      { update, view, subscriptions: AgentsBlock.subscriptions },
      given(opened),
      Subscription.emit(
        subscriptions.agents,
        Message.FailedRead({ error: "This browser could not read the workspace's copy." })
      ),
      expect(text("This browser could not read the workspace's copy.")).toExist(),
      expect(role("alert")).toExist()
    )
  })
})
