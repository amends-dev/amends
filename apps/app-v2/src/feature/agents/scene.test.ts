import { Agent } from "@amends-dev/core/agent"
import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Identity } from "@amends-dev/core/identity"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Member } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import {
  Command,
  Subscription,
  all,
  change,
  click,
  expect,
  expectAll,
  expectOutMessage,
  first,
  given,
  inside,
  label,
  role,
  scene,
  selector,
  text,
  type,
  withViewInputs,
  within
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
import { ConfigureAgent, CreateAgent, LoadModels, RenameAgent } from "./command.ts"
import { Message, type Model, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { sidebarView, view } from "./view.ts"

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

/** Scout as the server says it can't run: the connection of its model was removed. */
const incompleteAgent = Schema.decodeSync(ReplicaRecord.Agent)({
  ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
  readiness: { _tag: "Incomplete", issues: [{ _tag: "Removed", part: "model" }] }
})

const ownerGrants = grantsOf([aliceOwns])
const memberGrants = grantsOf([bobIsMember])

/** The agents as an owner of the workspace reads them, scout among them, with the integrations loaded. */
const opened: Model = {
  ...init(workspace.id, alice.id).model,
  isLoaded: true,
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
      click(first(all.role("button", { name: "Add agent" }))),
      expectOutMessage(OutMessage.RequestedBrowse()),
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
      expect(role("button", { name: "Scout" })).toHaveAttr(
        "aria-description",
        "Auto · No sandbox · test-model · Models"
      )
    )
  })

  it("are added with a model the connection does not list, named by its id", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "Add agent" })),
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
      click(role("button", { name: "Add agent" })),
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
      expect(role("button", { name: "Add agent" })).toExist()
    )
  })

  it("say why the models of a connection could not be listed", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "Add agent" })),
      inside(role("form", { name: "Add an agent" }), change(label("Model connection"), models.id)),
      Command.resolve(
        LoadModels,
        Message.FailedLoadModels({ connectionId: models.id, error: "The host could not be reached. Try again." })
      ),
      expect(text("The host could not be reached. Try again.")).toExist(),
      expect(label("Model")).toBeAbsent()
    )
  })

  it("are renamed and set up again by an owner, from how they are now, picking one opening its setup below the list", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(role("form", { name: "Change the agent's setup" }), click(role("button", { name: "Rename" }))),
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
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
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

  it("show an ordinary member each agent with what it runs on, and no way to add or change one", () => {
    scene(
      { update, view, subscriptions: AgentsBlock.subscriptions },
      given(modifyFields(opened, { grants: () => memberGrants })),
      inside(
        role("list", { name: "Agents" }),
        expect(role("button", { name: "Scout" })).toHaveAttr(
          "aria-description",
          "Auto · No sandbox · test-model · Models"
        )
      ),
      expect(role("button", { name: "Add agent" })).toBeAbsent(),
      // Picking an agent reports it, and opens nothing a person who may not change it could use.
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectNone(),
      expect(role("form", { name: "Change the agent's setup" })).toBeAbsent(),
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
      expect(role("button", { name: "Add agent" })).toExist(),
      click(role("button", { name: "Scout" })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      expect(role("form", { name: "Change the agent's setup" })).toExist()
    )
  })

  it("say an agent is on its way while its change is, with no status until the server says how ready it is, and open no form", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { agents: () => [{ agent: incompleteAgent, pending: true }] })),
      inside(
        role("list", { name: "Agents" }),
        expect(role("button", { name: "Scout" })).toHaveAttr(
          "aria-description",
          "Sending… · Auto · No sandbox · test-model · Models"
        )
      ),
      expect(role("button", { name: "Scout, Needs setup" })).toBeAbsent(),
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectNone(),
      expect(role("form", { name: "Change the agent's setup" })).toBeAbsent()
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
      expect(role("button", { name: "Builder" })).toHaveAttr(
        "aria-description",
        "Harness · Sandbox · test-model · Models"
      ),
      expect(within(role("button", { name: "Builder" }), text("B"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("button", { name: "Builder" }), selector("[title]"))).toBeAbsent(),
      expect(role("button", { name: "Stranded, Needs setup" })).toHaveAttr(
        "aria-description",
        "Auto · No sandbox · old-model · Removed connection"
      ),
      // The patch says why on hover, by the first thing in the way.
      expect(within(role("button", { name: "Stranded, Needs setup" }), text("S"))).toHaveAttr(
        "title",
        "Needs setup: Its model connection was removed."
      )
    )
  })

  it("say in a sentence why an agent needs setup, by the first of what keeps it from running", () => {
    const stranded = (issue: typeof Agent.Issue.Encoded) =>
      Schema.decodeSync(ReplicaRecord.Agent)({
        ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
        readiness: { _tag: "Incomplete", issues: [issue] }
      })
    const reasons: ReadonlyArray<readonly [typeof Agent.Issue.Encoded, string]> = [
      [{ _tag: "Removed", part: "sandbox" }, "Its sandbox connection was removed."],
      [{ _tag: "Uninstalled", part: "harness" }, "Its harness connection's integration isn't installed on this host."],
      [{ _tag: "Invalid", part: "sandbox", description: "It takes no sandboxes" }, "It takes no sandboxes."],
      [{ _tag: "SandboxRequired" }, "Its harness works only in a sandbox, and it has none."],
      [{ _tag: "NoHarness" }, "No connection gives a harness it can run on."]
    ]
    for (const [issue, sentence] of reasons) {
      scene(
        { update, view },
        given(modifyFields(opened, { agents: () => [{ agent: stranded(issue), pending: false }] })),
        expect(within(role("button", { name: "Scout, Needs setup" }), text("S"))).toHaveAttr(
          "title",
          `Needs setup: ${sentence}`
        )
      )
    }
  })

  it("name the agent an unnamed membership is, and list none whose membership left", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { members: () => [alice, { ...scout, status: "removed" }] })),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      expect(text("Scout")).toBeAbsent()
    )
  })

  it("say why the integrations could not be listed, and ask the page to list them again, offering to add only once they are", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          integrations: () => Integrations.Failed({ error: "The host could not be reached. Try again." })
        })
      ),
      expect(text("The host could not be reached. Try again.")).toExist(),
      expect(role("button", { name: "Add agent" })).toBeAbsent(),
      click(role("button", { name: "Try again" })),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      expect(text("Loading the integrations…")).toExist(),
      expect(role("button", { name: "Add agent" })).toBeAbsent()
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
      expect(role("button", { name: "Add agent" })).toBeAbsent()
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

  it("show nothing, not even that there are none, until the agents are read", () => {
    scene(
      { update, view, subscriptions: AgentsBlock.subscriptions },
      given(init(workspace.id, alice.id).model),
      expect(role("heading", { name: "Agents", level: 1 })).toExist(),
      expect(role("heading", { name: "No agents yet" })).toBeAbsent(),
      expect(role("list", { name: "Agents" })).toBeAbsent(),
      expect(role("tab", { name: "All" })).not.toHaveAttr("aria-description"),
      Subscription.emit(
        subscriptions.agents,
        Message.ReceivedAgents({
          agents: [],
          members: opened.members,
          connections: opened.connections,
          roles: opened.roles,
          workspace: opened.workspace,
          grants: opened.grants
        })
      ),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "0")
    )
  })
})

/** Scout and two more: Nora, who can run, and Review helper, who can't, as an owner reads them. */
const withSeveral: Model = (() => {
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
  const nora = agentMember("member-4", "agent-2", "Nora")
  const helper = agentMember("member-5", "agent-3", "Review helper")
  return {
    ...opened,
    members: [alice, bob, scout, nora, helper],
    agents: [
      scoutAgent,
      agentOf("agent-2", "member-4", {}),
      agentOf("agent-3", "member-5", {
        readiness: { _tag: "Incomplete", issues: [{ _tag: "Removed", part: "sandbox" }] }
      })
    ].map((agent) => ({ agent, pending: false }))
  }
})()

describe("the agents list", () => {
  it("has the tabs All and Needs setup, each with how many agents it holds, All the one shown", () => {
    scene(
      { update, view },
      given(withSeveral),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "3"),
      expect(role("tab", { name: "Needs setup" })).toHaveAttr("aria-selected", "false"),
      expect(role("tab", { name: "Needs setup" })).toHaveAttr("aria-description", "1"),
      expectAll(all.role("button", { name: /^(Scout|Nora|Review helper)/ })).toHaveCount(3),
      click(role("tab", { name: "Needs setup" })),
      expect(role("tab", { name: "Needs setup" })).toHaveAttr("aria-selected", "true"),
      expect(role("button", { name: "Review helper, Needs setup" })).toExist(),
      expect(role("button", { name: "Nora" })).toBeAbsent(),
      expect(role("button", { name: "Scout" })).toBeAbsent(),
      click(role("tab", { name: "All" })),
      expect(role("button", { name: "Nora" })).toExist()
    )
  })

  it("labels the columns Agent, Harness, Model, and Activity over its rows, which leave the activity blank", () => {
    scene(
      { update, view },
      given(withSeveral),
      expect(text("Agent")).toExist(),
      expect(text("Harness")).toExist(),
      expect(text("Model")).toExist(),
      expect(text("Activity")).toExist(),
      expect(within(role("button", { name: "Nora" }), text("Auto"))).toExist(),
      expect(within(role("button", { name: "Nora" }), text("No sandbox"))).toExist(),
      expect(within(role("button", { name: "Nora" }), text("test-model"))).toExist(),
      expect(within(role("button", { name: "Nora" }), text("Models"))).toExist(),
      expect(within(role("button", { name: "Nora" }), selector("svg"))).toBeAbsent()
    )
  })

  it("puts the patch of a lilac mark on an agent that needs setup, and none on one that is ready", () => {
    scene(
      { update, view },
      given(withSeveral),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("R"))).toHaveAttr(
        "title",
        "Needs setup: Its sandbox connection was removed."
      ),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("R"))).toHaveClass(
        "bg-avatar-lilac-bg"
      ),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("R"))).toHaveClass("size-8"),
      expect(within(role("button", { name: "Nora" }), text("N"))).not.toHaveAttr("title")
    )
  })

  it("narrows its rows by name as the person searches, in any case and whatever the accents", () => {
    scene(
      { update, view },
      given(withSeveral),
      type(label("Search agents"), "REVIEW"),
      expect(role("button", { name: "Review helper, Needs setup" })).toExist(),
      expect(role("button", { name: "Nora" })).toBeAbsent(),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "3"),
      type(label("Search agents"), "nórá"),
      expect(role("button", { name: "Nora" })).toExist(),
      expect(role("button", { name: "Scout" })).toBeAbsent()
    )
  })

  it("says nothing matches the search, with the search quoted, and clears it from a quiet button", () => {
    scene(
      { update, view },
      given(withSeveral),
      type(label("Search agents"), "zzz"),
      expect(role("heading", { name: "No agents match “zzz”.", level: 2 })).toExist(),
      expect(role("list", { name: "Agents" })).toBeAbsent(),
      click(role("button", { name: "Clear search" })),
      expect(role("heading", { name: "No agents match “zzz”." })).toBeAbsent(),
      expect(role("button", { name: "Nora" })).toExist()
    )
  })

  it("says every agent can run while the Needs setup tab has none", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { browse: () => ({ tab: "NeedsSetup", query: "" }) })),
      expect(role("heading", { name: "Every agent can run as it is set up.", level: 2 })).toExist(),
      expect(role("button", { name: "Scout" })).toBeAbsent(),
      click(role("tab", { name: "All" })),
      expect(role("button", { name: "Scout" })).toExist()
    )
  })

  it("offers adding the first agent to a person who may, and says who can to one who may not", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { agents: () => [] })),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      expect(text("Add an agent: a member that works on a harness and a model your connections give.")).toExist(),
      expectAll(all.role("button", { name: "Add agent" })).toHaveCount(2)
    )
    scene(
      { update, view },
      given(modifyFields(opened, { agents: () => [], grants: () => memberGrants })),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      expect(text("An administrator can add agents to your workspace.")).toExist(),
      expect(role("button", { name: "Add agent" })).toBeAbsent()
    )
  })

  it("is the list alone, with no search or columns, while the workspace has no agent", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { agents: () => [] })),
      expect(label("Search agents")).toBeAbsent(),
      expect(text("Harness")).toBeAbsent()
    )
  })
})

describe("the agents' section of the sidebar", () => {
  const sidebar = withViewInputs(sidebarView, { isListOpen: true })

  it("is a section named Agents with Browse and Add agent, and the title opening the list", () => {
    scene(
      { update, view: sidebar() },
      given(withSeveral),
      expect(role("heading", { name: "Agents", level: 2 })).toExist(),
      expect(within(role("heading", { name: "Agents", level: 2 }), role("button", { name: "Agents" }))).toExist(),
      click(role("button", { name: "Agents" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      click(role("button", { name: "Browse agents" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      click(role("button", { name: "Add agent" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      Command.expectNone()
    )
  })

  it("marks the title current while the list shows, and not otherwise", () => {
    scene(
      { update, view: sidebar() },
      given(withSeveral),
      expect(role("button", { name: "Agents" })).toHaveAttr("aria-current", "page")
    )
    scene(
      { update, view: sidebar({ isListOpen: false }) },
      given(withSeveral),
      expect(role("button", { name: "Agents" })).not.toHaveAttr("aria-current")
    )
  })

  it("lists each agent by its name on a lilac mark, with a patch for the one that needs setup", () => {
    scene(
      { update, view: sidebar() },
      given(withSeveral),
      expect(role("button", { name: "Scout" })).toExist(),
      expect(role("button", { name: "Nora" })).toExist(),
      expect(role("button", { name: "Review helper, Needs setup" })).toExist(),
      expect(within(role("button", { name: "Nora" }), text("N"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("button", { name: "Nora" }), text("N"))).toHaveClass("size-6"),
      expect(within(role("button", { name: "Nora" }), text("N"))).not.toHaveAttr("title"),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("R"))).toHaveAttr(
        "title",
        "Needs setup: Its sandbox connection was removed."
      ),
      expect(role("button", { name: "Nora" })).not.toHaveAttr("aria-current")
    )
  })

  it("reports the agent picked, and opens its setup form for an owner", () => {
    scene(
      { update, view: sidebar() },
      given(withSeveral),
      click(role("button", { name: "Nora" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: Identity.AgentId.make("agent-2") })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered }))
    )
  })

  it("says No agents yet once the agents are read and there are none, and nothing before", () => {
    scene(
      { update, view: sidebar() },
      given(modifyFields(opened, { agents: () => [] })),
      expect(text("No agents yet")).toExist(),
      expect(role("button", { name: "Scout" })).toBeAbsent()
    )
    scene(
      { update, view: sidebar() },
      given(modifyFields(opened, { isLoaded: () => false, agents: () => [] })),
      expect(text("No agents yet")).toBeAbsent(),
      expect(role("heading", { name: "Agents", level: 2 })).toExist()
    )
  })

  it("shows an agent on its way as Sending…, with no patch, and offers adding only to a person who may", () => {
    scene(
      { update, view: sidebar() },
      given(modifyFields(opened, { agents: () => [{ agent: incompleteAgent, pending: true }] })),
      expect(role("button", { name: "Scout" })).toHaveAttr("aria-description", "Sending…"),
      expect(within(role("button", { name: "Scout" }), text("Sending…"))).toExist()
    )
    scene(
      { update, view: sidebar() },
      given(modifyFields(withSeveral, { grants: () => memberGrants })),
      expect(role("button", { name: "Browse agents" })).toExist(),
      expect(role("button", { name: "Add agent" })).toBeAbsent()
    )
  })
})
