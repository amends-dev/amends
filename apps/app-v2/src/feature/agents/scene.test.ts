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
import { calendarDate } from "../../seen.ts"
import { Integrations } from "../connections/definition.ts"
import { AgentsBlock } from "./block.ts"
import { ConfigureAgent, CreateAgent, LoadModels, RenameAgent } from "./command.ts"
import { Message, type Model, OfferedModels, OutMessage, Reason, Written } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { agentView, sidebarView, view } from "./view.ts"

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
        expect(label("Model")).toBeDisabled(),
        expect(text("Choose a model connection first.")).toExist(),
        change(label("Model connection"), models.id)
      ),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      inside(
        role("form", { name: "Add an agent" }),
        expect(text("Loading this connection's models…")).toExist(),
        expect(label("Model")).toBeDisabled()
      ),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(
        role("form", { name: "Add an agent" }),
        expect(text("Loading this connection's models…")).toBeAbsent(),
        expect(label("Model")).not.toBeDisabled(),
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
      Command.resolve(CreateAgent, Message.WroteAction({ written: Written.Create({ name: "Reviewer" }) })),
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
      Command.resolve(CreateAgent, Message.WroteAction({ written: Written.Create({ name: "Builder" }) }))
    )
  })

  it("are refused, with why beside the field, until the draft names the connection and the model of the agent", () => {
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
      expect(text("Choose a model connection.")).toExist(),
      expect(text("This setup can't be saved as it is. Change what's marked, then try again.")).toExist(),
      inside(role("form", { name: "Add an agent" }), change(label("Model connection"), models.id)),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      expect(text("Choose a model connection.")).toBeAbsent(),
      expect(text("This setup can't be saved as it is. Change what's marked, then try again.")).toBeAbsent(),
      inside(role("form", { name: "Add an agent" }), click(role("button", { name: "Add" }))),
      Command.expectNone(),
      expect(text("Choose a model.")).toExist(),
      click(role("button", { name: "Cancel" })),
      expect(role("form", { name: "Add an agent" })).toBeAbsent(),
      expect(role("button", { name: "Add agent" })).toExist()
    )
  })

  it("say why the models of a connection could not be listed, and take the id of a model all the same", () => {
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
      expect(text("Its models couldn't be loaded. You can still enter a model's ID.")).toExist(),
      inside(role("form", { name: "Add an agent" }), type(label("Model"), "any-model")),
      expect(label("Model")).toHaveValue("any-model")
    )
  })

  it("report the agent picked from the list, and ask for the models of its connection once", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectNone()
    )
  })

  it("show an ordinary member each agent with what it runs on, and no way to add one", () => {
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
      // Picking an agent reports it, since a member reads its page too.
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      // Once the person is given the role that manages them, the button to add one appears.
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
      expect(role("button", { name: "Add agent" })).toExist()
    )
  })

  it("say an agent is on its way while its change is, with no status until the server says how ready it is", () => {
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
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered }))
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
  const sidebar = withViewInputs(sidebarView, { isListOpen: true, openAgentId: Option.none() })

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

  it("marks the row of the agent whose page is open current, and the title not", () => {
    scene(
      { update, view: sidebar({ isListOpen: false, openAgentId: Option.some(Identity.AgentId.make("agent-2")) }) },
      given(withSeveral),
      expect(role("button", { name: "Nora" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Scout" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Review helper, Needs setup" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Agents" })).not.toHaveAttr("aria-current")
    )
  })

  it("reports the agent picked, and asks for the models of its connection", () => {
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

describe("an agent's page", () => {
  const workspaceName = workspace.name
  const page = withViewInputs(agentView, { agentId, workspaceName })
  const withModels: Model = modifyFields(opened, {
    offered: () => [OfferedModels.Loaded({ connectionId: models.id, models: offered })]
  })
  const readOnly = modifyFields(withModels, { grants: () => memberGrants })

  it("shows the agent by its name on a lilac mark, with the workspace under it on a phone", () => {
    scene(
      { update, view: page() },
      given(withModels),
      expect(role("heading", { name: "Scout", level: 1 })).toExist(),
      expect(text("S")).toHaveClass("bg-avatar-lilac-bg"),
      expect(text("S")).toHaveClass("size-6"),
      expect(text(workspaceName)).toHaveClass("max-tablet:block"),
      expect(text("Needs setup")).toBeAbsent(),
      expect(role("note")).toBeAbsent()
    )
  })

  it("shows an owner its name and its setup as they are, with nothing yet to save", () => {
    scene(
      { update, view: page() },
      given(withModels),
      expect(label("Agent name")).toHaveValue("Scout"),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      expect(role("heading", { name: "Setup" })).toExist(),
      expect(label("Instructions")).toHaveValue("Review what is asked."),
      expect(label("Harness")).toHaveValue(""),
      expect(label("Model connection")).toHaveValue(models.id),
      expect(label("Model")).toHaveValue("test-model"),
      expect(label("Effort")).toHaveValue(""),
      expect(label("Sandbox")).toHaveValue(""),
      expect(role("button", { name: "Save setup" })).toBeDisabled(),
      expect(role("button", { name: "Discard changes" })).toBeAbsent()
    )
  })

  it("lists its details: how its role is changed, that it is idle, and who made it and when", () => {
    scene(
      { update, view: page() },
      given(withModels),
      expect(role("heading", { name: "Details" })).toExist(),
      expect(text("Role")).toExist(),
      expect(text("Changed in Settings › Members, as any member's is.")).toExist(),
      expect(text("Current activity")).toExist(),
      expect(text("Idle")).toExist(),
      expect(text("Created by")).toExist(),
      expect(text(`Alice · ${calendarDate(scoutAgent.createdAt)}`)).toExist()
    )
  })

  it("says in a note, a line for each reason, why an agent can't run as it is set up", () => {
    const stranded = Schema.decodeSync(ReplicaRecord.Agent)({
      ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
      readiness: {
        _tag: "Incomplete",
        issues: [{ _tag: "Removed", part: "model" }, { _tag: "SandboxRequired" }]
      }
    })
    scene(
      { update, view: page() },
      given(modifyFields(withModels, { agents: () => [{ agent: stranded, pending: false }] })),
      expect(role("note", { name: "This agent can't run as it is set up" })).toExist(),
      expect(text("Its model connection was removed.")).toExist(),
      expect(text("Its harness works only in a sandbox, and it has none.")).toExist(),
      expect(text("Needs setup")).toHaveClass("sr-only")
    )
  })

  it("renames the agent from the name it has, saving on its own, and says why one can't be saved under the name", () => {
    scene(
      { update, view: page() },
      given(withModels),
      type(label("Agent name"), " Scout Prime "),
      expect(role("button", { name: "Save name" })).not.toBeDisabled(),
      expect(role("button", { name: "Save setup" })).toBeDisabled(),
      click(role("button", { name: "Save name" })),
      Command.expectExact(RenameAgent({ ...asMember, agentId, name: "Scout Prime", expectedName: "Scout" })),
      expect(label("Agent name")).toBeDisabled(),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      Command.resolve(
        RenameAgent,
        Message.FailedWriteAction({ written: Written.Rename({ agentId }), reason: Reason.Invalid() })
      ),
      expect(text("Use 1 to 80 characters, with no invisible ones.")).toExist(),
      expect(label("Agent name")).toHaveValue(" Scout Prime "),
      type(label("Agent name"), "Scout Prime"),
      expect(text("Use 1 to 80 characters, with no invisible ones.")).toBeAbsent(),
      click(role("button", { name: "Save name" })),
      Command.expectExact(RenameAgent({ ...asMember, agentId, name: "Scout Prime", expectedName: "Scout" })),
      Command.resolve(RenameAgent, Message.WroteAction({ written: Written.Rename({ agentId }) })),
      expect(role("button", { name: "Save name" })).toBeDisabled()
    )
  })

  it("does not save a name that is blank or the name it has", () => {
    scene(
      { update, view: page() },
      given(withModels),
      type(label("Agent name"), "   "),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      type(label("Agent name"), "Scout"),
      expect(role("button", { name: "Save name" })).toBeDisabled()
    )
  })

  it("sets the agent up again as a whole, the instructions and the sandbox and the effort together", () => {
    scene(
      { update, view: page() },
      given(withModels),
      type(label("Instructions"), "Review it twice."),
      change(label("Sandbox"), sandbox.id),
      change(label("Effort"), "low"),
      expect(role("button", { name: "Save setup" })).not.toBeDisabled(),
      expect(role("button", { name: "Discard changes" })).toExist(),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      click(role("button", { name: "Save setup" })),
      Command.expectExact(
        ConfigureAgent({
          ...asMember,
          agentId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "Review it twice.",
            harness: { _tag: "Auto" },
            model: { connectionId: models.id, id: "test-model", effort: "low" },
            sandbox: { connectionId: sandbox.id }
          })
        })
      ),
      expect(label("Instructions")).toBeDisabled(),
      expect(role("button", { name: "Save setup" })).toBeDisabled(),
      expect(role("button", { name: "Discard changes" })).toBeDisabled(),
      Command.resolve(ConfigureAgent, Message.WroteAction({ written: Written.Configure({ agentId }) })),
      expect(label("Instructions")).not.toBeDisabled()
    )
  })

  it("puts the setup back as it is when the person discards what they changed", () => {
    scene(
      { update, view: page() },
      given(withModels),
      type(label("Instructions"), "Review it twice."),
      change(label("Sandbox"), sandbox.id),
      click(role("button", { name: "Discard changes" })),
      expect(label("Instructions")).toHaveValue("Review what is asked."),
      expect(label("Sandbox")).toHaveValue(""),
      expect(role("button", { name: "Save setup" })).toBeDisabled(),
      expect(role("button", { name: "Discard changes" })).toBeAbsent()
    )
  })

  it("marks a part of the setup that can't be saved beside its field, and sends nothing until it is changed", () => {
    scene(
      { update, view: page() },
      given(
        modifyFields(withModels, {
          connections: () => [harness, sandbox].map((connection) => ({ connection, pending: false }))
        })
      ),
      type(label("Instructions"), "Review it twice."),
      click(role("button", { name: "Save setup" })),
      Command.expectNone(),
      expect(text("This connection is no longer available to you. Choose another.")).toExist(),
      expect(text("This setup can't be saved as it is. Change what's marked, then try again.")).toExist(),
      type(label("Instructions"), "Review it thrice."),
      expect(text("This connection is no longer available to you. Choose another.")).toBeAbsent()
    )
  })

  it("says under the setup why it could not be saved, and keeps what the person changed", () => {
    scene(
      { update, view: page() },
      given(withModels),
      type(label("Instructions"), "Review it twice."),
      click(role("button", { name: "Save setup" })),
      Command.resolve(
        ConfigureAgent,
        Message.FailedWriteAction({ written: Written.Configure({ agentId }), reason: Reason.Unwritable() })
      ),
      expect(text("The setup couldn't be saved. Try again when the host is available.")).toExist(),
      expect(label("Instructions")).toHaveValue("Review it twice."),
      expect(role("button", { name: "Save setup" })).not.toBeDisabled()
    )
  })

  it("shows a person who may not configure the agent its name and setup to read, with nothing to save", () => {
    scene(
      { update, view: page() },
      given(readOnly),
      expect(label("Agent name")).toHaveValue("Scout"),
      expect(label("Agent name")).toBeDisabled(),
      expect(label("Instructions")).toHaveValue("Review what is asked."),
      expect(label("Instructions")).toBeDisabled(),
      expect(label("Model connection")).toBeDisabled(),
      expect(label("Sandbox")).toBeDisabled(),
      expect(role("button", { name: "Save name" })).toBeAbsent(),
      expect(role("button", { name: "Save setup" })).toBeAbsent(),
      expect(role("heading", { name: "Details" })).toExist()
    )
  })

  it("says an agent is on its way, and lets nothing about it be saved yet", () => {
    scene(
      { update, view: page() },
      given(modifyFields(withModels, { agents: () => [{ agent: incompleteAgent, pending: true }] })),
      expect(text("Sending…")).toExist(),
      expect(role("note")).toBeAbsent(),
      expect(label("Agent name")).toBeDisabled(),
      expect(role("button", { name: "Save setup" })).toBeAbsent()
    )
  })

  it("says an agent the workspace does not list isn't there, and offers the list", () => {
    scene(
      { update, view: withViewInputs(agentView, { agentId: Identity.AgentId.make("agent-9"), workspaceName })() },
      given(withModels),
      expect(role("heading", { name: "This agent isn't here", level: 2 })).toExist(),
      expect(text("It may have been removed, or you can no longer see it.")).toExist(),
      click(role("button", { name: "Show all agents" })),
      expectOutMessage(OutMessage.RequestedBrowse())
    )
  })

  it("says nothing of the agent before the agents are read", () => {
    scene(
      { update, view: page() },
      given(init(workspace.id, alice.id).model),
      expect(role("heading", { name: "This agent isn't here" })).toBeAbsent(),
      expect(label("Agent name")).toBeAbsent()
    )
  })

  it("says the agent isn't there once it is removed from the workspace", () => {
    scene(
      { update, view: page(), subscriptions: AgentsBlock.subscriptions },
      given(withModels),
      expect(label("Agent name")).toExist(),
      Subscription.emit(
        subscriptions.agents,
        Message.ReceivedAgents({
          agents: [],
          members: withModels.members,
          connections: withModels.connections,
          roles: withModels.roles,
          workspace: withModels.workspace,
          grants: withModels.grants
        })
      ),
      expect(role("heading", { name: "This agent isn't here", level: 2 })).toExist()
    )
  })
})
